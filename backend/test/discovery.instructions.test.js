const test = require('node:test')
const assert = require('node:assert/strict')
const { discoverCandidates } = require('../agent/discovery/discoveryAgent')

test("the New run form's instructions reach the AI search prompt", async () => {
  const prompts = []
  const client = {
    model: 'test-model',
    responses: { create: async (request) => { prompts.push(JSON.stringify(request.input)); return { output_text: '{"candidates":[]}' } } },
  }
  await discoverCandidates({ client, categories: ['Kitchen'], instructions: 'Only items under $20', count: 5 })
  assert.equal(prompts.length, 1)
  assert.match(prompts[0], /Only items under \$20/)
})
