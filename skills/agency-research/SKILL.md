---
name: agency-research
description: |
  Kør research-fase for en klient. Querier NotebookLM automatisk hvis en notebook eksisterer, ellers web research.
  Output: udfyldt clients/[klient]/context/research-sources.md klar til brand strategi og copy.
  Trigger: "research klient", "kør research", "find VoC"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, Bash, WebSearch, WebFetch, AskUserQuestion
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Agency Research

Automatisk research-fase via NotebookLM (primær) eller web (fallback).

<execution_context>
@~/agency-context/agency/process.md
@~/agency-context/clients/_research-sources-template.md
@~/.claude/skills/notebooklm/SKILL.md
</execution_context>

<philosophy>
Claude er maskinen. Brugeren skal ikke hoppe frem og tilbage mellem systemer.
Al research hentes automatisk – NotebookLM er primær kilde, web er fallback.
Output er klar til brug uden manuelle mellemtrin.
</philosophy>

<process>

## Trin 1: Indlæs klient-kontekst

Læs `~/agency-context/clients/[klient]/overview.md` – hent:
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

## Trin 4b: Web Research Fallback (kun hvis ingen notebook)

Kør parallelt:
- Trustpilot-søgning: `[brand] site:trustpilot.com/review`
- Reddit: `[brand] OR [kategori] site:reddit.com`
- Konkurrenter: top 3-5 brands i kategorien, hvad siger de på forsiden?

Indsaml minimum 10 VoC-citater (5 positive, 5 negative).

## Trin 5: Gem output

Udfyld `~/agency-context/clients/[klient]/context/research-sources.md` med alle fund:
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
`~/agency-context/clients/[klient]/context/research-sources.md` – udfyldt med:
- NotebookLM notebook-reference
- VoC-citater (min. 10)
- Konkurrentlandskab (3-5)
- Sprogrelaterede mønstre
</output>
