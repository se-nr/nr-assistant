# NR_assistant – Admin-guide til Claude Code

Du arbejder i NR_assistant-pakken. Dette er Neble+Rohde's workflow system "Elle".

## Hvad er dette?

En installérbar pakke der giver hele teamet adgang til:
- **Elle commands** (`/elle:*`) – onboarding, brief, kreativ, analyse, review, research
- **NotebookLM MCP** – automatisk kildegrounded research via Google NotebookLM
- **N+R Agency MCP** – performance data fra Supabase + klientkontekst fra Google Drive
- **Knowledge base** (`knowledge/`) – process, benchmarks, templates, workflows, agent-instruktioner

## Pakke-struktur

```
~/.claude/nr-assistant/
├── VERSION                    ← Nuværende version
├── install.sh                 ← Installér alt på én maskine
├── update.sh                  ← Opdater og re-deploy
├── CLAUDE.md                  ← Du er her
├── commands/
│   ├── elle/                  ← Elle commands (→ /elle:*)
│   │   ├── onboard.md
│   │   ├── brief.md
│   │   ├── creative.md
│   │   ├── analyze.md
│   │   ├── review.md
│   │   ├── research.md
│   │   ├── strategy.md
│   │   ├── weekly.md
│   │   ├── discover.md
│   │   ├── audit.md
│   │   └── help.md
│   ├── analyze.md             ← Shortcuts (/analyze, /brief, ...)
│   ├── brief.md
│   └── ...
├── knowledge/                 ← Metodik, templates, workflows
│   ├── process.md
│   ├── benchmarks.md
│   ├── _template.md
│   ├── knowledge/             ← Kanal-viden (meta-ads, klaviyo, ...)
│   ├── templates/             ← Brief- og rapport-templates
│   ├── workflows/             ← Workflow-beskrivelser
│   └── agents/                ← Agent-instruktioner
├── clients/                   ← Klient-data (gitignored, lokalt)
│   └── [klient]/overview.md
├── mcp/
│   ├── notebooklm/
│   └── nr-agency-mcp/
├── config/
│   └── mcp-entries.json
└── scripts/
    └── update_mcp_config.py
```

## Admin-workflows

### Opdater en command
1. Redigér filen i `commands/elle/[navn].md`
2. Test med `/elle:[navn]` i Claude Code
3. Commit: `git add commands/ && git commit -m "feat(elle): ..."`
4. Push: `git push`
5. Teamet kører `./update.sh` for at få opdateringen

### Tilføj ny command
1. Opret `commands/elle/[ny].md` med korrekt frontmatter
2. Tilføj til `COMMANDS`-arrayet i `install.sh`
3. Test, commit, push

### Tilføj ny klient
1. Kør `/elle:onboard [klient]` for guided onboarding
2. Filen gemmes i `~/.claude/nr-assistant/clients/[klient]/overview.md`

## Vigtige stier

| Hvad | Sti |
|------|-----|
| Commands (kilde) | `~/.claude/nr-assistant/commands/elle/` |
| Commands (deployed) | `~/.claude/commands/elle/` |
| Knowledge | `~/.claude/nr-assistant/knowledge/` |
| Klient-data | `~/.claude/nr-assistant/clients/` |
| NotebookLM skill | `~/.claude/skills/notebooklm/` |
| Claude Desktop config | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Neble+Rohde dashboard | `~/neble-rohde-dashboard/` |
| Supabase data | Via dashboard eller Agency MCP |

## Relaterede systemer

- **Supabase**: Al Meta/Klaviyo performance data (syncs dagligt via Inngest)
- **NotebookLM**: Klientspecifik research (browser-automation, kræver lokal auth per bruger)
- **N+R Agency MCP (Vercel)**: Org-wide performance + kontekst-adgang for alle Claude-brugere

## Installér fra bunden (ny maskine)

```bash
git clone https://github.com/se-nr/nr-assistant ~/.claude/nr-assistant
bash ~/.claude/nr-assistant/install.sh
```

## NotebookLM første-gangs auth

```bash
cd ~/.claude/skills/notebooklm
python scripts/run.py auth_manager.py setup
```
