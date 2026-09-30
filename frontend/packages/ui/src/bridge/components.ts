// KÖPRÜ: DS-v2 bileşenleri uygulamada (`src/components/ds`) yaşar; paralel dallar bu dosyaları değiştirdiği için
// Aşama 0'ın fiziksel taşıması açık dal kalmadığında yapılır. Tüketiciler yalnız `@entegrasyonik/ui/components`
// yolunu bilir — taşıma günü yalnız bu dosya değişir.
// Not: bileşenlerin kendi içindeki `@/…` importları tüketen uygulamanın Vite/tsconfig `@` takma adıyla
// uygulamanın `src/` klasörüne çözülür (backoffice/vite.config.mts).
export { default as EkAlert } from '../../../../src/components/ds/EkAlert.vue'
export { default as EkBadge } from '../../../../src/components/ds/EkBadge.vue'
export { default as EkBrandLogo } from '../../../../src/components/ds/EkBrandLogo.vue'
export { default as EkButton } from '../../../../src/components/ds/EkButton.vue'
export { default as EkCard } from '../../../../src/components/ds/EkCard.vue'
export { default as EkDescriptionList } from '../../../../src/components/ds/EkDescriptionList.vue'
export { default as EkDialog } from '../../../../src/components/ds/EkDialog.vue'
export { default as EkEmptyState } from '../../../../src/components/ds/EkEmptyState.vue'
export { default as EkIconTile } from '../../../../src/components/ds/EkIconTile.vue'
export { default as EkKbd } from '../../../../src/components/ds/EkKbd.vue'
export { default as EkMetricCard } from '../../../../src/components/ds/EkMetricCard.vue'
export { default as EkSidebarNav } from '../../../../src/components/ds/EkSidebarNav.vue'
export { default as EkSkeleton } from '../../../../src/components/ds/EkSkeleton.vue'
export { default as EkTooltip } from '../../../../src/components/ds/EkTooltip.vue'
export type { EkSideItem, EkSideSection } from '../../../../src/components/ds/EkSidebarNav.vue'
export type { EkTone } from '../../../../src/components/ds/EkIconTile.vue'
export { default as EkDataTable } from '../../../../src/components/ds/EkDataTable.vue'
export { default as EkStatusChip } from '../../../../src/components/ds/EkStatusChip.vue'
export type { EkTableColumn } from '../../../../src/components/ds/EkDataTable.vue'
export type { StatusTone } from '../../../../src/design/status-map'
