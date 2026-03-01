---
name: agency-brief
description: |
  Lav et kampagne-brief med guided spørgsmål. Output: udfyldt brief template.
  Brug til at oprette kampagne-briefs for klienter.
  Trigger: "kampagne brief", "lav brief", "nyt brief"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, AskUserQuestion
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Agency Brief

Guided kampagne-brief oprettelse. Følger workflow fra agency-context.

## Kontekst-filer

Læs disse filer ved start:
- `~/agency-context/agency/process.md` – grundregler
- `~/agency-context/agency/templates/campaign-brief.md` – template
- `~/agency-context/workflows/campaign-brief.md` – fuld workflow

## Process

Udfør campaign-brief workflow fra kontekst-filerne ovenfor.

Hvis et klient-navn er angivet som argument:
1. Load `~/agency-context/clients/[klient-navn]/overview.md` hvis den eksisterer
2. Brug klient-konteksten til at informere brieffet
3. **Research-check**: Tjek om `~/agency-context/clients/[klient]/context/research-sources.md` eksisterer.
   Hvis den eksisterer: load den og brug research til at grunde briefet.
   Hvis den IKKE eksisterer: nævn det for brugeren – "Der er ikke lavet research for denne klient endnu. Overvej at køre /agency:research først for bedre funderet brief."

## Output

Gem som `~/agency-context/clients/[klient]/brief-[YYYY-MM-DD]-[kort-navn].md`
