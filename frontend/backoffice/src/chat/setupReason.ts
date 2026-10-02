/**
 * Platform LLM anahtarı kurulum gerekçesi (CHAT_UI_CONTRACT §13, BR-4): `PUT/DELETE /admin-api/agent/provider` gövdesine
 * `reason` (10–500 karakter) eklenir; denetim kaydına gider. Değer yalnız bellekte (depoya yazılmaz), kayıttan sonra boşalır.
 * Geçersiz gerekçe `platformKeyReasonError`'a da yazılır: ayar ekranı alanın altında gösterir ve alana odaklanır.
 */
import { ref, watch } from 'vue'
import { ChatTransportError } from '@entegrasyonik/chat/transports/sse'

export const REASON_MIN = 10
export const REASON_MAX = 500
export const platformKeyReason = ref('')
/** Son kaydet/kaldır denemesindeki gerekçe hatası (alan düzenlenince temizlenir). */
export const platformKeyReasonError = ref('')
watch(platformKeyReason, () => (platformKeyReasonError.value = ''))

export function takeReasonForSetup(): Record<string, unknown> {
  const reason = platformKeyReason.value.trim()
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    const message = `Gerekçe ${REASON_MIN}–${REASON_MAX} karakter olmalı (denetim kaydına yazılır).`
    platformKeyReasonError.value = message
    throw new ChatTransportError('VALIDATION', message)
  }
  platformKeyReasonError.value = ''
  return { reason }
}
