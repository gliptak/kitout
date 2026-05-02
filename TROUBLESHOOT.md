# Troubleshooting

## OpenCode

**List skills discovered by OpenCode** (confirms kitout repos were loaded):
```bash
opencode debug skill
```

**Show resolved configuration** (confirms config files were found):
```bash
opencode debug config
```

**Show all global paths** (data dir, log dir, cache dir):
```bash
opencode debug paths
```

**Run with verbose logging** (prints kitout warnings and errors to stderr):
```bash
opencode --log-level DEBUG --print-logs
```

**Run without external plugins** (isolates whether an issue is in kitout or elsewhere):
```bash
opencode --pure
```

**Inspect session logs** (each session writes a timestamped log):
```bash
ls ~/.local/share/opencode/log/
tail -f ~/.local/share/opencode/log/<latest>.log
```
kitout errors appear as `ERROR service=plugin path=kitout@...` lines.

**Test the plugin script directly** (runs outside of OpenCode):
```bash
node .opencode/plugins/kitout.js
```
Any `console.warn` output from kitout (e.g. git failures, missing repos) is printed to stderr.

---

## Claude Code

**Note:** On first install, skills appear after restarting Claude Code. The `SessionStart` hook runs `sync.js` which creates the symlinks, but Claude scans for skills before hooks fire. On subsequent sessions the skills are already in place from the previous run.
```bash
claude plugin list
```

**Check that the SessionStart hook fired** (sync.js writes symlinks at startup):
```bash
ls -la .claude/skills/          # project-scoped skills
ls -la ~/.claude/skills/        # global skills
```
Kitout-managed entries appear as symlinks (`->`) pointing into `~/.cache/kitout/repos/`.

**Run sync manually** (re-runs outside of Claude, useful when debugging):
```bash
node ~/.claude/plugins/cache/kitout/*/sync.js
```
Run from your project directory so project-scoped config is found.

**Check Claude session logs** (hook stdout is captured; stderr appears in logs):
```bash
tail ~/.claude/logs/claude.log
```
Look for lines referencing `SessionStart` or `sync.js`.

**Check the repo cache**:
```bash
ls ~/.cache/kitout/repos/
```
Each configured repo appears as `~/.cache/kitout/repos/<host>/<org>/<name>/`.

---

## Copilot CLI

### Known limitation: plugin hooks do not fire

Two open bugs in the Copilot CLI issue tracker block kitout's hook-based integration:

- [**#2540**](https://github.com/github/copilot-cli/issues/2540) — Plugin `hooks.json` silently ignored for all hook types (CLI 1.0.x macOS, April 2026)
- [**#1730**](https://github.com/github/copilot-cli/issues/1730) — `sessionStart` also broken in project `.github/hooks/` (Feb 2026)

The plugin installs and its static components load, but `sync.js` never runs automatically.

**Workaround — run sync before each session.**

Add a shell function to your `~/.zshrc` (or `~/.bashrc`):
```zsh
copilot() {
  node ~/.copilot/installed-plugins/kitout/kitout/sync.js 2>/dev/null
  command copilot "$@"
}
```
This runs `sync.js` before every Copilot session so skills are in place at startup.

**Or run sync manually** (once per project, or after updating your config):
```bash
node ~/.copilot/installed-plugins/kitout/kitout/sync.js
```
Run from your project directory so project-scoped config (`.agents/kitout.json` etc.) is found.

---

**Verify symlinks were created**:
```bash
ls -la .agents/skills/          # project-scoped skills
ls -la ~/.agents/skills/        # global skills
```
Kitout-managed entries appear as symlinks (`->`) pointing into `~/.cache/kitout/repos/`.

**Inspect session logs** (each session writes a timestamped log):
```bash
ls ~/.copilot/logs/
tail ~/.copilot/logs/<latest>.log
```

**Check the repo cache**:
```bash
ls ~/.cache/kitout/repos/
```
Each configured repo appears as `~/.cache/kitout/repos/<host>/<org>/<name>/`.
