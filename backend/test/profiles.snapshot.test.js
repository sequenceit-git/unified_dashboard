const test = require('node:test')
const { matchSnapshot } = require('./helpers/snapshot')

test('profiles match snapshot', () => {
  const { PROFILES } = require('../services/marketplace/profiles')
  const projected = Object.fromEntries(Object.entries(PROFILES).map(([key, p]) => [key, {
    label: p.label,
    sections: p.sections.map(({ id, label, path, route, needs }) => ({ id, label, path, route, needs })),
    statuses: p.statuses,
    rawStatuses: p.rawStatuses,
    productForm: p.productForm,
    actions: p.actions,
  }]))
  matchSnapshot('profiles', projected)
})
