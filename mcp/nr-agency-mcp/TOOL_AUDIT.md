# MCP Tool Audit — Dashboard API → MCP Coverage

> Opdateret: 2026-03-12 (v2.1.0)
> Formål: Sikre at alle dashboard API routes er eksponeret som MCP tools.

## Dækning

| Dashboard API Route | MCP Tool | Status |
|---------------------|----------|--------|
| **Meta Ads** | | |
| `/api/dashboard/insights` | `get_performance` | ✅ |
| `/api/internal/top-ads` | `get_top_ads` | ✅ |
| `/api/internal/demographics` | `get_demographic_breakdown`, `get_age_gender_breakdown`, `get_country_breakdown` | ✅ |
| `/api/campaigns` | `get_campaigns`, `get_campaign_details` | ✅ |
| `/api/ad-sets` (via Supabase) | `get_ad_sets` | ✅ |
| `/api/creatives` (via Supabase) | `get_creatives`, `get_ad_details`, `get_ad_image` | ✅ |
| `/api/internal/targets` | `get_targets` | ✅ |
| `/api/creatives/refresh-thumbnails` | `trigger_thumbnail_refresh` | ✅ |
| **Klaviyo** | | |
| `/api/klaviyo/stored-campaigns` | `get_klaviyo_stored_campaigns` | ✅ |
| `/api/klaviyo/stored-flows` | `get_klaviyo_stored_flows` | ✅ |
| `/api/klaviyo/monthly-comparison` | `get_klaviyo_monthly` | ✅ |
| `/api/klaviyo/subject-analysis` | (via `get_klaviyo_stored_campaigns`) | ✅ partial |
| `/api/klaviyo/tag-config` | (via Supabase direct) | ✅ partial |
| **Google Ads** | | |
| `/api/google-ads/campaigns` | `get_google_campaigns` | ✅ |
| `/api/google-ads/keywords` | `get_google_keywords` | ✅ |
| `/api/google-ads/search-terms` | `get_google_search_terms` | ✅ |
| `/api/google/shopping` | `get_google_shopping` | ✅ |
| `/api/google/geo` | `get_google_geo` | ✅ |
| `/api/google/ad-groups` | `get_google_ad_groups` | ✅ |
| `/api/google/assets` | `get_google_assets` | ✅ |
| `/api/google/monthly-comparison` | `get_google_monthly_comparison` | ✅ |
| **Lead Cohorts** | | |
| `/api/lead-cohorts` | `get_lead_cohorts` | ✅ |
| `/api/lead-cohorts/campaign-breakdown` | `get_lead_campaign_breakdown` | ✅ |
| `/api/lead-cohorts/unmatched` | `get_lead_unmatched` | ✅ |
| **Dashboard / Cross-channel** | | |
| `/api/dashboard/cross-channel` | `get_cross_channel` | ✅ |
| `/api/dashboard/monthly-insights` | `get_monthly_insights` | ✅ |
| **AI** | | |
| `/api/ai/generate-review` | `generate_ai_review` | ✅ |
| **Data Sources** | | |
| `/api/data-sources` | `get_data_sources` | ✅ |
| `/api/data-sources/[id]/health` | `check_data_source_health` | ✅ |
| `/api/data-sources/[id]/sync` | `trigger_source_sync` | ✅ |
| **Supabase Storage** | | |
| `client-reports` bucket | `read_client_report`, `write_client_report`, `list_client_reports` | ✅ |
| `creative-thumbnails` bucket | (via `get_ad_image`) | ✅ |
| **Sync / Admin** | | |
| `/api/sync` | `trigger_sync` | ✅ |
| `/api/inngest` | `trigger_backfill` | ✅ |

## Ikke-eksponerede routes (bevidst udeladt)

| Route | Grund |
|-------|-------|
| `/api/auth/*` | Auth-flow, ikke relevant for MCP |
| `/api/data-sources/connect` | Bruger vault RPC, kræver interaktivt flow |
| `/api/settings/*` | UI-specifikke settings |
| `/api/inngest` (SDK handler) | Infrastruktur, ikke tool-egnet |
| `/api/cron/*` | Automatiske cron jobs |
| `/api/sync` (GET) | Status-polling, ikke tool-egnet |

## Vedligeholdelse

Når du tilføjer en ny dashboard API route:
1. Tilføj en tilsvarende MCP tool i `server.ts`
2. Opdater denne fil
3. Opdater `nr-agency-guide` prompten med det nye tool
4. Bump VERSION
