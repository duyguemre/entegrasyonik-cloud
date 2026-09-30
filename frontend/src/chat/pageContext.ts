/**
 * frontend/src/chat/pageContext.ts — etkin sekme → sohbet sayfa bağlamı (ADR-0034 Karar 3, CHAT_UI_CONTRACT §4 `PageContext`).
 * SAF (birim testli). Yalnız `screens.ts`'te KAYITLI ekranlar; teknik kimlik (instanceParam) ve yalnız `urlParams`'ta izinli
 * filtreler (PII/serbest metin YOK — ADR-0012 URL kuralı; `globalSearch` gibi alanlar zaten kayıtta olmadığı için geçmez).
 */
import type { EntityType, PageContext } from '@entegrasyonik/chat/protocol'
import { pickUrlParams, resolveScreenByKey, screenKeyForLink } from '@/navigation/screens'
import { isChatClientScreen } from './chatLinks'

/** Ekranın örnek kimliği parametresi → varlık türü (yalnız bilinenler). */
const INSTANCE_ENTITY: Record<string, EntityType> = {
  productId: 'product',
  orderId: 'order',
  claimId: 'claim',
  customerId: 'customer',
  invoiceId: 'invoice',
}

export interface ChatPageContext {
  value: PageContext
  label: string
}

export function pageContextFor(link: any, label: string): ChatPageContext | null {
  if (!link?.code) return null
  const key = screenKeyForLink(link)
  if (isChatClientScreen(key)) return null
  const screen = resolveScreenByKey(key)
  if (!screen) return null
  const value: PageContext = { screen: key.slice(0, 64) }
  const params = link.parameters ?? {}
  if (screen.instanceParam) {
    const id = params[screen.instanceParam]
    const type = INSTANCE_ENTITY[screen.instanceParam]
    if (type && typeof id === 'string' && id.length > 0 && id.length <= 128) value.entity = { type, id }
  }
  const filters = pickUrlParams(screen, params)
  const entries = Object.entries(filters).filter(([k, v]) => k.length <= 32 && v.length <= 128).slice(0, 10)
  if (entries.length) value.filters = Object.fromEntries(entries)
  return { value, label: label || key }
}
