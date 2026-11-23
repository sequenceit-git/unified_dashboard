/** Temu "promotions" section: its tables (subsections) for the shop section page. */
const temu = require('../service')
const { words, col, tables } = require('../../../services/marketplace/sectionKit')
const { temuTime } = require('./helpers')

async function promotions(token) {
  const activityRow = (row) => ({
    id: row.activityId,
    name: row.activityName || '',
    type: words(row.activityType),
    status: words(row.activityStatus),
    joined: row.isJoinedActivity ? 'Yes' : '',
    starts: temuTime(row.activityStartTime),
    ends: temuTime(row.activityEndTime),
  })
  const columns = [col('name', 'Activity'), col('type', 'Type'), col('status', 'Status', 'status'), col('joined', 'Joined'), col('starts', 'Starts', 'date'), col('ends', 'Ends', 'date')]
  const list = await tables([
    {
      id: 'joined',
      title: 'Promotions you joined',
      columns,
      load: async () => ((await temu.call('bg.promotion.activity.query', {
        access_token: token,
        pageNumber: 1,
        pageSize: 50,
        onlyQueryJoinedActivity: true,
      })).activityList || []).map(activityRow),
    },
    {
      id: 'available',
      title: 'Temu promotions',
      note: 'Enroll goods in a promotion in Temu Seller Center.',
      columns,
      load: async () => ((await temu.call('bg.promotion.activity.query', {
        access_token: token,
        pageNumber: 1,
        pageSize: 50,
      })).activityList || []).map(activityRow),
    },
  ])
  return {
    summary: [
      { label: 'Joined', value: list[0].rows.length, type: 'number' },
      { label: 'Available', value: list[1].rows.filter((row) => !row.joined).length, type: 'number' },
    ],
    tables: list,
  }
}

module.exports = promotions
