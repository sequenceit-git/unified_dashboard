/**
 * New goods (no `product`): the same form; on submit the dashboard product is saved first, then listed.
 * List a dashboard product on Temu US with Temu's own release flow: category → Temu's attributes
 * → variant values and one row per SKU → photos → shipping template → Check → List on Temu.
 * Temu reviews new goods, so they start "Under review". A refusal shows Temu's reason next to the
 * field and keeps everything typed.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { useApi } from '../../../../hooks/useApi'
import { api, queryString } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import { Input, Select } from '../../../../components/ui/Input'
import Modal from '../../../../components/ui/Modal'
import ImageDropzone from '../../../../components/ui/ImageDropzone'
import CategoryPicker from './listing/CategoryPicker'
import TemplateFields from './listing/TemplateFields'
import { applyAiFill, missingForAi } from './listing/aiFill'
import { TEMU_LIST_STEPS, problemsFrom } from './listing/listSteps'
import StepPanel, { Step } from '../../ui/StepPanel'
import StepProblems from '../../ui/StepProblems'
import TemuVariants from './listing/TemuVariants'
import { formFromProduct, newProductBody, problemsByField, skusFor, toTemuForm, validate } from './listing/temuForm'

export default function ListModal({ product, onClose, onSaved }) {
  const { token } = useAuth()
  const shopsRes = useApi(token ? '/api/shops' : null)
  const shop = (shopsRes.data || []).find((s) => s.marketplace === 'temu' && s.status === 'connected')
  const [form, setForm] = useState(() => formFromProduct(product || {}))
  // New goods: the dashboard product saved on the first submit (kept so a retry doesn't make another).
  const [saved, setSaved] = useState(product || null)
  const [template, setTemplate] = useState(null)
  const [templates, setTemplates] = useState([])
  // Errors Temu or a load gave (cleared on the next try); the form's own checks follow every edit after a try.
  const [server, setServer] = useState({})
  const [tried, setTried] = useState(false)
  const [step, setStep] = useState('basics')
  const [checkNote, setCheckNote] = useState('')
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState('')

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  useEffect(() => {
    api.get('/api/temu/goods/helpers/shipping-templates', token).then(setTemplates).catch((err) => setServer((e) => ({ ...e, shippingTemplateId: err.message })))
  }, [token])
  useEffect(() => {
    if (!form.catId) return
    let stop = false
    api.get(`/api/temu/goods/helpers/template${queryString({ catId: form.catId })}`, token)
      .then((t) => { if (!stop) setTemplate(t) })
      .catch((err) => { if (!stop) setServer((e) => ({ ...e, catId: err.message })) })
    return () => { stop = true }
  }, [form.catId, token])

  // Goods from Product Discovery or Direct listing: once the category's template loads, the AI fills its
  // empty required properties from what was found (title, description, the page's specifics).
  const [aiFill, setAiFill] = useState({ busy: false, filled: [], asked: 0, error: '' })
  const aiDoneFor = useRef(null)
  const formNow = useRef(form)
  formNow.current = form
  useEffect(() => {
    if (!['research_bot', 'url_import'].includes(product?.source) || !template || !form.catId || aiDoneFor.current === form.catId) return
    aiDoneFor.current = form.catId
    const missing = missingForAi(template, formNow.current)
    if (!missing.length) return
    const forCategory = form.catId
    setAiFill({ busy: true, filled: [], asked: missing.length, error: '' })
    api.post('/api/temu/goods/fill-attributes', {
      title: formNow.current.title,
      description: formNow.current.description,
      brand: product.brand || '',
      attributes: product.attributes || {},
      schema: missing,
    }, token)
      .then((answers) => {
        if (aiDoneFor.current !== forCategory) return
        const { filled } = applyAiFill(template, formNow.current, answers)
        setForm((f) => ({ ...f, attributes: applyAiFill(template, f, answers).attributes }))
        setAiFill({ busy: false, filled, asked: missing.length, error: '' })
      })
      .catch((err) => { if (aiDoneFor.current === forCategory) setAiFill({ busy: false, filled: [], asked: missing.length, error: err.message }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, form.catId])

  const setAttr = (pid, value) => setForm((f) => ({ ...f, attributes: { ...f.attributes, [pid]: value } }))
  const setGroups = (variantGroups) => setForm((f) => ({ ...f, variantGroups, variants: skusFor(variantGroups.map((g) => g.values), f.variants, f) }))
  const setSku = (i, patch) => setForm((f) => ({ ...f, variants: f.variants.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  const chooseCategory = (catId, catPath) => {
    setTemplate(null)
    set({ catId, catPath, attributes: {}, variantGroups: [], variants: [] })
  }
  const bullets = useMemo(() => (form.bulletPoints.length ? form.bulletPoints : ['']), [form.bulletPoints])

  const check = async () => {
    setBusy('check')
    setCheckNote('')
    try {
      const { problems } = await api.post('/api/temu/goods/helpers/check', { title: form.title, description: form.description, bulletPoints: form.bulletPoints.filter(Boolean), outGoodsSn: form.outGoodsSn, skus: form.variants.map((v) => v.outSkuSn).filter(Boolean) }, token)
      setCheckNote(problems.length ? problems.map((p) => p.message).join(' ') : 'Temu found no banned words or duplicate codes.')
    } catch (err) {
      setCheckNote(err.message)
    } finally {
      setBusy('')
    }
  }

  /** Temu's recommended base price per SKU (needs category, variant values and each SKU's weight/size). */
  const suggest = async () => {
    setBusy('suggest')
    setCheckNote('')
    try {
      const list = await api.post('/api/temu/goods/helpers/price-suggestion', {
        catId: form.catId,
        shippingTemplateId: form.shippingTemplateId || undefined,
        variants: form.variants.map((v) => ({ specIds: v.specs.map((s) => s.specId), weight: v.weight, length: v.length, width: v.width, height: v.height })),
      }, token)
      const byKey = new Map(list.map((x) => [x.specIds.join(','), x.price]))
      setForm((f) => ({ ...f, variants: f.variants.map((v) => { const p = byKey.get(v.specs.map((s) => s.specId).join(',')); return p ? { ...v, basePrice: String(p.value) } : v }) }))
      setCheckNote(list.some((x) => x.price) ? "Temu's suggested prices are filled in; change them if you like." : 'Temu has no price suggestion for these SKUs.')
    } catch (err) {
      setCheckNote(err.message)
    } finally {
      setBusy('')
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setTried(true)
    setServer({})
    const found = validate(form, template || {})
    if (Object.keys(found).length) {
      setStep(problemsFrom(found)[0].step)
      return
    }
    if (!shop) return setServer({ _: 'Connect the Temu shop in Settings first.' })
    setBusy('list')
    try {
      // Temu fetches each photo once and gives its own url, which goods must use.
      const sources = [...new Set([...form.images, ...form.variants.flatMap((v) => v.images || [])])]
      const uploaded = await api.post('/api/temu/goods/helpers/images', { urls: sources }, token)
      const temuUrl = (src) => uploaded.find((u) => u.source === src)?.url || src
      let target = saved
      if (!target?._id) {
        target = await api.post('/api/temu/goods', newProductBody(form), token)
        setSaved(target)
      }
      await api.post(`/api/temu/goods/${target._id}/list`, {
        shopId: shop._id,
        title: form.title.trim(),
        price: Number(form.variants[0].basePrice),
        stock: form.variants.reduce((t, v) => t + Number(v.quantity || 0), 0),
        images: form.images,
        temuForm: toTemuForm(form, temuUrl),
      }, token)
      setDone('Sent to Temu. Temu reviews new goods before they go on sale; the next sync shows the result.')
      onSaved?.(target)
    } catch (err) {
      const fromTemu = problemsByField(err.data || { error: err.message })
      setServer(fromTemu)
      const first = problemsFrom(fromTemu)[0]
      if (first) setStep(first.step)
    } finally {
      setBusy('')
    }
  }

  const errors = { ...(tried ? validate(form, template || {}) : {}), ...server }
  const problems = problemsFrom(errors)
  const badSteps = new Set(problems.map((p) => p.step))
  const card = 'space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900'
  const title = product ? `List "${product.title}" on Temu` : 'New goods on Temu'

  if (done) {
    return (
      <Modal title={title} onClose={onClose} size="4xl" wide>
        <div className="space-y-3">
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{done}</p>
          <div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>
        </div>
      </Modal>
    )
  }

  return (
    <StepPanel
      title={title}
      steps={TEMU_LIST_STEPS}
      active={step}
      onStep={setStep}
      problemSteps={badSteps}
      onClose={onClose}
      actions={(
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="temu-list-form" disabled={Boolean(busy)}>{busy === 'list' ? 'Sending to Temu…' : 'List on Temu'}</Button>
        </>
      )}
    >
      <form id="temu-list-form" noValidate onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault() }}>
        {product?.shopListing?.status === 'error' && product.shopListing.syncError && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <strong>Temu refused the last try:</strong> {product.shopListing.syncError}
          </div>
        )}

        <Step id="basics" active={step}>
          <StepProblems problems={problems} step="basics" />
          <div className={card}>
            <Input label="Title (English, up to 500 characters) *" value={form.title} maxLength={500} onChange={(e) => set({ title: e.target.value })} />
            <ImageDropzone images={form.images} onChange={(images) => set({ images })} maxImages={10} label="Photos (JPEG/PNG, up to 3 MB; non-apparel square ≥ 800 px, apparel 3:4) *" />
          </div>
          <div className={card}>
            <span className="block text-xs font-semibold text-gray-600 dark:text-slate-300">Bullet points (up to 6)</span>
            {bullets.map((b, i) => <Input key={i} value={b} onChange={(e) => set({ bulletPoints: Object.assign([...bullets], { [i]: e.target.value }) })} />)}
            {bullets.length < 6 && <Button type="button" size="sm" variant="secondary" onClick={() => set({ bulletPoints: [...bullets, ''] })}>Add bullet point</Button>}
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-slate-300">Description (plain text)</span>
              <textarea className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-900" rows={5} maxLength={10000} value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </label>
            <Input label="Goods code (optional)" value={form.outGoodsSn} maxLength={100} onChange={(e) => set({ outGoodsSn: e.target.value })} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" type="button" size="sm" disabled={Boolean(busy)} onClick={check}>{busy === 'check' ? 'Checking…' : 'Check with Temu'}</Button>
              <span className="text-xs text-gray-500">Banned words and duplicate codes, before you list.</span>
            </div>
            {checkNote && <p className="text-xs text-gray-700 dark:text-slate-300">{checkNote}</p>}
          </div>
        </Step>

        <Step id="category" active={step}>
          <StepProblems problems={problems} step="category" />
          <div className={card}>
            <CategoryPicker token={token} title={form.title} value={form.catId} path={form.catPath} onChange={chooseCategory} error={errors.catId} />
            {form.catId && !template && <p className="text-xs text-gray-500">Loading Temu's attributes for this category…</p>}
          </div>
          {aiFill.busy && <p className="text-xs text-indigo-600 dark:text-indigo-300">✨ AI is filling the properties from what was found…</p>}
          {!aiFill.busy && aiFill.asked > 0 && !aiFill.error && (
            <p className="rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
              ✨ AI filled {aiFill.filled.length} of {aiFill.asked} empty required properties from what was found. Check them before listing.
            </p>
          )}
          {aiFill.error && <p className="text-xs text-amber-700 dark:text-amber-300">AI couldn't fill the properties: {aiFill.error}</p>}
          {template && <div className={card}><TemplateFields template={template} form={form} setAttr={setAttr} errors={errors} /></div>}
          {!form.catId && <p className="text-sm text-gray-500">Choose a category to see Temu's properties for it.</p>}
        </Step>

        <Step id="skus" active={step}>
          <StepProblems problems={problems} step="skus" />
          {template ? (
            <div className={card}>
              <TemuVariants token={token} catId={form.catId} template={template} form={form} setGroups={setGroups} setSku={setSku} errors={errors} />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" type="button" size="sm" disabled={Boolean(busy) || !form.variants.length} onClick={suggest}>{busy === 'suggest' ? 'Asking Temu…' : 'Suggest prices'}</Button>
                <span className="text-xs text-gray-500">Temu's recommended price per SKU (needs each SKU's weight and size).</span>
              </div>
              {checkNote && <p className="text-xs text-gray-700 dark:text-slate-300">{checkNote}</p>}
            </div>
          ) : <p className="text-sm text-gray-500">Choose a category first: Temu's variant types come from it.</p>}
        </Step>

        <Step id="shipping" active={step}>
          <StepProblems problems={problems} step="shipping" />
          <div className={card}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select label="Shipping template *" value={form.shippingTemplateId} options={templates.map((t) => ({ value: String(t.id), label: t.name }))} onChange={(e) => set({ shippingTemplateId: e.target.value })} placeholder={templates.length ? 'Select…' : 'Make one in Temu Seller Center first'} />
              <Input label="Handling time (days)" type="number" min="1" value={form.handlingDays} onChange={(e) => set({ handlingDays: e.target.value })} />
            </div>
          </div>
        </Step>

        <Step id="review" active={step}>
          {problems.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/40">
              <p className="mb-1 text-sm font-semibold text-rose-800 dark:text-rose-200">Fix these before listing</p>
              <ul className="space-y-1 text-sm">
                {problems.map((p) => (
                  <li key={`${p.field}:${p.message}`}>
                    <button type="button" className="text-left text-rose-700 underline-offset-2 hover:underline dark:text-rose-300" onClick={() => setStep(p.step)}>
                      {TEMU_LIST_STEPS.find((x) => x.id === p.step)?.label}: {p.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={`${card} flex gap-4`}>
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
              {form.images[0] ? <img src={form.images[0]} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-gray-400">No photo</span>}
            </div>
            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-gray-500">Title</dt><dd className="truncate">{form.title || '—'}</dd>
              <dt className="text-gray-500">Category</dt><dd className="truncate">{form.catPath || '—'}</dd>
              <dt className="text-gray-500">SKUs</dt><dd>{form.variants.length}</dd>
              <dt className="text-gray-500">From</dt><dd>{form.variants.length ? `$${Math.min(...form.variants.map((v) => Number(v.basePrice) || Infinity)).toFixed(2)}` : '—'}</dd>
              <dt className="text-gray-500">Stock</dt><dd>{form.variants.reduce((t, v) => t + Number(v.quantity || 0), 0)}</dd>
            </dl>
          </div>
          <p className="text-xs text-gray-500">Temu reviews new goods before they go on sale; anything it refuses is shown here with its reason.</p>
        </Step>
      </form>
    </StepPanel>
  )
}
