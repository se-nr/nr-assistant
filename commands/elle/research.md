---
name: elle:research
description: |
  Kør research-fase for en klient. Querier NotebookLM automatisk hvis en notebook eksisterer, ellers web research.
  Output: udfyldt clients/[klient]/context/research-sources.md klar til brand strategi og copy.
  Trigger: "research klient", "kør research", "find VoC"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, Bash, WebSearch, WebFetch, AskUserQuestion, Task
version: 1.1.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Elle Research

Automatisk research-fase via NotebookLM (primær) eller web (fallback).

<execution_context>
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/knowledge/research-methodology.md
@~/.claude/nr-assistant/clients/_research-sources-template.md
@~/.claude/skills/notebooklm/SKILL.md
</execution_context>

<philosophy>
Claude er maskinen. Brugeren skal ikke hoppe frem og tilbage mellem systemer.
Al research hentes automatisk – NotebookLM er primær kilde, web er fallback.
Output er klar til brug uden manuelle mellemtrin.
</philosophy>

<process>

## Trin 1: Indlæs klient-kontekst

Læs `~/.claude/nr-assistant/clients/[klient]/overview.md` – hent:
- Brand-navn og kategori
- NotebookLM notebook URL (sektion 5, Marketing-setup)
- Hvad der allerede er dokumenteret

Læs også `clients/[klient]/context/research-sources.md` hvis den eksisterer.
Notér hvad der mangler.

## Trin 2: Check NotebookLM authentication

```bash
cd ~/.claude/skills/notebooklm && python scripts/run.py auth_manager.py status
```

Hvis ikke authenticated: Fortæl brugeren at et browservindue åbner til Google login.
```bash
cd ~/.claude/skills/notebooklm && python scripts/run.py auth_manager.py setup
```

## Trin 3: Tjek notebook library

```bash
cd ~/.claude/skills/notebooklm && python scripts/run.py notebook_manager.py list
```

**Scenarie A – Notebook eksisterer for klienten:**
→ Gå til Trin 4 (automatisk NotebookLM query)

**Scenarie B – Notebook eksisterer IKKE:**
→ Spørg brugeren: "Er der en NotebookLM notebook for [klient]?
  Hvis ja: del URL'en, så tilføjer jeg den.
  Hvis nej: jeg kører web research og du kan oprette en notebook bagefter."

Tilføj notebook hvis URL gives:
```bash
# Første: auto-discover indhold
cd ~/.claude/skills/notebooklm && python scripts/run.py ask_question.py \
  --question "What is the content of this notebook? What topics and documents are covered?" \
  --notebook-url "[URL]"

# Derefter: tilføj til library
cd ~/.claude/skills/notebooklm && python scripts/run.py notebook_manager.py add \
  --url "[URL]" \
  --name "[Klient-navn] – Research" \
  --description "[Baseret på auto-discover]" \
  --topics "[Baseret på auto-discover]"
```

## Trin 4: NotebookLM Research Query (automatisk)

Kør disse queries sekventielt mod klientens notebook.
Hvert svar: vurder om der er gaps → stil follow-up hvis nødvendigt.

**Query 1 – Brand og value propositions:**
```bash
cd ~/.claude/skills/notebooklm && python scripts/run.py ask_question.py \
  --question "What are the key value propositions for this brand? What makes it unique? What problems does it solve?" \
  --notebook-id [ID]
```

**Query 2 – Positive VoC:**
```bash
cd ~/.claude/skills/notebooklm && python scripts/run.py ask_question.py \
  --question "What do customers say positively about this brand or product? Include specific quotes if available." \
  --notebook-id [ID]
```

**Query 3 – Negative VoC og indvendinger:**
```bash
cd ~/.claude/skills/notebooklm && python scripts/run.py ask_question.py \
  --question "What are the main objections, complaints or barriers customers mention? What stops people from buying?" \
  --notebook-id [ID]
```

**Query 4 – Målgruppe:**
```bash
cd ~/.claude/skills/notebooklm && python scripts/run.py ask_question.py \
  --question "Who is the primary target audience? Describe demographics, psychographics and purchase motivations." \
  --notebook-id [ID]
```

**Query 5 – Konkurrenter:**
```bash
cd ~/.claude/skills/notebooklm && python scripts/run.py ask_question.py \
  --question "Who are the main competitors? How do they position themselves? What is the white space this brand can own?" \
  --notebook-id [ID]
```

Stil follow-up spørgsmål for hvert svar der er ufuldstændigt.
Kombiner alle svar til syntese inden Trin 5.

## Trin 4b: Web Research (hvis ingen notebook, ELLER som supplement)

Kør dette uanset om NotebookLM blev brugt — web research supplerer altid.

**Agent-spawning (valgfrit):** Spawn `brand-market-research` agent via Task tool:
```
"Lav web research for [klient]. Brand: [navn], Kategori: [kategori], Website: [URL]
Følg ~/.claude/nr-assistant/knowledge/agents/brand-market-research.md
Levér: VoC (min 10 citater), konkurrenter (3-5), white space, sprogmønstre."
```

Alternativt kør manuelt med WebSearch/WebFetch:

**4b.1 – Trustpilot VoC:**
1. WebSearch: `[brand] site:trustpilot.com/review`
2. WebFetch Trustpilot-siden → udtræk de seneste 10-20 anmeldelser
3. Kategorisér: positive temaer, negative temaer, gennemgående sprog

**4b.2 – Reddit/forum VoC:**
1. WebSearch: `[brand] OR [produktkategori] site:reddit.com`
2. WebFetch de 3-5 mest relevante tråde
3. Udtræk: ærlige meninger, sprog kunderne bruger, indvendinger

**4b.3 – Konkurrentanalyse:**
1. WebSearch: `[kategori] brands [land]` eller `best [produkttype] [land]`
2. Identificér top 3-5 konkurrenter
3. WebFetch hver konkurrents forside + "om os"-side
4. Notér: positionering, prisklasse, USP'er, tone, hvad de lover

**4b.4 – Brand's egen kommunikation:**
1. WebFetch brandets hjemmeside (forside + evt. "om os")
2. WebSearch: `[brand]` → se hvad der kommer op (presseomtaler, anmeldelser)
3. Notér: sproget de bruger om sig selv, claims, visuel stil

**4b.5 – Kategori-trends (valgfrit men værdifuldt):**
1. WebSearch: `[kategori] trends 2026` eller `[kategori] market`
2. WebFetch 1-2 relevante artikler
3. Notér: hvad bevæger sig i kategorien, hvad er kunderne optagede af

**Minimum output fra web research:**
- 10 VoC-citater (5 positive, 5 negative) med kilde-URL
- 3-5 konkurrenter med positionering og USP
- Brandets eget sprog og claims
- Kategori-kontekst (hvad sker der i markedet)

## Trin 5: Gem output

Udfyld `~/.claude/nr-assistant/clients/[klient]/context/research-sources.md` med alle fund:
- NotebookLM notebook URL og hvad der er hentet
- VoC-citater med kilde
- Konkurrentlandskab
- Sprogrelaterede mønstre

CHECKPOINT: Vis opsummering:
"Research-fase komplet. Her er hvad jeg fandt:
[executive summary i bullets]

Er der noget vigtigt der mangler eller er forkert?"

</process>

<output>
`~/.claude/nr-assistant/clients/[klient]/context/research-sources.md` – udfyldt med:
- NotebookLM notebook-reference
- VoC-citater (min. 10)
- Konkurrentlandskab (3-5)
- Sprogrelaterede mønstre
</output>
