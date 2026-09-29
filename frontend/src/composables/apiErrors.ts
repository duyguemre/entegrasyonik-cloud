/**
 * frontend/src/composables/apiErrors.ts
 *
 * ADR-0015 B4-P0 — `restApi.get/post` başarısız olduğunda axios HATA nesnesini `resolve` eder
 * (bkz. `restapi.ts` "mevcut `resolve(error)` sözleşmesi"). Bu saf yardımcılar o nesneden
 * yalnızca sözleşmede BELGELİ alanları çıkarır: HTTP durumu, `code` (yalnızca hesap uçlarında,
 * `docs/API_ACCOUNT_LIFECYCLE.md` "Hata biçimi") ve sunucunun Türkçe `error` mesajı.
 * Ham hata/HTTP kodu/stack kullanıcıya GÖSTERİLMEZ (ADR-0015 Karar 6.1 `EkErrorState`).
 */

/** `restApi` sonucu bir axios HATASI mı (network/HTTP) — başarı gövdesiyle karıştırılmaz. */
export function isApiError(res: unknown): boolean {
  const r = res as any
  return Boolean(r?.isAxiosError || r?.response?.status)
}

export function apiStatus(res: unknown): number | undefined {
  const status = (res as any)?.response?.status
  return typeof status === 'number' ? status : undefined
}

/** Sözleşmedeki makine-okunur hata kodu (`INVALID_CURRENT_PASSWORD` vb.), yoksa `undefined`. */
export function apiCode(res: unknown): string | undefined {
  const code = (res as any)?.response?.data?.code
  return typeof code === 'string' && code.length > 0 ? code : undefined
}

/**
 * Sunucunun `{ error: "<Türkçe mesaj>" }` zarfındaki mesaj. Yalnızca 400 doğrulama hatalarında
 * gösterilebilir (API_TENANT_SURFACE §0: "mesaj alanı Türkçe, FE'de gösterilebilir"); 5xx ve
 * İngilizce çerçeve mesajları ("Forbidden", "Too many requests") için `fallback` kullanılır.
 */
export function apiMessage(res: unknown, fallback: string): string {
  const status = apiStatus(res)
  const msg = (res as any)?.response?.data?.error
  if (status === 400 && typeof msg === 'string' && msg.trim().length > 0) return msg
  return fallback
}
