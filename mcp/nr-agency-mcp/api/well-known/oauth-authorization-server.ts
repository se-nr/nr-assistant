/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * GET /.well-known/oauth-authorization-server
 *
 * Tells the MCP client where to authorize and request tokens.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const BASE_URL = "https://nr-agency-mcp.vercel.app";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/authorize`,
    token_endpoint: `${BASE_URL}/api/oauth/token`,
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    grant_types_supported: ["authorization_code", "client_credentials"],
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
  });
}
