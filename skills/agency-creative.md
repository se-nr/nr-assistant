---
name: agency:creative
description: Lav et creative brief til det kreative team – klar til produktion
argument-hint: "[klient-navn]"
allowed-tools: [Read, Write, AskUserQuestion]
---

<execution_context>
@~/agency-context/agency/process.md
@~/agency-context/agency/templates/creative-brief.md
@~/agency-context/workflows/creative-brief.md
</execution_context>

<process>
Udfør creative-brief workflow fra execution_context.

Hvis et klient-navn er angivet som argument:
1. Load ~/agency-context/clients/[klient-navn]/overview.md hvis den eksisterer
2. Tjek om der allerede er et kampagne-brief: ~/agency-context/clients/[klient]/brief-*.md
   Brug eksisterende brief som grundlag hvis tilgængeligt
3. **Research-check**: Tjek om ~/agency-context/clients/[klient]/context/research-sources.md eksisterer.
   Hvis den eksisterer: load VoC-citater og konkurrentlandskab – brug til at skærpe hooks og budskaber.
   Hvis den IKKE eksisterer: nævn det for brugeren.

Gem output som ~/agency-context/clients/[klient]/creative-brief-[dato]-[kampagne].md
</process>
