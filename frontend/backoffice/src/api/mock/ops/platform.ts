/**
 * Sahte `_platform` yapılandırması (ADR-0031 + B11: getEffectiveConfig/saveDraft/discardDraft/previewPublish/publish/rollback/history),
 * `GET /api/public-config`, BackofficeAdminUserService (B12) ve BackofficeAuthService/acceptInvite.
 * Katalog backend `integration/config/catalog/platform.ts` (9 anahtar) + `features.ts` (başlangıçta BOŞ) ile aynı.
 */
import type { CatalogItem, ConfigDiffEntry, ConfigRevision, PlatformAdmin } from '../../contract'
import { MockHttpError } from '../errors'
import { DAY, HOUR, MIN, UNHANDLED, conflict, hex24, iso, notFound, strict, validation, type MockCtx, type MockDomain } from './context'

const T = (tr: string, en: string) => ({ tr, en })
const base = {
  scope: 'platform' as const, danger: 'safe' as const, applies: 'immediate' as const, overridable: true, exposure: 'public' as const,
  since: '2026-09-30', advanced: false, envLock: null, tenantOverridable: null, deprecated: null, impact: null, unit: null, safeRange: null,
}
export const PLATFORM_CATALOG: CatalogItem[] = [
  { ...base, key: 'support.email', group: 'platform.support', type: 'text', default: 'bilgi@entegrasyonik.com.tr', label: T('Destek e-postası', 'Support email'), help: T('Uygulamada yardım menüsünde ve giriş ekranında gösterilen destek e-posta adresi.', 'Support email shown in the help menu and on the sign-in screen.') },
  { ...base, key: 'support.phone', group: 'platform.support', type: 'text', default: '', label: T('Destek telefonu', 'Support phone'), help: T('Boşsa gösterilmez. Örn. +90 850 000 00 00.', 'Hidden when empty. E.g. +90 850 000 00 00.') },
  { ...base, key: 'announcement.enabled', group: 'platform.announcement', type: 'bool', default: false, label: T('Duyuru şeridi açık', 'Announcement banner enabled'), help: T('Açıkken uygulama kabuğunda duyuru metni gösterilir.', 'When on, the announcement text is shown in the app shell.') },
  { ...base, key: 'announcement.level', group: 'platform.announcement', type: 'enum', default: 'info', label: T('Duyuru seviyesi', 'Announcement level'), help: T('info: bilgi, warning: uyarı rengi.', 'info: neutral, warning: warning colour.') },
  { ...base, key: 'announcement.text', group: 'platform.announcement', type: 'text', default: '', label: T('Duyuru metni', 'Announcement text'), help: T('Düz metin, en çok 280 karakter (HTML ve satır sonu kabul edilmez).', 'Plain text, up to 280 characters (no HTML or line breaks).') },
  { ...base, key: 'maintenance.enabled', group: 'platform.maintenance', type: 'bool', default: false, danger: 'caution', label: T('Bakım modu', 'Maintenance mode'),
    help: T('Açıkken uygulamada bakım şeridi gösterilir ve tenant yazma istekleri 503 MAINTENANCE döner (okuma, giriş/çıkış ve yönetim uygulaması serbest).', 'When on, a maintenance banner is shown and tenant write requests return 503 MAINTENANCE (reads, sign-in/out and the admin app stay available).'),
    impact: T('Tüm kullanıcılar bakım iletisini görür ve veri yazamaz; yayın gerekçe ve yeniden doğrulama ister.', 'All users see the maintenance message and cannot write data; publishing requires a reason and re-authentication.') },
  { ...base, key: 'maintenance.message', group: 'platform.maintenance', type: 'text', default: '', label: T('Bakım iletisi', 'Maintenance message'), help: T('Düz metin, en çok 280 karakter.', 'Plain text, up to 280 characters.') },
  { ...base, key: 'ui.listPageSize', group: 'platform.ui', type: 'enum', default: 25, label: T('Liste sayfa boyutu', 'List page size'), help: T('Liste ekranlarında varsayılan sayfa başına satır sayısı (10/25/50/100).', 'Default rows per page in list screens (10/25/50/100).') },
  { ...base, key: 'ui.reportPollMs', group: 'platform.ui', type: 'int', default: 5000, unit: 'ms', safeRange: { min: 3000, max: 60000 }, label: T('Rapor yoklama süresi', 'Report poll interval'), help: T('Devam eden rapor ekranlarının yenileme aralığı (3000-60000 ms).', 'Refresh interval of in-progress report screens (3000-60000 ms).') },
]
/** Örnek bayraklar — yalnız `__boMock.setFeatureFlags(true)` ile (backend FEATURE_FLAGS başlangıçta boş). */
const SAMPLE_FLAGS: CatalogItem[] = [
  { ...base, exposure: 'public', key: 'features.newOrderList', group: 'platform.features', type: 'bool', default: false, label: T('Yeni sipariş listesi', 'New order list'), help: T('Sipariş ekranının yeni sürümü (müşteri uygulamasında görünür).', 'New order screen (visible in the client app).') },
  { ...base, exposure: null, key: 'features.aiListing', group: 'platform.features', type: 'bool', default: false, label: T('Yapay zekâ ile ilan', 'AI listing'), help: T('Ürün açıklaması önerisi; yalnız listedeki müşterilerde.', 'Product description suggestions; listed tenants only.') },
  { ...base, exposure: null, key: 'features.aiListing.tenants', group: 'platform.features', type: 'stringList', default: [], label: T('Yapay zekâ ile ilan — tenant listesi', 'AI listing — tenant list'), help: T('Boşsa bayrak herkes için geçerlidir; doluysa yalnız listedeki tenant numaraları için.', 'Empty: applies to everyone; otherwise only to the listed tenant numbers.') },
]
let flagsOn = false
export function setMockFeatureFlags(on: boolean) {
  flagsOn = on
}
export function platformCatalog(): CatalogItem[] {
  return flagsOn ? [...PLATFORM_CATALOG, ...SAMPLE_FLAGS] : PLATFORM_CATALOG
}

const PLAIN = /^[^<>\u0000-\u001f\u007f]*$/
function validate(key: string, v: unknown): string | null {
  const def = platformCatalog().find((c) => c.key === key)
  if (!def) return `Bilinmeyen ayar anahtarı: ${key}`
  switch (key) {
    case 'support.email':
      return typeof v === 'string' && v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Geçerli bir e-posta adresi girin.'
    case 'support.phone':
      return v === '' || (typeof v === 'string' && /^\+?[0-9 ()-]{7,20}$/.test(v)) ? null : 'Geçerli bir telefon numarası girin'
    case 'announcement.level':
      return v === 'info' || v === 'warning' ? null : 'info | warning'
    case 'announcement.text':
    case 'maintenance.message':
      return typeof v === 'string' && v.length <= 280 && PLAIN.test(v) ? null : 'HTML/kontrol karakteri içeremez (en çok 280 karakter)'
    case 'ui.listPageSize':
      return [10, 25, 50, 100].includes(v as number) ? null : '10, 25, 50 ya da 100 olmalı'
    case 'ui.reportPollMs':
      return Number.isInteger(v) && (v as number) >= 3000 && (v as number) <= 60000 ? null : '3000-60000 arası tam sayı'
  }
  if (def.type === 'bool') return typeof v === 'boolean' ? null : 'true/false olmalı'
  if (def.type === 'stringList') return Array.isArray(v) && v.length <= 500 && v.every((x) => typeof x === 'string' && /^\d{1,12}$/.test(x)) ? null : 'Tenant numaraları listesi'
  return null
}

interface Revision { version: number; overrides: Record<string, unknown>; createdAt: number; publishedAt: number; publishedBy: string; reason: string; diff: ConfigDiffEntry[]; origin: string }

function diffOf(from: Record<string, unknown>, to: Record<string, unknown>): ConfigDiffEntry[] {
  const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort()
  return keys
    .filter((k) => JSON.stringify(from[k]) !== JSON.stringify(to[k]))
    .map((k) => ({ key: k, ...(k in from ? { from: from[k] } : {}), ...(k in to ? { to: to[k] } : {}), danger: platformCatalog().find((c) => c.key === k)?.danger ?? 'dangerous' }))
}

export const MOCK_INVITE_TOKEN = 'ornekDavetBileti0000000000000000000000000000'
const PASSWORD_POLICY = /^(?=.*[A-Za-zÇĞİÖŞÜçğıöşü])(?=.*\d).{12,128}$/

export function createPlatformMock(t0: number, selfEmail: string): MockDomain {
  const admin1 = hex24(5001)
  const revisions: Revision[] = []
  const add = (overrides: Record<string, unknown>, daysAgo: number, reason: string, origin = 'manual') => {
    const prev = revisions[revisions.length - 1]?.overrides ?? {}
    revisions.push({ version: revisions.length + 1, overrides, createdAt: t0 - daysAgo * DAY - 20 * MIN, publishedAt: t0 - daysAgo * DAY, publishedBy: admin1, reason, diff: diffOf(prev, overrides), origin })
  }
  add({ 'support.phone': '+90 850 000 00 00' }, 21, 'Destek hattı numarası yayına alındı')
  add({ 'support.phone': '+90 850 000 00 00', 'announcement.enabled': true, 'announcement.text': 'Pazar 02:00-03:00 arası planlı bakım yapılacaktır.', 'announcement.level': 'warning' }, 9, 'Planlı bakım duyurusu (değişiklik kaydı #örnek)')
  add({ 'support.phone': '+90 850 000 00 00', 'ui.listPageSize': 50 }, 2, 'Bakım bitti; duyuru kaldırıldı, liste boyutu 50')
  let draft: { version: number; draftRev: number; overrides: Record<string, unknown>; basedOn: number } | null = null

  const published = () => revisions[revisions.length - 1] ?? null

  const admins: PlatformAdmin[] = [
    { sub: admin1, email: 'yonetici@ornek.test', name: 'Örnek', surname: 'Yönetici', status: 'active', mfaEnabled: true, lastLoginAt: iso(t0 - 5 * MIN), locked: false, createdAt: iso(t0 - 300 * DAY) },
    { sub: hex24(5002), email: 'operasyon@ornek.test', name: 'Örnek', surname: 'Operasyon', status: 'active', mfaEnabled: true, lastLoginAt: iso(t0 - 26 * HOUR), locked: false, createdAt: iso(t0 - 220 * DAY) },
    { sub: hex24(5003), email: 'destek@ornek.test', name: 'Örnek', surname: 'Destek', status: 'active', mfaEnabled: true, lastLoginAt: iso(t0 - 9 * DAY), locked: true, createdAt: iso(t0 - 120 * DAY) },
    { sub: hex24(5004), email: 'eski.yonetici@ornek.test', name: 'Örnek', surname: 'Eski', status: 'disabled', mfaEnabled: true, lastLoginAt: null, locked: false, createdAt: iso(t0 - 400 * DAY) },
    { sub: hex24(5005), email: 'yeni.yonetici@ornek.test', name: 'Yeni', surname: 'Örnek', status: 'active', mfaEnabled: false, lastLoginAt: null, locked: false, createdAt: iso(t0 - 3 * DAY) },
    { sub: hex24(5006), email: 'aday@ornek.test', name: 'Davetli', surname: 'Yönetici', status: 'invited', mfaEnabled: false, lastLoginAt: null, locked: false, createdAt: iso(t0 - 1 * DAY) },
  ]
  let inviteUsed = false

  function target(body: Record<string, unknown>) {
    if (body.target !== '_platform') return null
    return '_platform'
  }
  function findAdmin(body: Record<string, unknown>) {
    if (typeof body.sub !== 'string' || !/^[a-f0-9]{24}$/i.test(body.sub)) throw validation('sub', '24 hex')
    const a = admins.find((x) => x.sub === body.sub)
    if (!a) throw notFound()
    return a
  }
  const isSelf = (a: PlatformAdmin, ctx: MockCtx) => a.email === (ctx.actorEmail || selfEmail)

  return {
    handle(op, body, ctx) {
      switch (op) {
        case 'IntegrationConfigService/getEffectiveConfig': {
          if (!target(body)) return UNHANDLED
          const pub = published()
          return {
            target: '_platform', publishedVersion: pub?.version ?? 0, catalogVersion: '2026-09-30.b3',
            values: platformCatalog().map((c) => (pub && c.key in pub.overrides ? { key: c.key, value: pub.overrides[c.key], source: 'platform', revision: pub.version } : { key: c.key, value: c.default, source: 'default' })),
          }
        }
        case 'IntegrationConfigService/history': {
          if (!target(body)) return UNHANDLED
          strict(body, ['target', 'limit'])
          const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100)
          const rows: ConfigRevision[] = [...revisions].reverse().slice(0, limit).map((r) => ({
            version: r.version, status: r === published() ? 'published' : 'superseded', createdBy: r.publishedBy, createdAt: iso(r.createdAt),
            publishedBy: r.publishedBy, publishedAt: iso(r.publishedAt), reason: r.reason, diff: r.diff, origin: r.origin, approvedBy: null,
          }))
          return rows
        }
        case 'IntegrationConfigService/saveDraft': {
          if (!target(body)) return UNHANDLED
          strict(body, ['target', 'patch', 'unset', 'expectedDraftRev'])
          const patch = (body.patch && typeof body.patch === 'object' ? body.patch : {}) as Record<string, unknown>
          const errors = Object.entries(patch).map(([k, v]) => (validate(k, v) ? { path: k, message: validate(k, v)! } : null)).filter(Boolean) as Array<{ path: string; message: string }>
          if (errors.length) throw new MockHttpError(400, 'VALIDATION', errors.map((e) => e.message).join(' | '), errors)
          const pub = published()
          if (!draft) draft = { version: (pub?.version ?? 0) + 1, draftRev: 0, overrides: { ...(pub?.overrides ?? {}) }, basedOn: pub?.version ?? 0 }
          if (body.expectedDraftRev !== undefined && body.expectedDraftRev !== draft.draftRev) throw conflict('DRAFT_CONFLICT', 'Taslak başka bir işlemle değişti; farkı yeniden gözden geçirin.')
          const unset = Array.isArray(body.unset) ? (body.unset as string[]) : []
          if (Object.keys(patch).length || unset.length) {
            draft.overrides = { ...draft.overrides, ...patch }
            for (const k of unset) delete draft.overrides[k]
            draft.draftRev += 1
          }
          return { target: '_platform', version: draft.version, draftRev: draft.draftRev, overrides: draft.overrides }
        }
        case 'IntegrationConfigService/discardDraft': {
          if (!target(body)) return UNHANDLED
          if (!draft) throw notFound('Açık taslak bulunamadı.')
          if (body.expectedDraftRev !== draft.draftRev) throw conflict('DRAFT_CONFLICT', 'Taslak başka bir işlemle değişti.')
          draft = null
          return { target: '_platform', discarded: true }
        }
        case 'IntegrationConfigService/previewPublish': {
          if (!target(body)) return UNHANDLED
          if (!draft) throw notFound('Açık taslak bulunamadı.')
          const diff = diffOf(published()?.overrides ?? {}, draft.overrides)
          const danger = diff.some((d) => d.danger === 'dangerous') ? 'dangerous' : diff.some((d) => d.danger === 'caution') ? 'caution' : 'safe'
          const active = ctx.clients.filter((c) => c.status === 'ACTIVE').length
          return { target: '_platform', draftVersion: draft.version, basedOnVersion: draft.basedOn, diff, impact: { activeTenants: active, approximate: active > 50 }, danger, restartCount: 0, requiresReason: danger !== 'safe', requiresTypedApproval: danger === 'dangerous' }
        }
        case 'IntegrationConfigService/publish': {
          if (!target(body)) return UNHANDLED
          strict(body, ['target', 'reason', 'typedConfirmation', 'approvedBy'])
          if (!draft) throw notFound('Açık taslak bulunamadı.')
          const pub = published()
          if (draft.basedOn !== (pub?.version ?? 0)) throw conflict('PUBLISH_CONFLICT', 'Siz düzenlerken yeni bir sürüm yayınlandı. Farkı yeniden gözden geçirin.')
          const diff = diffOf(pub?.overrides ?? {}, draft.overrides)
          revisions.push({ version: draft.version, overrides: draft.overrides, createdAt: ctx.now - MIN, publishedAt: ctx.now, publishedBy: admin1, reason: String(body.reason ?? ''), diff, origin: 'manual' })
          draft = null
          return { target: '_platform', version: published()!.version, publishedVersion: published()!.version, diff }
        }
        case 'IntegrationConfigService/rollback': {
          if (!target(body)) return UNHANDLED
          strict(body, ['target', 'toVersion', 'reason', 'typedConfirmation'])
          const to = Number(body.toVersion)
          const src = revisions.find((r) => r.version === to)
          if (!src) throw notFound(`Sürüm bulunamadı: ${to}`)
          if (draft) throw conflict('DRAFT_CONFLICT', 'Hedefte açık bir taslak var; önce onu kapatın.')
          const pub = published()!
          revisions.push({ version: pub.version + 1, overrides: { ...src.overrides }, createdAt: ctx.now, publishedAt: ctx.now, publishedBy: admin1, reason: String(body.reason ?? `Sürüm ${to}'e geri alındı.`), diff: diffOf(pub.overrides, src.overrides), origin: 'rollback' })
          return { target: '_platform', version: pub.version + 1, publishedVersion: pub.version + 1 }
        }
        case 'BackofficeAdminUserService/list':
          strict(body, [])
          return { items: [...admins].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) }
        case 'BackofficeAdminUserService/invite': {
          strict(body, ['email', 'reason'])
          const email = String(body.email ?? '').trim().toLowerCase()
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw validation('email', 'geçerli e-posta')
          if (email.endsWith('@posta-yok.test')) throw new MockHttpError(503, 'ADMIN_INVITE_UNAVAILABLE', 'Yönetici daveti şu an gönderilemiyor.')
          const existing = admins.find((a) => a.email === email)
          if (existing && existing.status !== 'invited') throw conflict('ADMIN_INVITE_EXISTING_USER', 'Bu e-posta adresi zaten bir kullanıcıya ait.')
          if (email === 'musteri@ornek.test') throw conflict('ADMIN_INVITE_EXISTING_USER', 'Bu e-posta adresi zaten bir kullanıcıya ait.')
          const expiresAt = iso(ctx.now + 48 * HOUR)
          if (existing) return { sub: existing.sub, status: 'invited', expiresAt, renewed: true }
          const sub = hex24(6000 + admins.length)
          admins.push({ sub, email, name: 'Davetli', surname: 'Yönetici', status: 'invited', mfaEnabled: false, lastLoginAt: null, locked: false, createdAt: iso(ctx.now) })
          return { sub, status: 'invited', expiresAt, renewed: false }
        }
        case 'BackofficeAdminUserService/disable': {
          strict(body, ['sub', 'reason'])
          const a = findAdmin(body)
          if (isSelf(a, ctx)) throw new MockHttpError(403, 'ADMIN_SELF_ACTION', 'Bu işlemi kendi hesabınız üzerinde yapamazsınız.')
          if (a.status === 'invited') {
            admins.splice(admins.indexOf(a), 1)
            return { sub: a.sub, status: 'revoked' }
          }
          const activeOthers = admins.filter((x) => x.status === 'active' && x !== a).length
          if (a.status === 'active' && activeOthers === 0) throw conflict('LAST_PLATFORM_ADMIN', 'Son aktif platform yöneticisi kapatılamaz.')
          a.status = 'disabled'
          return { sub: a.sub, status: 'disabled' }
        }
        case 'BackofficeAdminUserService/enable': {
          strict(body, ['sub', 'reason'])
          const a = findAdmin(body)
          if (a.status === 'invited') throw conflict('CONFLICT', 'Davet bekleyen hesap açılamaz; önce davet kabul edilmeli.')
          a.status = 'active'
          a.locked = false
          return { sub: a.sub, status: 'active' }
        }
        case 'BackofficeAdminUserService/resetMfa': {
          strict(body, ['sub', 'reason'])
          const a = findAdmin(body)
          if (isSelf(a, ctx)) throw new MockHttpError(403, 'ADMIN_SELF_ACTION', 'Bu işlemi kendi hesabınız üzerinde yapamazsınız.')
          if (a.status === 'invited') throw conflict('CONFLICT', 'Davet bekleyen hesapta iki adımlı doğrulama yok.')
          a.mfaEnabled = false
          return { sub: a.sub, mfaEnabled: false }
        }
        case 'BackofficeAuthService/acceptInvite': {
          strict(body, ['token', 'name', 'surname', 'password'])
          const name = String(body.name ?? '').trim()
          const surname = String(body.surname ?? '').trim()
          if (!name || name.length > 60) throw validation('name', '1..60 karakter')
          if (!surname || surname.length > 60) throw validation('surname', '1..60 karakter')
          if (!PASSWORD_POLICY.test(String(body.password ?? ''))) throw new MockHttpError(400, 'WEAK_PASSWORD', 'Parola politikayı karşılamıyor.')
          if (body.token !== MOCK_INVITE_TOKEN || inviteUsed) throw new MockHttpError(400, 'ADMIN_INVITE_INVALID', 'Davet bağlantısı geçersiz veya süresi dolmuş.')
          inviteUsed = true
          const inv = admins.find((a) => a.status === 'invited')
          if (inv) Object.assign(inv, { status: 'active', name, surname })
          return { accepted: true }
        }
      }
      return UNHANDLED
    },
  }
}

/** GET /api/public-config gövdesi (yalnız `exposure:'public'` anahtarlar + env izin listesi). */
export function publicConfigOf(domain: MockDomain, ctx: MockCtx) {
  const eff = domain.handle('IntegrationConfigService/getEffectiveConfig', { target: '_platform' }, ctx) as { publishedVersion: number; values: Array<{ key: string; value: unknown }> }
  const publicKeys = new Set(platformCatalog().filter((c) => c.exposure === 'public').map((c) => c.key))
  return {
    version: eff.publishedVersion,
    env: { images: { productBaseUrl: 'https://cdn.ornek.test/products/', uploadMaxBytes: 10_485_760 } },
    settings: Object.fromEntries(eff.values.filter((v) => publicKeys.has(v.key)).map((v) => [v.key, v.value])),
  }
}
