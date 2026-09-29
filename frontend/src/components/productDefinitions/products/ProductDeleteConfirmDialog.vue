<!--
  Ürün silme onayı (ProductListView satırındaki sil düğmesi). DS-v2 Aşama 2: eski
  tetikleyiciye yapışık kırmızı açılır kart ("ÜRÜN SİLİNECEK") yerine standart
  tehlikeli onay diyaloğu — soru başlığı + nesne adı, error onay düğmesi,
  varsayılan odak Vazgeç, yalnızca ürünler sekmesini örter.
  Sözleşme: `confirm` → çağıran silme isteğini atar; `cancel` → vazgeçildi.
-->
<template>
  <EkConfirmDialog :model-value="modelValue" :title="title"
    description="Ürün ve tüm varyantları kalıcı olarak silinir. Bu işlem geri alınamaz."
    :confirm-label="$t('common.delete')" :cancel-label="$t('common.cancel')" confirm-icon="mdi-trash-can-outline"
    icon="mdi-trash-can-outline" danger attach=".productListView"
    @update:model-value="(v: boolean) => { if (!v) emit('cancel') }" @confirm="emit('confirm')" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue'

const props = defineProps<{ modelValue: boolean; product?: { title?: string } | null }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const title = computed(() => (props.product?.title ? `'${props.product.title}' silinsin mi?` : 'Ürün silinsin mi?'))
</script>
