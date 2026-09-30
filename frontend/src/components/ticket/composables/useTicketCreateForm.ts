/**
 * frontend/src/components/ticket/composables/useTicketCreateForm.ts
 *
 * A6a — TicketCreateDialog durumu: taslak, dokunulmuşluk, doğrulama, sayaçlar, gönderim durum makinesi.
 * Saf kurallar `ticketRules.ts`'te; burası yalnızca reaktif bağ. Hata halinde taslak SİLİNMEZ.
 */
import { computed, reactive, ref, watch } from 'vue'
import { TicketPriorityEnum, TicketTypeEnum } from '@/types/TicketTypes'
import {
  MESSAGE_MAX, SUBJECT_MAX, buildOpenTicketPayload, counterAnnouncement, counterState, describeSubmitError,
  emptyDraft, hasErrors, initialSubmitState, submitReducer, validateDraft,
  type DraftErrors, type TicketDraft, type SubmitAction, type SubmitState,
} from './ticketRules'
import type { TicketActionResult } from './useTicketActions'

export function useTicketCreateForm(send: (payload: ReturnType<typeof buildOpenTicketPayload>) => Promise<TicketActionResult>) {
  const draft = reactive(emptyDraft())
  const touched = reactive({ subject: false, message: false })
  const state = ref<SubmitState<any>>(initialSubmitState())
  const liveMessage = ref('')

  const dispatch = (action: SubmitAction<any>) => {
    state.value = submitReducer(state.value, action)
  }

  const phase = computed(() => state.value.phase)
  const busy = computed(() => state.value.phase === 'submitting')

  const errors = computed<DraftErrors>(() => validateDraft(draft))
  const shownErrors = computed(() => ({
    subject: touched.subject && errors.value.subject ? errors.value.subject : '',
    message: touched.message && errors.value.message ? errors.value.message : '',
  }))

  const subjectCounter = computed(() => counterState(draft.subject, SUBJECT_MAX))
  const messageCounter = computed(() => counterState(draft.message, MESSAGE_MAX))

  // Duyuru yalnızca içerik BOŞ DEĞİLSE güncellenir (boş dize eski duyuruyu korur → tekrar okunmaz).
  const announce = () => {
    const a = counterAnnouncement(draft.message, MESSAGE_MAX) || counterAnnouncement(draft.subject, SUBJECT_MAX)
    if (a) liveMessage.value = a
  }
  watch([() => draft.subject, () => draft.message], announce)

  function validateAll(): DraftErrors {
    touched.subject = true
    touched.message = true
    return errors.value
  }

  async function submitDraft() {
    if (busy.value || hasErrors(errors.value)) return
    dispatch({ type: 'submit' })
    try {
      const result = await send(buildOpenTicketPayload(draft))
      if (result.ok) dispatch({ type: 'resolve', result: { ticket: result.ticket, draft: { ...draft } } })
      else dispatch({ type: 'reject', error: describeSubmitError('create', result.failure) })
    } catch {
      dispatch({ type: 'reject', error: describeSubmitError('create', 'unknown') })
    }
  }

  function resetAll() {
    Object.assign(draft, emptyDraft())
    touched.subject = false
    touched.message = false
    liveMessage.value = ''
    dispatch({ type: 'reset' })
  }

  const created = computed(() => state.value.result as { ticket: any; draft: TicketDraft } | null)
  const createdNumber = computed(() => created.value?.ticket?.ticketNumber ?? '—')
  const createdSubject = computed(() => created.value?.ticket?.subject ?? created.value?.draft.subject ?? '')
  const createdType = computed<TicketTypeEnum>(() => created.value?.ticket?.type ?? created.value?.draft.type ?? TicketTypeEnum.GENERAL)
  const createdPriority = computed<TicketPriorityEnum>(() => created.value?.ticket?.priority ?? created.value?.draft.priority ?? TicketPriorityEnum.MEDIUM)

  return {
    draft, touched, state, phase, busy, shownErrors, subjectCounter, messageCounter, liveMessage,
    createdNumber, createdSubject, createdType, createdPriority, validateAll, submitDraft, resetAll,
  }
}
