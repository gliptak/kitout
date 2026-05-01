# kitout

[![CI](https://github.com/gliptak/kitout/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gliptak/kitout/actions/workflows/ci.yml?query=branch%3Amain++)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

A dynamic skill loader for AI coding harnesses. Configure a list of git repos and kitout clones them at session startup, registering their `SKILL.md` skills with the active harness.

**Supported harnesses:** OpenCode · GitHub Copilot CLI · Claude Code

> ⚠️ **Security — context injection:** Skills are injected directly into your AI session context. Only add repos you have personally reviewed and trust. Use `ref` to pin repos to a specific tag or commit SHA so unexpected upstream changes cannot affect your session.

## Config format

Create `kitout.json` in `.opencode/`, `.claude/`, or `.agents/` (project) or under `~/` in any of the same dirs (global):

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
| Project | `.opencode/kitout.json` · `.claude/kitout.json` · `.agents/kitout.json` |
| Global | `~/.opencode/kitout.json` · `~/.claude/kitout.json` · `~/.agents/kitout.json` · `$XDG_CONFIG_HOME/opencode/kitout.json` |

### How it works

At each OpenCode session startup:

1. Reads all config files listed above — all optional, repos deduplicated by URL across all sources
2. Shallow-clones each repo to `$XDG_CACHE_HOME/kitout/repos/<host>/<org>/<repo>` (or pulls/checks out pinned ref if already cached)
3. Registers the `skills/` directory of each repo with OpenCode's native `config.skills.paths`
4. OpenCode discovers all `SKILL.md` files and makes them available in the session

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
| Project | `.opencode/kitout.json` · `.claude/kitout.json` · `.agents/kitout.json` |
| Global | `~/.opencode/kitout.json` · `~/.claude/kitout.json` · `~/.agents/kitout.json` |

### How it works

At each Copilot CLI session startup (via `SessionStart` hook):

1. Reads all config files listed above — all optional, repos deduplicated by URL
2. Shallow-clones each repo to `~/.cache/kitout/repos/<host>/<org>/<repo>` (or pulls/checks out pinned ref)
3. Symlinks each skill directory into `.agents/skills/` (project) or `~/.agents/skills/` (global)
4. Copilot CLI auto-scans those directories for `SKILL.md` files

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
| Project | `.opencode/kitout.json` · `.claude/kitout.json` · `.agents/kitout.json` |
| Global | `~/.opencode/kitout.json` · `~/.claude/kitout.json` · `~/.agents/kitout.json` |

### How it works

At each Claude Code session startup (via `SessionStart` hook):

1. Reads all config files listed above — all optional, repos deduplicated by URL
2. Shallow-clones each repo to `~/.cache/kitout/repos/<host>/<org>/<repo>` (or pulls/checks out pinned ref)
3. Symlinks each skill directory into `.agents/skills/` (project) or `~/.agents/skills/` (global)
4. Claude Code auto-scans those directories for `SKILL.md` files

## Requirements

- `git` on `$PATH`
- Node.js 22+
- Supported harness: OpenCode, GitHub Copilot CLI, or Claude Code

## Cache location

| Platform | Path |
|----------|------|
| Linux / macOS | `~/.cache/kitout/repos/` |
| Custom | Set `$XDG_CACHE_HOME` |

## Troubleshooting

See [TROUBLESHOOT.md](TROUBLESHOOT.md) for debugging steps covering OpenCode and Copilot CLI.
