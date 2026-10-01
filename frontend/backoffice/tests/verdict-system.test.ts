import { describe, expect, it, vi } from 'vitest'
import type { ConfigRevision, PlatformAdmin } from '@bo/api/contract'
import { adminsVerdict, matchesFilter, INVITE_TTL_MS, type AdminsVerdictInput } from '@bo/views/admins/adminsVerdict'
import { settingsVerdict, MAINTENANCE_LONG_MS, type SettingsVerdictInput } from '@bo/views/settings/settingsVerdict'
import { otopilotVerdict } from '@bo/views/otopilot/otopilotVerdict'

const NOW = Date.parse('2026-10-01T12:00:00Z')
const H = 3_600_000
const D = 24 * H
const iso = (ms: number) => new Date(ms).toISOString()
const admin = (o: Partial<PlatformAdmin> = {}): PlatformAdmin => ({
  sub: 'a'.repeat(24), email: 'a@ornek.test', name: 'A', surname: 'B', status: 'active', mfaEnabled: true, lastLoginAt: iso(NOW - H), locked: false, createdAt: iso(NOW - 200 * D), ...o,
})
const INVITE_TO = { query: { davet: '1' } }
const aIn = (items: PlatformAdmin[] | null, o: Partial<AdminsVerdictInput> = {}): AdminsVerdictInput => ({
  items, failed: items === null, now: NOW, retry: vi.fn(), filterTo: (f) => ({ query: { filtre: f } }), inviteTo: INVITE_TO, invite: vi.fn(), ...o,
})
/** K51 güncelleme 2: her madde bağlantılı (okunamadı hariç) ve etki + öneri taşır. */
function expectTriage(v: { attention: Array<{ to?: unknown; impact?: string; advice?: string; source?: string; onSelect?: unknown }> }) {
  for (const a of v.attention) {
    if (a.source || (a.onSelect && !a.to)) continue
    expect(a.to).toBeTruthy()
    expect(a.impact).toBeTruthy()
    expect(a.advice).toBeTruthy()
    expect(a.onSelect).toBeUndefined()
  }
}
const two = [admin({ sub: '1' }), admin({ sub: '2', email: 'b@ornek.test' })]

describe('yöneticiler hükmü', () => {
  it('sakin: iki adım açık, davet yok', () => {
    const v = adminsVerdict(aIn(two))
    expect(v.tone).toBe('success')
    expect(v.summary).toContain('2 etkin yönetici')
    expect(v.attention).toEqual([])
    expect(v.actions.map((a) => a.id)).toEqual(['invite'])
    expect(v.actions[0]).toMatchObject({ guarded: true })
    expect(v.checks?.length).toBeGreaterThan(0)
  })
  it('iki adımsız etkin yönetici kırmızı ve süzgece bağlı', () => {
    const v = adminsVerdict(aIn([...two, admin({ sub: '3', mfaEnabled: false })]))
    expect(v.tone).toBe('error')
    expect(v.attention[0].id).toBe('no-mfa')
    expect(v.attention[0].to).toEqual({ query: { filtre: 'nomfa' } })
    expect(v.actions[0]).toMatchObject({ id: 'review-mfa', to: { query: { filtre: 'nomfa' } } })
    expectTriage(v)
  })
  it('tek etkin yönetici sarı, davete bağlı', () => {
    const v = adminsVerdict(aIn([admin()]))
    expect(v.tone).toBe('warning')
    expect(v.attention.find((a) => a.id === 'single-admin')!.to).toBe(INVITE_TO)
    expectTriage(v)
  })
  it('etkin yönetici yok kırmızı', () => {
    expect(adminsVerdict(aIn([admin({ status: 'disabled' })])).attention[0]).toMatchObject({ id: 'no-active', tone: 'error' })
  })
  it('süresi dolan ve dolmak üzere olan davetler; yıkıcı eylem yalnız bağlantı', () => {
    const expired = admin({ sub: '9', status: 'invited', mfaEnabled: false, lastLoginAt: null, createdAt: iso(NOW - INVITE_TTL_MS - H) })
    const expiring = admin({ sub: '8', status: 'invited', mfaEnabled: false, lastLoginAt: null, createdAt: iso(NOW - INVITE_TTL_MS + 2 * H) })
    const v = adminsVerdict(aIn([...two, expired, expiring]))
    expect(v.attention.map((a) => a.id)).toEqual(['invite-expired', 'invite-expiring'])
    const act = v.actions.find((a) => a.id === 'revoke-expired')!
    expect(act).toMatchObject({ danger: true, to: { query: { filtre: 'invites' } } })
    expect(act.onSelect).toBeUndefined()
    expectTriage(v)
  })
  it('kilitli hesap sarı; metin "Kilitli" sözcüğünü tek başına üretmez', () => {
    const v = adminsVerdict(aIn([...two, admin({ sub: '5', locked: true })]))
    expect(v.attention[0].id).toBe('locked')
    expect(v.attention[0].title).not.toMatch(/kilitli/i)
    expectTriage(v)
  })
  it('uzun süredir girmeyen hesap yalnız bilgi; ton sakin kalır', () => {
    const v = adminsVerdict(aIn([...two, admin({ sub: '6', lastLoginAt: iso(NOW - 100 * D) })]))
    expect(v.tone).toBe('success')
    expect(v.attention[0]).toMatchObject({ id: 'idle', tone: 'info' })
    expectTriage(v)
    expect(matchesFilter(admin({ lastLoginAt: iso(NOW - 10 * D) }), 'idle', NOW)).toBe(false)
  })
  it('okunamadı: sarı, tekrar dene, "sağlıklı" denmez', () => {
    const retry = vi.fn()
    const v = adminsVerdict(aIn(null, { retry }))
    expect(v.tone).toBe('warning')
    expect(v.summary).toContain('okunamadı')
    v.attention[0].onSelect!()
    expect(retry).toHaveBeenCalled()
  })
})

const rev = (o: Partial<ConfigRevision>): ConfigRevision => ({ version: 2, status: 'published', createdBy: null, createdAt: iso(NOW), publishedBy: null, publishedAt: iso(NOW), reason: null, diff: null, origin: null, approvedBy: null, ...o })
const sIn = (o: Partial<SettingsVerdictInput> = {}): SettingsVerdictInput => ({
  data: { published: 3, values: { 'maintenance.enabled': { value: false } }, history: [rev({ version: 3 }), rev({ version: 2 })] },
  hasDraft: false, draftCount: null, unsavedCount: 0, now: NOW,
  retry: vi.fn(), to: { maintenance: { hash: '#bakim' }, draft: { hash: '#taslak' }, history: { hash: '#gecmis' }, settings: { hash: '#ayarlar' } }, closeMaintenance: vi.fn(), publish: vi.fn(), ...o,
})
const maintOn = (sinceMs: number) => ({
  published: 4,
  values: { 'maintenance.enabled': { value: true } },
  history: [rev({ version: 4, publishedAt: iso(NOW - sinceMs), diff: [{ key: 'maintenance.enabled', from: false, to: true, danger: 'caution' }] })],
})

describe('platform ayarları hükmü', () => {
  it('sakin: bakım kapalı, taslak yok; geçmiş eylemi var', () => {
    const v = settingsVerdict(sIn())
    expect(v.tone).toBe('success')
    expect(v.summary).toContain('sürüm 3')
    expect(v.actions.map((a) => a.id)).toEqual(['history'])
  })
  it('bakım yeni açıldı: sarı; pencereyi aştı: kırmızı; kapatma eylemi guarded', () => {
    const closeMaintenance = vi.fn()
    const warn = settingsVerdict(sIn({ data: maintOn(30 * 60_000), closeMaintenance }))
    expect(warn.tone).toBe('warning')
    const err = settingsVerdict(sIn({ data: maintOn(MAINTENANCE_LONG_MS + H), closeMaintenance }))
    expect(err.tone).toBe('error')
    const act = err.actions.find((a) => a.id === 'close-maintenance')!
    expect(act.guarded).toBe(true)
    act.onSelect!()
    expect(closeMaintenance).toHaveBeenCalled()
    expect(err.attention[0].to).toEqual({ hash: '#bakim' })
    expect(err.actions[0].id).toBe('close-maintenance')
    expectTriage(err)
  })
  it('taslak: sarı; yayınla guarded, at danger; bağlantılar', () => {
    const publish = vi.fn()
    const v = settingsVerdict(sIn({ hasDraft: true, draftCount: 2, publish }))
    expect(v.tone).toBe('warning')
    expect(v.attention[0].title).toContain('2 ayar')
    expect(v.attention[0].to).toEqual({ hash: '#taslak' })
    expectTriage(v)
    expect(v.actions[0].id).toBe('publish')
    const pub = v.actions.find((a) => a.id === 'publish')!
    expect(pub.guarded).toBe(true)
    pub.onSelect!()
    expect(publish).toHaveBeenCalled()
    expect(v.actions.find((a) => a.id === 'discard')).toMatchObject({ danger: true, to: { hash: '#taslak' } })
  })
  it('kaydedilmemiş yerel değişiklik yalnız bilgi', () => {
    const v = settingsVerdict(sIn({ unsavedCount: 1 }))
    expect(v.tone).toBe('success')
    expect(v.attention[0]).toMatchObject({ id: 'unsaved', tone: 'info', to: { hash: '#ayarlar' } })
    expectTriage(v)
  })
  it('okunamadı sarı, yenilenemedi (stale) sarı', () => {
    const retry = vi.fn()
    const v = settingsVerdict(sIn({ data: null, retry }))
    expect(v.summary).toContain('okunamadı')
    v.attention[0].onSelect!()
    expect(retry).toHaveBeenCalled()
    expect(settingsVerdict(sIn({ stale: true })).attention[0].title).toContain('yenilenemedi')
  })
})

describe('otopilot hükmü', () => {
  const retry = vi.fn()
  it('yükleniyor → null', () => expect(otopilotVerdict({ status: 'loading', retry })).toBeNull())
  it('yapılandırılmış: sakin', () => {
    const v = otopilotVerdict({ status: 'idle', retry })!
    expect(v.tone).toBe('success')
    expect(v.attention).toEqual([])
    expect(v.checks?.length).toBeGreaterThan(0)
  })
  it('anahtar yok: sarı, ayara bağlı', () => {
    const v = otopilotVerdict({ status: 'setup-required', retry })!
    expect(v.tone).toBe('warning')
    expect(v.attention[0].to).toEqual({ path: '/sistem/otopilot' })
    expect(v.attention[0].impact && v.attention[0].advice).toBeTruthy()
    expect(v.actions[0].to).toEqual({ path: '/sistem/otopilot' })
  })
  it('anahtar reddedildi: sarı, ayara bağlı', () => {
    const v = otopilotVerdict({ status: 'error', errorCode: 'LLM_KEY_INVALID', retry })!
    expect(v.tone).toBe('warning')
    expect(v.attention[0].to).toEqual({ path: '/sistem/otopilot' })
  })
  it('bakım: bilgi; durum okunamadı: sarı tekrar dene', () => {
    expect(otopilotVerdict({ status: 'unavailable', unavailableReason: 'MAINTENANCE', retry })!.tone).toBe('info')
    const v = otopilotVerdict({ status: 'unavailable', unavailableReason: 'LOAD_FAILED', retry })!
    v.attention[0].onSelect!()
    expect(retry).toHaveBeenCalled()
  })
})
