/** TikTok's listing check (`{ ok, issues: [{ field, message, blocking }] }`) read for the List dialog. */

/** False when TikTok would refuse the listing (any blocking issue). */
export function canPublish(check) {
  return !check || !(check.issues || []).some((i) => i.blocking)
}

export function blockingIssues(check) {
  return (check?.issues || []).filter((i) => i.blocking).map((i) => (i.field ? `${i.field}: ${i.message}` : i.message))
}

/** Warnings and quality tips: shown, but publishing can go ahead. */
export function checkWarnings(check) {
  return (check?.issues || []).filter((i) => !i.blocking).map((i) => i.message)
}
