<template>
  <div class="mapping-container">
    <v-btn icon="mdi-close" variant="text" size="x-small" class="mapping-close" @click="emit('close')"
      aria-label="Kapat"></v-btn>

    <v-fade-transition hide-on-leave mode="out-in">

      <div v-if="isMapped" :key="'mapped'"
        class="mapped-success-state d-flex align-start pa-4 rounded-lg">
        <v-icon color="success" size="28" class="mt-1">mdi-check-decagram-outline</v-icon>
        <div class="d-flex flex-column flex-grow-1">
          <span class="mapped-title">
            Eşleştirme Doğrulandı
          </span>
          <p class="mapped-text mt-1 mb-2">
            Pazaryeri değeri, sisteminizdeki
            <b class="mapped-strong">{{ getMappedLocalValueName }}</b>
            ile eşleşmiş durumda. Bu özellik artık aktarıma hazır.
          </p>
          <div class="d-flex align-center">
            <v-btn variant="text" color="success" size="x-small" class="pa-0 font-weight-medium"
              @click="openCategoryPage" prepend-icon="mdi-arrow-right-circle-outline">
              KATEGORİ LİSTESİNE GİT VE DÜZENLE
            </v-btn>
          </div>
        </div>
      </div>

      <div v-else-if="!hasMappingDefinition" :key="'no-def'" class="mapping-step-box">
        <div class="context-card mb-4">
          <div class="context-row">
            <div class="context-col">
              <span class="context-label">Pazaryeri Kategorisi</span>
              <span class="context-value">{{ computedPlatformCategoryTitle || '-' }}</span>
            </div>
            <div class="context-divider">
              <v-icon size="14" class="context-arrow">mdi-arrow-right</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label">Yerel Kategori</span>
              <span class="context-value context-value--pending">
                {{ categoriesStore.getCategoryTitle(mappingDefinition?.localCategoryId) || 'Tanımlanmadı' }}
              </span>
            </div>
          </div>
          <v-divider class="mx-3"></v-divider>

          <div class="context-row context-row--warning">
            <div class="context-col">
              <span class="context-label context-label--warning">Pazaryeri Özelliği</span>
              <span class="context-value context-value--warning">{{ attribute.attributeName }}</span>
            </div>
            <div class="context-divider">
              <v-icon size="16" color="warning">mdi-ray-start-arrow</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label context-label--warning">Yerel Seçenek Grubu</span>
              <span class="context-value context-value--pending">Seçim Bekleniyor...</span>
            </div>
          </div>
        </div>

        <div class="info-alert info-alert--warning pa-3 mb-5 rounded-lg">
          <div class="d-flex align-center mb-1">
            <v-icon size="16" color="warning" class="mr-2">mdi-layers-outline</v-icon>
            <span class="info-alert__title info-alert__title--warning uppercase-track">Özellik Analizi</span>
          </div>
          <p class="info-alert__text mb-1">
            <b>{{ attribute.attributeName }}</b> özelliği henüz sisteminizde bir gruba (Renk, Beden vb.) bağlı değil.
          </p>
        </div>

        <div class="d-flex align-center mb-4">
          <v-avatar color="warning-subtle" size="32" class="mr-3 step-badge step-badge--warning">
            <span class="step-badge__num step-badge__num--warning">1</span>
          </v-avatar>
          <span class="step-title">Seçenek Grubu Tanımlayın</span>
        </div>

        <v-autocomplete v-model="tempChoiceGroupId" :items="choicesStore.getChoices().value" item-title="title"
          item-value="_id" placeholder="Seçenek Grubu Seçin (Örn: Renkler)" density="compact" variant="outlined"
          class="customTextField mb-4" hide-details auto-select-first>
          <template v-slot:selection="{ item }: any">
            <span class="selection-text">
              {{ item.title }}
            </span>
          </template>
          <template v-slot:item="{ item, props: itemProps }: any">
            <v-list-item role="option" v-bind="itemProps" class="custom-category-item is-leaf-row" title="">
              <div class="d-flex align-center w-100 position-relative">
                <div class="leaf-indicator leaf-indicator--warning"></div>
                <v-icon size="18" class="mr-2" color="warning">mdi-layers-outline</v-icon>
                <span class="category-text text-truncate">{{ item.title }}</span>
              </div>
            </v-list-item>
          </template>
        </v-autocomplete>

        <v-btn block size="large" color="primary" elevation="0" :loading="loading"
          :disabled="!tempChoiceGroupId" class="font-weight-bold premium-btn" @click="handleSaveAttributeMapping">
          <v-icon start>mdi-layers-plus</v-icon>
          GRUBU BAĞLA VE DEVAM ET
        </v-btn>
      </div>

      <div v-else :key="'value-match'" class="mapping-step-box">
        <div class="context-card mb-4">
          <div class="context-row">
            <div class="context-col">
              <span class="context-label">Platform Kategorisi</span>
              <span class="context-value">{{ computedPlatformCategoryTitle }}</span>
            </div>
            <div class="context-divider">
              <v-icon size="14" color="info">mdi-swap-horizontal</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label">Yerel Kategori</span>
              <span class="context-value">{{ categoriesStore.getCategoryTitle(mappingDefinition?.localCategoryId) || '-'
              }}</span>
            </div>
          </div>
          <v-divider class="mx-3"></v-divider>
          <div class="context-row">
            <div class="context-col">
              <span class="context-label">Platform Özelliği</span>
              <span class="context-value">{{ mappingDefinition.platformAttributeName }}</span>
            </div>
            <div class="context-divider">
              <v-icon size="14" color="info">mdi-check-circle-outline</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label">Yerel Seçenek Grubu</span>
              <span class="context-value">
                {{choicesStore.getChoices().value.find((c: any) => c._id == mappingDefinition.localChoiceId)?.title ||
                  '-'}}
              </span>
            </div>
          </div>
          <v-divider class="mx-3"></v-divider>

          <div class="context-row context-row--info">
            <div class="context-col">
              <span class="context-label context-label--info">Platform Değeri</span>
              <span class="context-value context-value--info">{{ attribute.attributeValue }}</span>
            </div>
            <div class="context-divider">
              <v-icon size="16" color="info">mdi-ray-start-arrow</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label context-label--info">Yerel Değer</span>
              <span class="context-value context-value--pending">Seçim Bekleniyor...</span>
            </div>
          </div>
        </div>

        <div class="info-alert info-alert--info pa-3 mb-5 rounded-lg">
          <div class="d-flex align-center mb-1">
            <v-icon size="16" color="info" class="mr-2">mdi-link-variant-plus</v-icon>
            <span class="info-alert__title info-alert__title--info uppercase-track">Eşleştirme Analizi</span>
          </div>
          <p class="info-alert__text mb-1">
            <b>{{ attribute.attributeValue }}</b> değerinin sisteminizdeki karşılığını belirleyin.
          </p>
        </div>

        <div class="d-flex align-center mb-4">
          <v-avatar color="info-subtle" size="32" class="mr-3 step-badge step-badge--info">
            <span class="step-badge__num step-badge__num--info">2</span>
          </v-avatar>
          <span class="step-title">Değer Eşleştirme</span>
        </div>

        <v-autocomplete v-model="selectedChoiceValueId" :items="filteredChoices" item-title="title" item-value="_id"
          placeholder="Sistemdeki değer karşılığı..." density="compact" variant="outlined" class="customTextField mb-4"
          hide-details auto-select-first>
          <template v-slot:selection="{ item }: any">
            <span class="selection-text">
              {{ item.title }}
            </span>
          </template>
          <template v-slot:item="{ item, props: itemProps }: any">
            <v-list-item role="option" v-bind="itemProps" class="custom-category-item is-leaf-row" title="">
              <div class="d-flex align-center w-100 position-relative">
                <div class="leaf-indicator leaf-indicator--info"></div>
                <v-icon size="16" class="mr-2" color="info">mdi-circle-medium</v-icon>
                <span class="category-text text-truncate">{{ item.title }}</span>
              </div>
            </v-list-item>
          </template>
        </v-autocomplete>

        <v-btn block size="large" color="primary" elevation="0" :loading="loading"
          :disabled="!selectedChoiceValueId" class="font-weight-bold premium-btn"
          @click="handleSaveAttributeValueMapping">
          <v-icon start>mdi-link-variant</v-icon>
          EŞLEŞTİRMEYİ KAYDET
        </v-btn>
      </div>

    </v-fade-transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { useAttributeMappingStore } from '@/stores/site/attributeMapping'
import { useChoicesStore } from '@/stores/choicesStore'
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { computedAsync } from '@vueuse/core'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useMenuStore } from '@/stores/site/menu'

const eventBus: any = inject('eventBus');

const emit = defineEmits(['close'])

const props = defineProps<{
  integrationCode: string,
  platformCategoryId: string,
  attribute: any
}>()

const choicesStore = useChoicesStore()
const attributeMappingStore = useAttributeMappingStore()
const snackbarStore = useSnackbarStore()
const restApi = useRestApi()
const integrationStore = useIntegrationStore()
const categoriesStore = useCategoriesStore()
const menuStore = useMenuStore()

const loading = ref(false)
const tempChoiceGroupId = ref(null)
const selectedChoiceValueId = ref(null)

const mappingDefinition = computed(() => {
  if (!props.attribute?.attributeId) return null
  return attributeMappingStore.getMappingDefinition(
    props.integrationCode,
    props.platformCategoryId,
    props.attribute.attributeId
  )
})

const hasMappingDefinition = computed(() => !!mappingDefinition.value && !!mappingDefinition.value.localChoiceId)

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
  if (!props.attribute?.attributeId) return false
  return attributeMappingStore.isIntegrationAttributeValueMapped(
    props.integrationCode,
    props.platformCategoryId,
    props.attribute.attributeId,
    props.attribute.platformValueId,
    props.attribute.attributeValue
  )
})

const filteredChoices = computed(() => {
  if (!mappingDefinition.value) return []
  const group = choicesStore.getChoices().value.find((c: any) => c._id == mappingDefinition.value.localChoiceId)
  if (!group || !group.values) return []

  return group.values.filter((choiceValue: any) => {
    return !mappingDefinition.value.values?.some((v: any) => v.localValueId === choiceValue._id)
  })
})

/**
 * Özellik (Attribute) Eşleştirmesini Kaydeder
 * Pazaryeri özelliğini (Örn: Renk) sistemdeki bir Seçenek Grubuyla bağlar.
 */
const handleSaveAttributeMapping = async () => {
  // 1. Validasyon: Seçenek grubu seçilmemişse durdur
  if (!tempChoiceGroupId.value) {
    snackbarStore.addSnackbar({ text: 'Lütfen bir seçenek grubu seçin.', color: 'warning' })
    return
  }

  loading.value = true
  try {
    // 2. Payload Hazırlığı
    const payload = {
      integrationCode: props.integrationCode,
      platformCategoryId: props.platformCategoryId,
      platformAttributeId: props.attribute.attributeId,
      platformAttributeName: props.attribute.attributeName,

      // Kullanıcının v-autocomplete ile seçtiği Seçenek Grubu ID'si:
      localChoiceId: tempChoiceGroupId.value,

      // Kategori düzeyindeki eşleşmeden gelen yerel kategori ID'si:
      localCategoryId: mappingDefinition.value?.localCategoryId,

      // Teknik Konfigürasyonlar (Pazaryerinden gelen ham veriler)
      isVarianter: props.attribute.varianter,
      isSlicer: props.attribute.slicer,
      isAllowCustom: props.attribute.allowCustom,
      isRequired: props.attribute.required,
      isMultiple: props.attribute.multiple
    }

    // 3. Store Action Çağrısı
    const res = await attributeMappingStore.saveAttributeMapping(payload)

    if (res) {
      snackbarStore.addSnackbar({
        text: 'Seçenek grubu başarıyla bağlandı.',
        color: 'success'
      })

      // Not: Genellikle bu adımdan sonra panel kapanmaz, 
      // kullanıcı Değer Eşleme (Value Mapping) adımına geçer.
    }
  } catch (error: any) {
    snackbarStore.addSnackbar({
      text: error?.message || 'Özellik kaydedilirken bir hata oluştu.',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}


const getMappedLocalValueName = computed(() => {
  if (!mappingDefinition.value || (!props.attribute?.platformValueId && !props.attribute?.attributeValue)) {
    return 'Bilinmeyen Değer';
  }
  const valueMapping = mappingDefinition.value.values?.find((v: any) =>
    v.platformValueId === props.attribute.platformValueId ||
    v.platformValueName === props.attribute.attributeValue
  );
  if (!valueMapping) return 'Eşleşme Bulunamadı';
  const group = choicesStore.getChoices().value.find((c: any) => c._id == mappingDefinition.value.localChoiceId);
  const localValue = group?.values?.find((v: any) => v._id == valueMapping.localValueId);
  if (group && localValue) { return `${group.title} -> ${localValue.title}`; }
  else if (localValue) { return localValue.title; }
  return 'Eşleşen Değer Bilgisi Eksik';
});

const openCategoryPage = () => {
  emit('close')
  let link: any = menuStore.getMenuLinkWithTitle('categoryList')
  eventBus.emit('openTab', link)
}

/**
 * Özellik Değeri Eşleştirmesini Kaydeder
 */
const handleSaveAttributeValueMapping = async () => {
  // 1. Validasyon: Bir yerel değer seçilip seçilmediğini kontrol et
  if (!selectedChoiceValueId.value) {
    snackbarStore.addSnackbar({ text: 'Lütfen eşleşecek bir değer seçin.', color: 'warning' })
    return
  }

  loading.value = true
  try {
    // 2. Payload Hazırlığı: Store metoduna gönderilecek paket
    const payload = {
      integrationCode: props.integrationCode,
      platformCategoryId: props.platformCategoryId,
      platformAttributeId: props.attribute.attributeId,
      platformAttributeName: props.attribute.attributeName,
      // Store'daki mevcut tanımı kullanıyoruz:
      localChoiceId: mappingDefinition.value?.localChoiceId,

      // Pazaryerinden gelen ham değer bilgileri:
      platformValueName: props.attribute.attributeValue,
      platformValueId: props.attribute.platformValueId,

      // Kullanıcının v-autocomplete ile seçtiği yerel değer ID'si:
      localValueId: selectedChoiceValueId.value,

      // Teknik özellikler (Varianter, Slicer vb. props.attribute içinden yayıyoruz)
      isVarianter: props.attribute.varianter,
      isSlicer: props.attribute.slicer,
      isAllowCustom: props.attribute.allowCustom,
      isRequired: props.attribute.required,
      isMultiple: props.attribute.multiple
    }

    // 3. Store Action Çağrısı
    const res = await attributeMappingStore.saveAttributeValueMapping(payload)

    if (res) {
      snackbarStore.addSnackbar({
        text: 'Değer eşleştirmesi başarıyla tamamlandı.',
        color: 'success'
      })

      // İşlem bitince listeyi yenile ve paneli kapat
      emit('close')
    }
  } catch (error: any) {
    snackbarStore.addSnackbar({
      text: error?.message || 'Değer kaydedilirken bir hata oluştu.',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

</script>

<style scoped>
.mapping-container {
  position: relative;
  min-width: 360px;
}

@media (max-width: 480px) {
  .mapping-container {
    min-width: 0;
  }
}

.mapping-close {
  position: absolute;
  right: var(--ek-space-2);
  top: var(--ek-space-2);
  z-index: 100;
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
  font-size: var(--ek-font-size-sm);
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

.context-row--warning {
  background-color: var(--ek-color-warning-subtle);
}

.context-row--info {
  background-color: var(--ek-color-info-subtle);
}

.context-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.context-arrow {
  color: var(--ek-color-content-subtle);
}

.context-label {
  font-size: var(--ek-font-size-xs);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  margin-bottom: var(--ek-space-1);
}

.context-label--warning {
  color: var(--ek-color-warning);
}

.context-label--info {
  color: var(--ek-color-info);
}

.context-value {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-value--warning {
  color: var(--ek-color-warning);
  font-weight: var(--ek-font-weight-semibold);
}

.context-value--info {
  color: var(--ek-color-info);
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
  border-left: 4px solid var(--ek-color-border-strong);
}

.info-alert--warning {
  border-left-color: var(--ek-color-warning);
  background-color: var(--ek-color-warning-subtle);
}

.info-alert--info {
  border-left-color: var(--ek-color-info);
  background-color: var(--ek-color-info-subtle);
}

.info-alert__title {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
}

.info-alert__title--warning {
  color: var(--ek-color-warning);
}

.info-alert__title--info {
  color: var(--ek-color-info);
}

.info-alert__text {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}

.step-badge {
  border: 1px solid var(--ek-color-border-default);
}

.step-badge--warning {
  border-color: var(--ek-color-warning);
}

.step-badge--info {
  border-color: var(--ek-color-info);
}

.step-badge__num {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
}

.step-badge__num--warning {
  color: var(--ek-color-warning);
}

.step-badge__num--info {
  color: var(--ek-color-info);
}

.step-title {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.selection-text {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-default);
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

.custom-category-item {
  border-bottom: 1px solid var(--ek-color-border-default) !important;
  min-height: 40px !important;
}

.leaf-indicator {
  position: absolute;
  left: calc(-1 * var(--ek-space-4));
  height: 60%;
  width: 3px;
  border-radius: 0 var(--ek-radius-sm) var(--ek-radius-sm) 0;
}

.leaf-indicator--warning {
  background-color: var(--ek-color-warning);
}

.leaf-indicator--info {
  background-color: var(--ek-color-info);
}

.category-text {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-default);
  font-size: var(--ek-font-size-sm);
}

.is-leaf-row:hover {
  background-color: var(--ek-color-surface-muted) !important;
}

/* ================= FE-LOCAL-1048 — eşleştirme menüsü: ana sayfa dili =================
   Menü kartı zaten çerçevedir → iç kutunun ikinci çerçevesi / gölgesi yok. Bağlam satırları ince çizgiyle ayrılan
   bilgi hücreleri; uyarılar tonun DÜZ açık zemini + ince ton çerçevesi (kalın sol şerit yok); düğme düz, 8px köşe. */
.mapping-close {
  top: calc(-1 * var(--ek-space-10));
  right: 0;
}

.mapping-step-box {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.context-card {
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}

.context-card :deep(.v-divider) {
  margin: 0 !important;
  border-color: var(--ek-color-border-subtle);
  opacity: 1;
}

.context-label {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  margin-bottom: 2px;
}

.context-value {
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.context-value--pending {
  font-style: normal;
  font-weight: var(--ek-font-weight-regular);
}

.info-alert {
  border-left-width: 1px;
  border-radius: var(--ek-radius-control) !important;
}

.info-alert__title {
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
}

.info-alert__text {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
}

.mapped-success-state {
  border: 1px solid var(--ek-color-success-border);
  border-radius: var(--ek-radius-control) !important;
  background: var(--ek-color-success-subtle);
}

.mapped-title {
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-type-body-size);
}

.step-title {
  font-size: var(--ek-type-body-size);
}

.premium-btn {
  height: 40px !important;
  border-radius: var(--ek-radius-control) !important;
  letter-spacing: 0;
  box-shadow: none !important;
}

.context-label--warning,
.context-value--warning,
.info-alert__title--warning {
  color: var(--ek-color-warning-emphasis);
}

.context-label--info,
.context-value--info,
.info-alert__title--info {
  color: var(--ek-color-info-emphasis);
}

.info-alert--warning {
  border-color: var(--ek-color-warning-border);
}

.info-alert--info {
  border-color: var(--ek-color-info-border);
}

/* Adım rozeti: yuvarlak yerine çerçeveli kapsül (ikon kapsülleriyle aynı aile). */
.step-badge {
  border-radius: var(--ek-radius-tile) !important;
}

.step-badge--warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle) !important;
}

.step-badge--info {
  border-color: var(--ek-color-info-border);
  background: var(--ek-color-info-subtle) !important;
}

.step-badge__num--warning {
  color: var(--ek-color-warning-emphasis);
}

.step-badge__num--info {
  color: var(--ek-color-info-emphasis);
}

.custom-category-item {
  border-bottom-color: var(--ek-color-border-subtle) !important;
}

.leaf-indicator {
  display: none;
}
</style>
