<!--
  Toplu ürün işlemleri menüsü (ProductListView başlığındaki "Toplu işlemler" ⋮ menüsünün
  içeriği). DS-v2 Aşama 2: `EkMenuPanel` — gruplu (platform · Excel · ürün bilgileri),
  ikonlu, ayraçlı; tehlikeli "Toplu Sil" en sonda error tonunda. ↑↓ Home End Enter Esc.
  Sözleşme DEĞİŞMEDİ: seçilen işlem kodu `executeBatch` ile yayılır.
-->
<template>
  <EkMenuPanel v-if="actionMenu" ref="panelRef" class="bam-panel" label="Toplu ürün işlemleri"
    title="Toplu Ürün İşlemleri"
    description="İşlem seçili ürünlere ve varyantlarına, bağlı tüm platformlarda uygulanır."
    :groups="groups" @select="(item) => emit('executeBatch', item.key)" />
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import EkMenuPanel, { type EkMenuGroup } from '@/components/ds/EkMenuPanel.vue'
import { PLATFORM_PROCESS } from '@/types/PlatformProcess'

const props = defineProps<{ actionMenu: boolean }>()
const emit = defineEmits(['executeBatch'])
const panelRef = ref<InstanceType<typeof EkMenuPanel> | null>(null)

const groups: EkMenuGroup[] = [
  {
    label: 'Platform',
    items: [
      { key: PLATFORM_PROCESS.TRANSFER, label: 'Platformlara Yükle', icon: 'mdi-upload-outline' },
      { key: PLATFORM_PROCESS.UPDATE, label: 'Platformlarda Güncelle', icon: 'mdi-sync' },
      { key: PLATFORM_PROCESS.UPDATE_PRICE, label: 'Platform Fiyatlarını Güncelle', icon: 'mdi-currency-try' },
      { key: PLATFORM_PROCESS.UPDATE_STOCK, label: 'Platform Stoklarını Güncelle', icon: 'mdi-counter' },
      { key: 'FETCH_PRODUCT', label: 'Platformdan Ürün Yükle', icon: 'mdi-download-outline' },
    ],
  },
  {
    label: 'Excel',
    items: [
      { key: 'EXPORT_EXCEL', label: "Excel'e Aktar", icon: 'mdi-microsoft-excel' },
      { key: 'IMPORT_EXCEL', label: "Excel'den Güncelle", icon: 'mdi-file-excel-box-outline' },
    ],
  },
  {
    label: 'Ürün bilgileri',
    items: [
      { key: 'CHANGE_STATUS', label: 'Satış Durum Değiştir', icon: 'mdi-toggle-switch-outline' },
      { key: 'SET_CATEGORY', label: 'Kategori Ata / Değiştir', icon: 'mdi-shape-outline' },
      { key: 'SET_BRAND', label: 'Marka Ata / Değiştir', icon: 'mdi-watermark' },
      { key: 'SET_TAGS', label: 'Etiket (Tag) Ata / Değiştir', icon: 'mdi-tag-multiple-outline' },
    ],
  },
  {
    items: [{ key: 'DELETE', label: 'Toplu Sil', icon: 'mdi-trash-can-outline', danger: true }],
  },
]

// Menü açıldığında klavye odağı ilk işleme gelir (EkContextMenu ile aynı davranış).
function focusFirst() {
  nextTick(() => panelRef.value?.focusFirst())
}
onMounted(() => props.actionMenu && focusFirst())
watch(() => props.actionMenu, (open) => open && focusFirst())
</script>

<style scoped>
.bam-panel {
  border: 0;
  box-shadow: none;
}
</style>
