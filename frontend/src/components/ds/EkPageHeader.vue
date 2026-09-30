<!--
  frontend/src/components/ds/EkPageHeader.vue

  ADR-0015 Karar 2.3/6.2 — her ekranın İLK öğesi. Aşama 5: görünüm `EkPageBar` (tek satır: bölüm › H1 (i) ·
  meta ... eylemler; açıklama "Sayfa hakkında" panelinde) → sağda EN FAZLA 1 birincil eylem + ≤2 ikincil
  eylem + `⋯` taşma menüsü. Sayfada TEK H1 burasıdır (axe `heading-order`). API değişmedi (+ `tips`, `meta`).

  Kullanım:
    <EkPageHeader
      section="Katalog"
      title="Ürünler"
      description="Tüm kanallardaki ürünlerinizi buradan yönetin."
      :primary-action="{ label: 'Yeni ürün', icon: 'mdi-plus', onClick: openCreate }"
      :secondary-actions="[{ label: 'Dışa aktar', icon: 'mdi-download-outline', onClick: exportProducts }]"
      :overflow-actions="[{ label: 'Toplu sil', icon: 'mdi-trash-can-outline', onClick: bulkDelete, danger: true }]"
    />
-->
<template>
  <header class="ek-page-header">
    <EkPageBar :section="section" :title="title" :description="description" :tips="tips" :meta="meta"
      :refreshable="refreshable" :refreshing="refreshing" :last-updated="lastUpdated" @refresh="emit('refresh')">
      <template v-if="primaryAction || secondaryActions?.length || overflowActions?.length" #actions>
        <v-btn
          v-for="action in secondaryActions"
          :key="action.label"
          variant="outlined"
          :prepend-icon="action.icon"
          @click="action.onClick"
        >
          {{ action.label }}
        </v-btn>

        <v-menu v-if="overflowActions?.length">
          <template #activator="{ props: menuProps }">
            <v-btn
              icon="mdi-dots-horizontal"
              variant="text"
              density="comfortable"
              aria-label="Diğer eylemler"
              v-bind="menuProps"
            />
          </template>
          <v-list density="compact">
            <v-list-item
              v-for="action in overflowActions"
              :key="action.label"
              :class="{ 'text-error': action.danger }"
              @click="action.onClick"
            >
              <template #prepend v-if="action.icon">
                <v-icon :icon="action.icon" size="18" />
              </template>
              <v-list-item-title>{{ action.label }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>

        <v-btn v-if="primaryAction" color="primary" :prepend-icon="primaryAction.icon" @click="primaryAction.onClick">
          {{ primaryAction.label }}
        </v-btn>
      </template>
    </EkPageBar>
  </header>
</template>

<script setup lang="ts">
import EkPageBar from './EkPageBar.vue'

export interface EkPageHeaderAction {
  label: string
  icon?: string
  onClick: () => void
  danger?: boolean
}

defineProps<{
  /** Kayıt defterindeki bölüm adı (tıklanabilir DEĞİL — Karar 2.3). */
  section?: string
  title: string
  /** Sayfanın amacı — Aşama 5: sayfada değil "Sayfa hakkında" (i) panelinde. */
  description?: string
  /** "Sayfa hakkında" panelindeki kısa ipuçları. */
  tips?: string[]
  /** Başlık satırında görünen kısa durum metni (ör. son güncelleme). */
  meta?: string
  primaryAction?: EkPageHeaderAction
  secondaryActions?: EkPageHeaderAction[]
  overflowActions?: EkPageHeaderAction[]
  /** Aşama 6b (Standart 9): tek yenile düğmesi başlık satırının en sağında (EkRefreshButton; Alt+R). */
  refreshable?: boolean
  refreshing?: boolean
  lastUpdated?: Date | string | number | null
}>()
const emit = defineEmits<{ refresh: [] }>()
</script>

<style scoped>
.ek-page-header {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}
</style>
