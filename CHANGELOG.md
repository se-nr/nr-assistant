# Changelog

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
