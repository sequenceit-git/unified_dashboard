function paging(req, defLimit = 20) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || defLimit))
  return { page, limit, skip: (page - 1) * limit }
}

function sortOf(req, allowed, fallback = '-createdAt') {
  const raw = req.query.sort || fallback
  const dir = raw.startsWith('-') ? -1 : 1
  const key = raw.replace(/^-/, '')
  if (!allowed.includes(key)) return { createdAt: -1 }
  return { [key]: dir }
}

async function paged(model, filter, { page, limit, skip }, sort) {
  const [total, data] = await Promise.all([
    model.countDocuments(filter),
    model.find(filter).sort(sort).skip(skip).limit(limit),
  ])
  return { data, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
}

module.exports = { paging, sortOf, paged }
