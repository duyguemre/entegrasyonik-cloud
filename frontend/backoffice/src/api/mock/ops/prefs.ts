/** Sahte BE-05 `BackofficePrefsService/listViews|saveView|deleteView` (API_BACKOFFICE_ATTENTION.md). Yönetici başına ≤ 20. */
import { UNHANDLED, type MockDomain } from './context'

export function createPrefsMock(_t0: number): MockDomain {
  return {
    handle(op) {
      switch (op) {
        default:
          return UNHANDLED
      }
    },
  }
}
