/**
 * Uygulamanın tek API örneği. Gerçek backend'e geçiş TEK env değişkeniyle: `VITE_ADMIN_API_BASE`.
 * Sahte API yalnız geliştirmede ve bu değişken boşken devrededir; üretim paketine girmez (import.meta.env.DEV
 * derleme anında `false` olur, dinamik import ağaçtan atılır).
 */
import { createAdminApi, type AdminApi } from './client'
import type { MockAdminServer } from './mock/server'

export const ADMIN_API_BASE = import.meta.env.VITE_ADMIN_API_BASE || '/admin-api'
export const USE_MOCK = import.meta.env.DEV && !import.meta.env.VITE_ADMIN_API_BASE

export let api: AdminApi = createAdminApi({ baseURL: ADMIN_API_BASE })

export async function initApi(): Promise<void> {
  if (!USE_MOCK) return
  const [mock, { createMockAdapter }] = await Promise.all([import('./mock/server'), import('./mock/adapter')])
  const server = new mock.MockAdminServer({ persist: sessionStorage })
  api = createAdminApi({ baseURL: ADMIN_API_BASE, adapter: createMockAdapter({ server, latency: (window as unknown as { __boMockLatency?: [number, number] }).__boMockLatency ?? [120, 380] }) })
  // Playwright ve el ile deneme için: window.__boMockLatency=[ms,ms] (addInitScript) → gecikme (açılış ekranı karesi); __boMock.expireReauth() → step-up diyaloğu, setDegraded(true) → Redis düşük.
  ;(window as unknown as { __boMock: MockAdminServer }).__boMock = server
}
