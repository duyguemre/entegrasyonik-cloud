// Faz 3 / C2a — ekip yönetimi: hata kodu → i18n iletisi, rol tavanı / askı / devir kuralları, davet bağlantısı
// token'ının adrese/loga yazılmaması. Sözleşme: docs/cloud-contracts/{API_ACCOUNT_LIFECYCLE,ERROR_CODES}.md.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MAPPED_ERROR_CODES, errorMessageKey, isPlanLimit, describeFailure } from '../src/composables/errorCodes'
import {
  activeOwnerCount, daysLeft, invitableRoles, invitationExpired, isSelf, memberRole, memberStatus, normalizeInvitations,
  reactivateGate, suspendGate, transferTargetGate,
} from '../src/components/user/team/teamModel'
import { consumeFragmentToken, holdToken, parseFragmentToken, takeHeldToken } from '../src/composables/fragmentToken'

const root = resolve(__dirname, '..')
const tr = JSON.parse(readFileSync(resolve(root, 'src/plugins/locales/tr.json'), 'utf8'))
const en = JSON.parse(readFileSync(resolve(root, 'src/plugins/locales/en.json'), 'utf8'))
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
const lookup = (dict: any, key: string) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict)

const fail = (status: number | undefined, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  ({ isAxiosError: true, config: {}, response: status === undefined ? undefined : { status, data, headers: {} }, ...extra })

describe('hata kodu → kullanıcı iletisi (ERROR_CODES.md + API_IDEMPOTENCY.md)', () => {
  it('sözleşmedeki TÜM kodlar eşlenir ve her anahtar tr + en sözlüğünde dolu', () => {
    const contract = [
      'VALIDATION', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED', 'QUOTA_EXCEEDED', 'PLAN_REQUIRED',
      'SUBSCRIPTION_RESTRICTED', 'REAUTH_REQUIRED', 'INTERNAL', 'AUTH', 'UNAVAILABLE', 'NOT_SUPPORTED', 'UNKNOWN_OUTCOME',
      'INVALID_REQUEST', 'INVALID_CURRENT_PASSWORD', 'SAME_PASSWORD', 'WEAK_PASSWORD', 'TOKEN_INVALID', 'EMAIL_NOT_CONFIGURED',
      'COOLDOWN', 'MAIL_FAILED', 'INVITATION_INVALID', 'INVITATION_EXPIRED', 'INVITATION_REVOKED', 'INVITATION_ACCEPTED',
      'INVITATION_RATE_LIMITED', 'PLAN_LIMIT_REACHED', 'ALREADY_MEMBER', 'EMAIL_TAKEN', 'LAST_OWNER', 'ALREADY_OWNER',
      'TARGET_NOT_ACTIVE', 'TARGET_EMAIL_UNVERIFIED', 'IDEMPOTENCY_IN_PROGRESS', 'IDEMPOTENCY_KEY_REUSED',
    ]
    expect([...MAPPED_ERROR_CODES].sort()).toEqual([...contract].sort())
    for (const code of [...contract, 'NETWORK', 'GENERIC']) {
      const key = code === 'NETWORK' || code === 'GENERIC' ? `apiErrors.${code}` : errorMessageKey(fail(418, { code }))!
      expect(key).toBe(`apiErrors.${code}`)
      expect(typeof lookup(tr, key), `tr ${key}`).toBe('string')
      expect(typeof lookup(en, key), `en ${key}`).toBe('string')
    }
  })

  it('iletiler ham kod/İngilizce çerçeve metni içermez; vue-i18n özel karakterleri kaçışlı', () => {
    for (const [code, text] of Object.entries<string>(tr.apiErrors)) {
      expect(text).not.toMatch(/[A-Z]{3,}_[A-Z]/) // ham kod sızmaz
      expect(text, code).not.toMatch(/(^|[^{'])@/)
      expect(text).not.toContain('|')
    }
  })

  it('önceliği: bağlam kodu > genel kod > bağlam HTTP > duruma göre > ağ', () => {
    expect(errorMessageKey(fail(409, { code: 'LAST_OWNER', error: 'Mağazanın son sahibi…' }))).toBe('apiErrors.LAST_OWNER')
    expect(errorMessageKey(fail(403, { code: 'FORBIDDEN' }), { FORBIDDEN: 'team.suspend.forbidden' })).toBe('team.suspend.forbidden')
    expect(errorMessageKey(fail(404), { HTTP_404: 'team.invitations.notPending' })).toBe('team.invitations.notPending')
    expect(errorMessageKey(fail(404))).toBe('apiErrors.NOT_FOUND')
    expect(errorMessageKey(fail(429))).toBe('apiErrors.RATE_LIMITED')
    expect(errorMessageKey(fail(500, { error: 'Beklenmeyen bir hata oluştu.' }))).toBe('apiErrors.INTERNAL')
    expect(errorMessageKey(fail(undefined))).toBe('apiErrors.NETWORK')
    expect(errorMessageKey(fail(418, { code: 'BILINMEYEN_KOD' }))).toBe('apiErrors.GENERIC')
  })

  it('yeniden doğrulama iptali sessizdir; plan sınırı yetki hatası değil "planı yükselt"', () => {
    expect(errorMessageKey(fail(401, { code: 'REAUTH_REQUIRED' }, { reauthCancelled: true }))).toBeNull()
    expect(isPlanLimit(fail(403, { code: 'PLAN_LIMIT_REACHED' }))).toBe(true)
    expect(isPlanLimit(fail(403, { code: 'FORBIDDEN' }))).toBe(false)
    expect(describeFailure(fail(409, { code: 'EMAIL_TAKEN', requestId: 'req-1' })).requestId).toBe('req-1')
  })

  it('ekip ekranı iletileri (gates, davet, askı, devir) iki dilde de var', () => {
    const keys = [
      'team.gates.self', 'team.gates.ownerOnly', 'team.gates.lastOwner', 'team.gates.noPermission', 'team.gates.platformAdmin',
      'team.invite.errors.forbidden', 'team.invitations.notPending', 'team.suspend.forbidden', 'team.transfer.noPending',
      'reauth.title', 'reauth.errors.wrongPassword', 'reauth.errors.rateLimited', 'reauth.errors.required', 'reauth.errors.network', 'reauth.errors.generic',
      'invitation.noTokenTitle', 'invitation.expiredTitle', 'invitation.revokedTitle', 'invitation.acceptedTitle', 'invitation.invalidTitle',
      'ownership.invalidTitle', 'loginNotice.invitationAccepted', 'loginNotice.ownershipTransferred',
    ]
    for (const k of keys) {
      expect(typeof lookup(tr, k), `tr ${k}`).toBe('string')
      expect(typeof lookup(en, k), `en ${k}`).toBe('string')
    }
  })
})

describe('ekip kuralları (UI ipucu; asıl sınır sunucuda)', () => {
  const owner = { _id: 'o1', email: 'sahip@example.com', owner: true }
  const admin = { _id: 'a1', email: 'yonetici@example.com', roleCode: 'ROLE_ADMIN' }
  const operator = { _id: 'p1', email: 'operator@example.com', roleCode: 'STAFF' }

  it('rol çözümü: üyelik alanı öncelikli, yoksa eski projeksiyon; durum isActive yedeği', () => {
    expect(memberRole(owner)).toBe('owner')
    expect(memberRole(admin)).toBe('admin')
    expect(memberRole(operator)).toBe('operator')
    expect(memberRole({ role: 'admin' })).toBe('admin')
    expect(memberStatus({ isActive: false })).toBe('suspended')
    expect(memberStatus({ status: 'active', isActive: false })).toBe('active')
    expect(memberStatus({})).toBe('active')
  })

  it('rol tavanı: sahip ve yönetici admin|operator davet eder; operatör davet edemez; owner asla', () => {
    expect(invitableRoles(owner)).toEqual(['admin', 'operator'])
    expect(invitableRoles(admin)).toEqual(['admin', 'operator'])
    expect(invitableRoles(operator)).toEqual([])
    expect(invitableRoles(owner)).not.toContain('owner')
  })

  it('kendini tanıma: liste _id tenant kopyası olabilir → e-posta da karşılaştırılır (büyük/küçük harf duyarsız)', () => {
    expect(isSelf({ _id: 'tenant-copy', email: 'Sahip@Example.com ' }, owner)).toBe(true)
    expect(isSelf({ _id: 'o1' }, owner)).toBe(true)
    expect(isSelf({ _id: 'x', email: 'baska@example.com' }, owner)).toBe(false)
  })

  it('askı: kendine kapalı, sahibe yalnız sahip, son aktif sahip kapalı; yönetici yöneticiyi askıya alabilir', () => {
    const rows = [owner, admin, operator]
    const owners = activeOwnerCount(rows)
    expect(owners).toBe(1)
    expect(suspendGate(owner, owner, owners)).toEqual({ allowed: false, reasonKey: 'team.gates.self' })
    expect(suspendGate(owner, admin, owners)).toEqual({ allowed: false, reasonKey: 'team.gates.ownerOnly' })
    expect(suspendGate({ _id: 'o2', owner: true }, owner, 1)).toEqual({ allowed: false, reasonKey: 'team.gates.lastOwner' })
    expect(suspendGate({ _id: 'o2', owner: true }, owner, 2).allowed).toBe(true)
    expect(suspendGate({ _id: 'a2', roleCode: 'ROLE_ADMIN' }, admin, owners).allowed).toBe(true)
    expect(suspendGate(admin, operator, owners)).toEqual({ allowed: false, reasonKey: 'team.gates.noPermission' })
    expect(reactivateGate({ ...operator, isActive: false }, admin).allowed).toBe(true)
    expect(reactivateGate(admin, admin)).toEqual({ allowed: false, reasonKey: 'team.gates.self' })
  })

  it('devir hedefi: yalnız sahip başlatır; hedef aktif, sahip olmayan, doğrulanmış (bilinmiyorsa sunucuya bırakılır)', () => {
    expect(transferTargetGate(admin, owner).allowed).toBe(true)
    expect(transferTargetGate(admin, admin)).toEqual({ allowed: false, reasonKey: 'team.gates.ownerOnly' })
    expect(transferTargetGate(owner, owner).reasonKey).toBe('team.gates.self')
    expect(transferTargetGate({ ...operator, isActive: false }, owner).reasonKey).toBe('apiErrors.TARGET_NOT_ACTIVE')
    expect(transferTargetGate({ ...operator, emailVerified: false }, owner).reasonKey).toBe('apiErrors.TARGET_EMAIL_UNVERIFIED')
    expect(transferTargetGate({ _id: 'o9', owner: true }, owner).reasonKey).toBe('apiErrors.ALREADY_OWNER')
  })

  it('davet listesi normalizasyonu ve süre', () => {
    const now = Date.parse('2026-09-30T12:00:00Z')
    const list = normalizeInvitations({ invitations: [{ _id: 'i1', email: 'a@b.co', role: 'admin', status: 'pending', expiresAt: '2026-10-03T12:00:00Z' }, null, {}] })
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('i1')
    expect(daysLeft(list[0].expiresAt, now)).toBe(3)
    expect(daysLeft('2026-09-30T20:00:00Z', now)).toBe(0) // 8 saat: "bir günden az", "1 gün" değil
    expect(invitationExpired(list[0], now)).toBe(false)
    expect(invitationExpired({ ...list[0], expired: true }, now)).toBe(true)
    expect(invitationExpired({ ...list[0], expiresAt: '2026-09-29T00:00:00Z' }, now)).toBe(true)
    expect(normalizeInvitations(undefined)).toEqual([])
  })
})

describe('davet / devir bağlantısı token\'ı adrese ve loga yazılmaz', () => {
  const TOKEN = 'Qm9ndXNfdG9rZW5fZm9yX3Rlc3RzXzI1Nl9iaXRz_abc-123'

  it('#t= okunur, parça hemen silinir (yol + sorgu korunur), token hiçbir URL argümanında yok', () => {
    const replaceState = vi.fn()
    const token = consumeFragmentToken({ hash: `#t=${TOKEN}`, pathname: '/invite', search: '?utm=mail' }, { state: { k: 1 }, replaceState })
    expect(token).toBe(TOKEN)
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledWith({ k: 1 }, '', '/invite?utm=mail')
    expect(JSON.stringify(replaceState.mock.calls)).not.toContain(TOKEN)
  })

  it('biçimsiz / eksik token boş döner ama parça yine silinir; parça yoksa geçmişe dokunulmaz', () => {
    const replaceState = vi.fn()
    expect(consumeFragmentToken({ hash: '#t=<script>', pathname: '/invite', search: '' }, { state: null, replaceState })).toBe('')
    expect(replaceState).toHaveBeenCalledWith(null, '', '/invite')
    replaceState.mockReset()
    expect(consumeFragmentToken({ hash: '', pathname: '/invite', search: '' }, { state: null, replaceState })).toBe('')
    expect(replaceState).not.toHaveBeenCalled()
    expect(parseFragmentToken(`#x=1&t=${TOKEN}`)).toBe(TOKEN)
    expect(parseFragmentToken('#t=kisa')).toBe('')
  })

  it('bekletilen token (girişe gidip dönüş) tek kullanımlıktır', () => {
    holdToken(TOKEN)
    expect(takeHeldToken()).toBe(TOKEN)
    expect(takeHeldToken()).toBe('')
  })

  it('statik: sayfalar token\'ı router/sorgu/log/depoya vermez; yalnız fragmentToken okur', () => {
    for (const file of ['src/views/unsecure/InvitationAcceptView.vue', 'src/views/unsecure/OwnershipAcceptView.vue']) {
      const text = read(file)
      expect(text).toContain('consumeFragmentToken')
      expect(text).not.toMatch(/location\.hash|route\.hash|route\.query\.t\b/)
      expect(text).not.toMatch(/(router\.(push|replace)|query:)[^\n]*token/)
      expect(text).not.toMatch(/(logger|console)\.[a-z]+\([^)]*token/i)
      expect(text).not.toMatch(/(localStorage|sessionStorage)/)
    }
    const router = read('src/router/index.ts')
    expect(router).toMatch(/path: 'invite'[\s\S]*?requiresAuth: false/)
    expect(router).toMatch(/path: 'accept-ownership'[\s\S]*?requiresAuth: false/)
  })

  it('statik: uygulama genelinde TEK reauth diyaloğu (App.vue) ve Idempotency-Key yalnız restapi.ts\'te üretilir', () => {
    expect(read('src/App.vue')).toContain('<ReauthDialog')
    const offenders: string[] = []
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
      const p = resolve(d, n)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
    for (const f of walk(resolve(root, 'src')).filter((p) => /\.(ts|vue)$/.test(p))) {
      const text = readFileSync(f, 'utf8')
      if (/Idempotency-Key['"]\s*[:\]]/.test(text) && !f.endsWith('composables/restapi.ts')) offenders.push(f)
      if (/<ReauthDialog\b/.test(text) && !f.endsWith('App.vue')) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })
})
