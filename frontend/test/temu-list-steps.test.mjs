import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
const load = () => server.ssrLoadModule('/src/marketplaces/temu/sections/goods/listing/listSteps.js')
test.after(() => server.close())

test('Temu listing steps, in order', async () => {
  const { TEMU_LIST_STEPS } = await load()
  assert.deepEqual(TEMU_LIST_STEPS.map((s) => s.id), ['basics', 'category', 'skus', 'shipping', 'review'])
})

test("each of the form's (and Temu's) error fields goes to the step that fixes it, in step order", async () => {
  const { problemsFrom } = await load()
  const problems = problemsFrom({
    'variants.0.weight': 'Enter the weight',
    shippingTemplateId: 'Choose a shipping template.',
    'attributes.12': 'Material is required.',
    title: 'Enter a title.',
    catId: 'Choose a Temu category.',
    images: 'Add at least one photo.',
    variants: 'Choose at least one variant value.',
    bulletPoints: 'Up to 6',
    _: 'Temu said no.',
  })
  assert.deepEqual(problems.map((p) => p.step), ['basics', 'basics', 'basics', 'category', 'category', 'skus', 'skus', 'shipping', 'review'])
  assert.deepEqual(problemsFrom({ _: 'Handling time is a whole number of days.' }).map((p) => p.step), ['shipping'])
  assert.deepEqual(problemsFrom({}), [])
})
