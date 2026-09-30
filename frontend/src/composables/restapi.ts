import axios from 'axios'
import { ref } from 'vue'
import { useLoadingStore } from '@/stores/loadingStore'
import logger from '@/composables/logger'
import { apiBaseUrl, imageBaseUrl } from '@/config/env'
import { requestReauth } from '@/composables/reauth'
axios.defaults.withCredentials = true

// Çağrı başına seçenek: `skipSessionRedirect` → bu isteğin 401'i genel "oturum düştü → /login" yakalayıcısını
// TETİKLEMEZ; hata her zamanki gibi çağırana `resolve` edilir. YALNIZCA 401'i oturum dışı bir anlamla döndüren
// uçlar içindir (ör. `TenantDataService/requestDeletion`: yanlış parola = 401 'Parola doğrulanamadı.').
declare module 'axios' {
  interface AxiosRequestConfig {
    skipSessionRedirect?: boolean
    /** REAUTH_REQUIRED yakalayıcısını atla (yalnız `AccountService/reauthenticate` çağrısının kendisi). */
    skipReauth?: boolean
    /** İç sayaçlar — yakalayıcının otomatik yinelemeleri (kullanıcı eylemi değil). */
    __reauthRetried?: boolean
    __idemAttempts?: number
  }
}

export interface PostOptions {
  skipSessionRedirect?: boolean
  /**
   * Faz 3 / C2a — Idempotency-Key (docs/cloud-contracts/API_IDEMPOTENCY.md). `true`: listede olmasa da anahtar
   * gönder. Listedeki RPC'ler (`IDEMPOTENT_RPCS`) için anahtar zaten her çağrıda üretilir.
   */
  idempotent?: boolean
  /**
   * Aynı KULLANICI EYLEMİNİN yeniden denemesi için sabit anahtar (bkz. `createIdempotentAction`). Verilmezse çağrı
   * başına yeni `crypto.randomUUID()` — bu da tek düğme basışı = tek çağrı olan yerlerde doğru davranıştır.
   */
  idempotencyKey?: string
}

// ── Idempotency-Key (ADR-0030 X3) — TEK yer ────────────────────────────────────────────────────────────────────
// Kapsanan RPC'ler: sözleşmedeki liste (backend yetenek kaydında `external:true` ve `effect !== 'read'`). Diğer
// RPC'lerde başlık gönderilmez (sunucu zaten yok sayar). Liste değişirse YALNIZ burası değişir.
export const IDEMPOTENT_RPCS: ReadonlySet<string> = new Set([
  'OrderService/approveOrder', 'OrderService/bulkApproveOrder', 'OrderService/cancelOrder', 'OrderService/bulkCancelOrder',
  'ClaimService/approveClaim', 'ClaimService/bulkApproveClaim', 'ClaimService/rejectClaim',
  'InvoiceService/createInvoice', 'InvoiceService/bulkCreateInvoice', 'InvoiceService/createManualInvoice', 'InvoiceService/resolveAndReissueInvoice',
  'ShipmentService/createShipment', 'ShipmentService/bulkCreateShipment',
  'MessageService/replyMessage',
  'IntegrationService/batchCreator', 'IntegrationService/requestFetchFromPlatform', 'IntegrationService/retrieveAndSetExternalToken',
  'BillingService/startCheckout', 'AccountService/resendVerificationEmail',
  'UserService/inviteUser', 'UserService/resendInvitation', 'UserService/initiateOwnershipTransfer',
])

export const IDEMPOTENCY_HEADER = 'Idempotency-Key'

/** Anahtar biçimi (sözleşme): 8-128 karakter, `A-Za-z0-9._:-`. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/

export function isIdempotentRpc(service: string): boolean {
  return IDEMPOTENT_RPCS.has(service.replace(/^\/+/, '').split('?')[0])
}

export function newIdempotencyKey(): string {
  const c: Crypto | undefined = (globalThis as any).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Eski ortam yedeği (güvenli bağlam dışı http): yine 128 bit rastgele, UUID v4 biçiminde.
  const b = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(b)
  else b.forEach((_, i) => (b[i] = Math.floor(Math.random() * 256)))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Gövde parmak izi: anahtar sırası farkı "farklı gövde" sayılmasın. */
function fingerprint(body: unknown): string {
  const norm = (v: any): any =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : v
  try {
    return JSON.stringify(norm(body ?? null))
  } catch {
    return String(Math.random())
  }
}

export interface IdempotentAction {
  /** Bu gövde için anahtar: son denemeyle AYNI gövde → aynı anahtar (yeniden deneme); farklı gövde → yeni anahtar. */
  keyFor(body: unknown): string
  /** İşlem başarıyla bittiğinde çağır: sonraki basış yeni bir kullanıcı eylemidir. */
  reset(): void
}

/**
 * Sözleşme FE kuralları 1-2: anahtar KULLANICI EYLEMİ başına bir kez üretilir; aynı eylemin yeniden denemesi (zaman
 * aşımı, ağ hatası, hata sonrası "Tekrar dene") aynı anahtarı kullanır; kullanıcı gövdeyi değiştirirse yeni anahtar.
 *   const action = createIdempotentAction()
 *   restApi.post('UserService/inviteUser', body, true, undefined, { idempotencyKey: action.keyFor(body) })
 */
export function createIdempotentAction(): IdempotentAction {
  let key: string | null = null
  let print: string | null = null
  return {
    keyFor(body: unknown) {
      const p = fingerprint(body)
      if (!key || p !== print) {
        key = newIdempotencyKey()
        print = p
      }
      return key
    },
    reset() {
      key = null
      print = null
    },
  }
}

/** `postService` için axios yapılandırması (yalnız gerektiğinde nesne üretir — eski çağrı biçimi korunur). */
export function buildPostConfig(service: string, options?: PostOptions): Record<string, any> | undefined {
  const config: Record<string, any> = {}
  if (options?.skipSessionRedirect) config.skipSessionRedirect = true
  const wantsKey = !!options?.idempotencyKey || options?.idempotent === true || isIdempotentRpc(service)
  if (wantsKey) {
    const key = options?.idempotencyKey && IDEMPOTENCY_KEY_PATTERN.test(options.idempotencyKey) ? options.idempotencyKey : newIdempotencyKey()
    config.headers = { [IDEMPOTENCY_HEADER]: key }
  }
  return Object.keys(config).length ? config : undefined
}

// 409 IDEMPOTENCY_IN_PROGRESS "hata değil, işleniyor"dur (sözleşme FE kuralı 4): kullanıcıya gösterilmez, kısa
// gecikmeyle AYNI anahtarla (aynı yapılandırma) yeniden sorulur. Tavan aşılırsa hata çağırana döner (ileti "işlem sürüyor").
export const IDEMPOTENCY_RETRY_DELAYS_MS = [600, 1200, 2400]
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ADR-0017 Karar 1.6/1.8 — hata yakalayıcılarda ham axios hata nesnesini (istek
// yapılandırması dahil) LOGLAMAK yerine yalnızca teşhis için gerekli, güvenli alanları
// çıkarır; backend'in yanıt başlığındaki `X-Request-Id`'yi (varsa) bağlar. Mevcut
// `resolve(error)` sözleşmesi DEĞİŞMEZ (bkz. çağıranlar) — bu yalnızca loglama kanalıdır.
function logApiError(action: 'get' | 'post', service: string, error: any) {
  const status = error?.response?.status
  const requestId = error?.response?.headers?.['x-request-id'] ?? error?.response?.headers?.['X-Request-Id']
  logger.error(`API isteği başarısız (${action})`, {
    module: 'restapi',
    op: action,
    service,
    status,
    requestId,
    message: error?.message,
  })
}

// ADR-0001 adım 8: oturum süresi dolduğunda / iptal edildiğinde (401) kullanıcıyı giriş sayfasına yönlendir.
// Giriş/kayıt/çıkış/kimlik-kontrol uçları 401'i normal akışın parçası olarak döndürür; bunlar hariç tutulur.
const AUTH_FLOW_PATHS = ['SecurityService/login', 'SecurityService/register', 'SecurityService/logout', 'checkAuthentication']
let redirectingToLogin = false
axios.interceptors.response.use(
  response => response,
  async error => {
    const url: string = error?.config?.url ?? ''
    const config = error?.config
    const status = error?.response?.status
    const code = error?.response?.data?.code

    // Faz 3 / C2a — adım-yükseltme: 401 REAUTH_REQUIRED oturum düşmesi DEĞİLDİR (girişe yönlendirilmez). Tek
    // uygulama geneli diyalog açılır; doğrulanırsa istek AYNI yapılandırmayla (aynı Idempotency-Key) BİR kez yinelenir.
    if (status === 401 && code === 'REAUTH_REQUIRED' && config && !config.skipReauth && !config.__reauthRetried) {
      const ok = await requestReauth()
      if (ok) {
        config.__reauthRetried = true
        return axios.request(config)
      }
      error.reauthCancelled = true
      return Promise.reject(error)
    }
    if (status === 401 && code === 'REAUTH_REQUIRED') return Promise.reject(error)

    if (status === 409 && code === 'IDEMPOTENCY_IN_PROGRESS' && config) {
      const attempt = config.__idemAttempts ?? 0
      const hasKey = !!(config.headers?.[IDEMPOTENCY_HEADER] ?? config.headers?.get?.(IDEMPOTENCY_HEADER))
      if (hasKey && attempt < IDEMPOTENCY_RETRY_DELAYS_MS.length) {
        config.__idemAttempts = attempt + 1
        await wait(IDEMPOTENCY_RETRY_DELAYS_MS[attempt])
        return axios.request(config)
      }
    }

    if (error?.response?.status === 401 && !error?.config?.skipSessionRedirect && !AUTH_FLOW_PATHS.some(p => url.includes(p)) && !redirectingToLogin) {
      redirectingToLogin = true
      try {
        // Dinamik import: router -> view -> restapi döngüsel bağımlılığını önler
        const { default: router } = await import('@/router')
        // ADR-0014 S4b: ilk gezinme bitmeden (App.vue `userContext` isteği kimliksiz 401 dönerken router hâlâ başlangıç
        // konumunda) bu blok `/login?reason=session-expired`'a yarışan İKİNCİ bir `push` üretip site devri
        // (`/login?mode=register&plan=…`) ve `redirect` sorgusunu EZİYORDU (bkz. e2e navigation.spec.ts notu).
        // İlk gezinmenin (guard yönlendirmesi dahil) bitmesi beklenir. `/login` (mevcut) ve `requiresAuth:false`
        // işaretli DİĞER kimliksiz ekranlar (ADR-0015 Karar 4 — `/reset-password` vb.) buradan asla uzaklaştırılmaz:
        // App.vue HER rotada `fetchUserContext()` çağırır; kimliksiz kullanıcı için bu her zaman 401'dir, aksi halde
        // e-postadaki sıfırlama bağlantısını açan (oturumu OLMAYAN, bu yüzden bu 401'i normal karşılayan) kullanıcı
        // formu hiç görmeden `/login`'e geri fırlatılırdı.
        await router.isReady()
        const current = router.currentRoute.value
        if (current.path !== '/login' && current.meta?.requiresAuth !== false) {
          await router.push({ path: '/login', query: { reason: 'session-expired' } })
        }
      } finally {
        setTimeout(() => { redirectingToLogin = false }, 1000)
      }
    }
    return Promise.reject(error) // mevcut çağıranlar hatayı yakalayıp resolve(error) yapmaya devam eder
  }
)

// R4 (docs/FRONTEND_CODE_AUDIT.md H-02): taban adresler artık config/env.ts'ten (env yoksa AYNI
// varsayılan değere düşer — davranış değişmez). `baseImageUrl` artık `baseUrl`'den AYRI bir env
// değişkenine (`VITE_IMAGE_BASE_URL`) bağlanabilir (yapılandırılmazsa AYNI şekilde `baseUrl`'e düşer).
// Eskiden burada 6 farklı ortam (app.entegrasyonik.com/railway/heroku/render/192.168.1.111) için
// yorum-içi ölü adres bloğu vardı (H-02c) — kaldırıldı; bkz. .env.example / .env (git-ignored).
const baseUrl = apiBaseUrl
const baseImageUrl = imageBaseUrl

const endpoints: any = {
  MenuService: {
    url: 'MenuService',
    type: 'GET'
  },
  IntegrationService: {
    url: 'IntegrationService',
    type: 'POST'
  },
  RegisterService: {
    url: 'RegisterService',
    type: 'POST'
  },

}
const getService = async (service: string) => {
  if (!service) {
    logger.warn('restApi.get: boş servis adıyla çağrıldı', { module: 'restapi', op: 'get' })
    return undefined
  }
  return new Promise((resolve: any, reject: any) => {
    axios.get(baseUrl + service)
      .then(response => {
        if (response)
          resolve(response.data)
        else reject()
      })
      .catch(error => {
        logApiError('get', service, error)
        resolve(error)
      })
  });
}


const getExternalService = async (externalUrl: string) => {
  if (!externalUrl) {
    logger.warn('restApi.getExternal: boş URL ile çağrıldı', { module: 'restapi', op: 'getExternal' })
    return undefined
  }
  return new Promise((resolve: any, reject: any) => {
    axios.get(externalUrl)
      .then(response => {
        if (response)
          resolve(response.data)
        else reject()
      })
      .catch(error => {
        logApiError('get', externalUrl, error)
        resolve(error)
      })
  });
}


const postService = async (service: string, data: any, options?: PostOptions) => {
  if (!service) {
    logger.warn('restApi.post: boş servis adıyla çağrıldı', { module: 'restapi', op: 'post' })
    return undefined
  }
  return new Promise((resolve: any) => {
    axios.post(baseUrl + service, data, buildPostConfig(service, options))
      .then(response => {
        resolve(response.data)
      })
      .catch(error => {
        logApiError('post', service, error)
        resolve(error)
      })
  });
}



const postImageServiceIdentityUpload = async (data: any) => {
  return new Promise((resolve: any) => {
    axios.post(baseImageUrl + 'uploadIdentity', data, {
      headers: {
        "Content-Type": "multipart/form-data"
      },
      withCredentials: true
    })
      .then(response => {
        resolve(response.data)
      })
      .catch(error => {
        logApiError('post', 'uploadIdentity', error)
        resolve(error)
      })
  });
}

const postImageServiceUpload = async (data: any) => {
  return new Promise((resolve: any) => {
    axios.post(baseImageUrl + 'upload', data, {
      headers: {
        "Content-Type": "multipart/form-data"
      },
      withCredentials: true // Include cookies and other credentials
    })
      .then(response => {
        resolve(response.data)
      })
      .catch(error => {
        logApiError('post', 'upload', error)
        resolve(error)
      })
  });
}

const postImageService = async (service: string, data: any) => {
  if (!service) {
    logger.warn('restApi.postImage: boş servis adıyla çağrıldı', { module: 'restapi', op: 'postImage' })
    return undefined
  }
  return new Promise((resolve: any) => {
    axios.post(baseImageUrl + service, data)
      .then(response => {
        resolve(response.data)
      })
      .catch(error => {
        logApiError('post', service, error)
        resolve(error)
      })
  });
}


export default function useRestApi() {
  const loadingStore = useLoadingStore()

  const processResponse = (resp: any, mode: boolean) => {
  }
  const get = async (service: string, mode: boolean = true, message?: string) => {
    const resp: any = await getService(service)
    processResponse(resp, mode)
    return resp
  }

  const getExternal = async (service: string, mode: boolean = true) => {
    const resp: any = await getExternalService(service)
    processResponse(resp, mode)
    return resp
  }

  const post = async (service: string, data: any, mode: boolean = true, message?: string, options?: PostOptions) => {
    const resp: any = await postService(service, data, options)
    processResponse(resp, mode)
    return resp
  }

  const getImage = (imageId: any) => {
    return baseImageUrl + 'getImage/' + imageId
  }

  const downloadImage = (imageId: any) => {
    return baseImageUrl + 'downloadImage/' + imageId
  }

  const postImage = async (service: string, data: any, mode: boolean = true, message?: string) => {
    const resp: any = await postImageService(service, data)
    processResponse(resp, mode)
    return resp
  }

  const postIdentityUpload = async (data: any, mode: boolean = true) => {
    const resp: any = await postImageServiceIdentityUpload(data)
    processResponse(resp, mode)
    return resp
  }

  return {
    get,
    getExternal,
    post,
    postImageServiceIdentityUpload,
    postIdentityUpload,
    getImage,
    downloadImage,
    postImage,
    // R4/T-01 (docs/FRONTEND_CODE_AUDIT.md): `postImageServiceUpload` tanımlıydı ama buradan hiç
    // dışa verilmiyordu -> 5 çağıran (`restApi.postImageUpload(formData)`, ürün/varyant görseli
    // yükleme) `TypeError: restApi.postImageUpload is not a function` alıyordu. Çağıran ad
    // (`postImageUpload`) DEĞİŞMEDİ — backend `operation-policy.test.ts` bu literal adı
    // `ImageApi/upload` olarak tarıyor (bkz. IMAGE_API_TARGETS: upload -> ImageService.addImages).
    postImageUpload: postImageServiceUpload
  };
}