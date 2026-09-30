/**
 * /admin-api istemcisi (ADR-0026 Karar 2 `createRpcClient` deseninin backoffice sürümü).
 *  - Kendi axios örneği; global `axios.defaults`/global interceptor YOK.
 *  - Kimlik yalnız `EK_ADMIN` HttpOnly çerezinde: `withCredentials: true`; token hiçbir depoya yazılmaz.
 *  - Hata zarfı (ERROR_CODES.md) → `AdminApiError { status, code, requestId }`.
 *  - `REAUTH_REQUIRED` → `requestReauth()` (step-up diyaloğu) → başarılıysa istek BİR kez yenilenir.
 *  - Oturum düştü (`401` ≠ REAUTH) → `onUnauthenticated`; TOTP eksik (`MFA_REQUIRED`) → `onMfaRequired`.
 *  - İstek/yanıt gövdesi loglanmaz (impersonation URL'i dahil).
 */
import axios, { type AxiosAdapter, type AxiosInstance } from 'axios'
import { AUTH_FLOW_OPS, type AdminOp, type ApiErrorBody, type ReqOf, type ResOf } from './contract'

export class AdminApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly fields?: ApiErrorBody['fields']
  /** Step-up diyaloğu kullanıcı tarafından kapatıldı. */
  cancelled = false

  constructor(status: number, body: Partial<ApiErrorBody>, requestId?: string) {
    super(body.error || 'Beklenmeyen bir hata oluştu.')
    this.name = 'AdminApiError'
    this.status = status
    this.code = body.code || (status === 0 ? 'NETWORK' : status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL')
    this.requestId = body.requestId ?? requestId
    this.fields = body.fields
  }
}

export interface AdminApiHooks {
  onUnauthenticated?: (error: AdminApiError) => void
  onMfaRequired?: (error: AdminApiError) => void
  /** Step-up diyaloğunu açar; kullanıcı doğrularsa true, vazgeçerse false. */
  requestReauth?: () => Promise<boolean>
}

export interface AdminApiOptions {
  /** /admin-api kökü (ör. `https://api.entegrasyonik.com/admin-api` ya da `/admin-api`). */
  baseURL: string
  /** Test/sahte API: axios adapter'ı. */
  adapter?: AxiosAdapter
}

export type ProbeResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: AdminApiError }

function toApiError(error: unknown): AdminApiError {
  if (error instanceof AdminApiError) return error
  if (axios.isAxiosError(error)) {
    const response = error.response
    const headers = (response?.headers ?? {}) as Record<string, string | undefined>
    const body = (response?.data && typeof response.data === 'object' ? response.data : {}) as Partial<ApiErrorBody>
    if (!response) return new AdminApiError(0, { error: 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.' })
    return new AdminApiError(response.status, body, headers['x-request-id'])
  }
  return new AdminApiError(0, { error: error instanceof Error ? error.message : String(error) })
}

/** `/admin-api` kökünden API host'unun kökü (`/health`, `/ready` bağlam yolunun dışında — ADR-0006 Karar 5). */
export function apiOriginOf(baseURL: string): string {
  return baseURL.replace(/\/admin-api\/?$/, '')
}

export function createAdminApi(options: AdminApiOptions) {
  const http: AxiosInstance = axios.create({
    baseURL: options.baseURL,
    adapter: options.adapter,
    withCredentials: true,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  })
  const hooks: AdminApiHooks = {}
  let reauthInFlight: Promise<boolean> | null = null

  /** Eşzamanlı birden çok REAUTH_REQUIRED tek diyalogda toplanır. */
  function reauthOnce(): Promise<boolean> {
    if (!hooks.requestReauth) return Promise.resolve(false)
    reauthInFlight ??= hooks.requestReauth().finally(() => (reauthInFlight = null))
    return reauthInFlight
  }

  async function call<K extends AdminOp>(op: K, body?: ReqOf<K>, retried = false): Promise<ResOf<K>> {
    try {
      const response = await http.post<ResOf<K>>(`/${op}`, body ?? {})
      return response.data
    } catch (raw) {
      const error = toApiError(raw)
      if (error.code === 'REAUTH_REQUIRED' && !retried) {
        if (await reauthOnce()) return call(op, body, true)
        error.cancelled = true
        throw error
      }
      if (!(AUTH_FLOW_OPS as readonly string[]).includes(op)) {
        if (error.code === 'MFA_REQUIRED') hooks.onMfaRequired?.(error)
        else if (error.status === 401 && error.code !== 'REAUTH_REQUIRED') hooks.onUnauthenticated?.(error)
      }
      throw error
    }
  }

  /** `/health` ve `/ready`: 503 de bir yanıttır (gövde bağımlılık durumunu taşır). */
  async function probe<T>(path: '/health' | '/ready'): Promise<ProbeResult<T>> {
    try {
      const response = await http.get<T>(apiOriginOf(options.baseURL) + path, {
        baseURL: '',
        withCredentials: false,
        validateStatus: (s) => s === 200 || s === 503,
      })
      return { ok: true, status: response.status, data: response.data }
    } catch (raw) {
      const error = toApiError(raw)
      return { ok: false, status: error.status, error }
    }
  }

  return {
    call,
    probe,
    setHooks(next: AdminApiHooks) {
      Object.assign(hooks, next)
    },
  }
}

export type AdminApi = ReturnType<typeof createAdminApi>
