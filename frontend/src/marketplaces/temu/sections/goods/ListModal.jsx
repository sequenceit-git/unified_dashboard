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
  const [errors, setErrors] = useState({})
  const [checkNote, setCheckNote] = useState('')
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState('')

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  useEffect(() => {
    api.get('/api/temu/goods/helpers/shipping-templates', token).then(setTemplates).catch((err) => setErrors((e) => ({ ...e, shippingTemplateId: err.message })))
  }, [token])
  useEffect(() => {
    if (!form.catId) return
    let stop = false
    api.get(`/api/temu/goods/helpers/template${queryString({ catId: form.catId })}`, token)
      .then((t) => { if (!stop) setTemplate(t) })
      .catch((err) => { if (!stop) setErrors((e) => ({ ...e, catId: err.message })) })
    return () => { stop = true }
  }, [form.catId, token])

  // Product Discovery finds: once the category's template loads, the AI fills its empty required properties.
  const [aiFill, setAiFill] = useState({ busy: false, filled: [], asked: 0, error: '' })
  const aiDoneFor = useRef(null)
  const formNow = useRef(form)
  formNow.current = form
  useEffect(() => {
    if (product?.source !== 'research_bot' || !template || !form.catId || aiDoneFor.current === form.catId) return
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
    const found = validate(form, template || {})
    setErrors(found)
    if (Object.keys(found).length) return
    if (!shop) return setErrors({ _: 'Connect the Temu shop in Settings first.' })
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
      setErrors(problemsByField(err.data || { error: err.message }))
    } finally {
      setBusy('')
    }
  }

  return (
    <Modal title={product ? `List "${product.title}" on Temu` : 'New goods on Temu'} onClose={onClose} size="4xl" wide>
      {done ? (
        <div className="space-y-3">
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>
          <div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {errors._ && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errors._}</p>}
          <Input label="Title (English, up to 500 characters) *" value={form.title} maxLength={500} onChange={(e) => set({ title: e.target.value })} />
          {errors.title && <p className="text-xs text-red-600">{errors.title}</p>}
          <CategoryPicker token={token} title={form.title} value={form.catId} path={form.catPath} onChange={chooseCategory} error={errors.catId} />
          {form.catId && !template && <p className="text-xs text-gray-500">Loading Temu's attributes for this category…</p>}
          {aiFill.busy && <p className="text-xs text-indigo-600 dark:text-indigo-300">✨ AI is filling the properties from what Product Discovery found…</p>}
          {!aiFill.busy && aiFill.asked > 0 && !aiFill.error && (
            <p className="rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
              ✨ AI filled {aiFill.filled.length} of {aiFill.asked} empty required properties from what Product Discovery found. Check them before listing.
            </p>
          )}
          {aiFill.error && <p className="text-xs text-amber-700 dark:text-amber-300">AI couldn't fill the properties: {aiFill.error}</p>}
          {template && <TemplateFields template={template} form={form} setAttr={setAttr} errors={errors} />}
          <ImageDropzone images={form.images} onChange={(images) => set({ images })} maxImages={10} label="Photos (JPEG/PNG, up to 3 MB; non-apparel square ≥ 800 px, apparel 3:4) *" />
          {errors.images && <p className="text-xs text-red-600">{errors.images}</p>}
          {template && <TemuVariants token={token} catId={form.catId} template={template} form={form} setGroups={setGroups} setSku={setSku} errors={errors} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select label="Shipping template *" value={form.shippingTemplateId} options={templates.map((t) => ({ value: String(t.id), label: t.name }))} onChange={(e) => set({ shippingTemplateId: e.target.value })} placeholder={templates.length ? 'Select…' : 'Make one in Temu Seller Center first'} />
            <Input label="Handling time (days)" type="number" min="1" value={form.handlingDays} onChange={(e) => set({ handlingDays: e.target.value })} />
            <Input label="Goods code (optional)" value={form.outGoodsSn} maxLength={100} onChange={(e) => set({ outGoodsSn: e.target.value })} />
          </div>
          {errors.shippingTemplateId && <p className="text-xs text-red-600">{errors.shippingTemplateId}</p>}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-gray-600">Bullet points (up to 6)</span>
            {bullets.map((b, i) => <Input key={i} value={b} onChange={(e) => set({ bulletPoints: Object.assign([...bullets], { [i]: e.target.value }) })} />)}
            {bullets.length < 6 && <Button type="button" size="sm" variant="secondary" onClick={() => set({ bulletPoints: [...bullets, ''] })}>Add bullet point</Button>}
            {errors.bulletPoints && <p className="text-xs text-red-600">{errors.bulletPoints}</p>}
          </div>
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">Description (plain text)</span>
            <textarea className="w-full rounded-lg border px-3 py-2 dark:bg-slate-900" rows={5} maxLength={10000} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          {checkNote && <p className="text-xs text-gray-700">{checkNote}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" type="button" disabled={Boolean(busy) || !form.variants.length} onClick={suggest}>{busy === 'suggest' ? 'Asking Temu…' : 'Suggest prices'}</Button>
            <Button variant="secondary" type="button" disabled={Boolean(busy)} onClick={check}>{busy === 'check' ? 'Checking…' : 'Check with Temu'}</Button>
            <Button type="submit" disabled={Boolean(busy)}>{busy === 'list' ? 'Sending to Temu…' : 'List on Temu'}</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
