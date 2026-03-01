---
name: agency-creative
description: |
  Lav et creative brief til det kreative team – klar til produktion.
  Brug til at oprette creative briefs med format-specs, hook, budskab og visuel retning.
  Trigger: "creative brief", "kreativ brief", "brief til produktion"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, AskUserQuestion
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Agency Creative Brief

Guided creative brief til kreativt team. Følger workflow fra agency-context.

## Kontekst-filer

Læs disse filer ved start:
- `~/agency-context/agency/process.md` – grundregler
- `~/agency-context/agency/templates/creative-brief.md` – template
- `~/agency-context/workflows/creative-brief.md` – fuld workflow

## Process

Udfør creative-brief workflow fra kontekst-filerne ovenfor.

Hvis et klient-navn er angivet som argument:
1. Load `~/agency-context/clients/[klient-navn]/overview.md` hvis den eksisterer
2. Tjek om der allerede er et kampagne-brief: `~/agency-context/clients/[klient]/brief-*.md`
   Brug eksisterende brief som grundlag hvis tilgængeligt
3. **Research-check**: Tjek om `~/agency-context/clients/[klient]/context/research-sources.md` eksisterer.
   Hvis den eksisterer: load VoC-citater og konkurrentlandskab – brug til at skærpe hooks og budskaber.
   Hvis den IKKE eksisterer: nævn det for brugeren.

## Output

Gem som `~/agency-context/clients/[klient]/creative-brief-[dato]-[kampagne].md`
