# kitout

A dynamic skill loader for OpenCode. Configure a list of git repos and kitout clones them at session startup, registering their skills with OpenCode's native skill discovery.

## MVP: OpenCode plugin

### Install

Add kitout to your `opencode.json` (project) or `~/.config/opencode/opencode.json` (global with `$XDG_CONFIG_HOME` override):

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

Create `.agents/kitout.json` in your project (and/or `$XDG_CONFIG_HOME/opencode/kitout.json` globally):

```json
{
  "repos": [
    { "url": "https://github.com/obra/superpowers" },
    { "url": "https://gitlab.com/my-org/my-skills" }
  ]
}
```

See [`kitout.example1.json`](kitout.example1.json) (minimal config loading all skills from a single repo) and [`kitout.example2.json`](kitout.example2.json) (multi-repo) for copy-paste starting points.

No config file = nothing loaded. Any git URL is supported (GitHub, GitLab, self-hosted). The optional `skills` array on a repo entry selects specific skills instead of loading all of them.

### How it works

At each OpenCode session startup:

1. Reads `.agents/kitout.json` (project) and `$XDG_CONFIG_HOME/opencode/kitout.json` (global) — both optional, repos merged
2. Shallow-clones each repo to `$XDG_CACHE_HOME/kitout/repos/<host>/<org>/<repo>` (or pulls if already cached)
3. Registers the `skills/` directory of each repo with OpenCode's native `config.skills.paths`
4. OpenCode discovers all `SKILL.md` files and makes them available in the session

### Requirements

- `git` on `$PATH`
- Supported harness installed
  - OpenCode

### Cache location

| Platform | Path |
|----------|------|
| Linux / macOS | `~/.cache/kitout/repos/` |
| Custom | Set `$XDG_CACHE_HOME` |
