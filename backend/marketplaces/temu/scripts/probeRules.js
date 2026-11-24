/** What the Temu probe may send: one read-only Temu method (query/get/list/retrieve/check) and JSON parameters. */
const READ = /\.(query|get|list|retrieve|check|recommend|pred)$|\.query\.|\.get\.|\.list\./i
const WRITE = /\.(add|update|create|delete|enroll|modify|upload|uploadFile|confirm|apply|cancel|set|edit|issue|agree|submit|authorization)($|\.)/i

function probeRequest(argv) {
  const [method, json] = argv
  if (!method) throw new Error('Usage: npm run temu-probe -- <temu.method> \'{"param":1}\'')
  if (WRITE.test(method) || !READ.test(method)) throw new Error(`${method} is not a read-only Temu call; the probe only sends queries.`)
  let params = {}
  if (json) {
    try { params = JSON.parse(json) } catch { throw new Error('Parameters must be JSON, e.g. \'{"pageNumber":1,"pageSize":20}\'') }
  }
  if (params && Object.hasOwn(params, 'access_token')) throw new Error('Leave access_token out: the probe uses the connected shop\'s token.')
  return { method, params }
}

module.exports = { probeRequest }
