# kitout

[![CI](https://github.com/gliptak/kitout/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gliptak/kitout/actions/workflows/ci.yml?query=branch%3Amain++)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

A dynamic skill loader for AI coding harnesses. Configure a list of git repos and kitout clones them at session startup, registering their `SKILL.md` skills with the active harness.

**Supported harnesses:** OpenCode · GitHub Copilot CLI · Claude Code · Pi (plugin approach in progress)

> ⚠️ **Security — context injection:** Skills are injected directly into your AI session context. Only add repos you have personally reviewed and trust. Use `ref` to pin repos to a specific tag or commit SHA so unexpected upstream changes cannot affect your session.

## Config format

Create `kitout.json` in your project root (project) or `~/.kitout/kitout.json` (global):

```json
{
  "$schema": "https://raw.githubusercontent.com/gliptak/kitout/main/kitout.schema.json",
  "version": "1",
  "repos": [
    {
      "url": "https://github.com/obra/superpowers",
      "ref": "v2.0.0"
    },
    {
      "url": "https://github.com/my-org/my-skills",
      "skills": [{ "skill": "code-review" }]
    }
  ]
}
```

- **`ref`** — pin to a branch, tag, or full commit SHA (recommended for security)
- **`skills`** — select specific skills; omit to load all skills from the repo
- No config file = nothing loaded

See [`kitout.example1.json`](kitout.example1.json) and [`kitout.example2.json`](kitout.example2.json) for copy-paste starting points. Validate with [`kitout.schema.json`](kitout.schema.json).

## OpenCode plugin

### Install

Add kitout to your `opencode.json` (project) or `~/.config/opencode/opencode.json` (global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "kitout@git+https://github.com/gliptak/kitout.git"
  ]
}
```

OpenCode clones the plugin repo automatically on first run — no manual `git clone` needed.

### Configure

Place `kitout.json` in any of these locations (all are optional and merged additively):

| Scope | Paths checked |
|-------|---------------|
| Project | `kitout.json` (in project root) |
| Global | `~/.kitout/kitout.json` |

### How it works

1. Reads the project kitout.json file (kitout.json in project directory)
2. Reads the global kitout.json file (~/.kitout/kitout.json)
3. Shallow-clones each repo to `~/.kitout/cache/repos/<host>/<org>/<repo>` (or pulls/checks out pinned ref if already cached)
4. Registers the `skills/` directory of each repo with OpenCode's native `config.skills.paths`

## Copilot CLI plugin

### Install

```bash
copilot plugin marketplace add gliptak/kitout
copilot plugin install kitout@kitout
```

Or from a local clone (development):

```bash
copilot plugin install ./path/to/kitout
```

### Configure

Place `kitout.json` in any of these locations (all optional, merged additively):

| Scope | Paths checked |
|-------|---------------|
| Project | `kitout.json` (in project root) |
| Global | `~/.kitout/kitout.json` |

### Known issues — implementation blocked

> ❌ **Plugin hooks do not fire in Copilot CLI.** Two open bugs block this integration:
>
> - [**#2540**](https://github.com/github/copilot-cli/issues/2540) — Plugin-defined `hooks.json` is silently ignored for all hook types (macOS, CLI 1.0.x, filed April 2026, open)
> - [**#1730**](https://github.com/github/copilot-cli/issues/1730) — `sessionStart` does not fire from `.github/hooks/` either (filed Feb 2026, open)
>
> The plugin installs correctly and skills declared statically in `plugin.json` load fine, but the `sync.js` hook that clones repos and creates symlinks never runs. No configuration workaround exists — these are confirmed CLI bugs.

**Manual workaround** until the bugs are fixed — run sync before starting a session:

```bash
node ~/.copilot/installed-plugins/kitout/kitout/sync.js
```

Or add a shell wrapper to your `~/.zshrc`:

```zsh
copilot() {
  node ~/.copilot/installed-plugins/kitout/kitout/sync.js 2>/dev/null
  command copilot "$@"
}
```

## Claude Code plugin

### Install

```bash
claude plugin marketplace add gliptak/kitout
claude plugin install kitout@kitout
```

Or from a local clone (development):

```bash
claude plugin install ./path/to/kitout
```

### Configure

Place `kitout.json` in any of these locations (all optional, merged additively):

| Scope | Paths checked |
|-------|---------------|
 | Project | `kitout.json` (in project root) |
 | Global | `~/.kitout/kitout.json` |

### How it works

At each Claude Code session startup (via confirmed `SessionStart` hook):

1. Reads all config files listed above — all optional, repos deduplicated by URL
2. Shallow-clones each repo to `~/.kitout/cache/repos/<host>/<org>/<repo>` (or pulls/checks out pinned ref)
3. Symlinks each skill directory into `.claude/skills/` and `.agents/skills/` (project) or `~/.claude/skills/` and `~/.agents/skills/` (global)
4. Claude Code auto-scans those directories for `SKILL.md` files

## Requirements

- `git` on `$PATH`
- Node.js 22+
- Supported harness: OpenCode, GitHub Copilot CLI, or Claude Code

## Cache location

| Platform | Path |
|----------|------|
| Linux / macOS | `~/.kitout/cache/repos/` |
| Custom | Set `$XDG_CACHE_HOME` |

## Troubleshooting

See [TROUBLESHOOT.md](TROUBLESHOOT.md) for debugging steps covering OpenCode and Copilot CLI.
