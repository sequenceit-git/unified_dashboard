/** Plan and apply for remove-inbox-data.js: TikTok conversations, their messages and inbox notifications. */
async function run({ apply, db, log = console.log }) {
  const shopIds = await db.shopIds()
  const counts = await db.count(shopIds)
  const summary = { shops: shopIds.length, ...counts, applied: Boolean(apply) }
  log(`TikTok shops: ${summary.shops}; conversations: ${counts.conversations}; messages: ${counts.messages}; inbox notifications: ${counts.notifications}`)
  const any = counts.conversations + counts.messages + counts.notifications > 0
  if (!apply || !any) {
    if (!apply && any) log('Dry run: nothing deleted. Run again with --apply to delete them.')
    return summary
  }
  await db.backup(shopIds)
  await db.remove(shopIds)
  log('Deleted.')
  return summary
}

module.exports = { run }
