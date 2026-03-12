# N+R Agency MCP

Performance data + klientkontekst for hele Neble+Rohde teamet.

## Hvad kan den?

| Tool | Kilde | Beskrivelse |
|------|-------|-------------|
| `get_clients` | Supabase | List alle aktive klienter |
| `get_performance` | Dashboard API | Aggregeret spend, ROAS, køb for en klient |
| `get_top_ads` | Dashboard API | Top-performende annoncer sorteret efter ROAS/spend |
| `get_brand_context` | Supabase | Brand, TOV, målgruppe fra klient-databasen |
| `get_demographic_breakdown` | Dashboard API | Alder, køn, placement breakdown |
| `get_klaviyo_stored_campaigns` | 📊 Supabase | Kampagner med tag, subject line, CTOR, revenue |
| `get_klaviyo_stored_flows` | 📊 Supabase | Flows med revenue share |
| `get_klaviyo_monthly` | 📊 Supabase | MoM aggregater og trends |
| `get_klaviyo_overview` | 🔄 Klaviyo API | Real-time email overblik |
| `trigger_sync` | Dashboard API | Trigger data-sync for en klient |

Meta og Klaviyo data synkroniseres dagligt til Supabase. **Til analyse:** brug altid Supabase-tools (📊). Klaviyo API-tools (🔄) kun til real-time status.

## Setup (lokal)

```bash
cd ~/.claude/nr-assistant/mcp/nr-agency-mcp
npm install
cp .env.example .env
# Udfyld SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

## Deploy til Vercel (org-wide adgang)

```bash
# Én gang:
npm install -g vercel
vercel login

# Deploy:
cd ~/.claude/nr-assistant/mcp/nr-agency-mcp
vercel deploy --prod

# Sæt env vars i Vercel dashboard:
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NR_MCP_TOKEN (valgfri auth)
```

Når deployet: alle teammedlemmer tilføjer connectoren i Claude.ai Settings:
```
URL: https://nr-agency-mcp.vercel.app
Token: [NR_MCP_TOKEN]
```

## Lokalt i Claude Desktop

Tilføj til `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
"nr-agency": {
  "command": "node",
  "args": ["/Users/[dig]/.claude/nr-assistant/mcp/nr-agency-mcp/dist/index.js"],
  "env": {
    "SUPABASE_URL": "https://[projekt].supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "[nøgle]"
  }
}
```

## Environment variables

| Var | Påkrævet | Beskrivelse |
|-----|----------|-------------|
| `SUPABASE_URL` | ✓ | Supabase projekt URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | Service role nøgle (aldrig publiser!) |
| `DASHBOARD_URL` | Valgfri | URL til NR dashboard for trigger_sync |
| `NR_MCP_TOKEN` | Valgfri | Bearer token til org-wide auth |

## Opdater / tilføj tools

1. Redigér `src/index.ts`
2. Kør `npm run build`
3. For lokal brug: genstart Claude Desktop
4. For Vercel: `vercel deploy --prod`
