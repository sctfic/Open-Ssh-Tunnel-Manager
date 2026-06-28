/**
 * mockFs — provides an isolated temporary directory per test.
 *
 * Usage:
 *   import { useTempDir } from '../helpers/mockFs.js'
 *   import { mkdirSync, rmSync } from 'node:fs'
 *
 *   describe('MyRepo', () => {
 *     const tmp = useTempDir()
 *     beforeEach(() => tmp.setup())
 *     afterEach(() => tmp.cleanup())
 *   })
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function useTempDir() {
  let path

  return {
    setup() {
      path = mkdtempSync(join(tmpdir(), 'ostm-test-'))
    },
    cleanup() {
      if (path) {
        rmSync(path, { recursive: true, force: true })
        path = undefined
      }
    },
    get path() {
      return path
    },
    file(name) {
      return join(path, name)
    },
  }
}

export default useTempDir
