const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const BACKEND = path.join(__dirname, '..')

test('every npm script file exists', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(BACKEND, 'package.json'), 'utf8'))
  const files = Object.values(scripts)
    .map((cmd) => /^node\s+(\S+\.js)/.exec(cmd)?.[1])
    .filter(Boolean)
  assert.ok(files.length >= 7, `expected the node scripts, found ${files.length}`)
  for (const file of files) {
    const abs = path.join(BACKEND, file)
    assert.ok(fs.existsSync(abs), `${file} is missing`)
    execFileSync(process.execPath, ['--check', abs])
  }
})
