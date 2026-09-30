/** Aşama 4 sahte uç alanları (motor, abonelik/yaşam döngüsü, entegrasyon/altyapı, platform/yöneticiler). */
import { createBillingMock } from './billing'
import { UNHANDLED, type MockCtx, type MockDomain } from './context'
import { createEngineMock } from './engine'
import { createInfraMock } from './infra'
import { createPlatformMock, setMockFeatureFlags } from './platform'

export { UNHANDLED, type MockCtx }
export { assertImpersonatable } from './billing'
export { publicConfigOf, setMockFeatureFlags, MOCK_INVITE_TOKEN } from './platform'

export function createP2Domains(t0: number, selfEmail: string) {
  setMockFeatureFlags(false)
  const billing = createBillingMock(t0)
  const platform = createPlatformMock(t0, selfEmail)
  // Sıra önemli: `_platform` hedefli yapılandırma çağrıları önce platform'a, diğer hedefler infra'ya düşer.
  const domains: MockDomain[] = [createEngineMock(t0), billing, platform, createInfraMock(t0)]
  return {
    billing,
    platform,
    handle(op: string, body: Record<string, unknown>, ctx: MockCtx) {
      for (const d of domains) {
        const res = d.handle(op, body, ctx)
        if (res !== UNHANDLED) return res
      }
      return UNHANDLED
    },
  }
}
