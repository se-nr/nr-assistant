/**
 * OAuth 2.0 Authorization Endpoint (RFC 6749 §3.1)
 *
 * GET /authorize?response_type=code&client_id=...&redirect_uri=...
 *     &code_challenge=...&code_challenge_method=S256&state=...
 *
 * Redirects to Supabase Google OAuth with PKCE.
 * After successful Google login, the user is redirected through
 * /api/auth/callback → /api/auth/complete, which issues the MCP auth code.
 *
 * State (MCP OAuth params + Supabase PKCE verifier) is stored in a
 * secure HTTP-only cookie to avoid query-param issues with Supabase
 * redirect URL matching.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, randomBytes, createHash } from "crypto";

const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const SIGN_SECRET = process.env.OAUTH_SIGN_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const BASE_URL = "https://nr-agency-mcp.vercel.app";

const PENDING_TTL = 600; // 10 minutes — time to complete Google login

/**
 * Create a signed "pending" blob that preserves the MCP client's OAuth params
 * through the Supabase/Google redirect chain.
 */
function makePendingBlob(params: {
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
  state: string;
}): string {
  const exp = Math.floor(Date.now() / 1000) + PENDING_TTL;
  const payload = Buffer.from(
    JSON.stringify({
      exp,
      cc: params.codeChallenge,
      ccm: params.codeChallengeMethod,
      ru: params.redirectUri,
      cid: params.clientId,
      st: params.state,
    })
  ).toString("base64url");
  const sig = createHmac("sha256", SIGN_SECRET!).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!CLIENT_ID || !SIGN_SECRET) {
    res.status(500).json({ error: "server_error", error_description: "OAuth not configured" });
    return;
  }

  if (!SUPABASE_URL) {
    res.status(500).json({ error: "server_error", error_description: "SUPABASE_URL not configured" });
    return;
  }

  const q = req.query;
  const responseType = String(q.response_type || "");
  const clientId = String(q.client_id || "");
  const redirectUri = String(q.redirect_uri || "");
  const codeChallenge = String(q.code_challenge || "");
  const codeChallengeMethod = String(q.code_challenge_method || "S256");
  const state = String(q.state || "");

  if (responseType !== "code") {
    res.status(400).json({ error: "unsupported_response_type" });
    return;
  }

  if (clientId !== CLIENT_ID) {
    res.status(400).json({ error: "invalid_client", error_description: "Unknown client_id" });
    return;
  }

  if (!redirectUri) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing redirect_uri" });
    return;
  }

  if (!codeChallenge) {
    res.status(400).json({ error: "invalid_request", error_description: "PKCE required: missing code_challenge" });
    return;
  }

  // Create signed pending blob with all MCP OAuth params
  const pendingBlob = makePendingBlob({
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    clientId,
    state,
  });

  // Generate Supabase PKCE pair (separate from MCP's PKCE)
  const sbCodeVerifier = randomBytes(32).toString("base64url");
  const sbCodeChallenge = createHash("sha256")
    .update(sbCodeVerifier)
    .digest("base64url");

  // Store pending state + Supabase code verifier in cookie
  // (avoids query-param issues with Supabase redirect URL matching)
  const cookieValue = encodeURIComponent(
    JSON.stringify({ pending: pendingBlob, cv: sbCodeVerifier })
  );
  res.setHeader(
    "Set-Cookie",
    `mcp_auth_state=${cookieValue}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=${PENDING_TTL}`
  );

  // Build Supabase Google OAuth URL with PKCE
  const callbackUrl = `${BASE_URL}/api/auth/callback`;

  const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authUrl.searchParams.set("provider", "google");
  authUrl.searchParams.set("redirect_to", callbackUrl);
  authUrl.searchParams.set("code_challenge", sbCodeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // Redirect to Google login via Supabase
  res.redirect(302, authUrl.toString());
}
