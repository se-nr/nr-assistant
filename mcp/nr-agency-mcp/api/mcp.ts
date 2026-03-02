/**
 * Vercel serverless endpoint for N+R Agency MCP
 *
 * Handles MCP protocol over Streamable HTTP transport.
 * Auth: Bearer token (static API key OR OAuth access_token).
 *
 * Claude Desktop / claude.ai / Claude Code connects to:
 *   POST https://nr-agency-mcp.vercel.app/api/mcp
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../src/server.js";
import { verifyToken } from "./oauth/token.js";

const API_KEY = process.env.NR_API_KEY;

function checkAuth(req: VercelRequest, res: VercelResponse): boolean {
  // Dev mode: no auth if no keys configured
  if (!API_KEY && !process.env.OAUTH_SIGN_SECRET) return true;

  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") {
    res.status(401).json({ error: "Missing Authorization header. Use: Bearer <token>" });
    return false;
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");

  // Accept static API key
  if (API_KEY && token === API_KEY) return true;

  // Accept OAuth access_token
  if (verifyToken(token)) return true;

  res.status(403).json({ error: "Invalid or expired token" });
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!checkAuth(req, res)) return;

  // Health check
  if (req.method === "GET") {
    res.status(200).json({
      name: "nr-agency-mcp",
      version: "1.0.0",
      status: "ok",
      auth: API_KEY ? "enabled" : "disabled",
      tools: [
        "get_clients",
        "get_performance",
        "get_top_ads",
        "get_client_documents",
        "save_client_document",
        "get_demographic_breakdown",
        "trigger_sync",
        "get_campaigns",
        "get_ad_sets",
        "get_creatives",
        "get_campaign_details",
        "compare_periods",
        "get_country_breakdown",
        "get_lead_cohorts",
        "get_leads",
        "get_lead_orders",
        "get_hourly_data",
        "get_targets",
      ],
    });
    return;
  }

  // MCP protocol — only POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST for MCP requests, GET for health check." });
    return;
  }

  try {
    const server = createMcpServer();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless — no session persistence
    });

    // Connect server to transport
    await server.connect(transport);

    // Handle the incoming request — pass req.body explicitly
    // because Vercel already parsed the body from the stream
    await transport.handleRequest(req, res, req.body);
  } catch (err: any) {
    console.error("MCP handler error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error", details: err.message });
    }
  }
}
