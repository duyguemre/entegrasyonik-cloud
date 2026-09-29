<!--
  frontend/src/components/dashboard/DashboardQuickLinkList.vue

  ADR-0015 Aşama A5 — dashboard "hızlı erişim" kısayolları için TEK ortak
  desen (Karar 6 "tek iş = tek desen"). Önceden `NavigationLinksComponent*`
  dosyalarının HER BİRİ kendi pembe/turuncu/yeşil/mavi dolgu ikon kutulu, dev
  (120px+) "kart" düzenini tekrarlıyordu (ADR Bulgu #3). Bu bileşen onun
  yerine KOMPAKT bir bağlantı listesi sağlar: nötr ikon (`content-muted`),
  renkli kutu YOK, hover'da yalnızca zemin rengi değişir (yükselme/ölçek
  YOK — ADR Karar 1.1 hareket ilkesi).

  Kullanım:
    <DashboardQuickLinkList :items="navigationMenu" @select="openTab" />
-->
<template>
  <ul class="dashboard-quick-links" role="list">
    <li v-for="element in items" :key="element.code">
      <button
        type="button"
        class="dashboard-quick-links__item"
        :data-id="element.id"
        @click="emit('select', element)"
      >
        <v-icon size="18" class="dashboard-quick-links__icon" aria-hidden="true">{{ element.icon }}</v-icon>
        <span class="dashboard-quick-links__label">{{ $t(element.fullPath) }}</span>
        <v-icon size="16" class="dashboard-quick-links__chevron" aria-hidden="true">mdi-chevron-right</v-icon>
      </button>
    </li>
  </ul>
</template>

<script setup lang="ts">
defineProps<{
  items: any[]
}>()

const emit = defineEmits<{ select: [element: any] }>()
</script>

<style scoped>
.dashboard-quick-links {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  list-style: none;
  margin: 0;
  padding: 0;
}

.dashboard-quick-links__item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  height: 40px;
  padding: 0 var(--ek-space-3);
  border: none;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-default);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
}

.dashboard-quick-links__item:hover,
.dashboard-quick-links__item:focus-visible {
  background: var(--ek-color-surface-muted);
}

.dashboard-quick-links__icon {
  flex: none;
  color: var(--ek-color-content-muted);
}

.dashboard-quick-links__label {
  flex: 1 1 auto;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-quick-links__chevron {
  flex: none;
  color: var(--ek-color-content-subtle);
}
</style>
