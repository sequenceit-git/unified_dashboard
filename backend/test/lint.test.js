const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const BACKEND = path.join(__dirname, '..')
// oxlint comes with the frontend's dev dependencies; the backend adds none of its own.
const OXLINT = path.join(BACKEND, '..', 'frontend', 'node_modules', '.bin', 'oxlint')

test('no undefined names or unreachable code (moved code must keep its imports)', { skip: !fs.existsSync(OXLINT) && 'frontend dependencies not installed' }, () => {
  const run = spawnSync(OXLINT, ['-A', 'all', '-D', 'no-undef', '-D', 'no-unreachable', '-c', '.oxlintrc.json', '.'], { cwd: BACKEND, encoding: 'utf8' })
  const problems = `${run.stdout}${run.stderr}`.split('\n').filter((line) => /eslint\((no-undef|no-unreachable)\)/.test(line))
  assert.deepEqual(problems, [])
})
