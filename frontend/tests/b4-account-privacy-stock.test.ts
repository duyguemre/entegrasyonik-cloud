// ADR-0015 B4-P0 — yeni ekranların (N1/N4/N5) saf yardımcıları. Sözleşmeler:
// docs/API_ACCOUNT_LIFECYCLE.md (N1), docs/API_TENANT_SURFACE.md §1 (N5) ve §5 (N4).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { apiCode, apiMessage, apiStatus, isApiError } from '../src/composables/apiErrors'
import { countCharacterClasses, passwordHints, passwordHintsMet, utf8ByteLength } from '../src/composables/passwordPolicyHints'
import { changePasswordError, resendVerificationErrorKey } from '../src/composables/useAccountSecurityApi'
import { SCREENS } from '../src/navigation/screens'

const tr = JSON.parse(readFileSync(fileURLToPath(new URL('../src/plugins/locales/tr.json', import.meta.url)), 'utf8'))
function trHas(key: string): boolean {
  return typeof key.split('.').reduce<any>((node, part) => (node == null ? undefined : node[part]), tr) === 'string'
}

const axiosError = (status: number, data: unknown) => ({ isAxiosError: true, response: { status, data } })

describe('apiErrors', () => {
  it('başarı gövdesini hata saymaz; axios hatasından durum/kod çıkarır', () => {
    expect(isApiError({ success: true })).toBe(false)
    expect(isApiError(axiosError(400, {}))).toBe(true)
    expect(apiStatus(axiosError(409, {}))).toBe(409)
    expect(apiCode(axiosError(400, { code: 'SAME_PASSWORD' }))).toBe('SAME_PASSWORD')
    expect(apiCode(axiosError(400, { code: '' }))).toBeUndefined()
  })

  it('sunucu mesajını yalnızca 400 doğrulama hatasında kullanır (5xx/403 → yedek metin)', () => {
    expect(apiMessage(axiosError(400, { error: 'Belirtilen pazaryeri bağlı değil.' }), 'yedek')).toBe('Belirtilen pazaryeri bağlı değil.')
    expect(apiMessage(axiosError(500, { error: 'TypeError: x is undefined' }), 'yedek')).toBe('yedek')
    expect(apiMessage(axiosError(403, { error: 'Forbidden' }), 'yedek')).toBe('yedek')
  })
})

describe('passwordPolicyHints (N1 — sözleşmenin istemcide denetlenebilen kısmı)', () => {
  it('karakter sınıflarını Unicode ile sayar (Türkçe harfler dahil)', () => {
    expect(countCharacterClasses('abc')).toBe(1)
    expect(countCharacterClasses('Çiğdem9!')).toBe(4)
    expect(countCharacterClasses('ŞİŞE')).toBe(1)
  })

  it('10-15 karakterde 3 sınıf ister, 16+ parola cümlesinde istemez', () => {
    expect(passwordHintsMet('kisaparola')).toBe(false) // 10 karakter, tek sınıf
    expect(passwordHintsMet('Kisaparola1')).toBe(true) // 3 sınıf
    expect(passwordHintsMet('uzun bir parola cumlesi')).toBe(true) // 16+
    expect(passwordHintsMet('Ab1!')).toBe(false) // < 10
  })

  it('72 bayt sınırını UTF-8 ile ölçer (Türkçe karakter 2 bayt)', () => {
    expect(utf8ByteLength('ş')).toBe(2)
    const tooLong = 'ş'.repeat(37) // 74 bayt
    expect(passwordHints(tooLong).find((h) => h.id === 'bytes')?.met).toBe(false)
    expect(passwordHints('').find((h) => h.id === 'bytes')?.met).toBe(false)
  })

  it('her ipucunun i18n anahtarı tr.json\'da vardır', () => {
    for (const h of passwordHints('x')) expect(trHas(h.labelKey), h.labelKey).toBe(true)
  })
})

describe('changePasswordError / resendVerificationErrorKey (N1)', () => {
  it('sözleşmedeki her kodu doğru alana eşler', () => {
    expect(changePasswordError(400, 'INVALID_CURRENT_PASSWORD', 'x')).toEqual({ field: 'current', key: 'accountSecurity.errors.invalidCurrent' })
    expect(changePasswordError(400, 'SAME_PASSWORD', undefined).field).toBe('new')
    expect(changePasswordError(400, 'INVALID_REQUEST', undefined).field).toBe('form')
    expect(changePasswordError(409, 'CONFLICT', undefined).key).toBe('accountSecurity.errors.conflict')
    expect(changePasswordError(429, undefined, 'Too many requests').key).toBe('accountSecurity.errors.rateLimited')
    expect(changePasswordError(500, undefined, 'stack').key).toBe('accountSecurity.errors.generic')
  })

  it('WEAK_PASSWORD sunucu mesajını (kuralları listeler) olduğu gibi taşır; yoksa yedek anahtar', () => {
    expect(changePasswordError(400, 'WEAK_PASSWORD', 'En az 10 karakter olmalı.')).toEqual({ field: 'new', key: 'accountSecurity.errors.weak', raw: 'En az 10 karakter olmalı.' })
    expect(changePasswordError(400, 'WEAK_PASSWORD', '  ').raw).toBeUndefined()
  })

  it('doğrulama e-postası hata kodları (COOLDOWN/MAIL_FAILED/EMAIL_NOT_CONFIGURED)', () => {
    expect(resendVerificationErrorKey(429, 'COOLDOWN')).toBe('accountSecurity.verify.errors.cooldown')
    expect(resendVerificationErrorKey(502, 'MAIL_FAILED')).toBe('accountSecurity.verify.errors.mailFailed')
    expect(resendVerificationErrorKey(503, 'EMAIL_NOT_CONFIGURED')).toBe('accountSecurity.verify.errors.notConfigured')
    expect(resendVerificationErrorKey(undefined, undefined)).toBe('accountSecurity.verify.errors.generic')
  })

  it('döndürülen tüm anahtarlar tr.json\'da vardır', () => {
    const keys = [
      ...['INVALID_CURRENT_PASSWORD', 'WEAK_PASSWORD', 'SAME_PASSWORD', 'INVALID_REQUEST', 'CONFLICT'].map((c) => changePasswordError(400, c, undefined).key),
      changePasswordError(429, undefined, undefined).key,
      changePasswordError(500, undefined, undefined).key,
      resendVerificationErrorKey(429, 'COOLDOWN'),
      resendVerificationErrorKey(502, 'MAIL_FAILED'),
      resendVerificationErrorKey(503, 'EMAIL_NOT_CONFIGURED'),
      resendVerificationErrorKey(undefined, undefined),
    ]
    for (const k of keys) expect(trHas(k), k).toBe(true)
  })
})

describe('B4-P0 ekran kayıtları (screens.ts — yalnızca ekleme)', () => {
  it('yeni ekranların menü başlık anahtarları tr.json\'da vardır ve urlParams taşımaz', () => {
    const b4 = SCREENS.filter((s) => ['AccountSecurityView'].includes(s.key))
    expect(b4.length).toBe(1)
    for (const s of b4) {
      expect(trHas(s.titleKey!), s.titleKey).toBe(true)
      expect(s.urlParams).toBeUndefined()
    }
  })
})
