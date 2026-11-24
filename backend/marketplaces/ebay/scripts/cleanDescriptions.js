/** Plan and apply for clean-descriptions.js: eBay products whose saved description is a whole web page. */
const { cleanDescription } = require('../description')

async function run({ apply, db, log = console.log }) {
  const rows = (await db.load())
    .map((p) => [p, cleanDescription(p.description)])
    .filter(([p, clean]) => clean !== String(p.description ?? ''))
  log(`eBay products whose description is a whole web page: ${rows.length}`)
  if (!apply || !rows.length) {
    if (!apply && rows.length) log('Dry run: nothing written. Run again with --apply to fix them.')
    return { products: rows.length, applied: Boolean(apply) }
  }
  await db.backup(rows.map(([p]) => p))
  await db.write(rows.map(([p, clean]) => [p._id, clean]))
  log(`Fixed ${rows.length} description(s).`)
  return { products: rows.length, applied: true }
}

module.exports = { run }
