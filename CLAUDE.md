# NR_assistant – Admin-guide til Claude Code

Du arbejder i NR_assistant-pakken. Dette er Neble+Rohde's workflow system "Elle".

## Hvad er dette?

En installérbar pakke der giver hele teamet adgang til:
- **Elle skills** (`/elle:*`) – onboarding, brief, kreativ, analyse, review, research
- **NotebookLM MCP** – automatisk kildegrounded research via Google NotebookLM
- **N+R Agency MCP** – performance data fra Supabase + klientkontekst fra Google Drive
- **Agency kontekst** (`~/agency-context/`) – klient-database, workflows, templates

## Pakke-struktur

```
~/.claude/nr-assistant/
├── VERSION                    ← Nuværende version
├── install.sh                 ← Installér alt på én maskine
├── update.sh                  ← Opdater og re-deploy
├── CLAUDE.md                  ← Du er her
├── skills/                    ← Canonical source for alle Elle skills
│   ├── elle-onboard/SKILL.md
│   ├── elle-brief/SKILL.md
│   ├── elle-creative/SKILL.md
│   ├── elle-analyze/SKILL.md
│   ├── elle-review/SKILL.md
│   ├── elle-research/SKILL.md
│   ├── elle-strategy/SKILL.md
│   ├── elle-weekly/SKILL.md
│   ├── elle-discover/SKILL.md
│   ├── elle-audit/SKILL.md
│   └── elle-help/SKILL.md
├── mcp/
│   ├── notebooklm/            ← MCP wrapper til NotebookLM skill
│   │   ├── mcp_server.py
│   │   └── start_mcp.sh
│   └── nr-agency-mcp/         ← N+R Agency MCP (TypeScript/Vercel)
│       ├── src/index.ts
│       ├── package.json
│       └── README.md
├── config/
│   └── mcp-entries.json       ← MCP entries til claude_desktop_config.json
└── scripts/
    └── update_mcp_config.py   ← Merger MCP config sikkert
```

## Admin-workflows

### Opdater en skill
1. Redigér filen i `skills/elle-[navn]/SKILL.md`
2. Test med `/elle:[navn]` i Claude Code
3. Commit: `git add skills/ && git commit -m "feat(skill): ..."`
4. Push: `git push`
5. Teamet kører `./update.sh` for at få opdateringen

### Tilføj ny skill
1. Opret `skills/elle-[ny]/SKILL.md` med korrekt frontmatter
2. Tilføj til `SKILLS`-arrayet i `install.sh`
3. Test, commit, push

### Opdater N+R Agency MCP
1. Redigér `mcp/nr-agency-mcp/src/index.ts`
2. Byg: `cd mcp/nr-agency-mcp && npm run build`
3. Deploy: `vercel deploy --prod` (eller push til Vercel-connected repo)
4. Nye tools er tilgængelige for hele teamet automatisk

### Tilføj ny klient
1. Opret `~/agency-context/clients/[klient]/`
2. Kopier `~/agency-context/clients/_template.md` → `overview.md`
3. Kør `/elle:onboard [klient]` for guided onboarding
4. Push til agency-context GitHub

## Vigtige stier

| Hvad | Sti |
|------|-----|
| Skills (kilde) | `~/.claude/nr-assistant/skills/` |
| Skills (deployed) | `~/.claude/skills/` |
| NotebookLM skill | `~/.claude/skills/notebooklm/` |
| Agency kontekst | `~/agency-context/` |
| Claude Desktop config | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Neble+Rohde dashboard | `~/neble-rohde-dashboard/` |
| Supabase data | Via dashboard eller Agency MCP |

## Relaterede systemer

- **Supabase**: Al Meta/Klaviyo performance data (syncs dagligt via Inngest)
- **agency-context GitHub repo**: Klient-database, workflows, templates
- **NotebookLM**: Klientspecifik research (browser-automation, kræver lokal auth per bruger)
- **N+R Agency MCP (Vercel)**: Org-wide performance + kontekst-adgang for alle Claude-brugere

## Installér fra bunden (ny maskine)

```bash
git clone https://github.com/YOURORG/nr-assistant ~/.claude/nr-assistant
bash ~/.claude/nr-assistant/install.sh
```

## NotebookLM første-gangs auth

```bash
cd ~/.claude/skills/notebooklm
python scripts/run.py auth_manager.py setup
```
