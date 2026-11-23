const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')

/** Compares `value` with test/__snapshots__/<name>.json; writes the file on the first run. */
function matchSnapshot(name, value) {
  const file = path.join(__dirname, '..', '__snapshots__', `${name}.json`)
  const json = JSON.parse(JSON.stringify(value))
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
    return
  }
  assert.deepStrictEqual(json, JSON.parse(fs.readFileSync(file, 'utf8')))
}

module.exports = { matchSnapshot }
