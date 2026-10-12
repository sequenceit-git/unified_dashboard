const discoveryAgent = require('./discoveryAgent')
const marketAnalyzer = require('./marketAnalyzer')
const { runMarketResearch } = require('./aimarketresearch/marketResearchAgent')

module.exports = {
  discoveryAgent,
  marketAnalyzer,
  runMarketResearch,
}
