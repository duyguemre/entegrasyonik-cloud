<template>
  <LoadingComponent attach=".productListView" ref="loadingComponentRef"></LoadingComponent>

  <v-card variant="elevated" class="ma-0 pa-0" elevation="1"
    style="transition: none!important;box-shadow: none; transform: none!important;right:0;background-color:#f3f3f3"
    height="100%">
    <v-card-title>
      <div style="position:absolute;top:0px;left:0px;right:0;height:1px;width:auto;opacity:.9;background-color:red"
        class="elevation-1">
      </div>
      <v-btn
        style="position:absolute;top:0px;right:0px;height:40px;width:40px; opacity:.9;border-radius:0;border-bottom-left-radius:20px;"
        @click="emits('close')" elevation="1" min-width="0" color="red"><v-icon
          size="x-large">mdi-close</v-icon></v-btn>
      <v-btn
        style="position:absolute;top:0px;left:0px;height:40px;width:40px; opacity:.9;border-radius:0;border-bottom-right-radius:20px;"
        @click="emits('close')" elevation="1" min-width="0" color="red"><v-icon
          size="x-large">mdi-close</v-icon></v-btn>

      <div class="font-weight-light ml-8 text-body-1" style="position:absolute;top:2px;left:20px;opacity:.8">
        <span class="ml-2 mr-2"></span>
        <span class="font-weight-bold text-h6">
          <v-icon class="mr-0" style="opacity:.7" size="20">mdi-tag-outline</v-icon>
          {{ $t('productDefinitions.product.variants.batch') }}</span>
      </div>


    </v-card-title>
    <v-form ref="batchProcessFormsFormRef" v-model="isUpdatesProductFormValid">
      <v-card v-if="batchProcessForm"
        style="position:absolute;overflow-y:auto;top: 48px;left:0;right:0;bottom:70px;border-top:1px solid #ddd;background-color:#eee"
        variant="flat">
        <v-card-text class="fill-height">

          <v-row class="fill-height">
            <v-col cols="4">
              <v-card variant="outlined" class="mb-0 mt-0 pt-0" style="border-color:transparent">
                <v-card-text>

                  <v-select prepend-icon="mdi-help-rhombus-outline" density="compact" v-model="batchProcessForm.scope"
                    :items="scopes" label="Hangi Ürünler Dahil Olacak?" variant="outlined" bg-color="textfieldColor">
                  </v-select>


                  <div class="d-flex">
                    <v-checkbox v-model="batchProcessForm.saleStatus" label="Satış Durumu" class="ml-8"></v-checkbox>

                    <v-switch :disabled="!batchProcessForm.saleStatus" v-model="batchProcessForm.onsale"
                      class="ml-0 mb-6" color="processButtonColor" hide-details density="compact">
                      <template #label>
                        <div class="font-weight-normal mt-0" style="line-height: 1;font-size:14px!important">
                          Satışa
                          <span v-if="batchProcessForm.onsale == true">Açık</span>
                          <span v-else class="font-weight-bold text-red">Kapalı</span>
                        </div>
                      </template>
                    </v-switch>
                  </div>

                  <CategorySelectBoxComponent v-model="batchProcessForm.category" :mandatory="true" />
                  <BrandSelectBoxComponent v-model="batchProcessForm.brand" :mandatory="true" />

                </v-card-text>
              </v-card>
            </v-col>
            <v-col>
              <v-card variant="outlined" class="mb-0 mt-0 pt-0 fill-height"
                style="border-color:transparent;overflow-y:auto;">
                <v-card-text style="height:90%">

                  <v-checkbox v-model="batchProcessForm.platformUploadStatus" label="Platform Yükleme Durumu"
                    class="ml-0"></v-checkbox>

                  <div class="d-flex flex-wrap">
                    <template v-if="integrationStore"
                      v-for="(integration, index) of integrationStore.getClientMarketplaces().filter((item: any) => item.type.code == 'marketplace')">
                      <IntegrationAvatarComponent mode="text" :platform="integration" width="120px" height="65px"
                        :style="batchProcessForm.platformUploadStatus && batchProcessForm.platformUploads && batchProcessForm.platformUploads[integration.code] && batchProcessForm.platformUploads[integration.code].isReady ?
                          { 'background-color': integration.color, opacity: 1, border: '1px solid #ddd' } :
                          { 'background-color': '#555', opacity: .6, border: '1px solid white' }" class="mb-2 mr-1"
                        style="cursor:pointer"
                        @click.stop="batchProcessForm.platformUploadStatus ? setPlatformUploads(integration.code) : ''" />
                    </template>
                  </div>

                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
      <div style="position:absolute;bottom:0px;width:100%;border-top:1px solid #ddd" class="pa-4">
        <v-row>
          <v-col>
            <v-btn-group elevation="1" class="d-block" density="compact">
              <v-btn density="compact" block class="fill-height" color="processButtonColor"
                @click="resetBatchProcessForm">
                <span class="">
                  <v-icon>mdi-undo-variant</v-icon> {{ $t('common.clear') }}
                </span></v-btn>
            </v-btn-group>
          </v-col>
          <v-col>
            <v-btn-group elevation="1" class="d-block" density="compact">
              <v-btn density="compact" block class="fill-height" color="deleteButtonColor"
                @click="validateAndBatchProcessDelete">
                <span class="">
                  <v-icon>mdi-delete</v-icon> {{ $t('common.batchDelete') }}
                </span></v-btn>
            </v-btn-group>
          </v-col>
          <v-col>
            <v-btn-group elevation="1" class="d-block" density="compact">
              <v-btn density="compact" block class="fill-height" color="saveButtonColor"
                @click="validateAndBatchProcessUpdate">
                <span class="">
                  <v-icon>mdi-refresh</v-icon> {{ $t('common.batchUpdate') }}
                </span></v-btn>
            </v-btn-group>
          </v-col>
        </v-row>
      </div>
    </v-form>
  </v-card>
</template>

<script setup lang="ts">
import { ref, inject, nextTick, watch, computed, onActivated, onBeforeMount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'
import useFormRules from '@/composables/formrules';
import useIntegrations from '@/composables/integrations';
import CategorySelectBoxComponent from '@/components/common/CategorySelectBoxComponent.vue'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import useRestApi from '@/composables/restapi'
import IntegrationAvatarComponent from '@/components/IntegrationAvatarComponent.vue';
import { useIntegrationStore } from '@/stores/integrationStore';

const integrationStore = useIntegrationStore()

const restApi = useRestApi()

const formRules = useFormRules()
const integrations: any = useIntegrations()
const isUpdatesProductFormValid = ref(false)
const batchProcessFormsFormRef: any = ref(null)
const marketPrice: any = ref()
const salePrice: any = ref()
const loadingComponentRef: any = ref(null)

const batchProcessForm: any = ref({})
const { t } = useI18n()

const props = defineProps<{
  selectedProducts: any,
  searchProductForm: any
}>()

const batchProcessFormMenu: any = defineModel({ default: false })
const scopes = ref([{ value: 0, title: 'Tablodan Seçilenler' }, { value: 1, title: 'Sorgu Sonucu Eşleşenler' }, { value: 2, title: 'Bütün Ürünler' }])
const emits = defineEmits(['refreshProducts', 'close'])

onMounted(() => {
  resetBatchProcessForm()
})

const setPlatformUploads = (integrationCode: string) => {
  batchProcessForm.value.platformUploads ||= {};
  const platformUpload = batchProcessForm.value.platformUploads[integrationCode] ||= {};
  platformUpload.isReady = platformUpload.isReady ?? true ? !platformUpload.isReady : true;
}

const resetBatchProcessForm = () => {
  batchProcessForm.value.scope = 0
  batchProcessForm.value.onsale = false
  batchProcessForm.value.saleStatus = false
  /*   batchProcessForm.value.prices = { ...props.productInfoForm.prices }
    batchProcessForm.value.prices.isPlatformBasedPrice = props.productInfoForm.prices.isPlatformBasedPrice */
}






const validateAndBatchProcessUpdate = async () => {
  await batchProcessFormsFormRef.value?.validate()
  if (isUpdatesProductFormValid.value == false) return

  let guid = loadingComponentRef.value.info(t('loading.info.batchProcessUpdate'))
  const variantIds = []
  const request: any = {
    batchProcessForm: batchProcessForm.value,
    scope: batchProcessForm.value.scope
  }
  switch (batchProcessForm.value.scope) {
    case 0:
      request.selectedProducts = props.selectedProducts
      break
    case 1:
      request.searchProductForm = props.searchProductForm
      break
    case 2:
      break
  }

  const response = await restApi.post("ProductService/batchProcessUpdate", request)
  loadingComponentRef.value.remove(guid)

  if (response && response.modifiedCount > 0) {
    emits('refreshProducts')
    batchProcessFormMenu.value = false
  } else {
    console.log("error", response)
  }
  //  batchProcessFormMenu.value = false

}

const validateAndBatchProcessDelete = async () => {
  let guid = loadingComponentRef.value.info(t('loading.info.batchProcessDelete'))

  const request: any = {
    batchProcessForm: batchProcessForm.value,
    scope: batchProcessForm.value.scope
  }
  switch (batchProcessForm.value.scope) {
    case 0:
      request.selectedProducts = props.selectedProducts
      break
    case 1:
      request.searchProductForm = props.searchProductForm
      break
    case 2:
      break
  }

  const response = await restApi.post("ProductService/batchProcessDelete", request)
  loadingComponentRef.value.remove(guid)
  if (response && response.deletedCount > 0) {
    emits('refreshProducts')
  } else {
    console.log("error", response)
  }
  // batchProcessFormMenu.value = false
}



</script>

<style scoped></style>