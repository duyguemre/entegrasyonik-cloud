/**
 * frontend/src/composables/useAccountSecurityApi.ts
 *
 * ADR-0015 B4-P0 (N1 "Hesabım ve güvenlik") — `docs/API_ACCOUNT_LIFECYCLE.md` #1 `changePassword`
 * (ÖZEL rota, kimlikli, member) + #5 `resendVerificationEmail` (jenerik RPC, member) + profil DTO'su
 * (`GET userContext`, `backend/src/api/profileDto.ts` beyaz listesi: email/name/surname/owner/
 * roleCode/emailVerified). Uydurma alan/uç YOK; oturumları ayrı ayrı listeleme/kapatma ucu
 * (`revokeMySessions`) backend'de bulunmadığı için burada da YOKTUR.
 */
import useRestApi from '@/composables/restapi'

/** `profileDto.ts` `PROFILE_FIELDS` + her zaman boolean `emailVerified` (yalnızca bu ekranın okuduğu alanlar). */
export interface AccountProfile {
  email?: string
  name?: string
  surname?: string
  username?: string
  owner?: boolean
  roleCode?: string
  emailVerified?: boolean
}

export function useAccountSecurityApi() {
  const restApi = useRestApi()
  return {
    getProfile: () => restApi.get('userContext') as Promise<any>,
    changePassword: (currentPassword: string, newPassword: string) =>
      restApi.post('AccountService/changePassword', { currentPassword, newPassword }) as Promise<any>,
    // Sözleşme: "İstek gövdesi boş".
    resendVerificationEmail: () => restApi.post('AccountService/resendVerificationEmail', {}) as Promise<any>,
  }
}

/**
 * Parola değişimi hata yanıtı → alan + i18n anahtarı (`accountSecurity.errors.*`). `WEAK_PASSWORD`
 * için sunucu mesajı (eksik kuralları Türkçe listeler — sözleşme) `raw` olarak olduğu gibi döner.
 * Saf; vitest'lenir (`tests/b4-account-privacy-stock.test.ts`).
 */
export function changePasswordError(status: number | undefined, code: string | undefined, serverMessage: string | undefined): {
  field: 'current' | 'new' | 'form'
  key: string
  raw?: string
} {
  switch (code) {
    case 'INVALID_CURRENT_PASSWORD':
      return { field: 'current', key: 'accountSecurity.errors.invalidCurrent' }
    case 'WEAK_PASSWORD':
      return typeof serverMessage === 'string' && serverMessage.trim()
        ? { field: 'new', key: 'accountSecurity.errors.weak', raw: serverMessage }
        : { field: 'new', key: 'accountSecurity.errors.weak' }
    case 'SAME_PASSWORD':
      return { field: 'new', key: 'accountSecurity.errors.same' }
    case 'INVALID_REQUEST':
      return { field: 'form', key: 'accountSecurity.errors.invalidRequest' }
    case 'CONFLICT':
      return { field: 'form', key: 'accountSecurity.errors.conflict' }
  }
  if (status === 429) return { field: 'form', key: 'accountSecurity.errors.rateLimited' }
  return { field: 'form', key: 'accountSecurity.errors.generic' }
}

/** Doğrulama e-postası yeniden gönderimi hatası → i18n anahtarı (`accountSecurity.verify.errors.*`). Saf. */
export function resendVerificationErrorKey(status: number | undefined, code: string | undefined): string {
  if (code === 'COOLDOWN' || status === 429) return 'accountSecurity.verify.errors.cooldown'
  if (code === 'EMAIL_NOT_CONFIGURED' || status === 503) return 'accountSecurity.verify.errors.notConfigured'
  if (code === 'MAIL_FAILED' || status === 502) return 'accountSecurity.verify.errors.mailFailed'
  return 'accountSecurity.verify.errors.generic'
}
