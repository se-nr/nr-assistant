/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 * GET /.well-known/oauth-protected-resource
 *
 * Tells the MCP client which authorization server protects this resource.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const BASE_URL = "https://nr-agency-mcp.vercel.app";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    resource: `${BASE_URL}/api/mcp`,
    authorization_servers: [BASE_URL],
    bearer_methods_supported: ["header"],
  });
}
