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
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/_template.md
@~/.claude/nr-assistant/knowledge/workflows/onboarding.md
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

Gem i `~/.claude/nr-assistant/clients/[klient-navn]/overview.md`

## Archiver

Naar onboarding er faerdig, spawn archiver agent via Task tool:
```
"Arkiver onboarding for [klient]. Output: [sti til overview.md]. Skill: onboard.
Opret history.md med initial entry.
Foelg ~/.claude/nr-assistant/knowledge/agents/archiver.md"
```

## Exit

Naar overview.md er gemt og archiver er spawnet: vis summary og stop.
Kald IKKE andre elle-commands automatisk.
