/**
 * OAuth 2.0 Authorization Endpoint (RFC 6749 §3.1)
 *
 * GET /authorize?response_type=code&client_id=...&redirect_uri=...
 *     &code_challenge=...&code_challenge_method=S256&state=...
 *
 * Issues a signed authorization code and redirects back to the client.
 * The code encodes the PKCE challenge so the token endpoint can verify
 * it statelessly (no database needed).
 *
 * For internal agency use — auto-approves without a consent screen.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";

const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const SIGN_SECRET = process.env.OAUTH_SIGN_SECRET;

const CODE_TTL = 120; // 2 minutes

function makeAuthCode(params: {
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
}): string {
  const exp = Math.floor(Date.now() / 1000) + CODE_TTL;
  const payload = Buffer.from(
    JSON.stringify({
      exp,
      cc: params.codeChallenge,
      ccm: params.codeChallengeMethod,
      ru: params.redirectUri,
      cid: params.clientId,
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

  // Create signed authorization code (encodes PKCE params for stateless verification)
  const code = makeAuthCode({
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    clientId,
  });

  // Redirect back to Claude.ai with the authorization code
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  res.redirect(302, redirectUrl.toString());
}
