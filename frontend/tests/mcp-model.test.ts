// MCP-6 (ADR-0035) — görünüm modeli: S1 onay durumları/gövde, S2 durum → görünüm eşlemesi (her status ve hata kodu),
// geri sayım ve duyuru, S3 rol görünürlüğü (sahip/yönetici/operatör), S4 onay zorunluluğu ve kayıt gövdesi, i18n eşliği.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MCP_ACCESS_OPTIONS,
  accessLabelKey,
  approvalFailurePhase,
  approvalOutcome,
  consentDecisionBody,
  consentPhase,
  consentRequired,
  failedResultKey,
  formatCountdown,
  initialTenant,
  mcpErrorKey,
  mcpRole,
  mcpVisibility,
  needsLogin,
  noEligibleTenant,
  openInLocation,
  remainingSeconds,
  roleLabelKey,
  scopeChips,
  settingsSaveBody,
  shouldAnnounceCountdown,
  writeOptionVisible,
} from '../src/components/mcp/mcpModel'
import { MCP_MESSAGES } from '../src/components/mcp/mcpMessages'
import { approvalView, consentRequest, mcpSettings } from '../src/mocks/mcp'
import { MCP_ERROR_CODES, type ApprovalStatus, type ConsentRequest } from '../src/types/McpTypes'

const multi: ConsentRequest = consentRequest({
  tenants: [
    { tid: 1, name: 'A', role: 'owner', mcpAccess: 'readwrite', writeAvailable: true },
    { tid: 2, name: 'B', role: 'admin', mcpAccess: 'read', writeAvailable: false },
    { tid: 3, name: 'C', role: 'owner', mcpAccess: 'off', writeAvailable: false },
  ],
})

describe('S1 — onay ekranı', () => {
  it('faz: pending → ready, expired/404/OAUTH_INVALID_REQUEST → expired, impersonation, 401 → login, diğer → error', () => {
    expect(consentPhase({ ok: true, data: consentRequest() })).toBe('ready')
    expect(consentPhase({ ok: true, data: consentRequest({ state: 'expired' }) })).toBe('expired')
    expect(consentPhase({ ok: false, failure: { status: 404 } })).toBe('expired')
    expect(consentPhase({ ok: false, failure: { status: 400, code: 'OAUTH_INVALID_REQUEST' } })).toBe('expired')
    expect(consentPhase({ ok: false, failure: { status: 403, code: 'IMPERSONATION_FORBIDDEN' } })).toBe('impersonation')
    expect(consentPhase({ ok: false, failure: { status: 401 } })).toBe('login')
    expect(consentPhase({ ok: false, failure: { status: 401, code: 'REAUTH_REQUIRED' } })).toBe('error')
    expect(consentPhase({ ok: false, failure: { status: 500 } })).toBe('error')
    expect(consentPhase({ ok: false, failure: {} })).toBe('error')
  })

  it('başlangıç mağazası: tek uygun → seçili; çoklu → seçim yok (İzin ver devre dışı); tümü off → yok', () => {
    expect(initialTenant(consentRequest())).toBe(101)
    expect(initialTenant(multi)).toBeNull()
    const oneEligible = consentRequest({ tenants: [multi.tenants[0], multi.tenants[2]] })
    expect(initialTenant(oneEligible)).toBe(1)
    const none = consentRequest({ tenants: [multi.tenants[2]] })
    expect(initialTenant(none)).toBeNull()
    expect(noEligibleTenant(none)).toBe(true)
    expect(noEligibleTenant(multi)).toBe(false)
  })

  it('yazma kutusu: yalnız mcp:write istendi + writeAvailable + readwrite mağaza', () => {
    expect(writeOptionVisible(multi, null)).toBe(false)
    expect(writeOptionVisible(multi, 1)).toBe(true)
    expect(writeOptionVisible(multi, 2)).toBe(false)
    expect(writeOptionVisible(multi, 3)).toBe(false)
    expect(writeOptionVisible({ ...multi, requestedScopes: ['mcp:read'] }, 1)).toBe(false)
    // backend tutarsız gönderse de (read + writeAvailable:true) gösterilmez — savunma derinliği
    const odd = consentRequest({ tenants: [{ tid: 9, name: 'X', role: 'owner', mcpAccess: 'read', writeAvailable: true }] })
    expect(writeOptionVisible(odd, 9)).toBe(false)
  })

  it('karar gövdesi: reddet yalnız approve:false; izin ver tid + kapsam (yazma yalnız işaretli ve uygunsa)', () => {
    expect(consentDecisionBody(false, multi, 1, true)).toEqual({ approve: false })
    expect(consentDecisionBody(true, multi, 1, false)).toEqual({ approve: true, tid: 1, scopes: ['mcp:read'] })
    expect(consentDecisionBody(true, multi, 1, true)).toEqual({ approve: true, tid: 1, scopes: ['mcp:read', 'mcp:write'] })
    expect(consentDecisionBody(true, multi, 2, true)).toEqual({ approve: true, tid: 2, scopes: ['mcp:read'] })
  })

  it('rol etiketi: bilinen roller, bilinmeyen → üye', () => {
    expect(roleLabelKey('owner')).toBe('mcp.roles.owner')
    expect(roleLabelKey('admin')).toBe('mcp.roles.admin')
    expect(roleLabelKey('viewer')).toBe('mcp.roles.member')
  })
})

describe('S2 — işlem onayı durum eşlemesi', () => {
  const STATUSES: ApprovalStatus[] = ['pending', 'executed', 'failed', 'unknown_outcome', 'rejected', 'expired']

  it('her status → doğru görünüm (pending önizleme çizer: outcome null)', () => {
    const v = approvalView({ result: { summary: 'ok', openIn: { screen: 'OrderListView' } } })
    const got = Object.fromEntries(STATUSES.map((s) => [s, approvalOutcome(s, v)]))
    expect(got.pending).toBeNull()
    expect(got.executed).toMatchObject({ tone: 'success', titleKey: 'mcp.approval.executed.title', showOpenIn: true, showReturnNote: true })
    expect(got.failed).toMatchObject({ tone: 'error', showSupport: true })
    expect(got.unknown_outcome).toMatchObject({ tone: 'warning', textKey: 'mcp.approval.unknown.text', showOpenIn: true })
    expect(got.rejected).toMatchObject({ titleKey: 'mcp.approval.rejected.title' })
    expect(got.expired).toMatchObject({ textKey: 'mcp.approval.expired.text', showReturnNote: false })
  })

  it('openIn yoksa "Ekranda aç" gösterilmez', () => {
    expect(approvalOutcome('executed', approvalView())?.showOpenIn).toBe(false)
    expect(approvalOutcome('unknown_outcome', approvalView())?.showOpenIn).toBe(false)
  })

  it('hata kodu → faz: LIVE_READONLY / MAINTENANCE / QUOTA_EXCEEDED (+plan) / süresi dolmuş / reddedilmiş / 401 / genel', () => {
    expect(approvalFailurePhase({ status: 423, code: 'LIVE_READONLY' })).toBe('LIVE_READONLY')
    expect(approvalFailurePhase({ status: 423 })).toBe('LIVE_READONLY')
    expect(approvalFailurePhase({ status: 503, code: 'MAINTENANCE' })).toBe('MAINTENANCE')
    expect(approvalFailurePhase({ status: 429, code: 'QUOTA_EXCEEDED' })).toBe('QUOTA_EXCEEDED')
    expect(approvalFailurePhase({ status: 410, code: 'APPROVAL_EXPIRED' })).toBe('expired')
    expect(approvalFailurePhase({ status: 404 })).toBe('expired')
    expect(approvalFailurePhase({ status: 404, code: 'NOT_FOUND' })).toBe('expired')
    expect(approvalFailurePhase({ status: 409, code: 'APPROVAL_REJECTED' })).toBe('rejected')
    expect(approvalFailurePhase({ status: 401 })).toBe('login')
    expect(approvalFailurePhase({ status: 500 })).toBe('error')
    expect(approvalFailurePhase({ status: 429, code: 'RATE_LIMITED' })).toBe('error')
    expect(approvalOutcome('LIVE_READONLY')).toMatchObject({ textKey: 'mcp.errors.LIVE_READONLY', showUpgrade: false })
    expect(approvalOutcome('MAINTENANCE')).toMatchObject({ textKey: 'mcp.errors.MAINTENANCE' })
    expect(approvalOutcome('QUOTA_EXCEEDED')).toMatchObject({ textKey: 'mcp.errors.QUOTA_EXCEEDED', showUpgrade: true })
    expect(approvalOutcome('error')).toMatchObject({ showSupport: true })
    expect(approvalOutcome('loading')).toBeNull()
  })

  it('failed sonuç kodu → i18n; bilinmeyen → genel', () => {
    expect(failedResultKey(approvalView({ status: 'failed', result: { code: 'RATE_LIMITED' } }))).toBe('mcp.errors.RATE_LIMITED')
    expect(failedResultKey(approvalView({ status: 'failed', result: { code: 'SOMETHING_ELSE' } }))).toBe('mcp.errors.GENERIC')
    expect(failedResultKey(approvalView({ status: 'failed' }))).toBe('mcp.errors.GENERIC')
  })

  it('geri sayım: kalan saniye, biçim, son 60 sn duyurusu BİR kez', () => {
    const now = Date.parse('2026-10-01T10:00:00Z')
    expect(remainingSeconds('2026-10-01T10:01:00Z', now)).toBe(60)
    expect(remainingSeconds('2026-10-01T09:59:00Z', now)).toBe(0)
    expect(remainingSeconds('bozuk', now)).toBe(0)
    expect(formatCountdown(59)).toBe('0:59')
    expect(formatCountdown(605)).toBe('10:05')
    expect(formatCountdown(3723)).toBe('1:02:03')
    expect(formatCountdown(-3)).toBe('0:00')
    expect(shouldAnnounceCountdown(61, false)).toBe(false)
    expect(shouldAnnounceCountdown(60, false)).toBe(true)
    expect(shouldAnnounceCountdown(30, true)).toBe(false)
    expect(shouldAnnounceCountdown(0, false)).toBe(false)
  })

  it('"Ekranda aç": yalnız kayıtlı ekran + beyaz liste parametre; tanınmayan ekran → null', () => {
    expect(openInLocation({ screen: 'OrderListView' })).toEqual({ path: '/orders', query: {} })
    expect(openInLocation({ screen: 'OrderListView', params: { evil: 'x', globalSearch: 'ad soyad' } })?.query).toEqual({})
    expect(openInLocation({ screen: 'https://evil.invalid' })).toBeNull()
    expect(openInLocation({ screen: 'NoSuchView' })).toBeNull()
    expect(openInLocation(undefined)).toBeNull()
  })
})

describe('S3 — rol görünürlüğü (sahip / yönetici / operatör)', () => {
  it('rol çözümü teamModel kümesiyle aynı', () => {
    expect(mcpRole({ owner: true })).toBe('owner')
    expect(mcpRole({ roleCode: 'ROLE_ADMIN' })).toBe('admin')
    expect(mcpRole({ roleCode: 'ROLE_OWNER' })).toBe('admin')
    expect(mcpRole({ isGlobalAdmin: true })).toBe('admin')
    expect(mcpRole({ roleCode: 'ROLE_USER' })).toBe('operator')
    expect(mcpRole(null)).toBe('operator')
  })

  it('sahip: tenant sekmesi + tümünü kes + ayar bağlantısı', () => {
    expect(mcpVisibility({ owner: true })).toEqual({ tenantTab: true, revokeAll: true, settingsLink: true })
  })
  it('yönetici: tenant sekmesi + tümünü kes; ayarı değiştiremez (bağlantı yok)', () => {
    expect(mcpVisibility({ roleCode: 'ROLE_ADMIN' })).toEqual({ tenantTab: true, revokeAll: true, settingsLink: false })
  })
  it('operatör: yalnız kendi bağlantıları', () => {
    expect(mcpVisibility({})).toEqual({ tenantTab: false, revokeAll: false, settingsLink: false })
  })

  it('izin çipleri: Okuma her zaman, İşlem önerme yalnız mcp:write', () => {
    expect(scopeChips(['mcp:read']).map((c) => c.key)).toEqual(['mcp.scopes.read'])
    expect(scopeChips(['mcp:read', 'mcp:write']).map((c) => c.key)).toEqual(['mcp.scopes.read', 'mcp.scopes.write'])
  })
})

describe('S4 — ayar', () => {
  it('onay zorunluluğu: off → hayır; onay yok/eski/sürüm farkı → evet; güncel → hayır', () => {
    expect(consentRequired(mcpSettings({ consent: null }), 'off')).toBe(false)
    expect(consentRequired(mcpSettings({ consent: null }), 'read')).toBe(true)
    expect(consentRequired(mcpSettings({ consentOutdated: true }), 'readwrite')).toBe(true)
    expect(consentRequired(mcpSettings({ consent: { textVersion: 'mcp-v0', at: '2026-01-01T00:00:00Z', byEmail: 'a@b.invalid' } }), 'read')).toBe(true)
    expect(consentRequired(mcpSettings(), 'read')).toBe(false)
  })

  it('kayıt gövdesi: off sade; açıkken acceptTextVersion = currentText.textVersion; onaysız → null', () => {
    const s = mcpSettings({ access: 'off', consent: null })
    expect(settingsSaveBody(s, 'off', false)).toEqual({ access: 'off' })
    expect(settingsSaveBody(s, 'readwrite', false)).toBeNull()
    expect(settingsSaveBody(s, 'readwrite', true)).toEqual({ access: 'readwrite', acceptTextVersion: 'mcp-v1' })
    // onay güncelken de sürüm gönderilir (§4 "access≠off ise ZORUNLU")
    expect(settingsSaveBody(mcpSettings(), 'read', false)).toEqual({ access: 'read', acceptTextVersion: 'mcp-v1' })
  })

  it('erişim seçenekleri ve etiketleri', () => {
    expect(MCP_ACCESS_OPTIONS).toEqual(['off', 'read', 'readwrite'])
    expect(MCP_ACCESS_OPTIONS.map(accessLabelKey)).toEqual(['mcp.access.off', 'mcp.access.read', 'mcp.access.readwrite'])
  })
})

describe('hata kodu → ileti ve i18n', () => {
  const ROOT = resolve(__dirname, '..')

  function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
    )
  }
  const trKeys = new Set(flatten(MCP_MESSAGES.tr as unknown as Record<string, unknown>))
  const enKeys = new Set(flatten(MCP_MESSAGES.en as unknown as Record<string, unknown>))

  it('her §4 hata kodunun mcp.errors.<CODE> iletisi var; bilinmeyen → GENERIC', () => {
    for (const code of MCP_ERROR_CODES) {
      expect(mcpErrorKey(code)).toBe(`mcp.errors.${code}`)
      expect(trKeys.has(`mcp.errors.${code}`), code).toBe(true)
    }
    expect(mcpErrorKey('WHATEVER')).toBe('mcp.errors.GENERIC')
    expect(mcpErrorKey(undefined)).toBe('mcp.errors.GENERIC')
    expect(needsLogin({ status: 401 })).toBe(true)
    expect(needsLogin({ status: 401, code: 'REAUTH_REQUIRED' })).toBe(false)
  })

  it('tr ↔ en anahtar eşliği; boş metin yok; vue-i18n özel karakteri (|, @) yok', () => {
    expect([...trKeys].sort()).toEqual([...enKeys].sort())
    for (const lang of ['tr', 'en'] as const) {
      const walk = (o: any): string[] => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : walk(v)))
      for (const text of walk(MCP_MESSAGES[lang])) {
        expect(text.trim().length).toBeGreaterThan(0)
        expect(text).not.toMatch(/[|@]/)
      }
    }
  })

  it('MCP dosyalarında kullanılan her sabit mcp.* anahtarı tr/en sözlükte var', () => {
    const files = [
      'src/components/mcp/mcpModel.ts',
      ...readdirSync(resolve(ROOT, 'src/components/mcp')).filter((f) => f.endsWith('.vue')).map((f) => `src/components/mcp/${f}`),
      'src/views/unsecure/OAuthConsentView.vue',
      'src/views/unsecure/McpApprovalView.vue',
      'src/views/secure/user/ConnectedAppsView.vue',
      'src/views/secure/settings/AiConnectionView.vue',
    ]
    const used = new Set<string>()
    for (const f of files) {
      for (const m of readFileSync(resolve(ROOT, f), 'utf8').matchAll(/['"`](mcp\.[a-zA-Z]+(?:\.[a-zA-Z_]+)+)['"`]/g)) used.add(m[1])
    }
    expect(used.size).toBeGreaterThan(60)
    for (const k of used) {
      expect(trKeys.has(k), `tr: ${k}`).toBe(true)
      expect(enKeys.has(k), `en: ${k}`).toBe(true)
    }
    // Dinamik anahtar aileleri
    for (const r of ['owner', 'admin', 'member']) expect(trKeys.has(`mcp.roles.${r}`)).toBe(true)
    for (const a of MCP_ACCESS_OPTIONS) expect(trKeys.has(`mcp.access.${a}`)).toBe(true)
  })
})
