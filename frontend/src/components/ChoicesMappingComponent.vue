<template>
  <CardComponent icon="mdi-checkbox-multiple-marked" title="Seçenek Eşleştirme" :isHovered="false"
    style="overflow-y:scroll;border:1px solid #ddd;height:calc(100vh - 110px)!important">
    <LoadingComponent attach=".categoryDefinition" ref="loadingComponentRef"></LoadingComponent>

    <template #header>
      <v-tooltip open-delay="1000" text="Eşleştirmelerin otomatik yapılması için...">
        <template v-slot:activator="{ props: tooltipProps }">
          <v-btn-group elevation="0" class="ml-2" density="compact">
            <v-btn v-bind="tooltipProps" density="compact" color="processButtonColor"
              style="min-width:150px;border:1px solid #aaa;" :disabled="!choice" @click="autoMapping()">
              <span>Otomatik Eşleştir</span>
            </v-btn>
          </v-btn-group>
        </template>
      </v-tooltip>

      <v-tooltip open-delay="1000">
        <template v-slot:activator="{ props: tooltipProps }">
          <v-btn-group elevation="0" class="ml-2" density="compact">
            <v-btn v-bind="tooltipProps" :disabled="!integrationChoice || !choice" density="compact" color="#E53935ff"
              style="min-width:150px;border:1px solid #aaa;" @click="save">
              <span>{{ $t('common.save') }}</span>
            </v-btn>
          </v-btn-group>
        </template>
      </v-tooltip>

      <v-btn style="border:1px solid #bbb;width:30px; opacity:.9;" @click="emits('close')" elevation="0" class="ml-2"
        min-width="0" color="white"><v-icon size="x-large" color="primary">mdi-close</v-icon></v-btn>
    </template>

    <div v-if="!integrationCategoryId" class="mt-12 d-flex justify-center">
      Platform Kategori Eşleştirme bölümünden
      <span class="pr-0 pl-1 font-weight-bold">{{ integrationStore.getIntegrationTitle(integrationCode) }}
        Kategori</span>sini belirleyiniz.
    </div>

    <div v-else-if="!integrationChoice" class="mt-12 d-flex justify-center">
      Platform Kategori Eşleştirme bölümünden
      <span class="pr-1 pl-1 font-weight-bold">{{ integrationStore.getIntegrationTitle(integrationCode) }} - {{
        integrationStore.getIntegrationCategory2(integrationCode, integrationCategoryId)?.title }}</span> kategorisi
      için
      <span class="font-weight-bold pl-1"> Seçenek Grubu</span>nu belirleyiniz.
    </div>

    <div v-else>

      <div class="d-flex mb-4 align-center" v-if="choice">
        <v-chip size="x-small" :color="isSlicer ? 'green-darken-1' : 'grey-lighten-2'"
          :disabled="isAnyOtherSlicerExists && !isSlicer" variant="flat" class="mr-2 font-weight-bold rounded-xl"
          @click="toggleSlicer">
          <v-icon start size="12">mdi-filter-variant</v-icon> GRUP (SLICER)
        </v-chip>
        <v-chip size="x-small" :color="isVarianter ? 'primary' : 'grey-lighten-2'" variant="flat"
          class="font-weight-bold rounded-xl" @click="toggleVarianter">
          <v-icon start size="12">mdi-layers-triple</v-icon> VARYANT
        </v-chip>
        <span v-if="isAnyOtherSlicerExists && !isSlicer" class="text-caption text-red ml-2"
          style="font-size: 10px!important">
          * Bu kategori için başka Grup(Slicer) atanmış.
        </span>
      </div>


      <v-select variant="outlined" density="compact" :items="choices" v-model="choice" return-object hide-details
        class="mb-4 customTextField" @update:model-value="reset">
        <template v-slot:label>Entegrasyonik Seçenek Grubu</template>

        <template v-slot:selection="{ item }: any">
          <span class="font-weight-bold" style="color: rgb(var(--v-theme-black))">
            {{ item.title }}
          </span>
        </template>

        <template v-slot:item="{ item, index, props: itemProps }: any">
          <v-list-item v-bind="itemProps" class="custom-list-item">
            <template v-slot:title>
              <div class="d-flex align-center">
                <span class="index-column">{{ index + 1 }}</span>
                <span class="text-body-2" style="color: rgb(var(--v-theme-passiveColor));font-weight:bold">{{
                  item.title
                  }}</span>
              </div>
            </template>
          </v-list-item>
        </template>
      </v-select>

      <v-divider class="ma-8" />

      <div class="d-flex align-start justify-center" v-if="choice">
        <div class="flex-grow-1">
          <v-row>
            <v-col cols="12" md="6" sm="12" lg="4" xl="3" v-for="choiceValue of choice?.values" :key="choiceValue._id">

              <v-text-field v-if="computedAllowCustom" variant="outlined" density="compact" hide-details
                v-model="mapping[choiceValue._id]" bg-color="textfieldColor" class="customTextField">
                <template v-slot:label>{{ choiceValue.title }}</template>
              </v-text-field>

              <v-autocomplete v-else variant="outlined" density="compact" bg-color="textfieldColor" item-value="id"
                item-title="title" :label="choiceValue.title" :items="integrationChoice.values"
                v-model="mapping[choiceValue._id]" hide-details class="customTextField"
                :menu-props="{ closeOnContentClick: true, contentClass: 'custom-autocomplete-menu' }" auto-select-first
                clearable>
                <template v-slot:selection="{ item }: any">
                  <span class="font-weight-bold" style="color: rgb(var(--v-theme-passiveColor))">
                    {{ item.title }}
                  </span>
                </template>

                <template v-slot:item="{ item, index, props: itemProps }: any">
                  <v-list-item v-bind="itemProps" class="custom-list-item">
                    <template v-slot:title>
                      <div class="d-flex align-center">
                        <span class="index-column">{{ index + 1 }}</span>
                        <span class="text-body-2">{{ item.title }}</span>
                      </div>
                    </template>
                  </v-list-item>
                </template>
              </v-autocomplete>

            </v-col>
          </v-row>
        </div>
      </div>
    </div>
  </CardComponent>
</template>

<script setup lang="ts">
import { ref, computed, watch, onActivated, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import LoadingComponent from '@/components/LoadingComponent.vue'
import CardComponent from '@/components/CardComponent.vue'
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
  localCategoryId: any
}>()

const emits = defineEmits(['close'])

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
/* Index kolonu için stil: Silik ve sabit genişlik */
.index-column {
  min-width: 30px;
  font-weight: 200;
  opacity: 0.5;
  font-size: 0.85rem;
}

/* Liste öğesi için padding ayarı */
.custom-list-item {
  border-bottom: 1px solid #eee;
  min-height: 40px !important;
  font-weight: bold;
  color: rgb(var(--v-theme-passiveColor));
  padding-left: 12px !important;
}

/* Seçim kutularının içindeki yazı boyutu ve genel hizalama */
:deep(.customTextField .v-field__input) {
  font-size: 0.9rem !important;
  color: rgb(var(--v-theme-passiveColor)) !important;
  font-weight: bold !important;
}

/* Autocomplete menü genişliği ve sınırları */
:deep(.custom-autocomplete-menu) {
  border: 1px solid #ddd !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1) !important;
}
</style>