<template>
  <div>
    <LoadingComponent attach=".brandDefinition" ref="loadingComponentRef"></LoadingComponent>
    <v-select :rules="mandatory == true ? formRules.mandatoryRule : []" density="compact"
      v-model="selectedIntegrationBrand" return-object item-value="id" item-title="title" :items="integrationBrands"
      @update:modelValue="emits('change', '')" variant="outlined" class="customTextField"
      :hint="$t('productDefinitions.brand.platformDesc')" persistent-hint>
      <template #label>
        <div>
          {{ integrationStore.getIntegration(integrationCode)?.title }}
          <span v-if="!selectedIntegrationBrand">Markası Seçiniz</span>
          <span v-else>Markası</span>
          <v-icon v-if="mandatory == true" size="12" class="mb-2 ml-1">mdi-asterisk</v-icon>
        </div>
      </template>
      <template #no-data>
        <div class="ma-6 mt-6 dialog-info1 fill-height align-center justify-center text-center" style="max-width:600px">
          <div class="d-flex align-center text-center justify-center " style="font-size:.8em">
            <v-icon class="mr-0" color="processButtonColor">mdi-lightbulb-outline</v-icon>
            <span v-if="!brandSearchText || brandSearchText?.length < 2">Marka Araması Yapınız</span>
            <span v-else>Marka Bulunamadı</span>
          </div>
        </div>
      </template>
      <template v-slot:selection="{ item, index }">
        {{ item.title }}
      </template>
      <template v-slot:prepend-item>
        <v-list-item class="" style="border:1px solid #ddd;border-top:none">
          <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop variant="outlined" @mousedown.stop
            @keydown.stop density="compact" type="tel" maxlength="160" class="mt-2" clearable counter
            bg-color="textfieldColor" :rules="formRules.searchRules" @update:model-value="checkAndStartSearch"
            v-model="brandSearchText" :hint="$t('productDefinitions.brand.searchDesc')">
            <template v-slot:label>
              <span class="font-weight-light">
                Marka Adı
              </span>
            </template>
          </v-text-field>
        </v-list-item>
      </template>
      <template v-slot:item="{ item, index, props }: any">
        <v-list-item v-bind="props" class="" style="border:1px solid #ddd;border-top:none">
          <template #title>
          </template>
          <div class="d-flex justify-start align-center ml-6">
            <div class="mr-2 font-weight-thin" v-if="item.raw.id != -1">
              {{ index + 1 }}
            </div>
            {{ item.title }}
          </div>
        </v-list-item>
      </template>
    </v-select>
  </div>
</template>

<script lang="ts" setup>
import { computed, watch, inject, nextTick, ref, onBeforeMount, onMounted, onBeforeUnmount } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore';
import { useI18n } from 'vue-i18n';
import useFormRules from '@/composables/formrules';
import LoadingComponent from '@/components/LoadingComponent.vue'

const constantOption = [{ id: -1, title: 'Marka Seçiniz' }]
const integrationStore = useIntegrationStore()
const integrationBrands = ref()
const emits = defineEmits(['change'])
const loadingComponentRef: any = ref(null)

const selectedIntegrationBrand: any = defineModel({ default: undefined })
const props = defineProps<{
  withAll?: boolean,
  mandatory?: boolean,
  integrationCode: any
}>()

const { t } = useI18n()
const formRules: any = useFormRules()
const brandSearchText = ref()

onMounted(() => {
  /*   selectedIntegrationBrand.value = constantOption */
})

watch(() => props.integrationCode, () => {
  checkAndStartSearch()
})

const checkAndStartSearch = async () => {
  await nextTick(() => { })
  if (!brandSearchText.value || brandSearchText.value.length < 2) {
    integrationBrands.value = undefined
    /*     selectedIntegrationBrand.value = constantOption
        integrationBrands.value = constantOption */
    return
  }
  let guid = loadingComponentRef.value.info("")
  integrationBrands.value = await integrationStore.retrieveIntegrationBrands(props.integrationCode, brandSearchText.value)
  /*   if (integrationBrands.value != undefined) {
      integrationBrands.value = constantOption.concat(integrationBrands.value)
    } else integrationBrands.value = constantOption */
  /*   const found = integrationBrands.value.find((item: any) => item.id == selectedIntegrationBrand.value?.id) */
  /*   if (!found) selectedIntegrationBrand.value = constantOption */
  loadingComponentRef.value.remove(guid)
}


</script>

<style scoped></style>