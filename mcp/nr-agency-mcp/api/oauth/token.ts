/**
 * OAuth 2.0 Client Credentials token endpoint.
 *
 * POST /api/oauth/token
 *   grant_type=client_credentials
 *
 * Supports two auth methods:
 *   1. client_secret_basic — Authorization: Basic base64(client_id:client_secret)
 *   2. client_secret_post  — client_id & client_secret in POST body
 *
 * Returns: { access_token, token_type, expires_in }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "crypto";

const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const SIGN_SECRET = process.env.OAUTH_SIGN_SECRET;

const TOKEN_TTL = 3600; // 1 hour

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function makeToken(): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL;
  const payload = Buffer.from(JSON.stringify({ exp, iss: "nr-agency-mcp" })).toString("base64url");
  const sig = createHmac("sha256", SIGN_SECRET!).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): boolean {
  if (!SIGN_SECRET) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  const expected = createHmac("sha256", SIGN_SECRET).update(payload).digest("base64url");
  if (sig !== expected) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** Extract client_id and client_secret from either Basic header or POST body */
function extractCredentials(req: VercelRequest): { clientId: string; clientSecret: string } | null {
  // 1. Try client_secret_basic (Authorization: Basic base64(id:secret))
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

  // 2. Try client_secret_post (credentials in body)
  const body = req.body;
  if (body?.client_id && body?.client_secret) {
    return { clientId: body.client_id, clientSecret: body.client_secret };
  }

  return null;
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

  // Accept both form-encoded and JSON bodies
  const body = req.body;
  const grantType = body?.grant_type;

  if (grantType !== "client_credentials") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  const creds = extractCredentials(req);
  if (!creds || !safeEqual(creds.clientId, CLIENT_ID) || !safeEqual(creds.clientSecret, CLIENT_SECRET)) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  const accessToken = makeToken();

  res.status(200).json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: TOKEN_TTL,
  });
}
