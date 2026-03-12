# Changelog

## [2.0.0] — 2026-03-12

### Nye features
- **Supabase-first Klaviyo analyse** — 3 nye MCP tools der laeser direkte fra Supabase i stedet for Klaviyo API
  - `get_klaviyo_stored_campaigns` — tag-grupperet kampagnedata, subject lines, CTOR, revenue
  - `get_klaviyo_stored_flows` — flows med revenue share og MoM
  - `get_klaviyo_monthly` — maanedlige aggregater med MoM trends og sync-fejl detection
- **`/elle:verify`** — ny skill til verifikation af data og beregninger i rapporter
- **Kanal-kontekst filer** — `client-context.md`, `meta-context.md`, `klaviyo-context.md`, `google-context.md`
- **Grounded analyse-formater** — `klaviyo-analysis.md`, `meta-analysis.md`, `google-analysis.md` med Supabase schema-reference

### Forbedringer
- **Data-source priority** — alle skills og agents bruger nu Supabase som eneste datakilde til analyse. Klaviyo API kun til real-time status
- **MCP prompt guide** — `nr-agency-guide` prompt med komplet tool-oversigt og workflows
- **CLAUDE_PROJECT_INSTRUCTIONS.md** — opdateret med 📊/🔄 markering og Supabase-first regler
- **Elle marketplace sync** — MCP server synkroniseret med `Neblerohde/elle-marketplace`

### Breaking changes
- Klaviyo API tools (`get_klaviyo_overview`, `get_klaviyo_flows`, etc.) maa ALDRIG bruges til analyse — kun til real-time/operationelle tjek

---

## [1.3.0] — 2026-03-05

### Nye features
- **`/elle:creative-test`** — Hook pattern-analyse fra top ads + test-koncepter + 30-dages kalender
- **`/elle:analyze`** — Bleed detection: flagger automatisk ads/campaigns med hoejt spend og lav ROAS
- **`/elle:weekly`** — History-context: laeser forrige uges rapport og highlighter aendringer uge-over-uge
- **`/elle:help`** — Version-check: advarer hvis en ny version er tilgaengelig

### Forbedringer
- Alle 12 commands har nu eksplicit Exit-sektion (ingen command kalder en anden command)
- Alle agent-stier opdateret fra `~/agency-context/` til `~/.claude/nr-assistant/`
- `update.sh` viser changelog efter opdatering

### Fixes
- Stale `~/agency-context/` stier fjernet fra alle agent- og workflow-filer

---

## [1.2.0] — 2026-03-04

### Forbedringer
- Repo gjort self-contained (ingen `~/agency-context/` afhængighed)
- Alle commands konverteret fra skills-format til commands-format (`/elle:X`)

---

## [1.1.0] — 2026-03-03

### Nyt
- Elle rebrand (fra "NR Agency" til "Elle")
- Alle commands tilgængelige som `/elle:*`
