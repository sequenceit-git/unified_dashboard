/**
 * One TikTok Shop section table. Its Action column holds the page's own buttons
 * (`renderRowActions`) and the loader's row `actions`; the loader's table `actions` (e.g. "Ship all
 * ready packages") sit in the table header.
 */
import { useState } from 'react'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { ErrorState } from '../../components/ui/Feedback'
import Button from '../../components/ui/Button'
import ActionButton from './ActionButton'
import { PAGE_SIZE, formatCell } from './sectionFormat'

export default function SectionTable({ table, canAct = true, renderRowActions, onRun, onDetail }) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE))
  const rows = table.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row, index) => ({ ...row, _key: `${page}-${index}` }))
  const own = canAct && renderRowActions?.(table)
  const loaderActions = canAct && table.rows.some((row) => row.actions?.length)

  const columns = table.columns.map((column) => ({
    ...column,
    render: (row) => {
      const url = column.urlKey ? row[column.urlKey] : null
      if (url && row[column.key] != null && row[column.key] !== '') {
        return formatCell('link', { label: row[column.key], url })
      }
      return formatCell(column.type, row[column.key])
    },
  }))
  if (own || loaderActions) {
    columns.push({
      key: '_action',
      label: 'Action',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {own && own(row)}
          {(row.actions || []).map((a) => <ActionButton key={a.id} action={a} rowId={row.id} onRun={onRun} onDetail={onDetail} />)}
        </div>
      ),
    })
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold">{table.title}</h2>
          <span className="text-xs text-gray-500">{table.rows.length} total</span>
        </div>
        {canAct && table.actions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {table.actions.map((a) => <ActionButton key={a.id} action={a} rowId="" onRun={onRun} onDetail={onDetail} />)}
          </div>
        )}
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
