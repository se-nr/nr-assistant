# NR Agency MCP — Tool Guide

## Hvad er det?
MCP-serveren giver Claude direkte adgang til klientdata fra Supabase (og dashboard API). 25 tools til performance-analyse, kampagneoversigt, Google Ads, Shopify og cross-channel sammenligninger.

## Sådan bruger du det
Spørg Claude om klientdata i naturligt sprog. Claude vælger automatisk det rigtige tool.

---

## Hurtig-reference: Alle tools

### Klienter & Meta Ads
| Tool | Hvad det gør | Eksempel-prompt |
|------|-------------|-----------------|
| `get_clients` | List alle klienter med Meta account ID | "Vis alle klienter" |
| `get_performance` | Meta Ads aggregeret performance (spend, ROAS, CTR) | "Hvordan performer Gastrotools på Meta?" |
| `get_campaigns` | Kampagneliste med source-filter (meta/google_ads) | "Vis Google kampagner for Gastrotools" |
| `get_ad_sets` | Ad sets med source-filter | "Vis ad sets for Gastrotools" |
| `get_top_ads` | Top-performende ads sorteret efter ROAS/spend/clicks | "Hvad er de bedste ads for Gastrotools?" |
| `get_creatives` | Kreativ-detaljer (billeder, tekst, CTA) | "Vis creatives for Gastrotools" |
| `get_campaign_details` | Detaljeret view af en specifik kampagne | "Vis detaljer for kampagne X" |
| `get_demographic_breakdown` | Alder/køn-performance breakdown | "Hvilke aldersgrupper performer bedst?" |
| `get_country_breakdown` | Land-breakdown med ROAS/spend/purchases | "Hvilke lande performer bedst?" |
| `get_hourly_data` | Time-på-dag performance (seneste 7 dage) | "Hvornår performer vi bedst på dagen?" |
| `compare_periods` | Sammenlign to perioder (WoW, MoM) | "Sammenlign denne uge med sidste uge" |

### Google Ads
| Tool | Hvad det gør | Eksempel-prompt |
|------|-------------|-----------------|
| `get_google_performance` | Aggregeret Google Ads: spend, ROAS, CPA + Impression Share | "Hvordan performer Gastrotools på Google?" |
| `get_google_campaigns` | Google kampagner med type-labels (SEARCH/SHOPPING/PMAX) | "Hvilke Google kampagner kører for Gastrotools?" |
| `get_google_keywords` | Keywords med Quality Score + predicted CTR + landing page | "Vis keywords for Gastrotools sorteret efter QS" |
| `get_google_search_terms` | Faktiske søgetermer der udløste annoncer | "Hvad søger folk efter for Gastrotools?" |

### Cross-channel & Shopify
| Tool | Hvad det gør | Eksempel-prompt |
|------|-------------|-----------------|
| `get_channel_overview` | Meta vs Google side-by-side + Shopify blended ROAS | "Giv mig et cross-channel overblik for Gastrotools" |
| `get_shopify_revenue` | Shopify ordrer, brutto/netto revenue, AOV + land-breakdown | "Hvad er Shopify revenue for Gastrotools per land?" |
| `get_data_sources` | Hvilke kanaler er tilsluttet + sync-status | "Hvilke datakilder har Gastrotools?" |

### Leads & Klaviyo
| Tool | Hvad det gør | Eksempel-prompt |
|------|-------------|-----------------|
| `get_lead_cohorts` | Lead-kohorter med konverteringsrate og ROAS over tid | "Vis lead kohorter for SAYSKY" |
| `get_leads` | Individuelle leads med konverteringsdata | "Vis de seneste leads for Won Hundred" |
| `get_lead_orders` | Ordrer knyttet til specifikke leads | "Vis ordrer fra leads for SAYSKY" |

### Diverse
| Tool | Hvad det gør | Eksempel-prompt |
|------|-------------|-----------------|
| `get_client_documents` | Uploadede dokumenter for klient | "Vis dokumenter for Gastrotools" |
| `save_client_document` | Gem et dokument til klient | (bruges internt af andre skills) |
| `get_targets` | Performance-mål for klient | "Hvad er målene for Gastrotools?" |
| `trigger_sync` | Start en data-sync for klient | "Sync Gastrotools data" |

---

## Praktiske eksempler

### 1. "Giv mig et overblik over Gastrotools"
Claude bruger:
- `get_data_sources` → viser Meta + Google er tilsluttet
- `get_channel_overview` → side-by-side performance
- evt. `get_google_campaigns` + `get_campaigns (source=meta)` for detaljer

### 2. "Hvordan performer Google Ads for Gastrotools?"
Claude bruger:
- `get_google_performance` → aggregeret: 46.707 kr spend, 3.71x ROAS, 62.3% impression share
- `get_google_campaigns` → per-kampagne: Shopping Brand (25.12x ROAS) vs PMax (1.77x)
- evt. `get_google_keywords` → Quality Score analyse

### 3. "Hvilke søgetermer bruger vi penge på?"
Claude bruger:
- `get_google_search_terms` → 674 unikke termer, sorteret efter spend
- Output viser status (ADDED/EXCLUDED/NONE) + CPA per term

### 4. "Sammenlign Meta og Google for Gastrotools"
Claude bruger:
- `get_channel_overview` → én tabel med begge kanaler
- Viser spend-fordeling, ROAS per kanal, og blended ROAS med Shopify

---

## Time ranges

Alle tools der tager `time_range` accepterer:

| Format | Eksempel | Resultat |
|--------|---------|----------|
| Preset | `last_7d`, `last_30d`, `last_90d` | Seneste N dage |
| Preset | `this_month`, `last_month` | Nuværende/forrige måned |
| Måned | `2026-01` | Hele januar 2026 |
| Range | `2026-01-01:2026-01-31` | Eksakt interval |
| Dag | `2026-01-15` | Kun den dag |

---

## Test: Gastrotools DK (Meta + Google)

### Google Ads — virker ✅
```
get_google_performance → 46.707 kr spend, 3.71x ROAS, 160 conv.
                         Impression Share: 62.3%, tabt pga. ranking: 35.7%

get_google_campaigns   → 6 aktive kampagner:
                         Shopping Brand:      1.883 kr, 25.12x ROAS (top!)
                         Search Brand:          661 kr, 74.45x ROAS
                         Shopping Generisk:   8.202 kr,  3.19x ROAS
                         Shopping Bestsellers:18.209 kr,  1.94x ROAS
                         PMax Generisk:       8.610 kr,  1.77x ROAS
                         YouTube Awareness:   9.143 kr,  0.00x ROAS

get_google_keywords    → 3 keywords (kun brand), QS=10, alle ABOVE_AVERAGE

get_google_search_terms → 674 unikke termer, top: "gastrotools" (727 kr, 45 conv.)
                          Generiske: "stegepande" (404 kr, 2 conv.), "stålpande" (255 kr, 0 conv.)
```

### Meta Ads — kampagner virker ✅
```
get_campaigns (meta)   → 20+ kampagner, alle PAUSED (historisk konto)
get_data_sources       → Meta: act_364877008270183 ✅
                         Google: Gastrotools.dk, synced 2026-03-03 ✅
                         Klaviyo: DK, synced 2026-03-03 ✅
```

### Cross-channel ✅
```
get_channel_overview   → Google Ads: 46.707 kr (100% af spend), 3.71x ROAS
                         (Meta har ingen aktiv spend i perioden)
```

---

## Klienter med data per kanal

| Klient | Meta | Google Ads | Klaviyo | Shopify |
|--------|------|------------|---------|---------|
| Gastrotools DK | ✅ | ✅ | ✅ | ❌ |
| Gastrotools International | ✅ | ❌ | ❌ | ❌ |
| Kystfisken ApS | ✅ | ❌ | ✅ | ❌ |
| SAYSKY INT | ✅ | ❌ | ✅ | ❌ |
| Won Hundred (DKK) | ✅ | ❌ | ✅ | ❌ |
| Zizzi Global | ✅ | ❌ | ❌ | ❌ |

---

## Teknisk setup

MCP-serveren kører som **local stdio** (Claude Code) eller **HTTP via Vercel** (claude.ai).

**Lokal (Claude Code):**
```json
// .claude/nr-assistant/config/mcp-entries.json
{
  "nr-agency": {
    "command": "node",
    "args": ["/Users/isidor/.claude/nr-assistant/mcp/nr-agency-mcp/dist/src/index.js"]
  }
}
```

**Env vars (sættes automatisk via Vercel):**
- `SUPABASE_URL` — Supabase endpoint
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (fuld adgang)
- `DASHBOARD_URL` — N+R dashboard URL (til API-baserede tools)
- `DASHBOARD_API_KEY` — API key til dashboard (kun nødvendig for Meta insight-tools)

**Build:**
```bash
cd ~/.claude/nr-assistant/mcp/nr-agency-mcp
npm run build   # tsc → dist/src/
npm run dev     # tsx live-reload
```

**Test:**
```bash
node test-tools.mjs      # Alle 25 tools mod Zizzi
node test-google.mjs      # Google-specifik test mod Gastrotools
node test-meta-gastro.mjs # Meta-specifik test mod Gastrotools
```
