<template>
  <div class="category-mapping-wrapper">

    <v-btn icon="mdi-close" variant="text" size="x-small" class="mapping-close" @click="emit('close')"
      aria-label="Kapat"></v-btn>


    <v-fade-transition hide-on-leave mode="out-in">

      <div v-if="isMapped" :key="'mapped-state'"
        class="mapped-success-state d-flex align-start pa-4 rounded-lg">
        <v-icon color="success" size="32" class="mr-4 mt-1">mdi-check-decagram</v-icon>
        <div class="d-flex flex-column">
          <span class="mapped-title">
            Kategori Eşleşmesi Doğrulandı
          </span>
          <p class="mapped-text mt-1 mb-2">
            Ürün çekim işleminde bu kategori için eşleşme bulunamamıştı, ancak şu an sisteminizdeki
            <b class="mapped-strong">{{ localCategoryTitle }}</b>
            ile başarıyla bağlı durumda. Detaylı inceleme veya değişiklik için kategori sayfasına gidebilirsiniz.
          </p>
          <div class="d-flex align-center">
            <v-btn variant="text" color="success" size="x-small" class="pa-0 font-weight-medium" @click="openCategoryPage"
              prepend-icon="mdi-arrow-right-circle-outline">
              KATEGORİ LİSTESİNE GİT VE DÜZENLE
            </v-btn>
          </div>
        </div>
      </div>

      <div v-else :key="'selection-state'" class="mapping-step-box">
        <div class="context-card mb-4">
          <div class="context-row context-row--danger">
            <div class="context-col">
              <span class="context-label context-label--danger">Pazaryeri Kategorisi</span>
              <span class="context-value context-value--danger">
                {{ computedPlatformCategoryTitle || 'Yükleniyor...' }}
              </span>
            </div>
            <div class="context-divider">
              <v-icon size="16" color="error">mdi-ray-start-arrow</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label context-label--danger">Yerel Kategori</span>
              <span class="context-value context-value--pending">Eşleşme Bekleniyor...</span>
            </div>
          </div>
        </div>

        <div class="info-alert pa-3 mb-5 rounded-lg">
          <div class="d-flex align-center mb-1">
            <v-icon size="16" color="error" class="mr-2">mdi-alert-circle-outline</v-icon>
            <span class="info-alert__title uppercase-track">Eksik Karşılık</span>
          </div>
          <p class="info-alert__text mb-0">
            Aktarımın tamamlanabilmesi için bu kategorinin sisteminizde hangi kategoriye karşılık geldiğini
            seçmelisiniz.
          </p>
        </div>

        <div class="d-flex align-center mb-4">
          <span class="step-title">Yerel Kategori Seçin</span>
        </div>

        <CategorySelectBoxComponent v-model="tempLocalCategoryId" :noInit="true" :withAll="false" class="mb-4" />

        <v-btn block size="large" color="primary" elevation="0" :loading="loading" :disabled="!tempLocalCategoryId"
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
.category-mapping-wrapper {
  position: relative;
}

.mapping-close {
  position: absolute;
  right: var(--ek-space-2);
  top: var(--ek-space-2);
  z-index: 10;
}

.mapping-step-box {
  border: 1px solid var(--ek-color-border-default);
  padding: var(--ek-space-6);
  border-radius: var(--ek-radius-xl);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-sm);
}

.mapped-success-state {
  background-color: var(--ek-color-success-subtle);
  border: 1px solid var(--ek-color-border-default);
  border-left: 4px solid var(--ek-color-success);
  gap: var(--ek-space-4);
}

.mapped-title {
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-success);
  line-height: var(--ek-line-height-tight);
}

.mapped-text {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}

.mapped-strong {
  color: var(--ek-color-content-strong);
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
  padding: var(--ek-space-3) var(--ek-space-4);
}

.context-row--danger {
  background-color: var(--ek-color-error-subtle);
}

.context-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.context-label {
  font-size: var(--ek-font-size-xs);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  margin-bottom: var(--ek-space-1);
}

.context-label--danger {
  color: var(--ek-color-error);
}

.context-value {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-value--danger {
  color: var(--ek-color-error);
  font-weight: var(--ek-font-weight-semibold);
}

.context-value--pending {
  color: var(--ek-color-content-muted);
  font-style: italic;
}

.context-divider {
  padding: 0 var(--ek-space-3);
}

.info-alert {
  border: 1px solid var(--ek-color-border-default);
  border-left: 4px solid var(--ek-color-error);
  background-color: var(--ek-color-error-subtle);
}

.info-alert__title {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-error);
}

.info-alert__text {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}

.step-title {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.uppercase-track {
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.premium-btn {
  border-radius: var(--ek-radius-lg) !important;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  height: 44px !important;
}
</style>
