/**
 * TikTok's listing check result → `{ ok, issues: [{ field, message, blocking }] }`. Fail reasons and
 * pre-check failures block publishing; warnings and quality diagnoses don't.
 */
function checkSummary(data = {}) {
  const issues = [
    ...(data.fail_reasons || []).map((r) => ({ field: '', message: r.message || `Code ${r.code}`, blocking: true })),
    ...(data.pre_check_results || []).flatMap((item) => (item.pre_check_details || []).map((d) => ({
      field: (d.related_fields || [])[0] || item.pre_check_item || '',
      message: d.short_reason || d.long_reason || item.pre_check_item,
      blocking: true,
    }))),
    ...(data.warnings?.message ? [{ field: '', message: data.warnings.message, blocking: false }] : []),
    ...(data.diagnoses || []).flatMap((d) => (d.diagnosis_results || []).map((r) => ({ field: d.field || '', message: r.how_to_solve || `Code ${r.code}`, blocking: false }))),
  ]
  return { ok: !/FAIL/i.test(data.check_result || '') && !issues.some((i) => i.blocking), issues }
}

module.exports = { checkSummary }
