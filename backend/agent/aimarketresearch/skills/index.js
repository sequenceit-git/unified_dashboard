const fs = require('fs')
const path = require('path')

/**
 * Skill Registry for AI Market Research Agent
 * Organizes 35 skills across 5 distinct pipeline stages so the agent
 * can dynamically navigate and load only the skills required for each phase.
 */

const SKILL_STAGES = {
  // Stage 1: Pipeline Orchestration, Setup & API Resilience
  orchestration: {
    name: 'Pipeline Orchestration & Resilience',
    description: 'Workflow management, strict schema enforcement, rate-limiting, and quality assurance.',
    skills: [
      'marketplace-research-orchestration',
      'structured-research-output',
      'research-quality-control',
    ],
  },

  // Stage 2: Web Search, Crawling & Source Discovery
  discovery: {
    name: 'Web Search & Source Discovery',
    description: 'Query planning, deep search, URL discovery, and fresh data capture without IP bans.',
    skills: [
      'web-search-strategy',
      'deep-web-research',
      'browser-navigation',
      'web-crawling',
      'dynamic-page-extraction',
      'web-data-extraction',
      'research-freshness',
      'source-validation',
      'research-deduplication',
    ],
  },

  // Stage 3: Marketplace & Supplier Intelligence
  marketplace: {
    name: 'Marketplace & Supplier Research',
    description: 'Extracting product listings, pricing, and supplier credentials across e-commerce platforms.',
    skills: [
      'amazon-product-research',
      'walmart-product-research',
      'bestbuy-product-research',
      'ebay-product-research',
      'tiktok-shop-product-research',
      'temu-product-research',
      'aliexpress-product-research',
      'wholesale-supplier-research',
      'supplier-verification',
    ],
  },

  // Stage 4: Financial, Competitive & Sentiment Analysis
  analysis: {
    name: 'Market Analysis & Financial Scoring',
    description: 'Unit economics, competitor benchmark, sentiment breakdown, and opportunity scoring.',
    skills: [
      'market-analysis',
      'competitor-analysis',
      'review-analysis',
      'keyword-demand-analysis',
      'sales-estimation',
      'cost-and-margin-analysis',
      'profitability-analysis',
      'product-scoring',
      'product-opportunities',
      'evidence-and-citation-management',
    ],
  },

  // Stage 5: Reporting, Synthesis & Export
  reporting: {
    name: 'Reporting, Synthesis & Data Export',
    description: 'Compiling executive research narratives, tabular datasets, and spreadsheet exports.',
    skills: [
      'research-report',
      'excel-product-export',
    ],
  },
}

class SkillManager {
  constructor(baseDir = path.join(__dirname)) {
    this.baseDir = baseDir
    this.cache = new Map()
  }

  /**
   * Get all registered stages and their associated skill names
   */
  getStages() {
    return Object.keys(SKILL_STAGES).map((key) => ({
      key,
      name: SKILL_STAGES[key].name,
      description: SKILL_STAGES[key].description,
      skills: SKILL_STAGES[key].skills,
    }))
  }

  /**
   * Get list of skill names for a specific pipeline stage
   */
  getSkillsForStage(stageKey) {
    const stage = SKILL_STAGES[stageKey]
    if (!stage) {
      throw new Error(`Unknown pipeline stage: "${stageKey}". Available stages: ${Object.keys(SKILL_STAGES).join(', ')}`)
    }
    return stage.skills
  }

  /**
   * Load the SKILL.md content for a single skill
   */
  loadSkill(skillName) {
    if (this.cache.has(skillName)) {
      return this.cache.get(skillName)
    }

    const skillPath = path.join(this.baseDir, skillName, 'SKILL.md')
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill file not found for "${skillName}" at ${skillPath}`)
    }

    const content = fs.readFileSync(skillPath, 'utf8')
    this.cache.set(skillName, content)
    return content
  }

  /**
   * Load all instructions for a given stage to inject into the AI agent prompt
   */
  loadStageInstructions(stageKey) {
    const skills = this.getSkillsForStage(stageKey)
    return skills.map((name) => {
      try {
        return {
          skillName: name,
          content: this.loadSkill(name),
        }
      } catch (err) {
        return {
          skillName: name,
          error: err.message,
        }
      }
    })
  }
}

module.exports = {
  SKILL_STAGES,
  skillManager: new SkillManager(),
}
