# kitout

[![CI](https://github.com/gliptak/kitout/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gliptak/kitout/actions/workflows/ci.yml?query=branch%3Amain++)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

A config-driven skill loader for AI coding harnesses. Point it at a git repo with skills and kitout clones it, symlinks the skill directories into the right places, and the harness picks them up automatically.

**Supported harnesses:** OpenCode · Claude Code · GitHub Copilot CLI · Pi

> Security — context injection: Skills are injected directly into your AI session. Only add repos you have reviewed and trust. Pin with `ref` to freeze upstream changes.

## Quick start

Create `kitout.json` in your project root:

```json
{
  "$schema": "https://raw.githubusercontent.com/gliptak/kitout/main/kitout.schema.json",
  "version": "1",
  "repos": [
    {
      "url": "https://github.com/obra/superpowers",
      "skills": [{ "path": "skills/test-driven-development" }]
    }
  ]
}
```

Install the plugin for your harness (see below), then start a new session. Kitout clones the repo and registers the skill — no manual steps.

Omitting `skills` loads every skill it finds. Use `skills` to pick specific ones.

## Config format

kitout reads from **project** (`./kitout.json`) and **global** (`~/.kitout/kitout.json`). Both are optional. If both exist, they merge additively (URLs deduplicated). If neither exists, or both have no `repos`, kitout does nothing — no repos are cloned, no skills are loaded, no stale symlinks are removed.

```json
{
  "$schema": "https://raw.githubusercontent.com/gliptak/kitout/main/kitout.schema.json",
  "version": "1",
  "repos": [
    {
      "url": "https://github.com/obra/superpowers",
      "ref": "v2.0.0",
      "skills": [{ "path": "skills/test-driven-development" }]
    },
    {
      "url": "https://github.com/sickn33/antigravity-awesome-skills",
      "skills": [
        { "path": "plugins/antigravity-bundle-full-stack-developer/skills/senior-fullstack" },
        { "path": "skills/react/typescript-component" }
      ]
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `url` | Git repo URL (HTTPS or SSH) |
| `ref` | Branch, tag, or commit SHA to pin (omit for default branch HEAD) |
| `skills` | Array of `{path: "..."}` objects, paths relative to repo root. Omit to load all skills. |

### Skill paths

Skills are identified by their full path relative to the repo root. This avoids name collisions between repos and naturally supports nested skill layouts:

| Repo | Skill path |
|------|------------|
| obra/superpowers | `skills/test-driven-development` |
| sickn33/antigravity-awesome-skills | `plugins/antigravity-bundle-full-stack-developer/skills/senior-fullstack` |

See [`kitout.example1.json`](kitout.example1.json) and [`kitout.example2.json`](kitout.example2.json) for starting points. Validate with [`kitout.schema.json`](kitout.schema.json).

## How skills are loaded

Kitout clones each repo to `~/.kitout/cache/repos/<host>/<org>/<repo>` (shallow clone, pinned at `ref`). It then creates symlinks in the harness skill directories that include the cache path as a prefix, preventing name collisions:

```
.claude/skills/
  github.com/
    obra/
      superpowers/
        skills/
          test-driven-development/  → ~/.kitout/cache/.../superpowers/skills/tdd
```

The harness discovers `SKILL.md` files by scanning the skill directory recursively — no manual registration needed.

## Install by harness

| Harness | Install command | Notes |
|---------|----------------|-------|
| **OpenCode** | Add to `opencode.json`: `"plugin": ["kitout@git+https://github.com/gliptak/kitout.git"]` | Auto-cloned on first run. Pushes to `config.skills.paths`. |
| **Claude Code** | `claude plugin marketplace add gliptak/kitout && claude plugin install kitout@kitout` | Symlinks skill dirs on `SessionStart` hook. |
| **Copilot CLI** | `copilot plugin marketplace add gliptak/kitout && copilot plugin install kitout@kitout` | Plugin hooks are blocked by [#2540](https://github.com/github/copilot-cli/issues/2540) + [#1730](https://github.com/github/copilot-cli/issues/1730). Manual workaround: `node ~/.copilot/installed-plugins/kitout/kitout/sync.js` before each session. |
| **Pi** | Installed via `extensions/pi/index.ts` (bundled). | Runs `sync.js` on `session_start`. Registers `/kitout` command for manual sync. |

## Requirements

- `git` on `$PATH`
- Node.js 22+
- Supported agent harness

## Cache

Cache is at `~/.kitout/cache/repos/`.
## Troubleshooting

See [TROUBLESHOOT.md](TROUBLESHOOT.md) for debugging steps covering OpenCode and Copilot CLI.
