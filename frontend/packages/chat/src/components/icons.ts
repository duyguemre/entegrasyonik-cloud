/** Sohbet paketinin ikon kümesi (MDI). Ürün işareti tek yerde; varlık türü → ikon. */
import type { EntityType } from '../protocol/v1'

export { CHAT_ICON } from '../brand'

export const ENTITY_ICON: Record<EntityType, string> = {
  product: 'mdi-tag-outline',
  variant: 'mdi-tag-multiple-outline',
  order: 'mdi-cart-outline',
  claim: 'mdi-undo-variant',
  customer: 'mdi-account-outline',
  invoice: 'mdi-file-document-outline',
  shipment: 'mdi-truck-outline',
  integration: 'mdi-connection',
  question: 'mdi-comment-question-outline',
  report: 'mdi-chart-box-outline',
  tenant: 'mdi-domain',
  platformJob: 'mdi-cog-sync-outline',
  logEvent: 'mdi-text-box-search-outline',
}
