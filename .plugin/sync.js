#!/usr/bin/env node
/**
 * kitout sync script — Copilot CLI SessionStart hook
 *
 * Reads kitout config, clones/pulls repos, and symlinks skill directories
 * into harness-specific skill directories (project and user scope).
 *
 * Config is read from (all optional, merged additively):
 *   <cwd>/kitout.json               (project — project root)
 *   ~/.kitout/kitout.json            (global)
 *
 * Project and global repos are kept separate: project repos are symlinked into
 * the project's harness skill dirs and global repos into the home harness skill
 * dirs. This ensures repos configured at home scope are written to home, and
 * repos configured at project scope are written to the project.
 *
 * Skills are symlinked to harness skill directories (project or home scope).
 * See the install section below for the current list of harness targets.
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

function fetchRef(cachePath, ref) {
  // Try the ref as-is first (works for SHAs and some branch/tag names),
  // then fall back to explicit refs/tags/ and refs/heads/ to handle tags
  // that git servers don't advertise under short names in shallow fetches.
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

function ensureRepo(url, cachePath, ref, sourceFile) {
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
    const location = sourceFile ? ` (from ${sourceFile})` : ''
    if (fs.existsSync(cachePath)) {
      console.warn(
        `kitout: failed to sync ${url}${location} (using cached copy): ${e.message}`,
      )
      return cachePath
    }
    console.warn(`kitout: failed to clone ${url}${location}: ${e.message}`)
    return null
  }
}

function findSkillsRoot(repoPath) {
  const skillsDir = path.join(repoPath, 'skills')
  return fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()
    ? skillsDir
    : repoPath
}

function indexSkills(dir, rootDir, map = new Map()) {
  if (!fs.existsSync(dir)) return map
  rootDir ??= dir
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const child = path.join(dir, entry.name)
    if (fs.existsSync(path.join(child, 'SKILL.md'))) {
      const key = path.relative(rootDir, child)
      map.set(key, child)
    }
    indexSkills(child, rootDir, map)
  }
  return map
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const cwd = process.cwd()
const home = os.homedir()
const cacheBase = path.join(home, '.kitout', 'cache', 'repos')

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function readConfig(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs
      .readFileSync(filePath, 'utf8')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const config = JSON.parse(raw)
    // Tag each repo with its source config file
    if (config?.repos) {
      for (const repo of config.repos) {
        repo.sourceFile = filePath
      }
    }
    return config
  } catch (e) {
    console.warn(`kitout: failed to read ${filePath}: ${e.message}`)
    return null
  }
}

const projectConfig = readConfig(path.join(cwd, 'kitout.json'))
const globalConfig = readConfig(path.join(home, '.kitout', 'kitout.json'))

// Project-scoped repos (from project config file)
const projectRepos = mergeRepos(projectConfig)

// Global-scoped repos (from global config file)
const globalRepos = mergeRepos(globalConfig)

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
function symlinkSkill(srcDir, targetParentDir, linkRelPath) {
  const linkPath = path.join(targetParentDir, linkRelPath)

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

  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  fs.symlinkSync(srcDir, linkPath)
}

/**
 * Install skills from a repo into the given harness skill roots.
 * Adds the installed skill names to expectedNames for later reconciliation.
 */
function installRepoSkills(repo, skillRoots, expectedNames) {
  const cachePath = urlToCachePath(repo.url, cacheBase)
  const resolved = ensureRepo(repo.url, cachePath, repo.ref, repo.sourceFile)
  if (!resolved) return

  const repoPrefix = path.relative(cacheBase, cachePath)
  const skillPaths = []

  if (repo.skills?.length) {
    for (const entry of repo.skills) {
      const skillPath = entry?.path
      if (!skillPath) continue
      const dir = path.join(resolved, skillPath)
      if (fs.existsSync(path.join(dir, 'SKILL.md'))) {
        skillPaths.push({ src: dir, rel: skillPath })
      } else {
        console.warn(`kitout: skill "${skillPath}" not found in ${resolved}`)
      }
    }
  } else {
    // Load all — discover all skill dirs individually
    const root = findSkillsRoot(resolved)
    const skills = indexSkills(root)
    for (const [relPath, absPath] of skills) {
      skillPaths.push({ src: absPath, rel: relPath })
    }
  }

  for (const { src, rel } of skillPaths) {
    const linkRel = path.join(repoPrefix, rel)
    expectedNames.add(linkRel)
    for (const root of skillRoots) {
      symlinkSkill(src, root, linkRel)
    }
  }
}

/**
 * Remove any kitout-managed symlinks in skillRoot that are not in expectedNames.
 * Only symlinks whose target is under cacheBase are considered kitout-managed.
 * Real directories and symlinks created by other tools are never touched.
 */
function reconcileSkillRoot(skillRoot, expectedNames) {
  if (!fs.existsSync(skillRoot)) return
  const toRemove = []

  const walk = (dir, relPath) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = path.join(dir, entry.name)
      const childRel = relPath ? path.join(relPath, entry.name) : entry.name
      if (entry.isDirectory()) {
        walk(child, childRel)
      } else if (entry.isSymbolicLink()) {
        if (expectedNames.has(childRel)) continue
        let target
        try {
          target = fs.readlinkSync(child)
        } catch {
          continue
        }
        if (!target.startsWith(cacheBase)) continue // not kitout-managed
        toRemove.push(child)
      }
    }
  }
  walk(skillRoot, '')

  for (const linkPath of toRemove) {
    fs.unlinkSync(linkPath)
    console.warn(`kitout: removed stale symlink ${linkPath}`)
  }
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

// Project-scoped: symlink into project's .agents/skills/, .claude/skills/, and .pi/skills/
const projectSkillRoots = [
  path.join(cwd, '.agents', 'skills'),
  path.join(cwd, '.claude', 'skills'),
  path.join(cwd, '.pi', 'skills'),
]

const projectExpected = new Set()
for (const repo of projectRepos) {
  installRepoSkills(repo, projectSkillRoots, projectExpected)
}
for (const root of projectSkillRoots) {
  reconcileSkillRoot(root, projectExpected)
}

// Global-scoped: symlink into ~/.agents/skills/, ~/.claude/skills/, and ~/.pi/agent/skills/
const globalSkillRoots = [
  path.join(home, '.agents', 'skills'),
  path.join(home, '.claude', 'skills'),
  path.join(home, '.pi', 'agent', 'skills'),
]

const globalExpected = new Set()
for (const repo of globalRepos) {
  installRepoSkills(repo, globalSkillRoots, globalExpected)
}
for (const root of globalSkillRoots) {
  reconcileSkillRoot(root, globalExpected)
}

// ---------------------------------------------------------------------------
// Exported helpers — used by tests; not part of the CLI runtime
// ---------------------------------------------------------------------------
export {
  globalSkillRoots,
  indexSkills,
  installRepoSkills,
  projectSkillRoots,
  readConfig,
  reconcileSkillRoot,
  symlinkSkill,
  urlToCachePath,
}
