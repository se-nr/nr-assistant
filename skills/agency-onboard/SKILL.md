---
name: agency-onboard
description: |
  Onboard en ny klient med guided spørgsmål. Output: clients/[navn]/overview.md.
  Brug når en ny klient skal tilføjes til agency-context databasen.
  Trigger: "onboard klient", "ny klient", "tilføj klient"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, Bash, AskUserQuestion
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Agency Onboard

Guided onboarding af en ny klient. Følger workflow fra agency-context.

## Kontekst-filer

Læs disse filer ved start:
- `~/agency-context/agency/process.md` – grundregler
- `~/agency-context/clients/_template.md` – skabelon
- `~/agency-context/workflows/onboarding.md` – fuld workflow

## Process

Udfør onboarding-workflow fra kontekst-filerne ovenfor.

Hvis et klient-navn er angivet som argument, brug det som udgangspunkt.
Ellers start med at spørge hvem klienten er.

**NotebookLM (spørg i Trin 4):**
Spørg: "Har klienten en NotebookLM notebook med research, markedsanalyse eller brand-dokumenter?"
Hvis ja: gem URL'en i overview.md under Marketing-setup → NotebookLM.
Tilføj også til library:
```bash
cd ~/.claude/skills/notebooklm && python scripts/run.py notebook_manager.py add \
  --url "[URL]" --name "[Klient] – Research" \
  --description "[Hvad der er i notebooken]" --topics "[relevante emner]"
```

## Output

Gem i `~/agency-context/clients/[klient-navn]/overview.md`
