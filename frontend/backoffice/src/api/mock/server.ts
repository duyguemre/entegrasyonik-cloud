/**
 * Sahte /admin-api — sözleşmeye (../contract.ts) birebir uyan, oturum durumlu bellek içi sunucu.
 * Kurallar ADR-0026 Karar 4 + 2-BE notundan: parola → yarım oturum (TOTP'siz her operasyon MFA_REQUIRED),
 * ilk girişte enrollTotp/confirmTotp, step-up penceresi 5 dk (girişte/reauth'ta yazılır), 5 hatalı kod → kilit,
 * startImpersonation gerekçe ≥10 karakter + step-up. Yalnız geliştirme ve test içindir; üretim paketine girmez.
 */
import type {
  AdminOp,
  ApiErrorBody,
  AuditRecord,
  BackofficeMe,
  GetIssueGroupsRequest,
  IssueGroup,
  ListLogsRequest,
  LogCategory,
  LogEvent,
  LogLevel,
  LogRange,
  LogSource,
  OverviewHealthResponse,
  OverviewSectionKey,
  SearchAuditRequest,
  TraceEvent,
} from '../contract'
import { REASON_MIN, REAUTH_OPS } from '../contract'
import { MockHttpError } from './errors'
import { DAY, HOUR, ISSUE_TENANTS, MOCK_ACCOUNTS, buildAudit, buildClients, buildLogStore, rng } from './data'
import { UNHANDLED, assertImpersonatable, createP2Domains, publicConfigOf, setMockFeatureFlags, type MockCtx } from './ops'

export interface MockResponse {
  status: number
  data: unknown
  headers: Record<string, string>
}

type Stage = 'none' | 'pwd' | 'full'
interface SessionState {
  stage: Stage
  email?: string
  authTime?: number
  reauthAt?: number
  /** Kayıt tamamlanan hesaplar (ilk-giriş hesabı kayıttan sonra buraya girer). */
  enrolled: string[]
  failedCodes: number
  lockedUntil?: number
  usedRecovery: string[]
}

export interface MockServerOptions {
  now?: () => number
  /** Oturum durumunu sayfa yenilemesinde korumak için (yalnız tarayıcıda). */
  persist?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** İmpersonation biletinin açılacağı müşteri uygulaması kökü (dev: http://localhost:3000). */
  appOrigin?: string
}

const STEP_UP_WINDOW = 5 * 60_000
const PERSIST_KEY = 'ek-bo-mock-session'
const RANGE_MS: Record<LogRange, number> = { '1h': HOUR, '24h': DAY, '7d': 7 * DAY }
const CATEGORIES: LogCategory[] = ['integration', 'order', 'catalog', 'auth', 'billing', 'platform']

let reqCounter = 0
function requestId() {
  reqCounter += 1
  return `mock-${Date.now().toString(36)}-${reqCounter.toString(36)}`
}

export class MockAdminServer {
  private readonly now: () => number
  private readonly persist: MockServerOptions['persist']
  private readonly appOrigin: string
  private state: SessionState
  private degraded = false
  private liveReadonly = false
  private readonly p2: ReturnType<typeof createP2Domains>
  private readonly degradedSections = new Map<OverviewSectionKey, 'timeout' | 'error'>()
  private readonly t0: number
  private readonly clients
  private readonly logs
  private readonly audit: AuditRecord[]

  constructor(options: MockServerOptions = {}) {
    this.now = options.now ?? Date.now
    this.persist = options.persist ?? null
    this.appOrigin = options.appOrigin ?? 'http://localhost:3000'
    this.t0 = this.now()
    this.clients = buildClients(this.t0)
    this.logs = buildLogStore(this.t0)
    this.audit = buildAudit(this.t0)
    this.p2 = createP2Domains(this.t0, MOCK_ACCOUNTS.enrolled.email)
    this.state = this.load()
  }

  // ------------------------------------------------------------ test kolları
  expireReauth() {
    this.state.reauthAt = undefined
    this.save()
  }
  expireSession() {
    this.state = { ...this.state, stage: 'none', email: undefined, authTime: undefined, reauthAt: undefined }
    this.save()
  }
  setDegraded(value: boolean) {
    this.degraded = value
  }
  /** LIVE_READONLY=1: dış sisteme yazan yetenekler (retryJob, cancelSubscription, changePlan) 423. */
  setLiveReadonly(value: boolean) {
    this.liveReadonly = value
  }
  /** Örnek özellik bayrakları (backend kataloğu başlangıçta boştur). */
  setFeatureFlags(value: boolean) {
    setMockFeatureFlags(value)
  }

  private ctx(): MockCtx {
    return { now: this.now(), t0: this.t0, degraded: this.degraded, liveReadonly: this.liveReadonly, clients: this.clients, actorEmail: this.state.email ?? '' }
  }
  /** Genel bakışta tek bölümü düşür (ör. `degradeSection('red')`); `degradeSection(null)` hepsini düzeltir. */
  degradeSection(key: OverviewSectionKey | null, error: 'timeout' | 'error' = 'timeout') {
    if (key === null) this.degradedSections.clear()
    else this.degradedSections.set(key, error)
  }

  // ------------------------------------------------------------ giriş noktası
  handle(method: 'GET' | 'POST', path: string, body: unknown): MockResponse {
    const rid = requestId()
    try {
      if (method === 'GET' && path.endsWith('/health')) return this.ok({ status: 'ok' }, rid)
      if (method === 'GET' && path.endsWith('/ready')) {
        const status = { ready: !this.degraded, mongo: 'ok', redis: this.degraded ? 'fail' : 'ok' }
        return { status: this.degraded ? 503 : 200, data: status, headers: { 'x-request-id': rid } }
      }
      if (method === 'GET' && path.endsWith('/api/public-config')) return this.ok(publicConfigOf(this.p2.platform, this.ctx()), rid)
      const op = path.replace(/^.*?\/?([A-Za-z]+Service\/[A-Za-z]+)$/, '$1') as AdminOp
      return this.ok(this.rpc(op, (body ?? {}) as Record<string, unknown>), rid)
    } catch (error) {
      if (error instanceof MockHttpError) {
        return { status: error.status, data: { ...error.body, requestId: rid, operation: path.split('/').pop() }, headers: { 'x-request-id': rid } }
      }
      throw error
    }
  }

  private ok(data: unknown, rid: string): MockResponse {
    return { status: 200, data, headers: { 'x-request-id': rid } }
  }

  private rpc(op: AdminOp, body: Record<string, unknown>): unknown {
    switch (op) {
      case 'BackofficeAuthService/login':
        return this.login(String(body.email ?? ''), String(body.password ?? ''))
      case 'BackofficeAuthService/enrollTotp':
        this.requireStage('pwd')
        if (this.isEnrolled()) throw new MockHttpError(409, 'CONFLICT', 'İki adımlı doğrulama zaten kurulu.')
        return { otpauthUri: `otpauth://totp/Entegrasyonik%20Y%C3%B6netim:${encodeURIComponent(this.state.email!)}?secret=JBSWY3DPEHPK3PXPORNEK&issuer=Entegrasyonik&algorithm=SHA1&digits=6&period=30` }
      case 'BackofficeAuthService/confirmTotp': {
        this.requireStage('pwd')
        this.checkCode(String(body.code ?? ''))
        this.state.enrolled = [...new Set([...this.state.enrolled, this.state.email!])]
        this.openFull()
        const r = rng(this.now() % 100000)
        const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
        const part = () => Array.from({ length: 4 }, () => chars[Math.floor(r() * chars.length)]).join('')
        return { recoveryCodes: Array.from({ length: 10 }, () => `${part()}-${part()}`) }
      }
      case 'BackofficeAuthService/verifyTotp': {
        this.requireStage('pwd')
        if (!this.isEnrolled()) throw new MockHttpError(403, 'MFA_REQUIRED', 'Önce iki adımlı doğrulamayı kurun.')
        if (typeof body.recoveryCode === 'string') this.useRecovery(body.recoveryCode)
        else this.checkCode(String(body.code ?? ''))
        this.openFull()
        return { ok: true }
      }
      case 'BackofficeAuthService/reauth': {
        this.requireStage('full')
        if (body.password !== MOCK_ACCOUNTS.password) throw new MockHttpError(401, 'UNAUTHENTICATED', 'Parola hatalı.')
        this.checkCode(String(body.code ?? ''))
        this.state.reauthAt = this.now()
        this.save()
        return { reauthAt: new Date(this.state.reauthAt).toISOString() }
      }
      case 'BackofficeAuthService/logout':
        this.expireSession()
        return { ok: true }
      case 'BackofficeAuthService/me':
        this.requireStage('full')
        return this.me()
      case 'BackofficeAuthService/acceptInvite':
        // Kimliksiz: oturum aşaması aranmaz, oturum/çerez açılmaz.
        return this.p2.handle(op, body, this.ctx())
    }

    this.requireStage('full')
    if ((REAUTH_OPS as readonly string[]).includes(op) && (!this.state.reauthAt || this.now() - this.state.reauthAt > STEP_UP_WINDOW)) {
      throw new MockHttpError(401, 'REAUTH_REQUIRED', 'Bu işlem için yeniden doğrulama gerekli.')
    }
    // requireReason (admin/stepUp.ts): kırpılmış ≥10 karakter, aksi 400 VALIDATION.
    if ((REAUTH_OPS as readonly string[]).includes(op) && String(body.reason ?? '').trim().length < REASON_MIN) {
      throw new MockHttpError(400, 'VALIDATION', `Gerekçe (reason) en az ${REASON_MIN} karakter olmalı.`, [{ path: 'reason', message: `en az ${REASON_MIN} karakter` }])
    }

    switch (op) {
      case 'AdminService/getClients':
        return this.getClients(body)
      case 'AdminService/getSystemHealth':
        return {
          success: true,
          infrastructure: {
            activePods: ['web-7d9f-2x', 'web-7d9f-8q', 'worker-5c1b-9k'],
            redis: this.degraded
              ? { usedMemory: 'Unknown', connectedClients: '0', uptime: '0', version: 'Unknown' }
              : { usedMemory: '38.21M', connectedClients: '14', uptime: '1209600', version: '7.2.4' },
            queues: { orderSync: { wait: 3, active: 1 }, export: { wait: 42, active: 2 }, import: { wait: 0, active: 1 } },
          },
        }
      case 'BackofficeOverviewService/getHealth':
        return this.getHealth()
      case 'BackofficeTenantService/startImpersonation': {
        const reason = String(body.reason ?? '').trim()
        if (reason.length < 10) {
          throw new MockHttpError(400, 'VALIDATION', 'Geçersiz istek.', [{ path: 'reason', message: 'en az 10 karakter' }])
        }
        if (!this.clients.some((c) => c.clientId === Number(body.tid))) throw new MockHttpError(404, 'NOT_FOUND', 'Kayıt bulunamadı.')
        assertImpersonatable(this.p2.billing, Number(body.tid), this.ctx())
        if (this.degraded) throw new MockHttpError(503, 'IMPERSONATION_UNAVAILABLE', 'Impersonation şu an kullanılamıyor.')
        const ticket = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')).join('')
        return { url: `${this.appOrigin}/impersonate#t=${ticket}`, expiresInSeconds: 60 }
      }
      case 'LogCenterService/listLogs':
        return this.listLogs(body as unknown as ListLogsRequest)
      case 'LogCenterService/getIssueGroups':
        return this.getIssueGroups(body as unknown as GetIssueGroupsRequest)
      case 'LogCenterService/getIssueTrend':
        return this.getIssueTrend(String(body.fp), (body.range as LogRange) ?? '24h')
      case 'LogCenterService/getVolumeByCategory':
        return this.getVolume((body.range as LogRange) ?? '24h')
      case 'LogCenterService/getTrace':
        return this.getTrace(String(body.reqId ?? ''))
      case 'BackofficeAuditService/search':
        return this.searchAudit(body as unknown as SearchAuditRequest)
    }
    const handled = this.p2.handle(op, body, this.ctx())
    if (handled !== UNHANDLED) return handled
    throw new MockHttpError(404, 'NOT_FOUND', `Bilinmeyen operasyon: ${op}`)
  }

  // ------------------------------------------------------------ genel bakış (B1)
  private getHealth(): OverviewHealthResponse {
    const now = this.now()
    const iso = (ms: number) => new Date(ms).toISOString()
    const redisUp = !this.degraded
    const open = this.logs.issues.filter((i) => i.status === 'open' || i.status === 'acknowledged')
    const sections = {
      dependencies: { status: 'ok' as const, ready: redisUp, role: 'all' as const, mongo: 'ok' as const, redis: redisUp ? ('ok' as const) : ('fail' as const) },
      pods: {
        status: 'ok' as const,
        self: 'web-7d9f-2x',
        windowMinutes: 15,
        items: [
          { pod: 'web-7d9f-2x', activeLeases: 3, runningJobs: 1, lastSeenAt: iso(now - 20_000), self: true },
          { pod: 'web-7d9f-8q', activeLeases: 2, runningJobs: 0, lastSeenAt: iso(now - 45_000), self: false },
          { pod: 'worker-5c1b-9k', activeLeases: 7, runningJobs: 4, lastSeenAt: iso(now - 12_000), self: false },
        ],
      },
      red: {
        status: 'ok' as const,
        windowMinutes: 60,
        from: iso(now - HOUR),
        requests: 1284,
        byStatusClass: { '2xx': 1221, '4xx': 41, '5xx': 22 },
        errors5xx: 22,
        errorRate: 22 / 1284,
        requestsPerMinute: 21.4,
        durationAvgMs: 142,
        durationP95Ms: 500,
        durationP95Overflow: false,
        scope: 'platform' as const,
        note: 'Pod flush aralığı (60 sn) kadar gecikmeli; tüm podlar toplanır.',
      },
      queues: {
        status: 'ok' as const,
        items: [
          redisUp
            ? { name: 'order-sync-queue', available: true, backlog: 5, active: 2, failed: 3, dlqPending: 1 }
            : { name: 'order-sync-queue', available: false, backlog: null, active: null, failed: null, dlqPending: 1 },
        ],
      },
      intake: { status: 'ok' as const, allOpen: false, scope: 'process' as const, restricted: [{ target: 'platform:n11', intake: 'drain' }] },
      issues: { status: 'ok' as const, open: open.length, newLast24h: open.filter((i) => now - Date.parse(i.firstSeen) < DAY).length },
    }
    const out = { ...sections } as unknown as OverviewHealthResponse
    for (const [key, error] of this.degradedSections) (out as unknown as Record<string, unknown>)[key] = { status: 'degraded', error }
    const degradedSections = [...this.degradedSections.keys()]
    return { ...out, generatedAt: iso(now), status: degradedSections.length || !redisUp ? 'degraded' : 'ok', degradedSections }
  }

  // ------------------------------------------------------------ oturum
  private login(email: string, password: string) {
    const known = email === MOCK_ACCOUNTS.enrolled.email || email === MOCK_ACCOUNTS.firstLogin.email
    if (!known || password !== MOCK_ACCOUNTS.password) {
      // Numaralandırma yok: bilinmeyen e-posta ile yanlış parola aynı yanıt.
      throw new MockHttpError(401, 'UNAUTHENTICATED', 'E-posta veya parola hatalı.')
    }
    this.state = { ...this.state, stage: 'pwd', email, authTime: undefined, reauthAt: undefined, failedCodes: 0 }
    this.save()
    const enrolled = this.isEnrolled()
    return { mfaRequired: enrolled, enrollRequired: !enrolled }
  }

  private isEnrolled() {
    return this.state.email === MOCK_ACCOUNTS.enrolled.email || this.state.enrolled.includes(this.state.email ?? '')
  }

  private openFull() {
    const now = this.now()
    this.state = { ...this.state, stage: 'full', authTime: now, reauthAt: now, failedCodes: 0 }
    this.save()
  }

  private requireStage(stage: 'pwd' | 'full') {
    if (this.state.stage === 'none') throw new MockHttpError(401, 'UNAUTHENTICATED', 'Oturum gerekli.')
    if (stage === 'full' && this.state.stage === 'pwd') throw new MockHttpError(403, 'MFA_REQUIRED', 'İki adımlı doğrulama gerekli.')
    if (stage === 'pwd' && this.state.stage === 'full') throw new MockHttpError(409, 'CONFLICT', 'Oturum zaten açık.')
  }

  /** Örnek TOTP: 6 hane, 000000 dışında her kod geçerli. */
  private checkCode(code: string) {
    if (this.state.lockedUntil && this.now() < this.state.lockedUntil) {
      throw new MockHttpError(429, 'RATE_LIMITED', 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.')
    }
    if (!/^\d{6}$/.test(code) || code === '000000') {
      this.state.failedCodes += 1
      if (this.state.failedCodes >= 5) this.state.lockedUntil = this.now() + 15 * 60_000
      this.save()
      throw new MockHttpError(401, 'UNAUTHENTICATED', 'Doğrulama kodu geçersiz.')
    }
  }

  private useRecovery(code: string) {
    const normalized = code.trim().toLowerCase()
    const valid = (MOCK_ACCOUNTS.recoveryCodes as readonly string[]).includes(normalized) && !this.state.usedRecovery.includes(normalized)
    if (!valid) throw new MockHttpError(401, 'UNAUTHENTICATED', 'Kurtarma kodu geçersiz ya da kullanılmış.')
    this.state.usedRecovery = [...this.state.usedRecovery, normalized]
  }

  private me(): BackofficeMe {
    const account = this.state.email === MOCK_ACCOUNTS.firstLogin.email ? MOCK_ACCOUNTS.firstLogin : MOCK_ACCOUNTS.enrolled
    return {
      sub: account.sub,
      email: account.email,
      name: account.name,
      mfa: true,
      authTime: new Date(this.state.authTime ?? this.now()).toISOString(),
      reauthAt: this.state.reauthAt ? new Date(this.state.reauthAt).toISOString() : undefined,
    }
  }

  private load(): SessionState {
    const empty: SessionState = { stage: 'none', enrolled: [], failedCodes: 0, usedRecovery: [] }
    try {
      const raw = this.persist?.getItem(PERSIST_KEY)
      return raw ? { ...empty, ...JSON.parse(raw) } : empty
    } catch {
      return empty
    }
  }

  private save() {
    try {
      this.persist?.setItem(PERSIST_KEY, JSON.stringify(this.state))
    } catch {
      /* yok say */
    }
  }

  // ------------------------------------------------------------ müşteriler
  private getClients(body: Record<string, unknown>) {
    const search = String(body.search ?? '').trim().toLocaleLowerCase('tr')
    const page = Math.max(1, Number(body.page ?? 1))
    const limit = Math.min(1000, Math.max(1, Number(body.limit ?? 50)))
    const sortField = (body.sortField as string) || 'order'
    const sortOrder = Number(body.sortOrder ?? 1)
    let list = this.clients.filter(
      (c) => !search || c.title.toLocaleLowerCase('tr').includes(search) || (c.name ?? '').includes(search) || String(c.order) === search,
    )
    list = [...list].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortField] ?? ''
      const bv = (b as unknown as Record<string, unknown>)[sortField] ?? ''
      return (av > bv ? 1 : av < bv ? -1 : 0) * sortOrder
    })
    return { success: true, clients: list.slice((page - 1) * limit, page * limit), total: list.length, page, limit }
  }

  // ------------------------------------------------------------ loglar
  private inRange(t: string, range: LogRange) {
    return this.t0 - Date.parse(t) <= RANGE_MS[range]
  }

  private matches(e: LogEvent, f: ListLogsRequest, skip?: 'level' | 'src' | 'category') {
    if (!this.inRange(e.t, f.range ?? '24h')) return false
    if (skip !== 'level' && f.level?.length && !f.level.includes(e.level)) return false
    if (skip !== 'src' && f.src?.length && !f.src.includes(e.src)) return false
    if (skip !== 'category' && f.category?.length && !f.category.includes(e.category)) return false
    if (f.integ && e.integ !== f.integ) return false
    if (f.tid && e.tid !== Number(f.tid)) return false
    if (f.reqId && e.reqId !== f.reqId) return false
    if (f.text && !e.msg.toLocaleLowerCase('tr').startsWith(f.text.toLocaleLowerCase('tr'))) return false
    return true
  }

  private listLogs(f: ListLogsRequest) {
    const limit = Math.min(200, Math.max(1, Number(f.limit ?? 50)))
    const offset = Number(f.cursor ?? 0)
    const all = this.logs.events.filter((e) => this.matches(e, f))
    const count = <K extends 'level' | 'src' | 'category'>(key: K) => {
      const out: Record<string, number> = {}
      for (const e of this.logs.events) if (this.matches(e, f, key)) out[e[key]] = (out[e[key]] ?? 0) + 1
      return out
    }
    const next = offset + limit < all.length ? String(offset + limit) : undefined
    return {
      items: all.slice(offset, offset + limit),
      nextCursor: next,
      facets: {
        level: count('level') as Partial<Record<LogLevel, number>>,
        src: count('src') as Partial<Record<LogSource, number>>,
        category: count('category') as Partial<Record<LogCategory, number>>,
      },
    }
  }

  private getIssueGroups(req: GetIssueGroupsRequest) {
    const range = req.range ?? '24h'
    const items: IssueGroup[] = this.logs.issues
      .map((issue) => {
        const inRange = this.logs.events.filter((e) => e.fp === issue.fp && this.inRange(e.t, range))
        return { ...issue, count: inRange.length, isNew: this.t0 - Date.parse(issue.firstSeen) <= RANGE_MS[range], lastSeen: inRange[0]?.t ?? issue.lastSeen }
      })
      .filter((i) => i.count > 0 || i.status === 'open')
      .filter((i) => !req.status?.length || req.status.includes(i.status))
      .filter((i) => !req.category?.length || req.category.includes(i.category))
      .filter((i) => !req.src?.length || req.src.includes(i.src))
    const sort = req.sort ?? 'lastSeen'
    items.sort((a, b) => {
      if (sort === 'count') return b.count - a.count
      if (sort === 'tenantCount') return b.tenantCount - a.tenantCount
      if (sort === 'new') return Number(b.isNew) - Number(a.isNew) || Date.parse(b.firstSeen) - Date.parse(a.firstSeen)
      return Date.parse(b.lastSeen) - Date.parse(a.lastSeen)
    })
    return { items }
  }

  private getIssueTrend(fp: string, range: LogRange) {
    const issue = this.logs.issues.find((i) => i.fp === fp)
    if (!issue) throw new MockHttpError(404, 'NOT_FOUND', 'Kayıt bulunamadı.')
    const bucket = range === '7d' ? 'day' : 'hour'
    const step = bucket === 'day' ? DAY : range === '1h' ? 5 * 60_000 : HOUR
    const n = Math.round(RANGE_MS[range] / step)
    const points = Array.from({ length: n }, (_, i) => ({ t: new Date(this.t0 - (n - i) * step).toISOString(), count: 0 }))
    const own = this.logs.events.filter((e) => e.fp === fp && this.inRange(e.t, range))
    for (const e of own) {
      const idx = n - 1 - Math.floor((this.t0 - Date.parse(e.t)) / step)
      if (points[idx]) points[idx].count++
    }
    const sample = own[0] ?? this.logs.events.find((e) => e.fp === fp)
    return {
      bucket,
      points,
      sample: { msg: sample?.msg ?? issue.title, t: sample?.t ?? issue.lastSeen, op: issue.op, tid: sample?.tid },
      reqIds: own.slice(0, 5).map((e) => e.reqId!).filter(Boolean),
      tenants: ISSUE_TENANTS[fp] ?? [],
    }
  }

  private getVolume(range: LogRange) {
    const bucket = range === '7d' ? 'day' : 'hour'
    const step = bucket === 'day' ? DAY : range === '1h' ? 5 * 60_000 : HOUR
    const n = Math.round(RANGE_MS[range] / step)
    return {
      bucket,
      categories: CATEGORIES.map((category) => {
        const series = Array.from({ length: n }, () => 0)
        let warn = 0
        let error = 0
        for (const e of this.logs.events) {
          if (e.category !== category || e.level === 'info' || !this.inRange(e.t, range)) continue
          const idx = n - 1 - Math.floor((this.t0 - Date.parse(e.t)) / step)
          if (idx >= 0) series[idx]++
          if (e.level === 'warn') warn++
          else error++
        }
        const hours = Math.ceil(RANGE_MS[range] / HOUR)
        const info = this.logs.infoCounts[category].slice(-hours).reduce((s, v) => s + v, 0) * (range === '1h' ? 1 : 1)
        return { category, total: info + warn + error, warn, error, series }
      }),
    }
  }

  private getTrace(reqId: string) {
    const hit = this.logs.events.find((e) => e.reqId === reqId)
    const auditHit = this.audit.find((a) => a.reqId === reqId)
    if (!hit && !auditHit) throw new MockHttpError(404, 'NOT_FOUND', 'Bu istek kimliğiyle kayıt bulunamadı (14 günlük saklama).')
    const end = Date.parse(hit?.t ?? auditHit!.at)
    const r = rng(reqId.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0))
    const events: TraceEvent[] = []
    const at = (msBefore: number) => new Date(end - msBefore).toISOString()
    if (hit) {
      const total = 380 + Math.floor(r() * 2400)
      events.push({ t: at(total), kind: 'log', level: 'info', src: hit.src === 'webhook' ? 'webhook' : 'api', title: `İstek başladı: ${hit.op ?? 'bilinmiyor'}` })
      if (hit.integ) {
        const d1 = Math.floor(total * 0.35)
        events.push({ t: at(total - 40), kind: 'call', integ: hit.integ, title: `${hit.integ} API çağrısı`, durationMs: d1, status: '200' })
        events.push({ t: at(total - 60 - d1), kind: 'call', integ: hit.integ, title: `${hit.integ} API çağrısı (yeniden deneme)`, durationMs: Math.floor(total * 0.4), status: hit.errClass === 'RATE_LIMITED' ? '429' : hit.errClass === 'AUTH' ? '401' : hit.errClass === 'UNAVAILABLE' ? '503' : '200' })
      }
      events.push({ t: hit.t, kind: 'log', level: hit.level, src: hit.src, title: hit.msg })
      if (hit.tid && r() > 0.5) events.push({ t: at(-12), kind: 'audit', title: `app.write · ${hit.op ?? ''}`, status: 'fail' })
      return { reqId, tid: hit.tid, startedAt: at(total), durationMs: total, events }
    }
    const a = auditHit!
    events.push({ t: at(220), kind: 'log', level: 'info', src: 'api', title: `İstek başladı: ${String(a.meta?.op ?? a.event)}` })
    events.push({ t: a.at, kind: 'audit', title: `${a.event} · ${String(a.meta?.op ?? '')}`, status: a.result })
    return { reqId, tid: a.tid ?? a.onBehalfOf, startedAt: at(220), durationMs: 220, events }
  }

  // ------------------------------------------------------------ denetim
  private searchAudit(req: SearchAuditRequest) {
    const limit = Math.min(200, Math.max(1, Number(req.limit ?? 50)))
    const offset = Number(req.cursor ?? 0)
    const range = RANGE_MS[req.range ?? '7d']
    const all = this.audit.filter(
      (a) =>
        this.t0 - Date.parse(a.at) <= range &&
        (!req.event || a.event === req.event || a.event.startsWith(`${req.event}.`)) &&
        (!req.result || a.result === req.result) &&
        (!req.surface || a.surface === req.surface) &&
        (!req.tid || a.tid === Number(req.tid) || a.onBehalfOf === Number(req.tid)) &&
        (!req.reqId || a.reqId === req.reqId),
    )
    return { items: all.slice(offset, offset + limit), nextCursor: offset + limit < all.length ? String(offset + limit) : undefined }
  }
}

export { MockHttpError } from './errors'
