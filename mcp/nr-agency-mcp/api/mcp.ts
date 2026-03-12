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
import { verifyToken, type TokenPayload } from "./oauth/token.js";

const API_KEY = process.env.NR_API_KEY;

interface AuthResult {
  authenticated: boolean;
  user?: TokenPayload;
}

function checkAuth(req: VercelRequest, res: VercelResponse): AuthResult {
  // Dev mode: no auth if no keys configured
  if (!API_KEY && !process.env.OAUTH_SIGN_SECRET) return { authenticated: true };

  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") {
    res.setHeader(
      "WWW-Authenticate",
      'Bearer resource_metadata="https://nr-agency-mcp.vercel.app/.well-known/oauth-protected-resource"'
    );
    res.status(401).json({ error: "Missing Authorization header. Use: Bearer <token>" });
    return { authenticated: false };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");

  // Accept static API key (no user context)
  if (API_KEY && token === API_KEY) return { authenticated: true };

  // Accept OAuth access_token (with user context)
  const payload = verifyToken(token);
  if (payload) return { authenticated: true, user: payload };

  res.status(403).json({ error: "Invalid or expired token" });
  return { authenticated: false };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = checkAuth(req, res);
  if (!auth.authenticated) return;

  // Log authenticated user (if OAuth token, not static API key)
  if (auth.user?.email) {
    console.log(`MCP request from ${auth.user.email} (${auth.user.role || "api-key"})`);
  }

  // Health check
  if (req.method === "GET") {
    res.status(200).json({
      name: "nr-agency-mcp",
      version: "2.1.0",
      status: "ok",
      auth: API_KEY ? "enabled" : "disabled",
      toolCount: 67,
      toolCategories: {
        klient: ["get_clients", "get_brand_context", "get_client_documents", "get_agency_knowledge", "get_data_sources", "get_targets"],
        meta: ["get_performance", "get_campaigns", "get_campaign_details", "get_ad_sets", "get_top_ads", "get_creatives", "get_ad_details", "get_ad_image", "get_daily_trend", "get_country_breakdown", "get_demographic_breakdown", "get_age_gender_breakdown", "get_placement_breakdown", "get_hourly_data", "compare_periods"],
        klaviyo_analyse: ["get_klaviyo_stored_campaigns", "get_klaviyo_stored_flows", "get_klaviyo_monthly", "get_klaviyo_campaign_content"],
        klaviyo_realtime: ["get_klaviyo_overview", "get_klaviyo_flows", "get_klaviyo_campaigns", "get_klaviyo_revenue", "get_klaviyo_lists", "get_klaviyo_segments", "get_klaviyo_metrics", "get_klaviyo_health"],
        google: ["get_google_performance", "get_google_campaigns", "get_google_keywords", "get_google_search_terms", "get_google_shopping", "get_google_geo", "get_google_ad_groups", "get_google_assets", "get_google_monthly_comparison"],
        leads: ["get_leads", "get_lead_cohorts", "get_lead_orders", "get_lead_campaign_breakdown", "get_lead_unmatched", "get_shopify_revenue"],
        overblik: ["get_channel_overview", "get_cross_client_overview", "get_cross_channel", "get_monthly_insights"],
        rapporter: ["read_client_report", "write_client_report", "list_client_reports", "generate_ai_review"],
        admin: ["trigger_sync", "trigger_backfill", "trigger_source_sync", "trigger_thumbnail_refresh", "check_data_source_health", "create_client", "connect_google_ads", "save_client_document", "setup_assistant", "update_assistant"],
      },
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
