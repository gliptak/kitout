import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  globalSkillRoots,
  projectSkillRoots,
  readConfig,
} from '../.plugin/sync.js'

// ---------------------------------------------------------------------------
// readConfig
// ---------------------------------------------------------------------------

describe('readConfig', () => {
  it('returns null for non-existent file', () => {
    const result = readConfig('/does/not/exist/kitout.json')
    assert.equal(result, null)
  })

  it('returns null for malformed JSON', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kitout-test-'))
    const file = path.join(tmp, 'kitout.json')
    fs.writeFileSync(file, 'not valid json')
    const result = readConfig(file)
    assert.equal(result, null)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns config with repos tagged by sourceFile', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kitout-test-'))
    const file = path.join(tmp, 'kitout.json')
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: '1',
        repos: [
          { url: 'https://github.com/a/a' },
          { url: 'https://github.com/b/b', skills: [{ skill: 'tdd' }] },
        ],
      }),
    )
    const result = readConfig(file)
    assert.notEqual(result, null)
    assert.equal(result.repos.length, 2)
    for (const repo of result.repos) {
      assert.equal(
        repo.sourceFile,
        file,
        `repo ${repo.url} should have sourceFile set`,
      )
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns config without repos unchanged', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kitout-test-'))
    const file = path.join(tmp, 'kitout.json')
    fs.writeFileSync(file, JSON.stringify({ version: '1' }))
    const result = readConfig(file)
    assert.notEqual(result, null)
    assert.equal(result.version, '1')
    assert.equal(result.repos, undefined)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

// ---------------------------------------------------------------------------
// projectSkillRoots
// ---------------------------------------------------------------------------

describe('projectSkillRoots', () => {
  it('includes .pi/skills', () => {
    const cwd = process.cwd()
    const relativePaths = projectSkillRoots.map((p) => path.relative(cwd, p))
    assert.ok(
      relativePaths.includes(path.join('.pi', 'skills')),
      `expected .pi/skills in [${relativePaths.join(', ')}]`,
    )
  })

  it('includes .agents/skills', () => {
    const cwd = process.cwd()
    const relativePaths = projectSkillRoots.map((p) => path.relative(cwd, p))
    assert.ok(relativePaths.includes(path.join('.agents', 'skills')))
  })

  it('includes .claude/skills', () => {
    const cwd = process.cwd()
    const relativePaths = projectSkillRoots.map((p) => path.relative(cwd, p))
    assert.ok(relativePaths.includes(path.join('.claude', 'skills')))
  })
})

// ---------------------------------------------------------------------------
// globalSkillRoots
// ---------------------------------------------------------------------------

describe('globalSkillRoots', () => {
  it('includes ~/.pi/agent/skills', () => {
    const home = os.homedir()
    const relativePaths = globalSkillRoots.map((p) => path.relative(home, p))
    assert.ok(
      relativePaths.includes(path.join('.pi', 'agent', 'skills')),
      `expected .pi/agent/skills in [${relativePaths.join(', ')}]`,
    )
  })

  it('includes ~/.agents/skills', () => {
    const home = os.homedir()
    const relativePaths = globalSkillRoots.map((p) => path.relative(home, p))
    assert.ok(relativePaths.includes(path.join('.agents', 'skills')))
  })

  it('includes ~/.claude/skills', () => {
    const home = os.homedir()
    const relativePaths = globalSkillRoots.map((p) => path.relative(home, p))
    assert.ok(relativePaths.includes(path.join('.claude', 'skills')))
  })
})
