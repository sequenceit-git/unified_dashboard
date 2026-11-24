/**
 * One Temu section table. Action column: the page's own buttons (`renderRowActions`) then the
 * loader's row `actions`; the loader's table `actions` sit next to the title.
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
  // A reload can shrink the table: show the last page that still exists.
  const shown = Math.min(page, pages)
  const rows = table.rows.slice((shown - 1) * PAGE_SIZE, shown * PAGE_SIZE).map((row, index) => ({ ...row, _key: `${shown}-${index}` }))
  const own = canAct ? renderRowActions?.(table) : null
  const hasActions = canAct && (own || table.rows.some((row) => row.actions?.length))

  const columns = table.columns.map((column) => ({ ...column, render: (row) => formatCell(column.type, row[column.key]) }))
  if (hasActions) {
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
        <h2 className="text-base font-semibold">{table.title} <span className="ml-1 text-xs font-normal text-gray-500">{table.rows.length}</span></h2>
        {canAct && table.actions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">{table.actions.map((a) => <ActionButton key={a.id} action={a} onRun={onRun} onDetail={onDetail} />)}</div>
        )}
      </div>
      {table.note && <p className="mb-3 text-xs text-gray-500">{table.note}</p>}
      {table.error ? <ErrorState message={table.error} /> : <DataTable rowKey="_key" rows={rows} columns={columns} />}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" size="sm" disabled={shown <= 1} onClick={() => setPage(shown - 1)}>Previous</Button>
          <span className="text-gray-500">{shown} / {pages}</span>
          <Button variant="secondary" size="sm" disabled={shown >= pages} onClick={() => setPage(shown + 1)}>Next</Button>
        </div>
      )}
    </Card>
  )
}
