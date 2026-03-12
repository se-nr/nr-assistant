# Changelog

## [2.1.0] — 2026-03-12

### Nye features — 15 nye MCP tools (total: 66)
- **Client Reports** — laes markdown-rapporter fra Supabase Storage
  - `read_client_report` — hent indhold af en rapport-fil
  - `list_client_reports` — list filer og mapper i client-reports bucket
- **Google Ads udvidelse** — 5 nye tools:
  - `get_google_shopping` — Shopping produkt-performance med ROAS pr. produkt
  - `get_google_geo` — Geografisk performance pr. land
  - `get_google_ad_groups` — Ad group performance med kampagnefilter
  - `get_google_assets` — PMax asset groups og assets
  - `get_google_monthly_comparison` — MoM/YoY sammenligning med segment-filter
- **Lead-analyse** — 2 nye tools:
  - `get_lead_campaign_breakdown` — Kampagne-level ROAS med country filter
  - `get_lead_unmatched` — Umatchede leads uden ordrematch
- **Cross-channel** — 2 nye tools:
  - `get_cross_channel` — Meta + Google Ads side om side
  - `get_monthly_insights` — 12-maaneders trend + YTD
- **AI & Admin** — 4 nye tools:
  - `generate_ai_review` — AI-genereret performance review via Claude Haiku
  - `trigger_thumbnail_refresh` — Manuel creative thumbnail opdatering
  - `check_data_source_health` — Health check for alle data sources
  - `trigger_source_sync` — Trigger sync for specifik kilde
- **TOOL_AUDIT.md** — manifest der mapper alle dashboard API routes til MCP tools

### Forbedringer
- **MCP prompt guide** — opdateret med alle 66 tools inkl. nye kategorier (RAPPORTER, ADMIN)
- **Klaviyo routing fix** — prompt har nu eksplicit advarsel mod at bruge direkte Klaviyo API-tools (spring_copenhagen_*) til analyse. Subject lines, HTML og revenue-per-email KUN tilgængelig via Supabase-tools (get_klaviyo_stored_campaigns, get_klaviyo_campaign_content)
- Nyt workflow: "Klaviyo kampagne-indhold" → get_klaviyo_campaign_content
- MCP server version bumped til 2.0.0 internt

---

## [2.0.0] — 2026-03-12

### Nye features
- **Supabase-first Klaviyo analyse** — 3 nye MCP tools
  - `get_klaviyo_stored_campaigns` — tag-grupperet kampagnedata
  - `get_klaviyo_stored_flows` — flows med revenue share og MoM
  - `get_klaviyo_monthly` — maanedlige aggregater med MoM trends
- **`/elle:verify`** — ny skill til verifikation af data og beregninger
- **Kanal-kontekst filer** — client-context, meta-context, klaviyo-context, google-context
- **Grounded analyse-formater** — klaviyo-analysis, meta-analysis, google-analysis

### Forbedringer
- Data-source priority — Supabase som eneste datakilde til analyse
- MCP prompt guide med komplet tool-oversigt og workflows
- Elle marketplace sync

### Breaking changes
- Klaviyo API tools kun til real-time/operationelle tjek

---

## [1.3.0] — 2026-03-05

### Nye features
- `/elle:creative-test` — Hook pattern-analyse + test-koncepter + kalender
- `/elle:analyze` — Bleed detection
- `/elle:weekly` — History-context
- `/elle:help` — Version-check

### Forbedringer
- Alle 12 commands med eksplicit Exit-sektion
- Agent-stier opdateret til ~/.claude/nr-assistant/

---

## [1.2.0] — 2026-03-04

### Forbedringer
- Repo gjort self-contained
- Commands konverteret til /elle:X format

---

## [1.1.0] — 2026-03-03

### Nyt
- Elle rebrand
- Alle commands som /elle:*
