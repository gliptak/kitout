import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('extensions/pi/index.ts', () => {
  it('exports a default function that accepts (pi)', async () => {
    // import type is erased at runtime, so the .ts module loads cleanly
    const mod = await import('../extensions/pi/index.ts')
    assert.equal(
      typeof mod.default,
      'function',
      'default export must be a function',
    )
    assert.equal(mod.default.length, 1, 'default export must accept 1 argument')
  })

  it('registers session_start handler and /kitout command when loaded', async () => {
    const mod = await import('../extensions/pi/index.ts')

    // Build a mock pi object — records which events/commands register
    const registeredOn = []
    const registeredCommands = []
    const notifyCalls = []

    const mockPi = {
      on(event, handler) {
        registeredOn.push({ event, handler })
      },
      registerCommand(name, opts) {
        registeredCommands.push({ name, opts })
      },
      ui: {
        notify(msg, level) {
          notifyCalls.push({ msg, level })
        },
      },
    }

    // Activate the extension
    mod.default(mockPi)

    // Verify session_start handler was registered
    assert.equal(
      registeredOn.length,
      1,
      'should register exactly one event handler',
    )
    assert.equal(registeredOn[0].event, 'session_start')

    // Verify /kitout command was registered
    assert.equal(
      registeredCommands.length,
      1,
      'should register exactly one command',
    )
    assert.equal(registeredCommands[0].name, 'kitout')
    assert.equal(
      registeredCommands[0].opts.description,
      'Run kitout sync to update skills',
    )

    // Verify handler shapes
    assert.equal(
      typeof registeredOn[0].handler,
      'function',
      'session_start handler must be a function',
    )
    assert.equal(
      typeof registeredCommands[0].opts.handler,
      'function',
      '/kitout handler must be a function',
    )
  })
})
