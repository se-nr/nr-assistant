/**
 * Vercel serverless endpoint for N+R Agency MCP
 *
 * Handles MCP protocol over Streamable HTTP transport.
 * Auth: Bearer token via NR_API_KEY env var.
 *
 * Claude Desktop/claude.ai connects to:
 *   POST https://your-project.vercel.app/api/mcp
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../src/server.js";

const API_KEY = process.env.NR_API_KEY;

function checkAuth(req: VercelRequest, res: VercelResponse): boolean {
  if (!API_KEY) return true; // No key = skip auth (dev)

  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") {
    res.status(401).json({ error: "Missing Authorization header. Use: Bearer <api-key>" });
    return false;
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== API_KEY) {
    res.status(403).json({ error: "Invalid API key" });
    return false;
  }

  return true;
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
