import { Suspense } from 'react'
import { getShop } from '../../marketplaces'
import { useDiscovery } from './hooks/useDiscovery'
import { FiTrendingUp, FiCheckCircle, FiDownload, FiAlertTriangle } from 'react-icons/fi'
import { TbBrandOpenai } from 'react-icons/tb'
import Button from '../../components/ui/Button'
import { Spinner, EmptyState } from '../../components/ui/Feedback'
import DiscoveryOverview from './DiscoveryOverview'
import DiscoverySidebar from './DiscoverySidebar'
import OpportunityCard from './OpportunityCard'
import ProductDetailModal from './ProductDetailModal'
import NewRunModal from './NewRunModal'
import AgentProgressBar from './AgentProgressBar'


export default function ProductDiscoveryPage() {
  const {
    isAdmin,
    reports,
    selectedReportId,
    setSelectedReportId,
    recommendations,
    loadingReports,
    loadingRecs,
    activeCategoryFilter,
    setActiveCategoryFilter,
    isModalOpen,
    setIsModalOpen,
    isSubmitting,
    modalError,
    notification,
    setNotification,
    selectedProduct,
    setSelectedProduct,
    stopping,
    listing,
    setListing,
    handleLaunchRun,
    handleExport,
    handleStop,
    handleDeleteReport,
    handleListShop,
    listed,
    overviewStats,
    dynamicCategories,
    categoryCounts,
    filteredRecommendations,
    selectedReport,
    activeRunningReport,
    openLaunch,
    runInProgress,
    hasResults,
  } = useDiscovery()
  // Each shop has its own List dialog (src/marketplaces/<key>/sections/products/ListModal.jsx).
  const ShopListModal = listing ? getShop(listing.marketplace)?.ListModal : null

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-heading text-2xl font-bold text-gray-900 sm:text-3xl">Product Discovery</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-700/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
              ChatGPT
            </span>
          </div>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            Find best-selling and viral products, then save the ones worth listing.
          </p>
        </div>

        <Button onClick={openLaunch} size="md" className="flex items-center gap-2 self-start sm:self-auto">
          <TbBrandOpenai size={17} />
          <span>Launch AI Research</span>
        </Button>
      </div>

      {/* ── Active Agent Workflow Loading Bar ────────────────────────────── */}
      {activeRunningReport && (
        <AgentProgressBar report={activeRunningReport} onStop={handleStop} stopping={stopping} />
      )}

      {/* ── Notification Banner ──────────────────────────────────────────── */}
      {notification && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-xs">
          <span className="flex items-center gap-2">
            <FiCheckCircle className="text-emerald-600" size={17} />
            {notification}
          </span>
          <button onClick={() => setNotification('')} className="text-emerald-700 hover:text-emerald-950 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* ── KPI Overview ─────────────────────────────────────────────────── */}
      <DiscoveryOverview stats={overviewStats} loading={loadingReports} />

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs sm:p-5">
        <DiscoverySidebar
          reports={reports}
          selectedReportId={selectedReportId}
          onSelectReport={(id) => {
            setSelectedReportId(id)
            setActiveCategoryFilter('All')
          }}
          onDeleteReport={handleDeleteReport}
        />

        {reports.length === 0 && !loadingReports ? (
          <div className="flex flex-col items-center px-4 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <FiTrendingUp size={22} />
            </span>
            <h2 className="mt-4 text-lg font-bold text-gray-900">No research runs yet</h2>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Start a run to find best-selling and viral products.
            </p>
            {isAdmin && (
              <Button onClick={openLaunch} className="mt-5 flex items-center gap-2">
                <TbBrandOpenai size={17} />
                Launch AI Research
              </Button>
            )}
          </div>
        ) : (
          <div className={reports.length ? 'mt-5 border-t border-gray-100 pt-5' : ''}>
            {hasResults && (
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  {dynamicCategories.map((cat) => {
                    const count = cat === 'All' ? recommendations.length : (categoryCounts[cat] || categoryCounts[cat.toLowerCase()] || 0)
                    const isSelected = activeCategoryFilter.toLowerCase() === cat.toLowerCase()
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategoryFilter(cat)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {cat}
                        {count > 0 ? ` ${count}` : ''}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => handleExport('csv')} className="flex items-center gap-1.5">
                    <FiDownload size={13} />
                    CSV
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleExport('xlsx')} className="flex items-center gap-1.5">
                    <FiDownload size={13} />
                    Excel
                  </Button>
                </div>
              </div>
            )}

            {selectedReport && (
              <p className="mb-4 text-xs text-gray-500">
                {new Date(selectedReport.createdAt).toLocaleString()}
                {' · '}
                {selectedReport.params?.categories?.join(', ') || 'All categories'}
                {' · '}
                {filteredRecommendations.length} {filteredRecommendations.length === 1 ? 'product' : 'products'}
              </p>
            )}

            {selectedReport?.status === 'failed' && (
              <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <FiAlertTriangle className="mt-0.5 shrink-0 text-red-600" size={17} />
                <div className="min-w-0">
                  <p className="font-semibold">This research run failed</p>
                  <p className="mt-0.5 break-words">{selectedReport.error || 'The run stopped without an error message. Check the backend log.'}</p>
                </div>
              </div>
            )}

            {selectedReport?.status === 'completed' && selectedReport.summary && (
              <p className="mb-4 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">{selectedReport.summary}</p>
            )}

            {loadingRecs || loadingReports ? (
              <div className="py-16 text-center">
                <Spinner />
                <p className="mt-2 text-xs text-gray-500">Loading recommendations…</p>
              </div>
            ) : !hasResults && selectedReport?.status === 'failed' ? null : !hasResults ? (
              <EmptyState
                message={
                  runInProgress
                    ? 'This run is still scanning. Products will show up here when it finishes.'
                    : selectedReport?.status === 'stopped'
                      ? 'This search was stopped before any products were saved.'
                      : activeCategoryFilter !== 'All'
                        ? `No products in ${activeCategoryFilter}.`
                        : 'This run did not return any products.'
                }
              />
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {filteredRecommendations.map((opp) => (
                  <OpportunityCard
                    key={opp._id || `${opp.rank}-${opp.title || opp.productName}`}
                    opportunity={opp}
                    reportId={selectedReportId}
                    onListShop={handleListShop}
                    onOpen={() => setSelectedProduct(opp)}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Modal Pop-up for New Run ──────────────────────────────────────── */}
      {selectedProduct && (
        <ProductDetailModal opportunity={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}

      {ShopListModal && (
        <Suspense fallback={null}>
          <ShopListModal
            product={listing.product}
            marketplace={listing.marketplace}
            onClose={() => setListing(null)}
            onSaved={listed}
          />
        </Suspense>
      )}

      <NewRunModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleLaunchRun}
        isSubmitting={isSubmitting}
        error={modalError}
      />
    </div>
  )
}
