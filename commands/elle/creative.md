---
name: elle:creative
description: |
  Lav et creative brief til det kreative team – klar til produktion.
  Brug til at oprette creative briefs med format-specs, hook, budskab og visuel retning.
  Trigger: "creative brief", "kreativ brief", "brief til produktion"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, AskUserQuestion, Task
version: 1.1.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Elle Creative Brief

Guided creative brief med copywriter-agent og platform knowledge.

<execution_context>
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/knowledge/copywriting.md
@~/.claude/nr-assistant/knowledge/knowledge/meta-ads.md
@~/.claude/nr-assistant/knowledge/templates/creative-brief.md
@~/.claude/nr-assistant/knowledge/workflows/creative-brief.md
</execution_context>

## Process

Udfør creative-brief workflow fra kontekst-filerne ovenfor.

Hvis et klient-navn er angivet som argument:
1. Load `~/.claude/nr-assistant/clients/[klient-navn]/overview.md` hvis den eksisterer
2. Tjek om der allerede er et kampagne-brief: `~/.claude/nr-assistant/clients/[klient]/brief-*.md`
   Brug eksisterende brief som grundlag hvis tilgængeligt
3. **Research-check**: Tjek om `~/.claude/nr-assistant/clients/[klient]/context/research-sources.md` eksisterer.
   Hvis den eksisterer: load VoC-citater og konkurrentlandskab – brug til at skærpe hooks og budskaber.
   Hvis den IKKE eksisterer: nævn det for brugeren.

## Agent-spawning (valgfrit)

Hvis brugeren beder om ad copy som del af creative briefet, spawn `meta-ads-copywriter` agent:
```
"Skriv Meta Ads copy for [klient], kampagne: [kampagne-navn].
Brief: [indsæt brief-indhold]
VoC: [indsæt research-sources hvis tilgængelig]
Følg ~/.claude/nr-assistant/knowledge/agents/meta-ads-copywriter.md
Levér: 3-5 ad variationer med primary text, headline, description, CTA per funnel-stadie."
```

## Platform Knowledge

Brug meta-ads.md knowledge til at sikre:
- Format-specs matcher placements (1:1 feed, 9:16 stories)
- Creative specs overholder platform-begrænsninger
- Audience sizing er realistisk

## Output

Gem som `~/.claude/nr-assistant/clients/[klient]/creative-brief-[dato]-[kampagne].md`
