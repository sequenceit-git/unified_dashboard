/**
 * One table of an eBay section. The Action column comes from the page's own `tableActions`
 * (existing buttons) or from the rows' `actions` sent by the section loader.
 */
import { useState } from 'react'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { ErrorState } from '../../components/ui/Feedback'
import Button from '../../components/ui/Button'
import ActionButton from './ActionButton'
import { PAGE_SIZE, formatCell } from './sectionFormat'

export default function SectionTable({ table, tableActions, onAction, runAction, canAct = true, marketplace = 'ebay' }) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE))
  const rows = table.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row, index) => ({ ...row, _key: `${page}-${index}` }))

  let columns = table.columns.map((column) => ({ ...column, render: (row) => formatCell(column.type, row[column.key]) }))
  const legacy = tableActions?.[table.id]
  const generic = table.rows.some((row) => row.actions?.length)
  if (canAct && (legacy || generic)) {
    columns = [...columns, {
      key: '_action',
      label: 'Action',
      // The page's own buttons first, then the loader's row actions.
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {legacy && legacy(row, { onAction, marketplace })}
          {(row.actions || []).map((action) => <ActionButton key={action.id} action={action} row={row} run={runAction} />)}
        </div>
      ),
    }]
  }

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{table.title}</h2>
        <span className="text-xs text-gray-500">{table.rows.length} total</span>
      </div>
      {table.note && <p className="mb-3 text-xs text-gray-500">{table.note}</p>}
      {table.error ? <ErrorState message={table.error} /> : <DataTable rowKey="_key" rows={rows} columns={columns} />}
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
