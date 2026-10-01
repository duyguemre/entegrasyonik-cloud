/**
 * Sahte /admin-api verisi — YALNIZ örnek. Gerçek müşteri adı/kişisel veri YOK:
 * mağaza adları uydurmadır ve "Örnek ·" önekiyle açıkça işaretlidir; e-postalar `.test` (RFC 2606),
 * IP'ler belge aralığındandır (203.0.113.0/24, RFC 5737). Üretim deterministik (tohumlu), "şimdi"ye göredir.
 */
import type {
  AuditRecord,
  ClientDto,
  IssueGroup,
  IssueStatus,
  LogCategory,
  LogEvent,
  LogLevel,
  LogSource,
} from '../contract'

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

/** Tohumlu PRNG (mulberry32) — her açılışta aynı sahne. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const MOCK_ACCOUNTS = {
  enrolled: { email: 'yonetici@ornek.test', name: 'Örnek Yönetici', sub: 'adm_5f0c2a91' },
  firstLogin: { email: 'yeni.yonetici@ornek.test', name: 'Yeni Örnek Yönetici', sub: 'adm_9b41d7e3' },
  password: 'ornek-parola',
  /** Kayıtlı hesabın kurtarma kodları (örnek). */
  recoveryCodes: ['k7m2-q9xd', 'p4tz-8wna', 'c3vr-h6jb', 'x2lf-m5ke', 'd9sq-t4gu', 'w8np-r3yc', 'b6hz-j2mv', 'f5ku-e7qa', 'n3dw-y9ps', 'g4tb-a8xr'],
} as const

const STORE_NAMES = [
  'Lale Ev Tekstili',
  'Poyraz Outdoor',
  'Kestane Kitabevi',
  'Mercan Kozmetik',
  'Defne Bebe',
  'Atlas Hırdavat',
  'Nar Mutfak',
  'Pusula Kırtasiye',
  'Kum Saati Aksesuar',
  'Fener Elektronik',
  'Zeytin Dalı Gıda',
  'Martı Spor',
]
const CHANNEL_SETS: string[][] = [
  ['trendyol', 'hepsiburada'],
  ['trendyol', 'n11', 'ideasoft'],
  ['hepsiburada'],
  ['trendyol', 'hepsiburada', 'pazarama'],
  ['n11'],
  ['trendyol', 'bizimhesap'],
  ['trendyol', 'hepsiburada', 'n11', 'pazarama'],
  [],
  ['ideasoft', 'trendyol'],
  ['hepsiburada', 'bizimhesap'],
  ['pazarama'],
  ['trendyol'],
]
/** Müşteri listesi `status` alanı için (askıda/silme bekliyor → PASSIVE); abonelik/yaşam döngüsü ops/billing.ts'te. */
const LIFECYCLE: string[] = [
  'active', 'active', 'trialing', 'active', 'past_due', 'active', 'active', 'trialing', 'suspended', 'active', 'pending_deletion', 'active',
]

export function buildClients(now: number): ClientDto[] {
  const r = rng(7)
  return STORE_NAMES.map((name, i) => {
    const tid = 101 + i
    const created = now - (40 + Math.floor(r() * 500)) * DAY
    const lifecycle = LIFECYCLE[i]
    const passive = lifecycle === 'suspended' || lifecycle === 'pending_deletion'
    return {
      _id: `ornek${String(tid).padStart(20, '0')}`,
      name: `ornek-${tid}`,
      title: `Örnek · ${name}`,
      order: tid,
      clientId: tid,
      status: passive ? 'PASSIVE' : 'ACTIVE',
      lastSuccessfulOrderSync: CHANNEL_SETS[i].length && !passive ? new Date(now - Math.floor(r() * 50 + 2) * 60_000).toISOString() : undefined,
      integrations: CHANNEL_SETS[i].map((code) => ({ integrationCode: code, type: code === 'bizimhesap' ? 'ERP' : code === 'ideasoft' ? 'ECOMMERCE' : 'MARKETPLACE', status: true })),
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(now - Math.floor(r() * 20) * DAY).toISOString(),
    }
  })
}

// ---------------------------------------------------------------- Log kontrol merkezi
interface IssueSeed {
  fp: string
  title: string
  level: LogLevel
  src: LogSource
  category: LogCategory
  errClass?: string
  integ?: string
  op?: string
  status: IssueStatus
  /** Saatlik ortalama olay (Poisson benzeri). */
  rate: number
  /** Kaç saat önce başladı (yeni sorunlar için küçük). */
  since: number
  tenants: number[]
  /** Son saatlerde sıçrama. */
  spike?: boolean
}

const ISSUE_SEEDS: IssueSeed[] = [
  { fp: 'adapter::trendyol::RATE_LIMITED::a1f3', title: 'Trendyol ürün güncelleme hız sınırı aşıldı (429), # sn sonra yeniden denenecek', level: 'warn', src: 'adapter', category: 'integration', errClass: 'RATE_LIMITED', integ: 'trendyol', op: 'ExportOrchestrator/publish', status: 'open', rate: 1.6, since: 150, tenants: [101, 102, 104, 107, 112], spike: true },
  { fp: 'adapter::hepsiburada::AUTH::b7c2', title: 'Hepsiburada kimlik bilgisi reddedildi (401) — mağaza anahtarı yenilenmeli', level: 'error', src: 'adapter', category: 'integration', errClass: 'AUTH', integ: 'hepsiburada', op: 'ImportOrchestrator/pullOrders', status: 'open', rate: 0.5, since: 30, tenants: [110] },
  { fp: 'worker::order::UNKNOWN_OUTCOME::c9d4', title: 'Sipariş durumu gönderimi zaman aşımı — sonuç doğrulanamadı (sipariş #)', level: 'error', src: 'worker', category: 'order', errClass: 'UNKNOWN_OUTCOME', integ: 'n11', op: 'OrderOrchestrator/pushStatus', status: 'acknowledged', rate: 0.35, since: 120, tenants: [102, 105, 107] },
  { fp: 'engine::catalog::VALIDATION::d2e8', title: 'Kategori eşlemesi eksik: # ürün yayın kuyruğunda bekletildi', level: 'warn', src: 'engine', category: 'catalog', errClass: 'VALIDATION', integ: 'pazarama', op: 'Validator/validate', status: 'open', rate: 0.9, since: 160, tenants: [104, 107, 111] },
  { fp: 'webhook::trendyol::VALIDATION::e5a1', title: 'Webhook imzası doğrulanamadı — istek reddedildi', level: 'warn', src: 'webhook', category: 'order', errClass: 'VALIDATION', integ: 'trendyol', op: 'hooks/trendyol', status: 'open', rate: 0.25, since: 9, tenants: [112] },
  { fp: 'auth::login::RATE_LIMITED::f0b6', title: 'Giriş hız sınırı: aynı IP\'den # başarısız deneme', level: 'warn', src: 'auth', category: 'auth', errClass: 'RATE_LIMITED', op: 'SecurityService/login', status: 'open', rate: 0.6, since: 160, tenants: [] },
  { fp: 'api::billing::INTERNAL::a8c3', title: 'Abonelik yenileme olayı işlenemedi (sağlayıcı yanıtı eksik alan)', level: 'error', src: 'api', category: 'billing', errClass: 'INTERNAL', op: 'BillingService/handleEvent', status: 'open', rate: 0.12, since: 5, tenants: [105] },
  { fp: 'scheduler::platform::UNAVAILABLE::b3d9', title: 'Zamanlanmış stok eşitleme atlandı: kilit # sn içinde alınamadı', level: 'warn', src: 'scheduler', category: 'platform', errClass: 'UNAVAILABLE', op: 'JobRunRegistry/stockSync', status: 'muted', rate: 0.4, since: 168, tenants: [] },
  { fp: 'adapter::n11::UNAVAILABLE::c6e2', title: 'N11 servis yanıt vermiyor — devre kesici açıldı (# dk)', level: 'error', src: 'adapter', category: 'integration', errClass: 'UNAVAILABLE', integ: 'n11', op: 'ImportOrchestrator/pullProducts', status: 'resolved', rate: 0.3, since: 140, tenants: [102, 105, 107] },
  { fp: 'legacy-console::catalog::UNKNOWN::d7f4', title: 'console.warn: ürün görseli boyutu okunamadı', level: 'warn', src: 'legacy-console', category: 'catalog', integ: 'ideasoft', op: 'Stager/stage', status: 'open', rate: 0.7, since: 168, tenants: [102, 109] },
  { fp: 'api::platform::FATAL::e1b0', title: 'Redis bağlantısı koptu, yeniden bağlanılıyor (deneme #)', level: 'fatal', src: 'api', category: 'platform', errClass: 'UNAVAILABLE', op: 'RedisService/connect', status: 'resolved', rate: 0.05, since: 100, tenants: [] },
  { fp: 'adapter::bizimhesap::NOT_FOUND::f8a5', title: 'Bizimhesap cari kaydı bulunamadı (fatura eşleşmesi atlandı)', level: 'warn', src: 'adapter', category: 'integration', errClass: 'NOT_FOUND', integ: 'bizimhesap', op: 'InvoiceSync/match', status: 'acknowledged', rate: 0.2, since: 90, tenants: [106, 110] },
]

const INFO_SEEDS: Array<{ title: string; src: LogSource; category: LogCategory; op: string; rate: number }> = [
  { title: 'Yönetici girişi başarılı (TOTP)', src: 'auth', category: 'auth', op: 'BackofficeAuthService/verifyTotp', rate: 0.15 },
  { title: 'Trendyol sipariş webhook\'u alındı (# sipariş)', src: 'webhook', category: 'order', op: 'hooks/trendyol', rate: 1.2 },
  { title: 'backoffice.write: AdminService/updateClient', src: 'api', category: 'platform', op: 'AdminService/updateClient', rate: 0.05 },
]

const PODS = ['web-7d9f-2x', 'web-7d9f-8q', 'worker-5c1b-9k']

function reqIdOf(r: () => number) {
  return `req_${Math.floor(r() * 0xffffffff).toString(16).padStart(8, '0')}${Math.floor(r() * 0xffff).toString(16).padStart(4, '0')}`
}

/** Saatlik oran eğrisi: gündüz yoğun, gece sakin; sıçramalı sorunlarda son 3 saat ×4. */
function hourlyRate(seed: IssueSeed | { rate: number; spike?: boolean }, hoursAgo: number, now: number) {
  const hour = new Date(now - hoursAgo * HOUR).getHours()
  const diurnal = hour >= 9 && hour <= 22 ? 1.35 : 0.45
  return seed.rate * diurnal * (seed.spike && hoursAgo < 3 ? 4 : 1)
}

export interface MockLogStore {
  events: LogEvent[]
  issues: IssueGroup[]
  infoCounts: Record<LogCategory, number[]>
}

/** 7 günlük (168 saat) olay akışı; sorun grupları ve hacim aynı olaylardan türetilir (tutarlı ekranlar). */
export function buildLogStore(now: number): MockLogStore {
  const r = rng(42)
  const events: LogEvent[] = []
  const categories: LogCategory[] = ['integration', 'order', 'catalog', 'auth', 'billing', 'platform']
  const infoCounts = Object.fromEntries(categories.map((c) => [c, Array.from({ length: 168 }, () => 0)])) as Record<LogCategory, number[]>

  for (let h = 167; h >= 0; h--) {
    for (const seed of ISSUE_SEEDS) {
      if (h >= seed.since) continue
      if (seed.status === 'resolved' && h < 20) continue
      const lambda = hourlyRate(seed, h, now)
      let n = Math.floor(lambda)
      if (r() < lambda - n) n++
      for (let k = 0; k < n; k++) {
        const t = now - h * HOUR - Math.floor(r() * HOUR)
        const tid = seed.tenants.length ? seed.tenants[Math.floor(r() * seed.tenants.length)] : undefined
        events.push({
          id: `evt_${events.length.toString(36)}`,
          t: new Date(t).toISOString(),
          level: seed.level,
          src: seed.src,
          category: seed.category,
          msg: seed.title.replace('#', String(2 + Math.floor(r() * 40))),
          fp: seed.fp,
          reqId: reqIdOf(r),
          tid,
          integ: seed.integ,
          op: seed.op,
          errClass: seed.errClass,
          pod: seed.src === 'worker' || seed.src === 'engine' || seed.src === 'scheduler' ? PODS[2] : PODS[Math.floor(r() * 2)],
        })
      }
    }
    for (const seed of INFO_SEEDS) {
      const lambda = hourlyRate(seed, h, now)
      let n = Math.floor(lambda)
      if (r() < lambda - n) n++
      for (let k = 0; k < n; k++) {
        events.push({
          id: `evt_${events.length.toString(36)}`,
          t: new Date(now - h * HOUR - Math.floor(r() * HOUR)).toISOString(),
          level: 'info',
          src: seed.src,
          category: seed.category,
          msg: seed.title.replace('#', String(1 + Math.floor(r() * 12))),
          reqId: reqIdOf(r),
          op: seed.op,
          pod: PODS[Math.floor(r() * 2)],
        })
      }
    }
    // Kalıcılaştırılmayan info hacmi (ADR-0026 Karar 7.4: sayaç tüm logları sayar).
    for (const c of categories) infoCounts[c][167 - h] = Math.floor((c === 'order' ? 380 : c === 'integration' ? 520 : c === 'catalog' ? 260 : 60) * (0.5 + r()) * (new Date(now - h * HOUR).getHours() >= 9 ? 1.4 : 0.4))
  }
  // Seyrek sorunlar (düşük oran) aralıkta en az bir kez görünsün: "yeni" grup 0 olayla listelenmesin.
  for (const seed of ISSUE_SEEDS) {
    if (events.some((e) => e.fp === seed.fp)) continue
    const tid = seed.tenants[0]
    events.push({ id: `evt_${events.length.toString(36)}`, t: new Date(now - (seed.since - 1) * HOUR).toISOString(), level: seed.level, src: seed.src, category: seed.category, msg: seed.title.replace('#', '1'), fp: seed.fp, reqId: reqIdOf(r), tid, integ: seed.integ, op: seed.op, errClass: seed.errClass, pod: PODS[0] })
  }
  events.sort((a, b) => (a.t < b.t ? 1 : -1))

  const issues: IssueGroup[] = ISSUE_SEEDS.map((seed) => {
    const own = events.filter((e) => e.fp === seed.fp)
    const daily: Record<string, number> = {}
    for (let d = 13; d >= 0; d--) daily[dayKey(now - d * DAY)] = 0
    for (const e of own) {
      const key = dayKey(Date.parse(e.t))
      if (key in daily) daily[key]++
    }
    const firstSeen = new Date(now - seed.since * HOUR).toISOString()
    return {
      fp: seed.fp,
      title: seed.title,
      level: seed.level,
      src: seed.src,
      category: seed.category,
      errClass: seed.errClass,
      integ: seed.integ,
      op: seed.op,
      status: seed.status,
      count: own.length,
      tenantCount: seed.tenants.length,
      firstSeen,
      lastSeen: own[0]?.t ?? firstSeen,
      isNew: seed.since <= 24,
      daily,
      sampleReqId: own[0]?.reqId,
    }
  })
  return { events, issues, infoCounts }
}

export function dayKey(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

export const ISSUE_TENANTS: Record<string, number[]> = Object.fromEntries(ISSUE_SEEDS.map((s) => [s.fp, s.tenants]))

// ---------------------------------------------------------------- Denetim
export function buildAudit(now: number): AuditRecord[] {
  const r = rng(99)
  const admins = [MOCK_ACCOUNTS.enrolled.sub, 'adm_2c7e0b44']
  const tenantUsers = ['usr_1a9f03', 'usr_7c2e81', 'usr_4b6d19', 'usr_9e0a52']
  const ip = () => `203.0.113.${10 + Math.floor(r() * 200)}`
  const out: AuditRecord[] = []
  const push = (minutesAgo: number, rec: Omit<AuditRecord, 'id' | 'at'>) =>
    out.push({ id: `aud_${out.length.toString(36).padStart(3, '0')}`, at: new Date(now - minutesAgo * 60_000).toISOString(), reqId: reqIdOf(r), ...rec })

  push(4, { event: 'backoffice.write', sub: admins[0], onBehalfOf: 105, ip: ip(), result: 'ok', surface: 'backoffice', actorType: 'platform', meta: { op: 'AdminService/updateClient', reason: 'Ödeme alındı, hesap yeniden açıldı', b_status: 'PASSIVE', a_status: 'ACTIVE' } })
  push(11, { event: 'impersonation.start', sub: admins[0], tid: 102, ip: ip(), result: 'ok', surface: 'backoffice', actorType: 'platform', meta: { op: 'BackofficeTenantService/startImpersonation', reason: 'Destek talebi: Trendyol eşleme ekranı hatası' } })
  push(12, { event: 'backoffice.reauth', sub: admins[0], ip: ip(), result: 'ok', surface: 'backoffice', actorType: 'platform', meta: { op: 'BackofficeAuthService/reauth' } })
  push(26, { event: 'app.write', sub: tenantUsers[0], tid: 101, ip: ip(), result: 'ok', surface: 'app', actorType: 'user', meta: { op: 'IntegrationService/saveSettings', b_priceMultiplier: 1.1, a_priceMultiplier: 1.15, b_stockBuffer: 2, a_stockBuffer: 5 } })
  push(34, { event: 'backoffice.sensitive_read', sub: admins[1], onBehalfOf: 110, ip: ip(), result: 'ok', surface: 'backoffice', actorType: 'platform', meta: { op: 'BackofficeTenantService/getLifecycle' } })
  push(48, { event: 'login', ip: ip(), result: 'fail', surface: 'backoffice', meta: { op: 'BackofficeAuthService/login', reason: 'invalid_credentials' } })
  push(49, { event: 'login', ip: ip(), result: 'fail', surface: 'backoffice', meta: { op: 'BackofficeAuthService/login', reason: 'invalid_credentials' } })
  push(63, { event: 'app.write', sub: tenantUsers[1], tid: 104, ip: ip(), result: 'ok', surface: 'app', actorType: 'user', meta: { op: 'ProductService/bulkUpdatePrice', a_count: 128, reason: 'Kampanya fiyatları' } })
  push(75, { event: 'app.write', sub: admins[0], tid: 102, imp: true, ip: ip(), result: 'ok', surface: 'app', actorType: 'platform', meta: { op: 'CategoryMappingService/save', b_mappedCount: 412, a_mappedCount: 436 } })
  push(95, { event: 'backoffice.write', sub: admins[1], ip: ip(), result: 'fail', surface: 'backoffice', actorType: 'platform', meta: { op: 'IntegrationConfigService/publish', reason: 'Trendyol toplu gönderim boyutu düşürüldü', b_batchSize: 100, a_batchSize: 50 } })
  push(130, { event: 'user.password_change', sub: tenantUsers[2], tid: 107, ip: ip(), result: 'ok', surface: 'app', actorType: 'user', meta: { op: 'AccountService/changePassword' } })
  push(180, { event: 'backoffice.write', sub: admins[0], ip: ip(), result: 'ok', surface: 'backoffice', actorType: 'platform', meta: { op: 'IntegrationConfigService/setIntake', reason: 'N11 kesintisi — alım geçici durduruldu', b_intake: 'on', a_intake: 'drain' } })
  push(230, { event: 'app.write', sub: tenantUsers[3], tid: 112, ip: ip(), result: 'error', surface: 'app', actorType: 'user', meta: { op: 'IntegrationService/connect', a_integrationCode: 'trendyol' } })
  push(320, { event: 'impersonation.end', sub: admins[1], tid: 109, ip: ip(), result: 'ok', surface: 'app', actorType: 'platform', meta: { op: 'SecurityService/endImpersonation' } })
  push(335, { event: 'impersonation.redeem', sub: admins[1], tid: 109, ip: ip(), result: 'ok', surface: 'app', actorType: 'platform', meta: { op: 'SecurityService/redeemImpersonation' } })
  push(336, { event: 'impersonation.start', sub: admins[1], tid: 109, ip: ip(), result: 'ok', surface: 'backoffice', actorType: 'platform', meta: { op: 'BackofficeTenantService/startImpersonation', reason: 'Askıya alınan hesabın veri dışa aktarımı kontrolü' } })
  push(600, { event: 'backoffice.write', sub: admins[0], onBehalfOf: 111, ip: ip(), result: 'ok', surface: 'backoffice', actorType: 'platform', meta: { op: 'TenantDataService/scheduleDeletion', reason: 'Müşteri talebi (destek kaydı #örnek)', b_status: 'active', a_status: 'pending_deletion' } })
  push(900, { event: 'app.write', sub: tenantUsers[0], tid: 101, ip: ip(), result: 'ok', surface: 'app', actorType: 'user', meta: { op: 'UserService/inviteUser', a_role: 'editor' } })
  push(1300, { event: 'backoffice.write', sub: admins[1], ip: ip(), result: 'ok', surface: 'backoffice', actorType: 'platform', meta: { op: 'BackofficeAuthService/logoutAllSessions', reason: 'Yönetici cihaz değişikliği' } })
  push(2900, { event: 'app.write', sub: tenantUsers[1], tid: 104, ip: ip(), result: 'ok', surface: 'app', actorType: 'user', meta: { op: 'IntegrationService/saveSettings', b_autoAcceptOrders: false, a_autoAcceptOrders: true } })
  push(5200, { event: 'backoffice.write', sub: admins[0], ip: ip(), result: 'ok', surface: 'backoffice', actorType: 'platform', meta: { op: 'IntegrationConfigService/rollback', reason: 'Yeni sürümde hız sınırı hatası arttı', b_version: 14, a_version: 13 } })
  return out
}
