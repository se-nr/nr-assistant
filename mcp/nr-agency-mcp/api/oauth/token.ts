/**
 * OAuth 2.0 Token Endpoint (RFC 6749 §3.2)
 *
 * POST /api/oauth/token
 *
 * Supports two grant types:
 *
 *   1. authorization_code (+ PKCE)
 *      Used by Claude.ai Connectors. Exchanges an auth code for an access token.
 *      code, code_verifier, redirect_uri required. Client auth optional (PKCE is proof).
 *
 *   2. client_credentials
 *      Used by Claude Code / scripts. Exchanges client_id + client_secret for token.
 *      Supports client_secret_basic (Authorization: Basic) and client_secret_post (body).
 *
 * Returns: { access_token, token_type, expires_in }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, createHash, timingSafeEqual } from "crypto";

const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const SIGN_SECRET = process.env.OAUTH_SIGN_SECRET;

const TOKEN_TTL_OAUTH = 2592000; // 30 days (for user OAuth tokens)
const TOKEN_TTL_CLIENT = 3600;   // 1 hour (for client_credentials)

export interface TokenPayload {
  exp: number;
  iss: string;
  email?: string;
  role?: string;
  name?: string;
}

interface TokenUser {
  email: string;
  role: string;
  name: string;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function makeToken(user?: TokenUser): { accessToken: string; expiresIn: number } {
  const ttl = user ? TOKEN_TTL_OAUTH : TOKEN_TTL_CLIENT;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = Buffer.from(
    JSON.stringify({
      exp,
      iss: "nr-agency-mcp",
      ...(user && { email: user.email, role: user.role, name: user.name }),
    })
  ).toString("base64url");
  const sig = createHmac("sha256", SIGN_SECRET!).update(payload).digest("base64url");
  return { accessToken: `${payload}.${sig}`, expiresIn: ttl };
}

export function verifyToken(token: string): TokenPayload | null {
  if (!SIGN_SECRET) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = createHmac("sha256", SIGN_SECRET).update(payload).digest("base64url");
  if (sig !== expected) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp <= Math.floor(Date.now() / 1000)) return null;
    return data as TokenPayload;
  } catch {
    return null;
  }
}

/** Extract client_id and client_secret from Basic header or POST body */
function extractCredentials(req: VercelRequest): { clientId: string; clientSecret: string } | null {
  // 1. client_secret_basic (Authorization: Basic base64(id:secret))
  const authHeader = req.headers["authorization"];
  if (authHeader && typeof authHeader === "string") {
    const match = authHeader.match(/^Basic\s+(.+)$/i);
    if (match) {
      try {
        const decoded = Buffer.from(match[1], "base64").toString("utf-8");
        const colonIdx = decoded.indexOf(":");
        if (colonIdx > 0) {
          return {
            clientId: decodeURIComponent(decoded.slice(0, colonIdx)),
            clientSecret: decodeURIComponent(decoded.slice(colonIdx + 1)),
          };
        }
      } catch {
        // Invalid base64 — fall through
      }
    }
  }

  // 2. client_secret_post (credentials in body)
  const body = req.body;
  if (body?.client_id && body?.client_secret) {
    return { clientId: body.client_id, clientSecret: body.client_secret };
  }

  return null;
}

/** Verify a signed authorization code and return its payload */
function verifyAuthCode(code: string): {
  exp: number;
  cc: string;   // code_challenge
  ccm: string;  // code_challenge_method
  ru: string;   // redirect_uri
  cid: string;  // client_id
  email?: string;  // user email (from OAuth flow)
  role?: string;   // user role (from OAuth flow)
  name?: string;   // user name (from OAuth flow)
} | null {
  if (!SIGN_SECRET) return null;
  const parts = code.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;

  const expected = createHmac("sha256", SIGN_SECRET).update(payload).digest("base64url");
  if (sig !== expected) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp <= Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Verify PKCE: SHA256(code_verifier) must match code_challenge */
function verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method === "S256") {
    const computed = createHash("sha256").update(codeVerifier).digest("base64url");
    return computed === codeChallenge;
  }
  // "plain" method (fallback)
  return codeVerifier === codeChallenge;
}

function issueToken(res: VercelResponse, user?: TokenUser) {
  const { accessToken, expiresIn } = makeToken(user);
  res.status(200).json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: expiresIn,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  if (!CLIENT_ID || !CLIENT_SECRET || !SIGN_SECRET) {
    res.status(500).json({ error: "server_error", error_description: "OAuth not configured" });
    return;
  }

  const body = req.body;
  const grantType = body?.grant_type;

  // ── authorization_code (Claude.ai Connectors) ──────────────────────
  if (grantType === "authorization_code") {
    const code = body?.code;
    const codeVerifier = body?.code_verifier;
    const redirectUri = body?.redirect_uri;

    if (!code) {
      res.status(400).json({ error: "invalid_request", error_description: "Missing code" });
      return;
    }

    // Verify signed code
    const codeData = verifyAuthCode(code);
    if (!codeData) {
      res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired code" });
      return;
    }

    // Verify redirect_uri matches what was used in /authorize
    if (redirectUri && redirectUri !== codeData.ru) {
      res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
      return;
    }

    // Verify PKCE
    if (codeVerifier) {
      if (!verifyPkce(codeVerifier, codeData.cc, codeData.ccm)) {
        res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
        return;
      }
    } else if (codeData.cc) {
      // code_challenge was set but no verifier provided
      res.status(400).json({ error: "invalid_request", error_description: "Missing code_verifier" });
      return;
    }

    // Optionally verify client credentials if provided
    const creds = extractCredentials(req);
    if (creds) {
      if (!safeEqual(creds.clientId, CLIENT_ID) || !safeEqual(creds.clientSecret, CLIENT_SECRET)) {
        res.status(401).json({ error: "invalid_client" });
        return;
      }
    }

    // Extract user info from auth code (if present — new OAuth flow includes it)
    const user = codeData.email
      ? { email: codeData.email, role: codeData.role || "viewer", name: codeData.name || "" }
      : undefined;

    issueToken(res, user);
    return;
  }

  // ── client_credentials (Claude Code / scripts) ─────────────────────
  if (grantType === "client_credentials") {
    const creds = extractCredentials(req);
    if (!creds || !safeEqual(creds.clientId, CLIENT_ID) || !safeEqual(creds.clientSecret, CLIENT_SECRET)) {
      res.status(401).json({ error: "invalid_client" });
      return;
    }

    issueToken(res);
    return;
  }

  res.status(400).json({ error: "unsupported_grant_type" });
}
