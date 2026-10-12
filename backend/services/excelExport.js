/**
 * Excel Export Service
 *
 * Generates a styled .xlsx file from ProductRecommendation documents.
 * Returns a Buffer that can be streamed directly to the HTTP response.
 *
 * Columns: Rank | Product Name | Category | Marketplace | Price | Monthly Sales |
 *          Monthly Revenue | Rating | Review Count | Competition | Profit Margin | Score | Reason | URL
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

// ─── Column definitions ───────────────────────────────────────────────────────
const COLUMNS = [
  { header: 'Rank',                    key: 'rank',                      width: 7  },
  { header: 'Product Name',            key: 'productName',               width: 42 },
  { header: 'Category',               key: 'category',                  width: 20 },
  { header: 'Marketplace',             key: 'marketplace',               width: 16 },
  { header: 'Price (USD)',             key: 'price',                     width: 12 },
  { header: 'Est. Monthly Sales',      key: 'estimatedMonthlySales',     width: 18 },
  { header: 'Est. Monthly Revenue',    key: 'estimatedMonthlyRevenue',   width: 20 },
  { header: 'Rating',                  key: 'rating',                    width: 10 },
  { header: 'Review Count',            key: 'reviewCount',               width: 14 },
  { header: 'Competition',             key: 'competitionLevel',          width: 14 },
  { header: 'Profit Margin (%)',       key: 'estimatedProfitMarginPercent', width: 16 },
  { header: 'Opportunity Score',       key: 'opportunityScore',          width: 18 },
  { header: 'Recommendation Reason',  key: 'recommendationReason',      width: 60 },
  { header: 'Product URL',             key: 'productUrl',                width: 60 },
]

/**
 * Generate an Excel workbook buffer from an array of ProductRecommendation docs.
 *
 * @param {Array}  recommendations - Array of ProductRecommendation Mongoose documents or plain objects
 * @param {object} meta            - { categories, niche, generatedAt }
 * @returns {Promise<Buffer>}      - xlsx file as a Buffer
 */
async function generateRecommendationsExcel(recommendations, meta = {}) {
  const workbook = new ExcelJS.Workbook()

  workbook.creator = 'US Client Automation Dashboard'
  workbook.created = new Date()
  workbook.modified = new Date()

  // ── Sheet 1: Product Recommendations ──────────────────────────────────────
  const sheet = workbook.addWorksheet('Product Recommendations', {
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
    views: [{ state: 'frozen', ySplit: 3 }],
  })

  // ── Title row ──────────────────────────────────────────────────────────────
  sheet.mergeCells('A1:N1')
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
  sheet.mergeCells('A2:N2')
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
  recommendations.forEach((rec, i) => {
    const rowIndex = i + 4  // rows 1-3 are title/subtitle/header
    const row = sheet.getRow(rowIndex)
    const isOdd = i % 2 === 0

    row.values = [
      rec.rank,
      rec.productName,
      rec.category,
      rec.marketplace,
      rec.price != null ? rec.price : '—',
      rec.estimatedMonthlySales != null ? rec.estimatedMonthlySales : '—',
      rec.estimatedMonthlyRevenue != null ? rec.estimatedMonthlyRevenue : '—',
      rec.rating != null ? rec.rating : '—',
      rec.reviewCount != null ? rec.reviewCount : '—',
      rec.competitionLevel || '—',
      rec.estimatedProfitMarginPercent != null ? rec.estimatedProfitMarginPercent : '—',
      rec.opportunityScore != null ? rec.opportunityScore : '—',
      rec.recommendationReason || '',
      rec.productUrl || '',
    ]

    // Base row styling
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOdd ? ROW_ODD : ROW_EVEN } }
    row.alignment = { vertical: 'top', wrapText: true }
    row.height = 60

    // Make URL cell a clickable hyperlink
    if (rec.productUrl) {
      const urlCell = row.getCell(14) // Product URL column
      urlCell.value = {
        text: rec.productUrl,
        hyperlink: rec.productUrl,
      }
      urlCell.font = { color: { argb: '4F46E5' }, underline: true }
    }

    // Color-code opportunity score cell
    const score = rec.opportunityScore ?? 0
    const scoreBg = score >= 70 ? SCORE_HIGH : score >= 45 ? SCORE_MED : SCORE_LOW
    const scoreCell = row.getCell(12)
    scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: scoreBg } }
    scoreCell.font = { bold: true }
    scoreCell.alignment = { horizontal: 'center', vertical: 'middle' }

    // Format numeric cells
    const priceCell = row.getCell(5)
    if (rec.price != null) {
      priceCell.numFmt = '"$"#,##0.00'
    }
    const revenueCell = row.getCell(7)
    if (rec.estimatedMonthlyRevenue != null) {
      revenueCell.numFmt = '"$"#,##0'
    }
    const marginCell = row.getCell(11)
    if (rec.estimatedProfitMarginPercent != null) {
      marginCell.numFmt = '0.0"%"'
    }

    // Center rank column
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
  const avgMargin = validRecs.length
    ? (validRecs.reduce((s, r) => s + (r.estimatedProfitMarginPercent || 0), 0) / validRecs.length).toFixed(1)
    : 0
  const totalRevenue = recommendations.reduce((s, r) => s + (r.estimatedMonthlyRevenue || 0), 0)
  const topRec = recommendations[0]

  const summaryData = [
    ['Categories Researched',    (meta.categories || []).join(', ')],
    ['Niche / Focus',            meta.niche || '—'],
    ['Total Recommendations',    recommendations.length],
    ['Average Opportunity Score', `${avgScore} / 100`],
    ['Average Profit Margin',    `${avgMargin}%`],
    ['Est. Total Monthly Revenue', `$${totalRevenue.toLocaleString()}`],
    ['Top Recommendation',       topRec?.productName || '—'],
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

module.exports = { generateRecommendationsExcel }
