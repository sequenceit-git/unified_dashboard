import { useState, useEffect, useRef } from 'react'
import {
  FiSearch,
  FiSend,
  FiCheckCircle,
  FiAlertTriangle,
  FiRefreshCw,
  FiCpu,
  FiTool,
  FiFileText,
  FiTrash2,
} from 'react-icons/fi'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import { Spinner, ErrorState } from '../../components/ui/Feedback'
import { marketplaceBadgeColor, marketplaceLabel } from '../../lib/marketplaces'

function initials(name = 'Customer') {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function SellerChatPage() {
  const { token, user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [selectedConvoId, setSelectedConvoId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)

  const fetchConversations = async () => {
    try {
      const data = await api.get('/api/support/chat/conversations', token)
      setConversations(data || [])
      // Functional update avoids the stale closure that used to reset the
      // selected thread to the first item on every poll.
      setSelectedConvoId((current) => {
        if (!data?.length) return null
        return data.some((convo) => convo._id === current) ? current : data[0]._id
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingList(false)
    }
  }

  const fetchMessages = async (convoId) => {
    if (!convoId) return
    setLoadingMessages(true)
    try {
      const data = await api.get(`/api/support/chat/conversations/${convoId}/messages`, token)
      setMessages(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMessages(false)
    }
  }

  useEffect(() => {
    fetchConversations()
    const interval = setInterval(() => {
      fetchConversations()
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedConvoId) {
      fetchMessages(selectedConvoId)
      const interval = setInterval(() => {
        fetchMessages(selectedConvoId)
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [selectedConvoId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectedConvo = conversations.find((c) => c._id === selectedConvoId)

  const handleSendReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim() || !selectedConvoId || sendingReply) return

    setSendingReply(true)
    setError(null)
    try {
      const res = await api.post(
        `/api/support/chat/conversations/${selectedConvoId}/reply`,
        { text: replyText.trim() },
        token,
      )
      if (res?.message) {
        setMessages((prev) => {
          if (prev.some((message) => String(message._id) === String(res.message._id))) return prev
          return [...prev, res.message]
        })
        setReplyText('')
        // A human reply pauses the AI for this thread.
        setConversations((prev) =>
          prev.map((convo) =>
            convo._id === selectedConvoId ? { ...convo, aiEnabled: false } : convo,
          ),
        )
        fetchConversations()
      }
    } catch (err) {
      setError(`Failed to send reply: ${err.message}`)
    } finally {
      setSendingReply(false)
    }
  }

  const handleToggleAi = async () => {
    if (!selectedConvo) return
    const nextState = !selectedConvo.aiEnabled
    setError(null)
    try {
      const updated = await api.patch(
        `/api/support/chat/conversations/${selectedConvo._id}`,
        { aiEnabled: nextState },
        token,
      )
      setConversations((prev) =>
        prev.map((c) => (c._id === updated._id ? { ...c, aiEnabled: updated.aiEnabled } : c)),
      )
    } catch (err) {
      setError(`Failed to toggle AI: ${err.message}`)
    }
  }

  const handleStatusChange = async (newStatus) => {
    if (!selectedConvo) return
    setError(null)
    try {
      const updated = await api.patch(
        `/api/support/chat/conversations/${selectedConvo._id}`,
        { status: newStatus },
        token,
      )
      setConversations((prev) =>
        prev.map((c) => (c._id === updated._id ? { ...c, status: updated.status } : c)),
      )
    } catch (err) {
      setError(`Failed to change status: ${err.message}`)
    }
  }

  const handleResetSandbox = async () => {
    const confirmed = window.confirm(
      'Delete every sandbox conversation and message? This cannot be undone.',
    )
    if (!confirmed) return

    setError(null)
    try {
      await api.post('/api/support/chat/reset-sandbox', {}, token)
      setConversations([])
      setSelectedConvoId(null)
      setMessages([])
      fetchConversations()
    } catch (err) {
      setError(`Failed to reset sandbox: ${err.message}`)
    }
  }

  const filteredConversations = conversations.filter((c) => {
    const matchesSearch =
      !searchQuery ||
      c.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.orderRef?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessagePreview?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = filterStatus === 'all' || c.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return 'green'
      case 'escalated':
        return 'yellow'
      case 'locked':
        return 'red'
      case 'closed':
        return 'gray'
      default:
        return 'blue'
    }
  }

  if (loadingList) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Seller Chat (Agent View)</h1>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Live Support Workspace
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Monitor real-time buyer conversations, inspect AI decision traces, verify tool calls, and take over manually.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchConversations}
            className="flex items-center gap-1.5 text-xs"
          >
            <FiRefreshCw size={12} /> Refresh Threads
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResetSandbox}
            className="flex items-center gap-1.5 text-xs"
          >
            <FiTrash2 size={12} /> Reset Sandbox
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={fetchConversations} />}

      {/* 2-Column Chat Workspace */}
      <div className="grid min-h-[560px] flex-1 grid-cols-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Left Column: Conversations List */}
        <div className="flex min-h-0 flex-col border-b border-gray-200 lg:border-b-0 lg:border-r">
          {/* Search & Filter Header */}
          <div className="border-b border-gray-100 p-3 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700">
              <FiSearch size={14} className="text-gray-400 shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search buyer, order #, message…"
                className="w-full bg-transparent outline-none"
              />
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              {['all', 'open', 'escalated', 'locked', 'closed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`rounded-md px-2 py-0.5 font-semibold capitalize transition ${
                    filterStatus === st
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Conversations Scroll */}
          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                No conversations found.
                <p className="mt-1 text-[11px] text-gray-400">
                  Send a message from the <span className="font-semibold">Buyer Chat</span> tab to start one!
                </p>
              </div>
            ) : (
              filteredConversations.map((convo) => {
                const isSelected = convo._id === selectedConvoId
                return (
                  <button
                    key={convo._id}
                    onClick={() => setSelectedConvoId(convo._id)}
                    className={`flex w-full items-start gap-3 p-3.5 text-left transition ${
                      isSelected ? 'bg-indigo-50/80 border-l-4 border-indigo-600' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {initials(convo.customerName)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-xs font-bold text-gray-900">{convo.customerName}</p>
                        <span className="shrink-0 text-[10px] text-gray-400">
                          {new Date(convo.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <Badge color={marketplaceBadgeColor(convo.marketplace)}>
                          {marketplaceLabel(convo.marketplace)}
                        </Badge>
                        <Badge color={getStatusColor(convo.status)}>{convo.status}</Badge>

                        {convo.orderRef && (
                          <span className="truncate text-[10px] font-semibold text-gray-500">
                            #{convo.orderRef}
                          </span>
                        )}

                        {convo.offTopicStrikes > 0 && (
                          <span className="rounded bg-red-100 px-1 py-0.2 text-[10px] font-bold text-red-700">
                            {convo.offTopicStrikes} strike{convo.offTopicStrikes > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 truncate text-xs text-gray-500">
                        {convo.lastMessagePreview || 'New inquiry'}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Thread & Controls */}
        {selectedConvo ? (
          <div className="flex min-h-0 flex-col">
            {/* Thread Header & Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                  {initials(selectedConvo.customerName)}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-gray-900">{selectedConvo.customerName}</h2>
                    <Badge color={marketplaceBadgeColor(selectedConvo.marketplace)}>
                      {marketplaceLabel(selectedConvo.marketplace)}
                    </Badge>
                    <Badge color={getStatusColor(selectedConvo.status)}>{selectedConvo.status}</Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    Order Ref: <span className="font-semibold text-gray-700">{selectedConvo.orderRef || 'General Inquiry'}</span>
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleToggleAi}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 transition ${
                    selectedConvo.aiEnabled
                      ? 'bg-indigo-50 text-indigo-700 ring-indigo-300 hover:bg-indigo-100'
                      : 'bg-gray-100 text-gray-600 ring-gray-200 hover:bg-gray-200'
                  }`}
                >
                  <FiCpu size={12} />
                  <span>AI: {selectedConvo.aiEnabled ? 'ACTIVE' : 'PAUSED'}</span>
                </button>

                {selectedConvo.status !== 'closed' && (
                  <button
                    onClick={() => handleStatusChange('closed')}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <FiCheckCircle size={12} className="text-emerald-600" />
                    <span>Resolve</span>
                  </button>
                )}

                {selectedConvo.status !== 'escalated' && (
                  <button
                    onClick={() => handleStatusChange('escalated')}
                    className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    <FiAlertTriangle size={12} className="text-amber-600" />
                    <span>Escalate</span>
                  </button>
                )}

                {selectedConvo.status === 'closed' && (
                  <button
                    onClick={() => handleStatusChange('open')}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Re-open
                  </button>
                )}
              </div>
            </div>

            {/* Messages Stream */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-4">
              {loadingMessages ? (
                <div className="flex h-32 items-center justify-center">
                  <Spinner size="sm" />
                </div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400">No messages in this conversation.</div>
              ) : (
                messages.map((m) => {
                  const isCustomer = m.senderType === 'customer'
                  const isAi = m.senderType === 'ai'
                  const isAgent = m.senderType === 'agent'

                  return (
                    <div
                      key={m._id}
                      className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                          isCustomer
                            ? 'rounded-bl-sm border border-gray-200 bg-white text-gray-900'
                            : isAgent
                            ? 'rounded-br-sm bg-emerald-700 text-white'
                            : 'rounded-br-sm border border-indigo-200 bg-indigo-50/80 text-gray-900'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between gap-3 pb-1 border-b border-gray-100/30 text-[11px] font-bold">
                          <span className={isAgent ? 'text-emerald-100' : isAi ? 'text-indigo-800' : 'text-gray-700'}>
                            {m.senderName || (isCustomer ? selectedConvo.customerName : 'Assistant')}
                          </span>
                          <span className={isAgent ? 'text-emerald-200' : 'text-gray-400'}>
                            {new Date(m.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Body text */}
                        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>

                        {/* AI Trace Metadata (Audit Log) */}
                        {isAi && m.ai && (
                          <div className="mt-3 rounded-lg border border-indigo-100 bg-white/90 p-2 text-[11px] space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-indigo-700 font-semibold">
                              <span className="flex items-center gap-1">
                                <FiCpu size={12} /> AI Trace Status:
                              </span>
                              <span className="uppercase text-[10px] tracking-wider">{m.ai.status || 'answered'}</span>
                            </div>

                            {m.ai.toolsCalled?.length > 0 && (
                              <div className="flex items-center gap-1 text-gray-600 flex-wrap">
                                <FiTool size={11} className="text-gray-400" />
                                <span className="text-[10px] text-gray-400">Tools:</span>
                                {m.ai.toolsCalled.map((t) => (
                                  <span key={t} className="rounded bg-indigo-50 px-1 py-0.5 text-[10px] text-indigo-600 font-mono">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}

                            {m.ai.sourceIds?.length > 0 && (
                              <div className="flex items-center gap-1 text-gray-600 flex-wrap">
                                <FiFileText size={11} className="text-gray-400" />
                                <span className="text-[10px] text-gray-400">Sources:</span>
                                {m.ai.sourceIds.map((s) => (
                                  <span key={s} className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-700 font-mono">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}

                            {m.ai.flags?.length > 0 && (
                              <div className="flex items-center gap-1 text-amber-700 flex-wrap">
                                <FiAlertTriangle size={11} className="text-amber-500" />
                                <span className="text-[10px] text-gray-400">Flags:</span>
                                {m.ai.flags.map((flag) => (
                                  <span key={flag} className="rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700">
                                    {flag}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-100">
                              <span>Tokens: In {m.ai.tokensIn || 0} / Out {m.ai.tokensOut || 0}</span>
                              {m.ai.latencyMs && <span>⚡ {(m.ai.latencyMs / 1000).toFixed(2)}s</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Human Agent Reply Composer */}
            <div className="border-t border-gray-200 bg-white p-3">
              <form onSubmit={handleSendReply} className="flex items-center gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${selectedConvo.customerName} as Human Support Specialist…`}
                  disabled={sendingReply}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
                />
                <Button
                  type="submit"
                  disabled={!replyText.trim() || sendingReply}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                >
                  <FiSend size={13} />
                  <span>Send Reply</span>
                </Button>
              </form>
              <p className="mt-1.5 px-1 text-[11px] text-gray-400">
                Sending a human reply automatically pauses the AI for this thread.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center text-gray-400">
            <FiCpu size={36} className="text-gray-300" />
            <p className="mt-2 text-sm font-semibold">Select a conversation thread to view audit details</p>
          </div>
        )}
      </div>
    </div>
  )
}
