// C2b (ADR-0029) — bildirim sunum modeli: istek gövdesi (tek kaynak), sayfalama, yenileri birleştirme,
// katalog normalizasyonu + yedek, kategori/ikon/ton eşlemesi, etiket bütünlüğü.
import { describe, expect, it } from 'vitest'
import { listBody, mergeNewest, parsePage, NOTIFICATION_PAGE_SIZE } from '@/stores/notificationDrawer'
import {
  CATEGORY_DEFAULTS,
  FALLBACK_CATALOG,
  NOTIFICATION_LABELS,
  buildCategories,
  labelsFor,
  normalizeCatalog,
} from '@/stores/notificationCatalog'
import {
  CATEGORY_ICONS,
  NOTIFICATION_CATEGORIES,
  interpolate,
  normalizeSeverity,
  notificationCategory,
  notificationSeverityTone,
  notificationVisual,
  type NotificationItem,
} from '@/types/NotificationTypes'

const n = (id: string, extra: Partial<NotificationItem> = {}): NotificationItem => ({ _id: id, isRead: false, ...extra })

describe('listBody (NotificationService/get gövdesi)', () => {
  it('varsayılan sayfa boyutu; tanımsız alanlar gönderilmez', () => {
    expect(listBody()).toEqual({ limit: NOTIFICATION_PAGE_SIZE })
  })
  it('imleç, afterId, kategori, okunmamış, arşiv', () => {
    expect(listBody({ cursor: 'c1', category: 'stock', onlyUnread: true, archived: true, limit: 10 })).toEqual({
      limit: 10,
      cursor: 'c1',
      category: 'stock',
      onlyUnread: true,
      archived: true,
    })
    expect(listBody({ afterId: 'n5', onlyUnread: false })).toEqual({ limit: NOTIFICATION_PAGE_SIZE, afterId: 'n5', onlyUnread: false })
  })
  it('limit 1..200 aralığına sıkıştırılır', () => {
    expect(listBody({ limit: 999 }).limit).toBe(200)
    expect(listBody({ limit: 0 }).limit).toBe(1)
  })
})

describe('parsePage', () => {
  it('nextCursor → hasMore', () => {
    expect(parsePage({ result: true, data: [n('a')], nextCursor: 'x', unreadCount: 2 })).toEqual({
      items: [n('a')],
      nextCursor: 'x',
      hasMore: true,
      unreadCount: 2,
    })
  })
  it('imleçsiz → sayfa sonu', () => {
    expect(parsePage({ result: true, data: [n('a')] })?.hasMore).toBe(false)
  })
  it('hasMore:true ama imleç yok → son kaydın kimliği imleç', () => {
    expect(parsePage({ result: true, data: [n('a'), n('b')], hasMore: true })).toMatchObject({ hasMore: true, nextCursor: 'b' })
  })
  it('geçersiz yanıt → null (hata ≠ boş)', () => {
    expect(parsePage({ result: false })).toBeNull()
    expect(parsePage(undefined)).toBeNull()
    expect(parsePage({ result: true, data: 'x' })).toBeNull()
  })
})

describe('mergeNewest', () => {
  it('yeniler başa, bilinenler yerinde güncellenir (grup sayacı)', () => {
    const existing = [n('b', { count: 1 }), n('a')]
    const merged = mergeNewest(existing, [n('c'), n('b', { count: 4 })])
    expect(merged.map((x) => x._id)).toEqual(['c', 'b', 'a'])
    expect(merged[1].count).toBe(4)
  })
  it('boş gelen → aynı dizi', () => {
    const existing = [n('a')]
    expect(mergeNewest(existing, [])).toBe(existing)
  })
})

describe('normalizeCatalog', () => {
  it('{data:{codes}} biçimi; severity "a/b", channels.email, platform ve LEGACY atlanır', () => {
    const out = normalizeCatalog({
      result: true,
      data: {
        codes: [
          { code: 'STOCK_OVERSOLD', category: 'stock', severity: 'critical', mandatory: true, channels: { email: 'inst' } },
          { code: 'ORDER_SYNC_LAGGING', category: 'order', severity: 'warning/critical' },
          { code: 'PLATFORM_ALERT_FIRING', category: 'system', surface: 'platform' },
          { code: 'LEGACY_INFO', category: 'system' },
          { code: 'BAD', category: 'nope' },
          { category: 'order' },
        ],
      },
    })
    expect(out).toEqual([
      { code: 'STOCK_OVERSOLD', category: 'stock', severities: ['critical'], mandatory: true, email: 'inst' },
      { code: 'ORDER_SYNC_LAGGING', category: 'order', severities: ['warning', 'critical'], mandatory: false, email: 'dig' },
    ])
  })
  it('dizi ve events biçimleri de okunur; geçerli satır yoksa null (yedeğe düşülür)', () => {
    expect(normalizeCatalog({ result: true, data: [{ code: 'X_A', category: 'finance' }] })).toHaveLength(1)
    expect(normalizeCatalog({ events: [{ code: 'X_B', category: 'catalog', severities: ['error'] }] })?.[0].severities).toEqual(['error'])
    expect(normalizeCatalog({ result: true, data: { codes: [] } })).toBeNull()
    expect(normalizeCatalog({ result: false })).toBeNull()
    expect(normalizeCatalog('{}')).toBeNull()
  })
})

describe('yedek katalog (plan §2.1 v1) ve kategoriler', () => {
  it('kodlar tekil, kategoriler geçerli', () => {
    const codes = FALLBACK_CATALOG.map((x) => x.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const x of FALLBACK_CATALOG) expect(NOTIFICATION_CATEGORIES).toContain(x.category)
  })
  it('billing ve security tümüyle zorunlu (kilitli); stock/integration kısmen; order/catalog/finance/system serbest', () => {
    const cats = Object.fromEntries(buildCategories(FALLBACK_CATALOG).map((c) => [c.key, c]))
    expect(cats.billing.locked).toBe(true)
    expect(cats.security.locked).toBe(true)
    expect(cats.stock.locked).toBe(false)
    expect(cats.stock.mandatoryCodes).toEqual(['STOCK_OVERSOLD', 'STOCK_UNMAPPED_LINE', 'STOCK_COMPENSATION_MANUAL', 'STOCK_OVERSOLD_UNRESOLVED'])
    expect(cats.integration.mandatoryCodes).toEqual(['INTEGRATION_AUTH_FAILED'])
    for (const k of ['order', 'catalog', 'finance', 'system'] as const) expect(cats[k].mandatoryCodes).toEqual([])
  })
  it('plan §2.3 varsayılanları', () => {
    expect(CATEGORY_DEFAULTS.catalog).toEqual({ inApp: true, email: 'off' })
    expect(CATEGORY_DEFAULTS.billing.email).toBe('inst')
    expect(CATEGORY_DEFAULTS.order.email).toBe('dig')
  })
  it('etiket bütünlüğü: katalogdaki her kod ve kategori için tr + en etiket var', () => {
    for (const locale of ['tr', 'en'] as const) {
      const labels = NOTIFICATION_LABELS[locale]
      expect(Object.keys(labels.events).sort()).toEqual(FALLBACK_CATALOG.map((x) => x.code).sort())
      expect(Object.keys(labels.categories).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort())
      expect(Object.keys(labels.categoryHints).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort())
    }
    expect(labelsFor('de')).toBe(NOTIFICATION_LABELS.tr)
  })
})

describe('kategori / görsel eşleme', () => {
  it('kategori: sunucu → katalog → kod öneki → eski tür; bilinmiyorsa undefined', () => {
    expect(notificationCategory({ category: 'finance', code: 'STOCK_X' })).toBe('finance')
    expect(notificationCategory({ code: 'WEIRD' }, () => 'billing')).toBe('billing')
    expect(notificationCategory({ code: 'STOCK_NEW_THING' })).toBe('stock')
    expect(notificationCategory({ type: 'IMPORT_READY' })).toBe('catalog')
    expect(notificationCategory({ type: 'STOCK_ALERT' })).toBe('stock')
    expect(notificationCategory({ type: 'X' })).toBeUndefined()
  })
  it('ikon: kod ayarı > kategori > eski tür; ton önemden, critical ayrıca işaretli', () => {
    expect(notificationVisual({ code: 'STOCK_OVERSOLD', severity: 'critical' })).toMatchObject({
      icon: 'mdi-package-variant-remove',
      tone: 'error',
      critical: true,
      category: 'stock',
    })
    expect(notificationVisual({ category: 'finance', severity: 'warning' })).toMatchObject({ icon: CATEGORY_ICONS.finance, tone: 'warning', critical: false })
    expect(notificationVisual({ type: 'ORDER', severity: 'danger' }).tone).toBe('error')
    expect(notificationVisual({}).icon).toBe('mdi-bell-outline')
  })
  it('önem normalizasyonu ve eski ton eşlemesi (danger → error korunur, critical → danger tonu)', () => {
    expect(normalizeSeverity('danger')).toBe('error')
    expect(normalizeSeverity('primary')).toBe('info')
    expect(notificationSeverityTone('critical')).toBe('danger')
    expect(notificationSeverityTone('danger')).toBe('danger')
  })
  it('interpolate: {param} doldurulur, bilinmeyen kalır', () => {
    expect(interpolate('{integ} hatası ({count})', { integ: 'Trendyol', count: 3 })).toBe('Trendyol hatası (3)')
    expect(interpolate('{x} kalır', {})).toBe('{x} kalır')
  })
})
