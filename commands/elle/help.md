---
name: elle:help
description: |
  Vis tilgængelige Elle-kommandoer og eksempel-prompts.
  Brug til at komme i gang med Elle skills og N+R MCP tools.
  Trigger: "elle help", "hvad kan du", "kom i gang"
allowed-tools: Read
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

<objective>
Display the complete Elle command reference and getting-started guide.

Output ONLY the reference content below. Do NOT add:
- Project-specific analysis
- Data lookups or tool calls
- Next-step suggestions
- Any commentary beyond the reference
</objective>

<execution_context>
@~/.claude/nr-assistant/guides/elle-help.md
</execution_context>

<process>
Output the complete elle help guide from @~/.claude/nr-assistant/guides/elle-help.md.
Display the reference content directly — no additions or modifications.
</process>
