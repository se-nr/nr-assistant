/**
 * N+R Agency MCP Server — shared server definition
 *
 * Alle tools registreres her. Bruges af:
 * - src/index.ts (lokal stdio transport)
 * - api/mcp.ts (Vercel streamable HTTP transport)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

// ─── Server factory ──────────────────────────────────────────────────────────

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "nr-agency",
    version: "1.0.0",
  });

  // ─── Tool: get_clients ──────────────────────────────────────────────────────

  server.tool(
    "get_clients",
    "List alle aktive klienter med id, navn og platform-info",
    {},
    async () => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("clients")
        .select("id, name, slug, meta_ad_account_id, currency, timezone, is_active")
        .eq("is_active", true)
        .order("name");

      if (error) return { content: [{ type: "text" as const, text: `Fejl: ${error.message}` }] };

      const list = (data || [])
        .map((c: any) => [
          `**${c.name}** (slug: ${c.slug}, id: ${c.id})`,
          `  Meta: ${c.meta_ad_account_id || "–"}`,
          `  Valuta: ${c.currency || "DKK"} | TZ: ${c.timezone || "Europe/Copenhagen"}`,
        ].join("\n"))
        .join("\n\n");

      return { content: [{ type: "text" as const, text: list || "Ingen klienter fundet" }] };
    }
  );

  // ─── Tool: get_performance ──────────────────────────────────────────────────

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

      const { data: clients } = await sb
        .from("clients")
        .select("id, name")
        .ilike("name", `%${client_name}%`)
        .limit(1);

      if (!clients?.length) {
        return { content: [{ type: "text" as const, text: `Ingen klient fundet med navn "${client_name}"` }] };
      }
      const client = clients[0];

      const { since, until } = resolveDateRange(time_range);

      let query = sb
        .from("insights")
        .select("date, spend, impressions, clicks, reach, purchases, purchase_value, video_views")
        .eq("client_id", client.id)
        .gte("date", since)
        .lte("date", until);

      const { data: rows, error } = await query;
      if (error) return { content: [{ type: "text" as const, text: `Fejl: ${error.message}` }] };

      const agg = (rows || []).reduce((acc: any, r: any) => ({
        spend: acc.spend + (r.spend || 0),
        impressions: acc.impressions + (r.impressions || 0),
        clicks: acc.clicks + (r.clicks || 0),
        reach: acc.reach + (r.reach || 0),
        purchases: acc.purchases + (r.purchases || 0),
        purchase_value: acc.purchase_value + (r.purchase_value || 0),
        video_views: acc.video_views + (r.video_views || 0),
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

      return { content: [{ type: "text" as const, text: report }] };
    }
  );

  // ─── Tool: get_top_ads ──────────────────────────────────────────────────────

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
        return { content: [{ type: "text" as const, text: `Ingen klient fundet: "${client_name}"` }] };
      }
      const client = clients[0];
      const { since, until } = resolveDateRange(time_range);

      const { data: rows, error } = await sb
        .from("insights")
        .select("ad_id, spend, impressions, clicks, purchases, purchase_value")
        .eq("client_id", client.id)
        .gte("date", since)
        .lte("date", until)
        .not("ad_id", "is", null);

      if (error) return { content: [{ type: "text" as const, text: `Fejl: ${error.message}` }] };

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

      const ads = Object.values(byAd).map((a: any) => ({
        ...a,
        roas: a.spend > 0 ? a.purchase_value / a.spend : 0,
        ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
      }));

      const sorted = ads.sort((a: any, b: any) => b[sort_by] - a[sort_by]).slice(0, limit);

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

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  // ─── Tool: get_client_documents ─────────────────────────────────────────────

  server.tool(
    "get_client_documents",
    "Hent klientdokumenter fra Supabase (strategier, briefs, research, rapporter, overview). Filtrér valgfrit på doc_type.",
    {
      client_name: z.string().describe("Klientens navn (delvis match OK)"),
      doc_type: z.enum(["all", "overview", "research", "strategy", "brief", "creative", "report", "history", "other"])
        .default("all")
        .describe("Filtrér på dokumenttype (all = alle)"),
      limit: z.number().min(1).max(50).default(10).describe("Max antal dokumenter"),
    },
    async ({ client_name, doc_type, limit }) => {
      const sb = getSupabase();

      const { data: clients } = await sb
        .from("clients")
        .select("id, name")
        .ilike("name", `%${client_name}%`)
        .limit(1);

      if (!clients?.length) {
        return { content: [{ type: "text" as const, text: `Ingen klient fundet: "${client_name}"` }] };
      }
      const client = clients[0];

      let query = sb
        .from("client_documents")
        .select("id, doc_type, title, content, created_by, created_at, updated_at")
        .eq("client_id", client.id)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (doc_type !== "all") {
        query = query.eq("doc_type", doc_type);
      }

      const { data: docs, error } = await query;
      if (error) return { content: [{ type: "text" as const, text: `Fejl: ${error.message}` }] };

      if (!docs?.length) {
        return { content: [{ type: "text" as const, text: `Ingen dokumenter fundet for ${client.name}${doc_type !== "all" ? ` (type: ${doc_type})` : ""}` }] };
      }

      const sections = docs.map((d: any) => [
        `### ${d.title}`,
        `*Type: ${d.doc_type} | Af: ${d.created_by || "ukendt"} | Opdateret: ${d.updated_at?.split("T")[0]}*`,
        ``,
        d.content,
      ].join("\n"));

      const output = [
        `## ${client.name} – Dokumenter${doc_type !== "all" ? ` (${doc_type})` : ""}`,
        `${docs.length} dokument${docs.length === 1 ? "" : "er"} fundet\n`,
        ...sections,
      ].join("\n\n---\n\n");

      return { content: [{ type: "text" as const, text: output }] };
    }
  );

  // ─── Tool: save_client_document ───────────────────────────────────────────────

  server.tool(
    "save_client_document",
    "Gem et dokument for en klient i Supabase (strategi, brief, research, rapport, overview). Opdaterer eksisterende hvis samme title+doc_type findes.",
    {
      client_name: z.string().describe("Klientens navn"),
      doc_type: z.enum(["overview", "research", "strategy", "brief", "creative", "report", "history", "other"])
        .describe("Dokumenttype"),
      title: z.string().describe("Dokumenttitel (fx 'Q2 2026 Marketingstrategi')"),
      content: z.string().describe("Dokumentindhold (markdown)"),
      created_by: z.string().optional().describe("Hvem der oprettede dokumentet"),
    },
    async ({ client_name, doc_type, title, content, created_by }) => {
      const sb = getSupabase();

      const { data: clients } = await sb
        .from("clients")
        .select("id, name")
        .ilike("name", `%${client_name}%`)
        .limit(1);

      if (!clients?.length) {
        return { content: [{ type: "text" as const, text: `Ingen klient fundet: "${client_name}"` }] };
      }
      const client = clients[0];

      // Tjek om dokumentet allerede eksisterer (samme client + type + title)
      const { data: existing } = await sb
        .from("client_documents")
        .select("id")
        .eq("client_id", client.id)
        .eq("doc_type", doc_type)
        .eq("title", title)
        .limit(1);

      if (existing?.length) {
        // Opdater eksisterende
        const { error } = await sb
          .from("client_documents")
          .update({ content, updated_at: new Date().toISOString(), created_by: created_by || undefined })
          .eq("id", existing[0].id);

        if (error) return { content: [{ type: "text" as const, text: `Fejl ved opdatering: ${error.message}` }] };
        return { content: [{ type: "text" as const, text: `Opdateret: "${title}" (${doc_type}) for ${client.name}` }] };
      }

      // Opret nyt
      const { error } = await sb
        .from("client_documents")
        .insert({
          client_id: client.id,
          doc_type,
          title,
          content,
          created_by: created_by || null,
        });

      if (error) return { content: [{ type: "text" as const, text: `Fejl ved oprettelse: ${error.message}` }] };
      return { content: [{ type: "text" as const, text: `Gemt: "${title}" (${doc_type}) for ${client.name}` }] };
    }
  );

  // ─── Tool: get_demographic_breakdown ────────────────────────────────────────

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
        return { content: [{ type: "text" as const, text: `Ingen klient: "${client_name}"` }] };
      }
      const client = clients[0];
      const { since, until } = resolveDateRange(time_range);

      // Map breakdown to actual table + column names
      const isPlacement = breakdown === "placement";
      const tableName = isPlacement ? "placement_insights" : "demographic_insights";
      const groupByField = breakdown === "age" ? "age_range" : breakdown;

      const { data: rawRows, error } = await sb
        .from(tableName)
        .select(`${groupByField}, spend, revenue, purchases, impressions, clicks`)
        .eq("client_id", client.id)
        .gte("date", since)
        .lte("date", until);

      if (error) return { content: [{ type: "text" as const, text: `Fejl: ${error.message}` }] };

      const rows = rawRows as any[] || [];

      const byDim: Record<string, any> = {};
      for (const r of rows) {
        const key = (r as any)[groupByField] || "Ukendt";
        if (!byDim[key]) byDim[key] = { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
        byDim[key].spend += r.spend || 0;
        byDim[key].revenue += r.revenue || 0;
        byDim[key].purchases += r.purchases || 0;
        byDim[key].impressions += r.impressions || 0;
        byDim[key].clicks += r.clicks || 0;
      }

      const rows2 = Object.entries(byDim)
        .map(([dim, m]: any) => ({ dim, ...m, roas: m.spend > 0 ? m.revenue / m.spend : 0 }))
        .sort((a: any, b: any) => b.spend - a.spend);

      const label = breakdown === "age" ? "Alder" : breakdown === "gender" ? "Køn" : "Placement";
      const lines = [
        `## ${client.name} – Breakdown: ${label} (${time_range})`,
        ``,
        `| ${label} | Spend | ROAS | Køb |`,
        `|------------|-------|------|-----|`,
        ...rows2.map((r: any) =>
          `| ${r.dim} | ${formatCurrency(r.spend)} | ${r.roas.toFixed(2)}x | ${r.purchases.toFixed(0)} |`
        ),
      ];

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  // ─── Tool: trigger_sync ─────────────────────────────────────────────────────

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
        return { content: [{ type: "text" as const, text: "DASHBOARD_URL env var ikke sat – kan ikke trigge sync" }] };
      }

      const sb = getSupabase();
      const { data: clients } = await sb
        .from("clients")
        .select("id, name")
        .ilike("name", `%${client_name}%`)
        .limit(1);

      if (!clients?.length) {
        return { content: [{ type: "text" as const, text: `Ingen klient: "${client_name}"` }] };
      }

      const client = clients[0];
      const resp = await fetch(`${dashboardUrl}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, type: sync_type }),
      });

      if (!resp.ok) {
        return { content: [{ type: "text" as const, text: `Sync fejlede: ${resp.status} ${resp.statusText}` }] };
      }

      return { content: [{ type: "text" as const, text: `Sync trigget for ${client.name} (${sync_type})` }] };
    }
  );

  return server;
}

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
