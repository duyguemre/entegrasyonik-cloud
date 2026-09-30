/** Sağlayıcı hata sınıfı → kullanıcıya güvenli ileti (ham sağlayıcı yanıtı ASLA gösterilmez; ADR-0034 Karar 9). */
import type { Translate } from '../i18n'
import type { ProviderErrorCode } from '../protocol/v1'

export const PROVIDER_ERROR_CODES = ['LLM_KEY_INVALID', 'LLM_QUOTA', 'LLM_RATE_LIMITED', 'LLM_MODEL_UNAVAILABLE', 'LLM_UNAVAILABLE'] as const satisfies readonly ProviderErrorCode[]

export function providerErrorMessage(t: Translate, code: ProviderErrorCode | undefined, retryAfterSec?: number): string | undefined {
  if (!code) return undefined
  if (code === 'LLM_RATE_LIMITED') return retryAfterSec ? t('providerError.LLM_RATE_LIMITED', { seconds: retryAfterSec }) : t('providerError.LLM_RATE_LIMITED_NOW')
  return t(`providerError.${code}`)
}
