<!--
  Toplu ürün silme onayı (Toplu işlemler › Toplu Sil › İşlemi Başlat). DS-v2 Aşama 2:
  standart tehlikeli onay (`EkConfirmDialog`) — soru başlığı, sonucu anlatan açıklama
  (`hint`), error onay düğmesi, varsayılan odak Vazgeç; yalnızca ürünler sekmesini örter.
  Sözleşme DEĞİŞMEDİ: `deleteProducts` onayda yayılır; vazgeçince `update:modelValue(false)`.
-->
<template>
  <EkConfirmDialog :model-value="modelValue" title="Seçili ürünler silinsin mi?"
    :description="`${hint} Bu işlem geri alınamaz.`" confirm-label="Evet, Sil" cancel-label="Hayır"
    icon="mdi-trash-can-outline" confirm-icon="mdi-trash-can-outline" danger attach=".productListView"
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)" @confirm="$emit('deleteProducts')" />
</template>

<script setup lang="ts">
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue'

defineProps<{ modelValue: boolean, hint: string }>()
defineEmits(['update:modelValue', 'deleteProducts'])
</script>
