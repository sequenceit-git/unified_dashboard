const fs = require('fs')
const path = require('path')

const MASTER = 'marketplace-best-seller-research'

/** Master reference files each stage needs, in prompt order. */
const STAGE_REFERENCES = {
  'product-discovery-search': ['platforms', 'evidence'],
  'cross-market-validation': ['validation', 'platforms', 'evidence'],
  'opportunity-scoring-rubric': ['scoring'],
}

function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
}

function read(relativePath) {
  const filePath = path.join(__dirname, relativePath)
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

const prompts = new Map()

/**
 * Master core, then only the master references this stage uses, then the stage skill.
 * Stage text cannot replace the master rules. Built once per stage and cached.
 */
function promptFor(stageName) {
  if (prompts.has(stageName)) return prompts.get(stageName)
  const parts = [
    read(path.join(MASTER, 'SKILL.md')),
    ...(STAGE_REFERENCES[stageName] || []).map((name) => read(path.join(MASTER, 'references', `${name}.md`))),
    stripFrontmatter(read(path.join(stageName, 'SKILL.md'))),
  ]
  const prompt = parts.filter(Boolean).join('\n\n---\n\n')
  prompts.set(stageName, prompt)
  return prompt
}

module.exports = {
  skillManager: { promptFor },
}
