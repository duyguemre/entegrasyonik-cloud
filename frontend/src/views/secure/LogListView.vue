<template>
  <div class="logListView pt-2 h-100">
    <div class="px-4">
      <EkPageHeader section="Entegrasyonlar" title="İşlemler"
        description="Pazaryerine gönderim ve pazaryerinden çekim işlemlerinin kayıtlarını buradan izleyin." />
    </div>

    <EkPageTabs v-model="activeTab" class="px-4 mt-2" :tabs="[
      { value: 'export', label: 'Ürün Gönderim İşlemleri' },
      { value: 'import', label: 'Ürün Çekim İşlemleri' },
    ]" />

    <template v-if="activeTab === 'import'">
      <ImportLogList />
    </template>
    <template v-else>
      <ExportLogList />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ImportLogList from '@/components/logListView/ImportLogList.vue';
import ExportLogList from '@/components/logListView/ExportLogList.vue';
import EkPageHeader from '@/components/ds/EkPageHeader.vue';
import EkPageTabs from '@/components/ds/EkPageTabs.vue';

// Default olarak "Ürün Gönderim İşlemleri" seçili geliyor
const activeTab = ref('export');
</script>

<style scoped>
/* `ExportLogList`/`ImportLogList` kökleri `position:absolute; top:148px` kullanır (bkz. o
   dosyalardaki AYNI gerekçe) — konumlandırma bağlamı BİLİNÇLİ OLARAK `.logListView` DEĞİL, daha
   üstteki (garanti yükseklikli) çalışma alanı kapsayıcısıdır: `.logListView`'in kendisi
   `position:relative` yapılırsa `h-100` güvenilir bir yükseklik ZİNCİRİNE bağlı olmadığından
   (yalnızca `h-100`, gerçek bir piksel yüksekliğine çözülmüyor) mutlak konumlandırılmış alt öğe
   0 yükseklikte kayboluyor (ölçüldü, B3) — bu yüzden `.logListView` KASITLI OLARAK `position:static`
   (varsayılan) bırakıldı, diğer TÜM liste ekranlarıyla (AdminTicketListView, …) AYNI desen. */
.logListView {
  background-color: transparent;
}
</style>
