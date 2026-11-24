/**
 * TikTok Shop "products" section: listing quality (SKPP + Product Optimization diagnoses &
 * suggestions, image optimization), TikTok product opportunities & submissions, and shop
 * listing prerequisites.
 */
const { words, col, tables, listingTitles } = require('../../../services/marketplace/sectionKit')
const Listing = require('../../../models/Listing')
const { HttpError } = require('../../../utils/httpError')
const { ttGet, ttPost, scopeAware } = require('./helpers')

const enc = encodeURIComponent
const tiktokId = (externalListingId) => String(externalListingId || '').split(':')[0].trim()

async function listedProductIds(shop) {
  if (!shop?._id) return []
  const rows = await Listing.find({
    shopId: shop._id,
    marketplace: 'tiktok_shop',
    externalListingId: { $nin: ['', null] },
    status: { $in: ['live', 'out_of_stock', 'pending'] },
  }).select('externalListingId').limit(50).lean()
  return [...new Set(rows.map((r) => tiktokId(r.externalListingId)).filter(Boolean))]
}

async function products(token, shop) {
  const ids = await listedProductIds(shop)
  const titles = await listingTitles('tiktok_shop', ids).catch(() => new Map())
  let skppTiles = []

  const list = await tables([
    {
      id: 'quality',
      tab: 'Listing quality',
      title: 'Listing quality & diagnoses',
      note: 'SKPP quality checks and TikTok Product Optimization findings for your listed products.',
      columns: [
        col('product', 'Product'),
        col('id', 'TikTok ID'),
        col('qualityStatus', 'Quality status', 'status'),
        col('issuesCount', 'Issues', 'number'),
        col('topFinding', 'Top finding'),
      ],
      load: scopeAware(async () => {
        const [sum, skppRes, diagRes] = await Promise.all([
          ttGet(token, shop, '/product/202606/skpps/sum').catch(() => null),
          ids.length ? ttPost(token, shop, '/product/202606/skpps/search', { product_ids: ids.slice(0, 50) }, { page_size: 50 }).catch(() => ({})) : {},
          ids.length ? ttGet(token, shop, '/product/202405/products/diagnoses', { product_ids: ids.slice(0, 20).join(',') }).catch(() => ({})) : {},
        ])

        if (sum) {
          const total = sum.total_count ?? sum.total ?? sum.product_count
          const good = sum.good_count ?? sum.qualified_count ?? sum.pass_count
          const weak = sum.need_improvement_count ?? sum.to_optimize_count ?? sum.fail_count
          if (total != null) skppTiles.push({ tab: 'Listing quality', label: 'SKPP evaluated', value: Number(total), type: 'number' })
          if (good != null) skppTiles.push({ tab: 'Listing quality', label: 'Qualified', value: Number(good), type: 'number' })
          if (weak != null) skppTiles.push({ tab: 'Listing quality', label: 'Needs improvement', value: Number(weak), type: 'number' })
        }

        const skppById = new Map((skppRes.skpps || skppRes.products || skppRes.items || []).map((row) => [String(row.product_id || row.id), row]))
        const diagById = new Map((diagRes.products || []).map((row) => [String(row.id || row.product_id), row]))
        const allIds = [...new Set([...ids, ...skppById.keys(), ...diagById.keys()])]

        return allIds.map((pid) => {
          const skpp = skppById.get(pid) || {}
          const diag = diagById.get(pid) || {}
          const diagItems = diag.diagnoses || diag.issues || []
          const firstIssue = diagItems[0]?.suggestion?.seo_words?.[0]?.text
            || diagItems[0]?.diagnosis_results?.[0]?.how_to_solve
            || diagItems[0]?.field
            || skpp.reason
            || ''
          const rawTier = skpp.skpp_status || skpp.status || diag.listing_quality?.current_tier || (diagItems.length ? 'NEEDS_WORK' : 'CHECKED')
          return {
            id: pid,
            product: titles.get(pid)?.title || diag.title || skpp.product_name || pid,
            qualityStatus: words(rawTier),
            issuesCount: diagItems.length,
            topFinding: firstIssue,
            actions: [
              { id: 'diagnosis', label: 'Diagnose & suggestions', detail: true },
              { id: 'optimize-images', label: 'Optimize images', confirm: `Run TikTok white-background image optimization on product ${pid}?` },
            ],
          }
        })
      }, 'Product Optimization'),
    },
    {
      id: 'opportunities',
      tab: 'Opportunities',
      title: 'TikTok product opportunities',
      note: 'High-demand items TikTok buyers are searching for that your shop can supply.',
      columns: [
        col('id', 'Opportunity ID'),
        col('type', 'Type'),
        col('title', 'Product / Keyword'),
        col('category', 'Category'),
        col('status', 'Status', 'status'),
      ],
      load: scopeAware(async () => {
        const [prodOpp, kwOpp] = await Promise.all([
          ttPost(token, shop, '/product/202604/opportunities/query', { opportunity_type: 'PRODUCT' }, { page_size: 50 }),
          ttPost(token, shop, '/product/202604/opportunities/query', { opportunity_type: 'KEYWORD' }, { page_size: 50 }).catch(() => ({})),
        ])
        const extract = (r, fallbackType) => (r?.data?.opportunities || r?.opportunities || r?.items || []).map((row) => ({ ...row, _type: row.opportunity_type || fallbackType }))
        const seen = new Set()
        return [...extract(prodOpp, 'PRODUCT'), ...extract(kwOpp, 'KEYWORD')].filter((row) => {
          const oid = String(row.id || row.opportunity_id || '')
          if (!oid || seen.has(oid)) return false
          seen.add(oid)
          return true
        }).map((row) => ({
          id: String(row.id || row.opportunity_id),
          type: words(row._type),
          title: row.title || row.keyword || row.product_name || row.id,
          category: [row.category_name_level_1, row.category_name_level_2, row.category_name_level_3].filter(Boolean).join(' › ') || row.category_name || row.category?.name || '',
          status: words(row.status || (row.is_collected ? 'COLLECTED' : 'ACTIVE')),
          actions: [
            { id: 'opportunity', label: 'Details', detail: true },
            ...(row._type !== 'CATEGORY' ? [{ id: 'submit-opportunity', label: 'Submit product', input: { label: 'TikTok Product ID to submit' } }] : []),
          ],
        }))
      }, 'Product Basic'),
    },
    {
      id: 'submissions',
      tab: 'Opportunities',
      title: 'Opportunity submissions',
      columns: [
        col('id', 'Submission'),
        col('opportunityId', 'Opportunity ID'),
        col('productId', 'Product ID'),
        col('status', 'Status', 'status'),
      ],
      load: scopeAware(async () => {
        const res = await ttGet(token, shop, '/product/202604/opportunities/submissions', { page_size: 50 })
        return (res.submissions || res.records || []).map((row) => ({
          id: String(row.id || row.submission_id || `${row.opportunity_id}-${row.product_id}`),
          opportunityId: row.opportunity_id || '',
          productId: row.product_id || (row.product_ids || []).join(', '),
          status: words(row.status || row.audit_status),
        }))
      }, 'Product Basic'),
    },
    {
      id: 'prerequisites',
      tab: 'Shop readiness',
      title: 'Listing prerequisites',
      note: 'Shop-level requirements TikTok checks before products can go live.',
      columns: [
        col('item', 'Requirement'),
        col('status', 'Status', 'status'),
        col('reasons', 'What to fix'),
      ],
      load: scopeAware(async () => {
        const res = await ttGet(token, shop, '/product/202312/prerequisites')
        return (res.check_results || []).map((row) => ({
          id: row.check_item,
          item: words(row.check_item),
          status: row.is_failed ? 'Action needed' : 'Ready',
          reasons: (row.fail_reasons || []).join('; ') || '—',
        }))
      }, 'Product Basic'),
    },
  ])

  return { summary: skppTiles, tables: list }
}

products.details = {
  /** Detailed SKPP status, diagnostics and title/description rewrite suggestions for one product. */
  diagnosis: async (token, shop, id) => {
    const pid = tiktokId(id)
    const [skpp, diagRes, suggRes] = await Promise.all([
      ttGet(token, shop, `/product/202606/skpps/${enc(pid)}`).catch(() => null),
      scopeAware(() => ttGet(token, shop, '/product/202405/products/diagnoses', { product_ids: pid }), 'Product Optimization')().catch(() => null),
      scopeAware(() => ttGet(token, shop, '/product/202405/products/suggestions', { product_ids: pid }), 'Product Optimization')().catch(() => null),
    ])

    const prodDiag = diagRes?.products?.[0] || {}
    const prodSugg = suggRes?.products?.[0] || {}
    const diagRows = (prodDiag.diagnoses || []).map((d) => ({
      field: words(d.field),
      finding: (d.diagnosis_results || []).map((r) => r.how_to_solve || r.code).join('; ') || d.suggestion?.seo_words?.map((w) => w.text).join(', ') || 'Check field',
    }))
    const suggRows = (prodSugg.suggestions || []).flatMap((s) =>
      (s.items || []).map((it) => ({ field: words(s.field), text: it.text || '' })),
    )

    return {
      title: `Optimization · ${pid}`,
      summary: [
        ...(skpp?.skpp_status || skpp?.status ? [{ label: 'SKPP status', value: words(skpp.skpp_status || skpp.status), type: 'text' }] : []),
        ...(prodDiag.listing_quality?.current_tier ? [{ label: 'Listing tier', value: words(prodDiag.listing_quality.current_tier), type: 'text' }] : []),
        { label: 'Diagnoses', value: diagRows.length, type: 'number' },
        { label: 'Suggestions', value: suggRows.length, type: 'number' },
      ],
      suggestedTitles: suggRows.filter((r) => /title/i.test(r.field)).map((r) => r.text).filter(Boolean),
      tables: [
        { id: 'diagnoses', title: 'TikTok diagnoses', columns: [col('field', 'Field'), col('finding', 'Recommendation')], rows: diagRows },
        { id: 'suggestions', title: 'Title & description suggestions', columns: [col('field', 'Field'), col('text', 'Suggested text')], rows: suggRows },
      ],
    }
  },

  /** Detail view for a single TikTok product opportunity lead. */
  opportunity: scopeAware(async (token, shop, id) => {
    const opp = await ttGet(token, shop, `/product/202604/opportunities/${enc(id)}`)
    const detail = opp.opportunity || opp
    const basic = detail.basic_info || {}
    const market = detail.market_data || {}
    const content = detail.content_data || {}
    const criteria = detail.listing_criteria || {}
    const category = [basic.category_name_level_1, basic.category_name_level_2, basic.category_name_level_3].filter(Boolean).join(' › ') || detail.category_name || '—'
    const items = detail.reference_products || detail.items || []
    const metricRows = [
      detail.action_type && { name: 'Recommended action', value: words(detail.action_type) },
      market.market_buzz && { name: 'Market buzz', value: words(market.market_buzz) },
      market.est_market_sales_volume && { name: 'Est. 30d sales volume', value: String(market.est_market_sales_volume) },
      market.est_market_gmv && { name: 'Est. 30d market GMV', value: `$${market.est_market_gmv}` },
      market.search_volume && { name: 'Search volume', value: String(market.search_volume) },
      market.search_keyword && { name: 'Search keywords', value: market.search_keyword },
      content.trending_hashtag && { name: 'Trending hashtag', value: content.trending_hashtag },
      criteria.keywords && { name: 'Required keywords', value: criteria.keywords },
      criteria.product_brand && { name: 'Required brand', value: criteria.product_brand },
    ].filter(Boolean)
    return {
      title: basic.title || detail.title || detail.keyword || `Opportunity ${id}`,
      summary: [
        { label: 'Category', value: category, type: 'text' },
        { label: 'Status', value: words(basic.status || detail.status || 'ACTIVE'), type: 'text' },
      ],
      tables: [{
        id: 'refs',
        title: 'Opportunity details',
        columns: [col('name', 'Item / Attribute'), col('value', 'Details')],
        rows: items.length
          ? [...metricRows, ...items.map((x) => ({ name: x.title || x.name || 'Reference', value: x.price || x.description || x.url || '' }))]
          : (metricRows.length ? metricRows : [{ name: 'Description', value: detail.description || detail.reason || 'No extra notes returned by TikTok.' }]),
      }],
    }
  }, 'Product Basic'),
}

products.actions = {
  /** Runs TikTok image white-background optimization on a listed product's main images. */
  'optimize-images': scopeAware(async (token, shop, id) => {
    const pid = tiktokId(id)
    const prod = await ttGet(token, shop, `/product/202309/products/${enc(pid)}`)
    const uris = (prod.main_images || []).map((img) => img.uri).filter(Boolean).slice(0, 9)
    if (!uris.length) throw new HttpError(400, { error: `Product ${pid} has no TikTok image URIs to optimize.` })
    const res = await ttPost(token, shop, '/product/202404/images/optimize', {
      images: uris.map((uri) => ({ uri, optimization_mode: ['WHITE_BACKGROUND'] })),
    }, {})
    const count = (res.images || []).length || uris.length
    return { message: `Optimized ${count} image${count === 1 ? '' : 's'} for product ${pid}.` }
  }, 'Product Basic'),

  /** Runs live Product Optimization diagnose_optimize check on edited product fields. */
  'diagnose-draft': scopeAware(async (token, shop, id, draft = {}) => {
    const pid = tiktokId(id)
    const payload = {
      ...(pid ? { product_id: pid } : {}),
      ...(draft?.title ? { title: String(draft.title) } : {}),
      ...(draft?.description ? { description: String(draft.description) } : {}),
      ...(draft?.categoryId ? { category_id: String(draft.categoryId) } : {}),
      optimization_fields: ['TITLE', 'DESCRIPTION'],
    }
    const res = await ttPost(token, shop, '/product/202411/products/diagnose_optimize', payload, {})
    const diagnoses = (res.diagnoses || []).map((d) => ({
      field: words(d.field),
      issues: (d.diagnosis_results || []).map((r) => r.how_to_solve || r.code).filter(Boolean),
    }))
    return {
      message: diagnoses.length ? `Found ${diagnoses.length} optimization tip(s).` : 'Title and description passed TikTok optimization check.',
      diagnoses,
      listingQuality: res.listing_quality || null,
    }
  }, 'Product Optimization'),

  /** Submits an existing TikTok product ID to fulfill an opportunity lead. */
  'submit-opportunity': scopeAware(async (token, shop, opportunityId, productId) => {
    const pid = tiktokId(productId)
    if (!pid) throw new HttpError(400, { error: 'Enter the TikTok Product ID to submit.' })
    await ttPost(token, shop, `/product/202604/opportunities/${enc(opportunityId)}/submit`, { product_ids: [pid] }, {})
    return { message: `Submitted product ${pid} for opportunity ${opportunityId}.` }
  }, 'Product Basic'),
}

module.exports = products
