<template>
  <div class="category-mapping-wrapper">

    <v-btn icon="mdi-close" variant="text" size="x-small" class="position-absolute"
      style="right: 8px; top: 8px; z-index: 10;" @click="emit('close')" aria-label="Kapat"></v-btn>


    <v-fade-transition hide-on-leave mode="out-in">

      <div v-if="isMapped" :key="'mapped-state'"
        class="mapped-success-state d-flex align-start pa-4 rounded-lg border-success shadow-sm">
        <v-icon color="success" size="32" class="mr-4 mt-1">mdi-check-decagram</v-icon>
        <div class="d-flex flex-column">
          <span class="text-subtitle-1 font-weight-black text-success" style="line-height: 1.2;">
            Kategori Eşleşmesi Doğrulandı
          </span>
          <p class="text-caption text-grey-darken-2 mt-1 mb-2">
            Ürün çekim işleminde bu kategori için eşleşme bulunamamıştı, ancak şu an sisteminizdeki
            <b class="text-grey-darken-4">{{ localCategoryTitle }}</b>
            ile başarıyla bağlı durumda. Detaylı inceleme veya değişiklik için kategori sayfasına gidebilirsiniz.
          </p>
          <div class="d-flex align-center">
            <v-btn variant="text" color="success" size="x-small" class="pa-0 font-weight-bold" @click="openCategoryPage"
              prepend-icon="mdi-arrow-right-circle-outline">
              KATEGORİ LİSTESİNE GİT VE DÜZENLE
            </v-btn>
          </div>
        </div>
      </div>

      <div v-else :key="'selection-state'" class="mapping-step-box shadow-sm">
        <div class="context-card mb-4 border-red-lighten-4">
          <div class="context-row bg-red-lighten-5">
            <div class="context-col">
              <span class="context-label text-red-darken-4">Pazaryeri Kategorisi</span>
              <span class="context-value text-red-darken-4 font-weight-black">
                {{ computedPlatformCategoryTitle || 'Yükleniyor...' }}
              </span>
            </div>
            <div class="context-divider">
              <v-icon size="16" color="red-darken-3">mdi-ray-start-arrow</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label text-red-darken-4">Yerel Kategori</span>
              <span class="context-value text-red-darken-2 font-italic">Eşleşme Bekleniyor...</span>
            </div>
          </div>
        </div>

        <div class="info-alert pa-3 mb-5 rounded-lg bg-red-lighten-5 border-red-subtle">
          <div class="d-flex align-center mb-1">
            <v-icon size="16" color="red-darken-3" class="mr-2">mdi-alert-circle-outline</v-icon>
            <span class="text-caption font-weight-bold text-red-darken-4 uppercase-track">Eksik Karşılık</span>
          </div>
          <p class="text-caption text-grey-darken-3 mb-0">
            Aktarımın tamamlanabilmesi için bu kategorinin sisteminizde hangi kategoriye karşılık geldiğini
            seçmelisiniz.
          </p>
        </div>

        <div class="d-flex align-center mb-4">
          <span class="text-subtitle-2 font-weight-black text-grey-darken-3">Yerel Kategori Seçin</span>
        </div>

        <CategorySelectBoxComponent v-model="tempLocalCategoryId" :noInit="true" :withAll="false" class="mb-4" />

        <v-btn block size="large" color="red-darken-3" elevation="0" :loading="loading" :disabled="!tempLocalCategoryId"
          class="font-weight-bold premium-btn" @click="handleSaveCategoryMapping">
          <v-icon start>mdi-link-variant-plus</v-icon>
          EŞLEŞTİR VE KAYDET
        </v-btn>
      </div>

    </v-fade-transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import CategorySelectBoxComponent from '@/components/common/CategorySelectBoxComponent.vue'
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useAttributeMappingStore } from '@/stores/site/attributeMapping'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useMenuStore } from '@/stores/site/menu'
import { computedAsync } from '@vueuse/core'
import { useIntegrationStore } from '@/stores/integrationStore'

const eventBus: any = inject('eventBus');

const props = defineProps<{
  integrationCode: string,
  platformCategoryId: string
}>()

const emit = defineEmits(['close'])

const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const attributeMappingStore = useAttributeMappingStore()
const categoriesStore = useCategoriesStore()
const menuStore = useMenuStore()
const integrationStore = useIntegrationStore()
const loading = ref(false)
const tempLocalCategoryId = ref()

const mappingDefinition = computed(() => {
  return attributeMappingStore.getMappingDefinition(
    props.integrationCode,
    props.platformCategoryId,
    undefined
  )
})

const computedPlatformCategoryTitle = computedAsync(
  async () => {
    if (!props.platformCategoryId) return 'Kategori Seçilmedi'
    const category = await integrationStore.getIntegrationCategory3(
      props.integrationCode,
      props.platformCategoryId
    )
    return category?.title || 'İsimsiz Kategori'
  },
  'Yükleniyor...'
)


const isMapped = computed(() => {
  return !!mappingDefinition.value && !!mappingDefinition.value.localCategoryId
})

const localCategoryTitle = computed(() => {
  if (!mappingDefinition.value?.localCategoryId) return '-'
  return categoriesStore.getCategoryTitle(mappingDefinition.value.localCategoryId)
})

const openCategoryPage = () => {
  emit('close')
  let link: any = menuStore.getMenuLinkWithTitle('categoryList')
  eventBus.emit('openTab', link)
}

/**
 * Kategori Eşleştirmesini Kaydeder
 * Bu işlem, platform kategorisinin yerel karşılığını belirler.
 */
const handleSaveCategoryMapping = async () => {
  // 1. Validasyon: Yerel kategori seçilmemişse işlem yapma
  if (!tempLocalCategoryId.value) {
    snackbarStore.addSnackbar({ text: 'Lütfen bir yerel kategori seçin.', color: 'warning' })
    return
  }

  loading.value = true
  try {
    // 2. Store üzerindeki merkezi metodu çağırıyoruz
    const res = await attributeMappingStore.saveCategoryMapping({
      integrationCode: props.integrationCode,
      platformCategoryId: props.platformCategoryId,
      localCategoryId: tempLocalCategoryId.value
    })

    // 3. Başarılı ise UI geri bildirimlerini ver
    if (res) {
      snackbarStore.addSnackbar({
        text: 'Kategori eşleşmesi başarıyla tamamlandı.',
        color: 'success'
      })

      // Üst bileşeni haberdar et ve paneli kapat
      emit('close')
    }
  } catch (error: any) {
    // Hata durumunda (Store'dan throw edilen) kullanıcıyı bilgilendir
    snackbarStore.addSnackbar({
      text: error?.message || 'Kategori kaydedilirken bir hata oluştu.',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

</script>

<style scoped>
.mapping-step-box {
  border: 1px solid #eee;
  padding: 24px;
  border-radius: 16px;
  background: #ffffff;
}

.mapped-success-state {
  background-color: #f1f8e9;
  border: 1px solid #c5e1a5;
}

.context-card {
  background-color: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-xl);
  overflow: hidden;
}

.context-row {
  display: flex;
  align-items: center;
  padding: 10px 14px;
}

.context-col {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.context-label {
  font-size: 9px;
  text-transform: uppercase;
  color: var(--ek-color-content-subtle);
  font-weight: 700;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.context-value {
  font-size: 11px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-divider {
  padding: 0 10px;
}

.info-alert {
  border: 1px solid transparent;
  border-left: 4px solid #d32f2f !important;
}

.border-red-lighten-4 {
  border-color: #ffcdd2 !important;
}

.bg-red-lighten-5 {
  background-color: #ffebee !important;
}

.border-red-subtle {
  border-color: #ef9a9a !important;
}

.border-red {
  border: 2px solid #ef9a9a !important;
}

.uppercase-track {
  letter-spacing: 0.8px;
  text-transform: uppercase;
  font-size: 10px !important;
}

.premium-btn {
  border-radius: 10px !important;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  height: 44px !important;
}
</style>