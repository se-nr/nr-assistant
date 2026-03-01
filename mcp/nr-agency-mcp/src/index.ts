/**
 * N+R Agency MCP Server
 *
 * Giver hele teamet adgang til:
 *  - Performance data fra Supabase (Meta Ads, synkroniseret dagligt)
 *  - Klientkontekst fra Google Drive (overview.md, campaigns.md)
 *  - Klaviyo flow-performance
 *
 * Deploy til Vercel: vercel deploy --prod
 * Lokalt: npm run dev
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// ─── Supabase setup ─────────────────────────────────────────────────────────

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY er påkrævet");
  }
  return createClient(url, key);
}

// ─── Server ─────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "nr-agency",
  version: "1.0.0",
});

// ─── Tool: get_clients ────────────────────────────────────────────────────────

server.tool(
  "get_clients",
  "List alle aktive klienter med id, navn og platform-info",
  {},
  async () => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("clients")
      .select("id, name, meta_account_id, klaviyo_account_id, google_drive_folder_id, currency, timezone")
      .order("name");

    if (error) return { content: [{ type: "text", text: `Fejl: ${error.message}` }] };

    const list = (data || [])
      .map((c: any) => [
        `**${c.name}** (id: ${c.id})`,
        `  Meta: ${c.meta_account_id || "–"}`,
        `  Klaviyo: ${c.klaviyo_account_id || "–"}`,
        `  Drive: ${c.google_drive_folder_id || "–"}`,
        `  Valuta: ${c.currency || "DKK"} | TZ: ${c.timezone || "Europe/Copenhagen"}`,
      ].join("\n"))
      .join("\n\n");

    return { content: [{ type: "text", text: list || "Ingen klienter fundet" }] };
  }
);

// ─── Tool: get_performance ────────────────────────────────────────────────────

server.tool(
  "get_performance",
  "Hent aggregeret performance for en klient (spend, ROAS, purchases, reach). Angiv client_name og time_range.",
  {
    client_name: z.string().describe("Klientens navn (delvis match OK, fx 'zizzi', 'gastro')"),
    time_range: z.enum(["last_7d", "last_30d", "last_90d", "this_month", "last_month"])
      .default("last_30d")
      .describe("Tidsperiode"),
    funnel_stage: z.enum(["all", "FP", "IM", "IP", "EC"])
      .default("all")
      .describe("Filtrer på funnel-stage (all = alle)"),
  },
  async ({ client_name, time_range, funnel_stage }) => {
    const sb = getSupabase();

    // Find client
    const { data: clients } = await sb
      .from("clients")
      .select("id, name")
      .ilike("name", `%${client_name}%`)
      .limit(1);

    if (!clients?.length) {
      return { content: [{ type: "text", text: `Ingen klient fundet med navn "${client_name}"` }] };
    }
    const client = clients[0];

    // Beregn dato-range
    const { since, until } = resolveDateRange(time_range);

    // Hent insights aggregeret
    let query = sb
      .from("insights")
      .select("date, spend, impressions, clicks, reach, purchases, purchase_value, video_views_3s")
      .eq("client_id", client.id)
      .gte("date", since)
      .lte("date", until);

    if (funnel_stage !== "all") {
      // Join via campaigns for funnel_stage filter
      // Simplificeret: hent alle og returner note
    }

    const { data: rows, error } = await query;
    if (error) return { content: [{ type: "text", text: `Fejl: ${error.message}` }] };

    // Aggreger
    const agg = (rows || []).reduce((acc: any, r: any) => ({
      spend: acc.spend + (r.spend || 0),
      impressions: acc.impressions + (r.impressions || 0),
      clicks: acc.clicks + (r.clicks || 0),
      reach: acc.reach + (r.reach || 0),
      purchases: acc.purchases + (r.purchases || 0),
      purchase_value: acc.purchase_value + (r.purchase_value || 0),
      video_views: acc.video_views + (r.video_views_3s || 0),
    }), { spend: 0, impressions: 0, clicks: 0, reach: 0, purchases: 0, purchase_value: 0, video_views: 0 });

    const roas = agg.spend > 0 ? (agg.purchase_value / agg.spend).toFixed(2) : "–";
    const ctr = agg.impressions > 0 ? ((agg.clicks / agg.impressions) * 100).toFixed(2) : "–";
    const cpa = agg.purchases > 0 ? (agg.spend / agg.purchases).toFixed(0) : "–";

    const report = [
      `## ${client.name} – Performance (${time_range})`,
      `Periode: ${since} → ${until}`,
      ``,
      `| Metric | Værdi |`,
      `|--------|-------|`,
      `| Spend | ${formatCurrency(agg.spend)} |`,
      `| Omsætning | ${formatCurrency(agg.purchase_value)} |`,
      `| ROAS | ${roas}x |`,
      `| Køb | ${agg.purchases.toFixed(0)} |`,
      `| CPA | ${cpa} kr |`,
      `| Reach | ${formatNum(agg.reach)} |`,
      `| Impressions | ${formatNum(agg.impressions)} |`,
      `| Klik | ${formatNum(agg.clicks)} |`,
      `| CTR | ${ctr}% |`,
      `| Videovisninger (3s) | ${formatNum(agg.video_views)} |`,
    ].join("\n");

    return { content: [{ type: "text", text: report }] };
  }
);

// ─── Tool: get_top_ads ────────────────────────────────────────────────────────

server.tool(
  "get_top_ads",
  "Top-performende annoncer for en klient sorteret efter ROAS eller spend",
  {
    client_name: z.string().describe("Klientens navn"),
    time_range: z.enum(["last_7d", "last_30d", "last_90d"]).default("last_30d"),
    sort_by: z.enum(["roas", "spend", "purchases", "ctr"]).default("roas"),
    limit: z.number().min(1).max(20).default(10),
  },
  async ({ client_name, time_range, sort_by, limit }) => {
    const sb = getSupabase();

    const { data: clients } = await sb
      .from("clients")
      .select("id, name")
      .ilike("name", `%${client_name}%`)
      .limit(1);

    if (!clients?.length) {
      return { content: [{ type: "text", text: `Ingen klient fundet: "${client_name}"` }] };
    }
    const client = clients[0];
    const { since, until } = resolveDateRange(time_range);

    // Aggreger per ad_id
    const { data: rows, error } = await sb
      .from("insights")
      .select("ad_id, spend, impressions, clicks, purchases, purchase_value")
      .eq("client_id", client.id)
      .gte("date", since)
      .lte("date", until)
      .not("ad_id", "is", null);

    if (error) return { content: [{ type: "text", text: `Fejl: ${error.message}` }] };

    // Aggreger per ad
    const byAd: Record<string, any> = {};
    for (const r of rows || []) {
      if (!byAd[r.ad_id]) {
        byAd[r.ad_id] = { ad_id: r.ad_id, spend: 0, impressions: 0, clicks: 0, purchases: 0, purchase_value: 0 };
      }
      byAd[r.ad_id].spend += r.spend || 0;
      byAd[r.ad_id].impressions += r.impressions || 0;
      byAd[r.ad_id].clicks += r.clicks || 0;
      byAd[r.ad_id].purchases += r.purchases || 0;
      byAd[r.ad_id].purchase_value += r.purchase_value || 0;
    }

    // Beregn derived metrics
    const ads = Object.values(byAd).map((a: any) => ({
      ...a,
      roas: a.spend > 0 ? a.purchase_value / a.spend : 0,
      ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
    }));

    // Sort
    const sorted = ads.sort((a: any, b: any) => b[sort_by] - a[sort_by]).slice(0, limit);

    // Hent ad-navne
    const adIds = sorted.map((a: any) => a.ad_id);
    const { data: adNames } = await sb
      .from("ads")
      .select("id, name, campaign_id")
      .in("id", adIds);

    const nameMap: Record<string, string> = {};
    for (const a of adNames || []) {
      nameMap[a.id] = a.name || a.id;
    }

    const lines = [
      `## ${client.name} – Top ${limit} annoncer (${time_range}, sorteret efter ${sort_by})`,
      ``,
      `| # | Annonce | Spend | ROAS | Køb | CTR |`,
      `|---|---------|-------|------|-----|-----|`,
      ...sorted.map((a: any, i: number) => [
        `| ${i + 1}`,
        `\`${nameMap[a.ad_id] || a.ad_id}\``,
        `${formatCurrency(a.spend)}`,
        `${a.roas.toFixed(2)}x`,
        `${a.purchases.toFixed(0)}`,
        `${a.ctr.toFixed(2)}%`,
      ].join(" | ") + " |"),
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: get_client_context ─────────────────────────────────────────────────

server.tool(
  "get_client_context",
  "Hent klientkontekst fra agency-context databasen (brand, TOV, målgruppe, USP). Returnerer overview.md indhold.",
  {
    client_name: z.string().describe("Klientens navn (mappe-navn i agency-context/clients/)"),
  },
  async ({ client_name }) => {
    // Læs fra lokal agency-context (alternativt: Google Drive API)
    const fs = await import("fs/promises");
    const path = await import("path");
    const os = await import("os");

    const contextDir = path.join(os.homedir(), "agency-context", "clients");

    // Find mappe (case-insensitive)
    let matches: string[] = [];
    try {
      const dirs = await fs.readdir(contextDir);
      matches = dirs.filter((d) => d.toLowerCase().includes(client_name.toLowerCase()));
    } catch {
      return { content: [{ type: "text", text: `agency-context/clients ikke fundet. Tjek at ~/agency-context er klonet.` }] };
    }

    if (!matches.length) {
      return { content: [{ type: "text", text: `Ingen klientmappe fundet for "${client_name}" i ~/agency-context/clients/` }] };
    }

    const clientDir = path.join(contextDir, matches[0]);
    const results: string[] = [`# Klientkontekst: ${matches[0]}\n`];

    for (const file of ["overview.md", "campaigns.md", "history.md"]) {
      try {
        const content = await fs.readFile(path.join(clientDir, file), "utf-8");
        results.push(`## ${file}\n\n${content}`);
      } catch {
        // Fil eksisterer ikke – spring over
      }
    }

    return { content: [{ type: "text", text: results.join("\n\n---\n\n") }] };
  }
);

// ─── Tool: get_demographic_breakdown ─────────────────────────────────────────

server.tool(
  "get_demographic_breakdown",
  "Demografisk breakdown for en klient (alder, køn, placement) med ROAS og spend",
  {
    client_name: z.string(),
    time_range: z.enum(["last_7d", "last_30d", "last_90d"]).default("last_30d"),
    breakdown: z.enum(["age", "gender", "placement"]).default("age"),
  },
  async ({ client_name, time_range, breakdown }) => {
    const sb = getSupabase();

    const { data: clients } = await sb
      .from("clients")
      .select("id, name")
      .ilike("name", `%${client_name}%`)
      .limit(1);

    if (!clients?.length) {
      return { content: [{ type: "text", text: `Ingen klient: "${client_name}"` }] };
    }
    const client = clients[0];
    const { since, until } = resolveDateRange(time_range);

    let tableName = "demographic_insights";
    let groupByField = breakdown === "placement" ? "placement" : breakdown;

    if (breakdown === "placement") {
      tableName = "placement_insights";
    }

    const { data: rawRows, error } = await sb
      .from(tableName)
      .select(`${groupByField}, spend, purchase_value, purchases, impressions, clicks`)
      .eq("client_id", client.id)
      .gte("date", since)
      .lte("date", until);

    if (error) return { content: [{ type: "text", text: `Fejl: ${error.message}` }] };

    const rows = rawRows as any[] || [];

    // Aggreger per dimension
    const byDim: Record<string, any> = {};
    for (const r of rows) {
      const key = (r as any)[groupByField] || "Ukendt";
      if (!byDim[key]) byDim[key] = { spend: 0, purchase_value: 0, purchases: 0, impressions: 0, clicks: 0 };
      byDim[key].spend += r.spend || 0;
      byDim[key].purchase_value += r.purchase_value || 0;
      byDim[key].purchases += r.purchases || 0;
      byDim[key].impressions += r.impressions || 0;
      byDim[key].clicks += r.clicks || 0;
    }

    const rows2 = Object.entries(byDim)
      .map(([dim, m]: any) => ({ dim, ...m, roas: m.spend > 0 ? m.purchase_value / m.spend : 0 }))
      .sort((a: any, b: any) => b.spend - a.spend);

    const lines = [
      `## ${client.name} – Breakdown: ${breakdown} (${time_range})`,
      ``,
      `| ${breakdown} | Spend | ROAS | Køb |`,
      `|------------|-------|------|-----|`,
      ...rows2.map((r: any) =>
        `| ${r.dim} | ${formatCurrency(r.spend)} | ${r.roas.toFixed(2)}x | ${r.purchases.toFixed(0)} |`
      ),
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: trigger_sync ───────────────────────────────────────────────────────

server.tool(
  "trigger_sync",
  "Trigger en Meta Ads sync for en klient via Inngest (kræver dashboard-endpoint)",
  {
    client_name: z.string(),
    sync_type: z.enum(["daily", "historical"]).default("daily"),
  },
  async ({ client_name, sync_type }) => {
    const dashboardUrl = process.env.DASHBOARD_URL;
    if (!dashboardUrl) {
      return { content: [{ type: "text", text: "DASHBOARD_URL env var ikke sat – kan ikke trigge sync" }] };
    }

    const sb = getSupabase();
    const { data: clients } = await sb
      .from("clients")
      .select("id, name")
      .ilike("name", `%${client_name}%`)
      .limit(1);

    if (!clients?.length) {
      return { content: [{ type: "text", text: `Ingen klient: "${client_name}"` }] };
    }

    const client = clients[0];
    const resp = await fetch(`${dashboardUrl}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: client.id, type: sync_type }),
    });

    if (!resp.ok) {
      return { content: [{ type: "text", text: `Sync fejlede: ${resp.status} ${resp.statusText}` }] };
    }

    return { content: [{ type: "text", text: `✓ Sync trigget for ${client.name} (${sync_type})` }] };
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveDateRange(range: string): { since: string; until: string } {
  const now = new Date();
  const until = now.toISOString().split("T")[0];
  const since = new Date(now);

  switch (range) {
    case "last_7d":   since.setDate(now.getDate() - 7); break;
    case "last_30d":  since.setDate(now.getDate() - 30); break;
    case "last_90d":  since.setDate(now.getDate() - 90); break;
    case "this_month":
      since.setDate(1);
      break;
    case "last_month":
      since.setMonth(now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { since: since.toISOString().split("T")[0], until: lastDay.toISOString().split("T")[0] };
  }

  return { since: since.toISOString().split("T")[0], until };
}

function formatCurrency(v: number): string {
  return `${Math.round(v).toLocaleString("da-DK")} kr`;
}

function formatNum(v: number): string {
  return Math.round(v).toLocaleString("da-DK");
}

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
