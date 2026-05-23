/**
 * Pi extension for kitout.
 * On session start, runs the kitout sync script to symlink skills into Pi's
 * recognized directories (.pi/skills/, ~/.pi/agent/skills/).
 */

import path from 'node:path'
import { spawn } from 'node:child_process'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  // Helper to run sync.js
  async function runSync(): Promise<boolean> {
    try {
      // Locate sync.js relative to this extension.
      // When installed from the kitout repo, the extension is at
      //   extensions/pi/  and sync.js is at .plugin/sync.js
      const extensionDir = path.dirname(new URL(import.meta.url).pathname)
      const syncScript = path.resolve(extensionDir, '..', '..', '.plugin', 'sync.js')

      const proc = spawn('node', [syncScript], {
        stdio: 'inherit',
        env: process.env,
      })
      await new Promise<void>((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`sync.js exited with code ${code}`))
        })
        proc.on('error', reject)
      })
      return true
    } catch (e) {
      pi.ui.notify(`kitout sync failed: ${e.message}`, 'error')
      return false
    }
  }

  // Run sync when a session starts
  pi.on('session_start', async (_event, ctx) => {
    const ok = await runSync()
    if (ok) ctx.ui.notify('kitout skills synced', 'info')
  })

  // Register a /kitout command for manual sync
  pi.registerCommand('kitout', {
    description: 'Run kitout sync to update skills',
    handler: async (_args, ctx) => {
      const ok = await runSync()
      if (ok) ctx.ui.notify('kitout sync complete', 'info')
    },
  })
}
