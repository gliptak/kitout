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

## Copilot CLI

**Inspect session logs** (each session writes a timestamped log):
```bash
ls ~/.copilot/logs/
tail ~/.copilot/logs/<latest>.log
```
Look for `service=plugin` or `hook` entries. If the hook is not mentioned at all, it means it did not fire (check `hooks.json` schema).

**Test the hook script directly** (runs outside of Copilot CLI):
```bash
node ~/.copilot/installed-plugins/_direct/gliptak--kitout/.plugin/sync.js
```
Run from your project directory so the project-scoped config (`.agents/kitout.json` etc.) is found. kitout errors print to stderr; success is silent.

**Verify symlinks were created**:
```bash
ls -la .agents/skills/          # project-scoped skills
ls -la ~/.agents/skills/        # global skills
```
Kitout-managed entries appear as symlinks (`->`) pointing into `~/.cache/kitout/repos/`.

**Check installed plugin files**:
```bash
ls ~/.copilot/installed-plugins/
cat ~/.copilot/installed-plugins/_direct/gliptak--kitout/.plugin/hooks.json
```

**Check the repo cache**:
```bash
ls ~/.cache/kitout/repos/
```
Each configured repo appears as `~/.cache/kitout/repos/<host>/<org>/<name>/`.
