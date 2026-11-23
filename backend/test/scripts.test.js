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

test('every relative require in npm script files resolves', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(BACKEND, 'package.json'), 'utf8'))
  for (const file of Object.values(scripts).map((cmd) => /^node\s+(\S+\.js)/.exec(cmd)?.[1]).filter(Boolean)) {
    const abs = path.join(BACKEND, file)
    const source = fs.readFileSync(abs, 'utf8')
    for (const [, request] of source.matchAll(/require\(['"](\.{1,2}\/[^'"]+)['"]\)/g)) {
      assert.doesNotThrow(() => require.resolve(path.resolve(path.dirname(abs), request)), `${file}: ${request}`)
    }
  }
})
