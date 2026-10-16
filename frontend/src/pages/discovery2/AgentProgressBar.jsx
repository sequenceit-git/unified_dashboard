import { FiActivity, FiCpu, FiCheck, FiLoader } from 'react-icons/fi'
import { TbBrandOpenai } from 'react-icons/tb'

export default function AgentProgressBar({ report }) {
  if (!report) return null

  const isQueued = report.status === 'queued'
  const isRunning = report.status === 'running'
  if (!isQueued && !isRunning) return null

  const progress = report.progress || {}
  const stage = progress.stage || (isQueued ? 'Queued' : 'Scanning Marketplaces')
  const percent = isQueued ? 5 : Math.max(8, Math.min(98, Number(progress.percent) || 15))
  const currentItem = progress.currentItem || (isQueued ? 'Waiting in queue...' : 'Agent initializing workflow...')
  const step = progress.step || 0
  const totalSteps = progress.totalSteps || 0

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-xl">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-44 w-44 rounded-full bg-emerald-500/15 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/30">
            <TbBrandOpenai className="animate-spin" style={{ animationDuration: '4s' }} size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Discovery Agent Two • Running Live
              </span>
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-200 ring-1 ring-inset ring-indigo-400/30">
                GPT-5 Mini
              </span>
            </div>
            <h3 className="mt-0.5 text-base font-bold text-white">
              {stage}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:text-right">
          <div className="text-right">
            <span className="text-2xl font-black tracking-tight text-white">{percent}%</span>
            <div className="text-xs text-indigo-200">
              {totalSteps > 0 ? `Item ${step} of ${totalSteps}` : 'Processing loop'}
            </div>
          </div>
        </div>
      </div>

      {/* Modern Gradient Progress Track */}
      <div className="relative z-10 mt-3">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10 p-0.5 ring-1 ring-white/10 backdrop-blur-sm">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-400 via-emerald-400 to-indigo-400 transition-all duration-700 ease-out shadow-sm shadow-emerald-400/50"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Sub-status item / live task indicator */}
      <div className="relative z-10 mt-2.5 flex items-center justify-between text-xs text-indigo-200">
        <div className="flex items-center gap-1.5 truncate max-w-xl">
          <FiLoader className="animate-spin text-emerald-400 shrink-0" size={13} />
          <span className="truncate">
            <span className="text-indigo-400 mr-1.5 font-medium">Activity:</span>
            <span className="text-white font-medium">{currentItem}</span>
          </span>
        </div>
        <span className="shrink-0 text-[11px] text-indigo-300">
          Auto-refreshing live
        </span>
      </div>
    </div>
  )
}
