<template>
  <div class="logListView d-flex flex-column">
    <!-- ek-pattern-exception: EkListPage — bu ekran iki ayrı liste sekmesi barındırıyor; her sekmenin kendi arama/filtre/sayfalama düzeni (Enter ile arama, iş numarası araması, gelişmiş sorgu paneli) logs*.spec.ts ile sabit ve EkFilterBar'a sığmıyor — hedef: Aşama C (sekme başına EkListPage) -->
    <EkPageHeader
      section="Entegrasyonlar"
      title="İşlem Kayıtları"
      description="Pazaryerlerine gönderilen ve pazaryerlerinden çekilen ürün işlemlerini buradan izleyin."
    />

    <EkPageTabs v-model="activeTab" :tabs="tabs" />

    <div class="logListView__body">
      <ImportLogList v-if="activeTab === 'import'" />
      <ExportLogList v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import EkPageHeader from '@/components/ds/EkPageHeader.vue';
import EkPageTabs from '@/components/ds/EkPageTabs.vue';
import ImportLogList from '@/components/logListView/ImportLogList.vue';
import ExportLogList from '@/components/logListView/ExportLogList.vue';

// Default olarak "Ürün Gönderim İşlemleri" seçili geliyor
const activeTab = ref('export');
const tabs = [
  { value: 'export', label: 'Ürün Gönderim İşlemleri' },
  { value: 'import', label: 'Ürün Çekim İşlemleri' },
];
</script>

<style scoped>
/* Alt listeler eskiden en yakın konumlanmış atalara göre (inset 0) yerleşiyordu; kök de
   aynı alanı kaplar, böylece gövde kalan yüksekliği alır. */
.logListView {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  padding: var(--ek-space-6);
  gap: var(--ek-space-4);
  background-color: transparent;
}

/* Alt listeler (ExportLogList/ImportLogList) bu gövdeye göre konumlanır. */
.logListView__body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
