/**
 * frontend/src/composables/googleSignIn.ts
 *
 * GL-FE2 — "Google ile devam et" (Google Identity Services, YETKİLENDİRME KODU popup akışı).
 *
 * Neden kod akışı: GIS'in resmi `renderButton` iframe'i kişiselleşip e-posta adresini gösteriyor ve biçimlendirilemiyor;
 * kendi düğmemizi (tasarım dili + resmi çok renkli "G" logosu) çizip tıklamada `oauth2.initCodeClient().requestCode()`
 * ile Google'ın hesap seçme penceresini açıyoruz. Dönen tek kullanımlık kod sunucuda tokene çevrilir.
 *
 * Sözleşme (backend `SecurityService`):
 *  - `GET  authConfig`    → `{ googleClientId: string | null }` — null ise düğme HİÇ görünmez.
 *  - `POST googleSignIn`  `{ code }` (ya da eski `{ credential }`) → `{ status: 'ok', ...login yanıtı }` |
 *    `{ status: 'signup_required', signupToken, profile }`.
 *
 * GIS betiği (`https://accounts.google.com/gsi/client`) yalnız giriş/kayıt ekranında ve clientId varsa DİNAMİK yüklenir;
 * yüklenemezse düğme sessizce gizlenir (giriş e-posta/parolayla sürer).
 *
 * Android kabuğunda (Capacitor WebView) ve Electron masaüstü uygulamasında GİZLİ: Google, gömülü tarayıcılarda OAuth'u
 * engeller ("disallowed_useragent"); kabuk ayrıca yalnız kendi adresinde gezinir, Google penceresi sistem tarayıcısına
 * düşer ve kimlik bilgisi uygulamaya geri dönmez.
 *
 * Saf yardımcılar (`googleSignInBlocked`, `loadGoogleIdentity`, `googleErrorMessage`) `window`/`document` enjekte
 * edilerek test edilir.
 */
import { ref, type Ref } from 'vue'
import { isNativeShell } from '@entegrasyonik/ui/native'
import { isDesktopShell } from '@/pwa/pwaState'
import useRestApi from '@/composables/restapi'

export const GSI_SRC = 'https://accounts.google.com/gsi/client'

/** `initCodeClient` geri çağrısı: başarıda `code`, Google tarafı hatada `error` (ör. `access_denied`). */
export interface GoogleCodeResponse { code?: string; error?: string; error_description?: string }
/** `error_callback`: pencere açılamadı/kapatıldı vb. (`popup_closed` kullanıcı vazgeçti demektir — sessiz). */
export interface GoogleClientError { type?: 'popup_closed' | 'popup_failed_to_open' | 'unknown' | string; message?: string }
export interface GoogleCodeClient { requestCode(): void }
export interface GoogleOAuth2 {
  initCodeClient(options: {
    client_id: string
    scope: string
    ux_mode?: 'popup' | 'redirect'
    select_account?: boolean
    callback: (r: GoogleCodeResponse) => void
    error_callback?: (e: GoogleClientError) => void
  }): GoogleCodeClient
}
export interface GoogleGlobal { accounts: { oauth2: GoogleOAuth2 } }
type GoogleWindow = Window & { google?: GoogleGlobal; entegrasyonikDesktop?: { isDesktop?: boolean } }

/** Gömülü tarayıcı (Android kabuğu / Electron) → Google OAuth çalışmaz, düğme gösterilmez. */
export function googleSignInBlocked(win: GoogleWindow = window as GoogleWindow): boolean {
  return isNativeShell(win) || isDesktopShell(win)
}

let loading: Promise<GoogleGlobal | null> | null = null

/** GIS betiğini bir kez yükler; zaman aşımı/ağ hatasında `null` (çağıran düğmeyi gizler). */
export function loadGoogleIdentity(win: GoogleWindow = window as GoogleWindow, doc: Document = document, timeoutMs = 8000): Promise<GoogleGlobal | null> {
  if (win.google?.accounts?.oauth2) return Promise.resolve(win.google)
  if (loading) return loading
  loading = new Promise<GoogleGlobal | null>((resolve) => {
    const done = (value: GoogleGlobal | null) => {
      clearTimeout(timer)
      if (!value) loading = null // sonraki ekran açılışında yeniden denenebilsin
      resolve(value)
    }
    const timer = setTimeout(() => done(null), timeoutMs)
    let script = doc.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    if (!script) {
      script = doc.createElement('script')
      script.src = GSI_SRC
      script.async = true
      script.defer = true
      doc.head.appendChild(script)
    }
    script.addEventListener('load', () => done(win.google?.accounts?.oauth2 ? win.google! : null), { once: true })
    script.addEventListener('error', () => done(null), { once: true })
  })
  return loading
}

/** Test yardımcısı: modül önbelleklerini sıfırlar. */
export function __resetGoogleSignIn() {
  loading = null
  clientIdCache = undefined
}

let clientIdCache: Promise<string | null> | undefined

/** `authConfig` bir kez sorulur; hata/boş → null (düğme yok). */
export function fetchGoogleClientId(get: (service: string) => Promise<any>): Promise<string | null> {
  if (!clientIdCache) {
    clientIdCache = get('SecurityService/authConfig')
      .then((resp: any) => (resp && typeof resp.googleClientId === 'string' && resp.googleClientId.trim() ? resp.googleClientId.trim() : null))
      .catch(() => null)
      .then((value) => {
        if (value === null) clientIdCache = undefined // geçici hata kalıcı "kapalı" sayılmasın
        return value
      })
  }
  return clientIdCache
}

const GOOGLE_ERRORS: Record<string, { title: string; text: string }> = {
  GOOGLE_TOKEN_INVALID: { title: 'Google ile giriş doğrulanamadı', text: 'Oturum süresi dolmuş olabilir. Lütfen tekrar deneyin.' },
  GOOGLE_EMAIL_UNVERIFIED: { title: 'E-posta adresi doğrulanmamış', text: 'Google hesabınızdaki e-posta adresini doğrulayıp tekrar deneyin.' },
  GOOGLE_ACCOUNT_MISMATCH: { title: 'Hesap eşleşmedi', text: 'Bu e-posta adresi başka bir Google hesabına bağlı. E-posta ve parolanızla giriş yapın.' },
  GOOGLE_DISABLED: { title: 'Google ile giriş kullanılamıyor', text: 'Şu an e-posta ve parolanızla giriş yapabilirsiniz.' },
  GOOGLE_POPUP_BLOCKED: { title: 'Google penceresi açılamadı', text: 'Tarayıcınız açılır pencereyi engellemiş olabilir; izin verip tekrar deneyin.' },
}

/** Google penceresi tarafındaki hata → kullanıcıya gösterilecek ileti; vazgeçme (`popup_closed`, `access_denied`) için null. */
export function googleClientErrorMessage(err: GoogleClientError | GoogleCodeResponse | undefined): { title: string; text: string } | null {
  const kind = (err as GoogleClientError)?.type ?? (err as GoogleCodeResponse)?.error ?? ''
  if (kind === 'popup_closed' || kind === 'access_denied') return null
  if (kind === 'popup_failed_to_open') return GOOGLE_ERRORS.GOOGLE_POPUP_BLOCKED
  return { title: 'Google ile giriş yapılamadı', text: 'Lütfen tekrar deneyin ya da e-posta ve parolanızla giriş yapın.' }
}

/** `restApi.post` hatada axios hata nesnesini döner; sunucunun hata kodu gövdede `code`/`error` alanındadır. */
export function googleErrorCode(resp: any): string {
  const data = resp?.response?.data
  const raw = data?.code ?? data?.error ?? data?.errorCode ?? resp?.code
  return typeof raw === 'string' ? raw : ''
}

export function googleErrorMessage(resp: any): { title: string; text: string } {
  const code = googleErrorCode(resp)
  if (GOOGLE_ERRORS[code]) return GOOGLE_ERRORS[code]
  const status = resp?.response?.status
  if (!resp?.response) return { title: 'Sunucuya ulaşılamadı', text: 'İnternet bağlantınızı kontrol edip tekrar deneyin.' }
  if (status === 429) return { title: 'Çok fazla deneme', text: 'Birkaç dakika sonra tekrar deneyin.' }
  return { title: 'Google ile giriş yapılamadı', text: 'Lütfen tekrar deneyin ya da e-posta ve parolanızla giriş yapın.' }
}

export const GOOGLE_SCOPE = 'openid email profile'

export interface UseGoogleSignIn {
  /** Düğme gösterilebilir mi (clientId var, betik yüklendi, gömülü tarayıcı değil). */
  enabled: Ref<boolean>
  /** Google penceresi açık / kod sunucuya gidiyor. */
  pending: Ref<boolean>
  /** Google'ın hesap seçme penceresini açar (yalnız kullanıcı tıklamasıyla çağrılmalı: açılır pencere engeli). */
  start: () => void
}

/**
 * @param onCode   Google'dan dönen tek kullanımlık yetkilendirme kodu (sunucuya `{ code }` gider). Promise dönerse
 *                 tamamlanana kadar `pending` açık kalır.
 * @param onError  Pencere/Google tarafı hatası (vazgeçme hariç) — ekran kendi uyarı kalıbıyla gösterir.
 */
export function useGoogleSignIn(
  onCode: (code: string) => unknown,
  onError?: (msg: { title: string; text: string }) => void,
  win: GoogleWindow = window as GoogleWindow,
): UseGoogleSignIn {
  const enabled = ref(false)
  const pending = ref(false)
  const restApi = useRestApi()
  let client: GoogleCodeClient | null = null

  const finish = () => { pending.value = false }
  const fail = (e: GoogleClientError | GoogleCodeResponse) => {
    finish()
    const msg = googleClientErrorMessage(e)
    if (msg && onError) onError(msg)
  }

  if (!googleSignInBlocked(win)) {
    void (async () => {
      const clientId = await fetchGoogleClientId((s) => restApi.get(s, false))
      if (!clientId) return
      const gsi = await loadGoogleIdentity(win)
      if (!gsi) return
      client = gsi.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: GOOGLE_SCOPE,
        ux_mode: 'popup',
        // Her seferinde hesap seçtir: paylaşılan bilgisayarda yanlış hesapla sessiz giriş olmasın.
        select_account: true,
        callback: async (r) => {
          if (!r?.code) { fail(r); return }
          try { await onCode(r.code) } finally { finish() }
        },
        error_callback: fail,
      })
      enabled.value = true
    })()
  }

  const start = () => {
    if (!client || pending.value) return
    pending.value = true
    try {
      client.requestCode()
    } catch {
      fail({ type: 'popup_failed_to_open' })
    }
  }

  return { enabled, pending, start }
}
