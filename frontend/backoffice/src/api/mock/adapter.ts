/**
 * Sahte API'yi axios'a bağlayan adapter — ağ yok, servis çalışanı yok. Gerçek istemci kodu (client.ts) AYNEN çalışır:
 * hata yanıtları gerçek sunucudaki gibi `AxiosError` + `response` ile döner.
 */
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { MockAdminServer } from './server'

export interface MockAdapterOptions {
  server: MockAdminServer
  /** Gecikme aralığı (ms) — iskelet/yükleme durumları görünsün; testlerde 0. */
  latency?: [number, number]
}

export function createMockAdapter({ server, latency = [0, 0] }: MockAdapterOptions): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    const [min, max] = latency
    if (max > 0) await new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)))
    const method = (config.method ?? 'get').toUpperCase() === 'POST' ? 'POST' : 'GET'
    const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) : config.data
    const res = server.handle(method, `${config.baseURL ?? ''}${config.url ?? ''}`, body)
    const response = { data: res.data, status: res.status, statusText: String(res.status), headers: new AxiosHeaders(res.headers), config, request: {} }
    const valid = config.validateStatus ? config.validateStatus(res.status) : res.status >= 200 && res.status < 300
    if (valid) return response
    throw new AxiosError(`Request failed with status code ${res.status}`, res.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST, config, {}, response)
  }
}
