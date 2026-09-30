import { describe, expect, it } from 'vitest'
import {
  classifyIntegrationError,
  isTransportError,
  redactMessage,
  technicalDetails,
  toFetchResult,
  useIntegrationLoad,
  type IntegrationErrorContext,
  type IntegrationFetchResult,
} from '../src/composables/useIntegrationError'

/**
 * Pazaryeri verisi hata sınıflandırması. `restApi` hatada axios hata nesnesini DÖNER (fırlatmaz);
 * bu testler gerçek axios hata şekillerini (yanıtlı / yanıtsız / zaman aşımı kodlu) taklit eder.
 */
const FIXED = new Date('2026-09-30T09:30:00.000Z')
const ctx: IntegrationErrorContext = {
  service: 'IntegrationService/retrieveCategoryAttributesFromIntegration',
  integrationCode: 'trendyol',
  platformTitle: 'Trendyol',
  subject: 'attributes',
  now: () => FIXED,
}

const httpError = (status: number, data?: any, headers: Record<string, string> = {}) => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  code: 'ERR_BAD_RESPONSE',
  response: { status, data, headers },
})

describe('classifyIntegrationError — hata türleri', () => {
  it('HTTP 500 → server; backend kodu ve istek kimliği teknik ayrıntıya taşınır', () => {
    const info = classifyIntegrationError(httpError(500, { error: 'Beklenmeyen bir hata oluştu.', code: 'INTERNAL', requestId: 'req-1' }), ctx)!
    expect(info.kind).toBe('server')
    expect(info.httpStatus).toBe(500)
    expect(info.errorCode).toBe('INTERNAL')
    expect(info.requestId).toBe('req-1')
    expect(info.retryable).toBe(true)
    expect(info.canOpenSettings).toBe(true)
    expect(info.empty).toBe(false)
    expect(info.title).toContain('Trendyol')
    // 500 metni "pazaryeri çöktü" ile "API anahtarı hatalı" arasında AYIRT EDEMEZ — ikisini de söyler.
    expect(info.cause).toContain('API anahtarlarının')
  })

  it('HTTP 502/503 → server, 429 → server (hız sınırı nedeni)', () => {
    expect(classifyIntegrationError(httpError(502), ctx)!.kind).toBe('server')
    expect(classifyIntegrationError(httpError(503), ctx)!.kind).toBe('server')
    const limited = classifyIntegrationError(httpError(429), ctx)!
    expect(limited.kind).toBe('server')
    expect(limited.cause).toContain('çok fazla istek')
  })

  it('HTTP 401 ve 403 → auth; tekrar dene önerilmez, ayar önerilir', () => {
    for (const status of [401, 403]) {
      const info = classifyIntegrationError(httpError(status, { error: 'Token is undefined' }), ctx)!
      expect(info.kind).toBe('auth')
      expect(info.retryable).toBe(false)
      expect(info.canOpenSettings).toBe(true)
    }
  })

  it('HTTP 404/410 → notFound (ayara gitme önerilmez)', () => {
    const info = classifyIntegrationError(httpError(404), ctx)!
    expect(info.kind).toBe('notFound')
    expect(info.retryable).toBe(false)
    expect(info.canOpenSettings).toBe(false)
  })

  it('HTTP 408 ve 504 → timeout', () => {
    expect(classifyIntegrationError(httpError(504), ctx)!.kind).toBe('timeout')
    expect(classifyIntegrationError(httpError(408), ctx)!.kind).toBe('timeout')
  })

  it('yanıtsız ECONNABORTED / ETIMEDOUT / "timeout" iletisi → timeout', () => {
    expect(classifyIntegrationError({ isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 1000ms exceeded' }, ctx)!.kind).toBe('timeout')
    expect(classifyIntegrationError({ isAxiosError: true, code: 'ETIMEDOUT', message: 'x' }, ctx)!.kind).toBe('timeout')
    expect(classifyIntegrationError({ isAxiosError: true, message: 'Request timed out' }, ctx)!.kind).toBe('timeout')
  })

  it('yanıt hiç gelmediyse (Network Error) → network; ayar önerilmez', () => {
    const info = classifyIntegrationError({ isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error' }, ctx)!
    expect(info.kind).toBe('network')
    expect(info.httpStatus).toBeUndefined()
    expect(info.canOpenSettings).toBe(false)
    expect(info.retryable).toBe(true)
  })

  it('düz Error nesnesi de taşıma hatasıdır', () => {
    expect(isTransportError(new Error('boom'))).toBe(true)
    expect(classifyIntegrationError(new Error('boom'), ctx)!.kind).toBe('network')
  })

  it('beklenmedik 4xx (ör. 400/422) → unknown; dürüst metin', () => {
    const info = classifyIntegrationError(httpError(422, { error: 'Geçersiz istek' }), ctx)!
    expect(info.kind).toBe('unknown')
    expect(info.httpStatus).toBe(422)
    expect(info.cause).toContain('nedeni belirlenemedi')
  })
})

describe('classifyIntegrationError — boş liste ≠ hata, beklenmeyen şekil', () => {
  it('boş dizi → empty (hata değil): boş durum metni, "Yeniden kontrol et"', () => {
    const info = classifyIntegrationError([], ctx)!
    expect(info.kind).toBe('empty')
    expect(info.empty).toBe(true)
    expect(info.title).toBe('Trendyol bu kategori için özellik döndürmedi')
    expect(info.retryable).toBe(true)
    expect(info.httpStatus).toBeUndefined()
  })

  it('kategori listesi boşsa başlık kategori listesine göre', () => {
    expect(classifyIntegrationError([], { ...ctx, subject: 'categories' })!.title).toBe('Trendyol kategori listesi döndürmedi')
    expect(classifyIntegrationError([], { ...ctx, subject: 'attributeValues' })!.title).toBe('Trendyol bu özellik için değer döndürmedi')
  })

  it('boş gövde (undefined / null / "") → empty (adaptör metodu yoksa backend undefined döner)', () => {
    for (const v of [undefined, null, '']) expect(classifyIntegrationError(v, ctx)!.kind).toBe('empty')
  })

  it('dolu dizi → null (sağlıklı)', () => {
    expect(classifyIntegrationError([{ _id: 1 }], ctx)).toBeNull()
  })

  it('dizi beklenirken nesne / metin / sayı → unknown', () => {
    expect(classifyIntegrationError({ foo: 1 }, ctx)!.kind).toBe('unknown')
    expect(classifyIntegrationError('<html>', ctx)!.kind).toBe('unknown')
    expect(classifyIntegrationError(42, ctx)!.kind).toBe('unknown')
  })

  it('expectArray:false → nesne sağlıklı, boş gövde de sağlıklı', () => {
    expect(classifyIntegrationError({ foo: 1 }, ctx, { expectArray: false })).toBeNull()
    expect(classifyIntegrationError(undefined, ctx, { expectArray: false })).toBeNull()
    expect(classifyIntegrationError(httpError(500), ctx, { expectArray: false })!.kind).toBe('server')
  })

  it('dizi ve düz nesne taşıma hatası sayılmaz', () => {
    expect(isTransportError([])).toBe(false)
    expect(isTransportError({ isAxiosError: false })).toBe(false)
    expect(isTransportError(null)).toBe(false)
  })
})

describe('teknik ayrıntı — sır/PII yok', () => {
  it('servis, entegrasyon, istek zamanı ve HTTP durumu listelenir; zaman sabit saatten gelir', () => {
    const info = classifyIntegrationError(httpError(500, { code: 'INTERNAL', requestId: 'req-9' }), ctx)!
    const rows = Object.fromEntries(technicalDetails(info).map((r) => [r.label, r.value]))
    expect(rows['HTTP durumu']).toBe('500')
    expect(rows['Servis']).toBe('IntegrationService/retrieveCategoryAttributesFromIntegration')
    expect(rows['Entegrasyon']).toBe('trendyol')
    expect(rows['İstek zamanı']).toBe('2026-09-30T09:30:00.000Z')
    expect(rows['Hata kodu']).toBe('INTERNAL')
    expect(rows['İstek kimliği']).toBe('req-9')
  })

  it('X-Request-Id yanıt başlığından okunur (gövdede yoksa)', () => {
    const info = classifyIntegrationError(httpError(500, {}, { 'x-request-id': 'hdr-7' }), ctx)!
    expect(info.requestId).toBe('hdr-7')
  })

  it('sunucu iletisindeki e-posta, Bearer, anahtar=değer ve uzun belirteçler gizlenir; 160 karaktere kırpılır', () => {
    const msg = redactMessage('ali@firma.com Bearer abc.def api_key=SECRET123 ' + 'A'.repeat(40) + ' ' + 'x'.repeat(300))!
    expect(msg).not.toContain('ali@firma.com')
    expect(msg).not.toContain('abc.def')
    expect(msg).not.toContain('SECRET123')
    expect(msg).not.toMatch(/A{28}/)
    expect(msg.length).toBeLessThanOrEqual(160)
  })

  it('ham gövde/isteği geri yansıtmaz: yalnız gizlenmiş kısa ileti', () => {
    const info = classifyIntegrationError(httpError(400, { error: 'password=hunter2 hatalı', secretField: 'x' }), ctx)!
    const dump = JSON.stringify(info)
    expect(dump).not.toContain('hunter2')
    expect(dump).not.toContain('secretField')
  })

  it('redactMessage: dize olmayan / boş → undefined', () => {
    expect(redactMessage(undefined)).toBeUndefined()
    expect(redactMessage('   ')).toBeUndefined()
    expect(redactMessage({})).toBeUndefined()
  })
})

describe('toFetchResult / useIntegrationLoad', () => {
  it('başarı → ok:true, boş → ok:false + empty, hata → ok:false', () => {
    expect(toFetchResult([1], ctx)).toEqual({ ok: true, data: [1] })
    const empty = toFetchResult([], ctx)
    expect(empty.ok).toBe(false)
    expect(!empty.ok && empty.error.empty).toBe(true)
    const failed = toFetchResult(httpError(500), ctx)
    expect(!failed.ok && failed.error.kind).toBe('server')
  })

  it('run: yükleniyor → hazır; retry aynı yükleyiciyi yeniden çağırır', async () => {
    let calls = 0
    const responses: any[] = [httpError(504), [{ id: 1 }]]
    const load = useIntegrationLoad<any[]>(async () => toFetchResult(responses[calls++], ctx))
    expect(load.status.value).toBe('idle')
    const p = load.run()
    expect(load.status.value).toBe('loading')
    await p
    expect(load.status.value).toBe('error')
    expect(load.error.value!.kind).toBe('timeout')
    await load.retry()
    expect(calls).toBe(2)
    expect(load.status.value).toBe('ready')
    expect(load.error.value).toBeUndefined()
    expect(load.data.value).toEqual([{ id: 1 }])
  })

  it('boş liste status:empty (error dolu ama empty:true)', async () => {
    const load = useIntegrationLoad<any[]>(async () => toFetchResult([], ctx))
    await load.run()
    expect(load.status.value).toBe('empty')
    expect(load.error.value!.empty).toBe(true)
  })

  it('retry sırasında hata korunur (panel yerinde kalır), sonuçta temizlenir', async () => {
    let release!: (v: IntegrationFetchResult<any[]>) => void
    const first = useIntegrationLoad<any[]>(async () => toFetchResult(httpError(500), ctx))
    await first.run()
    const second = useIntegrationLoad<any[]>(() => new Promise((r) => { release = r }))
    ;(second.error as any).value = first.error.value
    const p = second.run()
    expect(second.loading.value).toBe(true)
    expect(second.error.value).toBeDefined()
    release({ ok: true, data: [1] })
    await p
    expect(second.error.value).toBeUndefined()
  })

  it('eski (geç dönen) yanıt yeni isteğin sonucunu ezmez; reset bekleyen isteği geçersiz kılar', async () => {
    const resolvers: Array<(v: IntegrationFetchResult<any[]>) => void> = []
    const load = useIntegrationLoad<any[]>(() => new Promise((r) => { resolvers.push(r) }))
    const a = load.run()
    const b = load.run()
    resolvers[1]({ ok: true, data: ['yeni'] })
    await b
    resolvers[0]({ ok: true, data: ['eski'] })
    await a
    expect(load.data.value).toEqual(['yeni'])

    const c = load.run()
    load.reset()
    resolvers[2]({ ok: true, data: ['gec'] })
    await c
    expect(load.status.value).toBe('idle')
    expect(load.data.value).toBeUndefined()
  })
})
