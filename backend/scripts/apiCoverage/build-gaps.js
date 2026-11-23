/**
 * Writes docs/api-coverage/gaps/<key>.json: a gap note for every missing seller endpoint, from
 * gap-rules.js. Fails if an endpoint matches no rule. usage: node scripts/apiCoverage/build-gaps.js
 */
const fs = require('fs')
const path = require('path')
const { shopCoverage, DOCS } = require('./compare')
const RULES = require('./gap-rules')

function gapNotes(key) {
  const notes = {}
  const unmatched = []
  for (const r of shopCoverage(key).filter((x) => x.status === 'missing')) {
    const rule = RULES[key].find((x) => x.pattern.test(r.id))
    if (!rule) { unmatched.push(r.id); continue }
    notes[r.id] = { section: rule.section, size: rule.size, priority: rule.priority, value: rule.value }
  }
  if (unmatched.length) throw new Error(`${key}: no gap rule for ${unmatched.join(', ')}`)
  return notes
}

module.exports = { gapNotes }

if (require.main === module) {
  fs.mkdirSync(path.join(DOCS, 'gaps'), { recursive: true })
  for (const key of Object.keys(RULES)) {
    const notes = gapNotes(key)
    fs.writeFileSync(path.join(DOCS, 'gaps', `${key}.json`), `${JSON.stringify(notes, null, 2)}\n`)
    console.log(key, Object.keys(notes).length, 'gap notes')
  }
}
