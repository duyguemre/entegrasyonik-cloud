/**
 * frontend/src/components/ticket/composables/useTicketReply.ts
 *
 * A6a — TicketDetailComponent yanıt kutusu durumu: taslak, sayaç, gönderim durum makinesi.
 * Gönderim başarısızsa taslak KORUNUR; yalnız başarıda temizlenir.
 */
import { computed, ref, watch } from 'vue'
import { REPLY_MAX, counterAnnouncement, counterState, describeSubmitError, initialSubmitState, submitReducer, type SubmitAction, type SubmitState } from './ticketRules'
import type { TicketActionResult } from './useTicketActions'

export function useTicketReply(send: (content: string) => Promise<TicketActionResult>) {
  const draft = ref('')
  const state = ref<SubmitState<any>>(initialSubmitState())
  const liveMessage = ref('')

  const dispatch = (action: SubmitAction<any>) => {
    state.value = submitReducer(state.value, action)
  }

  const busy = computed(() => state.value.phase === 'submitting')
  const counter = computed(() => counterState(draft.value, REPLY_MAX))
  const canSend = computed(() => !busy.value && draft.value.trim().length > 0 && draft.value.length <= REPLY_MAX)

  watch(draft, (v) => {
    const a = counterAnnouncement(v, REPLY_MAX)
    if (a) liveMessage.value = a
  })

  /** Başarıda `true`. Payload'daki içerik, kullanıcının yazdığıyla AYNIDIR (gövde değişmez). */
  async function submit(): Promise<boolean> {
    if (!canSend.value) return false
    dispatch({ type: 'submit' })
    try {
      const result = await send(draft.value)
      if (result.ok) {
        dispatch({ type: 'resolve', result: result.ticket })
        draft.value = ''
        dispatch({ type: 'reset' })
        return true
      }
      dispatch({ type: 'reject', error: describeSubmitError('reply', result.failure) })
    } catch {
      dispatch({ type: 'reject', error: describeSubmitError('reply', 'unknown') })
    }
    return false
  }

  function reset() {
    draft.value = ''
    liveMessage.value = ''
    dispatch({ type: 'reset' })
  }

  return { draft, state, busy, counter, canSend, liveMessage, submit, reset }
}
