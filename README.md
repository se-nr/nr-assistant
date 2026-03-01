# NR_assistant

Neble+Rohde's agency workflow system til Claude. Installér én gang – få alle skills, MCP-servere og workflows klar.

## Hvem er det til?

- **Alle på teamet**: Performance data, klientkontekst, guided workflows
- **Tekniske brugere (Claude Code)**: Skills, lokal MCP, admin-adgang
- **Ikke-tekniske brugere (Claude Desktop/claude.ai)**: MCP connector til data

## Installér

```bash
git clone https://github.com/YOURORG/nr-assistant ~/.claude/nr-assistant
bash ~/.claude/nr-assistant/install.sh
```

## Hvad installeres?

| Komponent | Beskrivelse |
|-----------|-------------|
| 6 agency skills | `/agency:onboard`, `:brief`, `:creative`, `:analyze`, `:review`, `:research` |
| NotebookLM skill | Source-grounded research via Google NotebookLM |
| N+R Agency MCP | Performance data fra Supabase (Meta Ads, Klaviyo) |
| MCP config | Automatisk tilføjet til Claude Desktop |

## Opdater

```bash
bash ~/.claude/nr-assistant/update.sh
```

## Admin-guide

Se [CLAUDE.md](CLAUDE.md) for fuld admin-dokumentation – redigér skills, tilføj tools, deploy MCP.

## Krav

- macOS (Claude Desktop path er macOS-specifik)
- Node.js 20+
- Python 3.10+ (til NotebookLM)
- Git
