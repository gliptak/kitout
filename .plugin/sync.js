#!/usr/bin/env node
/**
 * kitout sync script — Copilot CLI SessionStart hook
 *
 * Reads kitout config, clones/pulls repos, and symlinks skill directories
 * into both .claude/skills/ and .agents/skills/ (project and user scope).
 *
 * Config is read from (all optional, merged additively):
 *   <cwd>/.opencode/kitout.json   (project — OpenCode)
 *   <cwd>/.claude/kitout.json     (project — Claude Code / Copilot CLI)
 *   <cwd>/.agents/kitout.json     (project — agentskills / OpenCode)
 *   ~/.opencode/kitout.json       (global — OpenCode)
 *   ~/.claude/kitout.json         (global — Claude Code / Copilot CLI)
 *   ~/.agents/kitout.json         (global — agentskills / OpenCode)
 *
 * Project and global repos are kept separate: project repos are symlinked into
 * the project's skill dirs (<cwd>/.claude/skills/, <cwd>/.agents/skills/) and
 * global repos are symlinked into the home skill dirs (~/.claude/skills/,
 * ~/.agents/skills/). This ensures repos configured at home scope are written to
 * home, and repos configured at project scope are written to the project.
 *
 * Skills are symlinked to (project repos):
 *   <cwd>/.agents/skills/<name>/
 *
 * Skills are symlinked to (global repos):
 *   ~/.agents/skills/<name>/
 *
 * Existing symlinks are refreshed; real dirs (user-managed) are skipped with a warning.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Shared helpers (inlined from .opencode/plugins/kitout.js)
// ---------------------------------------------------------------------------

function urlToCachePath(url, cacheBase) {
  let p = url.trim()
  p = p.replace(/^git@([^:]+):/, '$1/')
  p = p.replace(/^(https?|git|ssh):\/\//, '')
  p = p.replace(/\.git$/, '')
  return path.join(cacheBase, p)
}

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

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'pipe' })
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim() || ''
    throw new Error(
      stderr || `${cmd} ${args.join(' ')} exited with status ${result.status}`,
    )
  }
}

function ensureRepo(url, cachePath, ref) {
  try {
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true })
      run('git', ['clone', '--depth', '1', '--', url, cachePath])
      if (ref) {
        run('git', ['-C', cachePath, 'fetch', '--depth', '1', 'origin', ref])
        run('git', ['-C', cachePath, 'checkout', 'FETCH_HEAD'])
      }
    } else if (ref) {
      run('git', ['-C', cachePath, 'fetch', '--depth', '1', 'origin', ref])
      run('git', ['-C', cachePath, 'checkout', 'FETCH_HEAD'])
    } else {
      run('git', ['-C', cachePath, 'fetch', '--depth', '1', 'origin'])
      run('git', ['-C', cachePath, 'reset', '--hard', 'origin/HEAD'])
    }
    return cachePath
  } catch (e) {
    if (fs.existsSync(cachePath)) {
      console.warn(`kitout: failed to sync ${url} (using cached copy): ${e.message}`)
      return cachePath
    }
    console.warn(`kitout: failed to clone ${url}: ${e.message}`)
    return null
  }
}

function findSkillsRoot(repoPath) {
  const skillsDir = path.join(repoPath, 'skills')
  return fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()
    ? skillsDir
    : repoPath
}

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
// Paths
// ---------------------------------------------------------------------------

const cwd = process.cwd()
const home = os.homedir()
const cacheBase = path.join(
  process.env.XDG_CACHE_HOME || path.join(home, '.cache'),
  'kitout',
  'repos',
)

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function readConfig(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (e) {
    console.warn(`kitout: failed to read ${filePath}: ${e.message}`)
    return null
  }
}

const projectConfigOpenCode = readConfig(
  path.join(cwd, '.opencode', 'kitout.json'),
)
const projectConfigClaude = readConfig(path.join(cwd, '.claude', 'kitout.json'))
const projectConfigAgents = readConfig(path.join(cwd, '.agents', 'kitout.json'))
const globalConfigOpenCode = readConfig(
  path.join(home, '.opencode', 'kitout.json'),
)
const globalConfigClaude = readConfig(path.join(home, '.claude', 'kitout.json'))
const globalConfigAgents = readConfig(path.join(home, '.agents', 'kitout.json'))

// Project-scoped repos (from any project config file)
const projectRepos = mergeRepos(
  projectConfigOpenCode,
  projectConfigClaude,
  projectConfigAgents,
)

// Global-scoped repos (from any global config file)
const globalRepos = mergeRepos(
  globalConfigOpenCode,
  globalConfigClaude,
  globalConfigAgents,
)

if (projectRepos.length === 0 && globalRepos.length === 0) {
  process.exit(0) // NOOP — no config files or no repos listed
}

// ---------------------------------------------------------------------------
// Symlink management
// ---------------------------------------------------------------------------

/**
 * Create or refresh a symlink at linkPath → srcDir.
 * Skips (with warning) if the path exists as a real directory (user-managed).
 */
function symlinkSkill(srcDir, targetParentDir) {
  const name = path.basename(srcDir)
  const linkPath = path.join(targetParentDir, name)

  try {
    const stat = fs.lstatSync(linkPath)
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(linkPath) // remove stale/outdated symlink
    } else {
      console.warn(
        `kitout: ${linkPath} exists as a real directory (user-managed?), skipping`,
      )
      return
    }
  } catch {
    // Path does not exist — will be created below
  }

  fs.mkdirSync(targetParentDir, { recursive: true })
  fs.symlinkSync(srcDir, linkPath)
}

/**
 * Install skills from a repo into the given harness skill roots.
 */
function installRepoSkills(repo, skillRoots) {
  const cachePath = urlToCachePath(repo.url, cacheBase)
  const resolved = ensureRepo(repo.url, cachePath, repo.ref)
  if (!resolved) return

  for (const skillPath of resolveSkillPaths(resolved, repo.skills)) {
    for (const root of skillRoots) {
      symlinkSkill(skillPath, root)
    }
  }
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

// Project-scoped: symlink into project's .agents/skills/
const projectSkillRoots = [path.join(cwd, '.agents', 'skills')]

for (const repo of projectRepos) {
  installRepoSkills(repo, projectSkillRoots)
}

// Global-scoped: symlink into ~/.agents/skills/
const globalSkillRoots = [path.join(home, '.agents', 'skills')]

for (const repo of globalRepos) {
  installRepoSkills(repo, globalSkillRoots)
}
