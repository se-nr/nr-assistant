---
name: elle:onboard
description: |
  Onboard en ny klient med guided spørgsmål. Output: clients/[navn]/overview.md.
  Brug når en ny klient skal tilføjes til klient-databasen.
  Trigger: "onboard klient", "ny klient", "tilføj klient"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, Bash, AskUserQuestion, Task
version: 1.1.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Elle Onboard

Guided onboarding af en ny klient med auto-arkivering.

<execution_context>
@~/agency-context/agency/process.md
@~/agency-context/clients/_template.md
@~/agency-context/workflows/onboarding.md
</execution_context>

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

## Archiver

Når onboarding er færdig, spawn archiver agent via Task tool:
```
"Arkivér onboarding for [klient]. Output: [sti til overview.md]. Skill: onboard.
Opret history.md med initial entry.
Følg ~/agency-context/agency/agents/archiver.md"
```
