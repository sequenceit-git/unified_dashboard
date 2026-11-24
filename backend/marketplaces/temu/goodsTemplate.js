/**
 * Temu's category template (bg.local.goods.template.get) as the listing form and the payload
 * builder use it: attributes (isSale false) and variant types, each with Temu's ids, values,
 * units, and the parent attribute/values that make a child attribute apply (showCondition).
 */

/** One template property. */
function field(p) {
  const condition = (p.showCondition || [])[0]
  return {
    pid: p.pid,
    refPid: p.refPid,
    templatePid: p.templatePid,
    name: p.name,
    required: Boolean(p.required),
    multiple: Number(p.chooseMaxNum) > 1,
    values: (p.values || []).map((v) => ({ vid: v.vid, value: v.value, ...(v.specId != null ? { specId: v.specId } : {}) })),
    units: (p.valueUnitList || []).map((u) => ({ id: u.valueUnitId, name: u.valueUnit })),
    parent: condition ? { refPid: condition.parentRefPid, vids: condition.parentVids || [] } : null,
    ...(p.parentSpecId != null ? { parentSpecId: p.parentSpecId } : {}),
  }
}

/** `raw` = template.get's result; `size` = size.element.get's result (optional). */
function mapTemplate(raw = {}, size = null) {
  const info = raw.templateInfo || {}
  return {
    attributes: (info.goodsProperties || []).filter((p) => !p.isSale).map(field),
    variants: (info.goodsSpecProperties || []).map(field),
    customVariants: (raw.userInputParentSpecList || []).map((s) => ({ parentSpecId: s.parentSpecId, name: s.parentSpecName })),
    maxVariantTypes: raw.inputMaxSpecNum ?? null,
    sizeChart: { required: Boolean(size?.sizeSpecElementRule?.isSizeChartRequired) },
  }
}

module.exports = { mapTemplate, field }
