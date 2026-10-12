const ResearchReport = require('../models/ResearchReport')
const Product = require('../models/Product')
const marketAnalyzer = require('./marketAnalyzer')

// High-converting product opportunities across categories
const PRODUCT_CATALOG_KNOWLEDGE = [
  {
    category: 'Home & Kitchen',
    marketplace: 'ebay',
    title: 'Magnetic Silicone Measuring Spoons & Leveler Set',
    image: 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=500&auto=format&fit=crop&q=60',
    basePrice: 19.99,
    supplierCost: 4.80,
    monthlySales: 1840,
    rating: 4.7,
    reviews: 1420,
    competitors: 14,
  },
  {
    category: 'Home & Kitchen',
    marketplace: 'ebay',
    title: 'Self-Cleaning Electric Garlic Chopper & Food Crusher (USB)',
    image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=500&auto=format&fit=crop&q=60',
    basePrice: 24.50,
    supplierCost: 6.20,
    monthlySales: 980,
    rating: 4.5,
    reviews: 630,
    competitors: 22,
  },
  {
    category: 'Electronics',
    marketplace: 'ebay',
    title: '3-in-1 Foldable Magnetic Wireless Charging Station (MagSafe Compatible)',
    image: 'https://images.unsplash.com/photo-1586816879360-004f5b0c51e5?w=500&auto=format&fit=crop&q=60',
    basePrice: 38.99,
    supplierCost: 11.50,
    monthlySales: 2450,
    rating: 4.6,
    reviews: 3100,
    competitors: 28,
  },
  {
    category: 'Electronics',
    marketplace: 'ebay',
    title: 'RGB Desktop Sound-Controlled Rhythm Pickup Ambient Bar Lamp',
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500&auto=format&fit=crop&q=60',
    basePrice: 22.95,
    supplierCost: 5.10,
    monthlySales: 3120,
    rating: 4.8,
    reviews: 4210,
    competitors: 19,
  },
  {
    category: 'Sports & Fitness',
    marketplace: 'ebay',
    title: 'Adjustable Hand Grip Strengthener with Built-in Digital Counter',
    image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=500&auto=format&fit=crop&q=60',
    basePrice: 16.99,
    supplierCost: 3.40,
    monthlySales: 1240,
    rating: 4.6,
    reviews: 890,
    competitors: 16,
  },
  {
    category: 'Sports & Fitness',
    marketplace: 'ebay',
    title: 'High-Density Deep Tissue Muscle Roller with Ergonomic Handle',
    image: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=500&auto=format&fit=crop&q=60',
    basePrice: 27.99,
    supplierCost: 7.20,
    monthlySales: 1620,
    rating: 4.7,
    reviews: 1180,
    competitors: 12,
  },
  {
    category: 'Beauty & Personal Care',
    marketplace: 'ebay',
    title: 'LED Facial Light Therapy Wand with Warm Massage & Microcurrent',
    image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=500&auto=format&fit=crop&q=60',
    basePrice: 42.00,
    supplierCost: 9.80,
    monthlySales: 2890,
    rating: 4.7,
    reviews: 2400,
    competitors: 25,
  },
  {
    category: 'Accessories',
    marketplace: 'ebay',
    title: 'Minimalist RFID-Blocking Slim Aluminum Pop-Up Cardholder Wallet',
    image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=500&auto=format&fit=crop&q=60',
    basePrice: 18.50,
    supplierCost: 3.90,
    monthlySales: 3400,
    rating: 4.6,
    reviews: 5800,
    competitors: 34,
  },
  {
    category: 'Pet Supplies',
    marketplace: 'ebay',
    title: 'Ultra-Quiet Automatic Pet Water Fountain with Quad-Filtration',
    image: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=500&auto=format&fit=crop&q=60',
    basePrice: 29.99,
    supplierCost: 7.80,
    monthlySales: 1100,
    rating: 4.7,
    reviews: 950,
    competitors: 18,
  },
  {
    category: 'Home & Kitchen',
    marketplace: 'ebay',
    title: 'Automatic Touchless Motion Sensor Trash Can (14L Waterproof)',
    image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=500&auto=format&fit=crop&q=60',
    basePrice: 34.99,
    supplierCost: 9.50,
    monthlySales: 1780,
    rating: 4.5,
    reviews: 1650,
    competitors: 21,
  },
]

class DiscoveryAgent {
  /**
   * Discovers and evaluates opportunities based on target criteria
   */
  async runDiscovery({ category = 'All', keywords = [], marketplaces = ['ebay'], user = null }) {
    const startedAt = new Date()

    // 1. Filter and match items
    let candidates = PRODUCT_CATALOG_KNOWLEDGE.filter((item) => {
      if (category && category !== 'All' && item.category.toLowerCase() !== category.toLowerCase()) {
        return false
      }
      if (marketplaces && marketplaces.length > 0 && !marketplaces.includes(item.marketplace)) {
        return false
      }
      if (keywords && keywords.length > 0) {
        const query = keywords.join(' ').toLowerCase()
        const text = `${item.title} ${item.category}`.toLowerCase()
        return keywords.some((k) => text.includes(k.toLowerCase()))
      }
      return true
    })

    if (candidates.length === 0) {
      candidates = PRODUCT_CATALOG_KNOWLEDGE
    }

    // 2. Score each candidate
    const opportunities = candidates.map((item, index) => {
      const margin = marketAnalyzer.calculateMargin(item.basePrice, item.supplierCost)
      const score = marketAnalyzer.calculateOpportunityScore({
        margin,
        monthlySales: item.monthlySales,
        competitorCount: item.competitors,
        rating: item.rating,
      })
      const aiNotes = marketAnalyzer.generateAiInsight({
        title: item.title,
        marketplace: item.marketplace,
        margin,
        score,
        competitorCount: item.competitors,
        monthlySales: item.monthlySales,
      })

      return {
        rank: index + 1,
        title: item.title,
        marketplace: item.marketplace,
        sourceUrl: `https://${item.marketplace}.com/itm/discovery-${index + 1001}`,
        image: item.image,
        metrics: {
          category: item.category,
          monthlySales: item.monthlySales,
          monthlyRevenue: Math.round(item.monthlySales * item.basePrice),
          averagePrice: item.basePrice,
          estimatedCost: item.supplierCost,
          competitorCount: item.competitors,
          rating: item.rating,
          reviews: item.reviews,
        },
        estimatedMargin: margin,
        opportunityScore: score,
        aiNotes,
        addedProductId: null,
      }
    })

    // Sort opportunities by Opportunity Score descending
    opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore)
    opportunities.forEach((op, idx) => {
      op.rank = idx + 1
    })

    const finishedAt = new Date()
    const summary = `AI Agent analyzed ${opportunities.length} potential high-demand items across ${marketplaces.join(', ')}. Top recommendation: "${opportunities[0]?.title || 'N/A'}" with ${opportunities[0]?.opportunityScore || 0}% opportunity score and ${opportunities[0]?.estimatedMargin || 0}% margin.`

    // 3. Persist to MongoDB as a ResearchReport
    const report = await ResearchReport.create({
      runBy: user?._id || user?.id || null,
      trigger: 'manual',
      params: {
        marketplaces,
        category: category || 'All',
        keywords: keywords || [],
      },
      status: 'completed',
      summary,
      opportunities,
      startedAt,
      finishedAt,
    })

    return report
  }

  /**
   * Fetches latest trending opportunities across markets
   */
  async getTrending({ category, limit = 8 }) {
    // Check if we have recent completed reports
    const latestReport = await ResearchReport.findOne({ status: 'completed' })
      .sort({ createdAt: -1 })
      .lean()

    if (latestReport && latestReport.opportunities?.length > 0) {
      let opps = latestReport.opportunities
      if (category && category !== 'All') {
        opps = opps.filter((o) => o.metrics?.category?.toLowerCase() === category.toLowerCase())
      }
      return {
        reportId: latestReport._id,
        summary: latestReport.summary,
        createdAt: latestReport.createdAt,
        opportunities: opps.slice(0, limit),
      }
    }

    // Otherwise run a fast instant discovery
    const newReport = await this.runDiscovery({ category: category || 'All' })
    return {
      reportId: newReport._id,
      summary: newReport.summary,
      createdAt: newReport.createdAt,
      opportunities: newReport.opportunities.slice(0, limit),
    }
  }

  /**
   * Adds an opportunity from a research report into the active Product catalog
   * Implements requirement: sets source = 'research_bot' and sourceReportId
   */
  async addOpportunityToCatalog({ reportId, rank, user, customOptions = {} }) {
    const report = await ResearchReport.findById(reportId)
    if (!report) throw new Error('Research report not found')

    const opp = report.opportunities.find((o) => o.rank === Number(rank))
    if (!opp) throw new Error(`Opportunity with rank ${rank} not found in report`)

    if (opp.addedProductId) {
      const existingProduct = await Product.findById(opp.addedProductId)
      if (existingProduct) {
        return { product: existingProduct, alreadyAdded: true }
      }
    }

    // Generate unique SKU
    const catPrefix = (opp.metrics?.category || 'GEN').substring(0, 3).toUpperCase()
    const sku = `BOT-${catPrefix}-${Date.now().toString().slice(-6)}`

    const product = await Product.create({
      sku,
      title: customOptions.title || opp.title,
      description: customOptions.description || `${opp.title}. Discovered and evaluated by AI Market Research Bot with an opportunity score of ${opp.opportunityScore}/100 and estimated margin of ${opp.estimatedMargin}%.`,
      category: opp.metrics?.category || 'General',
      brand: 'DevBrand',
      images: opp.image ? [opp.image] : [],
      basePrice: customOptions.price ? Number(customOptions.price) : opp.metrics?.averagePrice || 24.99,
      stock: customOptions.stock ? Number(customOptions.stock) : 100,
      lowStockThreshold: 10,
      status: 'active',
      source: 'research_bot',
      sourceReportId: report._id,
      attributes: {
        aiOpportunityScore: opp.opportunityScore,
        estimatedMargin: opp.estimatedMargin,
        targetMarketplace: opp.marketplace,
      },
    })

    // Link opportunity back to product
    opp.addedProductId = product._id
    await report.save()

    return { product, alreadyAdded: false }
  }
}

module.exports = new DiscoveryAgent()
