/**
 * Bilinen sunucu hata kodlarını "<ne oldu>" cümlesine çevirir (eylem kısmını `describeError` ekler).
 * Kodu/HTTP durumunu korur; yalnız iletiyi değiştirir. Ham istisna kullanıcıya gösterilmez.
 */
import { AdminApiError } from '@bo/api/client'

export function remapError(error: unknown, titles: Record<string, string>): never {
  if (error instanceof AdminApiError && titles[error.code]) {
    throw new AdminApiError(error.status, { error: titles[error.code], code: error.code, requestId: error.requestId, fields: error.fields })
  }
  throw error
}
