/** Sahte BE-01 `BackofficeTenantService/listTenants` + BE-02 `getHealthSummary` (API_BACKOFFICE_ATTENTION.md). Şekil birebir. */
import { UNHANDLED, type MockDomain } from './context'

export function createTenantOpsMock(_t0: number): MockDomain {
  return {
    handle(op) {
      switch (op) {
        default:
          return UNHANDLED
      }
    },
  }
}
