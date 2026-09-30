// FE-CFG-1/2 (ADR-0031) — kamu açılış yapılandırması: store varsayılanları, doğrulama, ETag/304, hata geri düşmesi,
// duyuru kapatma hatırlama, tek görsel URL kuralı, yükleme tavanı, destek iletişimi ve statik bekçiler.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/composables/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import {
  ANNOUNCEMENT_DISMISS_KEY,
  PUBLIC_CONFIG_DEFAULTS,
  PUBLIC_CONFIG_REFRESH_MS,
  announcementHash,
  currentPublicConfig,
  defaultListPageSize,
  normalizePublicConfig,
  readDismissedAnnouncement,
  reportPollInterval,
  usePublicConfigStore,
  writeDismissedAnnouncement,
} from '@/stores/publicConfig'
import { DEFAULT_PRODUCT_IMAGE_BASE_URL, buildProductImageUrl, normalizeImageBaseUrl, productImageDir } from '@/config/imageUrl'
import { filesOverLimit, formatUploadBytes } from '@/composables/useUploadLimit'
import { supportContactGroups, supportContactHref } from '@/components/layout/supportContact'
import { MAINTENANCE_FALLBACK_TEXT, announcementNotice, maintenanceNotice } from '@/components/layout/shellNotice'

const SRC = join(__dirname, '..', 'src')
const read = (p: string) => readFileSync(join(SRC, p), 'utf8')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(vue|ts|js|json|css)$/.test(name) ? [p] : []
  })
}

const SAMPLE = {
  version: 7,
  env: { images: { productBaseUrl: 'https://cdn.example.test/products/', uploadMaxBytes: 10485760 } },
  settings: {
    'support.email': 'destek@example.test',
    'support.phone': '+90 212 000 00 00',
    'announcement.enabled': true,
    'announcement.level': 'warning',
    'announcement.text': 'Saat 23:00-23:30 arası kısa kesinti.',
    'maintenance.enabled': false,
    'maintenance.message': '',
    'ui.listPageSize': 50,
    'ui.reportPollMs': 10000,
  },
}

function response(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null },
    json: async () => body,
  }
}

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null }
  setItem(k: string, v: string) { this.data.set(k, v) }
}

describe('publicConfig — varsayılanlar ve doğrulama', () => {
  it('varsayılanlar bugünkü sabitlerdir (alınamazsa uygulama eskisi gibi çalışır)', () => {
    expect(PUBLIC_CONFIG_DEFAULTS).toMatchObject({
      productBaseUrl: DEFAULT_PRODUCT_IMAGE_BASE_URL,
      uploadMaxBytes: 2_000_000,
      listPageSize: 25,
      reportPollMs: 5000,
      supportEmail: '',
      supportPhone: '',
      announcementEnabled: false,
      maintenanceEnabled: false,
    })
    expect(DEFAULT_PRODUCT_IMAGE_BASE_URL).toBe('https://images.entegrasyonik.com/products/')
  })

  it('geçerli gövde aynen alınır', () => {
    expect(normalizePublicConfig(SAMPLE)).toEqual({
      version: 7,
      productBaseUrl: 'https://cdn.example.test/products/',
      uploadMaxBytes: 10485760,
      supportEmail: 'destek@example.test',
      supportPhone: '+90 212 000 00 00',
      announcementEnabled: true,
      announcementLevel: 'warning',
      announcementText: 'Saat 23:00-23:30 arası kısa kesinti.',
      maintenanceEnabled: false,
      maintenanceMessage: '',
      listPageSize: 50,
      reportPollMs: 10000,
    })
  })

  it('nesne olmayan / beklenmeyen gövde null (mevcut değerler korunur)', () => {
    for (const bad of [null, undefined, [], '[]', 42, {}, { foo: 1 }]) expect(normalizePublicConfig(bad)).toBeNull()
  })

  it('her alan bağımsız doğrulanır; geçersiz alan varsayılana düşer', () => {
    const v = normalizePublicConfig({
      env: { images: { productBaseUrl: 'javascript:alert(1)', uploadMaxBytes: -5 } },
      settings: {
        'support.email': 'yanlış',
        'support.phone': '<script>',
        'announcement.enabled': 'true',
        'announcement.level': 'panic',
        'ui.listPageSize': 13,
        'ui.reportPollMs': 100,
      },
    })!
    expect(v.productBaseUrl).toBe(DEFAULT_PRODUCT_IMAGE_BASE_URL)
    expect(v.uploadMaxBytes).toBe(2_000_000)
    expect(v.supportEmail).toBe('')
    expect(v.supportPhone).toBe('')
    expect(v.announcementEnabled).toBe(false)
    expect(v.announcementLevel).toBe('info')
    expect(v.listPageSize).toBe(25)
    expect(v.reportPollMs).toBe(5000)
  })

  it('critical seviyesi desteklenir; metin düz metne indirgenir ve 280 karakterde kesilir', () => {
    const v = normalizePublicConfig({
      settings: { 'announcement.level': 'critical', 'announcement.text': '  a\u0000b\n\nc  ' + 'x'.repeat(400) },
    })!
    expect(v.announcementLevel).toBe('critical')
    expect(v.announcementText.startsWith('a b c')).toBe(true)
    expect(v.announcementText.length).toBe(280)
  })

  it('görsel tabanı sonda / ile tamamlanır; http(s) dışı reddedilir', () => {
    expect(normalizeImageBaseUrl('https://cdn.example.test/p')).toBe('https://cdn.example.test/p/')
    expect(normalizeImageBaseUrl(' https://cdn.example.test/p/ ')).toBe('https://cdn.example.test/p/')
    expect(normalizeImageBaseUrl('ftp://x/')).toBe('')
    expect(normalizeImageBaseUrl('')).toBe('')
    expect(normalizeImageBaseUrl(undefined)).toBe('')
  })
})

describe('publicConfig store — yükleme, ETag, hata', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('store yokken yardımcılar varsayılanı döner; varken store değerini', async () => {
    expect(defaultListPageSize()).toBe(25)
    expect(reportPollInterval()).toBe(5000)
    fetchMock.mockResolvedValueOnce(response(200, SAMPLE))
    await usePublicConfigStore().refresh()
    expect(defaultListPageSize()).toBe(50)
    expect(reportPollInterval()).toBe(10000)
    expect(currentPublicConfig().productBaseUrl).toBe('https://cdn.example.test/products/')
  })

  it('kimliksiz GET /api/public-config; çerez gönderilmez, tarayıcı önbelleği doğrulanır', async () => {
    fetchMock.mockResolvedValueOnce(response(200, SAMPLE))
    await usePublicConfigStore().refresh()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/public-config$/)
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-cache' })
    expect(init.headers['If-None-Match']).toBeUndefined()
  })

  it('ETag saklanır, sonraki istek If-None-Match gönderir; 304 değerleri korur ve tazelik zamanını günceller', async () => {
    const store = usePublicConfigStore()
    fetchMock.mockResolvedValueOnce(response(200, SAMPLE, { ETag: 'W/"7-abc"' }))
    await store.refresh()
    expect(store.etag).toBe('W/"7-abc"')
    const first = store.fetchedAt

    fetchMock.mockResolvedValueOnce(response(304))
    await new Promise((r) => setTimeout(r, 2))
    await store.refresh()
    expect(fetchMock.mock.calls[1][1].headers['If-None-Match']).toBe('W/"7-abc"')
    expect(store.listPageSize).toBe(50)
    expect(store.fetchedAt).toBeGreaterThan(first)
  })

  it('ağ hatası / 500 / bozuk gövde: varsayılanlar (ilk açılış) ya da son iyi değerler kalır', async () => {
    const store = usePublicConfigStore()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await store.refresh()
    expect(store.values).toEqual(PUBLIC_CONFIG_DEFAULTS)
    expect(store.fetchedAt).toBe(0)

    fetchMock.mockResolvedValueOnce(response(200, SAMPLE))
    await store.refresh()
    fetchMock.mockResolvedValueOnce(response(500, { error: 'x', code: 'INTERNAL' }))
    await store.refresh()
    fetchMock.mockResolvedValueOnce(response(200, []))
    await store.refresh()
    expect(store.productBaseUrl).toBe('https://cdn.example.test/products/')
    expect(store.announcement?.level).toBe('warning')
  })

  it('3 sn zaman aşımında istek iptal edilir ve varsayılanlarla devam edilir', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted')))),
    )
    const store = usePublicConfigStore()
    const done = store.refresh()
    await vi.advanceTimersByTimeAsync(3000)
    await done
    expect(store.values).toEqual(PUBLIC_CONFIG_DEFAULTS)
  })

  it('eşzamanlı çağrılar tek isteğe katılır; ensureFresh yalnız 5 dk sonra yeniden alır', async () => {
    const store = usePublicConfigStore()
    fetchMock.mockResolvedValue(response(200, SAMPLE))
    await Promise.all([store.refresh(), store.refresh(), store.ensureFresh()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await store.ensureFresh(store.fetchedAt + PUBLIC_CONFIG_REFRESH_MS - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await store.ensureFresh(store.fetchedAt + PUBLIC_CONFIG_REFRESH_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('bakım: maintenance.enabled iken model döner (ileti boşsa bileşen yedek metni kullanır)', async () => {
    const store = usePublicConfigStore()
    expect(store.maintenance).toBeNull()
    fetchMock.mockResolvedValueOnce(response(200, { ...SAMPLE, settings: { ...SAMPLE.settings, 'maintenance.enabled': true } }))
    await store.refresh()
    expect(store.maintenance).toEqual({ message: '' })
  })
})

describe('duyuru kapatma — metin özetine göre hatırlanır', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    vi.stubGlobal('window', { localStorage: storage })
    vi.stubGlobal('fetch', vi.fn())
    setActivePinia(createPinia())
  })

  afterEach(() => vi.unstubAllGlobals())

  const withText = (text: string, level = 'info') => ({ ...SAMPLE, settings: { ...SAMPLE.settings, 'announcement.level': level, 'announcement.text': text } })

  it('özet kararlı, metin ya da seviye değişince farklı', () => {
    expect(announcementHash('info', 'A')).toBe(announcementHash('info', 'A'))
    expect(announcementHash('info', 'A')).not.toBe(announcementHash('info', 'B'))
    expect(announcementHash('info', 'A')).not.toBe(announcementHash('critical', 'A'))
    expect(announcementHash('info', 'A')).toMatch(/^[0-9a-f]{8}$/)
  })

  it('kapatılan duyuru yeni oturumda (yeni store) da gizli; metin değişince yeniden görünür', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue(response(200, withText('Bakım yarın')))
    const store = usePublicConfigStore()
    await store.refresh()
    expect(store.announcementVisible).toBe(true)
    store.dismissAnnouncement()
    expect(store.announcementVisible).toBe(false)
    expect(storage.getItem(ANNOUNCEMENT_DISMISS_KEY)).toBe(announcementHash('info', 'Bakım yarın'))

    setActivePinia(createPinia())
    const next = usePublicConfigStore()
    await next.refresh()
    expect(next.announcementVisible).toBe(false)

    fetchMock.mockResolvedValue(response(200, withText('Bakım ertelendi')))
    await next.refresh()
    expect(next.announcementVisible).toBe(true)
  })

  it('duyuru kapalıysa ya da metin boşsa gösterilmez', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(response(200, withText('')))
    const store = usePublicConfigStore()
    await store.refresh()
    expect(store.announcement).toBeNull()
    fetchMock.mockResolvedValueOnce(response(200, { ...SAMPLE, settings: { ...SAMPLE.settings, 'announcement.enabled': false } }))
    await store.refresh()
    expect(store.announcementVisible).toBe(false)
  })

  it('depo erişilemezse çökmez (kapatma yalnız bellekte geçerli)', () => {
    const broken = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('QuotaExceeded') } }
    expect(readDismissedAnnouncement(broken)).toBe('')
    expect(() => writeDismissedAnnouncement('abc', broken)).not.toThrow()
    expect(readDismissedAnnouncement(undefined)).toBe('')
  })
})

describe('görsel URL kuralı (config/imageUrl.ts)', () => {
  const ctx = { baseUrl: 'https://cdn.example.test/products/', clientId: 24, productId: 'p1' }

  it('önce DB kaydının url alanı aynen kullanılır', () => {
    expect(buildProductImageUrl({ _id: 'i1', extension: 'jpg', url: 'https://x.test/a.jpg' }, ctx)).toBe('https://x.test/a.jpg')
    expect(buildProductImageUrl({ _id: 'i1', extension: 'jpg', url: 'https://x.test/a.jpg' }, { ...ctx, thumbnail: true })).toBe('https://x.test/a.jpg')
  })

  it('url yoksa backend yolu: taban + clientId/productId/imageId.ext (küçük resimde _t)', () => {
    expect(buildProductImageUrl({ _id: 'i1', extension: 'png' }, ctx)).toBe('https://cdn.example.test/products/24/p1/i1.png')
    expect(buildProductImageUrl({ _id: 'i1', extension: '.png' }, { ...ctx, thumbnail: true })).toBe('https://cdn.example.test/products/24/p1/i1_t.png')
    expect(buildProductImageUrl({ _id: 'i1', extension: 'png', url: '' }, { ...ctx, baseUrl: 'https://cdn.example.test/products' })).toBe(
      'https://cdn.example.test/products/24/p1/i1.png',
    )
  })

  it('taban, clientId, ürün/görsel kimliği ya da uzantı eksikse undefined (yer tutucu)', () => {
    expect(buildProductImageUrl(null, ctx)).toBeUndefined()
    expect(buildProductImageUrl({ _id: 'i1', extension: 'png' }, { ...ctx, baseUrl: '' })).toBeUndefined()
    expect(buildProductImageUrl({ _id: 'i1', extension: 'png' }, { ...ctx, clientId: undefined })).toBeUndefined()
    expect(buildProductImageUrl({ _id: 'i1', extension: 'png' }, { ...ctx, clientId: 0 })).toBeUndefined()
    expect(buildProductImageUrl({ _id: 'i1', extension: 'png' }, { ...ctx, productId: '' })).toBeUndefined()
    expect(buildProductImageUrl({ extension: 'png' }, ctx)).toBeUndefined()
    expect(buildProductImageUrl({ _id: 'i1' }, ctx)).toBeUndefined()
  })

  it('ürün dizini: kaydedilmiş görsel ürün kimliği, taslak görsel tempId altında', () => {
    const form = { _id: 'p1', tempId: 't1' }
    expect(productImageDir({ isTempImage: false }, form)).toBe('p1')
    expect(productImageDir({ isTempImage: true }, form)).toBe('t1')
    expect(productImageDir({}, form)).toBe('t1')
    expect(productImageDir({ isTempImage: true }, { _id: 'p1' })).toBe('p1')
    expect(productImageDir({}, {})).toBeUndefined()
  })
})

describe('yükleme tavanı, destek iletişimi, şerit modeli', () => {
  it('tavanı aşan dosyalar adlarıyla bulunur', () => {
    const files = [{ name: 'a.jpg', size: 1_000 }, { name: 'b.jpg', size: 3_000_000 }, { name: 'c.jpg', size: 2_000_000 }]
    expect(filesOverLimit(files, 2_000_000)).toEqual(['b.jpg'])
    expect(filesOverLimit(null, 1)).toEqual([])
    expect(formatUploadBytes(10_485_760)).toBe('10,5 MB')
    expect(formatUploadBytes(2_000_000)).toBe('2 MB')
    expect(formatUploadBytes(850_000)).toBe('850 KB')
  })

  it('destek: boş değer render edilmez; ikisi de boşsa grup yok; mailto/tel bağlantısı', () => {
    expect(supportContactGroups('', '')).toEqual([])
    expect(supportContactGroups('d@x.test', '')[0].items.map((i) => i.key)).toEqual(['support-email'])
    expect(supportContactGroups('', '+90 212 000 00 00')[0].items.map((i) => i.key)).toEqual(['support-phone'])
    expect(supportContactHref('support-email', 'd@x.test', '')).toBe('mailto:d@x.test')
    expect(supportContactHref('support-phone', '', '+90 (212) 000-00 00')).toBe('tel:+902120000000')
    expect(supportContactHref('support-phone', '', '')).toBeUndefined()
    expect(supportContactHref('other', 'd@x.test', '1')).toBeUndefined()
  })

  it('duyuru seviyesi semantik tona eşlenir; bakım kapatılamaz ve boş iletide yedek metin', () => {
    expect(announcementNotice('info', 't')).toMatchObject({ tone: 'info', dismissible: true })
    expect(announcementNotice('warning', 't')).toMatchObject({ tone: 'warning', dismissible: true })
    expect(announcementNotice('critical', 't')).toMatchObject({ tone: 'error', dismissible: true })
    expect(maintenanceNotice('')).toMatchObject({ tone: 'warning', dismissible: false, text: MAINTENANCE_FALLBACK_TEXT })
    expect(maintenanceNotice('Gece 02:00')).toMatchObject({ text: 'Gece 02:00' })
  })
})

describe('statik bekçiler', () => {
  const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }))

  it('images.entegrasyonik.com src/ içinde YALNIZ varsayılan sabitinin tanımlandığı dosyada geçer', () => {
    expect(files.filter((f) => f.text.includes('images.entegrasyonik.com')).map((f) => f.rel)).toEqual(['config/imageUrl.ts'])
    expect(read('config/imageUrl.ts').match(/images\.entegrasyonik\.com/g)).toHaveLength(1)
  })

  it('eski sabitler kalmadı: baseImageURL, maxSize 2000000, rapor yoklamasında 5000', () => {
    expect(files.filter((f) => /baseImageURL|baseTempImageURL/.test(f.text)).map((f) => f.rel)).toEqual([])
    expect(files.filter((f) => /maxSize:\s*2000000/.test(f.text)).map((f) => f.rel)).toEqual([])
    for (const p of ['components/logListView/DetailedExportLogReport.vue', 'components/logListView/DetailedImportLogReport.vue']) {
      expect(read(p)).toContain('reportPollInterval()')
      expect(read(p)).not.toMatch(/getReport\(true\) \}, 5000\)/)
    }
  })

  it('liste sayfa boyutu varsayılanı store\'dan (5 yer)', () => {
    for (const p of [
      'components/page/templates/EkListScreen.vue',
      'components/customer/composables/useCustomerFilters.ts',
      'composables/useListQuery.ts', // c3b: sipariş/iade/destek listeleri useListQuery'ye taşındı
      'components/logListView/ExportLogList.vue',
      'components/logListView/ImportLogList.vue',
    ]) expect(read(p)).toContain('defaultListPageSize()')
  })

  it('şerit bileşenleri: düz metin (v-html yok), ham renk yok, bölge + role=status', () => {
    const banner = read('components/layout/ShellNoticeBanner.vue')
    expect(banner).not.toMatch(/v-html=/)
    expect(banner).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    expect(banner).toContain('role="status"')
    expect(banner).toContain(':aria-label="model.title"')
    expect(banner).toContain('aria-label="Duyuruyu kapat"')
  })

  it('açılış yapılandırması montajdan önce alınır ve restapi.ts üzerinden geçmez', () => {
    const main = read('main.ts')
    expect(main.indexOf('publicConfig.refresh()')).toBeGreaterThan(-1)
    expect(main.indexOf("app.mount('#app')")).toBeGreaterThan(main.indexOf('publicConfig.refresh()'))
    expect(read('stores/publicConfig.ts')).not.toMatch(/composables\/restapi/)
  })
})
