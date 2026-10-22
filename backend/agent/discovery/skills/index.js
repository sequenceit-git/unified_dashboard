const fs = require('fs')
const path = require('path')

/**
 * Skill Registry for Product Discovery 2 Agent
 * 4 High-Impact Skills following the Agent Skills Standard (SKILL.md)
 */
const SKILLS = {
  'product-discovery-search': 'Search marketplaces to find trending, popular candidate products.',
  'cross-market-validation': 'Cross-check candidate products on competing marketplaces for true demand & reviews.',
  'sourcing-and-unit-economics': 'Find cheaper sourcing/supplier links and compute net profit margins.',
  'opportunity-scoring-rubric': 'Calculate 0-100 Opportunity Score and synthesize actionable AI rationale.',
}

class SkillManager {
  constructor(baseDir = path.join(__dirname)) {
    this.baseDir = baseDir
    this.cache = new Map()
  }

  getSkills() {
    return Object.keys(SKILLS).map((key) => ({
      name: key,
      description: SKILLS[key],
    }))
  }

  loadSkill(skillName) {
    if (this.cache.has(skillName)) {
      return this.cache.get(skillName)
    }
    const skillPath = path.join(this.baseDir, skillName, 'SKILL.md')
    if (!fs.existsSync(skillPath)) {
      return null
    }
    const content = fs.readFileSync(skillPath, 'utf8')
    this.cache.set(skillName, content)
    return content
  }

  loadAllSkills() {
    return Object.keys(SKILLS)
      .map((k) => this.loadSkill(k))
      .filter(Boolean)
      .join('\n\n---\n\n')
  }
}

const skillManager = new SkillManager()

module.exports = {
  SKILLS,
  SkillManager,
  skillManager,
}
