---
name: agency:onboard
description: Onboard en ny klient – guided spørgsmål → clients/[navn]/overview.md
argument-hint: "[klient-navn]"
allowed-tools: [Read, Write, Bash, AskUserQuestion]
---

<execution_context>
@~/agency-context/agency/process.md
@~/agency-context/clients/_template.md
@~/agency-context/workflows/onboarding.md
</execution_context>

<process>
Udfør onboarding-workflow fra execution_context.

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

Gem output i ~/agency-context/clients/[klient-navn]/overview.md
</process>
