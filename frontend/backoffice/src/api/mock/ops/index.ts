/** Aşama 4 sahte uç alanları (motor, abonelik/yaşam döngüsü, entegrasyon/altyapı, platform/yöneticiler, bildirimler). */
import { createBillingMock } from './billing'
import { createCompetitionMock } from './competition'
import { UNHANDLED, type MockCtx, type MockDomain } from './context'
import { createEngineMock } from './engine'
import { createInfraMock } from './infra'
import { createNotificationsMock } from './notifications'
import { createPlatformMock, setMockFeatureFlags } from './platform'
import { createUsageMock } from './usage'

export { UNHANDLED, type MockCtx }
export { assertImpersonatable } from './billing'
export { publicConfigOf, setMockFeatureFlags, MOCK_INVITE_TOKEN } from './platform'

export function createP2Domains(t0: number, selfEmail: string) {
  setMockFeatureFlags(false)
  const billing = createBillingMock(t0)
  const platform = createPlatformMock(t0, selfEmail)
  const notifications = createNotificationsMock(t0)
  const usage = createUsageMock(t0)
  // Sıra önemli: `_platform` hedefli yapılandırma çağrıları önce platform'a, diğer hedefler infra'ya düşer.
  const competition = createCompetitionMock(t0, billing, platform)
  const domains: MockDomain[] = [createEngineMock(t0), billing, competition, platform, notifications, createInfraMock(t0), usage]
  return {
    billing,
    platform,
    notifications,
    usage,
    handle(op: string, body: Record<string, unknown>, ctx: MockCtx) {
      for (const d of domains) {
        const res = d.handle(op, body, ctx)
        if (res !== UNHANDLED) return res
      }
      return UNHANDLED
    },
  }
}
