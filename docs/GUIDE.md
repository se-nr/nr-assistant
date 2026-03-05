# NR_assistant – Hvordan det hele virker

> En guide til hele teamet. Ingen kode-viden krævet.

---

## Hvad er NR_assistant?

NR_assistant er Neble+Rohdes interne AI-system der giver hele teamet adgang til:

1. **11 Elle skills** — guided workflows til onboarding, research, strategi, briefs, creative, analyse, review, weekly, discover, audit og help
2. **Automatisk data** — performance-data fra Supabase (Meta Ads, Klaviyo) uden at åbne Ads Manager
3. **Source-grounded research** — query NotebookLM notebooks direkte fra Claude

Det er bygget som et **Claude Code plugin** og installeres med én kommando.

---

## Hvem bruger hvad?

| Du er... | Du bruger... | Du får... |
|----------|-------------|-----------|
| **Teknisk (admin)** | Claude Code (CLI) | Alt: skills, commands, MCP, kan redigere systemet |
| **Ikke-teknisk** | Claude Desktop / claude.ai | MCP-adgang til data + klientkontekst |

---

## Installation (teknisk bruger)

```bash
# 1. Klon repo'et (kræver GitHub-adgang til se-nr)
git clone git@github.com:se-nr/nr-assistant.git ~/.claude/nr-assistant

# 2. Kør installer
bash ~/.claude/nr-assistant/install.sh

# 3. Genstart Claude Desktop
# 4. Færdig!
```

Installeren kopierer skills, opsætter MCP-konfiguration og checker at klient-kontekst er tilgængeligt.

---

## De 11 skills

### `/elle:onboard` — Ny klient
Guided onboarding med spørgsmål om brand, TOV, platforme, mål.
**Output:** `~/.claude/nr-assistant/clients/[klient]/overview.md`

**Eksempel:** "Onboard en ny klient der hedder Nordic Glow"

---

### `/elle:research` — Research
Querier NotebookLM automatisk (5 queries: value props, VoC+, VoC-, målgruppe, konkurrenter).
Falder tilbage til web research hvis ingen notebook.
**Output:** `~/.claude/nr-assistant/clients/[klient]/context/research-sources.md`

**Eksempel:** "Kør research for Zizzi"

---

### `/elle:strategy` — Brand & marketingstrategi *(fase-baseret)*
Komplet strategi i 5 faser med checkpoints: Context → Research → Planning → Execution → Review.
Brugeren godkender hver fase før næste starter.
**Output:** `~/.claude/nr-assistant/clients/[klient]/strategies/[dato]-[emne].md`

**Eksempel:** "Lav en marketingstrategi for Zizzi Q2"

---

### `/elle:brief` — Kampagne-brief
Bygger et kampagne-brief med hooks, copy angles, targeting.
Tjekker om research er lavet først (foreslår `/elle:research` hvis ikke).
**Output:** `~/.claude/nr-assistant/clients/[klient]/briefs/[dato]-[emne].md`

**Eksempel:** "Lav et brief for Zizzi Black Friday"

---

### `/elle:creative` — Creative copy
Genererer ad copy (primary text, headlines, descriptions) fra et eksisterende brief.
Formaterer til Meta Ads / Google Ads specs.
**Output:** `~/.claude/nr-assistant/clients/[klient]/creatives/[dato]-[emne].md`

**Eksempel:** "Skriv creative copy for det seneste Zizzi brief"

---

### `/elle:analyze` — Performance-analyse
Henter data automatisk via MCP (eller du indsætter manuelt).
Beregner altid ROAS med begge attribution-vinduer (7d_click+1d_view OG 1d_click).
**Output:** Rapport med executive summary, oversigtstabel, narrativ analyse, anbefaling.

**Eksempel:** "Analysér Zizzi's performance sidste 30 dage"

---

### `/elle:review` — Månedlig review
Komplet klient-rapport med top 3 kreative, næste måneds prioriteter.
Opdaterer klientens history.md med læringsmomenter.
**Output:** `~/.claude/nr-assistant/clients/[klient]/monthly-[YYYY-MM]-report.md`

**Eksempel:** "Månedsstatus for Zizzi februar"

---

## Data-flow

```
                    ┌─────────────────────┐
                    │   Meta Ads API      │
                    └──────────┬──────────┘
                               │ daglig sync (Inngest)
                               ▼
                    ┌─────────────────────┐
                    │     Supabase        │
                    │  (24 tabeller)      │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │  Dashboard   │ │  Agency MCP  │ │  Ad-hoc      │
      │  (browser)   │ │  (Claude)    │ │  scripts     │
      └──────────────┘ └──────────────┘ └──────────────┘
```

Du behøver aldrig åbne Ads Manager for at se data — MCP'en henter det automatisk fra Supabase.

---

## MCP Tools (hvad Claude kan hente automatisk)

| Tool | Hvad det gør | Eksempel |
|------|-------------|---------|
| `get_clients` | Viser alle klienter | "Vis alle klienter" |
| `get_performance` | Spend, ROAS, køb, CTR | "Hvordan performer Zizzi?" |
| `get_top_ads` | Top N annoncer sorteret | "Top 5 ads for Zizzi efter ROAS" |
| `get_client_context` | Brand, TOV, målgruppe | "Hvad er Zizzi's TOV?" |
| `get_demographic_breakdown` | Alder/køn/placement | "Breakdown for Zizzi efter alder" |
| `trigger_sync` | Trigger ny data-sync | "Sync Zizzi's data" |

---

## Klient-database

Alle klientoplysninger ligger i `~/.claude/nr-assistant/clients/` (lokalt, gitignored):

```
clients/
├── zizzi/
│   ├── overview.md          ← Brand, TOV, platforme, mål
│   ├── history.md           ← Læringsmomenter over tid
│   ├── context/
│   │   └── research-sources.md  ← VoC, konkurrenter
│   ├── strategies/          ← Brand & marketingstrategier
│   ├── briefs/              ← Kampagne-briefs
│   ├── creatives/           ← Genereret copy
│   └── monthly-*-report.md  ← Månedlige rapporter
├── gastrotools/
│   └── ...
└── _research-sources-template.md
```

---

## Opdateringer

Når systemet opdateres (nye skills, forbedringer):

```bash
cd ~/.claude/nr-assistant
git pull
bash install.sh
```

Eller brug update-scriptet:
```bash
bash ~/.claude/nr-assistant/update.sh
```

---

## Relation til marketing-ai-agents

NR_assistant erstatter **ikke** marketing-ai-agents — de supplerer hinanden:

| System | Fokus | Styrke |
|--------|-------|--------|
| **marketing-ai-agents** | Content-produktion (14 agents, copywriting, præsentationer) | Bred — dækker alle kanaler og output-typer |
| **NR_assistant (Elle)** | Guided workflows + automatisk data | Dyb — automatiserer data, research og rapportering |

De deler klient-data via `~/.claude/nr-assistant/clients/` (Elle) og `workspace/clients/` (marketing-ai-agents).

---

## Sikkerhed

- **GitHub repo** er privat — kun inviterede teammedlemmer har adgang
- **Supabase credentials** er i env vars, aldrig i koden
- **Remote MCP** (Vercel) kræver API key i Authorization header
- **Klientdata** lever lokalt i `~/.claude/nr-assistant/clients/` (gitignored, aldrig pushet)

---

## Fejlfinding

| Problem | Løsning |
|---------|---------|
| Commands virker ikke | Kør `bash install.sh` igen |
| MCP data mangler | Tjek at Supabase credentials er sat i env vars |
| NotebookLM fejler | Kør `cd ~/.claude/skills/notebooklm && python scripts/run.py auth_manager.py setup` |
| Gamle data | Kør `trigger_sync` eller vent til kl. 06:00 (daglig auto-sync) |
| Ny klient mangler | Kør `/elle:onboard [klient]` først |
