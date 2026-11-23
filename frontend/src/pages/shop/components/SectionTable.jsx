/** One table of a shop section, with the shop's action column (src/marketplaces/<key>/sections/). */
import { useState } from 'react'
import { getShop } from '../../../marketplaces'
import Card from '../../../components/ui/Card'
import DataTable from '../../../components/ui/DataTable'
import { ErrorState } from '../../../components/ui/Feedback'
import Button from '../../../components/ui/Button'
import { PAGE_SIZE, formatCell } from '../sectionFormat'

export default function SectionTable({ table, sectionId, marketplace, onAction, canAct = true }) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE))
  const rows = table.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row, index) => ({ ...row, _key: `${page}-${index}` }))

  let columns = table.columns.map((column) => ({
    ...column,
    render: (row) => formatCell(column.type, row[column.key]),
  }))

  // The shop's section file decides which tables get an Action column (src/marketplaces/<key>/sections/).
  const tableActions = getShop(marketplace)?.sections?.[sectionId]?.tableActions?.[table.id]
  if (canAct && tableActions) {
    columns = [
      ...columns,
      { key: '_action', label: 'Action', render: (row) => tableActions(row, { onAction, marketplace }) },
    ]
  }

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{table.title}</h2>
        <span className="text-xs text-gray-500">{table.rows.length} total</span>
      </div>
      {table.note && <p className="mb-3 text-xs text-gray-500">{table.note}</p>}
      {table.error ? (
        <ErrorState message={table.error} />
      ) : (
        <DataTable
          rowKey="_key"
          rows={rows}
          columns={columns}
        />
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-gray-500">{page} / {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </Card>
  )
}

/** Renders any shop-specific section (returns, finances, promotions...) from its profile. */
