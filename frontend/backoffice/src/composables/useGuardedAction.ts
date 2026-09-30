/**
 * Gerekçe + adım-yükseltmesi (step-up) isteyen yazma işlemlerinin ortak akışı (ADR-0026 Karar 4.6; backend REAUTH_RPCS):
 *  1) `open(ctx)` diyaloğu açar (EkReasonDialog), 2) onayda gerekçe kırpılır ve 10..500 karakter denetlenir,
 *  3) işlem çağrılır — `REAUTH_REQUIRED` istemcide yakalanır, ReauthDialog açılır, doğrulanınca istek BİR kez yenilenir,
 *  4) başarıda diyalog kapanır + `onDone`, hatada diyalog açık kalır ve "<ne oldu> — <ne yapılmalı>" gösterilir
 *     (step-up'tan vazgeçilirse: "Yeniden doğrulama yapılmadı"; LIVE_READONLY: 423 iletisi).
 * Saf TS: DOM gerektirmez (tests/guarded-action.test.ts).
 */
import { ref, shallowRef } from 'vue'
import { REASON_MAX, REASON_MIN } from '@bo/api/contract'
import { describeError, type DescribedError } from '@bo/utils/errors'

export function checkReason(reason: string): string | null {
  const r = reason.trim()
  if (r.length < REASON_MIN) return `Gerekçe en az ${REASON_MIN} karakter olmalı.`
  if (r.length > REASON_MAX) return `Gerekçe en çok ${REASON_MAX} karakter olabilir.`
  return null
}

export function useGuardedAction<C, R>(run: (ctx: C, reason: string) => Promise<R>, onDone?: (result: R, ctx: C) => void) {
  const isOpen = ref(false)
  const busy = ref(false)
  const error = shallowRef<DescribedError | null>(null)
  const context = shallowRef<C | null>(null)

  function open(ctx: C) {
    context.value = ctx
    error.value = null
    isOpen.value = true
  }

  function close() {
    if (busy.value) return
    isOpen.value = false
  }

  async function confirm(reason: string): Promise<R | undefined> {
    if (busy.value || context.value === null) return undefined
    const invalid = checkReason(reason)
    if (invalid) {
      error.value = { ...describeError(null), kind: 'validation', title: invalid, action: '', message: invalid, retryable: false }
      return undefined
    }
    busy.value = true
    error.value = null
    const ctx = context.value
    try {
      const result = await run(ctx, reason.trim())
      isOpen.value = false
      onDone?.(result, ctx)
      return result
    } catch (e) {
      error.value = describeError(e)
      return undefined
    } finally {
      busy.value = false
    }
  }

  return { isOpen, busy, error, context, open, close, confirm }
}

export type GuardedAction<C, R> = ReturnType<typeof useGuardedAction<C, R>>
