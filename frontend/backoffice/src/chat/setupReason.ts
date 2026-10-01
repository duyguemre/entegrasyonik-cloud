/**
 * Platform LLM anahtarı kurulum gerekçesi (CHAT_UI_CONTRACT §13, BR-4): `PUT/DELETE /admin-api/agent/provider` gövdesine
 * `reason` (10-500 karakter) eklenir; denetim kaydına gider. Değer yalnız bellekte (depoya yazılmaz), kayıttan sonra boşalır.
 */
import { ref } from 'vue'
import { ChatTransportError } from '@entegrasyonik/chat/transports/sse'

export const REASON_MIN = 10
export const REASON_MAX = 500
export const platformKeyReason = ref('')

export function takeReasonForSetup(): Record<string, unknown> {
  const reason = platformKeyReason.value.trim()
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new ChatTransportError('VALIDATION', `Gerekçe ${REASON_MIN}-${REASON_MAX} karakter olmalı (denetim kaydına yazılır).`)
  }
  return { reason }
}
