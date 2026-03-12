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
    version: "2.0.0",
    description: "Neble+Rohde performance marketing MCP. 67 tools til Meta Ads, Klaviyo, Google Ads, Shopify, lead-analyse, cross-channel og rapporter. Alle data fra Supabase. Start med get_clients. Klaviyo ANALYSE: get_klaviyo_stored_campaigns/stored_flows/monthly. Meta: get_performance. Google: get_google_*. Rapporter: read_client_report, write_client_report.",
  });

  // ─── MCP Prompt: agency guide ────────────────────────────────────────────────

  server.prompt(
    "nr-agency-guide",
    "Komplet guide til N+R Agency MCP — tool-oversigt, workflows og regler. Kald dette FØRST i enhver samtale.",
    {},
    async () => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `# N+R Agency MCP — Instruktioner

Du er en performance marketing assistent for Neble+Rohde (N+R), et dansk bureau.
Du har adgang til N+R's MCP-server med live klientdata fra Supabase.

## Regler
- Alle data (Meta, Google, Klaviyo, Shopify, leads) ligger i Supabase — kald tools direkte.
- Start ALTID med get_clients for at finde klientnavnet (fuzzy match virker).
- Svar på dansk medmindre brugeren skriver engelsk.
- Gæt ALDRIG — brug det rigtige tool.

## Tools efter kanal

KLIENT: get_clients, get_brand_context, get_client_documents, get_agency_knowledge, get_data_sources, get_targets
META ADS: get_performance, get_campaigns, get_campaign_details, get_ad_sets, get_top_ads, get_creatives, get_ad_details, get_ad_image, get_daily_trend, get_country_breakdown, get_demographic_breakdown, get_age_gender_breakdown, get_placement_breakdown, get_hourly_data, compare_periods
KLAVIYO (analyse/Supabase): get_klaviyo_stored_campaigns, get_klaviyo_stored_flows, get_klaviyo_monthly, get_klaviyo_campaign_content
KLAVIYO (real-time/API): get_klaviyo_overview, get_klaviyo_flows, get_klaviyo_campaigns, get_klaviyo_revenue, get_klaviyo_lists, get_klaviyo_segments, get_klaviyo_metrics, get_klaviyo_health
GOOGLE: get_google_performance, get_google_campaigns, get_google_keywords, get_google_search_terms, get_google_shopping, get_google_geo, get_google_ad_groups, get_google_assets, get_google_monthly_comparison
LEADS/ECOM: get_leads, get_lead_cohorts, get_lead_orders, get_lead_campaign_breakdown, get_lead_unmatched, get_shopify_revenue
OVERBLIK: get_channel_overview, get_cross_client_overview, get_cross_channel, get_monthly_insights, compare_periods
RAPPORTER: read_client_report, write_client_report, list_client_reports, generate_ai_review
ADMIN: trigger_sync, trigger_backfill, trigger_source_sync, trigger_thumbnail_refresh, check_data_source_health, create_client, connect_google_ads, save_client_document

## Workflows
"Hvordan performer X?" → get_clients → get_performance + get_klaviyo_monthly + get_google_performance
"Vis Klaviyo flows" → get_clients → get_klaviyo_stored_flows
"Klaviyo analyse" → get_clients → get_klaviyo_monthly + get_klaviyo_stored_campaigns + get_klaviyo_stored_flows
"Bedste ads?" → get_clients → get_top_ads
"Sammenlign perioder" → get_clients → compare_periods`
        }
      }]
    })
  );

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
    "Hent aggregeret performance for en klient (spend, ROAS, purchases, reach). Kald get_brand_context først for at forstå klientens brand, målgruppe og strategi.",
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
        if (!s) return noData(client.name);

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
    "Top-performende annoncer for en klient sorteret efter ROAS eller spend. Kald get_brand_context først for at forstå klientens kreative strategi.",
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
        if (!ads.length) return noData(client.name, "annonce");

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

  // ─── Tool: get_brand_context ──────────────────────────────────────────────

  server.tool(
    "get_brand_context",
    "Hent KOMPLET brand-kontekst for en klient: profile (tone of voice, USP, målgruppe), brand research, VoC library, godkendt copy og strategi — PLUS N+R's Full Funnel metodik og analyse-frameworks. BRUG ALTID DETTE FØR analyse, content-produktion eller rådgivning for en klient.",
    {
      client_name: z.string().describe("Klientens navn (delvis match OK)"),
      include_agency_frameworks: z.boolean().default(true)
        .describe("Inkludér N+R's Full Funnel strategi og analyse-frameworks (default: true)"),
    },
    async ({ client_name, include_agency_frameworks }) => {
      const sb = getSupabase();

      const { data: clients } = await sb
        .from("clients")
        .select("id, name, slug, currency, meta_ad_account_id")
        .ilike("name", `%${client_name}%`)
        .limit(1);

      if (!clients?.length) {
        return { content: [{ type: "text" as const, text: `Ingen klient fundet: "${client_name}"` }] };
      }
      const client = clients[0];

      // Hent klient-docs
      const { data: docs } = await sb
        .from("client_documents")
        .select("doc_type, title, content, updated_at")
        .eq("client_id", client.id)
        .in("doc_type", ["overview", "research", "brief", "strategy", "history"])
        .order("doc_type")
        .order("updated_at", { ascending: false });

      // Hent N+R agency frameworks (fra Neble+Rohde klient)
      let agencyDocs: any[] = [];
      if (include_agency_frameworks && client.name !== "Neble+Rohde") {
        const { data: nrClients } = await sb
          .from("clients")
          .select("id")
          .ilike("name", "%Neble%Rohde%")
          .limit(1);

        if (nrClients?.length) {
          const { data: frameworks } = await sb
            .from("client_documents")
            .select("doc_type, title, content")
            .eq("client_id", nrClients[0].id)
            .eq("doc_type", "strategy")
            .in("title", [
              "N+R Full Funnel Strategi (FP → IM → IP → EC)",
              "The Brand Lifecycle (4 Stages)",
            ]);
          if (frameworks) agencyDocs = frameworks;
        }
      }

      if (!docs?.length && !agencyDocs.length) {
        return { content: [{ type: "text" as const, text: `Ingen brand-kontekst fundet for ${client.name}. Overvej at uploade profile, research og VoC via save_client_document.` }] };
      }

      // Gruppér klient-docs
      const groups: Record<string, any[]> = {};
      for (const d of (docs || [])) {
        if (!groups[d.doc_type]) groups[d.doc_type] = [];
        groups[d.doc_type].push(d);
      }

      const sectionOrder = ["overview", "research", "brief", "strategy", "history"];
      const sectionLabels: Record<string, string> = {
        overview: "Klient-profil (Tone of Voice, USP, målgruppe)",
        research: "Brand & Market Research + VoC",
        brief: "Godkendt Copy & Briefs",
        strategy: "Strategier & Flows",
        history: "Performance History & Learnings",
      };

      const sections: string[] = [
        `# ${client.name} — Brand-kontekst`,
        `*Valuta: ${client.currency || "DKK"} | Meta: ${client.meta_ad_account_id || "–"} | Opdateret: ${new Date().toISOString().split("T")[0]}*\n`,
      ];

      // Agency methodology first (so it frames the analysis)
      if (agencyDocs.length) {
        sections.push(`## N+R Metodik & Full Funnel Strategi\n`);
        sections.push(`*Analysér ALTID performance efter funnel-stadie: FP (Awareness) → IM (In-Market) → IP (Retargeting) → EC (Retention). Brug get_agency_knowledge for ekstra frameworks (VPC, Cialdini, analyse-metodik) når relevant.*\n`);
        for (const d of agencyDocs) {
          sections.push(`### ${d.title}`);
          sections.push(d.content);
          sections.push("");
        }
      }

      for (const type of sectionOrder) {
        const group = groups[type];
        if (!group?.length) continue;

        sections.push(`## ${sectionLabels[type] || type}\n`);
        for (const d of group) {
          sections.push(`### ${d.title}`);
          sections.push(d.content);
          sections.push("");
        }
      }

      sections.push(`\n---\n*Brug denne kontekst til at sikre brand-konsistens i analyser, copy og rådgivning. Analysér altid efter N+R Full Funnel: FP → IM → IP → EC. Tone, USP'er og målgruppe fra profile bør altid reflekteres.*`);

      return { content: [{ type: "text" as const, text: sections.join("\n") }] };
    }
  );

  // ─── Tool: get_agency_knowledge ──────────────────────────────────────────────

  server.tool(
    "get_agency_knowledge",
    "Hent N+R's samlede metodik: Full Funnel strategi (FP→IM→IP→EC), Brand Lifecycle, Value Proposition Canvas, Cialdini's 7 principper, marketing psykologi, analyse-frameworks (Meta, Google, Klaviyo), copy-frameworks (email, Meta, Google) og strategi-framework. Brug dette til at forstå HVORDAN N+R analyserer, positionerer brands og producerer content.",
    {
      framework: z.enum(["all", "full-funnel", "brand-lifecycle", "value-proposition-canvas", "cialdini", "marketing-psychology", "performance-analysis", "meta-analysis", "google-analysis", "klaviyo-analysis", "brand-strategy", "email-copy", "meta-copy", "google-copy", "market-research"])
        .default("all")
        .describe("Specifikt framework (all = hele metodik)"),
    },
    async ({ framework }) => {
      const sb = getSupabase();

      // Find Neble+Rohde client (holds agency knowledge)
      const { data: nrClients } = await sb
        .from("clients")
        .select("id")
        .ilike("name", "%Neble%Rohde%")
        .limit(1);

      if (!nrClients?.length) {
        return { content: [{ type: "text" as const, text: "Neble+Rohde klient ikke fundet i Supabase." }] };
      }

      const titleMap: Record<string, string> = {
        "full-funnel": "N+R Full Funnel Strategi (FP → IM → IP → EC)",
        "brand-lifecycle": "The Brand Lifecycle (4 Stages)",
        "value-proposition-canvas": "Value Proposition Canvas",
        "cialdini": "Cialdini's 7 Principper for Influence",
        "marketing-psychology": "Marketing Psychology & Mental Models",
        "performance-analysis": "N+R Performance Analysis Methodology",
        "meta-analysis": "N+R Analyse Framework – Meta Ads",
        "google-analysis": "N+R Analyse Framework – Google Ads",
        "klaviyo-analysis": "N+R Analyse Framework – Klaviyo",
        "brand-strategy": "N+R Strategi Framework – Brand & Marketing",
        "email-copy": "N+R Copy Framework – Email",
        "meta-copy": "N+R Copy Framework – Meta Ads",
        "google-copy": "N+R Copy Framework – Google Ads",
        "market-research": "N+R Research Framework – Brand & Market",
      };

      let query = sb
        .from("client_documents")
        .select("title, content, updated_at")
        .eq("client_id", nrClients[0].id)
        .eq("doc_type", "strategy")
        .eq("created_by", "agency-knowledge");

      if (framework !== "all") {
        const title = titleMap[framework];
        if (title) query = query.eq("title", title);
      }

      const { data: docs, error } = await query.order("title");
      if (error) return { content: [{ type: "text" as const, text: `Fejl: ${error.message}` }] };

      if (!docs?.length) {
        return { content: [{ type: "text" as const, text: `Ingen agency knowledge fundet${framework !== "all" ? ` for "${framework}"` : ""}.` }] };
      }

      const sections = [
        `# N+R Agency Knowledge${framework !== "all" ? ` — ${framework}` : ""}`,
        `*${docs.length} framework${docs.length === 1 ? "" : "s"} | Opdateret: ${docs[0].updated_at?.split("T")[0]}*\n`,
      ];

      for (const d of docs) {
        sections.push(`## ${d.title}\n`);
        sections.push(d.content);
        sections.push("");
      }

      return { content: [{ type: "text" as const, text: sections.join("\n") }] };
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
        if (!rows.length) return noData(client.name, breakdown);

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
    "Sammenlign performance mellem to perioder (fx denne måned vs forrige). Kald get_brand_context først for klient-kontekst.",
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

        if (!a && !b) return noData(client.name);

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
        if (!rows.length) return noData(client.name, "land");

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
        if (!cohorts.length) return noData(client.name, "lead cohort");

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

      if (!data?.length) return noData(client.name, "time");

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
      if (!data?.length) return noData(client.name, "Google Ads");

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
        return noData(client.name, "kanal");
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
      if (!data?.length) return noData(client.name, "Shopify");

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
      if (!data?.length) return noData(client.name, "keyword");

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
      if (!data?.length) return noData(client.name, "search term");

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

  // ─── Tool: get_klaviyo_campaign_content ──────────────────────────────────

  server.tool(
    "get_klaviyo_campaign_content",
    "Detaljeret kampagneindhold: subject line, preview text, afsender, links og performance. Brug denne til at analysere en specifik kampagnes indhold.",
    {
      client_name: z.string().describe("Klientens navn"),
      campaign_name: z.string().describe("Kampagnenavn (delvis match OK)"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      include_html: z.boolean().default(false).describe("Inkluder fuld email HTML body. Default false. Sæt true kun når layout/design skal analyseres."),
    },
    async ({ client_name, campaign_name, time_range, include_html }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { since, until } = resolveDateRange(time_range);

      // Build list of snapshot_months that overlap the date range
      const months: string[] = [];
      const startDate = new Date(since + "T00:00:00Z");
      const endDate = new Date(until + "T00:00:00Z");
      const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      while (cursor <= endDate) {
        const m = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        months.push(m);
        cursor.setMonth(cursor.getMonth() + 1);
      }

      // Select columns — omit email_html unless requested
      const selectCols = [
        "id", "klaviyo_campaign_id", "campaign_name", "subject_line", "preview_text",
        "from_email", "from_label", "send_time", "channel", "tag", "ai_tag", "email_links",
        "received", "opened", "clicked", "conversions", "revenue", "unsubscribes",
        "open_rate", "click_rate", "ctor", "conversion_rate", "unsub_rate", "revenue_per_email",
        ...(include_html ? ["email_html"] : []),
      ].join(", ");

      const { data, error: dbErr } = await sb
        .from("klaviyo_campaign_snapshots")
        .select(selectCols)
        .eq("client_id", client.id)
        .ilike("campaign_name", `%${campaign_name}%`)
        .in("snapshot_month", months)
        .order("send_time", { ascending: false })
        .limit(5);

      if (dbErr) return err(`Supabase: ${dbErr.message}`);
      if (!data || data.length === 0) return text(`Ingen campaigns matchede "${campaign_name}" for ${client.name} i perioden ${time_range}`);

      const campaigns = data.map((c: any) => ({
        id: c.id,
        klaviyo_campaign_id: c.klaviyo_campaign_id,
        campaign_name: c.campaign_name,
        send_time: c.send_time,
        channel: c.channel,
        tag: c.tag,
        ai_tag: c.ai_tag,
        content: {
          subject_line: c.subject_line,
          preview_text: c.preview_text,
          from_email: c.from_email,
          from_label: c.from_label,
          links: c.email_links || [],
          link_count: Array.isArray(c.email_links) ? c.email_links.length : 0,
          html: include_html ? c.email_html : null,
        },
        performance: {
          received: c.received,
          opened: c.opened,
          clicked: c.clicked,
          conversions: c.conversions,
          revenue: parseFloat(c.revenue) || 0,
          unsubscribes: c.unsubscribes,
          open_rate: parseFloat(c.open_rate) || 0,
          click_rate: parseFloat(c.click_rate) || 0,
          ctor: parseFloat(c.ctor) || 0,
          conversion_rate: parseFloat(c.conversion_rate) || 0,
          unsub_rate: parseFloat(c.unsub_rate) || 0,
          revenue_per_email: parseFloat(c.revenue_per_email) || 0,
        },
      }));

      const result = {
        campaigns,
        match_count: campaigns.length,
        note: include_html
          ? "HTML body inkluderet. Brug dette til layout/design-analyse."
          : "Showing top 5 matches by send_time. Set include_html=true for full email body.",
      };

      return text(JSON.stringify(result, null, 2));
    }
  );

  // ─── Tool: get_klaviyo_stored_campaigns ──────────────────────────────────

  server.tool(
    "get_klaviyo_stored_campaigns",
    "📊 ANALYSE: Klaviyo kampagner fra Supabase med tag-gruppering, subject lines, CTOR, revenue. Brug DENNE til analyse — ikke get_klaviyo_campaigns (som kalder API direkte).",
    {
      client_name: z.string().describe("Klientens navn"),
      month: z.string().optional().describe("Måned i YYYY-MM format. Default: seneste tilgængelige."),
    },
    async ({ client_name, month }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      // Find latest month if not specified
      let targetMonth = month;
      if (!targetMonth) {
        const { data: latest } = await sb
          .from("klaviyo_campaign_snapshots")
          .select("snapshot_month")
          .eq("client_id", client.id)
          .order("snapshot_month", { ascending: false })
          .limit(1);
        if (!latest?.length) return text(`Ingen Klaviyo kampagnedata i Supabase for ${client.name}. Kør sync via dashboard (/settings/data-sources → Klaviyo → Sync).`);
        targetMonth = latest[0].snapshot_month;
      }

      const { data, error: dbErr } = await sb
        .from("klaviyo_campaign_snapshots")
        .select("campaign_name, send_time, subject_line, received, opened, clicked, conversions, revenue, open_rate, click_rate, ctor, conversion_rate, unsub_rate, revenue_per_email, tag, ai_tag")
        .eq("client_id", client.id)
        .eq("snapshot_month", targetMonth)
        .order("revenue", { ascending: false });

      if (dbErr) return err(`Supabase: ${dbErr.message}`);
      if (!data?.length) return text(`Ingen kampagner for ${client.name} i ${targetMonth}. Kør Klaviyo sync.`);

      // Tag-grouped summary
      const tagMap = new Map<string, { count: number; received: number; revenue: number; clicked: number; opened: number }>();
      for (const c of data as any[]) {
        const tag = c.tag || c.ai_tag || "untagged";
        const entry = tagMap.get(tag) || { count: 0, received: 0, revenue: 0, clicked: 0, opened: 0 };
        entry.count++;
        entry.received += c.received || 0;
        entry.revenue += parseFloat(c.revenue) || 0;
        entry.clicked += c.clicked || 0;
        entry.opened += c.opened || 0;
        tagMap.set(tag, entry);
      }

      const lines = [
        `## ${client.name} – Klaviyo Kampagner (${targetMonth}) [Supabase]`,
        ``,
        `### Tag-grupperet`,
        `| Tag | Antal | Sendt | Revenue | CTOR |`,
        `|-----|-------|-------|---------|------|`,
        ...[...tagMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([tag, v]) =>
          `| ${tag} | ${v.count} | ${formatNum(v.received)} | ${formatCurrency(v.revenue)} | ${v.opened > 0 ? ((v.clicked / v.opened) * 100).toFixed(1) + "%" : "–"} |`
        ),
        ``,
        `### Top kampagner`,
        `| Kampagne | Send dato | Subject | Sendt | CTOR | Revenue |`,
        `|----------|-----------|---------|-------|------|---------|`,
        ...(data as any[]).slice(0, 15).map((c: any) => {
          const sendDate = c.send_time ? c.send_time.split("T")[0] : "–";
          const subj = (c.subject_line || "–").slice(0, 35);
          return `| ${(c.campaign_name || "–").slice(0, 30)} | ${sendDate} | ${subj} | ${formatNum(c.received)} | ${parseFloat(c.ctor)?.toFixed(1) || "–"}% | ${formatCurrency(parseFloat(c.revenue) || 0)} |`;
        }),
        ``,
        `**${data.length} kampagner** i ${targetMonth}. Data fra Supabase (synket dagligt).`,
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_klaviyo_stored_flows ────────────────────────────────────

  server.tool(
    "get_klaviyo_stored_flows",
    "📊 ANALYSE: Klaviyo flows fra Supabase med revenue share og MoM. Brug DENNE til analyse — ikke get_klaviyo_flows (som kalder API direkte).",
    {
      client_name: z.string().describe("Klientens navn"),
      month: z.string().optional().describe("Måned i YYYY-MM format. Default: seneste tilgængelige."),
    },
    async ({ client_name, month }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let targetMonth = month;
      if (!targetMonth) {
        const { data: latest } = await sb
          .from("klaviyo_flow_snapshots")
          .select("snapshot_month")
          .eq("client_id", client.id)
          .order("snapshot_month", { ascending: false })
          .limit(1);
        if (!latest?.length) return text(`Ingen Klaviyo flow-data i Supabase for ${client.name}. Kør sync via dashboard.`);
        targetMonth = latest[0].snapshot_month;
      }

      const { data, error: dbErr } = await sb
        .from("klaviyo_flow_snapshots")
        .select("flow_name, status, received, opened, clicked, conversions, revenue, open_rate, click_rate, ctor, conversion_rate, unsub_rate, revenue_per_email, revenue_share")
        .eq("client_id", client.id)
        .eq("snapshot_month", targetMonth)
        .order("revenue", { ascending: false });

      if (dbErr) return err(`Supabase: ${dbErr.message}`);
      if (!data?.length) return text(`Ingen flows for ${client.name} i ${targetMonth}. Kør Klaviyo sync.`);

      const totalRevenue = (data as any[]).reduce((sum: number, f: any) => sum + (parseFloat(f.revenue) || 0), 0);

      const lines = [
        `## ${client.name} – Klaviyo Flows (${targetMonth}) [Supabase]`,
        ``,
        `| Flow | Status | Sendt | OR | CTOR | Revenue | Rev Share |`,
        `|------|--------|-------|----|----- |---------|-----------|`,
        ...(data as any[]).map((f: any) =>
          `| ${(f.flow_name || "–").slice(0, 35)} | ${f.status} | ${formatNum(f.received)} | ${parseFloat(f.open_rate)?.toFixed(1) || "–"}% | ${parseFloat(f.ctor)?.toFixed(1) || "–"}% | ${formatCurrency(parseFloat(f.revenue) || 0)} | ${parseFloat(f.revenue_share)?.toFixed(1) || "–"}% |`
        ),
        ``,
        `**Total flow revenue:** ${formatCurrency(totalRevenue)}`,
        `Data fra Supabase (synket dagligt).`,
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_klaviyo_monthly ─────────────────────────────────────────

  server.tool(
    "get_klaviyo_monthly",
    "📊 ANALYSE: Klaviyo månedlige aggregater fra Supabase. Revenue, OR, CTOR, campaigns sendt. Flow vs campaign split. MoM trends.",
    {
      client_name: z.string().describe("Klientens navn"),
      months: z.number().default(6).describe("Antal måneder at hente (default: 6)"),
      source_type: z.enum(["total", "campaign", "flow"]).default("total").describe("Filter: total (alt), campaign (kun kampagner), flow (kun flows)"),
    },
    async ({ client_name, months: monthCount, source_type }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      const { data, error: dbErr } = await sb
        .from("klaviyo_monthly_aggregates")
        .select("month, source_type, tag, campaigns_sent, total_received, total_opened, total_clicked, total_conversions, total_revenue, avg_open_rate, avg_click_rate, avg_ctor, avg_conversion_rate")
        .eq("client_id", client.id)
        .eq("source_type", source_type)
        .eq("tag", source_type === "campaign" ? "__all__" : "__none__")
        .order("month", { ascending: false })
        .limit(monthCount);

      if (dbErr) return err(`Supabase: ${dbErr.message}`);
      if (!data?.length) return text(`Ingen Klaviyo månedlige aggregater for ${client.name}. Kør sync via dashboard (/settings/data-sources → Klaviyo → Sync).`);

      // Check for sync issues (all revenue = 0)
      const allZeroRevenue = (data as any[]).every((d: any) => !d.total_revenue || parseFloat(d.total_revenue) === 0);
      const syncWarning = allZeroRevenue ? "\n⚠️ Revenue er 0 for alle måneder — dette er sandsynligvis en SYNC-FEJL. Kør Klaviyo sync via dashboard.\n" : "";

      const lines = [
        `## ${client.name} – Klaviyo Månedsoverblik (${source_type}) [Supabase]`,
        syncWarning,
        `| Måned | Campaigns | Sendt | Revenue | OR | CTOR | Conv Rate |`,
        `|-------|-----------|-------|---------|----|----- |-----------|`,
        ...(data as any[]).reverse().map((d: any) =>
          `| ${d.month} | ${d.campaigns_sent || "–"} | ${formatNum(d.total_received)} | ${formatCurrency(parseFloat(d.total_revenue) || 0)} | ${parseFloat(d.avg_open_rate)?.toFixed(1) || "–"}% | ${parseFloat(d.avg_ctor)?.toFixed(1) || "–"}% | ${parseFloat(d.avg_conversion_rate)?.toFixed(1) || "–"}% |`
        ),
        ``,
        `Data fra Supabase (synket dagligt). Rates er weighted by received.`,
      ];

      // Add MoM if we have 2+ months
      if (data.length >= 2) {
        const curr = data[0] as any;
        const prev = data[1] as any;
        const currRev = parseFloat(curr.total_revenue) || 0;
        const prevRev = parseFloat(prev.total_revenue) || 0;
        const revChange = prevRev > 0 ? ((currRev - prevRev) / prevRev * 100).toFixed(1) : "–";
        lines.push(``, `**MoM (${prev.month} → ${curr.month}):** Revenue ${revChange}%`);
      }

      return text(lines.join("\n"));
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // META API TOOLS (live queries against Meta Graph API)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Tool: get_meta_ad_accounts ───────────────────────────────────────────
  // Lists all Meta ad accounts accessible by a client's access token.

  server.tool(
    "get_meta_ad_accounts",
    "List alle Meta ad accounts som en klients access token har adgang til. Nyttigt til at se hvilke konti der er tilgængelige, og matche dem med klienter i systemet.",
    {
      client_name: z.string().describe("Klientnavn (fuzzy match) — bruger denne klients Meta access token"),
    },
    async ({ client_name }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);

        // Get token
        const { data: clientData } = await sb.from("clients").select("meta_access_token, meta_ad_account_id").eq("id", client.id).single();
        if (!clientData?.meta_access_token) return err(`${client.name} har ingen Meta access token.`);

        const token = clientData.meta_access_token;

        // Fetch all ad accounts (paginate)
        const accounts: any[] = [];
        let url: string | null = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency,timezone_name,amount_spent&limit=100&access_token=${token}`;

        while (url && accounts.length < 200) {
          const resp: Response = await fetch(url);
          const json: any = await resp.json();
          if (json.error) return err(`Meta API: ${json.error.message}`);
          accounts.push(...(json.data || []));
          url = json.paging?.next || null;
        }

        if (!accounts.length) return text(`Ingen ad accounts fundet for ${client.name}'s token.`);

        // Get all our clients to mark which are tracked
        const { data: ourClients } = await sb.from("clients").select("meta_ad_account_id, name").eq("is_active", true);
        const trackedAccounts = new Map<string, string>();
        ourClients?.forEach(c => { if (c.meta_ad_account_id) trackedAccounts.set(c.meta_ad_account_id, c.name); });

        const statusMap: Record<number, string> = { 1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_REVIEW", 8: "PENDING_SETTLEMENT", 9: "GRACE_PERIOD", 100: "PENDING_CLOSURE", 101: "CLOSED" };

        const lines: string[] = [
          `## Meta Ad Accounts (via ${client.name}'s token)\n`,
          `| Konto | Status | Valuta | Lifetime spend | I system? |`,
          `|-------|--------|--------|----------------|-----------|`,
        ];

        // Sort: tracked first, then by spend
        const sorted = accounts.sort((a, b) => {
          const aTracked = trackedAccounts.has(a.id) ? 1 : 0;
          const bTracked = trackedAccounts.has(b.id) ? 1 : 0;
          if (aTracked !== bTracked) return bTracked - aTracked;
          return parseInt(b.amount_spent || "0") - parseInt(a.amount_spent || "0");
        });

        let trackedCount = 0;
        for (const a of sorted) {
          const status = statusMap[a.account_status] || String(a.account_status);
          const spent = (parseInt(a.amount_spent || "0") / 100).toLocaleString("da-DK");
          const isTracked = trackedAccounts.get(a.id);
          if (isTracked) trackedCount++;
          const trackLabel = isTracked ? `✓ ${isTracked}` : "–";
          const name = (a.name || "–").length > 35 ? (a.name || "–").slice(0, 32) + "…" : (a.name || "–");
          lines.push(`| ${name} (${a.id}) | ${status} | ${a.currency} | ${spent} ${a.currency} | ${trackLabel} |`);
        }

        lines.push(`\n**Total:** ${accounts.length} konti | **I systemet:** ${trackedCount} | **Ikke tracked:** ${accounts.length - trackedCount}`);

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVANCED ANALYTICS TOOLS (replaces Pipedream read-only tools)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Tool: get_ad_insights ────────────────────────────────────────────────
  // Flexible insight queries — any level, any source, any metric.

  server.tool(
    "get_ad_insights",
    "Fleksibel insights-query: vælg level (ad/adset/campaign/account), source (meta/google_ads/all), og metrics. Aggregerer over tidsperiode. Erstatter Pipedreams get_insights.",
    {
      client_name: z.string().describe("Klientnavn (fuzzy match)"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      level: z.enum(["ad", "adset", "campaign", "account"]).default("campaign").describe("Aggregeringsniveau"),
      source: z.enum(["meta", "google_ads", "all"]).default("all").describe("Datakilde"),
      campaign_id: z.string().optional().describe("Filtrer til specifik campaign (intern ID)"),
      adset_id: z.string().optional().describe("Filtrer til specifik ad set (intern ID)"),
      limit: z.number().default(50).describe("Max antal rækker"),
      sort_by: z.enum(["spend", "purchases", "roas", "impressions", "clicks"]).default("spend").describe("Sortering"),
    },
    async ({ client_name, time_range, level, source, campaign_id, adset_id, limit, sort_by }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);
        const { since, until } = resolveDateRange(time_range);

        let query = sb
          .from("insights")
          .select("campaign_id, ad_set_id, ad_id, date, spend, impressions, clicks, purchases, purchase_value, ctr, cpc, cpm, cpa, roas, reach, link_clicks, video_views")
          .eq("client_id", client.id)
          .gte("date", since)
          .lte("date", until);

        if (source !== "all") query = query.eq("source", source);
        if (campaign_id) query = query.eq("campaign_id", campaign_id);
        if (adset_id) query = query.eq("ad_set_id", adset_id);

        const { data, error: qErr } = await query;
        if (qErr) return err(qErr.message);
        if (!data?.length) return noData(client.name, "insights");

        // Aggregate by level
        type Agg = { spend: number; impressions: number; clicks: number; purchases: number; revenue: number; reach: number; link_clicks: number; video_views: number; rows: number };
        const groups = new Map<string, Agg & { label: string }>();

        for (const r of data) {
          let key: string;
          if (level === "account") key = "account";
          else if (level === "campaign") key = r.campaign_id || "unknown";
          else if (level === "adset") key = r.ad_set_id || r.campaign_id || "unknown";
          else key = r.ad_id || r.ad_set_id || "unknown";

          if (!groups.has(key)) groups.set(key, { label: key, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, reach: 0, link_clicks: 0, video_views: 0, rows: 0 });
          const g = groups.get(key)!;
          g.spend += r.spend || 0;
          g.impressions += r.impressions || 0;
          g.clicks += r.clicks || 0;
          g.purchases += r.purchases || 0;
          g.revenue += r.purchase_value || 0;
          g.reach += r.reach || 0;
          g.link_clicks += r.link_clicks || 0;
          g.video_views += r.video_views || 0;
          g.rows++;
        }

        // Fetch names for campaign/adset/ad IDs
        const ids = [...groups.keys()].filter(k => k !== "account" && k !== "unknown");
        let nameMap = new Map<string, string>();

        if (level === "campaign" && ids.length) {
          const { data: camps } = await sb.from("campaigns").select("id, name").in("id", ids);
          camps?.forEach(c => nameMap.set(c.id, c.name));
        } else if (level === "adset" && ids.length) {
          const { data: sets } = await sb.from("ad_sets").select("id, name").in("id", ids);
          sets?.forEach(s => nameMap.set(s.id, s.name));
        } else if (level === "ad" && ids.length) {
          const { data: ads } = await sb.from("ads").select("id, name").in("id", ids.slice(0, 100));
          ads?.forEach(a => nameMap.set(a.id, a.name));
        }

        // Sort
        const sorted = [...groups.values()].sort((a, b) => {
          if (sort_by === "roas") return (b.revenue / (b.spend || 1)) - (a.revenue / (a.spend || 1));
          return (b as any)[sort_by] - (a as any)[sort_by];
        }).slice(0, limit);

        const lines: string[] = [`## ${client.name} – Insights (${level}) | ${since} → ${until}\n`];

        if (level === "account") {
          const a = sorted[0];
          const roas = a.spend > 0 ? (a.revenue / a.spend).toFixed(2) : "–";
          lines.push(
            `| Metric | Værdi |`,
            `|--------|-------|`,
            `| Spend | ${formatCurrency(a.spend)} |`,
            `| Impressions | ${formatNum(a.impressions)} |`,
            `| Clicks | ${formatNum(a.clicks)} |`,
            `| Purchases | ${formatNum(a.purchases)} |`,
            `| Revenue | ${formatCurrency(a.revenue)} |`,
            `| ROAS | ${roas}x |`,
            `| CTR | ${a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(2) : "–"}% |`,
            `| CPA | ${a.purchases > 0 ? formatCurrency(a.spend / a.purchases) : "–"} |`,
          );
        } else {
          lines.push(`| Navn | Spend | Impr. | Clicks | Køb | Revenue | ROAS |`);
          lines.push(`|------|-------|-------|--------|-----|---------|------|`);
          for (const g of sorted) {
            const name = nameMap.get(g.label) || g.label;
            const roas = g.spend > 0 ? (g.revenue / g.spend).toFixed(2) + "x" : "–";
            const shortName = name.length > 40 ? name.slice(0, 37) + "…" : name;
            lines.push(`| ${shortName} | ${formatCurrency(g.spend)} | ${formatNum(g.impressions)} | ${formatNum(g.clicks)} | ${formatNum(g.purchases)} | ${formatCurrency(g.revenue)} | ${roas} |`);
          }
        }

        lines.push(`\n**Kilde:** ${source === "all" ? "Meta + Google" : source} | **Rækker:** ${data.length} | **Grupper:** ${groups.size}`);
        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_daily_trend ────────────────────────────────────────────────
  // Day-by-day performance for trend analysis.

  server.tool(
    "get_daily_trend",
    "Daglig trend: spend, impressions, clicks, purchases, revenue per dag. Perfekt til at spotte trends og anomalier.",
    {
      client_name: z.string().describe("Klientnavn (fuzzy match)"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      source: z.enum(["meta", "google_ads", "all"]).default("all").describe("Datakilde"),
      campaign_id: z.string().optional().describe("Filtrer til specifik campaign"),
    },
    async ({ client_name, time_range, source, campaign_id }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);
        const { since, until } = resolveDateRange(time_range);

        let query = sb
          .from("insights")
          .select("date, spend, impressions, clicks, purchases, purchase_value")
          .eq("client_id", client.id)
          .gte("date", since)
          .lte("date", until);

        if (source !== "all") query = query.eq("source", source);
        if (campaign_id) query = query.eq("campaign_id", campaign_id);

        const { data, error: qErr } = await query;
        if (qErr) return err(qErr.message);
        if (!data?.length) return noData(client.name);

        // Aggregate per day
        const days = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number; revenue: number }>();
        for (const r of data) {
          const d = r.date;
          if (!days.has(d)) days.set(d, { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 });
          const g = days.get(d)!;
          g.spend += r.spend || 0;
          g.impressions += r.impressions || 0;
          g.clicks += r.clicks || 0;
          g.purchases += r.purchases || 0;
          g.revenue += r.purchase_value || 0;
        }

        const sorted = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const totals = { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
        sorted.forEach(([, d]) => { totals.spend += d.spend; totals.impressions += d.impressions; totals.clicks += d.clicks; totals.purchases += d.purchases; totals.revenue += d.revenue; });

        const lines: string[] = [
          `## ${client.name} – Daglig trend | ${since} → ${until}\n`,
          `| Dato | Spend | Impr. | Clicks | Køb | Revenue | ROAS |`,
          `|------|-------|-------|--------|-----|---------|------|`,
        ];

        for (const [date, d] of sorted) {
          const roas = d.spend > 0 ? (d.revenue / d.spend).toFixed(2) + "x" : "–";
          lines.push(`| ${date} | ${formatCurrency(d.spend)} | ${formatNum(d.impressions)} | ${formatNum(d.clicks)} | ${formatNum(d.purchases)} | ${formatCurrency(d.revenue)} | ${roas} |`);
        }

        const avgRoas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(2) : "–";
        lines.push(`| **Total** | **${formatCurrency(totals.spend)}** | **${formatNum(totals.impressions)}** | **${formatNum(totals.clicks)}** | **${formatNum(totals.purchases)}** | **${formatCurrency(totals.revenue)}** | **${avgRoas}x** |`);
        lines.push(`\n**Dage:** ${sorted.length} | **Gns. dagligt spend:** ${formatCurrency(totals.spend / (sorted.length || 1))}`);

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_age_gender_breakdown ───────────────────────────────────────
  // Demographic breakdown from synced data.

  server.tool(
    "get_age_gender_breakdown",
    "Alder/køn-breakdown: spend, impressions, clicks, purchases, revenue fordelt på aldersgrupper og køn.",
    {
      client_name: z.string().describe("Klientnavn (fuzzy match)"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      group_by: z.enum(["age", "gender", "age_gender"]).default("age").describe("Grupperingsdimension"),
    },
    async ({ client_name, time_range, group_by }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);
        const { since, until } = resolveDateRange(time_range);

        const { data, error: qErr } = await sb
          .from("demographic_insights")
          .select("age_range, gender, spend, impressions, clicks, purchases, revenue")
          .eq("client_id", client.id)
          .gte("date", since)
          .lte("date", until)
          .neq("age_range", "all")
          .neq("gender", "all");

        if (qErr) return err(qErr.message);
        if (!data?.length) return noData(client.name, "demografisk");

        type Agg = { spend: number; impressions: number; clicks: number; purchases: number; revenue: number };
        const groups = new Map<string, Agg>();

        for (const r of data) {
          let key: string;
          if (group_by === "age") key = r.age_range;
          else if (group_by === "gender") key = r.gender;
          else key = `${r.age_range} / ${r.gender}`;

          if (!groups.has(key)) groups.set(key, { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 });
          const g = groups.get(key)!;
          g.spend += r.spend || 0;
          g.impressions += r.impressions || 0;
          g.clicks += r.clicks || 0;
          g.purchases += r.purchases || 0;
          g.revenue += r.revenue || 0;
        }

        const totalSpend = [...groups.values()].reduce((s, g) => s + g.spend, 0);
        const sorted = [...groups.entries()].sort((a, b) => b[1].spend - a[1].spend);

        const lines: string[] = [
          `## ${client.name} – ${group_by === "age" ? "Aldersfordeling" : group_by === "gender" ? "Kønsfordeling" : "Alder × Køn"} | ${since} → ${until}\n`,
          `| ${group_by === "gender" ? "Køn" : group_by === "age" ? "Alder" : "Segment"} | Spend | % | Impr. | Clicks | Køb | Revenue | ROAS |`,
          `|---------|-------|---|-------|--------|-----|---------|------|`,
        ];

        for (const [key, g] of sorted) {
          const pct = totalSpend > 0 ? ((g.spend / totalSpend) * 100).toFixed(1) : "0";
          const roas = g.spend > 0 ? (g.revenue / g.spend).toFixed(2) + "x" : "–";
          lines.push(`| ${key} | ${formatCurrency(g.spend)} | ${pct}% | ${formatNum(g.impressions)} | ${formatNum(g.clicks)} | ${formatNum(g.purchases)} | ${formatCurrency(g.revenue)} | ${roas} |`);
        }

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_placement_breakdown ────────────────────────────────────────
  // Platform/placement/device breakdown.

  server.tool(
    "get_placement_breakdown",
    "Platform/placement/device-breakdown: spend-fordeling på tværs af Facebook, Instagram, Audience Network, Messenger + placements (feed, stories, reels).",
    {
      client_name: z.string().describe("Klientnavn (fuzzy match)"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      group_by: z.enum(["platform", "placement", "device"]).default("platform").describe("Grupperingsdimension"),
    },
    async ({ client_name, time_range, group_by }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);
        const { since, until } = resolveDateRange(time_range);

        const { data, error: qErr } = await sb
          .from("placement_insights")
          .select("platform, placement, device_platform, spend, impressions, clicks")
          .eq("client_id", client.id)
          .gte("date", since)
          .lte("date", until);

        if (qErr) return err(qErr.message);
        if (!data?.length) return noData(client.name, "placement");

        type Agg = { spend: number; impressions: number; clicks: number };
        const groups = new Map<string, Agg>();

        for (const r of data) {
          let key: string;
          if (group_by === "platform") key = r.platform || "unknown";
          else if (group_by === "placement") key = `${r.platform}/${r.placement}` || "unknown";
          else key = r.device_platform || "unknown";

          if (!groups.has(key)) groups.set(key, { spend: 0, impressions: 0, clicks: 0 });
          const g = groups.get(key)!;
          g.spend += r.spend || 0;
          g.impressions += r.impressions || 0;
          g.clicks += r.clicks || 0;
        }

        const totalSpend = [...groups.values()].reduce((s, g) => s + g.spend, 0);
        const sorted = [...groups.entries()].sort((a, b) => b[1].spend - a[1].spend);

        const dimLabel = group_by === "platform" ? "Platform" : group_by === "placement" ? "Placement" : "Device";
        const lines: string[] = [
          `## ${client.name} – ${dimLabel}-fordeling | ${since} → ${until}\n`,
          `| ${dimLabel} | Spend | % | Impr. | Clicks | CTR |`,
          `|------------|-------|---|-------|--------|-----|`,
        ];

        for (const [key, g] of sorted) {
          const pct = totalSpend > 0 ? ((g.spend / totalSpend) * 100).toFixed(1) : "0";
          const ctr = g.impressions > 0 ? ((g.clicks / g.impressions) * 100).toFixed(2) : "–";
          lines.push(`| ${key} | ${formatCurrency(g.spend)} | ${pct}% | ${formatNum(g.impressions)} | ${formatNum(g.clicks)} | ${ctr}% |`);
        }

        lines.push(`\n*Note: Placement-data inkluderer kun spend/impressions/clicks (Meta API limitation — ingen konverteringsdata ved placement breakdown)*`);
        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_ad_details ─────────────────────────────────────────────────
  // Full ad details with creative info.

  server.tool(
    "get_ad_details",
    "Detaljer for specifikke ads: navn, status, creative (headline, body, CTA, thumbnail), og performance. Søg på ad-navn eller ID.",
    {
      client_name: z.string().describe("Klientnavn (fuzzy match)"),
      search: z.string().optional().describe("Søg i ad-navne (fuzzy match)"),
      campaign_id: z.string().optional().describe("Filtrer til specifik campaign"),
      status: z.enum(["ACTIVE", "PAUSED", "all"]).default("all").describe("Status-filter"),
      limit: z.number().default(20).describe("Max antal ads"),
    },
    async ({ client_name, search, campaign_id, status, limit: maxAds }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);

        let query = sb
          .from("ads")
          .select("id, name, status, meta_ad_id, platform_ad_id, source, campaign_id, ad_set_id, creative_id")
          .eq("client_id", client.id)
          .order("updated_at", { ascending: false })
          .limit(maxAds);

        if (status !== "all") query = query.eq("status", status);
        if (campaign_id) query = query.eq("campaign_id", campaign_id);

        const { data: ads, error: qErr } = await query;
        if (qErr) return err(qErr.message);
        if (!ads?.length) return text(`Ingen ads fundet for ${client.name}`);

        // Filter by search term
        let filtered = ads;
        if (search) {
          const s = search.toLowerCase();
          filtered = ads.filter(a => a.name?.toLowerCase().includes(s));
          if (!filtered.length) return text(`Ingen ads matcher "${search}" for ${client.name}`);
        }

        // Fetch creatives for these ads
        const creativeIds = [...new Set(filtered.map(a => a.creative_id).filter(Boolean))];
        let creativeMap = new Map<string, any>();
        if (creativeIds.length) {
          const { data: creatives } = await sb.from("creatives").select("id, type, thumbnail_url, headline, body, cta_type, link_url").in("id", creativeIds);
          creatives?.forEach(c => creativeMap.set(c.id, c));
        }

        const lines: string[] = [`## ${client.name} – Ad Details\n`];

        for (const ad of filtered) {
          const cr = ad.creative_id ? creativeMap.get(ad.creative_id) : null;
          lines.push(`### ${ad.name || "Unnamed"}`);
          lines.push(`- **Status:** ${ad.status} | **Source:** ${ad.source} | **ID:** ${ad.meta_ad_id || ad.platform_ad_id}`);
          if (cr) {
            lines.push(`- **Type:** ${cr.type || "–"} | **CTA:** ${cr.cta_type || "–"}`);
            if (cr.headline) lines.push(`- **Headline:** ${cr.headline}`);
            if (cr.body) lines.push(`- **Body:** ${cr.body.length > 200 ? cr.body.slice(0, 197) + "…" : cr.body}`);
            if (cr.link_url) lines.push(`- **URL:** ${cr.link_url}`);
            if (cr.thumbnail_url) lines.push(`- **Thumbnail:** ${cr.thumbnail_url}`);
          }
          lines.push("");
        }

        lines.push(`**Viser:** ${filtered.length} ads`);
        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_cross_client_overview ──────────────────────────────────────
  // Multi-client performance comparison.

  server.tool(
    "get_cross_client_overview",
    "Performance-overblik på tværs af ALLE klienter: spend, revenue, ROAS, purchases. Perfekt til agency-level overview.",
    {
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      source: z.enum(["meta", "google_ads", "all"]).default("all").describe("Datakilde"),
      sort_by: z.enum(["spend", "revenue", "roas", "purchases"]).default("spend").describe("Sortering"),
    },
    async ({ time_range, source, sort_by }) => {
      try {
        const sb = getSupabase();
        const { since, until } = resolveDateRange(time_range);

        // Get all active clients
        const { data: clients } = await sb.from("clients").select("id, name").eq("is_active", true).order("name");
        if (!clients?.length) return text("Ingen aktive klienter fundet.");

        // Fetch insights for all clients
        let query = sb
          .from("insights")
          .select("client_id, spend, impressions, clicks, purchases, purchase_value")
          .gte("date", since)
          .lte("date", until);

        if (source !== "all") query = query.eq("source", source);

        const { data, error: qErr } = await query;
        if (qErr) return err(qErr.message);

        // Aggregate per client
        type Agg = { name: string; spend: number; impressions: number; clicks: number; purchases: number; revenue: number };
        const clientMap = new Map<string, Agg>();
        clients.forEach(c => clientMap.set(c.id, { name: c.name, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 }));

        for (const r of data || []) {
          const c = clientMap.get(r.client_id);
          if (!c) continue;
          c.spend += r.spend || 0;
          c.impressions += r.impressions || 0;
          c.clicks += r.clicks || 0;
          c.purchases += r.purchases || 0;
          c.revenue += r.purchase_value || 0;
        }

        // Filter clients with spend > 0 and sort
        const active = [...clientMap.values()].filter(c => c.spend > 0);
        active.sort((a, b) => {
          if (sort_by === "roas") return (b.revenue / (b.spend || 1)) - (a.revenue / (a.spend || 1));
          return (b as any)[sort_by] - (a as any)[sort_by];
        });

        const totals = active.reduce((t, c) => ({ spend: t.spend + c.spend, impressions: t.impressions + c.impressions, clicks: t.clicks + c.clicks, purchases: t.purchases + c.purchases, revenue: t.revenue + c.revenue }), { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 });

        const lines: string[] = [
          `## Agency Overview | ${since} → ${until}\n`,
          `| Klient | Spend | Revenue | ROAS | Køb | Impr. | Clicks |`,
          `|--------|-------|---------|------|-----|-------|--------|`,
        ];

        for (const c of active) {
          const roas = c.spend > 0 ? (c.revenue / c.spend).toFixed(2) + "x" : "–";
          lines.push(`| ${c.name} | ${formatCurrency(c.spend)} | ${formatCurrency(c.revenue)} | ${roas} | ${formatNum(c.purchases)} | ${formatNum(c.impressions)} | ${formatNum(c.clicks)} |`);
        }

        const totalRoas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(2) + "x" : "–";
        lines.push(`| **Total** | **${formatCurrency(totals.spend)}** | **${formatCurrency(totals.revenue)}** | **${totalRoas}** | **${formatNum(totals.purchases)}** | **${formatNum(totals.impressions)}** | **${formatNum(totals.clicks)}** |`);
        lines.push(`\n**Klienter med spend:** ${active.length}/${clients.length} | **Kilde:** ${source === "all" ? "Meta + Google" : source}`);

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_ad_image ───────────────────────────────────────────────────
  // Returns creative thumbnail URL for visual preview.

  server.tool(
    "get_ad_image",
    "Hent creative thumbnail/billede for en specifik ad. Returnerer URL til billedet fra Supabase Storage.",
    {
      client_name: z.string().describe("Klientnavn (fuzzy match)"),
      ad_name: z.string().optional().describe("Søg i ad-navne"),
      creative_id: z.string().optional().describe("Direkte creative ID"),
      limit: z.number().default(5).describe("Max antal billeder"),
    },
    async ({ client_name, ad_name, creative_id, limit: maxImages }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);

        if (creative_id) {
          const { data } = await sb.from("creatives").select("id, meta_creative_id, type, thumbnail_url, media_url, media_storage_path, headline, body").eq("id", creative_id);
          if (!data?.length) return text(`Creative ${creative_id} ikke fundet.`);
          const c = data[0];
          const url = c.media_storage_path
            ? sb.storage.from("creative-thumbnails").getPublicUrl(c.media_storage_path).data.publicUrl
            : c.thumbnail_url || c.media_url || "Intet billede";
          return text(`## Creative: ${c.headline || c.meta_creative_id}\n\n- **Type:** ${c.type}\n- **Headline:** ${c.headline || "–"}\n- **Body:** ${c.body ? (c.body.length > 150 ? c.body.slice(0, 147) + "…" : c.body) : "–"}\n- **Billede:** ${url}`);
        }

        // Search by ad name
        let query = sb
          .from("creatives")
          .select("id, meta_creative_id, type, thumbnail_url, media_url, media_storage_path, headline, body")
          .eq("client_id", client.id)
          .order("updated_at", { ascending: false })
          .limit(maxImages * 3);

        const { data: creatives, error: qErr } = await query;
        if (qErr) return err(qErr.message);
        if (!creatives?.length) return text(`Ingen creatives for ${client.name}`);

        let filtered = creatives;
        if (ad_name) {
          // Find ads matching name, get their creative IDs
          const { data: ads } = await sb.from("ads").select("creative_id, name").eq("client_id", client.id).ilike("name", `%${ad_name}%`).limit(maxImages);
          if (ads?.length) {
            const cids = new Set(ads.map(a => a.creative_id).filter(Boolean));
            filtered = creatives.filter(c => cids.has(c.id));
          }
        }

        if (!filtered.length) filtered = creatives.slice(0, maxImages);
        else filtered = filtered.slice(0, maxImages);

        const lines: string[] = [`## ${client.name} – Creative billeder\n`];
        for (const c of filtered) {
          const url = c.media_storage_path
            ? sb.storage.from("creative-thumbnails").getPublicUrl(c.media_storage_path).data.publicUrl
            : c.thumbnail_url || c.media_url || "–";
          lines.push(`**${c.headline || c.meta_creative_id}** (${c.type})`);
          lines.push(`${url}\n`);
        }

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
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
      const REPO_URL = "https://github.com/Neblerohde/nr-assistant.git";
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

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT MANAGEMENT TOOLS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Tool: create_client ──────────────────────────────────────────────────
  // Creates a new client in the dashboard (Supabase clients table).

  server.tool(
    "create_client",
    "Opret en ny klient i dashboardet. Kopierer Meta access token fra en eksisterende klient (da flere konti deler samme token). Bruges typisk efter get_meta_ad_accounts viser en utracked konto.",
    {
      name: z.string().describe("Klientens navn (f.eks. 'Won Hundred', 'Gastrotools DK')"),
      meta_ad_account_id: z.string().describe("Meta ad account ID (f.eks. 'act_123456789') — fra get_meta_ad_accounts"),
      token_from_client: z.string().describe("Navn på eksisterende klient hvis Meta access token skal kopieres (fuzzy match)"),
      currency: z.string().default("DKK").describe("Valutakode (DKK, EUR, SEK, NOK, USD)"),
      timezone: z.string().default("Europe/Copenhagen").describe("Tidszone (f.eks. 'Europe/Copenhagen', 'Europe/Berlin')"),
    },
    async ({ name, meta_ad_account_id, token_from_client, currency, timezone }) => {
      try {
        const sb = getSupabase();

        // Generate slug from name (kebab-case)
        const slug = name
          .toLowerCase()
          .replace(/[æå]/g, "a").replace(/ø/g, "o").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ä/g, "a")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        // Check slug isn't taken
        const { data: existing } = await sb.from("clients").select("id").eq("slug", slug).limit(1);
        if (existing?.length) return err(`Slug "${slug}" er allerede i brug. Vælg et andet navn.`);

        // Check ad account isn't already tracked
        const { data: existingAcc } = await sb.from("clients").select("id, name").eq("meta_ad_account_id", meta_ad_account_id).limit(1);
        if (existingAcc?.length) return err(`Ad account ${meta_ad_account_id} er allerede tracked under "${existingAcc[0].name}".`);

        // Get token from source client
        const sourceClient = await findClient(sb, token_from_client);
        if (!sourceClient) return err(`Kilde-klient "${token_from_client}" ikke fundet — kan ikke kopiere access token.`);

        const { data: sourceData } = await sb.from("clients").select("meta_access_token").eq("id", sourceClient.id).single();
        if (!sourceData?.meta_access_token) return err(`${sourceClient.name} har ingen Meta access token at kopiere.`);

        // Insert new client
        const { data: newClient, error } = await sb.from("clients").insert({
          name,
          slug,
          meta_ad_account_id,
          meta_access_token: sourceData.meta_access_token,
          currency,
          timezone,
          is_active: true,
        }).select("id, name, slug").single();

        if (error) return err(`Kunne ikke oprette klient: ${error.message}`);

        const lines = [
          `## Klient oprettet\n`,
          `| Felt | Værdi |`,
          `|------|-------|`,
          `| Navn | ${newClient.name} |`,
          `| ID | ${newClient.id} |`,
          `| Slug | ${newClient.slug} |`,
          `| Ad Account | ${meta_ad_account_id} |`,
          `| Token fra | ${sourceClient.name} |`,
          `| Valuta | ${currency} |`,
          `| Tidszone | ${timezone} |`,
          ``,
          `**Næste skridt:** Kør \`trigger_backfill\` med klient "${name}" for at starte historisk sync (2 år, ca. 30-45 min).`,
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: trigger_backfill ─────────────────────────────────────────────────
  // Triggers a historical backfill sync via the dashboard's Inngest endpoint.

  server.tool(
    "trigger_backfill",
    "Start historisk Meta Ads backfill-sync via dashboardets Inngest-funktion. Standard: 2 år (730 dage). Synkroniserer insights, campaigns, ads, creatives, demographics, placements. Tager ca. 30-45 min for 2 år.",
    {
      client_name: z.string().describe("Klientnavn (fuzzy match)"),
      days_back: z.number().min(1).max(730).default(730).describe("Antal dage tilbage (max 730 = 2 år). Standard: 730"),
    },
    async ({ client_name, days_back }) => {
      try {
        const dashboardUrl = process.env.DASHBOARD_URL;
        if (!dashboardUrl) return err("DASHBOARD_URL env var ikke sat — kan ikke trigge backfill.");

        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);

        // Verify client has an ad account
        const { data: clientData } = await sb.from("clients").select("meta_ad_account_id, meta_access_token").eq("id", client.id).single();
        if (!clientData?.meta_ad_account_id) return err(`${client.name} har ingen Meta ad account ID. Opret klienten med create_client først.`);
        if (!clientData?.meta_access_token) return err(`${client.name} har ingen Meta access token.`);

        // Call dashboard background sync endpoint
        const resp = await fetch(`${dashboardUrl}/api/sync/background`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: client.id, daysBack: days_back }),
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          return err(`Backfill fejlede: ${resp.status} ${resp.statusText}${body ? ` — ${body}` : ""}`);
        }

        const years = (days_back / 365).toFixed(1);
        const estimatedTime = days_back >= 365 ? "30-45 minutter" : days_back >= 180 ? "15-25 minutter" : "5-15 minutter";

        const lines = [
          `## Backfill startet for ${client.name}\n`,
          `| Parameter | Værdi |`,
          `|-----------|-------|`,
          `| Klient | ${client.name} |`,
          `| Ad Account | ${clientData.meta_ad_account_id} |`,
          `| Dage tilbage | ${days_back} (~${years} år) |`,
          `| Estimeret tid | ${estimatedTime} |`,
          ``,
          `Synkroniserer: insights, campaigns, ads, creatives, demographics, placements, hourly data.`,
          ``,
          `Sync kører i baggrunden via Inngest. Tjek status i dashboardet eller kør \`get_performance\` / \`get_ad_insights\` om ${estimatedTime} for at verificere data.`,
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_google_ad_accounts ─────────────────────────────────────────
  // Lists all Google Ads customer accounts accessible via the shared MCC.

  server.tool(
    "get_google_ad_accounts",
    "List alle Google Ads konti tilgængelige via MCC (Manager Account). Viser hvilke der allerede er forbundet til klienter i systemet. Bruges til at opdage nye konti der kan tilsluttes.",
    {},
    async () => {
      try {
        const data = await dashboardFetch<{
          accounts: Array<{
            customer_id: string;
            name: string;
            currency_code: string;
            already_connected: boolean;
            connected_client_name?: string;
          }>;
        }>("/api/connectors/google-ads/discover");

        const accounts = data.accounts || [];
        if (!accounts.length) return text("Ingen Google Ads konti fundet under MCC. Tjek at GOOGLE_ADS_MCC_ID og GOOGLE_ADS_REFRESH_TOKEN er sat korrekt.");

        // Group by name similarity for display
        const lines: string[] = [
          `## Google Ads konti (via MCC)\n`,
          `| Konto | Customer ID | Valuta | Forbundet? |`,
          `|-------|-------------|--------|------------|`,
        ];

        // Sort: connected first, then alphabetically
        const sorted = accounts.sort((a, b) => {
          if (a.already_connected !== b.already_connected) return a.already_connected ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        let connectedCount = 0;
        for (const a of sorted) {
          if (a.already_connected) connectedCount++;
          const status = a.already_connected
            ? `✓ ${a.connected_client_name || "Tilsluttet"}`
            : "–";
          lines.push(`| ${a.name} | ${a.customer_id} | ${a.currency_code} | ${status} |`);
        }

        lines.push(`\n**Total:** ${accounts.length} konti | **Forbundet:** ${connectedCount} | **Ikke forbundet:** ${accounts.length - connectedCount}`);

        if (accounts.length - connectedCount > 0) {
          lines.push(`\n**Tip:** Brug \`connect_google_ads\` for at forbinde en konto til en klient.`);
          lines.push(`Bemærk: Konti med lignende navne (f.eks. "Spring Copenhagen DK" og "Spring Copenhagen Int") kan tilhøre samme kunde — spørg om de skal oprettes som én eller flere klienter.`);
        }

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(`Google Ads discover: ${e.message}`);
      }
    }
  );

  // ─── Tool: connect_google_ads ───────────────────────────────────────────────
  // Connects a Google Ads customer account to a client via data_sources.

  server.tool(
    "connect_google_ads",
    "Forbind en Google Ads konto til en klient. Indsætter i data_sources-tabellen. Klienten skal eksistere i forvejen (opret med create_client hvis nødvendigt). Spørg altid om bekræftelse — Google Ads kontonavne kan ligne hinanden.",
    {
      client_name: z.string().describe("Klientens navn (fuzzy match) — skal eksistere i systemet"),
      customer_id: z.string().describe("Google Ads Customer ID (f.eks. '123-456-7890') — fra get_google_ad_accounts"),
      display_name: z.string().optional().describe("Visningsnavn (f.eks. 'Google Ads — DK'). Standard: 'Google Ads'"),
    },
    async ({ client_name, customer_id, display_name }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);

        // Normalize customer_id (remove dashes for storage check, keep for display)
        const normalizedId = customer_id.replace(/-/g, "");
        const formattedId = customer_id.includes("-")
          ? customer_id
          : `${normalizedId.slice(0, 3)}-${normalizedId.slice(3, 6)}-${normalizedId.slice(6)}`;

        // Check if already connected
        const { data: existing } = await sb
          .from("data_sources")
          .select("id, client_id")
          .eq("source_type", "google_ads")
          .like("config->>customer_id", `%${normalizedId}%`)
          .limit(5);

        if (existing?.length) {
          // Check if it's connected to this client or another
          const connectedToThis = existing.find(ds => ds.client_id === client.id);
          if (connectedToThis) {
            return err(`Google Ads ${formattedId} er allerede forbundet til ${client.name}.`);
          }
          return err(`Google Ads ${formattedId} er allerede forbundet til en anden klient. Tjek data_sources.`);
        }

        // Insert data_source
        const { data: newDs, error } = await sb.from("data_sources").insert({
          client_id: client.id,
          source_type: "google_ads",
          display_name: display_name || "Google Ads",
          config: { customer_id: formattedId },
          is_active: true,
        }).select("id, display_name").single();

        if (error) return err(`Kunne ikke oprette data source: ${error.message}`);

        const lines = [
          `## Google Ads forbundet\n`,
          `| Felt | Værdi |`,
          `|------|-------|`,
          `| Klient | ${client.name} |`,
          `| Customer ID | ${formattedId} |`,
          `| Display name | ${newDs.display_name} |`,
          `| Data source ID | ${newDs.id} |`,
          ``,
          `**Næste skridt:** Google Ads synkroniserer automatisk ved næste daglige cron (kl. 05:00 UTC).`,
          `For at starte sync nu, trigger den manuelt fra dashboardet eller vent til næste planlagte kørsel.`,
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: read_client_report ─────────────────────────────────────────────

  server.tool(
    "read_client_report",
    "Læs en rapport-fil fra Supabase Storage (client-reports bucket). Filer er markdown-rapporter gemt som f.eks. 'client-reports/{klient}/rapport-navn.md'. Brug list_client_reports for at se tilgængelige filer.",
    {
      path: z.string().describe("Fuld sti i bucketen, f.eks. 'i-love-beauty/klaviyo-analyse-jan2025-mar2026.md'"),
    },
    async ({ path }) => {
      try {
        const sb = getSupabase();
        const { data, error } = await sb.storage.from("client-reports").download(path);
        if (error) return err(`Kunne ikke hente fil: ${error.message}`);
        const content = await data.text();
        return text(content);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: list_client_reports ──────────────────────────────────────────────

  server.tool(
    "list_client_reports",
    "List rapport-filer i Supabase Storage (client-reports bucket). Angiv en klient-mappe for at se filer, eller udelad for at se alle mapper.",
    {
      folder: z.string().optional().describe("Mappe-sti, f.eks. 'i-love-beauty'. Udelad for at liste rodmapper."),
    },
    async ({ folder }) => {
      try {
        const sb = getSupabase();
        const { data, error } = await sb.storage.from("client-reports").list(folder || "", { limit: 100, sortBy: { column: "name", order: "asc" } });
        if (error) return err(`Kunne ikke liste filer: ${error.message}`);
        if (!data?.length) return text(`Ingen filer i ${folder || "client-reports/"}`);

        const lines = [
          `## Filer i client-reports/${folder || ""}`,
          ``,
          `| Navn | Type | Størrelse | Opdateret |`,
          `|------|------|-----------|-----------|`,
          ...data.map((f: any) => {
            const isFolder = !f.id;
            const size = f.metadata?.size ? `${Math.round(f.metadata.size / 1024)} KB` : "–";
            const updated = f.updated_at ? new Date(f.updated_at).toISOString().split("T")[0] : "–";
            return `| ${f.name} | ${isFolder ? "📁 Mappe" : "📄 Fil"} | ${size} | ${updated} |`;
          }),
        ];
        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: write_client_report ─────────────────────────────────────────────

  server.tool(
    "write_client_report",
    "Skriv eller opdatér en rapport-fil i Supabase Storage (client-reports bucket). Brug til at gemme markdown-rapporter, analyser, eller reviews. Filer gemmes som '{klient}/{filnavn}.md'.",
    {
      path: z.string().describe("Fuld sti i bucketen, f.eks. 'i-love-beauty/monthly-review-2026-03.md'"),
      content: z.string().describe("Markdown-indhold der skal gemmes"),
      overwrite: z.boolean().default(true).describe("Overskrid eksisterende fil (default: true)"),
    },
    async ({ path, content, overwrite }) => {
      try {
        const sb = getSupabase();
        const blob = new Blob([content], { type: "text/markdown" });

        if (!overwrite) {
          // Check if file exists
          const parts = path.split("/");
          const fileName = parts.pop()!;
          const folder = parts.join("/");
          const { data: existing } = await sb.storage.from("client-reports").list(folder, { search: fileName });
          if (existing?.some((f: any) => f.name === fileName)) {
            return err(`Filen '${path}' eksisterer allerede. Sæt overwrite=true for at overskrive.`);
          }
        }

        const { error } = await sb.storage
          .from("client-reports")
          .upload(path, blob, { contentType: "text/markdown", upsert: true });

        if (error) return err(`Kunne ikke gemme fil: ${error.message}`);
        return text(`Rapport gemt: client-reports/${path} (${Math.round(content.length / 1024)} KB)`);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_google_shopping ──────────────────────────────────────────────

  server.tool(
    "get_google_shopping",
    "Hent Google Shopping produkt-performance (spend, clicks, ROAS) fra google_shopping_insights-tabellen",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      brand: z.string().optional().describe("Filtrer på brand"),
      category: z.string().optional().describe("Filtrer på produktkategori (level 1)"),
    },
    async ({ client_name, time_range, brand, category }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);
      const { since, until } = resolveDateRange(time_range);

      let query = sb
        .from("google_shopping_insights")
        .select("product_item_id, product_title, product_brand, product_type_l1, impressions, clicks, spend, conversions, conversions_value")
        .eq("client_id", client.id)
        .gte("date", since)
        .lte("date", until);

      if (brand) query = query.ilike("product_brand", `%${brand}%`);
      if (category) query = query.ilike("product_type_l1", `%${category}%`);

      const { data, error } = await query;
      if (error) return err(error.message);
      if (!data?.length) return noData(client.name, "Google Shopping");

      // Aggregate by product
      const prodMap = new Map<string, { title: string; brand: string; cat: string; spend: number; impr: number; clicks: number; conv: number; rev: number }>();
      for (const r of data) {
        const key = r.product_item_id || r.product_title || "unknown";
        const ex = prodMap.get(key) || { title: r.product_title || key, brand: r.product_brand || "–", cat: r.product_type_l1 || "–", spend: 0, impr: 0, clicks: 0, conv: 0, rev: 0 };
        ex.spend += Number(r.spend || 0);
        ex.impr += Number(r.impressions || 0);
        ex.clicks += Number(r.clicks || 0);
        ex.conv += Number(r.conversions || 0);
        ex.rev += Number(r.conversions_value || 0);
        prodMap.set(key, ex);
      }

      const sorted = [...prodMap.values()].sort((a, b) => b.spend - a.spend).slice(0, 30);
      const totalSpend = sorted.reduce((s, p) => s + p.spend, 0);
      const totalRev = sorted.reduce((s, p) => s + p.rev, 0);

      const lines = [
        `## ${client.name} – Google Shopping (${time_range})`,
        `Total spend: ${formatCurrency(totalSpend)} | Revenue: ${formatCurrency(totalRev)} | ROAS: ${totalSpend > 0 ? (totalRev / totalSpend).toFixed(2) : "–"}x`,
        ``,
        `| Produkt | Brand | Spend | ROAS | Conv. | Clicks | CTR |`,
        `|---------|-------|-------|------|-------|--------|-----|`,
        ...sorted.map(p => {
          const roas = p.spend > 0 ? (p.rev / p.spend).toFixed(2) + "x" : "–";
          const ctr = p.impr > 0 ? ((p.clicks / p.impr) * 100).toFixed(2) + "%" : "–";
          return `| ${p.title.slice(0, 40)} | ${p.brand} | ${formatCurrency(p.spend)} | ${roas} | ${Math.round(p.conv)} | ${formatNum(p.clicks)} | ${ctr} |`;
        }),
      ];
      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_google_geo ──────────────────────────────────────────────────

  server.tool(
    "get_google_geo",
    "Hent Google Ads geografisk performance pr. land fra google_geo_insights-tabellen",
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
        .from("google_geo_insights")
        .select("country_code, impressions, clicks, spend, conversions, conversions_value")
        .eq("client_id", client.id)
        .gte("date", since)
        .lte("date", until);

      if (error) return err(error.message);
      if (!data?.length) return noData(client.name, "Google Ads geo");

      // Aggregate by country
      const countryMap = new Map<string, { spend: number; impr: number; clicks: number; conv: number; rev: number }>();
      for (const r of data) {
        const key = r.country_code || "??";
        const ex = countryMap.get(key) || { spend: 0, impr: 0, clicks: 0, conv: 0, rev: 0 };
        ex.spend += Number(r.spend || 0);
        ex.impr += Number(r.impressions || 0);
        ex.clicks += Number(r.clicks || 0);
        ex.conv += Number(r.conversions || 0);
        ex.rev += Number(r.conversions_value || 0);
        countryMap.set(key, ex);
      }

      const sorted = [...countryMap.entries()].sort((a, b) => b[1].spend - a[1].spend);
      const totalSpend = sorted.reduce((s, [, v]) => s + v.spend, 0);

      const lines = [
        `## ${client.name} – Google Ads Geo (${time_range})`,
        `${sorted.length} lande, total spend: ${formatCurrency(totalSpend)}`,
        ``,
        `| Land | Spend | Andel | ROAS | Conv. | CPA | CTR |`,
        `|------|-------|-------|------|-------|-----|-----|`,
        ...sorted.slice(0, 25).map(([code, v]) => {
          const roas = v.spend > 0 ? (v.rev / v.spend).toFixed(2) + "x" : "–";
          const cpa = v.conv > 0 ? formatCurrency(v.spend / v.conv) : "–";
          const ctr = v.impr > 0 ? ((v.clicks / v.impr) * 100).toFixed(2) + "%" : "–";
          const share = totalSpend > 0 ? ((v.spend / totalSpend) * 100).toFixed(1) + "%" : "–";
          return `| ${code} | ${formatCurrency(v.spend)} | ${share} | ${roas} | ${Math.round(v.conv)} | ${cpa} | ${ctr} |`;
        }),
      ];
      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_google_ad_groups ────────────────────────────────────────────

  server.tool(
    "get_google_ad_groups",
    "Hent Google Ads ad group performance med spend, ROAS, conversions. Kan filtreres per kampagne.",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      campaign_name: z.string().optional().describe("Filtrer på kampagnenavn (fuzzy match)"),
    },
    async ({ client_name, time_range, campaign_name }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);
      const { since, until } = resolveDateRange(time_range);

      // Get ad sets (= ad groups in Google) for this client
      let adSetQuery = sb
        .from("ad_sets")
        .select("id, name, status, campaign_id, platform_adset_id")
        .eq("client_id", client.id)
        .eq("source", "google_ads");

      const { data: adSets, error: asErr } = await adSetQuery;
      if (asErr) return err(asErr.message);
      if (!adSets?.length) return text(`Ingen Google Ads ad groups fundet for ${client.name}`);

      // Get campaigns for name lookup + optional filter
      const { data: campaigns } = await sb
        .from("campaigns")
        .select("id, name")
        .eq("client_id", client.id)
        .eq("source", "google_ads");

      const campNameMap = new Map((campaigns || []).map((c: any) => [c.id, c.name]));

      // Filter by campaign name if provided
      let filteredAdSets = adSets;
      if (campaign_name) {
        const matchingCampIds = new Set(
          (campaigns || []).filter((c: any) => c.name.toLowerCase().includes(campaign_name.toLowerCase())).map((c: any) => c.id)
        );
        filteredAdSets = adSets.filter((as: any) => matchingCampIds.has(as.campaign_id));
        if (!filteredAdSets.length) return text(`Ingen ad groups matcher kampagne "${campaign_name}"`);
      }

      // Get insights
      const { data: insights } = await sb
        .from("insights")
        .select("adset_id, spend, impressions, clicks, purchases, purchase_value")
        .eq("client_id", client.id)
        .eq("source", "google_ads")
        .gte("date", since)
        .lte("date", until);

      // Aggregate per ad_set
      const asMetrics = new Map<string, { spend: number; impr: number; clicks: number; conv: number; rev: number }>();
      for (const r of insights || []) {
        if (!r.adset_id) continue;
        const ex = asMetrics.get(r.adset_id) || { spend: 0, impr: 0, clicks: 0, conv: 0, rev: 0 };
        ex.spend += Number(r.spend || 0);
        ex.impr += Number(r.impressions || 0);
        ex.clicks += Number(r.clicks || 0);
        ex.conv += Number(r.purchases || 0);
        ex.rev += Number(r.purchase_value || 0);
        asMetrics.set(r.adset_id, ex);
      }

      const withSpend = filteredAdSets.filter((as: any) => {
        const m = asMetrics.get(as.id);
        return m && m.spend > 0;
      }).sort((a: any, b: any) => {
        const ma = asMetrics.get(a.id);
        const mb = asMetrics.get(b.id);
        return (mb?.spend || 0) - (ma?.spend || 0);
      });

      const lines = [
        `## ${client.name} – Google Ads Ad Groups (${time_range})`,
        `${withSpend.length} ad groups med spend`,
        ``,
        `| Ad Group | Kampagne | Spend | ROAS | Conv. | CPA | CTR |`,
        `|----------|----------|-------|------|-------|-----|-----|`,
        ...withSpend.slice(0, 30).map((as: any) => {
          const m = asMetrics.get(as.id)!;
          const roas = m.spend > 0 ? (m.rev / m.spend).toFixed(2) + "x" : "–";
          const cpa = m.conv > 0 ? formatCurrency(m.spend / m.conv) : "–";
          const ctr = m.impr > 0 ? ((m.clicks / m.impr) * 100).toFixed(2) + "%" : "–";
          const campName = campNameMap.get(as.campaign_id) || "–";
          return `| ${as.name} | ${campName.slice(0, 25)} | ${formatCurrency(m.spend)} | ${roas} | ${Math.round(m.conv)} | ${cpa} | ${ctr} |`;
        }),
      ];
      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_google_assets ───────────────────────────────────────────────

  server.tool(
    "get_google_assets",
    "Hent Google Ads Performance Max asset groups og assets. Viser grupper med performance-score og tilknyttede assets.",
    {
      client_name: z.string().describe("Klientens navn"),
      campaign_name: z.string().optional().describe("Filtrer på PMax kampagnenavn"),
    },
    async ({ client_name, campaign_name }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      // Get asset groups
      let groupsQuery = sb
        .from("google_asset_groups")
        .select("*")
        .eq("client_id", client.id)
        .neq("status", "REMOVED");

      const { data: groups, error: gErr } = await groupsQuery;
      if (gErr) return err(gErr.message);
      if (!groups?.length) return text(`Ingen PMax asset groups fundet for ${client.name}`);

      // Get campaigns for name lookup
      const campIds = [...new Set(groups.map((g: any) => g.campaign_id).filter(Boolean))];
      let campNameMap = new Map<string, string>();
      if (campIds.length) {
        const { data: campaigns } = await sb.from("campaigns").select("id, name").in("id", campIds);
        campNameMap = new Map((campaigns || []).map((c: any) => [c.id, c.name]));
      }

      // Optional filter
      let filtered = groups;
      if (campaign_name) {
        const matchIds = new Set([...campNameMap.entries()].filter(([, n]) => n.toLowerCase().includes(campaign_name.toLowerCase())).map(([id]) => id));
        filtered = groups.filter((g: any) => matchIds.has(g.campaign_id));
      }

      // Get assets
      const { data: assets } = await sb
        .from("google_assets")
        .select("asset_group_id, asset_type, field_type, performance_label, text_content, url")
        .eq("client_id", client.id)
        .neq("status", "REMOVED");

      const assetsByGroup = new Map<string, any[]>();
      for (const a of assets || []) {
        const list = assetsByGroup.get(a.asset_group_id) || [];
        list.push(a);
        assetsByGroup.set(a.asset_group_id, list);
      }

      const lines = [
        `## ${client.name} – PMax Asset Groups`,
        `${filtered.length} grupper`,
        ``,
      ];

      for (const g of filtered.slice(0, 15)) {
        const campName = campNameMap.get(g.campaign_id) || "–";
        lines.push(`### ${g.name} (${g.status})`);
        lines.push(`Kampagne: ${campName} | Performance: ${g.ad_strength || "–"}`);

        const groupAssets = assetsByGroup.get(g.id) || [];
        if (groupAssets.length) {
          const byType = new Map<string, number>();
          for (const a of groupAssets) byType.set(a.field_type || a.asset_type || "?", (byType.get(a.field_type || a.asset_type || "?") || 0) + 1);
          lines.push(`Assets: ${[...byType.entries()].map(([t, c]) => `${t}: ${c}`).join(", ")}`);
        }
        lines.push(``);
      }

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_google_monthly_comparison ───────────────────────────────────

  server.tool(
    "get_google_monthly_comparison",
    "MoM og YoY sammenligning af Google Ads performance. Viser aktuel, forrige måned og samme måned sidste år.",
    {
      client_name: z.string().describe("Klientens navn"),
      month: z.string().default("").describe("Måned som 'YYYY-MM' (f.eks. '2026-02'). Tom = indeværende måned."),
      segment: z.enum(["all", "search", "shopping", "pmax", "display", "video", "demand_gen"]).default("all").describe("Kampagnetype-segment"),
    },
    async ({ client_name, month, segment }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      // Resolve month
      const now = new Date();
      const currentMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [year, mon] = currentMonth.split("-").map(Number);

      // Period dates
      const curStart = `${currentMonth}-01`;
      const curEnd = new Date(year, mon, 0).toISOString().split("T")[0];
      const prevDate = new Date(year, mon - 2, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
      const prevStart = `${prevMonth}-01`;
      const prevEnd = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).toISOString().split("T")[0];
      const yoyMonth = `${year - 1}-${String(mon).padStart(2, "0")}`;
      const yoyStart = `${yoyMonth}-01`;
      const yoyEnd = new Date(year - 1, mon, 0).toISOString().split("T")[0];

      // Campaign type map (for segment filtering)
      const SEGMENT_TYPES: Record<string, string[]> = {
        search: ["2"], shopping: ["4"], pmax: ["10"], display: ["3"], video: ["6"], demand_gen: ["12", "14"],
      };

      // Get campaign IDs for segment filter
      let campaignIdFilter: string[] | null = null;
      if (segment !== "all") {
        const types = SEGMENT_TYPES[segment] || [];
        const { data: camps } = await sb
          .from("campaigns")
          .select("id, objective")
          .eq("client_id", client.id)
          .eq("source", "google_ads")
          .in("objective", types);
        campaignIdFilter = (camps || []).map((c: any) => c.id);
        if (!campaignIdFilter.length) return text(`Ingen ${segment} kampagner fundet for ${client.name}`);
      }

      // Fetch all three periods
      const cid = client!.id;
      async function fetchPeriod(start: string, end: string) {
        let q = sb
          .from("insights")
          .select("spend, impressions, clicks, purchases, purchase_value")
          .eq("client_id", cid)
          .eq("source", "google_ads")
          .gte("date", start)
          .lte("date", end);
        if (campaignIdFilter) q = q.in("campaign_id", campaignIdFilter);
        const { data } = await q;
        const agg = { spend: 0, impr: 0, clicks: 0, conv: 0, rev: 0 };
        for (const r of data || []) {
          agg.spend += Number(r.spend || 0);
          agg.impr += Number(r.impressions || 0);
          agg.clicks += Number(r.clicks || 0);
          agg.conv += Number(r.purchases || 0);
          agg.rev += Number(r.purchase_value || 0);
        }
        return agg;
      }

      const [cur, prev, yoy] = await Promise.all([
        fetchPeriod(curStart, curEnd),
        fetchPeriod(prevStart, prevEnd),
        fetchPeriod(yoyStart, yoyEnd),
      ]);

      function pctChange(a: number, b: number): string {
        if (b === 0) return a > 0 ? "+∞" : "–";
        const pct = ((a - b) / b) * 100;
        return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
      }

      const lines = [
        `## ${client.name} – Google Ads MoM/YoY (${segment})`,
        `Periode: ${currentMonth}`,
        ``,
        `| Metrik | ${currentMonth} | ${prevMonth} (MoM) | ${yoyMonth} (YoY) |`,
        `|--------|------------|------------|------------|`,
        `| Spend | ${formatCurrency(cur.spend)} | ${formatCurrency(prev.spend)} (${pctChange(cur.spend, prev.spend)}) | ${formatCurrency(yoy.spend)} (${pctChange(cur.spend, yoy.spend)}) |`,
        `| ROAS | ${cur.spend > 0 ? (cur.rev / cur.spend).toFixed(2) + "x" : "–"} | ${prev.spend > 0 ? (prev.rev / prev.spend).toFixed(2) + "x" : "–"} | ${yoy.spend > 0 ? (yoy.rev / yoy.spend).toFixed(2) + "x" : "–"} |`,
        `| Conversions | ${Math.round(cur.conv)} | ${Math.round(prev.conv)} (${pctChange(cur.conv, prev.conv)}) | ${Math.round(yoy.conv)} (${pctChange(cur.conv, yoy.conv)}) |`,
        `| Revenue | ${formatCurrency(cur.rev)} | ${formatCurrency(prev.rev)} (${pctChange(cur.rev, prev.rev)}) | ${formatCurrency(yoy.rev)} (${pctChange(cur.rev, yoy.rev)}) |`,
        `| Clicks | ${formatNum(cur.clicks)} | ${formatNum(prev.clicks)} (${pctChange(cur.clicks, prev.clicks)}) | ${formatNum(yoy.clicks)} (${pctChange(cur.clicks, yoy.clicks)}) |`,
        `| Impressions | ${formatNum(cur.impr)} | ${formatNum(prev.impr)} (${pctChange(cur.impr, prev.impr)}) | ${formatNum(yoy.impr)} (${pctChange(cur.impr, yoy.impr)}) |`,
        `| CPA | ${cur.conv > 0 ? formatCurrency(cur.spend / cur.conv) : "–"} | ${prev.conv > 0 ? formatCurrency(prev.spend / prev.conv) : "–"} | ${yoy.conv > 0 ? formatCurrency(yoy.spend / yoy.conv) : "–"} |`,
      ];
      return text(lines.join("\n"));
    }
  );

  // ─── Tool: get_lead_campaign_breakdown ─────────────────────────────────────

  server.tool(
    "get_lead_campaign_breakdown",
    "Hent lead-kampagne breakdown med ROAS, leads, revenue og konverteringsdata pr. kampagne/ad set. Understøtter country filter.",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_90d").describe(TIME_RANGE_DESC),
      country: z.string().optional().describe("Filtrer på landekode (f.eks. 'DK', 'NO')"),
    },
    async ({ client_name, time_range, country }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);
        const { since, until } = resolveDateRange(time_range);

        const params: Record<string, string | number | undefined> = {
          clientId: client.id,
          from: since,
          to: until,
        };
        if (country) params.country = country;

        const data = await dashboardFetch<any>("/api/lead-cohorts/campaign-breakdown", params);

        if (!data?.campaigns?.length) return noData(client.name, "lead campaign breakdown");

        const lines = [
          `## ${client.name} – Lead Campaign Breakdown (${time_range})`,
          country ? `Land: ${country}` : "",
          ``,
          `| Kampagne | Leads | Spend | 30D Rev | 90D Rev | 30D ROAS | 90D ROAS |`,
          `|----------|-------|-------|---------|---------|----------|----------|`,
          ...data.campaigns.slice(0, 25).map((c: any) => {
            return `| ${(c.campaignName || "–").slice(0, 35)} | ${c.leads || 0} | ${formatCurrency(c.adSpend || 0)} | ${formatCurrency(c.revenue30d || 0)} | ${formatCurrency(c.revenue90d || 0)} | ${c.adSpend > 0 ? ((c.revenue30d || 0) / c.adSpend).toFixed(2) + "x" : "–"} | ${c.adSpend > 0 ? ((c.revenue90d || 0) / c.adSpend).toFixed(2) + "x" : "–"} |`;
          }),
        ].filter(Boolean);

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_lead_unmatched ──────────────────────────────────────────────

  server.tool(
    "get_lead_unmatched",
    "Hent leads der ikke er matchet til en ordre endnu (unmatched leads). Viser konverteringspotentiale.",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_90d").describe(TIME_RANGE_DESC),
      country: z.string().optional().describe("Filtrer på landekode"),
    },
    async ({ client_name, time_range, country }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);
        const { since, until } = resolveDateRange(time_range);

        const params: Record<string, string | number | undefined> = {
          clientId: client.id,
          from: since,
          to: until,
        };
        if (country) params.country = country;

        const data = await dashboardFetch<any>("/api/lead-cohorts/unmatched", params);

        if (!data?.unmatched?.length) return text(`Ingen umatchede leads for ${client.name} i perioden.`);

        const lines = [
          `## ${client.name} – Umatchede Leads (${time_range})`,
          `${data.unmatched.length} lead ads uden ordrematch`,
          ``,
          `| Ad | Leads | Spend | Campaign | Country |`,
          `|-----|-------|-------|----------|---------|`,
          ...data.unmatched.slice(0, 25).map((u: any) => {
            return `| ${(u.adName || "–").slice(0, 30)} | ${u.leads || 0} | ${formatCurrency(u.spend || 0)} | ${(u.campaignName || "–").slice(0, 25)} | ${u.country || "–"} |`;
          }),
        ];

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_cross_channel ───────────────────────────────────────────────

  server.tool(
    "get_cross_channel",
    "Cross-channel overblik: Meta + Google Ads side om side med daglig sammenligning. Viser spend, ROAS, conversions for begge kanaler.",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
    },
    async ({ client_name, time_range }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);
        const { since, until } = resolveDateRange(time_range);

        const data = await dashboardFetch<any>("/api/dashboard/cross-channel", {
          clientId: client.id,
          from: since,
          to: until,
        });

        const lines = [
          `## ${client.name} – Cross-Channel (${time_range})`,
          ``,
        ];

        if (data.meta) {
          const m = data.meta;
          lines.push(`### Meta Ads`);
          lines.push(`Spend: ${formatCurrency(m.spend)} | ROAS: ${m.roas?.toFixed(2) || "–"}x | Conv: ${Math.round(m.purchases || 0)} | CPA: ${m.purchases > 0 ? formatCurrency(m.spend / m.purchases) : "–"}`);
        }
        if (data.google) {
          const g = data.google;
          lines.push(`### Google Ads`);
          lines.push(`Spend: ${formatCurrency(g.spend)} | ROAS: ${g.roas?.toFixed(2) || "–"}x | Conv: ${Math.round(g.purchases || 0)} | CPA: ${g.purchases > 0 ? formatCurrency(g.spend / g.purchases) : "–"}`);
        }

        if (data.combined) {
          lines.push(`### Samlet`);
          lines.push(`Total spend: ${formatCurrency(data.combined.spend)} | Impressions: ${formatNum(data.combined.impressions)} | Clicks: ${formatNum(data.combined.clicks)}`);
          lines.push(`*NB: Conversions kan overlappe mellem kanaler*`);
        }

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: get_monthly_insights ────────────────────────────────────────────

  server.tool(
    "get_monthly_insights",
    "12-måneders performance trend + YTD sammenligning (i år vs. sidste år). Viser spend, revenue, ROAS, purchases pr. måned.",
    {
      client_name: z.string().describe("Klientens navn"),
    },
    async ({ client_name }) => {
      try {
        const sb = getSupabase();
        const client = await findClient(sb, client_name);
        if (!client) return noClient(client_name);

        const data = await dashboardFetch<any>("/api/dashboard/monthly-insights", {
          clientId: client.id,
        });

        if (!data?.months?.length) return noData(client.name, "monthly insights");

        const lines = [
          `## ${client.name} – 12 Måneder Trend`,
          ``,
          `| Måned | Spend | Revenue | ROAS | Purchases |`,
          `|-------|-------|---------|------|-----------|`,
          ...data.months.map((m: any) => {
            const roas = m.spend > 0 ? (m.revenue / m.spend).toFixed(2) + "x" : "–";
            return `| ${m.month} | ${formatCurrency(m.spend)} | ${formatCurrency(m.revenue)} | ${roas} | ${Math.round(m.purchases || 0)} |`;
          }),
        ];

        if (data.ytd) {
          const ty = data.ytd.thisYear;
          const ly = data.ytd.lastYear;
          lines.push(``, `### YTD Sammenligning`);
          lines.push(`| | I år | Sidste år |`);
          lines.push(`|---|------|-----------|`);
          lines.push(`| Spend | ${formatCurrency(ty.spend)} | ${formatCurrency(ly.spend)} |`);
          lines.push(`| Revenue | ${formatCurrency(ty.revenue)} | ${formatCurrency(ly.revenue)} |`);
          lines.push(`| ROAS | ${ty.spend > 0 ? (ty.revenue / ty.spend).toFixed(2) + "x" : "–"} | ${ly.spend > 0 ? (ly.revenue / ly.spend).toFixed(2) + "x" : "–"} |`);
        }

        return text(lines.join("\n"));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: trigger_thumbnail_refresh ───────────────────────────────────────

  server.tool(
    "trigger_thumbnail_refresh",
    "Trigger en manuel opdatering af creative thumbnails i Supabase Storage for en klient",
    {
      client_name: z.string().describe("Klientens navn"),
    },
    async ({ client_name }) => {
      const dashboardUrl = process.env.DASHBOARD_URL;
      if (!dashboardUrl) return err("DASHBOARD_URL env var ikke sat");
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      try {
        const resp = await fetch(`${dashboardUrl}/api/creatives/refresh-thumbnails`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: client.id }),
        });
        if (!resp.ok) return err(`Thumbnail refresh fejlede: ${resp.status}`);
        return text(`Thumbnail refresh trigget for ${client.name}. Det tager typisk 2-5 minutter.`);
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: generate_ai_review ──────────────────────────────────────────────

  server.tool(
    "generate_ai_review",
    "Generer en AI-baseret performance review for en klient. Bruger Claude Haiku til at analysere data og skrive en opsummering.",
    {
      client_name: z.string().describe("Klientens navn"),
      time_range: z.string().default("last_30d").describe(TIME_RANGE_DESC),
      context: z.string().optional().describe("Ekstra kontekst til AI-review (f.eks. 'fokuser på Klaviyo flows')"),
    },
    async ({ client_name, time_range, context }) => {
      const dashboardUrl = process.env.DASHBOARD_URL;
      if (!dashboardUrl) return err("DASHBOARD_URL env var ikke sat");
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);
      const { since, until } = resolveDateRange(time_range);

      try {
        const resp = await fetch(`${dashboardUrl}/api/ai/generate-review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: client.id, from: since, to: until, context }),
        });
        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          return err(`AI review fejlede: ${resp.status} ${body}`);
        }
        const data = await resp.json();
        return text(data.review || data.content || JSON.stringify(data));
      } catch (e: any) {
        return err(e.message);
      }
    }
  );

  // ─── Tool: check_data_source_health ────────────────────────────────────────

  server.tool(
    "check_data_source_health",
    "Tjek health status for en data source (Meta, Google Ads, Klaviyo, Shopify). Viser seneste sync, fejl og forbindelsesstatus.",
    {
      client_name: z.string().describe("Klientens navn"),
      source_type: z.enum(["all", "meta", "google_ads", "klaviyo", "shopify"]).default("all").describe("Filtrer på kildetype"),
    },
    async ({ client_name, source_type }) => {
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      let query = sb
        .from("data_sources")
        .select("id, source_type, display_name, is_active, last_synced_at, last_error, config, created_at")
        .eq("client_id", client.id);

      if (source_type !== "all") query = query.eq("source_type", source_type);

      const { data, error } = await query;
      if (error) return err(error.message);
      if (!data?.length) return text(`Ingen data sources fundet for ${client.name}${source_type !== "all" ? ` (${source_type})` : ""}`);

      const lines = [
        `## ${client.name} – Data Sources Health`,
        ``,
        `| Kilde | Navn | Status | Sidste sync | Fejl |`,
        `|-------|------|--------|-------------|------|`,
        ...data.map((ds: any) => {
          const status = ds.is_active ? "✅ Aktiv" : "⏸️ Pauseret";
          const lastSync = ds.last_synced_at ? new Date(ds.last_synced_at).toISOString().replace("T", " ").slice(0, 16) : "Aldrig";
          const error = ds.last_error ? ds.last_error.slice(0, 40) : "–";
          return `| ${ds.source_type} | ${ds.display_name || "–"} | ${status} | ${lastSync} | ${error} |`;
        }),
      ];

      return text(lines.join("\n"));
    }
  );

  // ─── Tool: trigger_source_sync ─────────────────────────────────────────────

  server.tool(
    "trigger_source_sync",
    "Trigger sync for en specifik data source. Bruger Inngest til at starte baggrundssync.",
    {
      client_name: z.string().describe("Klientens navn"),
      source_type: z.enum(["meta", "google_ads", "klaviyo"]).describe("Kildetype der skal synkes"),
    },
    async ({ client_name, source_type }) => {
      const dashboardUrl = process.env.DASHBOARD_URL;
      if (!dashboardUrl) return err("DASHBOARD_URL env var ikke sat");
      const sb = getSupabase();
      const client = await findClient(sb, client_name);
      if (!client) return noClient(client_name);

      // Find the data source
      const { data: sources } = await sb
        .from("data_sources")
        .select("id")
        .eq("client_id", client.id)
        .eq("source_type", source_type)
        .eq("is_active", true)
        .limit(1);

      if (!sources?.length) return err(`Ingen aktiv ${source_type} data source for ${client.name}`);

      try {
        const resp = await fetch(`${dashboardUrl}/api/data-sources/${sources[0].id}/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-Source": "mcp",
          },
        });
        if (!resp.ok) return err(`Sync trigger fejlede: ${resp.status}`);
        return text(`${source_type} sync trigget for ${client.name}. Tjek status om 5-10 minutter.`);
      } catch (e: any) {
        return err(e.message);
      }
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

/** Return a "no data" response with a backfill suggestion */
function noData(clientName: string, dataType?: string) {
  const what = dataType ? `${dataType} ` : "";
  return text(
    `Ingen ${what}data for ${clientName} i perioden.\n\n` +
    `Vil du have, at jeg henter historisk data ind? Første gang henter jeg for 2 år — en backfill tager typisk 30–45 minutter, og jeg giver dig besked når det er klar.`
  );
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
