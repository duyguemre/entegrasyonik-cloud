<template>
  <EkDialogCard title="Seçenek Eşleştirme" icon="mdi-checkbox-multiple-marked-outline" width="custom"
    :description="integrationCategoryId ? `${integrationStore.getIntegrationTitle(integrationCode)} · ${integrationStore.getIntegrationCategory2(integrationCode, integrationCategoryId)?.title ?? ''}` : undefined"
    class="cm-card" @close="emits('close')">
    <LoadingComponent attach=".categoryDefinition" ref="loadingComponentRef"></LoadingComponent>

    <p v-if="!integrationCategoryId" class="cm-note">
      <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
      <span>Platform Kategori Eşleştirme bölümünden
        <strong>{{ integrationStore.getIntegrationTitle(integrationCode) }} Kategori</strong>sini belirleyiniz.</span>
    </p>

    <p v-else-if="!integrationChoice" class="cm-note">
      <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
      <span>Platform Kategori Eşleştirme bölümünden
        <strong>{{ integrationStore.getIntegrationTitle(integrationCode) }} - {{
          integrationStore.getIntegrationCategory2(integrationCode, integrationCategoryId)?.title }}</strong> kategorisi
        için <strong>Seçenek Grubu</strong>nu belirleyiniz.</span>
    </p>

    <template v-else>
      <EkFormSection title="Entegrasyonik seçenek grubu" icon="mdi-format-list-group" :columns="1">
        <v-select :items="choices" v-model="choice" return-object label="Entegrasyonik Seçenek Grubu"
          @update:model-value="reset">
          <template v-slot:item="{ item, index, props: itemProps }: any">
            <v-list-item role="option" v-bind="itemProps" :title="undefined">
              <div class="cm-option">
                <span class="cm-option__index ek-num">{{ index + 1 }}</span>
                <span class="cm-option__title">{{ item.title }}</span>
              </div>
            </v-list-item>
          </template>
        </v-select>

        <div v-if="choice" class="cm-toggles">
          <button type="button" class="cm-toggle" :class="{ 'is-on': isSlicer }" :aria-pressed="isSlicer"
            :disabled="isAnyOtherSlicerExists && !isSlicer" @click="toggleSlicer">
            <v-icon icon="mdi-filter-variant" size="16" aria-hidden="true" /> Grup (slicer)
          </button>
          <button type="button" class="cm-toggle" :class="{ 'is-on': isVarianter }" :aria-pressed="isVarianter"
            @click="toggleVarianter">
            <v-icon icon="mdi-layers-triple-outline" size="16" aria-hidden="true" /> Varyant
          </button>
          <span v-if="isAnyOtherSlicerExists && !isSlicer" class="cm-toggles__hint">
            Bu kategori için başka bir Grup (slicer) atanmış.
          </span>
        </div>
      </EkFormSection>

      <!-- Pazaryeri özellik değerleri alınamadı / boş geldi: eşleştirme alanı yerine anlaşılır durum (useIntegrationError). -->
      <EkFormSection v-if="choice && valuesError && !computedAllowCustom" title="Değer eşleştirme" icon="mdi-link-variant"
        :columns="1">
        <IntegrationErrorPanel :info="valuesError" :retrying="valuesLoading" @retry="emits('retryValues')" />
      </EkFormSection>

      <EkFormSection v-else-if="choice" title="Değer eşleştirme" icon="mdi-link-variant" :columns="3"
        :description="`${integrationStore.getIntegrationTitle(integrationCode)} değerleri Entegrasyonik değerleriyle eşleştirilir.`">
        <template v-for="choiceValue of choice?.values" :key="choiceValue._id">
          <v-text-field v-if="computedAllowCustom" v-model="mapping[choiceValue._id]" :label="choiceValue.title" />
          <v-autocomplete v-else item-value="id" item-title="title" :label="choiceValue.title"
            :items="integrationChoice.values" v-model="mapping[choiceValue._id]"
            :menu-props="{ closeOnContentClick: true }" auto-select-first clearable>
            <template v-slot:item="{ item, index, props: itemProps }: any">
              <v-list-item role="option" v-bind="itemProps" :title="undefined">
                <div class="cm-option">
                  <span class="cm-option__index ek-num">{{ index + 1 }}</span>
                  <span>{{ item.title }}</span>
                </div>
              </v-list-item>
            </template>
          </v-autocomplete>
        </template>
      </EkFormSection>
    </template>

    <template #actions>
      <EkButton tone="secondary" icon="mdi-auto-fix" :disabled="!choice" @click="autoMapping()">Otomatik Eşleştir</EkButton>
      <EkButton tone="primary" icon="mdi-content-save-outline" :disabled="!integrationChoice || !choice" @click="save">
        {{ $t('common.save') }}
      </EkButton>
    </template>
  </EkDialogCard>
</template>

<script setup lang="ts">
import { ref, computed, watch, onActivated, nextTick } from 'vue'
import EkDialogCard from '@/components/ds/EkDialogCard.vue'
import EkFormSection from '@/components/ds/EkFormSection.vue'
import EkButton from '@/components/ds/EkButton.vue'
import IntegrationErrorPanel from '@/components/integrations/IntegrationErrorPanel.vue'
import type { IntegrationErrorInfo } from '@/composables/useIntegrationError'
import { storeToRefs } from 'pinia'
import LoadingComponent from '@/components/LoadingComponent.vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import useRestApi from '@/composables/restapi'
import { useChoicesStore } from '@/stores/choicesStore'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useAttributeMappingStore } from '@/stores/site/attributeMapping'
import { asyncComputed, computedAsync } from '@vueuse/core'


const snackbarStore = useSnackbarStore()
const { choices } = storeToRefs(useChoicesStore())
const choicesStore = useChoicesStore()
const attributeMappingStore = useAttributeMappingStore()
const integrationStore = useIntegrationStore()
const restApi = useRestApi()

const props = defineProps<{
  integrationCode: any,
  integrationCategoryId: any,
  integrationChoice: any,
  localCategoryId: any,
  /** Pazaryeri özellik değerleri alınamadı/boş (CategorySyncComponent yükler); doluysa panel gösterilir. */
  valuesError?: IntegrationErrorInfo,
  valuesLoading?: boolean
}>()

const emits = defineEmits(['close', 'retryValues'])

const choice = ref()
const mapping = ref<any>({})
const originalMapping = ref<any>({})
const loadingComponentRef = ref<any>(null)

const isVarianter = ref(true)
const isSlicer = ref(false)

const reset = () => {
  isVarianter.value = true
  isSlicer.value = false
}
const isAnyOtherSlicerExists = computedAsync(async () => {
  if (!attributeMappingStore.mappings) {
    await attributeMappingStore.retrieveAttributeMappings()
  }
  const allData = attributeMappingStore.mappings || []
  console.log(attributeMappingStore.mappings)
  return allData.some((m: any) =>
    m.isSlicer &&
    m.localCategoryId === props.localCategoryId &&
    m.integrationCode === props.integrationCode &&
    String(m.platformAttributeId) !== String(props.integrationChoice?._id)
  )
})

const toggleSlicer = () => {
  console.log(isAnyOtherSlicerExists.value)
  if (isAnyOtherSlicerExists.value && !isSlicer.value) return
  isSlicer.value = !isSlicer.value
  if (isSlicer.value) isVarianter.value = false
}

const toggleVarianter = () => {
  isVarianter.value = !isVarianter.value
  if (isVarianter.value) isSlicer.value = false
}

const initChoice = async () => {
  mapping.value = {}
  isVarianter.value = true
  isSlicer.value = false


  if (!props.localCategoryId || !props.integrationChoice?._id) return

  let guid = loadingComponentRef.value?.info("Eşleşmeler kontrol ediliyor...")
  try {
    const response = await restApi.post("AttributeMappingService/getAttributeMapping", {
      localCategoryId: props.localCategoryId,
      integrationCode: props.integrationCode,
      platformAttributeId: props.integrationChoice._id
    })

    if (response) {
      if (response.localChoiceId) {
        choice.value = choices.value.find((c: any) => c._id === response.localChoiceId)
      }
      isVarianter.value = response.isVarianter
      isSlicer.value = response.isSlicer
      const savedMapping: any = {}
      if (response.values && Array.isArray(response.values)) {
        response.values.forEach((v: any) => {
          savedMapping[v.localValueId] = props.integrationChoice.allowCustom ? v.platformValueName : v.platformValueId
        })
      }
      mapping.value = savedMapping
      originalMapping.value = JSON.parse(JSON.stringify(savedMapping))
    }
  } finally {
    loadingComponentRef.value?.remove(guid)
  }
}

onActivated(() => { initChoice() })

watch(() => props.integrationChoice, async () => {
  choice.value = undefined
  await nextTick()
  initChoice()
})

const computedAllowCustom = computed(() => props.integrationChoice?.allowCustom)

const autoMapping = () => {
  if (!choice.value) return
  if (props.integrationChoice?.allowCustom) {
    choice.value.values.forEach((v: any) => { mapping.value[v._id] = v.title })
    return
  }
  isVarianter.value = choice.value.isVarianter;
  isSlicer.value = choice.value.isSlicer;
  choice.value.values.forEach((localVal: any) => {
    const match = props.integrationChoice.values.find((remoteVal: any) =>
      remoteVal.title.toLowerCase() === localVal.title.toLowerCase()
    )
    if (match) mapping.value[localVal._id] = match.id
  })
}

const save = async () => {
  if (!choice.value || !props.integrationChoice) return
  const formattedValues = Object.entries(mapping.value).map(([localId, remoteVal]) => {
    const remoteObj = props.integrationChoice.values?.find((v: any) => v.id === remoteVal)
    return {
      localValueId: localId,
      platformValueId: props.integrationChoice.allowCustom ? null : remoteVal,
      platformValueName: props.integrationChoice.allowCustom ? remoteVal : (remoteObj?.title || '')
    }
  }).filter(v => (v.platformValueName || v.platformValueId))

  const request = {
    integrationCode: props.integrationCode,
    localCategoryId: props.localCategoryId,
    platformCategoryId: props.integrationCategoryId,
    platformAttributeId: props.integrationChoice._id,
    platformAttributeName: props.integrationChoice.title,
    localChoiceId: choice.value._id,
    isVarianter: isVarianter.value,
    isSlicer: isSlicer.value,
    isRequired: props.integrationChoice.required || false,
    values: formattedValues
  }

  let guid = loadingComponentRef.value.info("Eşleşmeler kaydediliyor...")
  try {
    const response = await attributeMappingStore.saveAttributeMapping(request)
    if (response && response.result) {
      snackbarStore.addSnackbar({
        show: true, text: 'Seçenek eşlemesi başarıyla kaydedildi', timeout: 2000, color: 'success'
      })
      originalMapping.value = JSON.parse(JSON.stringify(mapping.value))
    }
  } finally {
    loadingComponentRef.value.remove(guid)
  }
}

watch(() => choice.value, () => {
  if (!choice.value) mapping.value = {}
})
</script>

<style scoped>
.cm-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: var(--ek-space-4) 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-body-size);
}

.cm-toggles {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.cm-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.cm-toggle:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.cm-toggle.is-on {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.cm-toggle:disabled {
  color: var(--ek-color-content-subtle);
  cursor: not-allowed;
}

.cm-toggles__hint {
  color: var(--ek-color-error);
  font-size: var(--ek-type-caption-size);
}

.cm-option {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.cm-option__index {
  min-width: var(--ek-space-6);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.cm-option__title {
  font-weight: var(--ek-font-weight-semibold);
}
</style>
