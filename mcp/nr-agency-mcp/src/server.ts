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
import { dashboardFetch } from "./dashboard-client.js";
import type {
  InsightsResponse,
  TopAdsResponse,
  DemographicsResponse,
  TargetsResponse,
  LeadCohortsResponse,
} from "./types/dashboard-api.js";
import { resolveKlaviyoApiKey } from "./klaviyo-credentials.js";
import {
  getEmailMetrics,
  getSubscriberStats,
  getFlowsWithPerformance,
  getCampaignsWithPerformance,
  getRevenueAttribution,
  listLists,
  listSegments,
  listMetrics,
  validateApiKey,
} from "./klaviyo-client.js";

// ─── Supabase setup ─────────────────────────────────────────────────────────

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY er påkrævet");
  }
  return createClient(url, key);
}

// ─── Shared schemas ─────────────────────────────────────────────────────────

const TIME_RANGE_DESC = "Tidsperiode. Presets: last_7d, last_30d, last_90d, this_month, last_month. Custom: '2026-01' (hel måned), '2026-01-01:2026-01-31' (interval), '2026-01-15' (enkelt dag)";

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
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      funnel_stage: z.enum(["all", "FP", "IM", "IP", "EC"])
        .default("all")
        .describe("Filtrer på funnel-stage (all = alle)"),
    },
    async ({ client_name, time_range, funnel_stage }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      try {
        const data = await dashboardFetch<InsightsResponse>("/api/dashboard/insights", {
          clientId: client.id,
          from: since,
          to: until,
          comparison: "none",
        });

        const s = data.summary;
        if (!s) return text(`Ingen data for ${client.name} i perioden ${since} → ${until}`);

        const channelLines = (data.channelBreakdown || []).map((ch: any) =>
          `| ${ch.channel} | ${formatCurrency(ch.spend)} | ${ch.roas?.toFixed(2) || "–"}x | ${ch.purchases || 0} |`
        );

        const report = [
          `## ${client.name} – Performance (${time_range})`,
          `Periode: ${since} → ${until}`,
          ``,
          `| Metric | Værdi |`,
          `|--------|-------|`,
          `| Spend | ${formatCurrency(s.spend)} |`,
          `| Omsætning | ${formatCurrency(s.purchase_value)} |`,
          `| ROAS | ${s.roas?.toFixed(2) || "–"}x |`,
          `| Køb | ${Math.round(s.purchases)} |`,
          `| CPA | ${s.cpa ? Math.round(s.cpa) + " kr" : "–"} |`,
          `| Reach | ${formatNum(s.reach)} |`,
          `| Impressions | ${formatNum(s.impressions)} |`,
          `| Klik | ${formatNum(s.clicks)} |`,
          `| CTR | ${s.ctr?.toFixed(2) || "–"}% |`,
          `| CPM | ${s.cpm ? Math.round(s.cpm) + " kr" : "–"} |`,
          `| Videovisninger (3s) | ${formatNum(s.video_views)} |`,
          ...(channelLines.length > 1 ? [
            ``,
            `### Kanalopdeling`,
            `| Kanal | Spend | ROAS | Køb |`,
            `|-------|-------|------|-----|`,
            ...channelLines,
          ] : []),
        ].join("\n");

        return text(report);
      } catch (e: any) {
        return err(`Dashboard API: ${e.message}`);
      }
    }
  );

  // ─── Tool: get_top_ads ──────────────────────────────────────────────────────

  server.tool(
    "get_top_ads",
    "Top-performende annoncer for en klient sorteret efter ROAS eller spend",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      sort_by: z.enum(["roas", "spend", "purchases", "ctr"]).default("roas"),
      limit: z.number().min(1).max(20).default(10),
    },
    async ({ client_name, time_range, sort_by, limit }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      try {
        const data = await dashboardFetch<TopAdsResponse>("/api/internal/top-ads", {
          clientId: client.id,
          from: since,
          to: until,
          sort_by,
          limit,
        });

        const ads = data.ads || [];
        if (!ads.length) return text(`Ingen annoncer med data for ${client.name} i perioden`);

        const lines = [
          `## ${client.name} – Top ${limit} annoncer (${time_range}, sorteret efter ${sort_by})`,
          ``,
          `| # | Annonce | Spend | ROAS | Køb | CTR |`,
          `|---|---------|-------|------|-----|-----|`,
          ...ads.map((a, i) => [
            `| ${i + 1}`,
            `\`${a.name}\``,
            `${formatCurrency(a.spend)}`,
            `${a.roas.toFixed(2)}x`,
            `${Math.round(a.purchases)}`,
            `${a.ctr.toFixed(2)}%`,
          ].join(" | ") + " |"),
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Dashboard API: ${e.message}`);
      }
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
    "Demografisk breakdown for en klient (alder, køn, platform, placement, device) med ROAS og spend",
    {
      client_name: z.string(),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      breakdown: z.enum(["age", "gender", "platform", "placement", "device"]).default("age"),
    },
    async ({ client_name, time_range, breakdown }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      try {
        const data = await dashboardFetch<DemographicsResponse>("/api/internal/demographics", {
          clientId: client.id,
          from: since,
          to: until,
          breakdown,
        });

        const rows = data.data || [];
        if (!rows.length) return text(`Ingen ${breakdown}-data for ${client.name} i perioden`);

        const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
        const label: Record<string, string> = { age: "Alder", gender: "Køn", platform: "Platform", placement: "Placement", device: "Device" };

        const lines = [
          `## ${client.name} – Breakdown: ${label[breakdown] || breakdown} (${time_range})`,
          ``,
          `| ${label[breakdown] || breakdown} | Spend | % | ROAS | CTR | Køb |`,
          `|------------|-------|---|------|-----|-----|`,
          ...rows.map((r) =>
            `| ${r.dimension} | ${formatCurrency(r.spend)} | ${totalSpend > 0 ? (r.spend / totalSpend * 100).toFixed(1) : "0"}% | ${r.roas.toFixed(2)}x | ${r.ctr.toFixed(2)}% | ${Math.round(r.purchases)} |`
          ),
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Dashboard API: ${e.message}`);
      }
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
    "Hent kampagner for en klient med status, objektiv og budget. Brug source til at filtrere på Meta eller Google Ads.",
    {
      client_name: z.string().describe("Klientens navn"),
      status: z.enum(["all", "ACTIVE", "PAUSED", "ARCHIVED"]).default("all").describe("Filtrer på status"),
      source: z.enum(["all", "meta", "google_ads"]).default("all").describe("Filtrer på kilde: meta, google_ads, eller all"),
      limit: z.number().min(1).max(50).default(20),
    },
    async ({ client_name, status, source, limit }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let query = sb
        .from("campaigns")
        .select("id, meta_campaign_id, platform_campaign_id, name, status, objective, buying_type, daily_budget, lifetime_budget, start_time, stop_time, source")
        .eq("client_id", client.id)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (status !== "all") query = query.eq("status", status);
      if (source !== "all") query = query.eq("source", source);

      const { data, error } = await query;
      if (error) return err(error.message);

      if (!data?.length) return text(`Ingen kampagner fundet for ${client.name}${source !== "all" ? ` (source: ${source})` : ""}`);

      const lines = [
        `## ${client.name} – Kampagner${status !== "all" ? ` (${status})` : ""}${source !== "all" ? ` [${source}]` : ""}`,
        ``,
        `| Kampagne | Kilde | Status | Objektiv | Budget |`,
        `|----------|-------|--------|----------|--------|`,
        ...data.map((c: any) => {
          const budget = c.daily_budget ? `${formatCurrency(c.daily_budget)}/dag` : c.lifetime_budget ? `${formatCurrency(c.lifetime_budget)} lifetime` : "–";
          const src = c.source === "google_ads" ? "Google" : "Meta";
          return `| \`${c.name}\` | ${src} | ${c.status} | ${c.objective || "–"} | ${budget} |`;
        }),
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_ad_sets ────────────────────────────────────────────────────

  server.tool(
    "get_ad_sets",
    "Hent ad sets for en klient, valgfrit filtreret på kampagne. Brug source til at filtrere på Meta eller Google Ads.",
    {
      client_name: z.string().describe("Klientens navn"),
      campaign_name: z.string().optional().describe("Filtrer på kampagnenavn (delvis match)"),
      status: z.enum(["all", "ACTIVE", "PAUSED"]).default("all"),
      source: z.enum(["all", "meta", "google_ads"]).default("all").describe("Filtrer på kilde: meta, google_ads, eller all"),
      limit: z.number().min(1).max(50).default(20),
    },
    async ({ client_name, campaign_name, status, source, limit }) => {
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
        .select("id, meta_adset_id, platform_adset_id, name, status, optimization_goal, daily_budget, lifetime_budget, campaign_id, source")
        .eq("client_id", client.id)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (status !== "all") query = query.eq("status", status);
      if (source !== "all") query = query.eq("source", source);
      if (campaignFilter) query = query.eq("campaign_id", campaignFilter);

      const { data, error } = await query;
      if (error) return err(error.message);

      if (!data?.length) return text(`Ingen ad sets fundet for ${client.name}${source !== "all" ? ` (source: ${source})` : ""}`);

      const lines = [
        `## ${client.name} – Ad Sets (${data.length} stk)${source !== "all" ? ` [${source}]` : ""}`,
        ``,
        `| Ad Set | Kilde | Status | Optimering | Budget |`,
        `|--------|-------|--------|------------|--------|`,
        ...data.map((a: any) => {
          const budget = a.daily_budget ? `${formatCurrency(a.daily_budget)}/dag` : a.lifetime_budget ? `${formatCurrency(a.lifetime_budget)} lifetime` : "–";
          const src = a.source === "google_ads" ? "Google" : "Meta";
          return `| \`${a.name}\` | ${src} | ${a.status} | ${a.optimization_goal || "–"} | ${budget} |`;
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
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
    },
    async ({ client_name, campaign_name, time_range }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      // Metadata from Supabase (campaign info + ad sets)
      const { data: camps } = await sb
        .from("campaigns")
        .select("id, name, status, objective, daily_budget, lifetime_budget, meta_campaign_id")
        .eq("client_id", client.id)
        .ilike("name", `%${campaign_name}%`)
        .limit(1);

      if (!camps?.length) return text(`Ingen kampagne fundet: "${campaign_name}"`);
      const camp = camps[0];

      const { since, until } = resolveDateRange(time_range);

      // Parallel: ad sets from Supabase + metrics from dashboard API
      try {
        const [adSetsResult, metricsData] = await Promise.all([
          sb.from("ad_sets")
            .select("id, name, status, optimization_goal, daily_budget")
            .eq("campaign_id", camp.id),
          dashboardFetch<InsightsResponse>("/api/dashboard/insights", {
            clientId: client.id,
            from: since,
            to: until,
            campaignId: camp.id,
            comparison: "none",
          }),
        ]);

        const adSets = adSetsResult.data || [];
        const s = metricsData.summary;

        const lines = [
          `## ${camp.name}`,
          `Status: ${camp.status} | Objektiv: ${camp.objective || "–"}`,
          `Meta ID: ${camp.meta_campaign_id}`,
          ``,
          `### Performance (${time_range})`,
          `| Metric | Værdi |`,
          `|--------|-------|`,
        ];

        if (s) {
          lines.push(
            `| Spend | ${formatCurrency(s.spend)} |`,
            `| Omsætning | ${formatCurrency(s.purchase_value)} |`,
            `| ROAS | ${Number(s.roas).toFixed(2)}x |`,
            `| Køb | ${Math.round(s.purchases)} |`,
            `| Klik | ${formatNum(s.clicks)} |`,
            `| CTR | ${Number(s.ctr).toFixed(2)}% |`,
            `| CPM | ${Math.round(s.cpm)} kr |`,
            `| CPA | ${s.purchases > 0 ? Math.round(s.cpa) + " kr" : "–"} |`,
            `| Reach | ${formatNum(s.reach)} |`,
          );
        } else {
          lines.push(`| _Ingen data_ | – |`);
        }

        lines.push(
          ``,
          `### Ad Sets (${adSets.length} stk)`,
          `| Ad Set | Status | Optimering | Budget |`,
          `|--------|--------|------------|--------|`,
          ...adSets.map((a: any) =>
            `| \`${a.name}\` | ${a.status} | ${a.optimization_goal || "–"} | ${a.daily_budget ? formatCurrency(a.daily_budget) + "/dag" : "–"} |`
          ),
        );

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Dashboard API: ${e.message}`);
      }
    }
  );

  // ─── Tool: compare_periods ────────────────────────────────────────────────

  server.tool(
    "compare_periods",
    "Sammenlign performance mellem to perioder (fx denne måned vs forrige)",
    {
      client_name: z.string().describe("Klientens navn"),
      period_a: z.string().describe("Første periode (nyeste). " + TIME_RANGE_DESC),
      period_b: z.string().describe("Anden periode (sammenligning). " + TIME_RANGE_DESC),
    },
    async ({ client_name, period_a, period_b }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const rangeA = resolveDateRange(period_a);
      const rangeB = resolveDateRange(period_b);

      try {
        const [dataA, dataB] = await Promise.all([
          dashboardFetch<InsightsResponse>("/api/dashboard/insights", {
            clientId: client.id,
            from: rangeA.since,
            to: rangeA.until,
            comparison: "none",
          }),
          dashboardFetch<InsightsResponse>("/api/dashboard/insights", {
            clientId: client.id,
            from: rangeB.since,
            to: rangeB.until,
            comparison: "none",
          }),
        ]);

        const a = dataA.summary;
        const b = dataB.summary;

        if (!a && !b) return text(`Ingen data for ${client.name} i nogen af perioderne`);

        function val(s: any, key: string): number { return s ? (Number(s[key]) || 0) : 0; }
        function delta(va: number, vb: number): string {
          if (vb === 0) return va > 0 ? "+∞" : "0%";
          const pct = ((va - vb) / vb * 100).toFixed(1);
          return `${Number(pct) >= 0 ? "+" : ""}${pct}%`;
        }

        const lines = [
          `## ${client.name} – Periodesammenligning`,
          `**A:** ${period_a} (${rangeA.since} → ${rangeA.until})`,
          `**B:** ${period_b} (${rangeB.since} → ${rangeB.until})`,
          ``,
          `| Metric | Periode A | Periode B | Δ |`,
          `|--------|-----------|-----------|---|`,
          `| Spend | ${formatCurrency(val(a, "spend"))} | ${formatCurrency(val(b, "spend"))} | ${delta(val(a, "spend"), val(b, "spend"))} |`,
          `| Omsætning | ${formatCurrency(val(a, "purchase_value"))} | ${formatCurrency(val(b, "purchase_value"))} | ${delta(val(a, "purchase_value"), val(b, "purchase_value"))} |`,
          `| ROAS | ${val(a, "roas").toFixed(2)}x | ${val(b, "roas").toFixed(2)}x | ${delta(val(a, "roas"), val(b, "roas"))} |`,
          `| Køb | ${Math.round(val(a, "purchases"))} | ${Math.round(val(b, "purchases"))} | ${delta(val(a, "purchases"), val(b, "purchases"))} |`,
          `| Klik | ${formatNum(val(a, "clicks"))} | ${formatNum(val(b, "clicks"))} | ${delta(val(a, "clicks"), val(b, "clicks"))} |`,
          `| CTR | ${val(a, "ctr").toFixed(2)}% | ${val(b, "ctr").toFixed(2)}% | ${delta(val(a, "ctr"), val(b, "ctr"))} |`,
          `| CPM | ${Math.round(val(a, "cpm"))} kr | ${Math.round(val(b, "cpm"))} kr | ${delta(val(a, "cpm"), val(b, "cpm"))} |`,
          `| Reach | ${formatNum(val(a, "reach"))} | ${formatNum(val(b, "reach"))} | ${delta(val(a, "reach"), val(b, "reach"))} |`,
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Dashboard API: ${e.message}`);
      }
    }
  );

  // ─── Tool: get_country_breakdown ──────────────────────────────────────────

  server.tool(
    "get_country_breakdown",
    "Land-niveau performance fra demographic_insights (country-rækker) med spend, ROAS, køb",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
    },
    async ({ client_name, time_range }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      try {
        const data = await dashboardFetch<DemographicsResponse>("/api/internal/demographics", {
          clientId: client.id,
          from: since,
          to: until,
          breakdown: "country",
        });

        const rows = data.data || [];
        if (!rows.length) return text(`Ingen land-data for ${client.name} i perioden`);

        const totalSpend = rows.reduce((s, r) => s + r.spend, 0);

        const lines = [
          `## ${client.name} – Land-breakdown (${time_range})`,
          ``,
          `| Land | Spend | % | ROAS | Køb | Klik |`,
          `|------|-------|---|------|-----|------|`,
          ...rows.map((r) =>
            `| ${r.dimension} | ${formatCurrency(r.spend)} | ${totalSpend > 0 ? (r.spend / totalSpend * 100).toFixed(1) : "0"}% | ${r.roas.toFixed(2)}x | ${Math.round(r.purchases)} | ${formatNum(r.clicks)} |`
          ),
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Dashboard API: ${e.message}`);
      }
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

      try {
        const params: Record<string, string | number | undefined> = { clientId: client.id };
        if (cohort_month) { params.startMonth = cohort_month; params.endMonth = cohort_month; }

        const data = await dashboardFetch<LeadCohortsResponse>("/api/lead-cohorts", params);

        const cohorts = data.cohorts || [];
        if (!cohorts.length) return text(`Ingen lead cohort data for ${client.name}`);

        // Filter by ad_set_name if provided (client-side filter)
        const filteredCohorts = ad_set_name
          ? cohorts.map((c: any) => ({
              ...c,
              byAdSet: (c.byAdSet || []).filter((a: any) =>
                a.adSetName?.toLowerCase().includes(ad_set_name.toLowerCase())
              ),
            })).filter((c: any) => c.byAdSet.length > 0)
          : cohorts;

        if (ad_set_name && !filteredCohorts.length) {
          return text(`Ingen cohorts med ad set "${ad_set_name}" for ${client.name}`);
        }

        if (ad_set_name) {
          // Show ad set breakdown
          const lines = [
            `## ${client.name} – Lead Cohorts (ad set: "${ad_set_name}")`,
            ``,
            `| Cohort | Ad Set | Leads | Conv% | Revenue | Rev/Lead |`,
            `|--------|--------|-------|-------|---------|----------|`,
            ...filteredCohorts.flatMap((c: any) =>
              c.byAdSet.map((a: any) =>
                `| ${c.month} | \`${a.adSetName}\` | ${a.leads} | ${a.convRate?.toFixed(1) || "0"}% | ${formatCurrency(a.revenue || 0)} | ${formatCurrency(a.revPerLead || 0)} |`
              )
            ),
          ];
          return text(lines.join("\n"));
        }

        // Default: cohort overview with progressive ROAS
        const summary = data.summary;
        const lines = [
          `## ${client.name} – Lead Cohorts${cohort_month ? ` (${cohort_month})` : ""}`,
          ``,
          `**Samlet:** ${summary.totalLeads} leads | ${summary.totalConverted} konverterede (${summary.overallConvRate?.toFixed(1) || "0"}%) | CPL: ${formatCurrency(summary.costPerLead || 0)}`,
          ``,
          `| Cohort | Leads | Conv% | Ad Spend | CPL | Revenue | ROAS | Total ROAS |`,
          `|--------|-------|-------|----------|-----|---------|------|------------|`,
          ...cohorts.map((c: any) =>
            `| ${c.month} | ${c.leadsCount} | ${((c.metrics?.find((m: any) => m.daysSinceLead === 90)?.convRate) || c.metrics?.[c.metrics.length - 1]?.convRate || 0).toFixed(1)}% | ${formatCurrency(c.adSpend || 0)} | ${formatCurrency(c.costPerLead || 0)} | ${formatCurrency(c.totalRevenue || 0)} | ${c.roas?.toFixed(2) || "–"}x | ${c.totalRoas?.toFixed(2) || "–"}x |`
          ),
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Dashboard API: ${e.message}`);
      }
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
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      try {
        const data = await dashboardFetch<TargetsResponse>("/api/internal/targets", { clientId: client.id });

        const targets = data.targets || {};
        const actual = data.actuals;

        if (Object.keys(targets).length === 0) {
          return text(`Ingen targets sat for ${client.name}. Sæt dem i dashboard → Settings.`);
        }

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
      } catch (e: any) {
        return err(`Dashboard API: ${e.message}`);
      }
    }
  );

  // ─── Tool: get_google_performance ───────────────────────────────────────────

  server.tool(
    "get_google_performance",
    "Hent aggregeret Google Ads performance for en klient (spend, conversions, ROAS, CTR). Querier insights-tabellen direkte for source=google_ads.",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
    },
    async ({ client_name, time_range }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      const { data, error } = await sb
        .from("insights")
        .select("spend, impressions, clicks, purchases, purchase_value, ctr, cpc, cpm, cpa, roas, search_impression_share, search_top_impression_share, search_budget_lost_imp_share, search_rank_lost_imp_share")
        .eq("client_id", client.id)
        .eq("source", "google_ads")
        .gte("date", since)
        .lte("date", until);

      if (error) return err(error.message);
      if (!data?.length) return text(`Ingen Google Ads data for ${client.name} i perioden ${since} → ${until}`);

      let impShareSum = 0, topImpShareSum = 0, budgetLostSum = 0, rankLostSum = 0, impShareCount = 0;
      const agg = data.reduce(
        (acc, r) => {
          if (r.search_impression_share != null) {
            impShareSum += Number(r.search_impression_share || 0);
            topImpShareSum += Number(r.search_top_impression_share || 0);
            budgetLostSum += Number(r.search_budget_lost_imp_share || 0);
            rankLostSum += Number(r.search_rank_lost_imp_share || 0);
            impShareCount++;
          }
          return {
            spend: acc.spend + Number(r.spend || 0),
            impressions: acc.impressions + Number(r.impressions || 0),
            clicks: acc.clicks + Number(r.clicks || 0),
            purchases: acc.purchases + Number(r.purchases || 0),
            revenue: acc.revenue + Number(r.purchase_value || 0),
          };
        },
        { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 }
      );

      const roas = agg.spend > 0 ? agg.revenue / agg.spend : 0;
      const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
      const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
      const cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0;
      const cpa = agg.purchases > 0 ? agg.spend / agg.purchases : 0;

      const lines = [
        `## ${client.name} – Google Ads Performance (${time_range})`,
        `Periode: ${since} → ${until} | ${data.length} daglige rækker`,
        ``,
        `| Metric | Værdi |`,
        `|--------|-------|`,
        `| Spend | ${formatCurrency(agg.spend)} |`,
        `| Omsætning | ${formatCurrency(agg.revenue)} |`,
        `| ROAS | ${roas.toFixed(2)}x |`,
        `| Konverteringer | ${Math.round(agg.purchases)} |`,
        `| CPA | ${cpa > 0 ? Math.round(cpa) + " kr" : "–"} |`,
        `| Impressions | ${formatNum(agg.impressions)} |`,
        `| Klik | ${formatNum(agg.clicks)} |`,
        `| CTR | ${ctr.toFixed(2)}% |`,
        `| CPC | ${Math.round(cpc)} kr |`,
        `| CPM | ${Math.round(cpm)} kr |`,
      ];

      if (impShareCount > 0) {
        const avgIS = (impShareSum / impShareCount * 100).toFixed(1);
        const avgTopIS = (topImpShareSum / impShareCount * 100).toFixed(1);
        const avgBudgetLost = (budgetLostSum / impShareCount * 100).toFixed(1);
        const avgRankLost = (rankLostSum / impShareCount * 100).toFixed(1);
        lines.push(
          ``,
          `**Search Impression Share (gns.)**`,
          `| Metric | Værdi |`,
          `|--------|-------|`,
          `| Impression Share | ${avgIS}% |`,
          `| Top Impression Share | ${avgTopIS}% |`,
          `| Tabt pga. budget | ${avgBudgetLost}% |`,
          `| Tabt pga. ranking | ${avgRankLost}% |`,
        );
      }

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_google_campaigns ───────────────────────────────────────────

  server.tool(
    "get_google_campaigns",
    "Hent Google Ads kampagner med aggregeret performance (spend, conversions, ROAS) fra insights-tabellen",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      status: z.enum(["all", "ACTIVE", "PAUSED", "ARCHIVED"]).default("all"),
    },
    async ({ client_name, time_range, status }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      // Get Google campaigns
      let campQuery = sb
        .from("campaigns")
        .select("id, platform_campaign_id, name, status, objective")
        .eq("client_id", client.id)
        .eq("source", "google_ads")
        .order("name");

      if (status !== "all") campQuery = campQuery.eq("status", status);

      const { data: campaigns, error: campError } = await campQuery;
      if (campError) return err(campError.message);
      if (!campaigns?.length) return text(`Ingen Google Ads kampagner fundet for ${client.name}`);

      const { since, until } = resolveDateRange(time_range);

      // Get insights aggregated per campaign
      const { data: insights, error: insError } = await sb
        .from("insights")
        .select("campaign_id, spend, impressions, clicks, purchases, purchase_value")
        .eq("client_id", client.id)
        .eq("source", "google_ads")
        .gte("date", since)
        .lte("date", until);

      if (insError) return err(insError.message);

      // Aggregate per campaign_id
      const campMetrics = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number; revenue: number }>();
      for (const row of insights || []) {
        const existing = campMetrics.get(row.campaign_id) || { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
        existing.spend += Number(row.spend || 0);
        existing.impressions += Number(row.impressions || 0);
        existing.clicks += Number(row.clicks || 0);
        existing.purchases += Number(row.purchases || 0);
        existing.revenue += Number(row.purchase_value || 0);
        campMetrics.set(row.campaign_id, existing);
      }

      // Filter: only show campaigns with spend (or active)
      const withSpend = campaigns.filter((c: any) => {
        const m = campMetrics.get(c.id);
        return m && m.spend > 0;
      });
      const withoutSpend = campaigns.filter((c: any) => {
        const m = campMetrics.get(c.id);
        return !m || m.spend === 0;
      });

      const lines = [
        `## ${client.name} – Google Ads Kampagner (${time_range})`,
        `${campaigns.length} kampagner totalt, ${withSpend.length} med spend i perioden`,
        ``,
        `| Kampagne | Status | Type | Spend | ROAS | Conv. | CPA | CTR |`,
        `|----------|--------|------|-------|------|-------|-----|-----|`,
        ...withSpend.map((c: any) => {
          const m = campMetrics.get(c.id) || { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
          const roas = m.spend > 0 ? (m.revenue / m.spend).toFixed(2) : "–";
          const cpa = m.purchases > 0 ? Math.round(m.spend / m.purchases) + " kr" : "–";
          const ctr = m.impressions > 0 ? ((m.clicks / m.impressions) * 100).toFixed(2) + "%" : "–";
          return `| \`${c.name}\` | ${googleEnum(GOOGLE_CAMPAIGN_STATUS, c.status)} | ${googleEnum(GOOGLE_CAMPAIGN_TYPE, c.objective)} | ${formatCurrency(m.spend)} | ${roas}x | ${Math.round(m.purchases)} | ${cpa} | ${ctr} |`;
        }),
      ];

      if (withoutSpend.length > 0) {
        lines.push(``, `*${withoutSpend.length} kampagner uden spend i perioden (${withoutSpend.filter((c: any) => String(c.status) === "2").length} ENABLED)*`);
      }

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_channel_overview ────────────────────────────────────────────

  server.tool(
    "get_channel_overview",
    "Cross-channel overblik: Meta Ads vs Google Ads (og Shopify revenue) side-by-side for en klient",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
    },
    async ({ client_name, time_range }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      // Parallel: Meta insights + Google insights + Shopify revenue
      const [metaResult, googleResult, shopifyResult] = await Promise.all([
        sb.from("insights")
          .select("spend, impressions, clicks, purchases, purchase_value")
          .eq("client_id", client.id)
          .eq("source", "meta")
          .gte("date", since)
          .lte("date", until),
        sb.from("insights")
          .select("spend, impressions, clicks, purchases, purchase_value")
          .eq("client_id", client.id)
          .eq("source", "google_ads")
          .gte("date", since)
          .lte("date", until),
        sb.from("shopify_order_daily")
          .select("orders_count, gross_revenue, net_revenue")
          .eq("client_id", client.id)
          .gte("date", since)
          .lte("date", until),
      ]);

      function sumInsights(data: any[] | null) {
        return (data || []).reduce(
          (acc, r) => ({
            spend: acc.spend + Number(r.spend || 0),
            impressions: acc.impressions + Number(r.impressions || 0),
            clicks: acc.clicks + Number(r.clicks || 0),
            purchases: acc.purchases + Number(r.purchases || 0),
            revenue: acc.revenue + Number(r.purchase_value || 0),
          }),
          { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 }
        );
      }

      const meta = sumInsights(metaResult.data);
      const google = sumInsights(googleResult.data);
      const shopify = (shopifyResult.data || []).reduce(
        (acc, r) => ({
          orders: acc.orders + Number(r.orders_count || 0),
          gross: acc.gross + Number(r.gross_revenue || 0),
          net: acc.net + Number(r.net_revenue || 0),
        }),
        { orders: 0, gross: 0, net: 0 }
      );

      const totalSpend = meta.spend + google.spend;
      const totalRevenue = meta.revenue + google.revenue;
      const totalPurchases = meta.purchases + google.purchases;

      function roas(revenue: number, spend: number): string { return spend > 0 ? (revenue / spend).toFixed(2) + "x" : "–"; }
      function ctr(clicks: number, impressions: number): string { return impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + "%" : "–"; }
      function pct(val: number, total: number): string { return total > 0 ? (val / total * 100).toFixed(1) + "%" : "–"; }

      const hasMeta = meta.spend > 0 || metaResult.data?.length;
      const hasGoogle = google.spend > 0 || googleResult.data?.length;
      const hasShopify = shopify.orders > 0 || shopifyResult.data?.length;

      const lines = [
        `## ${client.name} – Channel Overview (${time_range})`,
        `Periode: ${since} → ${until}`,
        ``,
        `### Ad Spend & Performance`,
        `| Kanal | Spend | % af total | ROAS | Køb | CTR |`,
        `|-------|-------|------------|------|-----|-----|`,
      ];

      if (hasMeta) {
        lines.push(`| **Meta Ads** | ${formatCurrency(meta.spend)} | ${pct(meta.spend, totalSpend)} | ${roas(meta.revenue, meta.spend)} | ${Math.round(meta.purchases)} | ${ctr(meta.clicks, meta.impressions)} |`);
      }
      if (hasGoogle) {
        lines.push(`| **Google Ads** | ${formatCurrency(google.spend)} | ${pct(google.spend, totalSpend)} | ${roas(google.revenue, google.spend)} | ${Math.round(google.purchases)} | ${ctr(google.clicks, google.impressions)} |`);
      }
      lines.push(`| **Total** | ${formatCurrency(totalSpend)} | 100% | ${roas(totalRevenue, totalSpend)} | ${Math.round(totalPurchases)} | – |`);

      if (hasShopify) {
        lines.push(
          ``,
          `### Shopify Revenue`,
          `| Metric | Værdi |`,
          `|--------|-------|`,
          `| Ordrer | ${formatNum(shopify.orders)} |`,
          `| Brutto-omsætning | ${formatCurrency(shopify.gross)} |`,
          `| Netto-omsætning | ${formatCurrency(shopify.net)} |`,
          `| Blended ROAS | ${totalSpend > 0 ? (shopify.net / totalSpend).toFixed(2) + "x" : "–"} |`,
        );
      }

      if (!hasMeta && !hasGoogle && !hasShopify) {
        return text(`Ingen kanal-data for ${client.name} i perioden ${since} → ${until}`);
      }

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_shopify_revenue ─────────────────────────────────────────────

  server.tool(
    "get_shopify_revenue",
    "Hent Shopify omsætningsdata (ordrer, brutto/netto revenue) med valgfri land-breakdown",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      by_country: z.boolean().default(false).describe("Vis breakdown per land"),
    },
    async ({ client_name, time_range, by_country }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      const { data, error } = await sb
        .from("shopify_order_daily")
        .select("date, country_code, orders_count, gross_revenue, net_revenue, new_customer_orders")
        .eq("client_id", client.id)
        .gte("date", since)
        .lte("date", until)
        .order("date", { ascending: false });

      if (error) return err(error.message);
      if (!data?.length) return text(`Ingen Shopify data for ${client.name} i perioden ${since} → ${until}`);

      if (by_country) {
        // Aggregate per country
        const countryMap = new Map<string, { orders: number; gross: number; net: number; newCustomers: number }>();
        for (const r of data) {
          const cc = r.country_code || "Ukendt";
          const existing = countryMap.get(cc) || { orders: 0, gross: 0, net: 0, newCustomers: 0 };
          existing.orders += Number(r.orders_count || 0);
          existing.gross += Number(r.gross_revenue || 0);
          existing.net += Number(r.net_revenue || 0);
          existing.newCustomers += Number(r.new_customer_orders || 0);
          countryMap.set(cc, existing);
        }

        const totalGross = [...countryMap.values()].reduce((s, c) => s + c.gross, 0);
        const sorted = [...countryMap.entries()].sort((a, b) => b[1].gross - a[1].gross);

        const lines = [
          `## ${client.name} – Shopify Revenue per Land (${time_range})`,
          ``,
          `| Land | Ordrer | Brutto | Netto | % | Nye kunder |`,
          `|------|--------|--------|-------|---|------------|`,
          ...sorted.map(([cc, m]) =>
            `| ${cc} | ${m.orders} | ${formatCurrency(m.gross)} | ${formatCurrency(m.net)} | ${totalGross > 0 ? (m.gross / totalGross * 100).toFixed(1) : "0"}% | ${m.newCustomers} |`
          ),
        ];

        return text(lines.join("\n"));
      }

      // Default: daily aggregate
      const agg = data.reduce(
        (acc, r) => ({
          orders: acc.orders + Number(r.orders_count || 0),
          gross: acc.gross + Number(r.gross_revenue || 0),
          net: acc.net + Number(r.net_revenue || 0),
          newCustomers: acc.newCustomers + Number(r.new_customer_orders || 0),
        }),
        { orders: 0, gross: 0, net: 0, newCustomers: 0 }
      );

      const aov = agg.orders > 0 ? agg.gross / agg.orders : 0;
      const uniqueDates = new Set(data.map(r => r.date)).size;

      const lines = [
        `## ${client.name} – Shopify Revenue (${time_range})`,
        `Periode: ${since} → ${until} | ${uniqueDates} dage med data`,
        ``,
        `| Metric | Værdi |`,
        `|--------|-------|`,
        `| Ordrer | ${formatNum(agg.orders)} |`,
        `| Brutto-omsætning | ${formatCurrency(agg.gross)} |`,
        `| Netto-omsætning | ${formatCurrency(agg.net)} |`,
        `| AOV | ${formatCurrency(aov)} |`,
        `| Nye kunder | ${formatNum(agg.newCustomers)} |`,
        `| Gns. ordrer/dag | ${(agg.orders / Math.max(uniqueDates, 1)).toFixed(1)} |`,
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_data_sources ────────────────────────────────────────────────

  server.tool(
    "get_data_sources",
    "Vis hvilke datakilder der er tilsluttet for en klient (Meta, Google Ads, Klaviyo, Shopify) og deres sync-status",
    {
      client_name: z.string().describe("Klientens navn"),
    },
    async ({ client_name }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      // Parallel: data_sources + klaviyo_connections + client meta info
      const [dsResult, klavResult, clientResult] = await Promise.all([
        sb.from("data_sources")
          .select("id, source_type, display_name, is_active, last_synced_at, config")
          .eq("client_id", client.id)
          .order("source_type"),
        sb.from("client_klaviyo_connections")
          .select("id, name, is_active, created_at")
          .eq("client_id", client.id),
        sb.from("clients")
          .select("meta_ad_account_id, klaviyo_api_key")
          .eq("id", client.id)
          .single(),
      ]);

      const lines = [
        `## ${client.name} – Datakilder`,
        ``,
      ];

      // Meta Ads (always from clients table)
      const metaId = clientResult.data?.meta_ad_account_id;
      lines.push(`### Meta Ads`);
      if (metaId) {
        lines.push(`- ✅ Tilsluttet: \`${metaId}\``);
      } else {
        lines.push(`- ❌ Ikke tilsluttet`);
      }

      // Klaviyo connections
      const klavConnections = klavResult.data || [];
      lines.push(``, `### Klaviyo`);
      if (klavConnections.length > 0) {
        for (const k of klavConnections) {
          lines.push(`- ${k.is_active ? "✅" : "⏸️"} ${k.name} (oprettet ${k.created_at?.split("T")[0] || "–"})`);
        }
      } else if (clientResult.data?.klaviyo_api_key) {
        lines.push(`- ✅ Legacy API key (clients-tabellen)`);
      } else {
        lines.push(`- ❌ Ikke tilsluttet`);
      }

      // Data sources (Google Ads, Shopify, etc.)
      const dataSources = dsResult.data || [];
      const googleDs = dataSources.filter((ds: any) => ds.source_type === "google_ads");
      const shopifyDs = dataSources.filter((ds: any) => ds.source_type === "shopify");
      const otherDs = dataSources.filter((ds: any) => !["google_ads", "shopify"].includes(ds.source_type));

      lines.push(``, `### Google Ads`);
      if (googleDs.length > 0) {
        for (const ds of googleDs) {
          const lastSync = ds.last_synced_at ? ds.last_synced_at.split("T")[0] : "aldrig";
          lines.push(`- ${ds.is_active ? "✅" : "⏸️"} ${ds.display_name || "Google Ads"} | Sidst synkroniseret: ${lastSync}`);
        }
      } else {
        lines.push(`- ❌ Ikke tilsluttet`);
      }

      lines.push(``, `### Shopify`);
      if (shopifyDs.length > 0) {
        for (const ds of shopifyDs) {
          const lastSync = ds.last_synced_at ? ds.last_synced_at.split("T")[0] : "aldrig";
          lines.push(`- ${ds.is_active ? "✅" : "⏸️"} ${ds.display_name || "Shopify"} | Sidst synkroniseret: ${lastSync}`);
        }
      } else {
        lines.push(`- ❌ Ikke tilsluttet`);
      }

      if (otherDs.length > 0) {
        lines.push(``, `### Andre`);
        for (const ds of otherDs) {
          const lastSync = ds.last_synced_at ? ds.last_synced_at.split("T")[0] : "aldrig";
          lines.push(`- ${ds.is_active ? "✅" : "⏸️"} ${ds.display_name || ds.source_type} (${ds.source_type}) | Sidst synkroniseret: ${lastSync}`);
        }
      }

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_google_keywords ────────────────────────────────────────────

  server.tool(
    "get_google_keywords",
    "Hent Google Ads keyword-performance med Quality Score, predicted CTR, ad relevance og landing page experience. Sortér efter spend, QS eller conversions.",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      sort_by: z.enum(["spend", "conversions", "quality_score", "clicks"]).default("spend").describe("Sorteringskolonne"),
      limit: z.number().default(30).describe("Max antal keywords at vise"),
      min_spend: z.number().default(0).describe("Minimum spend for at inkludere keyword"),
      match_type: z.enum(["all", "BROAD", "PHRASE", "EXACT"]).default("all").describe("Filtrer på match type"),
    },
    async ({ client_name, time_range, sort_by, limit, min_spend, match_type }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      let query = sb
        .from("google_keywords")
        .select("keyword_text, match_type, date, spend, clicks, impressions, conversions, quality_score, search_predicted_ctr, ad_relevance, landing_page_experience")
        .eq("client_id", client.id)
        .gte("date", since)
        .lte("date", until);

      if (match_type !== "all") query = query.eq("match_type", match_type);

      const { data, error } = await query;
      if (error) return err(error.message);
      if (!data?.length) return text(`Ingen keyword-data for ${client.name} i perioden ${since} → ${until}`);

      // Aggregate per keyword+match_type (latest QS wins)
      const kwMap = new Map<string, {
        keyword: string; matchType: string;
        spend: number; clicks: number; impressions: number; conversions: number;
        qualityScore: number | null; predictedCtr: string; adRelevance: string; landingPage: string;
      }>();

      for (const r of data) {
        const key = `${r.keyword_text}|${r.match_type}`;
        const existing = kwMap.get(key);
        if (existing) {
          existing.spend += Number(r.spend || 0);
          existing.clicks += Number(r.clicks || 0);
          existing.impressions += Number(r.impressions || 0);
          existing.conversions += Number(r.conversions || 0);
          // Keep latest QS (non-null)
          if (r.quality_score != null) existing.qualityScore = Number(r.quality_score);
          if (r.search_predicted_ctr) existing.predictedCtr = r.search_predicted_ctr;
          if (r.ad_relevance) existing.adRelevance = r.ad_relevance;
          if (r.landing_page_experience) existing.landingPage = r.landing_page_experience;
        } else {
          kwMap.set(key, {
            keyword: r.keyword_text,
            matchType: r.match_type,
            spend: Number(r.spend || 0),
            clicks: Number(r.clicks || 0),
            impressions: Number(r.impressions || 0),
            conversions: Number(r.conversions || 0),
            qualityScore: r.quality_score != null ? Number(r.quality_score) : null,
            predictedCtr: r.search_predicted_ctr || "–",
            adRelevance: r.ad_relevance || "–",
            landingPage: r.landing_page_experience || "–",
          });
        }
      }

      let keywords = [...kwMap.values()].filter(k => k.spend >= min_spend);

      // Sort
      switch (sort_by) {
        case "spend": keywords.sort((a, b) => b.spend - a.spend); break;
        case "conversions": keywords.sort((a, b) => b.conversions - a.conversions); break;
        case "quality_score": keywords.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0)); break;
        case "clicks": keywords.sort((a, b) => b.clicks - a.clicks); break;
      }

      keywords = keywords.slice(0, limit);

      const totalSpend = keywords.reduce((s, k) => s + k.spend, 0);
      const totalConv = keywords.reduce((s, k) => s + k.conversions, 0);

      const lines = [
        `## ${client.name} – Google Keywords (${time_range})`,
        `${kwMap.size} unikke keywords | Viser top ${keywords.length} (sorteret: ${sort_by})`,
        ``,
        `| Keyword | Match | Spend | Conv. | CPA | QS | CTR pred. | Ad rel. | LP |`,
        `|---------|-------|-------|-------|-----|----|-----------|---------|----|`,
        ...keywords.map(k => {
          const cpa = k.conversions > 0 ? Math.round(k.spend / k.conversions) + " kr" : "–";
          const qs = k.qualityScore != null ? String(k.qualityScore) : "–";
          return `| \`${k.keyword}\` | ${googleEnum(GOOGLE_MATCH_TYPE, k.matchType)} | ${formatCurrency(k.spend)} | ${k.conversions.toFixed(1)} | ${cpa} | ${qs} | ${googleEnum(GOOGLE_QS_RATING, k.predictedCtr)} | ${googleEnum(GOOGLE_QS_RATING, k.adRelevance)} | ${googleEnum(GOOGLE_QS_RATING, k.landingPage)} |`;
        }),
        ``,
        `**Total:** ${formatCurrency(totalSpend)} spend, ${totalConv.toFixed(1)} conversions`,
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_google_search_terms ─────────────────────────────────────────

  server.tool(
    "get_google_search_terms",
    "Hent Google Ads søgeforespørgsler (search terms) der udløste annoncer. Vis spend, klik og conversions per søgeterm. Filtrer på status (ADDED/EXCLUDED/NONE).",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      sort_by: z.enum(["spend", "conversions", "clicks"]).default("spend").describe("Sorteringskolonne"),
      limit: z.number().default(50).describe("Max antal søgetermer at vise"),
      status: z.enum(["all", "ADDED", "EXCLUDED", "NONE"]).default("all").describe("Filtrer på term-status"),
      min_clicks: z.number().default(0).describe("Minimum klik for at inkludere"),
    },
    async ({ client_name, time_range, sort_by, limit, status, min_clicks }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      let query = sb
        .from("google_search_terms")
        .select("search_term, status, date, spend, clicks, impressions, conversions")
        .eq("client_id", client.id)
        .gte("date", since)
        .lte("date", until);

      if (status !== "all") query = query.eq("status", status);

      const { data, error } = await query;
      if (error) return err(error.message);
      if (!data?.length) return text(`Ingen search term data for ${client.name} i perioden ${since} → ${until}`);

      // Aggregate per search_term
      const termMap = new Map<string, {
        term: string; status: string;
        spend: number; clicks: number; impressions: number; conversions: number;
      }>();

      for (const r of data) {
        const key = r.search_term;
        const existing = termMap.get(key);
        if (existing) {
          existing.spend += Number(r.spend || 0);
          existing.clicks += Number(r.clicks || 0);
          existing.impressions += Number(r.impressions || 0);
          existing.conversions += Number(r.conversions || 0);
        } else {
          termMap.set(key, {
            term: r.search_term,
            status: r.status || "NONE",
            spend: Number(r.spend || 0),
            clicks: Number(r.clicks || 0),
            impressions: Number(r.impressions || 0),
            conversions: Number(r.conversions || 0),
          });
        }
      }

      let terms = [...termMap.values()].filter(t => t.clicks >= min_clicks);

      switch (sort_by) {
        case "spend": terms.sort((a, b) => b.spend - a.spend); break;
        case "conversions": terms.sort((a, b) => b.conversions - a.conversions); break;
        case "clicks": terms.sort((a, b) => b.clicks - a.clicks); break;
      }

      terms = terms.slice(0, limit);

      const totalSpend = terms.reduce((s, t) => s + t.spend, 0);
      const totalConv = terms.reduce((s, t) => s + t.conversions, 0);
      const totalClicks = terms.reduce((s, t) => s + t.clicks, 0);

      const lines = [
        `## ${client.name} – Google Search Terms (${time_range})`,
        `${termMap.size} unikke søgetermer | Viser top ${terms.length} (sorteret: ${sort_by})`,
        ``,
        `| Søgeterm | Status | Spend | Klik | Conv. | CPA | CTR |`,
        `|----------|--------|-------|------|-------|-----|-----|`,
        ...terms.map(t => {
          const cpa = t.conversions > 0 ? Math.round(t.spend / t.conversions) + " kr" : "–";
          const ctr = t.impressions > 0 ? ((t.clicks / t.impressions) * 100).toFixed(2) + "%" : "–";
          return `| \`${t.term}\` | ${googleEnum(GOOGLE_SEARCH_TERM_STATUS, t.status)} | ${formatCurrency(t.spend)} | ${t.clicks} | ${t.conversions.toFixed(1)} | ${cpa} | ${ctr} |`;
        }),
        ``,
        `**Total:** ${formatCurrency(totalSpend)} spend, ${totalClicks} klik, ${totalConv.toFixed(1)} conversions`,
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_klaviyo_overview ─────────────────────────────────────────────

  server.tool(
    "get_klaviyo_overview",
    "Klaviyo email-overblik: sendt, åbnet, klikket, orders, revenue + subscriber count",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
    },
    async ({ client_name, time_range }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let apiKey: string;
      try { apiKey = await resolveKlaviyoApiKey(sb, client.id); } catch {
        return text(`Ingen Klaviyo-forbindelse for ${client.name}`);
      }

      const { since, until } = resolveDateRange(time_range);

      try {
        const [emailData, subStats] = await Promise.all([
          getEmailMetrics(apiKey, since, until),
          getSubscriberStats(apiKey),
        ]);

        const openRate = emailData.received > 0 ? ((emailData.opened / emailData.received) * 100).toFixed(1) : "–";
        const clickRate = emailData.received > 0 ? ((emailData.clicked / emailData.received) * 100).toFixed(1) : "–";
        const rpe = emailData.received > 0 ? (emailData.revenue / emailData.received).toFixed(2) : "–";

        const lines = [
          `## ${client.name} – Klaviyo Overblik (${time_range})`,
          ``,
          `| Metric | Værdi |`,
          `|--------|-------|`,
          `| Sendt | ${formatNum(emailData.received)} |`,
          `| Åbnet | ${formatNum(emailData.opened)} (${openRate}%) |`,
          `| Klikket | ${formatNum(emailData.clicked)} (${clickRate}%) |`,
          `| Orders | ${formatNum(emailData.ordersPlaced)} |`,
          `| Revenue | ${formatCurrency(emailData.revenue)} |`,
          `| Rev/email | ${rpe} kr |`,
          ``,
          `**Subscribers:** ~${formatNum(subStats.totalProfiles)} profiler på tværs af ${subStats.lists.length} lister`,
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Klaviyo API: ${e.message}`);
      }
    }
  );

  // ─── Tool: get_klaviyo_flows ──────────────────────────────────────────────

  server.tool(
    "get_klaviyo_flows",
    "Alle Klaviyo flows med performance: sendt, open%, click%, revenue",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
    },
    async ({ client_name, time_range }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let apiKey: string;
      try { apiKey = await resolveKlaviyoApiKey(sb, client.id); } catch {
        return text(`Ingen Klaviyo-forbindelse for ${client.name}`);
      }

      const { since, until } = resolveDateRange(time_range);

      try {
        const flows = await getFlowsWithPerformance(apiKey, since, until);

        if (!flows.length) return text(`Ingen flows fundet for ${client.name}`);

        const sorted = [...flows].sort((a, b) => b.revenue - a.revenue);
        const totalRevenue = sorted.reduce((s, f) => s + f.revenue, 0);

        const lines = [
          `## ${client.name} – Klaviyo Flows (${time_range})`,
          ``,
          `| Flow | Status | Sendt | Open% | Click% | Revenue | Rev/email |`,
          `|------|--------|-------|-------|--------|---------|-----------|`,
          ...sorted.map((f) =>
            `| ${f.name} | ${f.status} | ${formatNum(f.received)} | ${f.openRate.toFixed(1)}% | ${f.clickRate.toFixed(1)}% | ${formatCurrency(f.revenue)} | ${f.revenuePerEmail.toFixed(1)} kr |`
          ),
          ``,
          `**Total flow revenue:** ${formatCurrency(totalRevenue)}`,
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Klaviyo API: ${e.message}`);
      }
    }
  );

  // ─── Tool: get_klaviyo_campaigns ──────────────────────────────────────────

  server.tool(
    "get_klaviyo_campaigns",
    "Klaviyo campaigns med performance, sorteret efter seneste send",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      limit: z.number().default(20).describe("Max antal campaigns"),
    },
    async ({ client_name, time_range, limit: maxCampaigns }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let apiKey: string;
      try { apiKey = await resolveKlaviyoApiKey(sb, client.id); } catch {
        return text(`Ingen Klaviyo-forbindelse for ${client.name}`);
      }

      const { since, until } = resolveDateRange(time_range);

      try {
        const campaigns = await getCampaignsWithPerformance(apiKey, since, until);

        if (!campaigns.length) return text(`Ingen campaigns fundet for ${client.name} i perioden`);

        const sent = campaigns.filter((c) => c.status === "Sent");
        const sorted = [...sent].sort((a, b) => (b.send_time || "").localeCompare(a.send_time || "")).slice(0, maxCampaigns);

        const lines = [
          `## ${client.name} – Klaviyo Campaigns (${time_range})`,
          ``,
          `| Campaign | Send dato | Sendt | Open% | Click% | CTOR | Revenue |`,
          `|----------|-----------|-------|-------|--------|------|---------|`,
          ...sorted.map((c) => {
            const sendDate = c.send_time ? c.send_time.split("T")[0] : "–";
            return `| ${c.name.slice(0, 40)} | ${sendDate} | ${formatNum(c.received)} | ${c.openRate.toFixed(1)}% | ${c.clickRate.toFixed(1)}% | ${c.ctor.toFixed(1)}% | ${formatCurrency(c.revenue)} |`;
          }),
          ``,
          `**${sent.length} sendte campaigns** i perioden`,
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Klaviyo API: ${e.message}`);
      }
    }
  );

  // ─── Tool: get_klaviyo_revenue ────────────────────────────────────────────

  server.tool(
    "get_klaviyo_revenue",
    "Klaviyo revenue attribution: flows vs campaigns, top 5 af hver",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
    },
    async ({ client_name, time_range }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let apiKey: string;
      try { apiKey = await resolveKlaviyoApiKey(sb, client.id); } catch {
        return text(`Ingen Klaviyo-forbindelse for ${client.name}`);
      }

      const { since, until } = resolveDateRange(time_range);

      try {
        const rev = await getRevenueAttribution(apiKey, since, until);

        const lines = [
          `## ${client.name} – Klaviyo Revenue Attribution (${time_range})`,
          ``,
          `| Kilde | Revenue | Andel |`,
          `|-------|---------|-------|`,
          `| Flows | ${formatCurrency(rev.flowRevenue)} | ${rev.flowPercentage.toFixed(1)}% |`,
          `| Campaigns | ${formatCurrency(rev.campaignRevenue)} | ${rev.campaignPercentage.toFixed(1)}% |`,
          `| **Total** | **${formatCurrency(rev.totalRevenue)}** | 100% |`,
          ``,
        ];

        if (rev.topFlows.length > 0) {
          lines.push(`### Top flows`, `| Flow | Revenue |`, `|------|---------|`);
          rev.topFlows.forEach((f) => lines.push(`| ${f.name} | ${formatCurrency(f.revenue)} |`));
          lines.push(``);
        }

        if (rev.topCampaigns.length > 0) {
          lines.push(`### Top campaigns`, `| Campaign | Revenue |`, `|----------|---------|`);
          rev.topCampaigns.forEach((c) => lines.push(`| ${c.name.slice(0, 50)} | ${formatCurrency(c.revenue)} |`));
        }

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Klaviyo API: ${e.message}`);
      }
    }
  );

  // ─── Tool: get_klaviyo_lists ──────────────────────────────────────────────

  server.tool(
    "get_klaviyo_lists",
    "Klaviyo subscriber-lister med profil-antal",
    {
      client_name: z.string().describe("Klientens navn"),
    },
    async ({ client_name }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let apiKey: string;
      try { apiKey = await resolveKlaviyoApiKey(sb, client.id); } catch {
        return text(`Ingen Klaviyo-forbindelse for ${client.name}`);
      }

      try {
        const stats = await getSubscriberStats(apiKey);

        const lines = [
          `## ${client.name} – Klaviyo Lister`,
          ``,
          `| Liste | Profiler |`,
          `|-------|----------|`,
          ...stats.lists.map((l) => `| ${l.name} | ${l.profileCount > 0 ? `~${formatNum(l.profileCount)}+` : "0"} |`),
          ``,
          `**Total:** ~${formatNum(stats.totalProfiles)} profiler (estimat)`,
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Klaviyo API: ${e.message}`);
      }
    }
  );

  // ─── Tool: get_klaviyo_segments ───────────────────────────────────────────

  server.tool(
    "get_klaviyo_segments",
    "Klaviyo segmenter med status og profil-antal",
    {
      client_name: z.string().describe("Klientens navn"),
    },
    async ({ client_name }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let apiKey: string;
      try { apiKey = await resolveKlaviyoApiKey(sb, client.id); } catch {
        return text(`Ingen Klaviyo-forbindelse for ${client.name}`);
      }

      try {
        const stats = await getSubscriberStats(apiKey);

        const lines = [
          `## ${client.name} – Klaviyo Segmenter`,
          ``,
          `| Segment | Aktiv | Starred | Profiler |`,
          `|---------|-------|---------|----------|`,
          ...stats.segments.map((s) =>
            `| ${s.name} | ${s.isActive ? "✓" : "–"} | ${s.isStarred ? "★" : "–"} | ${s.profileCount > 0 ? `~${formatNum(s.profileCount)}+` : "0"} |`
          ),
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Klaviyo API: ${e.message}`);
      }
    }
  );

  // ─── Tool: get_klaviyo_metrics ────────────────────────────────────────────

  server.tool(
    "get_klaviyo_metrics",
    "Tilgængelige Klaviyo metrics/events i kontoen",
    {
      client_name: z.string().describe("Klientens navn"),
    },
    async ({ client_name }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let apiKey: string;
      try { apiKey = await resolveKlaviyoApiKey(sb, client.id); } catch {
        return text(`Ingen Klaviyo-forbindelse for ${client.name}`);
      }

      try {
        const metrics = await listMetrics(apiKey);

        const lines = [
          `## ${client.name} – Klaviyo Metrics`,
          ``,
          `| Metric | Integration | ID |`,
          `|--------|-------------|----|`,
          ...metrics.map((m) =>
            `| ${m.name} | ${m.integration?.name || "–"} | ${m.id} |`
          ),
          ``,
          `**${metrics.length} metrics** tilgængelige`,
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Klaviyo API: ${e.message}`);
      }
    }
  );

  // ─── Tool: get_klaviyo_health ─────────────────────────────────────────────

  server.tool(
    "get_klaviyo_health",
    "Check Klaviyo-forbindelse: valider API key og hent basis-info",
    {
      client_name: z.string().describe("Klientens navn"),
    },
    async ({ client_name }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let apiKey: string;
      try { apiKey = await resolveKlaviyoApiKey(sb, client.id); } catch {
        return text(`❌ Ingen Klaviyo API key fundet for ${client.name}`);
      }

      try {
        const valid = await validateApiKey(apiKey);
        if (!valid) return text(`❌ Klaviyo API key for ${client.name} er ugyldig`);

        const [metrics, lists, segments] = await Promise.all([
          listMetrics(apiKey),
          listLists(apiKey),
          listSegments(apiKey),
        ]);

        const lines = [
          `## ${client.name} – Klaviyo Health Check`,
          ``,
          `✅ **API key er gyldig**`,
          `- ${metrics.length} metrics tilgængelige`,
          `- ${lists.length} lister`,
          `- ${segments.length} segmenter`,
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Klaviyo health check fejlede: ${e.message}`);
      }
    }
  );

  // ─── Tool: setup_assistant ─────────────────────────────────────────────────
  // Returns a setup script that Claude Code can execute locally to install
  // skills, guides, and config from the nr-assistant git repo.

  server.tool(
    "setup_assistant",
    "Installer NR Assistant (skills, guides, MCP config) på denne computer. Returnerer et setup-script som Claude Code kører lokalt.",
    {},
    async () => {
      const REPO_URL = "https://github.com/se-nr/nr-assistant.git";
      const script = `#!/bin/bash
set -e

NR_DIR="$HOME/.claude/nr-assistant"
SKILLS_DIR="$HOME/.claude/skills"

GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m'

ok()   { echo -e "  \${GREEN}✓\${NC} $1"; }
warn() { echo -e "  \${YELLOW}⚠\${NC}  $1"; }
info() { echo -e "  \${BLUE}→\${NC} $1"; }
step() { echo -e "\\n\${BLUE}$1\${NC}"; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    NR Assistant – Remote Setup       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── 1. Clone or update repo ────────────────────────────────────────────────
step "1/3  Git repo"

if [ -d "$NR_DIR/.git" ]; then
  info "Opdaterer eksisterende repo..."
  cd "$NR_DIR" && git pull --ff-only origin main
  ok "nr-assistant opdateret"
else
  info "Kloner nr-assistant..."
  mkdir -p "$HOME/.claude"
  git clone ${REPO_URL} "$NR_DIR"
  ok "nr-assistant klonet"
fi

VERSION=$(cat "$NR_DIR/VERSION" 2>/dev/null || echo "unknown")
info "Version: $VERSION"

# ─── 2. Install skills ──────────────────────────────────────────────────────
step "2/3  Skills"

mkdir -p "$SKILLS_DIR"

for skill_dir in "$NR_DIR/skills"/*/; do
  skill_name=$(basename "$skill_dir")
  if [ -f "$skill_dir/SKILL.md" ]; then
    mkdir -p "$SKILLS_DIR/$skill_name"
    cp "$skill_dir/SKILL.md" "$SKILLS_DIR/$skill_name/SKILL.md"
    ok "$skill_name"
  fi
done

# ─── 3. NotebookLM skill ────────────────────────────────────────────────────
step "3/3  NotebookLM"

NOTEBOOKLM_DIR="$SKILLS_DIR/notebooklm"
if [ -d "$NOTEBOOKLM_DIR" ]; then
  ok "NotebookLM allerede installeret"
else
  if git clone --quiet https://github.com/PleasePrompto/notebooklm-skill "$NOTEBOOKLM_DIR" 2>/dev/null; then
    ok "NotebookLM klonet"
  else
    warn "NotebookLM clone fejlede – spring over"
  fi
fi

if [ -f "$NR_DIR/mcp/notebooklm/mcp_server.py" ] && [ ! -f "$NOTEBOOKLM_DIR/mcp_server.py" ]; then
  cp "$NR_DIR/mcp/notebooklm/mcp_server.py" "$NOTEBOOKLM_DIR/mcp_server.py"
  cp "$NR_DIR/mcp/notebooklm/start_mcp.sh" "$NOTEBOOKLM_DIR/start_mcp.sh"
  chmod +x "$NOTEBOOKLM_DIR/start_mcp.sh"
  ok "NotebookLM MCP server kopieret"
fi

echo ""
echo "══════════════════════════════════════════"
echo -e "\${GREEN}  NR Assistant installeret!\${NC}"
echo "══════════════════════════════════════════"
echo ""
echo "Tilgængelige skills:"
for skill_dir in "$NR_DIR/skills"/*/; do
  skill_name=$(basename "$skill_dir")
  echo "  /$skill_name"
done
echo "  /notebooklm"
echo ""
echo "Opdater senere: cd ~/.claude/nr-assistant && git pull"
echo ""
`;

      return {
        content: [
          {
            type: "text" as const,
            text: `## NR Assistant Setup

Kør dette script for at installere NR Assistant (skills, guides, config) fra GitHub:

\`\`\`bash
${script}
\`\`\`

**Instruktion til Claude Code:** Kør ovenstående bash-script for at installere NR Assistant på brugerens maskine. Scriptet kloner repo'et fra GitHub, kopierer skills til ~/.claude/skills/, og opsætter NotebookLM.

**Opdatering:** Kør \`setup_assistant\` igen for at hente seneste version.`,
          },
        ],
      };
    }
  );

  // ─── Tool: update_assistant ───────────────────────────────────────────────
  // Pulls latest changes from GitHub and re-installs skills.

  server.tool(
    "update_assistant",
    "Opdater NR Assistant til nyeste version (git pull + skill-kopi). Kør dette jævnligt for at få nye skills og forbedringer.",
    {},
    async () => {
      const script = `#!/bin/bash
set -e

NR_DIR="$HOME/.claude/nr-assistant"
SKILLS_DIR="$HOME/.claude/skills"

GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m'

ok()   { echo -e "  \${GREEN}✓\${NC} $1"; }
warn() { echo -e "  \${YELLOW}⚠\${NC}  $1"; }
info() { echo -e "  \${BLUE}→\${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    NR Assistant – Update             ║"
echo "╚══════════════════════════════════════╝"
echo ""

if [ ! -d "$NR_DIR/.git" ]; then
  echo "NR Assistant ikke installeret. Kør setup_assistant først."
  exit 1
fi

OLD_VERSION=$(cat "$NR_DIR/VERSION" 2>/dev/null || echo "unknown")
info "Nuværende version: $OLD_VERSION"

# Pull latest
cd "$NR_DIR"
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  ok "Allerede på nyeste version ($OLD_VERSION)"
  exit 0
fi

git pull --ff-only origin main
NEW_VERSION=$(cat "$NR_DIR/VERSION" 2>/dev/null || echo "unknown")

# Re-install skills
info "Opdaterer skills..."
mkdir -p "$SKILLS_DIR"
UPDATED=0
for skill_dir in "$NR_DIR/skills"/*/; do
  skill_name=$(basename "$skill_dir")
  if [ -f "$skill_dir/SKILL.md" ]; then
    mkdir -p "$SKILLS_DIR/$skill_name"
    cp "$skill_dir/SKILL.md" "$SKILLS_DIR/$skill_name/SKILL.md"
    ok "$skill_name"
    UPDATED=$((UPDATED + 1))
  fi
done

echo ""
echo "══════════════════════════════════════════"
echo -e "\${GREEN}  Opdateret: $OLD_VERSION → $NEW_VERSION\${NC}"
echo -e "  \${BLUE}$UPDATED skills opdateret\${NC}"
echo "══════════════════════════════════════════"
echo ""
`;

      return {
        content: [
          {
            type: "text" as const,
            text: `## NR Assistant Update

Kør dette script for at opdatere NR Assistant til nyeste version:

\`\`\`bash
${script}
\`\`\`

**Instruktion til Claude Code:** Kør ovenstående bash-script for at opdatere NR Assistant. Scriptet gitter pull fra GitHub og kopierer opdaterede skills til ~/.claude/skills/.`,
          },
        ],
      };
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

/**
 * Resolve a time range string to { since, until } date strings.
 *
 * Accepts:
 *   - Presets: "last_7d", "last_30d", "last_90d", "this_month", "last_month"
 *   - Month:   "2026-01" → hele januar 2026
 *   - Range:   "2026-01-01:2026-01-31" → eksakt interval
 *   - Single:  "2026-01-15" → kun den dag
 */
function resolveDateRange(range: string): { since: string; until: string } {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Preset ranges
  switch (range) {
    case "last_7d":   { const d = new Date(now); d.setDate(now.getDate() - 7); return { since: d.toISOString().split("T")[0], until: today }; }
    case "last_30d":  { const d = new Date(now); d.setDate(now.getDate() - 30); return { since: d.toISOString().split("T")[0], until: today }; }
    case "last_90d":  { const d = new Date(now); d.setDate(now.getDate() - 90); return { since: d.toISOString().split("T")[0], until: today }; }
    case "this_month": { const d = new Date(now); d.setDate(1); return { since: d.toISOString().split("T")[0], until: today }; }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { since: s.toISOString().split("T")[0], until: e.toISOString().split("T")[0] };
    }
  }

  // "2026-01-01:2026-01-31" → explicit range
  if (range.includes(":")) {
    const [s, e] = range.split(":");
    return { since: s, until: e };
  }

  // "2026-01" → whole month
  if (/^\d{4}-\d{2}$/.test(range)) {
    const [y, m] = range.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { since: `${range}-01`, until: `${range}-${String(lastDay).padStart(2, "0")}` };
  }

  // "2026-01-15" → single day
  if (/^\d{4}-\d{2}-\d{2}$/.test(range)) {
    return { since: range, until: range };
  }

  // Fallback
  const d = new Date(now);
  d.setDate(now.getDate() - 30);
  return { since: d.toISOString().split("T")[0], until: today };
}

// Google Ads API enum lookups (numeric → label)
const GOOGLE_CAMPAIGN_STATUS: Record<string, string> = { "0": "UNSPECIFIED", "1": "UNKNOWN", "2": "ENABLED", "3": "PAUSED", "4": "REMOVED" };
const GOOGLE_MATCH_TYPE: Record<string, string> = { "0": "UNSPECIFIED", "2": "EXACT", "3": "PHRASE", "4": "BROAD", "6": "BROAD" };
const GOOGLE_CAMPAIGN_TYPE: Record<string, string> = { "2": "SEARCH", "3": "DISPLAY", "4": "SHOPPING", "6": "VIDEO", "8": "SMART", "9": "LOCAL", "10": "PMAX", "11": "LOCAL_SERVICES", "12": "DISCOVERY", "13": "APP", "14": "DEMAND_GEN" };
const GOOGLE_SEARCH_TERM_STATUS: Record<string, string> = { "0": "UNSPECIFIED", "2": "ADDED", "3": "EXCLUDED", "4": "ADDED_EXCLUDED", "5": "NONE" };
const GOOGLE_QS_RATING: Record<string, string> = { "2": "BELOW_AVERAGE", "3": "AVERAGE", "4": "ABOVE_AVERAGE" };

function googleEnum(map: Record<string, string>, val: any): string {
  const s = String(val ?? "");
  return map[s] || s;
}

function formatCurrency(v: number): string {
  return `${Math.round(v).toLocaleString("da-DK")} kr`;
}

function formatNum(v: number): string {
  return Math.round(v).toLocaleString("da-DK");
}
