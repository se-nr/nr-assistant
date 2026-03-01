/**
 * HTTP wrapper for N+R Agency MCP Server (Vercel deploy)
 *
 * Tilføjer API key authentication til alle MCP requests.
 * Bruges når MCP'en deployes til Vercel for remote adgang via claude.ai.
 *
 * Auth: Sæt NR_API_KEY i Vercel env vars.
 * Klienter sender: Authorization: Bearer <api-key>
 *
 * Lokal dev: Brug index.ts direkte (stdio transport, ingen HTTP auth).
 */

import { IncomingMessage, ServerResponse, createServer } from "http";

// Re-export alle MCP tools fra index – serveren registrerer sig selv
// For Vercel: vi wrapper HTTP requests med auth check

const API_KEY = process.env.NR_API_KEY;

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  // Ingen API key konfigureret = skip auth (lokal dev)
  if (!API_KEY) return true;

  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing Authorization header. Use: Bearer <api-key>" }));
    return false;
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== API_KEY) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid API key" }));
    return false;
  }

  return true;
}

// Vercel serverless function export
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!checkAuth(req, res)) return;

  // Health check
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      name: "nr-agency-mcp",
      version: "1.0.0",
      status: "ok",
      auth: API_KEY ? "enabled" : "disabled",
    }));
    return;
  }

  // MCP requests håndteres via SSE/streamable HTTP transport
  // TODO: Implementer SSE transport wrapper når Claude.ai custom connectors
  // understøtter MCP protocol direkte. Indtil da: brug som stdio lokalt.
  res.writeHead(501, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    error: "MCP HTTP transport ikke implementeret endnu. Brug stdio (lokal) eller vent på Claude.ai connector support.",
    hint: "For lokal brug: node dist/index.js (stdio transport)",
  }));
}
