/** Search keywords TikTok suggests for a listed product: words buyers search for, to use in the title and description. */
import { useApi } from '../../../../../hooks/useApi'

export default function SearchKeywords({ productId }) {
  const { data, loading, error } = useApi(productId ? `/api/tiktok/products/seo-words?productIds=${encodeURIComponent(productId)}` : null)
  const words = data?.[0]?.words || []
  if (!productId) return null
  return (
    <div className="text-xs">
      <p className="mb-1 font-semibold text-gray-600">Search keywords TikTok suggests</p>
      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-rose-600">{error}</p>}
      {!loading && !error && (words.length
        ? <div className="flex flex-wrap gap-1.5">{words.map((w) => <span key={w.word} className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">{w.word}</span>)}</div>
        : <p className="text-gray-500">TikTok has no keyword suggestions for this product yet.</p>)}
    </div>
  )
}
