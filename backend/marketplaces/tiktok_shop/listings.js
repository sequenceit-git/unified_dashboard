/** listings: methods mixed into the service (they use `this.call` and other service methods). */
const { plainText, categoryPath, toPounds, toInches, attributeMap, imageUrls, LISTING_STATUS, auditReason, assertNoBatchErrors, normalizeSellerSku, validateIdentifierCode, isSchemaAttrRequired, readImageBytes, certificationRequired, certificationBytes, safeFileName } = require('./format')

module.exports = {
  async getInventory(accessToken, { shop, limit = 2000 } = {}) {
    const items = []
    let pageToken = ''
    do {
      const data = await this.call(accessToken, 'POST', '/product/202502/products/search', {
        shop,
        query: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
        body: { status: 'ALL' },
      })
      const queue = [...(data.products || [])]
      const detailById = new Map()
      const worker = async () => {
        while (queue.length) {
          const prod = queue.shift()
          if (!prod?.id) continue
          try {
            detailById.set(prod.id, await this.call(accessToken, 'GET', `/product/202309/products/${encodeURIComponent(prod.id)}`, { shop }))
          } catch {
            detailById.set(prod.id, prod)
          }
        }
      }
      await Promise.all([worker(), worker(), worker()])

      for (const product of data.products || []) {
        const detail = detailById.get(product.id) || product
        const images = imageUrls(detail.main_images || product.main_images)
        const tiktokStatus = detail.status || detail.product_status || product.status
        const catalogStatus = tiktokStatus === 'ACTIVATE' ? 'active' : 'draft'
        const skus = detail.skus?.length ? detail.skus : product.skus || []
        const attributes = attributeMap(detail.product_attributes)
        const brandId = detail.brand?.id ? String(detail.brand.id) : ''
        const brand = detail.brand?.name || attributes.Brand || ''
        const rows = skus.length ? skus : [null]
        const baseTitle = detail.title || product.title || ''
        const variantList = rows.map((sku) => {
          const stock = sku ? (sku.inventory || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0) : 0
          const rawSku = sku?.seller_sku && !/^none$/i.test(String(sku.seller_sku).trim()) ? String(sku.seller_sku).trim() : ''
          const cleanSku = rawSku
            ? (/^\d+$/.test(rawSku) ? `TTS-${rawSku}` : rawSku.startsWith('TT-') ? rawSku.replace(/^TT-/, 'TTS-') : rawSku)
            : `TTS-${sku?.id || product.id}`
          const options = Object.fromEntries(
            (sku?.sales_attributes || [])
              .map((a) => [String(a.name || 'Variant').trim(), String(a.value_name || '').trim()])
              .filter(([k, v]) => Boolean(k && v)),
          )
          const price = Number(sku?.price?.sale_price || sku?.price?.tax_exclusive_price || 0)
          const listPrice = Number(sku?.list_price?.amount || 0) || undefined
          const skuImage = sku?.sales_attributes?.find((a) => a.sku_img)?.sku_img
          const image = skuImage?.urls?.[0] || skuImage?.thumb_urls?.[0] || undefined
          const identifierCode = sku?.identifier_code?.code
            ? { type: String(sku.identifier_code.type || 'GTIN').toUpperCase(), code: String(sku.identifier_code.code) }
            : undefined
          return {
            sku: cleanSku,
            rawSku,
            externalSkuId: sku?.id ? String(sku.id) : '',
            options,
            price,
            ...(listPrice ? { listPrice } : {}),
            stock,
            ...(image ? { image } : {}),
            ...(identifierCode ? { identifierCode } : {}),
          }
        })
        const isMulti = skus.length > 1
        const positivePrices = variantList.map((v) => v.price).filter((p) => p > 0)
        const minPrice = positivePrices.length ? Math.min(...positivePrices) : (variantList[0]?.price || 0)
        const totalStock = variantList.reduce((sum, v) => sum + v.stock, 0)
        const primary = variantList[0]
        const sizeChart = detail.size_chart
          ? {
              ...(detail.size_chart.template?.id ? { templateId: String(detail.size_chart.template.id) } : {}),
              ...(detail.size_chart.image?.urls?.[0] ? { image: detail.size_chart.image.urls[0] } : {}),
            }
          : undefined
        items.push({
          sku: primary?.sku || `TTS-${product.id}`,
          rawSku: primary?.rawSku || '',
          matchSkus: [...new Set(variantList.flatMap((v) => [v.sku, v.rawSku]).filter(Boolean))],
          title: baseTitle || `TikTok Shop ${product.id}`,
          description: plainText(detail.description),
          price: minPrice,
          ...(!isMulti && primary?.listPrice ? { listPrice: primary.listPrice } : {}),
          ...(!isMulti && primary?.identifierCode ? { identifierCode: primary.identifierCode } : {}),
          ...(sizeChart && (sizeChart.templateId || sizeChart.image) ? { sizeChart } : {}),
          stock: totalStock,
          variants: isMulti ? variantList.map(({ rawSku, ...v }) => v) : [],
          images,
          category: categoryPath(detail.category_chains),
          brand,
          ...(brandId ? { brandId } : {}),
          weight: toPounds(detail.package_weight),
          dimensions: toInches(detail.package_dimensions),
          attributes,
          status: catalogStatus,
          listingStatus: LISTING_STATUS[tiktokStatus] || 'pending',
          marketplaceStatus: tiktokStatus,
          listingError: auditReason(detail, tiktokStatus),
          externalListingId: !isMulti && skus[0]?.id ? `${product.id}:${skus[0].id}` : String(product.id),
        })
        if (items.length >= limit) break
      }
      pageToken = data.next_page_token || ''
    } while (pageToken && items.length < limit)
    return { inventoryItems: items, complete: !pageToken }
  },

  /** Leaf category TikTok suggests for a title. */
  async recommendCategory(accessToken, shop, title, description) {
    const data = await this.call(accessToken, 'POST', '/product/202309/categories/recommend', {
      shop,
      body: { product_title: String(title).slice(0, 255), description: description || undefined, category_version: 'v2' },
    })
    return data.leaf_category_id ? String(data.leaf_category_id) : null
  },

  /**
   * Category suggestions (`mode: 'auto'`) or leaf category search (`mode: 'search'`) using US tree v2.
   */
  async getCategories(accessToken, query, { shop, mode = 'auto' } = {}) {
    const q = String(query || '').trim()
    if (mode !== 'search') {
      const data = await this.call(accessToken, 'POST', '/product/202309/categories/recommend', {
        shop,
        body: { product_title: q.slice(0, 255), category_version: 'v2' },
      })
      if (!data.leaf_category_id) return []
      const pathParts = (data.categories || []).map((row) => row.name).filter(Boolean)
      return [{
        categoryId: String(data.leaf_category_id),
        categoryName: pathParts[pathParts.length - 1] || '',
        path: pathParts.join(' > '),
        recommended: true,
      }]
    }

    const tasks = [
      this.call(accessToken, 'GET', '/product/202309/categories', {
        shop,
        query: {
          category_version: 'v2',
          locale: 'en-US',
          ...(q ? { keyword: q.slice(0, 100) } : {}),
        },
      }),
    ]
    if (q.length >= 3) {
      tasks.push(
        this.call(accessToken, 'POST', '/product/202309/categories/recommend', {
          shop,
          body: { product_title: q.slice(0, 255), category_version: 'v2' },
        }),
      )
    }
    const [catResult, recResult] = await Promise.allSettled(tasks)
    const results = []
    const seen = new Set()

    if (recResult?.status === 'fulfilled' && recResult.value?.leaf_category_id) {
      const rec = recResult.value
      const id = String(rec.leaf_category_id)
      const pathParts = (rec.categories || []).map((row) => row.name).filter(Boolean)
      seen.add(id)
      results.push({
        categoryId: id,
        categoryName: pathParts[pathParts.length - 1] || '',
        path: pathParts.join(' > '),
        recommended: true,
      })
    }

    if (catResult?.status === 'fulfilled') {
      const rows = catResult.value?.categories || []
      const byId = new Map(rows.map((row) => [String(row.id), row]))
      const buildPath = (row) => {
        const names = []
        const visited = new Set()
        let cur = row
        while (cur && !visited.has(String(cur.id)) && names.length < 10) {
          visited.add(String(cur.id))
          if (cur.local_name) names.unshift(cur.local_name)
          cur = cur.parent_id && String(cur.parent_id) !== '0' ? byId.get(String(cur.parent_id)) : null
        }
        return names.join(' > ')
      }

      for (const row of rows) {
        if (!row.is_leaf) continue
        const id = String(row.id)
        if (seen.has(id)) continue
        const statuses = Array.isArray(row.permission_statuses) ? row.permission_statuses : []
        if (!statuses.includes('AVAILABLE') && (statuses.includes('PROHIBITED') || statuses.includes('NON_MAIN_CATEGORY'))) {
          continue
        }
        const inviteOnly = statuses.includes('INVITE_ONLY') && !statuses.includes('AVAILABLE')
        const fullPath = buildPath(row) || row.local_name || id
        seen.add(id)
        results.push({
          categoryId: id,
          categoryName: row.local_name || '',
          path: inviteOnly ? `${fullPath} (Invite only)` : fullPath,
          ...(inviteOnly ? { inviteOnly: true } : {}),
        })
        if (results.length >= 50) break
      }
    } else if (!results.length && catResult?.reason) {
      throw catResult.reason
    }

    return results.slice(0, 50)
  },

  /** Certifications, size chart, and package requirements for a leaf category. US shops use category tree v2. */
  async getCategoryRules(accessToken, categoryId, { shop } = {}) {
    const data = await this.call(accessToken, 'GET', `/product/202309/categories/${encodeURIComponent(categoryId)}/rules`, {
      shop,
      query: { category_version: 'v2', locale: 'en-US' },
    })
    return {
      certifications: (data.product_certifications || []).map((row) => ({
        id: String(row.id),
        name: row.name || 'Certification',
        required: Boolean(row.is_required),
        documentDetails: row.document_details || '',
        sampleImageUrl: row.sample_image_url || '',
        expirationRequired: Boolean(row.expiration_date?.is_required),
        conditions: (row.requirement_conditions || [])
          .filter((item) => item.attribute_id && item.attribute_value_id)
          .map((item) => ({ attributeId: String(item.attribute_id), valueId: String(item.attribute_value_id) })),
      })),
      sizeChart: {
        required: Boolean(data.size_chart?.is_required),
        supported: Boolean(data.size_chart?.is_supported),
      },
      packageDimensionRequired: data.package_dimension?.is_required !== false,
      allowedSpecialProductTypes: Array.isArray(data.allowed_special_product_types) ? data.allowed_special_product_types : [],
    }
  },

  /** Product and sales (variant) attributes for a category. */
  async getItemAspects(accessToken, categoryId, { shop } = {}) {
    const data = await this.call(accessToken, 'GET', `/product/202309/categories/${encodeURIComponent(categoryId)}/attributes`, {
      shop,
      query: { category_version: 'v2', locale: 'en-US' },
    })
    return (data.attributes || []).map((row) => {
      const isSales = row.type === 'SALES_PROPERTY'
      return {
        id: String(row.id),
        name: row.name,
        type: isSales ? 'sales' : 'product',
        required: Boolean(row.is_requried ?? row.is_required),
        recommended: !isSales && !(row.requirement_conditions || []).length,
        multiple: Boolean(row.is_multiple_selection),
        valueDataFormat: row.value_data_format || '',
        conditions: (row.requirement_conditions || [])
          .filter((item) => item.attribute_id && item.attribute_value_id)
          .map((item) => ({ attributeId: String(item.attribute_id), valueId: String(item.attribute_value_id) })),
        values: (row.values || []).map((value) => value.name),
        valueIds: Object.fromEntries((row.values || []).map((value) => [value.name, String(value.id)])),
        freeText: isSales ? true : (row.is_customizable !== false || !(row.values || []).length),
      }
    })
  },

  /** Available brands for the shop (filtered by category/name when given). */
  async getBrands(accessToken, { shop, categoryId = '', query = '', authorizedOnly = false } = {}) {
    const data = await this.call(accessToken, 'GET', '/product/202309/brands', {
      shop,
      query: {
        page_size: 100,
        category_version: 'v2',
        ...(categoryId ? { category_id: String(categoryId) } : {}),
        ...(query && String(query).trim() ? { brand_name: String(query).trim() } : {}),
        ...(authorizedOnly ? { is_authorized: true } : {}),
      },
    })
    return (data.brands || []).map((brand) => ({
      id: String(brand.id),
      name: brand.name || '',
      authorized: String(brand.authorized_status || '').toUpperCase() === 'AUTHORIZED',
      status: brand.brand_status || '',
    }))
  },

  /** Saved size chart templates from Seller Center. */
  async getSizeCharts(accessToken, { query = '' } = {}) {
    const q = String(query || '').trim()
    const data = await this.call(accessToken, 'POST', '/product/202407/sizecharts/search', {
      query: { page_size: 50 },
      body: q ? { keyword: q } : {},
    })
    return (data.size_chart || []).map((row) => ({
      id: String(row.template_id),
      name: row.template_name || `Template ${row.template_id}`,
      imageUrl: row.images?.[0]?.url || '',
    }))
  },

  /** TikTok only accepts its own image URIs; uploads from public links, /uploads files, or base64 data URLs. */
  async uploadImage(accessToken, imageSource, useCase = 'MAIN_IMAGE') {
    const { buffer, type } = await readImageBytes(imageSource)
    const ext = (type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
    const form = new FormData()
    form.append('data', new Blob([buffer], { type }), `image.${ext}`)
    form.append('use_case', useCase)
    const data = await this.call(accessToken, 'POST', '/product/202309/images/upload', { form })
    if (!data.uri) throw new Error('TikTok Shop did not accept the image.')
    return data.uri
  },

  /** Uploads a certification image or PDF and returns the TikTok id to put on the product. */
  async uploadCertification(accessToken, file, filename = 'certification') {
    const { buffer, type } = await certificationBytes(file)
    const pdf = type.includes('pdf') || String(filename).toLowerCase().endsWith('.pdf')
    if (pdf) {
      const name = safeFileName(filename, 'pdf')
      const form = new FormData()
      form.append('data', new Blob([buffer], { type: 'application/pdf' }), name)
      form.append('name', name)
      const data = await this.call(accessToken, 'POST', '/product/202309/files/upload', { form })
      if (!data.id) throw new Error('TikTok Shop did not accept the certification PDF.')
      return { files: [{ id: data.id, name, format: 'PDF' }] }
    }
    const form = new FormData()
    form.append('data', new Blob([buffer], { type: type || 'image/jpeg' }), safeFileName(filename, 'jpg'))
    form.append('use_case', 'CERTIFICATION_IMAGE')
    const data = await this.call(accessToken, 'POST', '/product/202309/images/upload', { form })
    if (!data.uri) throw new Error('TikTok Shop did not accept the certification image.')
    return { images: [{ uri: data.uri }] }
  },

  /**
   * Creates the product on TikTok Shop (`POST /product/202309/products`).
   * Supports single-SKU and multi-variant SKUs, brand_id, size_chart, identifier_code,
   * list_price, conditional attributes, certifications, and LISTING vs AS_DRAFT save_mode.
   */
  async createListing(accessToken, product, options = {}) {
    const shop = options.shop
    const saveMode = options.saveMode === 'AS_DRAFT' ? 'AS_DRAFT' : 'LISTING'
    const title = String(options.title || product.title || '').trim().slice(0, 255)
    if (!title) throw new Error('Add a product title before listing on TikTok Shop.')
    const images = (options.images?.length ? options.images : product.images || [])
      .map((url) => String(url || '').trim())
      .filter((url) => /^(https?:\/\/|\/uploads\/|data:image\/)/i.test(url))
      .slice(0, 9)
    if (!images.length) throw new Error('TikTok Shop needs at least one product image.')

    const rawVariants = Array.isArray(options.variants)
      ? options.variants
      : (Array.isArray(product.variants) ? product.variants : [])

    // Validate SKUs and variants up front before uploading any media.
    const usedIdentifierCodes = new Set()
    const usedSellerSkus = new Set()
    const uniqueSellerSku = (base, idx) => {
      let candidate = normalizeSellerSku(base)
      if (!usedSellerSkus.has(candidate)) {
        usedSellerSkus.add(candidate)
        return candidate
      }
      const suffix = `-${idx + 1}`
      candidate = `${candidate.slice(0, 50 - suffix.length)}${suffix}`
      let n = idx + 2
      while (usedSellerSkus.has(candidate)) {
        const s = `-${n++}`
        candidate = `${candidate.slice(0, 50 - s.length)}${s}`
      }
      usedSellerSkus.add(candidate)
      return candidate
    }

    let optionNames = []
    const val0ToImage = new Map()
    const validatedSingle = { price: 0, quantity: 0, listPrice: null, identifierCode: null }
    const validatedVariants = []

    if (rawVariants.length > 0) {
      if (rawVariants.length > 300) {
        throw new Error('TikTok Shop supports at most 300 variant SKUs per product.')
      }
      const firstKeys = Object.keys(rawVariants[0]?.options || {}).map((k) => String(k).trim()).filter(Boolean)
      const allKeys = [...new Set(rawVariants.flatMap((v) => Object.keys(v?.options || {}).map((k) => String(k).trim()).filter(Boolean)))]
      optionNames = firstKeys.length === allKeys.length ? firstKeys : allKeys

      if (rawVariants.length > 1 && (optionNames.length < 1 || optionNames.length > 3)) {
        throw new Error('Multi-variant TikTok Shop products must have 1 to 3 variant option types (e.g., Color, Size).')
      }
      if (optionNames.length > 3) {
        throw new Error('TikTok Shop supports at most 3 variant option types per product.')
      }
      for (const name of optionNames) {
        if (name.length > 20) {
          throw new Error(`Variant option name "${name}" must be at most 20 characters for TikTok Shop.`)
        }
      }

      const seenCombos = new Set()
      for (let i = 0; i < rawVariants.length; i += 1) {
        const variant = rawVariants[i] || {}
        const skuPrice = Number(variant.price ?? options.price ?? product.basePrice)
        if (!(skuPrice > 0 && skuPrice <= 7600)) {
          throw new Error(`Variant ${i + 1}: set a price between $0.01 and $7,600.00 for TikTok Shop.`)
        }
        const skuQty = Math.floor(Number(variant.stock ?? 0))
        if (!(skuQty >= 1 && skuQty <= 99999)) {
          throw new Error(`Variant ${i + 1}: set stock between 1 and 99,999 before listing on TikTok Shop.`)
        }
        let skuListPrice = null
        const rawListPrice = variant.listPrice ?? options.listPrice ?? product.listPrice
        if (rawListPrice != null && rawListPrice !== '' && Number(rawListPrice) > 0) {
          const lp = Number(rawListPrice)
          if (!(lp >= skuPrice && lp <= 7600)) {
            throw new Error(`Variant ${i + 1}: MSRP / list price must be between $${skuPrice.toFixed(2)} and $7,600.00.`)
          }
          skuListPrice = lp
        }
        const idCode = validateIdentifierCode(variant.identifierCode)
        if (idCode) {
          const codeKey = `${idCode.type}:${idCode.code}`
          if (usedIdentifierCodes.has(codeKey) || usedIdentifierCodes.has(idCode.code)) {
            throw new Error(`Duplicate identifier code "${idCode.code}" across variants. Each SKU needs a unique code.`)
          }
          usedIdentifierCodes.add(codeKey)
          usedIdentifierCodes.add(idCode.code)
        }

        const optEntries = []
        for (const name of optionNames) {
          const val = String(variant.options?.[name] ?? '').trim()
          if (!val) {
            throw new Error(`Variant ${i + 1} is missing a value for "${name}".`)
          }
          if (val.length > 50) {
            throw new Error(`Variant option value "${val}" must be at most 50 characters for TikTok Shop.`)
          }
          optEntries.push([name, val])
        }
        const comboKey = optEntries.map(([, val]) => val.toLowerCase()).join('\u0000')
        if (optionNames.length && seenCombos.has(comboKey)) {
          throw new Error(`Duplicate variant combination: ${optEntries.map(([, v]) => v).join(' / ')}.`)
        }
        seenCombos.add(comboKey)

        if (optionNames.length) {
          const val0 = optEntries[0][1]
          const img = String(variant.image || '').trim()
          if (!val0ToImage.has(val0)) val0ToImage.set(val0, img)
          else if (!val0ToImage.get(val0) && img) val0ToImage.set(val0, img)
        }

        const sellerSku = uniqueSellerSku(variant.sku || `${product.sku}-${i + 1}`, i)
        validatedVariants.push({
          raw: variant,
          sellerSku,
          price: skuPrice,
          listPrice: skuListPrice,
          quantity: skuQty,
          identifierCode: idCode,
          optEntries,
        })
      }

      if (optionNames.length) {
        const primaryImages = [...val0ToImage.values()]
        const withImg = primaryImages.filter(Boolean).length
        if (withImg > 0 && withImg < primaryImages.length) {
          throw new Error(`Upload an option image for every "${optionNames[0]}" value, or remove option images.`)
        }
      }
    } else {
      const quantity = Math.floor(Number(options.stock ?? product.stock ?? 0))
      if (!(quantity >= 1 && quantity <= 99999)) {
        throw new Error('Set stock between 1 and 99,999 before listing on TikTok Shop.')
      }
      const price = Number(options.price ?? product.basePrice)
      if (!(price > 0 && price <= 7600)) {
        throw new Error('Set a price between $0.01 and $7,600.00 for TikTok Shop.')
      }
      let listPrice = null
      const rawListPrice = options.listPrice ?? product.listPrice
      if (rawListPrice != null && rawListPrice !== '' && Number(rawListPrice) > 0) {
        const lp = Number(rawListPrice)
        if (!(lp >= price && lp <= 7600)) {
          throw new Error(`MSRP / list price must be between $${price.toFixed(2)} and $7,600.00.`)
        }
        listPrice = lp
      }
      validatedSingle.price = price
      validatedSingle.quantity = quantity
      validatedSingle.listPrice = listPrice
      validatedSingle.identifierCode = validateIdentifierCode(options.identifierCode ?? product.identifierCode)
    }

    const description = options.description || product.description || title
    const categoryId = options.categoryId || await this.recommendCategory(accessToken, shop, title, description)
    if (!categoryId) throw new Error('TikTok Shop could not suggest a category for this title.')

    const [warehouseId, mainImages, rawRules, allSchema] = await Promise.all([
      this.defaultWarehouseId(accessToken, shop),
      Promise.all(images.map((url) => this.uploadImage(accessToken, url, 'MAIN_IMAGE'))),
      this.getCategoryRules(accessToken, categoryId, { shop }),
      this.getItemAspects(accessToken, categoryId, { shop }).catch(() => []),
    ])

    const rules = Array.isArray(rawRules)
      ? { certifications: rawRules, sizeChart: { required: false, supported: false }, packageDimensionRequired: true }
      : {
          certifications: rawRules?.certifications || [],
          sizeChart: rawRules?.sizeChart || { required: false, supported: false },
          packageDimensionRequired: rawRules?.packageDimensionRequired !== false,
        }
    const productSchema = (allSchema || []).filter((attr) => attr.type !== 'sales')
    const salesSchema = (allSchema || []).filter((attr) => attr.type === 'sales')

    const dims = options.dimensions || product.dimensions || {}
    const filled = Object.entries(options.aspects || {}).filter(([, value]) => (
      Array.isArray(value) ? value.some((v) => String(v || '').trim()) : String(value || '').trim()
    ))
    const attributes = []
    const seenAttrs = new Set()
    const selectedValueIdsByAttr = new Map()
    for (const [id, rawValue] of filled) {
      const row = productSchema.find((attr) => attr.id === id || String(attr.name).toLowerCase() === String(id).toLowerCase())
      if (!row || seenAttrs.has(row.id)) continue
      const items = (Array.isArray(rawValue) ? rawValue : [rawValue])
        .map((v) => String(v || '').trim())
        .filter(Boolean)
      const limited = row.multiple ? items : items.slice(0, 1)
      if (!limited.length) continue
      const seenValues = new Set()
      const valuesPayload = []
      for (const name of limited) {
        const key = name.toLowerCase()
        if (seenValues.has(key)) continue
        seenValues.add(key)
        const matchedValueId = row.valueIds?.[name]
          || Object.entries(row.valueIds || {}).find(([k]) => String(k).toLowerCase() === key)?.[1]
        if (matchedValueId) {
          if (!selectedValueIdsByAttr.has(row.id)) selectedValueIdsByAttr.set(row.id, new Set())
          selectedValueIdsByAttr.get(row.id).add(String(matchedValueId))
          valuesPayload.push({ id: matchedValueId })
        } else {
          valuesPayload.push({ name: name.slice(0, 2000) })
        }
      }
      if (valuesPayload.length) {
        seenAttrs.add(row.id)
        attributes.push({ id: row.id, values: valuesPayload })
      }
    }

    if (saveMode === 'LISTING' && productSchema.length) {
      const missingAttrs = productSchema.filter((attr) => (
        isSchemaAttrRequired(attr, selectedValueIdsByAttr) && !seenAttrs.has(attr.id)
      ))
      if (missingAttrs.length) {
        throw new Error(`TikTok Shop requires these category attributes: ${missingAttrs.map((a) => a.name).join(', ')}.`)
      }
    }

    const needed = rules.certifications.filter((rule) => certificationRequired(rule, attributes))
    const provided = Array.isArray(options.certifications) ? options.certifications : []
    if (saveMode === 'LISTING') {
      const missing = needed.filter((rule) => !provided.some((item) => String(item.id) === rule.id && item.file))
      if (missing.length) {
        throw new Error(`TikTok Shop requires ${missing.map((rule) => rule.name).join(', ')} for this category. Upload each document, then publish again.`)
      }
    }
    const certifications = []
    for (const rule of needed) {
      const item = provided.find((row) => String(row.id) === rule.id)
      if (!item?.file) continue
      if (rule.expirationRequired && !item.expirationDate) {
        throw new Error(`Add an expiration date for ${rule.name}.`)
      }
      const uploaded = await this.uploadCertification(accessToken, item.file, item.name || rule.name)
      certifications.push({
        id: rule.id,
        ...uploaded,
        ...(item.expirationDate ? { expiration_date: Math.floor(new Date(item.expirationDate).getTime() / 1000) } : {}),
      })
    }

    const sc = options.sizeChart !== undefined ? options.sizeChart : product.sizeChart
    const hasSizeChart = Boolean(sc?.templateId || sc?.image)
    if (rules.sizeChart?.required && saveMode === 'LISTING' && !hasSizeChart) {
      throw new Error('TikTok Shop requires a size chart for this category. Choose a size chart template or upload an image.')
    }
    let sizeChartPayload
    if ((rules.sizeChart?.supported || rules.sizeChart?.required) && hasSizeChart) {
      if (sc.templateId) {
        sizeChartPayload = { template: { id: String(sc.templateId) } }
      } else if (sc.image) {
        const uri = await this.uploadImage(accessToken, sc.image, 'SIZE_CHART_IMAGE')
        sizeChartPayload = { image: { uri } }
      }
    }

    // Upload primary sales-attribute images once per unique image source.
    const skuImgUriByVal0 = new Map()
    if (validatedVariants.length && optionNames.length) {
      const uniqueSources = [...new Set([...val0ToImage.values()].filter(Boolean))]
      if (uniqueSources.length) {
        const uploadedEntries = await Promise.all(
          uniqueSources.map(async (src) => [src, await this.uploadImage(accessToken, src, 'ATTRIBUTE_IMAGE')]),
        )
        const uriBySrc = new Map(uploadedEntries)
        for (const [val0, src] of val0ToImage.entries()) {
          if (src && uriBySrc.has(src)) skuImgUriByVal0.set(val0, uriBySrc.get(src))
        }
      }
    }

    const buildSalesAttributes = (optEntries) => optEntries.map(([optName, optVal], optIdx) => {
      const matchedAttr = salesSchema.find((a) => String(a.name).toLowerCase() === optName.toLowerCase())
      const matchedValId = matchedAttr?.valueIds?.[optVal]
        || Object.entries(matchedAttr?.valueIds || {}).find(([k]) => String(k).toLowerCase() === optVal.toLowerCase())?.[1]
      const entry = {
        ...(matchedAttr ? { id: matchedAttr.id } : { name: optName.slice(0, 20) }),
        ...(matchedValId ? { value_id: matchedValId } : { value_name: optVal.slice(0, 50) }),
      }
      if (optIdx === 0 && skuImgUriByVal0.has(optVal)) {
        entry.sku_img = { uri: skuImgUriByVal0.get(optVal) }
      }
      return entry
    })

    const skusPayload = validatedVariants.length > 0
      ? validatedVariants.map((v) => ({
          seller_sku: v.sellerSku,
          price: { amount: v.price.toFixed(2), currency: 'USD' },
          ...(v.listPrice ? { list_price: { amount: v.listPrice.toFixed(2), currency: 'USD' } } : {}),
          inventory: [{ warehouse_id: warehouseId, quantity: v.quantity }],
          ...(v.optEntries.length ? { sales_attributes: buildSalesAttributes(v.optEntries) } : {}),
          ...(v.identifierCode ? { identifier_code: v.identifierCode } : {}),
        }))
      : [
          {
            seller_sku: uniqueSellerSku(options.sellerSku || product.sku, 0),
            price: { amount: validatedSingle.price.toFixed(2), currency: 'USD' },
            ...(validatedSingle.listPrice ? { list_price: { amount: validatedSingle.listPrice.toFixed(2), currency: 'USD' } } : {}),
            inventory: [{ warehouse_id: warehouseId, quantity: validatedSingle.quantity }],
            ...(validatedSingle.identifierCode ? { identifier_code: validatedSingle.identifierCode } : {}),
          },
        ]

    const brandId = String(options.brandId || product.brandId || '').trim()
    const weightPound = Number(Number(options.weight || product.weight || 1).toFixed(2)) || 1
    // checkOnly: the same body goes to TikTok's listing check instead; nothing is created.
    const data = await this.call(accessToken, 'POST', options.checkOnly ? '/product/202309/products/listing_check' : '/product/202309/products', {
      shop,
      body: {
        title,
        description: /<\w+/.test(description) ? description : `<p>${description.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`,
        category_id: categoryId,
        category_version: 'v2',
        ...(brandId ? { brand_id: brandId } : {}),
        main_images: mainImages.map((uri) => ({ uri })),
        package_weight: { value: String(weightPound), unit: 'POUND' },
        package_dimensions: {
          length: String(Math.max(1, Math.ceil(Number(dims.length || 10)))),
          width: String(Math.max(1, Math.ceil(Number(dims.width || 10)))),
          height: String(Math.max(1, Math.ceil(Number(dims.height || 5)))),
          unit: 'INCH',
        },
        ...(attributes.length ? { product_attributes: attributes } : {}),
        ...(certifications.length ? { certifications } : {}),
        ...(sizeChartPayload ? { size_chart: sizeChartPayload } : {}),
        save_mode: saveMode,
        skus: skusPayload,
        idempotency_key: `${product._id || product.sku}-${Date.now()}`,
      },
    })

    if (options.checkOnly) return data

    const createdSkus = Array.isArray(data.skus) ? data.skus : []
    const isMulti = createdSkus.length > 1
    let mappedVariants
    if (validatedVariants.length > 0) {
      const bySellerSku = new Map(createdSkus.map((s) => [String(s.seller_sku || ''), s]))
      mappedVariants = validatedVariants.map((v, idx) => {
        const created = bySellerSku.get(v.sellerSku) || createdSkus[idx]
        return {
          ...v.raw,
          sku: v.sellerSku,
          price: v.price,
          ...(v.listPrice ? { listPrice: v.listPrice } : {}),
          stock: v.quantity,
          ...(v.identifierCode ? { identifierCode: v.identifierCode } : {}),
          ...(created?.id ? { externalSkuId: String(created.id) } : {}),
        }
      })
    }

    const marketplaceStatus = saveMode === 'AS_DRAFT' ? 'DRAFT' : (data.status || 'PENDING')
    const externalListingId = !isMulti && createdSkus[0]?.id
      ? `${data.product_id}:${createdSkus[0].id}`
      : String(data.product_id)
    const warnings = (data.warnings || []).map((w) => w?.message).filter(Boolean)

    return {
      externalListingId,
      status: LISTING_STATUS[marketplaceStatus] || (saveMode === 'AS_DRAFT' ? 'paused' : 'pending'),
      marketplaceStatus,
      categoryId,
      ...(mappedVariants ? { variants: mappedVariants } : {}),
      ...(warnings.length ? { warnings } : {}),
    }
  },

  async applyListingAction(accessToken, action, listing, options = {}) {
    const [productId] = String(listing.externalListingId || '').split(':')
    if (!productId) throw new Error('This product is not on TikTok Shop yet.')
    const shop = options.shop
    const ids = { product_ids: [productId] }
    if (action === 'unpublish') {
      const res = await this.call(accessToken, 'POST', '/product/202309/products/deactivate', { shop, body: ids })
      assertNoBatchErrors(res, 'Could not deactivate TikTok Shop product')
      return { status: 'paused', marketplaceStatus: 'SELLER_DEACTIVATED' }
    }
    if (action === 'publish') {
      const raw = listing.marketplaceStatus
      if (raw === 'DRAFT' || raw === 'FAILED' || listing.status === 'error') {
        await this.call(accessToken, 'POST', `/product/202509/products/${encodeURIComponent(productId)}/partial_edit`, {
          shop,
          body: { save_mode: 'LISTING' },
        })
      } else {
        const res = await this.call(accessToken, 'POST', '/product/202309/products/activate', { shop, body: ids })
        assertNoBatchErrors(res, 'Could not activate TikTok Shop product')
      }
      return { status: 'pending', marketplaceStatus: 'PENDING' }
    }
    if (action === 'delete') {
      const res = await this.call(accessToken, 'DELETE', '/product/202309/products', { shop, body: ids })
      assertNoBatchErrors(res, 'Could not delete TikTok Shop product')
      return { status: 'ended', marketplaceStatus: 'DELETED' }
    }
    if (action === 'recover') {
      const res = await this.call(accessToken, 'POST', '/product/202309/products/recover', { shop, body: ids })
      assertNoBatchErrors(res, 'Could not recover TikTok Shop product')
      return { status: 'paused', marketplaceStatus: 'SELLER_DEACTIVATED' }
    }
    throw new Error(`TikTok Shop cannot ${action} a listing.`)
  },

  /** Changes title, description, price, stock, images, or package specs of a synced product. */
  async reviseListing(accessToken, externalListingId, changes, options = {}) {
    const variants = changes.variants || options.product?.variants
    const commonOpts = {
      ...options,
      externalListingId,
      ...(variants?.length ? { variants } : {}),
    }
    const skipped = []
    if (changes.price != null || changes.variantPrices) {
      const rawStatus = options.listing?.marketplaceStatus
      const isActivate = rawStatus
        ? rawStatus === 'ACTIVATE'
        : !['paused', 'pending', 'error', 'ended'].includes(options.listing?.status)
      if (!isActivate) {
        skipped.push('price')
      } else {
        await this.updatePrice(accessToken, null, changes.price, 'USD', {
          ...commonOpts,
          useVariantPrices: Boolean(changes.variantPrices),
        })
      }
    }
    if (changes.quantity != null || changes.variantStocks || changes.variantSku) {
      await this.updateStock(accessToken, null, changes.quantity, {
        ...commonOpts,
        ...(changes.variantSku ? { variantSku: changes.variantSku, variantStock: changes.variantStock } : {}),
        syncAllVariants: Boolean(changes.variantStocks),
      })
    }
    if (changes.title || changes.description != null || changes.images?.length || changes.weight != null || changes.dimensions) {
      const [productId] = String(externalListingId || '').split(':')
      const desc = changes.description != null && changes.description !== ''
        ? (/<\w+/.test(changes.description)
          ? changes.description
          : `<p>${String(changes.description).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
        : undefined
      let mainImages
      if (Array.isArray(changes.images) && changes.images.length) {
        const publicImages = changes.images.filter((url) => /^https?:\/\//i.test(url)).slice(0, 9)
        if (publicImages.length) {
          const uris = await Promise.all(publicImages.map((url) => this.uploadImage(accessToken, url)))
          mainImages = uris.map((uri) => ({ uri }))
        }
      }
      const weightVal = changes.weight != null && Number(changes.weight) > 0
        ? Number(Number(changes.weight).toFixed(2))
        : null
      const dims = changes.dimensions
      const hasDims = dims && (Number(dims.length) > 0 || Number(dims.width) > 0 || Number(dims.height) > 0)
      if (changes.title || desc || mainImages?.length || weightVal || hasDims) {
        await this.call(accessToken, 'POST', `/product/202509/products/${encodeURIComponent(productId)}/partial_edit`, {
          shop: options.shop,
          body: {
            ...(changes.title ? { title: String(changes.title).slice(0, 255) } : {}),
            ...(desc ? { description: desc } : {}),
            ...(mainImages?.length ? { main_images: mainImages } : {}),
            ...(weightVal ? { package_weight: { value: String(weightVal), unit: 'POUND' } } : {}),
            ...(hasDims ? {
              package_dimensions: {
                length: String(Math.ceil(Number(dims.length || 10))),
                width: String(Math.ceil(Number(dims.width || 10))),
                height: String(Math.ceil(Number(dims.height || 5))),
                unit: 'INCH',
              },
            } : {}),
          },
        })
      }
    }
    return { success: true, ...(skipped.length ? { skipped } : {}) }
  },

  async updateStock(accessToken, sku, quantity, options = {}) {
    const [productId, listingSkuId] = String(options.externalListingId || '').split(':')
    if (!productId) {
      throw new Error(`TikTok Shop stock update needs a synced product and SKU for ${sku}`)
    }
    const qty = Math.max(0, Math.floor(Number(quantity) || 0))
    const variants = Array.isArray(options.variants) ? options.variants : []
    let skuUpdates = []
    if (options.variantSku && variants.length) {
      const target = variants.find((v) => v.sku === options.variantSku)
      if (!target?.externalSkuId) {
        throw new Error(`Variant "${options.variantSku}" has no synced TikTok Shop SKU ID. Sync listings first.`)
      }
      skuUpdates = [{ id: String(target.externalSkuId), quantity: Math.max(0, Math.floor(Number(options.variantStock ?? qty))) }]
    } else if (listingSkuId) {
      skuUpdates = [{ id: String(listingSkuId), quantity: qty }]
    } else if (variants.length) {
      const withId = variants.filter((v) => v.externalSkuId)
      if (!withId.length) throw new Error(`TikTok Shop stock update needs synced variant SKU IDs for ${sku || productId}`)
      if (options.syncAllVariants || qty === 0) {
        skuUpdates = withId.map((v) => ({
          id: String(v.externalSkuId),
          quantity: qty === 0 ? 0 : Math.max(0, Math.floor(Number(v.stock) || 0)),
        }))
      } else if (withId.length === 1) {
        skuUpdates = [{ id: String(withId[0].externalSkuId), quantity: qty }]
      } else {
        throw new Error('Select a specific variant to adjust stock on this multi-variant TikTok Shop product.')
      }
    } else {
      throw new Error(`TikTok Shop stock update needs a synced product and SKU for ${sku}`)
    }

    const warehouseId = await this.defaultWarehouseId(accessToken, options.shop)
    const path = `/product/202309/products/${encodeURIComponent(productId)}/inventory/update`
    try {
      const res = await this.call(accessToken, 'POST', path, {
        shop: options.shop,
        body: { skus: skuUpdates.map((u) => ({ id: u.id, inventory: [{ warehouse_id: warehouseId, quantity: u.quantity }] })) },
      })
      return assertNoBatchErrors(res, 'TikTok Shop inventory update failed')
    } catch (err) {
      if (!/warehouse|inventory|12052097/i.test(`${err.message || ''} ${err.code || ''}`)) throw err
      const detail = await this.call(accessToken, 'GET', `/product/202309/products/${encodeURIComponent(productId)}`, { shop: options.shop })
      const skusPayload = []
      for (const upd of skuUpdates) {
        const targetSku = (detail.skus || []).find((row) => String(row.id) === String(upd.id))
        const warehouses = (targetSku?.inventory || []).map((row) => row.warehouse_id).filter(Boolean)
        if (!warehouses.length) throw err
        skusPayload.push({
          id: upd.id,
          inventory: warehouses.map((id, idx) => ({ warehouse_id: String(id), quantity: idx === 0 ? upd.quantity : 0 })),
        })
      }
      const retryRes = await this.call(accessToken, 'POST', path, {
        shop: options.shop,
        body: { skus: skusPayload },
      })
      return assertNoBatchErrors(retryRes, 'TikTok Shop inventory update failed')
    }
  },

  async updatePrice(accessToken, sku, price, currency = 'USD', options = {}) {
    const [productId, listingSkuId] = String(options.externalListingId || '').split(':')
    if (!productId) {
      throw new Error(`TikTok Shop price update needs a synced product and SKU for ${sku}`)
    }
    const variants = Array.isArray(options.variants) ? options.variants.filter((v) => v.externalSkuId) : []
    let skuPrices = []
    if (variants.length) {
      skuPrices = variants.map((v) => {
        const amountVal = options.useVariantPrices ? (v.price ?? price) : (price ?? v.price)
        return {
          id: String(v.externalSkuId),
          price: { amount: Number(amountVal).toFixed(2), currency },
        }
      })
    } else if (listingSkuId) {
      skuPrices = [{ id: String(listingSkuId), price: { amount: Number(price).toFixed(2), currency } }]
    } else {
      throw new Error(`TikTok Shop price update needs a synced product and SKU for ${sku}`)
    }
    return this.call(accessToken, 'POST', `/product/202309/products/${encodeURIComponent(productId)}/prices/update`, {
      shop: options.shop,
      body: { skus: skuPrices },
    })
  },
}
