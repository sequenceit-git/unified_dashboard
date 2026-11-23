const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const BACKEND = path.join(__dirname, '..')
const exists = (rel) => fs.existsSync(path.join(BACKEND, rel))

test('infrastructure lives in services/core', () => {
  for (const name of ['cache', 'redis', 'syncQueue', 'events', 'notify']) {
    assert.ok(exists(`services/core/${name}.js`), `services/core/${name}.js`)
    assert.ok(!exists(`services/${name}.js`), `services/${name}.js should have moved`)
  }
})
