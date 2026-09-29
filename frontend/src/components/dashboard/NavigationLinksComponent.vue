<!--
  frontend/src/components/dashboard/NavigationLinksComponent.vue

  ADR-0015 Aşama A5 — dashboard "Katalog özeti" + "hızlı erişim" (Karar 6,
  Bulgu #3: pembe/turuncu dolgu ikon kutulu dev kartlar KALDIRILDI). Ürün
  toplamı artık `EkKpiCard` (`.large-stat-card` KORUNUR — spec kancası,
  `dashboard.spec.ts` "Ürünler kısayolu"), diğer katalog bağlantıları
  `DashboardQuickLinkList` (nötr ikon, renkli kutu YOK) ile gösterilir.
  Sayılar/veriler DEĞİŞMEDİ, yalnızca sunum.
-->
<template>
  <div class="nav-links-section">
    <LoadingComponent attach=".AppView" ref="loadingComponentRef"></LoadingComponent>
    <div class="nav-links-section__title">{{ $t('shell.section.catalog') }}</div>

    <v-btn
      v-if="productDefinitionElement"
      color="primary"
      prepend-icon="mdi-plus"
      block
      class="mb-3"
      @click="openTab(productDefinitionElement)"
    >
      {{ $t(productDefinitionElement.fullPath) }}
    </v-btn>

    <EkKpiCard
      v-if="productListElement"
      class="mb-3"
      label="Toplam Ürün"
      :value="fmt(productStats?.totalProducts)"
      :secondary-value="secondaryStatsLabel"
      clickable
      @click="openTab(productListElement)"
    />

    <DashboardQuickLinkList :items="visibleMenu" @select="openTab" />
  </div>
</template>

<script lang="ts" setup>
import { inject, onBeforeMount, computed, ref } from 'vue'
import useUser from '@/composables/user';
import LoadingComponent from '../LoadingComponent.vue';
import DashboardQuickLinkList from './DashboardQuickLinkList.vue';
import EkKpiCard from '@/components/ds/EkKpiCard.vue';
import { formatNumber } from '@/composables/format';

const userApi = useUser()
const menuStore: any = inject('useMenuStore')
const eventBus: any = inject('eventBus')

const navigationMenu: any = ref([])
const productDefinitionElement: any = ref(undefined)
const productListElement: any = ref(undefined)

const visibleMenu = computed(() => navigationMenu.value.filter((element: any) => element.status !== false))

const productStats = computed(() => userApi.getProductStatistics())
const fmt = (v: number | undefined) => formatNumber(v ?? 0)
const secondaryStatsLabel = computed(() => {
  const stats = productStats.value?.variantPlatformTransferStatistics
  const variants = fmt(stats?.totalVariants)
  const stock = fmt(stats?.totalStock)
  return `${variants} varyant · ${stock} stok`
})

onBeforeMount(() => {
  productDefinitionElement.value = menuStore.getMenuLinkWithCode('productDefinition')
  productListElement.value = menuStore.getMenuLinkWithCode('productList')

  const codes = ['categoryList', 'brandList', 'choiceList', 'hashtagList']
  codes.forEach(code => {
    const link = menuStore.getMenuLinkWithCode(code)
    if (link) navigationMenu.value.push(link)
  })
})

const openTab = (element: any) => {
  element.parameters = undefined
  eventBus.emit('openTab', element)
}
</script>

<style scoped>
.nav-links-section__title {
  padding: 0 var(--ek-space-3) var(--ek-space-1);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
}
</style>
