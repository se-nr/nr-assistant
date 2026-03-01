---
name: agency:brief
description: Lav et kampagne-brief – guided spørgsmål → udfyldt brief template
argument-hint: "[klient-navn]"
allowed-tools: [Read, Write, AskUserQuestion]
---

<execution_context>
@~/agency-context/agency/process.md
@~/agency-context/agency/templates/campaign-brief.md
@~/agency-context/workflows/campaign-brief.md
</execution_context>

<process>
Udfør campaign-brief workflow fra execution_context.

Hvis et klient-navn er angivet som argument:
1. Load ~/agency-context/clients/[klient-navn]/overview.md hvis den eksisterer
2. Brug klient-konteksten til at informere brieffet
3. **Research-check**: Tjek om ~/agency-context/clients/[klient]/context/research-sources.md eksisterer.
   Hvis den eksisterer: load den og brug research til at grunde briefet.
   Hvis den IKKE eksisterer: nævn det for brugeren – "Der er ikke lavet research for denne klient endnu. Overvej at køre /agency:research først for bedre funderet brief."

Gem output som ~/agency-context/clients/[klient]/brief-[YYYY-MM-DD]-[kort-navn].md
</process>
