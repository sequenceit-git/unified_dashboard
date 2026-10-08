// Vercel serverless entry — `vercel.json` rewrites every request here,
// and @vercel/node invokes the exported Express app.
const app = require('../server')

module.exports = app
