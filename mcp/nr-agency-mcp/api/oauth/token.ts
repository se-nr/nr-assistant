/**
 * OAuth 2.0 Client Credentials token endpoint.
 *
 * POST /api/oauth/token
 *   grant_type=client_credentials
 *   client_id=...
 *   client_secret=...
 *
 * Returns: { access_token, token_type, expires_in }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";

const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const SIGN_SECRET = process.env.OAUTH_SIGN_SECRET;

const TOKEN_TTL = 3600; // 1 hour

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
  const clientId = body?.client_id;
  const clientSecret = body?.client_secret;

  if (grantType !== "client_credentials") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  if (clientId !== CLIENT_ID || clientSecret !== CLIENT_SECRET) {
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
