import Badge from '../../../../components/ui/Badge'
import { shortTime } from './messagesView'

/** Conversations: buyer, last line and time; unread ones bold with their count. */
export default function ConversationList({ convos, activeId, onSelect }) {
  const now = new Date()
  return (
    <ul className="divide-y divide-gray-100 dark:divide-slate-800">
      {convos.map((c) => {
        const unread = c.unreadCount > 0
        return (
          <li key={c._id}>
            <button
              type="button"
              onClick={() => onSelect(c._id)}
              className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-slate-800/60 ${activeId === c._id ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`truncate ${unread ? 'font-semibold text-gray-900 dark:text-slate-100' : 'font-medium'}`}>{c.customerName || c.externalThreadId}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {c.aiError && <Badge color="yellow">Needs you</Badge>}
                  {unread && <Badge color="indigo">{c.unreadCount}</Badge>}
                  <span className="text-[11px] text-gray-500 dark:text-slate-400">{shortTime(c.lastMessageAt, now)}</span>
                </span>
              </span>
              <span className={`block truncate ${unread ? 'text-gray-800 dark:text-slate-200' : 'text-gray-500 dark:text-slate-400'}`}>{c.lastMessagePreview}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
