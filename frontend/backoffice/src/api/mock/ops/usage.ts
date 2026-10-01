/**
 * MOB-08 / K55 — sahte kullanım uçları: `BackofficeOverviewService/getPulse` (activeUsers + K51 nabız blokları) ve
 * `BackofficeTenantService/getUsage`. Sözleşme docs/API_BACKOFFICE_USAGE.md. Veri deterministik örnek: her örnek müşterinin
 * birkaç takma kullanıcısı, her birinin baskın platformu ve günlük etkinliği tohumdan türetilir; sayım backend ile aynı
 * (tekil `tid|kullanıcı`, bir kullanıcı iki sınıfta da sayılabilir). Test kolu: `__boMock.setUsageEmpty(true)` → computable:false.
 */
import type { ByClass, ByPlatform, ClientPlatform, PlatformClass, PlatformFilter, UsageDailyPoint } from '../../contract'
import { DAY, HOUR, UNHANDLED, strict, validation, type MockCtx, type MockDomain } from './context'

const PLATFORMS: readonly ClientPlatform[] = ['desktop_web', 'electron', 'mobile_web', 'pwa', 'android_app', 'unknown']
const CLASS_OF: Record<ClientPlatform, PlatformClass> = {
  desktop_web: 'desktop', electron: 'desktop', mobile_web: 'mobile', pwa: 'mobile', android_app: 'mobile', unknown: 'unknown',
}
const FILTERS: readonly string[] = ['desktop', 'mobile', ...PLATFORMS]
const NOT_COMPUTABLE = 'hesaplanamadı'
const TZ_OFFSET = 3 * HOUR // Europe/Istanbul (yaz saati yok)

function hash(...xs: number[]) {
  let a = 0x811c9dc5
  for (const x of xs) {
    a ^= x >>> 0
    a = Math.imul(a, 0x01000193) >>> 0
    a ^= a >>> 13
  }
  return a >>> 0
}
const dayKey = (ms: number) => new Date(ms + TZ_OFFSET).toISOString().slice(0, 10)
function dayKeysBack(now: number, n: number) {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(now - i * DAY))
  return out
}
function filterPlatforms(f: PlatformFilter | undefined): ClientPlatform[] | null {
  if (!f) return null
  if (f === 'desktop' || f === 'mobile') return PLATFORMS.filter((p) => CLASS_OF[p] === f)
  return [f]
}
function readFilter(body: Record<string, unknown>): PlatformFilter | undefined {
  if (body.platform === undefined) return undefined
  if (typeof body.platform !== 'string' || !FILTERS.includes(body.platform)) throw validation('platform', 'desktop | mobile | desktop_web | electron | mobile_web | pwa | android_app | unknown')
  return body.platform as PlatformFilter
}

interface Activity { day: string; tid: number; user: number; platform: ClientPlatform }

/** Bir müşterinin `n` gün geriye etkinliği (kullanıcı başına baskın platform + ara sıra ikinci platform). */
function tenantActivity(tid: number, now: number, days: number): Activity[] {
  const users = 2 + (tid % 6)
  const keys = dayKeysBack(now, days)
  const out: Activity[] = []
  const quiet = tid % 9 === 4 // örnek "uzun süredir kullanmayan" müşteri
  for (let u = 0; u < users; u++) {
    const h = hash(tid, u)
    const primary: ClientPlatform = (['desktop_web', 'desktop_web', 'desktop_web', 'electron', 'mobile_web', 'pwa', 'android_app', 'android_app'] as const)[h % 8]!
    const secondary: ClientPlatform = CLASS_OF[primary] === 'desktop' ? (h % 3 === 0 ? 'android_app' : 'mobile_web') : 'desktop_web'
    keys.forEach((day, i) => {
      if (quiet && i >= keys.length - 10) return // son 10 günde etkinlik yok
      const r = hash(tid, u, i) % 100
      if (r < 62) out.push({ day, tid, user: u, platform: primary })
      if (r % 7 === 0) out.push({ day, tid, user: u, platform: secondary })
      if (r === 99) out.push({ day, tid, user: u, platform: 'unknown' })
    })
  }
  return out
}

function summarize(acts: Activity[], fromDay: string) {
  const all = new Set<string>(); const tenants = new Set<number>()
  const cls: Record<PlatformClass, Set<string>> = { desktop: new Set(), mobile: new Set(), unknown: new Set() }
  const plat = Object.fromEntries(PLATFORMS.map((p) => [p, new Set<string>()])) as Record<ClientPlatform, Set<string>>
  for (const a of acts) {
    if (a.day < fromDay) continue
    const k = `${a.tid}|${a.user}`
    all.add(k); tenants.add(a.tid); cls[CLASS_OF[a.platform]].add(k); plat[a.platform].add(k)
  }
  const byClass: ByClass = { desktop: cls.desktop.size, mobile: cls.mobile.size, unknown: cls.unknown.size }
  const byPlatform = Object.fromEntries(PLATFORMS.map((p) => [p, plat[p].size])) as ByPlatform
  const known = new Set([...cls.desktop, ...cls.mobile]).size
  return { users: all.size, tenants: tenants.size, byClass, byPlatform, mobileShare: known ? Math.round((cls.mobile.size / known) * 1000) / 1000 : null }
}
function daily(acts: Activity[], keys: string[]): UsageDailyPoint[] {
  return keys.map((day) => {
    const s: Record<PlatformClass, Set<string>> = { desktop: new Set(), mobile: new Set(), unknown: new Set() }
    for (const a of acts) if (a.day === day) s[CLASS_OF[a.platform]].add(`${a.tid}|${a.user}`)
    return { day, desktop: s.desktop.size, mobile: s.mobile.size, unknown: s.unknown.size }
  })
}

export function createUsageMock(_t0: number) {
  let empty = false
  const activeTids = (ctx: MockCtx) => ctx.clients.filter((c) => c.status === 'ACTIVE').map((c) => c.clientId)

  function activeUsers(ctx: MockCtx, platform: PlatformFilter | undefined) {
    const f = filterPlatforms(platform)
    const keys = dayKeysBack(ctx.now, 30)
    const acts = empty ? [] : activeTids(ctx).flatMap((tid) => tenantActivity(tid, ctx.now, 30)).filter((a) => !f || f.includes(a.platform))
    if (!acts.length) {
      return { status: 'ok' as const, computable: false as const, platform: platform ?? null, today: null, last7d: null, last30d: null, byClass: null, byPlatform: null, mobileShare: null, daily: [] as [], truncated: false as const, note: NOT_COMPUTABLE }
    }
    const today = summarize(acts, keys[29]!), w7 = summarize(acts, keys[23]!), w30 = summarize(acts, keys[0]!)
    return {
      status: 'ok' as const, computable: true as const, platform: platform ?? null,
      today: { users: today.users, tenants: today.tenants }, last7d: { users: w7.users, tenants: w7.tenants }, last30d: { users: w30.users, tenants: w30.tenants },
      byClass: w7.byClass, byPlatform: w7.byPlatform, mobileShare: w7.mobileShare, daily: daily(acts, keys.slice(16)), truncated: false,
    }
  }

  function pulse(ctx: MockCtx, platform: PlatformFilter | undefined) {
    const total = ctx.clients.length
    const byStatus: Record<string, number> = {}
    for (const c of ctx.clients) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1
    const hours = Array.from({ length: 24 }, (_, i) => new Date(Math.floor((ctx.now - (23 - i) * HOUR) / HOUR) * HOUR).toISOString())
    return {
      generatedAt: new Date(ctx.now).toISOString(),
      tenants: { status: 'ok', active: byStatus.ACTIVE ?? 0, total, byStatus },
      orders: { status: 'ok', computable: false, last24h: null, last7d: null, previous24h: null, changePct: null, hourly: [], note: NOT_COMPUTABLE },
      calls: {
        status: 'ok',
        http: { computable: true, last24h: 90_210, last7d: 610_000, hourly: hours.map((t, i) => ({ t, count: 3000 + (hash(i) % 1600) })) },
        integration: { computable: true, last24h: 40_010, last7d: 280_000 },
      },
      errorRate: {
        status: 'ok',
        http: { computable: true, hourly: hours.map((t, i) => ({ t, requests: 3800, errors5xx: hash(i, 5) % 14, rate: Math.round(((hash(i, 5) % 14) / 3800) * 10000) / 10000 })) },
        integration: { computable: true, last24h: 0.021, last7d: 0.018 },
      },
      mrr: { status: 'ok', computable: true, unit: 'minor', currency: { TRY: 1_234_00 }, activeSubscriptions: 30, trialing: 8, lostLast30d: 2 },
      activeUsers: activeUsers(ctx, platform),
    }
  }

  function tenantUsage(ctx: MockCtx, body: Record<string, unknown>) {
    strict(body, ['tid', 'days', 'platform'])
    const tid = Number(body.tid)
    if (!Number.isInteger(tid) || tid <= 0) throw validation('tid', 'pozitif tam sayı olmalı')
    const days = body.days === undefined ? 30 : Number(body.days)
    if (![7, 30, 90].includes(days)) throw validation('days', '7 | 30 | 90')
    const platform = readFilter(body)
    const f = filterPlatforms(platform)
    const keys = dayKeysBack(ctx.now, days)
    const acts = empty || !activeTids(ctx).includes(tid) ? [] : tenantActivity(tid, ctx.now, days).filter((a) => !f || f.includes(a.platform))
    const s = summarize(acts, keys[0]!)
    const usage = acts.length
      ? { computable: true as const, users: s.users, byClass: s.byClass, byPlatform: s.byPlatform, mobileShare: s.mobileShare, lastActiveDay: acts.reduce((m, a) => (a.day > m ? a.day : m), ''), daily: daily(acts, keys), truncated: false }
      : { computable: false as const, users: null, byClass: null, byPlatform: null, mobileShare: null, lastActiveDay: null, daily: [] as [], truncated: false as const, note: NOT_COMPUTABLE }
    // Girişler: aktif günlerin bir kısmı + MOB-08 öncesi platformsuz kayıtlar (`unknown`).
    const loginBy = Object.fromEntries(PLATFORMS.map((p) => [p, 0])) as ByPlatform
    for (const a of acts) if (hash(tid, a.user, a.day.length, Number(a.day.slice(8))) % 3 === 0) loginBy[a.platform]++
    if (!empty && activeTids(ctx).includes(tid) && (!f || f.includes('unknown'))) loginBy.unknown += tid % 4
    const loginClass: ByClass = { desktop: 0, mobile: 0, unknown: 0 }
    for (const p of PLATFORMS) loginClass[CLASS_OF[p]] += loginBy[p]
    return {
      tid, days, platform: platform ?? null, generatedAt: new Date(ctx.now).toISOString(), from: keys[0], to: keys[keys.length - 1],
      activeUsers: usage,
      logins: { computable: true, total: loginClass.desktop + loginClass.mobile + loginClass.unknown, byClass: loginClass, byPlatform: loginBy },
    }
  }

  const domain: MockDomain & { setEmpty(v: boolean): void } = {
    setEmpty(v: boolean) { empty = v },
    handle(op, body, ctx) {
      switch (op) {
        case 'BackofficeOverviewService/getPulse':
          strict(body, ['platform'])
          return pulse(ctx, readFilter(body))
        case 'BackofficeTenantService/getUsage':
          return tenantUsage(ctx, body)
        default:
          return UNHANDLED
      }
    },
  }
  return domain
}
