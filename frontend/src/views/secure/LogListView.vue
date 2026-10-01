<template>
  <div class="logListView d-flex flex-column">
    <!-- DS-v2 Aşama 2: her sekme kendi liste standardını (EkListScreen) taşır — filtre paneli,
         aktif çipler, sayfalama sekmeye yereldir. Başlığı bu sayfa taşır. -->
    <EkPageHeader
      section="Ayarlar"
      title="İşlem kayıtları"
      description="Pazaryerlerine gönderilen ve pazaryerlerinden çekilen ürün işlemlerini buradan izleyin."
      :tools-id="toolsId"
    />

    <EkPageTabs v-model="activeTab" :tabs="tabs" />

    <div class="logListView__body">
      <ImportLogList v-if="activeTab === 'import'" />
      <ExportLogList v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue';
import { provideListToolsTarget } from '@/components/page/listTools';
import EkPageHeader from '@/components/page/EkPageHeader.vue';
import { EkPageTabs } from '@entegrasyonik/ui/components';
import ImportLogList from '@/components/logListView/ImportLogList.vue';
import ExportLogList from '@/components/logListView/ExportLogList.vue';

// P03 (K49): etkin sekmenin arama + yenile'si başlık çubuğunda.
const toolsId = `ek-log-tools-${useId().replace(/[^\w-]/g, '-')}`
provideListToolsTarget(toolsId)

// Varsayılan sekme: ürün gönderim işlemleri
const activeTab = ref('export');
const tabs = [
  { value: 'export', label: 'Ürün gönderim işlemleri' },
  { value: 'import', label: 'Ürün çekim işlemleri' },
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
  padding: var(--ek-space-5) var(--ek-space-6);
  gap: var(--ek-space-3);
  background-color: transparent;
}

@media (max-width: 767px) {
  .logListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

/* Alt listeler (ExportLogList/ImportLogList) bu gövdeye göre konumlanır. */
.logListView__body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
