// C2b — bildirim e2e fikstürleri (notifications.spec + notification-preferences.spec ortak). Spec dosyasından import
// edilmez (Playwright içe aktarılan spec'in testlerini de kaydeder).
import type { Route } from '@playwright/test'
import { mockError } from './mockApi'
import { menuFixture } from './nav'

export const menuWithNotifications = menuFixture.map((group) =>
  group.group === 'dashboard'
    ? {
        ...group,
        links: [
          ...group.links,
          { code: 'NotificationCenterView', parent: '', title: 'notifications', icon: 'mdi-bell-badge-outline', singleton: true },
          { code: 'NotificationPreferencesView', parent: '', title: 'notificationPreferences', icon: 'mdi-bell-cog-outline', singleton: true },
        ],
      }
    : group,
)

export const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

const LEGACY_CATEGORY: Record<string, string> = { STOCK_ALERT: 'stock', ORDER: 'order', IMPORT_READY: 'catalog', EXPORT_READY: 'catalog', BATCH_PROCESS: 'catalog', SYSTEM: 'system' }
const categoryOf = (n: any) => n.category ?? LEGACY_CATEGORY[n.type] ?? (n.code ? String(n.code).split('_')[0].toLowerCase() : undefined)

export function buildNotifications() {
  return [
    {
      _id: 'nc-e2e-0001',
      type: 'IMPORT_READY',
      mode: 'IMPORT',
      severity: 'success',
      title: 'E2E içe aktarma tamamlandı',
      message: 'Trendyol kataloğunuzdan 42 ürün aktarıldı.',
      actionUrl: '/orders',
      isRead: false,
      createdAt: iso(5),
      metaData: { integrationCode: 'trendyol', totalCount: 45, processedCount: 42, invalidCount: 3 },
    },
    {
      _id: 'nc-e2e-0006',
      code: 'STOCK_OVERSOLD',
      category: 'stock',
      severity: 'critical',
      title: 'E2E aşırı satış: 3 sipariş satırı',
      message: 'Trendyol kanalında stoktan fazla satış oluştu. Satırlar telafi kuyruğunda.',
      actionUrl: '/orders?allocation=OVERSOLD',
      isRead: false,
      count: 23,
      createdAt: iso(20),
      lastOccurredAt: iso(2),
    },
    {
      _id: 'nc-e2e-0003',
      type: 'ORDER',
      severity: 'info',
      title: 'E2E yeni sipariş',
      message: 'Hepsiburada kanalından 3 yeni sipariş geldi.',
      isRead: true,
      createdAt: iso(30),
    },
    {
      _id: 'nc-e2e-0002',
      type: 'STOCK_ALERT',
      severity: 'error',
      title: 'E2E aşırı satış uyarısı',
      message: 'SKU E2E-TSH-01 için stoktan fazla sipariş alındı.',
      isRead: false,
      createdAt: iso(180),
    },
    {
      _id: 'nc-e2e-0004',
      type: 'SYSTEM',
      severity: 'warning',
      title: 'E2E sistem bakımı',
      message: 'Planlı bakım gece 02:00-03:00 arasında yapılacak.',
      actionUrl: 'https://dis-adres.example/bakim',
      isRead: true,
      createdAt: iso(600),
    },
    {
      _id: 'nc-e2e-0005',
      type: 'EXPORT_READY',
      mode: 'EXPORT',
      severity: 'info',
      title: 'E2E dışa aktarma hazır',
      message: 'Ürün listesi dışa aktarımı tamamlandı.',
      isRead: true,
      createdAt: iso(2880),
    },
  ]
}

interface Harness {
  getBodies: any[]
  markBodies: any[]
  deleteBodies: any[]
  unread: () => number
  add: (item: any) => void
}

/**
 * Durumlu mock (sunucu gibi davranır): `category`/`onlyUnread` filtresi, `limit` + imleç (`cursor` = son kaydın kimliği),
 * `afterId` (o kimlikten daha yeni kayıtlar), okundu/sil sonrası liste ve sayım değişir.
 */
export function statefulMocks(overrides: Record<string, any> = {}, seed: any[] = buildNotifications()): { routes: Record<string, any>; h: Harness } {
  let items = seed.slice()
  const h: Harness = {
    getBodies: [],
    markBodies: [],
    deleteBodies: [],
    unread: () => items.filter((n) => !n.isRead).length,
    add: (item) => (items = [item, ...items]),
  }
  const json = (route: Route, headers: Record<string, string>, body: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })
  const routes: Record<string, any> = {
    MenuService: menuWithNotifications,
    NotificationService: (route: Route, headers: Record<string, string>) => json(route, headers, { result: true, data: items.slice(0, 20), unreadCount: h.unread() }),
    'NotificationService/get': (route: Route, headers: Record<string, string>) => {
      const body = route.request().postDataJSON?.() ?? {}
      h.getBodies.push(body)
      let data = items.filter((n) => (body.onlyUnread ? !n.isRead : true)).filter((n) => (body.category ? categoryOf(n) === body.category : true))
      if (body.afterId) {
        const at = data.findIndex((n) => n._id === body.afterId)
        data = at >= 0 ? data.slice(0, at) : data
      }
      const start = body.cursor ? data.findIndex((n) => n._id === body.cursor) + 1 : 0
      const limit = body.limit ?? 25
      const page = data.slice(start, start + limit)
      const more = start + limit < data.length
      return json(route, headers, { result: true, data: page, unreadCount: h.unread(), ...(more && !body.afterId ? { nextCursor: page[page.length - 1]._id } : {}) })
    },
    'NotificationService/getUnreadCount': (route: Route, headers: Record<string, string>) => json(route, headers, { result: true, unreadCount: h.unread() }),
    'NotificationService/markAsRead': (route: Route, headers: Record<string, string>) => {
      const body = route.request().postDataJSON?.() ?? {}
      h.markBodies.push(body)
      items = items.map((n) => (body.all || body.notificationIds?.includes(n._id) ? { ...n, isRead: true } : n))
      return json(route, headers, { result: true })
    },
    'NotificationService/delete': (route: Route, headers: Record<string, string>) => {
      const body = route.request().postDataJSON?.() ?? {}
      h.deleteBodies.push(body)
      items = items.filter((n) => !body.notificationIds?.includes(n._id))
      return json(route, headers, { result: true })
    },
    // Katalog RPC'si bu kopyadaki backend'de yok → istemci plan v1 yedeğini kullanır (ayrı testte sunucu kataloğu).
    'NotificationService/getCatalog': mockError(404),
    ...overrides,
  }
  return { routes, h }
}

/** SSE yanıtı (text/event-stream). Gövde bitince tarayıcı `retry` sonra yeniden bağlanır. */
export function sseBody(events: Array<{ event: string; id?: string; data?: unknown }>, retry = 60_000) {
  return (
    `retry: ${retry}\n: connected\n\n` +
    events.map((e) => `${e.id ? `id: ${e.id}\n` : ''}event: ${e.event}\ndata: ${JSON.stringify(e.data ?? {})}\n\n`).join('')
  )
}
