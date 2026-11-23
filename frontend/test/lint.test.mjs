import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = path.join(import.meta.dirname, '..')

// Moved code must keep every name it uses (a missing one only fails when that screen renders).
test('no undefined names in src', () => {
  const run = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'oxlint'), ['-A', 'all', '-D', 'no-undef', '-D', 'react/jsx-no-undef', '-c', '.oxlintrc.json', 'src'], { cwd: ROOT, encoding: 'utf8' })
  const problems = `${run.stdout}${run.stderr}`.split('\n').filter((line) => /eslint(-plugin-react)?\((no-undef|jsx-no-undef)\)/.test(line))
  assert.deepEqual(problems, [])
})

// Browser globals that read as ordinary variable names. A bare `name` or `status` that lost its
// declaration (e.g. code moved into another component) silently reads window.name instead.
const SHADOWED = ['name', 'status', 'length', 'top', 'parent', 'self', 'origin', 'event', 'history', 'location', 'close', 'open', 'stop', 'print', 'find', 'closed', 'frames', 'opener', 'focus', 'blur', 'scroll']

test('no bare browser globals that look like variables (name, status, length, ...)', () => {
  const run = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'oxlint'), ['-A', 'all', '-D', 'no-undef', '-c', 'test/no-browser-globals.oxlintrc.json', 'src'], { cwd: ROOT, encoding: 'utf8' })
  const hits = `${run.stdout}${run.stderr}`.split('\n').filter((line) => SHADOWED.some((global) => line.includes(`'${global}' is not defined`)))
  assert.deepEqual(hits, [])
})
