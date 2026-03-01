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

  // ─── Tool: get_campaigns ──────────────────────────────────────────────────

  server.tool(
    "get_campaigns",
    "Hent kampagner for en klient med status, objektiv og budget",
    {
      client_name: z.string().describe("Klientens navn"),
      status: z.enum(["all", "ACTIVE", "PAUSED", "ARCHIVED"]).default("all").describe("Filtrer på status"),
      limit: z.number().min(1).max(50).default(20),
    },
    async ({ client_name, status, limit }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let query = sb
        .from("campaigns")
        .select("id, meta_campaign_id, name, status, objective, buying_type, daily_budget, lifetime_budget, start_time, stop_time")
        .eq("client_id", client.id)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (status !== "all") query = query.eq("status", status);

      const { data, error } = await query;
      if (error) return err(error.message);

      if (!data?.length) return text(`Ingen kampagner fundet for ${client.name}`);

      const lines = [
        `## ${client.name} – Kampagner${status !== "all" ? ` (${status})` : ""}`,
        ``,
        `| Kampagne | Status | Objektiv | Budget |`,
        `|----------|--------|----------|--------|`,
        ...data.map((c: any) => {
          const budget = c.daily_budget ? `${formatCurrency(c.daily_budget)}/dag` : c.lifetime_budget ? `${formatCurrency(c.lifetime_budget)} lifetime` : "–";
          return `| \`${c.name}\` | ${c.status} | ${c.objective || "–"} | ${budget} |`;
        }),
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_ad_sets ────────────────────────────────────────────────────

  server.tool(
    "get_ad_sets",
    "Hent ad sets for en klient, valgfrit filtreret på kampagne",
    {
      client_name: z.string().describe("Klientens navn"),
      campaign_name: z.string().optional().describe("Filtrer på kampagnenavn (delvis match)"),
      status: z.enum(["all", "ACTIVE", "PAUSED"]).default("all"),
      limit: z.number().min(1).max(50).default(20),
    },
    async ({ client_name, campaign_name, status, limit }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      // Hvis campaign_name er angivet, find campaign_id først
      let campaignFilter: string | undefined;
      if (campaign_name) {
        const { data: camps } = await sb
          .from("campaigns")
          .select("id")
          .eq("client_id", client.id)
          .ilike("name", `%${campaign_name}%`)
          .limit(1);
        if (camps?.length) campaignFilter = camps[0].id;
      }

      let query = sb
        .from("ad_sets")
        .select("id, meta_adset_id, name, status, optimization_goal, daily_budget, lifetime_budget, campaign_id")
        .eq("client_id", client.id)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (status !== "all") query = query.eq("status", status);
      if (campaignFilter) query = query.eq("campaign_id", campaignFilter);

      const { data, error } = await query;
      if (error) return err(error.message);

      if (!data?.length) return text(`Ingen ad sets fundet for ${client.name}`);

      const lines = [
        `## ${client.name} – Ad Sets (${data.length} stk)`,
        ``,
        `| Ad Set | Status | Optimering | Budget |`,
        `|--------|--------|------------|--------|`,
        ...data.map((a: any) => {
          const budget = a.daily_budget ? `${formatCurrency(a.daily_budget)}/dag` : a.lifetime_budget ? `${formatCurrency(a.lifetime_budget)} lifetime` : "–";
          return `| \`${a.name}\` | ${a.status} | ${a.optimization_goal || "–"} | ${budget} |`;
        }),
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_creatives ──────────────────────────────────────────────────

  server.tool(
    "get_creatives",
    "Hent creatives for en klient med type, headline, body og CTA",
    {
      client_name: z.string().describe("Klientens navn"),
      type: z.enum(["all", "image", "video"]).default("all").describe("Filtrer på creative-type"),
      limit: z.number().min(1).max(50).default(20),
    },
    async ({ client_name, type, limit }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let query = sb
        .from("creatives")
        .select("id, meta_creative_id, type, headline, body, cta_type, link_url, thumbnail_url")
        .eq("client_id", client.id)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (type !== "all") query = query.eq("type", type);

      const { data, error } = await query;
      if (error) return err(error.message);

      if (!data?.length) return text(`Ingen creatives fundet for ${client.name}`);

      const sections = data.map((c: any, i: number) => [
        `### ${i + 1}. ${c.type.toUpperCase()} (${c.meta_creative_id})`,
        c.headline ? `**Headline:** ${c.headline}` : null,
        c.body ? `**Body:** ${c.body.slice(0, 200)}${c.body.length > 200 ? "…" : ""}` : null,
        c.cta_type ? `**CTA:** ${c.cta_type}` : null,
        c.link_url ? `**URL:** ${c.link_url}` : null,
      ].filter(Boolean).join("\n"));

      return text([`## ${client.name} – Creatives (${data.length} stk)`, ``, ...sections].join("\n\n"));
    }
  );

  // ─── Tool: get_campaign_details ───────────────────────────────────────────

  server.tool(
    "get_campaign_details",
    "Detaljeret kampagnevisning med ad sets og aggregeret performance",
    {
      client_name: z.string().describe("Klientens navn"),
      campaign_name: z.string().describe("Kampagnenavn (delvis match OK)"),
      time_range: z.enum(["last_7d", "last_30d", "last_90d"]).default("last_30d"),
    },
    async ({ client_name, campaign_name, time_range }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { data: camps } = await sb
        .from("campaigns")
        .select("id, name, status, objective, daily_budget, lifetime_budget, meta_campaign_id")
        .eq("client_id", client.id)
        .ilike("name", `%${campaign_name}%`)
        .limit(1);

      if (!camps?.length) return text(`Ingen kampagne fundet: "${campaign_name}"`);
      const camp = camps[0];

      // Hent ad sets
      const { data: adSets } = await sb
        .from("ad_sets")
        .select("id, name, status, optimization_goal, daily_budget")
        .eq("campaign_id", camp.id);

      // Hent aggregeret performance
      const { since, until } = resolveDateRange(time_range);
      const { data: rows } = await sb
        .from("insights")
        .select("spend, impressions, clicks, purchases, purchase_value, reach")
        .eq("client_id", client.id)
        .eq("campaign_id", camp.id)
        .gte("date", since)
        .lte("date", until);

      const agg = (rows || []).reduce((acc: any, r: any) => ({
        spend: acc.spend + (r.spend || 0),
        impressions: acc.impressions + (r.impressions || 0),
        clicks: acc.clicks + (r.clicks || 0),
        purchases: acc.purchases + (r.purchases || 0),
        purchase_value: acc.purchase_value + (r.purchase_value || 0),
        reach: acc.reach + (r.reach || 0),
      }), { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchase_value: 0, reach: 0 });

      const roas = agg.spend > 0 ? (agg.purchase_value / agg.spend).toFixed(2) : "–";

      const lines = [
        `## ${camp.name}`,
        `Status: ${camp.status} | Objektiv: ${camp.objective || "–"}`,
        `Meta ID: ${camp.meta_campaign_id}`,
        ``,
        `### Performance (${time_range})`,
        `| Metric | Værdi |`,
        `|--------|-------|`,
        `| Spend | ${formatCurrency(agg.spend)} |`,
        `| Omsætning | ${formatCurrency(agg.purchase_value)} |`,
        `| ROAS | ${roas}x |`,
        `| Køb | ${agg.purchases} |`,
        `| Klik | ${formatNum(agg.clicks)} |`,
        `| Reach | ${formatNum(agg.reach)} |`,
        ``,
        `### Ad Sets (${(adSets || []).length} stk)`,
        `| Ad Set | Status | Optimering | Budget |`,
        `|--------|--------|------------|--------|`,
        ...(adSets || []).map((a: any) =>
          `| \`${a.name}\` | ${a.status} | ${a.optimization_goal || "–"} | ${a.daily_budget ? formatCurrency(a.daily_budget) + "/dag" : "–"} |`
        ),
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: compare_periods ────────────────────────────────────────────────

  server.tool(
    "compare_periods",
    "Sammenlign performance mellem to perioder (fx denne måned vs forrige)",
    {
      client_name: z.string().describe("Klientens navn"),
      period_a: z.enum(["last_7d", "last_30d", "last_90d", "this_month", "last_month"]).describe("Første periode (nyeste)"),
      period_b: z.enum(["last_7d", "last_30d", "last_90d", "this_month", "last_month"]).describe("Anden periode (sammenligning)"),
    },
    async ({ client_name, period_a, period_b }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      async function getPeriodAgg(range: string) {
        const { since, until } = resolveDateRange(range);
        const { data: rows } = await sb
          .from("insights")
          .select("spend, impressions, clicks, reach, purchases, purchase_value")
          .eq("client_id", client!.id)
          .gte("date", since)
          .lte("date", until);

        const agg = (rows || []).reduce((acc: any, r: any) => ({
          spend: acc.spend + (r.spend || 0),
          impressions: acc.impressions + (r.impressions || 0),
          clicks: acc.clicks + (r.clicks || 0),
          reach: acc.reach + (r.reach || 0),
          purchases: acc.purchases + (r.purchases || 0),
          purchase_value: acc.purchase_value + (r.purchase_value || 0),
        }), { spend: 0, impressions: 0, clicks: 0, reach: 0, purchases: 0, purchase_value: 0 });

        return { ...agg, range, since, until, roas: agg.spend > 0 ? agg.purchase_value / agg.spend : 0, ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0 };
      }

      const a = await getPeriodAgg(period_a);
      const b = await getPeriodAgg(period_b);

      function delta(va: number, vb: number): string {
        if (vb === 0) return va > 0 ? "+∞" : "0%";
        const pct = ((va - vb) / vb * 100).toFixed(1);
        return `${Number(pct) >= 0 ? "+" : ""}${pct}%`;
      }

      const lines = [
        `## ${client.name} – Periodesammenligning`,
        `**A:** ${period_a} (${a.since} → ${a.until})`,
        `**B:** ${period_b} (${b.since} → ${b.until})`,
        ``,
        `| Metric | Periode A | Periode B | Δ |`,
        `|--------|-----------|-----------|---|`,
        `| Spend | ${formatCurrency(a.spend)} | ${formatCurrency(b.spend)} | ${delta(a.spend, b.spend)} |`,
        `| Omsætning | ${formatCurrency(a.purchase_value)} | ${formatCurrency(b.purchase_value)} | ${delta(a.purchase_value, b.purchase_value)} |`,
        `| ROAS | ${a.roas.toFixed(2)}x | ${b.roas.toFixed(2)}x | ${delta(a.roas, b.roas)} |`,
        `| Køb | ${a.purchases} | ${b.purchases} | ${delta(a.purchases, b.purchases)} |`,
        `| Klik | ${formatNum(a.clicks)} | ${formatNum(b.clicks)} | ${delta(a.clicks, b.clicks)} |`,
        `| CTR | ${a.ctr.toFixed(2)}% | ${b.ctr.toFixed(2)}% | ${delta(a.ctr, b.ctr)} |`,
        `| Reach | ${formatNum(a.reach)} | ${formatNum(b.reach)} | ${delta(a.reach, b.reach)} |`,
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_country_breakdown ──────────────────────────────────────────

  server.tool(
    "get_country_breakdown",
    "Land-niveau performance fra demographic_insights (country-rækker) med spend, ROAS, køb",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.enum(["last_7d", "last_30d", "last_90d"]).default("last_30d"),
    },
    async ({ client_name, time_range }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      // Hent country-rækker fra demographic_insights (age_range="all", gender="all")
      const { data: rows, error } = await sb
        .from("demographic_insights")
        .select("country, spend, revenue, purchases, impressions, clicks")
        .eq("client_id", client.id)
        .gte("date", since)
        .lte("date", until)
        .not("country", "is", null);

      if (error) return err(error.message);

      const byCountry: Record<string, any> = {};
      for (const r of rows || []) {
        const key = r.country || "Ukendt";
        if (!byCountry[key]) byCountry[key] = { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
        byCountry[key].spend += r.spend || 0;
        byCountry[key].revenue += r.revenue || 0;
        byCountry[key].purchases += r.purchases || 0;
        byCountry[key].impressions += r.impressions || 0;
        byCountry[key].clicks += r.clicks || 0;
      }

      const sorted = Object.entries(byCountry)
        .map(([country, m]: any) => ({ country, ...m, roas: m.spend > 0 ? m.revenue / m.spend : 0 }))
        .sort((a: any, b: any) => b.spend - a.spend);

      const totalSpend = sorted.reduce((s: number, r: any) => s + r.spend, 0);

      const lines = [
        `## ${client.name} – Land-breakdown (${time_range})`,
        ``,
        `| Land | Spend | % | ROAS | Køb | Klik |`,
        `|------|-------|---|------|-----|------|`,
        ...sorted.map((r: any) =>
          `| ${r.country} | ${formatCurrency(r.spend)} | ${totalSpend > 0 ? (r.spend / totalSpend * 100).toFixed(1) : 0}% | ${r.roas.toFixed(2)}x | ${r.purchases} | ${formatNum(r.clicks)} |`
        ),
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_lead_cohorts ───────────────────────────────────────────────

  server.tool(
    "get_lead_cohorts",
    "Hent lead cohort data: leads, konverteringsrate, revenue per lead, ROAS over tid. Bruger snapshots for hurtig aggregering.",
    {
      client_name: z.string().describe("Klientens navn"),
      cohort_month: z.string().optional().describe("Specifik cohort-måned (fx '2026-02'). Udelad for alle."),
      ad_set_name: z.string().optional().describe("Filtrer på ad set navn (delvis match)"),
    },
    async ({ client_name, cohort_month, ad_set_name }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let query = sb
        .from("lead_cohort_snapshots")
        .select("cohort_month, ad_set_name, months_since_lead, leads_count, converted_count, conversion_rate, total_revenue, revenue_per_lead, avg_days_to_convert, snapshot_date")
        .eq("client_id", client.id)
        .order("cohort_month", { ascending: false })
        .order("months_since_lead", { ascending: true });

      if (cohort_month) query = query.eq("cohort_month", cohort_month);
      if (ad_set_name) query = query.ilike("ad_set_name", `%${ad_set_name}%`);

      // For oversigt: hent kun "samlet" rækker (ad_set_name IS NULL)
      if (!ad_set_name) query = query.is("ad_set_name", null);

      const { data, error } = await query;
      if (error) return err(error.message);

      if (!data?.length) return text(`Ingen lead cohort data for ${client.name}`);

      const lines = [
        `## ${client.name} – Lead Cohorts${cohort_month ? ` (${cohort_month})` : ""}`,
        ``,
        `| Cohort | Mdr | Leads | Konverteret | Conv% | Revenue | Rev/Lead | Gns. dage |`,
        `|--------|-----|-------|-------------|-------|---------|----------|-----------|`,
        ...data.map((r: any) =>
          `| ${r.cohort_month} | ${r.months_since_lead} | ${r.leads_count} | ${r.converted_count} | ${r.conversion_rate?.toFixed(1) || "0"}% | ${formatCurrency(r.total_revenue || 0)} | ${formatCurrency(r.revenue_per_lead || 0)} | ${r.avg_days_to_convert?.toFixed(0) || "–"} |`
        ),
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_leads ──────────────────────────────────────────────────────

  server.tool(
    "get_leads",
    "Hent individuelle leads fra lead_cohort_profiles med konverteringsstatus, revenue og kilde",
    {
      client_name: z.string().describe("Klientens navn"),
      cohort_month: z.string().optional().describe("Filtrer på cohort-måned (fx '2026-02')"),
      converted_only: z.boolean().default(false).describe("Vis kun konverterede leads"),
      limit: z.number().min(1).max(100).default(25),
    },
    async ({ client_name, cohort_month, converted_only, limit }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let query = sb
        .from("lead_cohort_profiles")
        .select("email, lead_ad_name, ad_set_name, campaign_name, lead_date, cohort_month, first_order_date, first_order_value, days_to_convert, total_orders, total_revenue")
        .eq("client_id", client.id)
        .order("lead_date", { ascending: false })
        .limit(limit);

      if (cohort_month) query = query.eq("cohort_month", cohort_month);
      if (converted_only) query = query.not("first_order_date", "is", null);

      const { data, error } = await query;
      if (error) return err(error.message);

      if (!data?.length) return text(`Ingen leads fundet for ${client.name}`);

      const lines = [
        `## ${client.name} – Leads (${data.length} stk)${cohort_month ? ` – ${cohort_month}` : ""}`,
        ``,
        `| Lead dato | Email | Ad Set | Ordrer | Revenue | Dage til konv. |`,
        `|-----------|-------|--------|--------|---------|----------------|`,
        ...data.map((l: any) =>
          `| ${l.lead_date} | ${l.email ? l.email.replace(/@.*/, "@…") : "–"} | \`${l.ad_set_name || "–"}\` | ${l.total_orders || 0} | ${formatCurrency(l.total_revenue || 0)} | ${l.days_to_convert ?? "–"} |`
        ),
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_lead_orders ────────────────────────────────────────────────

  server.tool(
    "get_lead_orders",
    "Hent ordrer fra leads med ordreværdi, dato og dage siden lead",
    {
      client_name: z.string().describe("Klientens navn"),
      days_max: z.number().optional().describe("Max antal dage efter lead (fx 90 for 90D ROAS)"),
      limit: z.number().min(1).max(200).default(50),
    },
    async ({ client_name, days_max, limit }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let query = sb
        .from("lead_cohort_orders")
        .select("klaviyo_profile_id, order_id, order_date, order_value, days_since_lead")
        .eq("client_id", client.id)
        .order("order_date", { ascending: false })
        .limit(limit);

      if (days_max !== undefined) query = query.lte("days_since_lead", days_max);

      const { data, error } = await query;
      if (error) return err(error.message);

      if (!data?.length) return text(`Ingen lead-ordrer fundet for ${client.name}`);

      const totalValue = data.reduce((s: number, o: any) => s + (o.order_value || 0), 0);

      const lines = [
        `## ${client.name} – Lead-ordrer (${data.length} stk)${days_max !== undefined ? ` – inden ${days_max} dage` : ""}`,
        `Total ordreværdi: ${formatCurrency(totalValue)}`,
        ``,
        `| Dato | Ordre ID | Værdi | Dage siden lead |`,
        `|------|----------|-------|-----------------|`,
        ...data.map((o: any) =>
          `| ${o.order_date} | ${o.order_id} | ${formatCurrency(o.order_value)} | ${o.days_since_lead ?? "–"} |`
        ),
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_hourly_data ────────────────────────────────────────────────

  server.tool(
    "get_hourly_data",
    "Hent time-for-time performance (spend, klik, køb) – kun tilgængelig for de seneste 7 dage",
    {
      client_name: z.string().describe("Klientens navn"),
      date: z.string().optional().describe("Specifik dato (YYYY-MM-DD). Udelad for seneste dag."),
    },
    async ({ client_name, date }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const targetDate = date || new Date().toISOString().split("T")[0];

      const { data, error } = await sb
        .from("hourly_insights")
        .select("hour, spend, impressions, clicks, purchases, revenue")
        .eq("client_id", client.id)
        .eq("date", targetDate)
        .order("hour", { ascending: true });

      if (error) return err(error.message);

      if (!data?.length) return text(`Ingen timedata for ${client.name} d. ${targetDate}`);

      const totalSpend = data.reduce((s: number, r: any) => s + (r.spend || 0), 0);
      const totalRevenue = data.reduce((s: number, r: any) => s + (r.revenue || 0), 0);

      const lines = [
        `## ${client.name} – Timedata (${targetDate})`,
        `Samlet: ${formatCurrency(totalSpend)} spend | ${formatCurrency(totalRevenue)} revenue`,
        ``,
        `| Time | Spend | Klik | Køb | Revenue |`,
        `|------|-------|------|-----|---------|`,
        ...data.map((r: any) =>
          `| ${String(r.hour).padStart(2, "0")}:00 | ${formatCurrency(r.spend)} | ${r.clicks} | ${r.purchases} | ${formatCurrency(r.revenue)} |`
        ),
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_targets ────────────────────────────────────────────────────

  server.tool(
    "get_targets",
    "Hent performance-targets for en klient (ROAS, CTR, CPA mål) og sammenlign med aktuel performance",
    {
      client_name: z.string().describe("Klientens navn"),
    },
    async ({ client_name }) => {
      const sb = getSupabase();

      const { data: clients } = await sb
        .from("clients")
        .select("id, name, targets")
        .ilike("name", `%${client_name}%`)
        .limit(1);

      if (!clients?.length) return noClient(client_name);
      const client = clients[0];

      const targets = client.targets || {};
      if (Object.keys(targets).length === 0) {
        return text(`Ingen targets sat for ${client.name}. Sæt dem i dashboard → Settings.`);
      }

      // Hent aktuel performance (last_30d) for sammenligning
      const { since, until } = resolveDateRange("last_30d");
      const { data: rows } = await sb
        .from("insights")
        .select("spend, impressions, clicks, purchases, purchase_value")
        .eq("client_id", client.id)
        .gte("date", since)
        .lte("date", until);

      const agg = (rows || []).reduce((acc: any, r: any) => ({
        spend: acc.spend + (r.spend || 0),
        impressions: acc.impressions + (r.impressions || 0),
        clicks: acc.clicks + (r.clicks || 0),
        purchases: acc.purchases + (r.purchases || 0),
        purchase_value: acc.purchase_value + (r.purchase_value || 0),
      }), { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchase_value: 0 });

      const actual = {
        roas: agg.spend > 0 ? agg.purchase_value / agg.spend : 0,
        ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
        cpa: agg.purchases > 0 ? agg.spend / agg.purchases : 0,
        cpm: agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0,
      };

      const lines = [
        `## ${client.name} – Targets vs. Aktuel (last 30d)`,
        ``,
        `| Metric | Target | Aktuel | Status |`,
        `|--------|--------|--------|--------|`,
      ];

      if (targets.roas) lines.push(`| ROAS | ${targets.roas}x | ${actual.roas.toFixed(2)}x | ${actual.roas >= targets.roas ? "✅" : "⚠️"} |`);
      if (targets.ctr) lines.push(`| CTR | ${targets.ctr}% | ${actual.ctr.toFixed(2)}% | ${actual.ctr >= targets.ctr ? "✅" : "⚠️"} |`);
      if (targets.cpa) lines.push(`| CPA | ${targets.cpa} kr | ${actual.cpa.toFixed(0)} kr | ${actual.cpa <= targets.cpa ? "✅" : "⚠️"} |`);
      if (targets.cpm) lines.push(`| CPM | ${targets.cpm} kr | ${actual.cpm.toFixed(0)} kr | ${actual.cpm <= targets.cpm ? "✅" : "⚠️"} |`);

      // Funnel-targets
      if (targets.funnel) {
        lines.push(``, `### Funnel-targets`);
        for (const [stage, stageTargets] of Object.entries(targets.funnel as Record<string, any>)) {
          const entries = Object.entries(stageTargets).map(([k, v]) => `${k}: ${v}`).join(", ");
          lines.push(`- **${stage}**: ${entries}`);
        }
      }

      return text(lines.join("\n"));
    }
  );

  return server;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findClient(sb: SupabaseClient, name: string): Promise<{ id: string; name: string } | null> {
  const { data } = await sb
    .from("clients")
    .select("id, name")
    .ilike("name", `%${name}%`)
    .limit(1);
  return data?.length ? data[0] : null;
}

function noClient(name: string) {
  return { content: [{ type: "text" as const, text: `Ingen klient fundet: "${name}"` }] };
}

function err(msg: string) {
  return { content: [{ type: "text" as const, text: `Fejl: ${msg}` }] };
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

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
