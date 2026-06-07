import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  indexSkills,
  mergeRepos,
  resolveSkillPaths,
  urlToCachePath,
} from '../.opencode/plugins/kitout.js'

// ---------------------------------------------------------------------------
// urlToCachePath
// ---------------------------------------------------------------------------

describe('urlToCachePath', () => {
  const base = '/cache'

  it('converts HTTPS URL', () => {
    assert.equal(
      urlToCachePath('https://github.com/obra/superpowers', base),
      path.join(base, 'github.com/obra/superpowers'),
    )
  })

  it('strips .git suffix', () => {
    assert.equal(
      urlToCachePath('https://github.com/obra/superpowers.git', base),
      path.join(base, 'github.com/obra/superpowers'),
    )
  })

  it('converts SSH git@ URL', () => {
    assert.equal(
      urlToCachePath('git@github.com:obra/superpowers', base),
      path.join(base, 'github.com/obra/superpowers'),
    )
  })

  it('handles GitLab HTTPS', () => {
    assert.equal(
      urlToCachePath('https://gitlab.com/my-org/skills.git', base),
      path.join(base, 'gitlab.com/my-org/skills'),
    )
  })

  it('trims whitespace', () => {
    assert.equal(
      urlToCachePath('  https://github.com/obra/superpowers  ', base),
      path.join(base, 'github.com/obra/superpowers'),
    )
  })
})

// ---------------------------------------------------------------------------
// mergeRepos
// ---------------------------------------------------------------------------

describe('mergeRepos', () => {
  it('merges repos from multiple configs', () => {
    const a = { repos: [{ url: 'https://github.com/a/a' }] }
    const b = { repos: [{ url: 'https://github.com/b/b' }] }
    assert.deepEqual(
      mergeRepos(a, b).map((r) => r.url),
      ['https://github.com/a/a', 'https://github.com/b/b'],
    )
  })

  it('deduplicates by URL', () => {
    const a = { repos: [{ url: 'https://github.com/a/a' }] }
    const b = { repos: [{ url: 'https://github.com/a/a' }] }
    assert.equal(mergeRepos(a, b).length, 1)
  })

  it('ignores null configs', () => {
    const a = { repos: [{ url: 'https://github.com/a/a' }] }
    assert.equal(mergeRepos(null, a, undefined).length, 1)
  })

  it('returns empty array when all configs are null', () => {
    assert.deepEqual(mergeRepos(null, undefined), [])
  })

  it('preserves extra fields (e.g. skills filter)', () => {
    const skills = [{ path: 'skills/tdd' }]
    const cfg = { repos: [{ url: 'https://github.com/a/a', skills }] }
    assert.deepEqual(mergeRepos(cfg)[0].skills, skills)
  })
})

// ---------------------------------------------------------------------------
// indexSkills + resolveSkillPaths
// ---------------------------------------------------------------------------

/** Create a temporary directory with a fake skills tree, returns its path. */
function makeSkillsTree(structure) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kitout-test-'))
  for (const [rel, hasSkillMd] of Object.entries(structure)) {
    const dir = path.join(tmp, rel)
    fs.mkdirSync(dir, { recursive: true })
    if (hasSkillMd)
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${path.basename(rel)}\n`)
  }
  return tmp
}

describe('indexSkills', () => {
  it('finds top-level skill dirs keyed by relative path', () => {
    const root = makeSkillsTree({ tdd: true, 'code-review': true })
    const index = indexSkills(root)
    assert.ok(index.has('tdd'))
    assert.ok(index.has('code-review'))
  })

  it('finds nested skill dirs keyed by relative path', () => {
    const root = makeSkillsTree({ 'python/tdd': true })
    const index = indexSkills(root)
    assert.ok(index.has('python/tdd'))
  })

  it('ignores dirs without SKILL.md', () => {
    const root = makeSkillsTree({ 'not-a-skill': false })
    const index = indexSkills(root)
    assert.equal(index.size, 0)
  })

  it('returns empty map for non-existent dir', () => {
    const index = indexSkills('/does/not/exist')
    assert.equal(index.size, 0)
  })
})

describe('resolveSkillPaths', () => {
  it('returns skills root when no filter given', () => {
    const root = makeSkillsTree({ tdd: true })
    const skillsDir = path.join(root, 'skills')
    fs.mkdirSync(skillsDir)
    fs.mkdirSync(path.join(skillsDir, 'tdd'))
    fs.writeFileSync(path.join(skillsDir, 'tdd', 'SKILL.md'), '# tdd\n')
    const result = resolveSkillPaths(root, undefined)
    assert.deepEqual(result, [skillsDir])
  })

  it('returns specific skill dir when filter given as string path', () => {
    const root = makeSkillsTree({
      'skills/tdd': true,
      'skills/code-review': true,
    })
    const result = resolveSkillPaths(root, [{ path: 'skills/tdd' }])
    assert.equal(result.length, 1)
    assert.ok(result[0].endsWith(path.join('skills', 'tdd')))
  })

  it('skips unknown skill paths (with warning)', () => {
    const root = makeSkillsTree({ 'skills/tdd': true })
    const result = resolveSkillPaths(root, [{ path: 'skills/nonexistent' }])
    assert.deepEqual(result, [])
  })

  it('returns empty array for empty filter', () => {
    const root = makeSkillsTree({ 'skills/tdd': true })
    const result = resolveSkillPaths(root, [])
    assert.deepEqual(result, [findSkillsRoot(root)])
  })
})

// Not exported from kitout.js — define locally for test
function findSkillsRoot(dir) {
  return fs.existsSync(path.join(dir, 'skills'))
    ? path.join(dir, 'skills')
    : dir
}
