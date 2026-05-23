/**
 * kitout plugin for OpenCode
 *
 * Loads SKILL.md skills from git repos configured in:
 *   - .opencode/kitout.json    (project — OpenCode)
 *   - .claude/kitout.json      (project — Claude Code / Copilot CLI)
 *   - .agents/kitout.json      (project — agentskills / OpenCode)
 *   - .pi/agent/kitout.json      (project — Pi)
 *   - ~/.opencode/kitout.json  (global — OpenCode)
 *   - ~/.claude/kitout.json    (global — Claude Code / Copilot CLI)
 *   - ~/.agents/kitout.json    (global — agentskills / OpenCode)
 *   - ~/.pi/agent/kitout.json    (global — Pi)
 *   - $OPENCODE_CONFIG_DIR/kitout.json  (global — OpenCode XDG compat)
 *
 * All config files are optional and merged additively (deduped by URL).
 * For OpenCode this plugin registers all repos in-memory via config.skills.paths —
 * project vs global scope is not distinguished here because OpenCode handles
 * skill discovery natively. For symlink-based harnesses (Copilot CLI, Claude Code)
 * see .plugin/sync.js, which keeps project and global repos separate so skills
 * are written to the correct scope directory.
 *
 * Repos are shallow-cloned/pulled to:
 *   $XDG_CACHE_HOME/kitout/repos/<host>/<org>/<repo>
 *
 * Skill paths are registered via the OpenCode config hook so OpenCode's
 * native skill discovery picks them up with its standard glob (SKILL.md scan).
 *
 * Config format (both files use the same schema):
 *   {
 *     "version": "1",
 *     "repos": [
 *       { "url": "https://github.com/obra/superpowers" },
 *       { "url": "https://github.com/org/skills",
 *         "ref": "v2.0.0",
 *         "skills": [{ "skill": "tdd" }, { "skill": "code-review" }] }
 *     ]
 *   }
 *
 * "ref" pins the repo to a branch, tag, or commit SHA (optional; defaults to HEAD).
 * Omitting "skills" loads all skills from that repo.
 * No config files present = NOOP.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// XDG base dirs — mirrors xdg-basedir package logic used by OpenCode itself
// ---------------------------------------------------------------------------

function xdgCacheDir() {
  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
}

function xdgConfigDir() {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a git URL to a cache-relative directory path.
 * Examples:
 *   https://github.com/obra/superpowers.git  -> github.com/obra/superpowers
 *   git@github.com:obra/superpowers          -> github.com/obra/superpowers
 *   https://gitlab.com/my-org/skills         -> gitlab.com/my-org/skills
 */
function urlToCachePath(url, cacheBase) {
  let p = url.trim()
  p = p.replace(/^git@([^:]+):/, '$1/') // SSH → host/org/repo
  p = p.replace(/^(https?|git|ssh):\/\//, '') // strip protocol
  p = p.replace(/\.git$/, '') // strip .git suffix
  return path.join(cacheBase, p)
}

/** Read and parse a JSON config file; returns null if missing or invalid. */
function readConfig(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (e) {
    console.warn(`kitout: failed to read ${filePath}: ${e.message}`)
    return null
  }
}

/** Merge repos from multiple config objects, deduplicating by URL. */
function mergeRepos(...configs) {
  const seen = new Set()
  const repos = []
  for (const cfg of configs) {
    for (const repo of cfg?.repos ?? []) {
      if (!repo?.url || seen.has(repo.url)) continue
      seen.add(repo.url)
      repos.push(repo)
    }
  }
  return repos
}

/** Run a subprocess; throws on non-zero exit. */
function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'pipe' })
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim() || ''
    throw new Error(
      stderr || `${cmd} ${args.join(' ')} exited with status ${result.status}`,
    )
  }
}

/**
 * Fetch a specific ref from origin, trying short name, refs/tags/, and refs/heads/.
 * Shallow fetches don't always resolve short tag names, so we try all forms.
 */
function fetchRef(cachePath, ref) {
  const candidates = [ref, `refs/tags/${ref}`, `refs/heads/${ref}`]
  for (const candidate of candidates) {
    const result = spawnSync(
      'git',
      ['-C', cachePath, 'fetch', '--depth', '1', 'origin', candidate],
      { stdio: 'pipe' },
    )
    if (result.status === 0) {
      run('git', ['-C', cachePath, 'checkout', 'FETCH_HEAD'])
      return
    }
  }
  throw new Error(
    `could not fetch ref "${ref}" from origin (tried as-is, refs/tags/, refs/heads/)`,
  )
}

/**
 * Ensure a repo is cloned and up-to-date at cachePath.
 * If ref is provided, pin to that branch, tag, or SHA.
 * On network failure, falls back to the stale cache if it exists.
 * Returns the cache path, or null if unavailable.
 */
function ensureRepo(url, cachePath, ref) {
  try {
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true })
      run('git', ['clone', '--depth', '1', '--', url, cachePath])
      if (ref) fetchRef(cachePath, ref)
    } else if (ref) {
      fetchRef(cachePath, ref)
    } else {
      run('git', ['-C', cachePath, 'fetch', '--depth', '1', 'origin'])
      run('git', ['-C', cachePath, 'reset', '--hard', 'origin/HEAD'])
    }
    return cachePath
  } catch (e) {
    if (fs.existsSync(cachePath)) {
      console.warn(
        `kitout: failed to sync ${url} (using cached copy): ${e.message}`,
      )
      return cachePath
    }
    console.warn(`kitout: failed to clone ${url}: ${e.message}`)
    return null
  }
}

/**
 * Find the skills root within a cloned repo.
 * Prefers <repo>/skills/ when present; falls back to the repo root.
 * OpenCode scans the returned path with ** /SKILL.md (any depth).
 */
function findSkillsRoot(repoPath) {
  const skillsDir = path.join(repoPath, 'skills')
  return fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()
    ? skillsDir
    : repoPath
}

/**
 * Walk a directory tree recursively, collecting all dirs that contain SKILL.md.
 * Returns a map of skill-name → absolute-dir-path.
 */
function indexSkills(dir, map = new Map()) {
  if (!fs.existsSync(dir)) return map
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const child = path.join(dir, entry.name)
    if (fs.existsSync(path.join(child, 'SKILL.md'))) {
      map.set(entry.name, child)
    }
    indexSkills(child, map)
  }
  return map
}

/**
 * Given a repo path and a skills filter array (e.g. [{skill:"tdd"}, ...]),
 * return the list of skill directories to register.
 * Falls back to the whole skills root when no filter is provided.
 */
function resolveSkillPaths(repoPath, skillsFilter) {
  const root = findSkillsRoot(repoPath)
  if (!skillsFilter || skillsFilter.length === 0) return [root]

  const index = indexSkills(root)
  const paths = []
  for (const entry of skillsFilter) {
    const name = entry?.skill
    if (!name) continue
    const dir = index.get(name)
    if (dir) {
      paths.push(dir)
    } else {
      console.warn(`kitout: skill "${name}" not found in ${repoPath}`)
    }
  }
  return paths
}

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

export const KitoutPlugin = async ({ directory }) => {
  const cacheBase = path.join(xdgCacheDir(), 'kitout', 'repos')

  // Global config dir (XDG compat for OpenCode)
  const opencodeConfigDir =
    process.env.OPENCODE_CONFIG_DIR || path.join(xdgConfigDir(), 'opencode')

  const home = os.homedir()

  const projectConfigOpenCode = readConfig(
    path.join(directory, '.opencode', 'kitout.json'),
  )
  const projectConfigClaude = readConfig(
    path.join(directory, '.claude', 'kitout.json'),
  )
  const projectConfigAgents = readConfig(
    path.join(directory, '.agents', 'kitout.json'),
  )
  const projectConfigPi = readConfig(
    path.join(directory, '.pi', 'agent', 'kitout.json'),
  )
  const globalConfigXdg = readConfig(
    path.join(opencodeConfigDir, 'kitout.json'),
  )
  const globalConfigOpenCode = readConfig(
    path.join(home, '.opencode', 'kitout.json'),
  )
  const globalConfigClaude = readConfig(
    path.join(home, '.claude', 'kitout.json'),
  )
  const globalConfigAgents = readConfig(
    path.join(home, '.agents', 'kitout.json'),
  )
  const globalConfigPi = readConfig(
    path.join(home, '.pi', 'agent', 'kitout.json'),
  )

  const repos = mergeRepos(
    projectConfigOpenCode,
    projectConfigClaude,
    projectConfigAgents,
    projectConfigPi,
    globalConfigXdg,
    globalConfigOpenCode,
    globalConfigClaude,
    globalConfigAgents,
    globalConfigPi,
  )
  if (repos.length === 0) return {} // NOOP — no config files or no repos listed

  // Clone / pull all repos eagerly so paths are ready before the config hook runs
  const skillsPaths = []
  for (const repo of repos) {
    const cachePath = urlToCachePath(repo.url, cacheBase)
    const resolved = ensureRepo(repo.url, cachePath, repo.ref)
    if (resolved) {
      for (const p of resolveSkillPaths(resolved, repo.skills)) {
        skillsPaths.push(p)
      }
    }
  }

  return {
    /**
     * Register cloned skill directories with OpenCode's skill loader.
     * OpenCode scans each path for ** /SKILL.md and handles deduplication.
     */
    config: async (config) => {
      config.skills ??= {}
      config.skills.paths ??= []
      for (const p of skillsPaths) {
        if (!config.skills.paths.includes(p)) {
          config.skills.paths.push(p)
        }
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Exported helpers — used by tests; not part of the OpenCode plugin API
// ---------------------------------------------------------------------------
export {
  ensureRepo,
  indexSkills,
  mergeRepos,
  resolveSkillPaths,
  urlToCachePath,
}

export default KitoutPlugin
