import { FiCpu, FiEdit3, FiFileText, FiSearch, FiSend, FiCheck } from 'react-icons/fi'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { marketplaceBadgeColor, marketplaceLabel } from '../../lib/marketplaces'

// ── Static preview data ─────────────────────────────────────────────────────
// The sandbox is intentionally not wired to any backend yet; the sample
// thread below illustrates how the support agent will use the seeded
// policies and FAQs (backend/seed/support/*.json) when drafting replies.

const CONVERSATIONS = [
  {
    id: 'convo-1',
    name: 'Jessica Miller',
    marketplace: 'ebay',
    orderRef: '#112-2938471',
    topic: 'Item not received',
    preview: 'It was supposed to arrive yesterday — is it lost?',
    time: '2m',
    unread: 2,
  },
  {
    id: 'convo-2',
    name: 'Daniel Okafor',
    marketplace: 'ebay',
    orderRef: '#112-2940193',
    topic: 'Wrong variant',
    preview: 'I ordered charcoal gray but received the tan one…',
    time: '18m',
    unread: 1,
  },
  {
    id: 'convo-3',
    name: 'Priya Raman',
    marketplace: 'tiktok_shop',
    orderRef: 'TK-88214',
    topic: 'Warranty claim',
    preview: 'The charger stopped working after 3 weeks.',
    time: '1h',
    unread: 0,
  },
  {
    id: 'convo-4',
    name: 'Marcus Webb',
    marketplace: 'temu',
    orderRef: 'TM-55190',
    topic: 'Address change',
    preview: 'Can I update the shipping address before it ships?',
    time: '3h',
    unread: 0,
  },
  {
    id: 'convo-5',
    name: 'Aisha Thompson',
    marketplace: 'tiktok_shop',
    orderRef: 'TK-88107',
    topic: 'Delivered not found',
    preview: 'Tracking says delivered but nothing is here.',
    time: '5h',
    unread: 0,
  },
]

const THREAD = [
  {
    id: 'msg-1',
    from: 'customer',
    time: '9:41 AM',
    text: 'Hi — I ordered the desk lamp on the 3rd (order #112-2938471). USPS tracking has said "In transit to next facility" in Houston since Monday. It was supposed to arrive yesterday. Is it lost?',
  },
  {
    id: 'msg-2',
    from: 'agent',
    time: '9:58 AM',
    text: "Hi Jessica, thanks for flagging this — I'm pulling up your order now and checking the carrier scans. I'll follow up shortly with what I find.",
  },
  {
    id: 'msg-3',
    from: 'customer',
    time: '10:02 AM',
    text: "Thank you! It's a birthday gift for Saturday, so I'm a little worried.",
  },
]

const AI_DRAFT = {
  time: '10:04 AM',
  policy: 'order-not-received',
  faq: 'faq-tracking-stalled',
  confidence: 'High',
  text: "Hi Jessica, I checked order #112-2938471 — USPS scanned it in Houston on Monday and it's still moving through their network. I've opened a Missing Mail search with USPS (ref USPS-88412). If there's no movement by Friday, we'll reship the lamp free of charge or issue a full refund — your choice. Either way, I'll follow up by Friday 5 PM ET.",
}

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function PreviewPill({ children }) {
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">{children}</span>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ChatSandboxPage() {
  const active = CONVERSATIONS[0]

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Chat Sandbox</h1>
          <PreviewPill>Preview — not connected</PreviewPill>
        </div>
        <p className="text-xs text-gray-500">
          Static preview of the support agent workspace. The seeded policies and FAQs are already in the database.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Left column — conversations */}
        <div className="flex min-h-0 flex-col border-b border-gray-200 lg:border-b-0 lg:border-r">
          <div className="border-b border-gray-100 p-3">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
              <FiSearch size={14} className="shrink-0" />
              <span>Search conversations…</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {CONVERSATIONS.map((convo) => {
              const isActive = convo.id === active.id
              return (
                <div
                  key={convo.id}
                  className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left ${
                    isActive ? 'bg-indigo-50/70' : ''
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {initials(convo.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{convo.name}</p>
                      <span className="shrink-0 text-[11px] text-gray-400">{convo.time}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge color={marketplaceBadgeColor(convo.marketplace)}>{marketplaceLabel(convo.marketplace)}</Badge>
                      <span className="truncate text-[11px] font-medium text-gray-500">{convo.topic}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{convo.preview}</p>
                  </div>
                  {convo.unread > 0 && (
                    <span className="mt-1 grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-indigo-600 px-1 text-[11px] font-bold text-white">
                      {convo.unread}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column — thread */}
        <div className="flex min-h-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                {initials(active.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{active.name}</p>
                <p className="truncate text-xs text-gray-500">
                  Order {active.orderRef} · {active.topic}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge color={marketplaceBadgeColor(active.marketplace)}>{marketplaceLabel(active.marketplace)}</Badge>
              <Badge color="yellow">Open</Badge>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gray-50/60 px-4 py-4">
            {THREAD.map((msg) =>
              msg.from === 'customer' ? (
                <div key={msg.id} className="max-w-[85%]">
                  <div className="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm">
                    <p className="text-sm leading-relaxed text-gray-800">{msg.text}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">{active.name} · {msg.time}</p>
                </div>
              ) : (
                <div key={msg.id} className="ml-auto max-w-[85%]">
                  <div className="rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2.5 shadow-sm">
                    <p className="text-sm leading-relaxed text-white">{msg.text}</p>
                  </div>
                  <p className="mt-1 text-right text-[11px] text-gray-400">Support agent · {msg.time}</p>
                </div>
              ),
            )}

            {/* AI draft — what the agent will produce once connected */}
            <div className="max-w-[85%]">
              <div className="rounded-2xl rounded-bl-sm border border-indigo-200 border-dashed bg-indigo-50/70 px-3.5 py-3 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                    <FiCpu size={13} /> AI draft — not sent
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                    Confidence: {AI_DRAFT.confidence}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-gray-800">{AI_DRAFT.text}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                    <FiFileText size={11} /> Policy: {AI_DRAFT.policy}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                    <FiFileText size={11} /> FAQ: {AI_DRAFT.faq}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled className="flex items-center gap-1.5">
                    <FiCheck size={13} /> Approve &amp; send
                  </Button>
                  <Button size="sm" variant="secondary" disabled className="flex items-center gap-1.5">
                    <FiEdit3 size={13} /> Edit draft
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">Support agent (draft) · {AI_DRAFT.time}</p>
            </div>
          </div>

          <div className="border-t border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                disabled
                placeholder="Preview only — the composer unlocks when the support agent is connected."
                className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-400 shadow-sm"
              />
              <Button disabled className="flex shrink-0 items-center gap-1.5">
                <FiSend size={13} /> Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
