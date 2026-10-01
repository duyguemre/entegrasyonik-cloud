/** Otopilot — sayfa hükmü (K51). Saf: girdi sohbet denetleyicisinin durumu, çıktı `PageVerdict` (yükleniyorsa null). */
import { buildVerdict, unreadable, type PageVerdict } from '@bo/utils/verdict'

export interface OtopilotVerdictInput {
  /** Sohbet makinesi durumu (`ChatStatus`). */
  status: string
  /** `unavailable` nedeni. */
  unavailableReason?: 'DISABLED' | 'MAINTENANCE' | 'LOAD_FAILED'
  /** Son tur hatası kodu (anahtar reddedildi vb.). */
  errorCode?: string
  retry: () => void
}

/** Sağlayıcı anahtarı reddedildi / model yok: anahtarı yenilemek gerekir. */
const KEY_ERRORS = new Set(['LLM_KEY_INVALID', 'LLM_MODEL_UNAVAILABLE'])
export const SETTINGS_ROUTE = '/sistem/otopilot'
const toSettings = { path: SETTINGS_ROUTE }

export function otopilotVerdict(i: OtopilotVerdictInput): PageVerdict | null {
  if (i.status === 'loading') return null
  if (i.status === 'setup-required')
    return buildVerdict({
      attention: [{ id: 'no-key', tone: 'warning', title: 'Platform yapay zekâ anahtarı yapılandırılmamış', impact: 'Anahtar girilene kadar yönetim sohbeti kullanılamaz.', advice: 'Otopilot ayarından sağlayıcı anahtarını girin.', to: toSettings, cta: 'Otopilot ayarını aç' }],
      actions: [{ id: 'open-settings', label: 'Anahtarı Otopilot ayarından girin', detail: 'Parola ve doğrulama kodu ile yeniden doğrulama ister.', icon: 'mdi-key-chain-variant', to: toSettings }],
      calm: { summary: '' },
      busy: () => 'Sohbet kapalı — platform anahtarı yapılandırılmamış; Otopilot ayarından girin.',
    })
  if (i.status === 'unavailable' && i.unavailableReason === 'LOAD_FAILED')
    return buildVerdict({
      attention: [unreadable('otopilot', 'Otopilot durumu', i.retry)],
      calm: { summary: '' },
      busy: () => 'Otopilot durumu okunamadı — hüküm verilemiyor; tekrar deneyin.',
    })
  if (i.status === 'unavailable' && i.unavailableReason === 'MAINTENANCE')
    return buildVerdict({
      attention: [{ id: 'maintenance', tone: 'info', title: 'Bakım nedeniyle Otopilot geçici olarak kapalı', impact: 'Sohbet bakım süresince yanıt vermez.', advice: 'Bakım modu kapanınca sohbet kendiliğinden açılır.', to: { path: '/sistem/bayraklar' }, cta: 'Bakım modu' }],
      calm: { summary: 'Otopilot bakım nedeniyle geçici olarak kapalı; bakım bitince açılır.', tone: 'info' },
    })
  if (i.status === 'unavailable')
    return buildVerdict({
      attention: [{ id: 'disabled', tone: 'warning', title: 'Otopilot bu ortamda kapalı', impact: 'Yönetim sohbeti kullanılamıyor.', advice: 'Otopilot ayarından etkin olup olmadığını kontrol edin.', to: toSettings, cta: 'Otopilot ayarını aç' }],
      calm: { summary: '' },
      busy: () => 'Sohbet kapalı — Otopilot bu ortamda etkin değil.',
    })
  if (i.errorCode && KEY_ERRORS.has(i.errorCode))
    return buildVerdict({
      attention: [{ id: 'key-invalid', tone: 'warning', title: 'Platform yapay zekâ anahtarı sağlayıcı tarafından reddedildi', impact: 'Sohbet yanıt veremiyor.', advice: 'Otopilot ayarından anahtarı yenileyin.', to: toSettings, cta: 'Otopilot ayarını aç' }],
      calm: { summary: '' },
      busy: () => 'Sağlayıcı anahtarı geçersiz — Otopilot ayarından yenileyin.',
    })
  return buildVerdict({ attention: [], calm: { summary: 'Platform yapay zekâ anahtarı yapılandırılmış; sohbet salt okuma çalışır.' }, checks: ['Sağlayıcı anahtarı', 'Sohbet erişimi'] })
}
