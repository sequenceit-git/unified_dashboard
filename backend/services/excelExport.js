/**
 * Excel Export Service
 *
 * Generates a styled .xlsx file from ResearchReport opportunities.
 * Returns a Buffer that can be streamed directly to the HTTP response.
 *
 * Columns mirror the CSV catalog export exactly so both downloads stay in sync:
 * sku | title | description | category | brand | basePrice | currency | stock |
 * lowStockThreshold | weight | status | source | sourceUrl | listingUrl | otherUrl |
 * estimatedMarginPercent | opportunityScore
 */

const ExcelJS = require('exceljs')

// ─── Color palette ────────────────────────────────────────────────────────────
const HEADER_BG = '4F46E5'  // indigo-600
const HEADER_FG = 'FFFFFF'
const ROW_ODD   = 'F8F9FF'
const ROW_EVEN  = 'FFFFFF'
const SCORE_HIGH  = 'D1FAE5' // emerald-100
const SCORE_MED   = 'FEF3C7' // amber-100
const SCORE_LOW   = 'FEE2E2' // red-100

// ─── Column definitions (same order/names as CSV export) ─────────────────────
const COLUMNS = [
  { header: 'sku',                    key: 'sku',                    width: 22 },
  { header: 'title',                  key: 'title',                  width: 42 },
  { header: 'description',            key: 'description',            width: 60 },
  { header: 'category',               key: 'category',               width: 20 },
  { header: 'brand',                  key: 'brand',                  width: 16 },
  { header: 'basePrice',              key: 'basePrice',              width: 12 },
  { header: 'currency',               key: 'currency',               width: 10 },
  { header: 'stock',                  key: 'stock',                  width: 10 },
  { header: 'lowStockThreshold',      key: 'lowStockThreshold',      width: 16 },
  { header: 'weight',                 key: 'weight',                 width: 10 },
  { header: 'status',                 key: 'status',                 width: 12 },
  { header: 'source',                 key: 'source',                 width: 14 },
  { header: 'sourceUrl',              key: 'sourceUrl',              width: 50 },
  { header: 'listingUrl',             key: 'listingUrl',             width: 50 },
  { header: 'otherUrl',               key: 'otherUrl',               width: 50 },
  { header: 'estimatedMarginPercent', key: 'estimatedMarginPercent', width: 20 },
  { header: 'opportunityScore',       key: 'opportunityScore',       width: 18 },
]

const LAST_COL_LETTER = 'Q' // 17 columns (A–Q)

/** Only links the agent confirmed live; older unconfirmed reports export blank link cells. */
function verifiedLinks(rec) {
  if (!rec.linksVerified) return { sourceUrl: '', listingUrl: '', otherUrl: '' }
  const urls = (rec.sources || []).map((source) => source?.url).filter(Boolean)
  const listingUrl = rec.listingUrl || urls[0] || ''
  return {
    sourceUrl: urls[0] || '',
    listingUrl,
    otherUrl: urls.find((url) => url !== listingUrl) || '',
  }
}

// Build one export row using the exact same mapping as the CSV download,
// so xlsx and csv outputs never drift apart.
function buildExportRow(rec, i, timestampSuffix) {
  const title = rec.title || rec.productName || ''
  const category = rec.category || rec.metrics?.category || ''
  const basePrice = rec.metrics?.price != null ? rec.metrics.price : (rec.price ?? rec.metrics?.averagePrice ?? '')
  const description = rec.aiNotes || rec.recommendationReason || ''
  const { sourceUrl, listingUrl, otherUrl } = verifiedLinks(rec)
  const margin = rec.estimatedMargin != null ? rec.estimatedMargin : (rec.estimatedProfitMarginPercent ?? '')
  const score = rec.opportunityScore ?? ''

  // Preview SKU consistent with Product model pattern (same as CSV export)
  const catClean = (category || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'GEN'
  const sku = `BOT-${catClean}-${timestampSuffix}${i + 1}`

  return {
    sku,
    title,
    description,
    category,
    brand: '',
    basePrice: basePrice !== '' ? Number(basePrice) : '',
    currency: 'USD',
    stock: 0,
    lowStockThreshold: 5,
    weight: 1,
    status: 'draft',
    source: 'research_bot',
    sourceUrl,
    listingUrl,
    otherUrl,
    estimatedMarginPercent: margin !== '' ? Number(margin) : '',
    opportunityScore: score !== '' ? Number(score) : '',
  }
}

/**
 * Generate an Excel workbook buffer from an array of opportunity docs.
 *
 * @param {Array}  recommendations - Array of ResearchReport opportunity subdocs or plain objects
 * @param {object} meta            - { categories, niche, generatedAt }
 * @returns {Promise<Buffer>}      - xlsx file as a Buffer
 */
async function generateRecommendationsExcel(recommendations, meta = {}) {
  const workbook = new ExcelJS.Workbook()

  workbook.creator = 'US Client Automation Dashboard'
  workbook.created = new Date()
  workbook.modified = new Date()

  // ── Sheet 1: Product Recommendations (catalog-import shape) ─────────────────
  const sheet = workbook.addWorksheet('Product Recommendations', {
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
    views: [{ state: 'frozen', ySplit: 3 }],
  })

  // ── Title row ──────────────────────────────────────────────────────────────
  sheet.mergeCells(`A1:${LAST_COL_LETTER}1`)
  const titleCell = sheet.getCell('A1')
  titleCell.value =
    `AI Market Research — Product Recommendations` +
    (meta.categories?.length ? ` | ${meta.categories.join(', ')}` : '') +
    (meta.niche ? ` (${meta.niche})` : '')
  titleCell.font = { bold: true, size: 13, color: { argb: '1E1B4B' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FF' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 30

  // ── Sub-title row ──────────────────────────────────────────────────────────
  sheet.mergeCells(`A2:${LAST_COL_LETTER}2`)
  const subCell = sheet.getCell('A2')
  subCell.value =
    `Generated: ${meta.generatedAt ? new Date(meta.generatedAt).toLocaleString('en-US') : new Date().toLocaleString('en-US')}` +
    `  |  Products: ${recommendations.length}` +
    `  |  Sorted by Opportunity Score (highest first)`
  subCell.font = { size: 10, color: { argb: '6366F1' } }
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F3FF' } }
  subCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(2).height = 20

  // ── Header row ─────────────────────────────────────────────────────────────
  sheet.columns = COLUMNS
  const headerRow = sheet.getRow(3)
  headerRow.values = COLUMNS.map((c) => c.header)
  headerRow.font = { bold: true, color: { argb: HEADER_FG }, size: 11 }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  headerRow.height = 28

  // Apply column widths from COLUMNS definition
  COLUMNS.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width
  })

  // Enable auto-filter on header row
  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to:   { row: 3, column: COLUMNS.length },
  }

  // ── Data rows ──────────────────────────────────────────────────────────────
  const timestampSuffix = Date.now().toString().slice(-4)
  const URL_COLS = { sourceUrl: 13, listingUrl: 14, otherUrl: 15 }

  recommendations.forEach((rec, i) => {
    const rowIndex = i + 4  // rows 1-3 are title/subtitle/header
    const row = sheet.getRow(rowIndex)
    const isOdd = i % 2 === 0
    const data = buildExportRow(rec, i, timestampSuffix)

    row.values = COLUMNS.map((c) => data[c.key])

    // Base row styling
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOdd ? ROW_ODD : ROW_EVEN } }
    row.alignment = { vertical: 'top', wrapText: true }
    row.height = 60

    // Make URL cells clickable hyperlinks
    for (const [key, colNum] of Object.entries(URL_COLS)) {
      const url = data[key]
      if (url) {
        const urlCell = row.getCell(colNum)
        urlCell.value = { text: url, hyperlink: url }
        urlCell.font = { color: { argb: '4F46E5' }, underline: true }
      }
    }

    // Color-code opportunity score cell (col 17)
    const numericScore = typeof data.opportunityScore === 'number' ? data.opportunityScore : 0
    const scoreBg = numericScore >= 70 ? SCORE_HIGH : numericScore >= 45 ? SCORE_MED : SCORE_LOW
    const scoreCell = row.getCell(17)
    scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: scoreBg } }
    scoreCell.font = { bold: true }
    scoreCell.alignment = { horizontal: 'center', vertical: 'middle' }

    // Format numeric cells
    if (data.basePrice !== '') {
      row.getCell(6).numFmt = '"$"#,##0.00'
    }
    if (data.estimatedMarginPercent !== '') {
      row.getCell(16).numFmt = '0.0"%"'
    }

    // Center sku column
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // ── Sheet 2: Summary ───────────────────────────────────────────────────────
  const summary = workbook.addWorksheet('Summary')
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 35 },
    { header: 'Value',  key: 'value',  width: 30 },
  ]

  const sumHeader = summary.getRow(1)
  sumHeader.font = { bold: true, color: { argb: HEADER_FG }, size: 11 }
  sumHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
  sumHeader.height = 25

  const validRecs = recommendations.filter((r) => r.opportunityScore != null)
  const avgScore = validRecs.length
    ? Math.round(validRecs.reduce((s, r) => s + r.opportunityScore, 0) / validRecs.length)
    : 0
  const marginOf = (r) => r.estimatedMargin ?? r.estimatedProfitMarginPercent ?? 0
  const avgMargin = validRecs.length
    ? (validRecs.reduce((s, r) => s + Number(marginOf(r)), 0) / validRecs.length).toFixed(1)
    : 0
  const topRec = recommendations[0]

  const summaryData = [
    ['Categories Researched',    (meta.categories || []).join(', ')],
    ['Niche / Focus',            meta.niche || '—'],
    ['Total Recommendations',    recommendations.length],
    ['Average Opportunity Score', `${avgScore} / 100`],
    ['Average Profit Margin',    `${avgMargin}%`],
    ['Top Recommendation',       topRec?.title || topRec?.productName || '—'],
    ['Top Score',                topRec?.opportunityScore != null ? `${topRec.opportunityScore}/100` : '—'],
    ['Generated At',             meta.generatedAt ? new Date(meta.generatedAt).toLocaleString('en-US') : new Date().toLocaleString('en-US')],
  ]

  for (const [metric, value] of summaryData) {
    const row = summary.addRow({ metric, value })
    row.height = 20
  }

  // ── Finalize ───────────────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer()
  return buffer
}

module.exports = { generateRecommendationsExcel, buildExportRow, verifiedLinks }
