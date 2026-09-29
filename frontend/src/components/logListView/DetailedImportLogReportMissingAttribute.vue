<template>
  <div class="mapping-container">
    <v-btn icon="mdi-close" variant="text" size="x-small" class="position-absolute"
      style="right: 8px; top: 8px; z-index: 100;" @click="emit('close')" aria-label="Kapat"></v-btn>

    <v-fade-transition hide-on-leave mode="out-in">

      <div v-if="isMapped" :key="'mapped'"
        class="mapped-success-state d-flex align-start pa-4 rounded-lg border-success shadow-sm">
        <v-icon color="success" size="28" class="mr-4 mt-1">mdi-check-decagram</v-icon>
        <div class="d-flex flex-column flex-grow-1">
          <span class="text-subtitle-2 font-weight-black text-success" style="line-height: 1.2;">
            Eşleştirme Doğrulandı
          </span>
          <p class="text-caption text-grey-darken-2 mt-1 mb-2">
            Pazaryeri değeri, sisteminizdeki
            <b class="text-grey-darken-4">{{ getMappedLocalValueName }}</b>
            ile eşleşmiş durumda. Bu özellik artık aktarıma hazır.
          </p>
          <div class="d-flex align-center">
            <v-btn variant="text" color="success" size="x-small" class="pa-0 font-weight-bold premium-text-btn"
              @click="openCategoryPage" prepend-icon="mdi-arrow-right-circle-outline">
              KATEGORİ LİSTESİNE GİT VE DÜZENLE
            </v-btn>
          </div>
        </div>
      </div>

      <div v-else-if="!hasMappingDefinition" :key="'no-def'" class="mapping-step-box shadow-sm">
        <div class="context-card mb-4 border-red-lighten-4">
          <div class="context-row">
            <div class="context-col">
              <span class="context-label">Pazaryeri Kategorisi</span>
              <span class="context-value">{{ computedPlatformCategoryTitle || '-' }}</span>
            </div>
            <div class="context-divider">
              <v-icon size="14" color="grey-lighten-1">mdi-arrow-right</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label">Yerel Kategori</span>
              <span class="context-value text-grey-darken-1 italic">
                {{ categoriesStore.getCategoryTitle(mappingDefinition?.localCategoryId) || 'Tanımlanmadı' }}
              </span>
            </div>
          </div>
          <v-divider class="mx-3 opacity-10"></v-divider>

          <div class="context-row bg-orange-lighten-5">
            <div class="context-col">
              <span class="context-label text-orange-darken-4">Pazaryeri Özelliği</span>
              <span class="context-value text-orange-darken-4 font-weight-black">{{ attribute.attributeName }}</span>
            </div>
            <div class="context-divider">
              <v-icon size="16" color="orange-darken-3">mdi-ray-start-arrow</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label text-orange-darken-4">Yerel Seçenek Grubu</span>
              <span class="context-value text-orange-darken-2 font-italic">Seçim Bekleniyor...</span>
            </div>
          </div>
        </div>

        <div class="info-alert pa-3 mb-5 rounded-lg bg-orange-lighten-5 border-orange-subtle">
          <div class="d-flex align-center mb-1">
            <v-icon size="16" color="orange-darken-3" class="mr-2">mdi-layers-outline</v-icon>
            <span class="text-caption font-weight-bold text-orange-darken-4 uppercase-track">Özellik Analizi</span>
          </div>
          <p class="text-caption text-grey-darken-3 mb-1">
            <b>{{ attribute.attributeName }}</b> özelliği henüz sisteminizde bir gruba (Renk, Beden vb.) bağlı değil.
          </p>
        </div>

        <div class="d-flex align-center mb-4">
          <v-avatar color="orange-lighten-4" size="32" class="mr-3 border-orange">
            <span class="text-subtitle-2 font-weight-black text-orange-darken-4">1</span>
          </v-avatar>
          <span class="text-subtitle-2 font-weight-black text-grey-darken-3">Seçenek Grubu Tanımlayın</span>
        </div>

        <v-autocomplete v-model="tempChoiceGroupId" :items="choicesStore.getChoices().value" item-title="title"
          item-value="_id" placeholder="Seçenek Grubu Seçin (Örn: Renkler)" density="compact" variant="outlined"
          class="customTextField mb-4" hide-details auto-select-first>
          <template v-slot:selection="{ item }: any">
            <span class="text-subtitle-2 font-weight-bold" style="color: var(--ek-color-passive-color)">
              {{ item.title }}
            </span>
          </template>
          <template v-slot:item="{ item, props: itemProps }: any">
            <v-list-item v-bind="itemProps" class="custom-category-item is-leaf-row" title="">
              <div class="d-flex align-center w-100 position-relative">
                <div class="leaf-indicator" style="background-color: #ef6c00;"></div>
                <v-icon size="18" class="mr-2" color="orange-darken-2">mdi-layers-outline</v-icon>
                <span class="category-text text-truncate">{{ item.title }}</span>
              </div>
            </v-list-item>
          </template>
        </v-autocomplete>

        <v-btn block size="large" color="orange-darken-3" elevation="0" :loading="loading"
          :disabled="!tempChoiceGroupId" class="font-weight-bold premium-btn" @click="handleSaveAttributeMapping">
          <v-icon start>mdi-layers-plus</v-icon>
          GRUBU BAĞLA VE DEVAM ET
        </v-btn>
      </div>

      <div v-else :key="'value-match'" class="mapping-step-box shadow-sm">
        <div class="context-card mb-4 border-blue-lighten-4">
          <div class="context-row">
            <div class="context-col">
              <span class="context-label">Platform Kategorisi</span>
              <span class="context-value">{{ computedPlatformCategoryTitle }}</span>
            </div>
            <div class="context-divider">
              <v-icon size="14" color="blue-lighten-3">mdi-swap-horizontal</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label">Yerel Kategori</span>
              <span class="context-value">{{ categoriesStore.getCategoryTitle(mappingDefinition?.localCategoryId) || '-'
              }}</span>
            </div>
          </div>
          <v-divider class="mx-3 opacity-10"></v-divider>
          <div class="context-row">
            <div class="context-col">
              <span class="context-label">Platform Özelliği</span>
              <span class="context-value">{{ mappingDefinition.platformAttributeName }}</span>
            </div>
            <div class="context-divider">
              <v-icon size="14" color="blue-lighten-3">mdi-check-circle-outline</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label">Yerel Seçenek Grubu</span>
              <span class="context-value text-grey-darken-1 font-weight-bold">
                {{choicesStore.getChoices().value.find((c: any) => c._id == mappingDefinition.localChoiceId)?.title ||
                  '-'}}
              </span>
            </div>
          </div>
          <v-divider class="mx-3 opacity-10"></v-divider>

          <div class="context-row bg-blue-lighten-5">
            <div class="context-col">
              <span class="context-label text-blue-darken-4">Platform Değeri</span>
              <span class="context-value font-weight-black text-blue-darken-4">{{ attribute.attributeValue }}</span>
            </div>
            <div class="context-divider">
              <v-icon size="16" color="blue-darken-2">mdi-ray-start-arrow</v-icon>
            </div>
            <div class="context-col text-right">
              <span class="context-label text-blue-darken-4">Yerel Değer</span>
              <span class="context-value text-blue-darken-3 font-italic">Seçim Bekleniyor...</span>
            </div>
          </div>
        </div>

        <div class="info-alert pa-3 mb-5 rounded-lg bg-blue-lighten-5 border-blue-subtle">
          <div class="d-flex align-center mb-1">
            <v-icon size="16" color="blue-darken-3" class="mr-2">mdi-link-variant-plus</v-icon>
            <span class="text-caption font-weight-bold text-blue-darken-4 uppercase-track">Eşleştirme Analizi</span>
          </div>
          <p class="text-caption text-grey-darken-3 mb-1">
            <b>{{ attribute.attributeValue }}</b> değerinin sisteminizdeki karşılığını belirleyin.
          </p>
        </div>

        <div class="d-flex align-center mb-4">
          <v-avatar color="blue-lighten-4" size="32" class="mr-3 border-blue">
            <span class="text-subtitle-2 font-weight-black text-blue-darken-4">2</span>
          </v-avatar>
          <span class="text-subtitle-2 font-weight-black text-grey-darken-3">Değer Eşleştirme</span>
        </div>

        <v-autocomplete v-model="selectedChoiceValueId" :items="filteredChoices" item-title="title" item-value="_id"
          placeholder="Sistemdeki değer karşılığı..." density="compact" variant="outlined" class="customTextField mb-4"
          hide-details auto-select-first>
          <template v-slot:selection="{ item }: any">
            <span class="text-subtitle-2 font-weight-bold" style="color: var(--ek-color-passive-color)">
              {{ item.title }}
            </span>
          </template>
          <template v-slot:item="{ item, props: itemProps }: any">
            <v-list-item v-bind="itemProps" class="custom-category-item is-leaf-row" title="">
              <div class="d-flex align-center w-100 position-relative">
                <div class="leaf-indicator" style="background-color: #0277bd;"></div>
                <v-icon size="16" class="mr-2" color="blue-darken-1">mdi-circle-medium</v-icon>
                <span class="category-text text-truncate">{{ item.title }}</span>
              </div>
            </v-list-item>
          </template>
        </v-autocomplete>

        <v-btn block size="large" color="blue-darken-3" elevation="0" :loading="loading"
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
  min-width: 360px;
}

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
  border-left: 4px solid transparent !important;
}

.bg-orange-lighten-5 {
  border-left-color: #ef6c00 !important;
  background-color: #fff9f2 !important;
}

.bg-blue-lighten-5 {
  border-left-color: #0277bd !important;
  background-color: #f0f7ff !important;
}

.border-orange-subtle {
  border-color: #ffe0b2 !important;
}

.border-blue-subtle {
  border-color: #bbdefb !important;
}

.border-orange {
  border: 2px solid #ffb74d !important;
}

.border-blue {
  border: 2px solid #0288d1 !important;
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

.italic {
  font-style: italic;
}

/* Premium List Item Stilleri */
.custom-category-item {
  border-bottom: 1px solid #f5f5f5 !important;
  min-height: 40px !important;
}

.leaf-indicator {
  position: absolute;
  left: -16px;
  height: 60%;
  width: 3px;
  border-radius: 0 4px 4px 0;
  box-shadow: 1px 0 6px rgba(0, 0, 0, 0.1);
}

.category-text {
  font-weight: 500;
  color: var(--ek-color-passive-color);
  font-size: 0.85rem;
}

.is-leaf-row:hover {
  background-color: #f5f7f9 !important;
}


.border-top-dashed {
  border-top: 1px dashed rgba(230, 108, 0, 0.2);
}

.border-top-dashed-blue {
  border-top: 1px dashed rgba(2, 119, 189, 0.2);
}
</style>