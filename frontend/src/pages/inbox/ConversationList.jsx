import Badge from '../../components/ui/Badge'

export default function ConversationList({ convos, activeId, onSelect }) {
  return (
    <ul className="divide-y divide-gray-100">
      {convos.map((c) => (
        <li key={c._id}>
          <button
            onClick={() => onSelect(c._id)}
            className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 ${activeId === c._id ? 'bg-indigo-50' : ''}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{c.customerName || c.externalThreadId}</span>
              <span className="flex shrink-0 items-center gap-1">
                {c.aiError && <Badge color="yellow">Needs you</Badge>}
                {c.unreadCount > 0 && <Badge color="indigo">{c.unreadCount}</Badge>}
              </span>
            </span>
            <span className="block truncate text-gray-500">{c.lastMessagePreview}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
