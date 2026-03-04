---
name: agency-help
description: |
  Vis tilgængelige agency-kommandoer og eksempel-prompts.
  Brug til at komme i gang med N+R Agency MCP tools og skills.
  Trigger: "agency help", "hvad kan du", "kom i gang"
allowed-tools: Read
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

<objective>
Display the complete N+R Agency command reference and getting-started guide.

Output ONLY the reference content below. Do NOT add:
- Project-specific analysis
- Data lookups or tool calls
- Next-step suggestions
- Any commentary beyond the reference
</objective>

<execution_context>
@~/.claude/nr-assistant/guides/agency-help.md
</execution_context>

<process>
Output the complete agency help guide from @~/.claude/nr-assistant/guides/agency-help.md.
Display the reference content directly — no additions or modifications.
</process>
