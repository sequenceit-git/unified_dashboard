/**
 * Renaming stored section ids to each shop's own API names (see scripts/rename-sections.js).
 * Uses each adapter's `renamedSections` (old → new). `planRename` touches no database.
 */
const registry = require('../marketplaces')

const renames = () => Object.fromEntries(registry.KEYS.map((key) => [key, registry.get(key).renamedSections || {}]))

/**
 * Sub-admin permissions: `shop:old` → `shop:new`; a bare `old` (any shop) stays and gains the bare
 * new names of the shops that renamed it. Shop API-access keys are renamed.
 * @returns {{ users: [any, string[]][], shops: [any, object][] }}
 */
function planRename({ users, shops }) {
  const map = renames()
  const plan = { users: [], shops: [] }
  for (const user of users) {
    const before = Array.isArray(user.allowedSections) ? user.allowedSections : []
    const after = []
    const add = (entry) => { if (!after.includes(entry)) after.push(entry) }
    for (const entry of before) {
      const [key, id] = entry.includes(':') ? entry.split(':') : [null, entry]
      if (key) add(`${key}:${map[key]?.[id] || id}`)
      else add(entry)
    }
    // A bare id (any shop) gains the bare new names: each is unique to one shop, so this grants
    // nothing new and never adds a shop the user doesn't have.
    for (const entry of before.filter((e) => !e.includes(':'))) {
      for (const key of registry.KEYS) if (map[key][entry]) add(map[key][entry])
    }
    if (JSON.stringify(after) !== JSON.stringify(before)) plan.users.push([user._id, after])
  }
  for (const shop of shops) {
    const access = shop.apiAccess || {}
    const rename = map[shop.marketplace] || {}
    if (!Object.keys(access).some((id) => rename[id])) continue
    plan.shops.push([shop._id, Object.fromEntries(Object.entries(access).map(([id, value]) => [rename[id] || id, value]))])
  }
  return plan
}

/** Plans the rename; with `apply` backs up, then writes. */
async function run({ apply, db, log = console.log }) {
  const data = await db.load()
  const plan = planRename(data)
  const summary = { users: plan.users.length, shops: plan.shops.length, applied: Boolean(apply) }
  log(`Sub-admins whose section permissions change: ${summary.users}; shops whose access keys change: ${summary.shops}`)
  if (!apply) {
    log('Dry run: nothing written. Run again with --apply to make these changes.')
    return summary
  }
  await db.backup(data)
  await db.writeUsers(plan.users)
  await db.writeShops(plan.shops)
  log('Done.')
  return summary
}

module.exports = { planRename, run }
