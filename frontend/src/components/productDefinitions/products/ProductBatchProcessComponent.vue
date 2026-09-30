<template>
  <LoadingComponent attach=".productListView" ref="loadingComponentRef"></LoadingComponent>

  <v-card variant="elevated" class="bp-panel ma-0 pa-0" elevation="1"
    height="100%">
    <v-card-title>
      <div class="bp-panel__topline elevation-1">
      </div>
      <v-btn class="bp-panel__close bp-panel__close--right"
        @click="emits('close')" elevation="1" min-width="0" color="error"><v-icon
          size="x-large">mdi-close</v-icon></v-btn>
      <v-btn class="bp-panel__close bp-panel__close--left"
        @click="emits('close')" elevation="1" min-width="0" color="error"><v-icon
          size="x-large">mdi-close</v-icon></v-btn>

      <div class="bp-panel__heading font-weight-light ml-8 text-body-1">
        <span class="ml-2 mr-2"></span>
        <span class="font-weight-bold text-h6">
          <v-icon class="bp-panel__heading-icon mr-0" size="20">mdi-tag-outline</v-icon>
          {{ $t('productDefinitions.product.variants.batch') }}</span>
      </div>


    </v-card-title>
    <v-form ref="batchProcessFormsFormRef" v-model="isUpdatesProductFormValid">
      <v-card v-if="batchProcessForm" class="bp-panel__body"
        variant="flat">
        <v-card-text class="fill-height">

          <v-row class="fill-height">
            <v-col cols="4">
              <v-card variant="outlined" class="bp-panel__col mb-0 mt-0 pt-0">
                <v-card-text>

                  <v-select prepend-icon="mdi-help-rhombus-outline" density="compact" v-model="batchProcessForm.scope"
                    :items="scopes" label="Hangi Ürünler Dahil Olacak?" variant="outlined">
                  </v-select>


                  <div class="d-flex">
                    <v-checkbox v-model="batchProcessForm.saleStatus" label="Satış Durumu" class="ml-8"></v-checkbox>

                    <v-switch :disabled="!batchProcessForm.saleStatus" v-model="batchProcessForm.onsale"
                      class="ml-0 mb-6" hide-details density="compact">
                      <template #label>
                        <div class="bp-panel__switch-label font-weight-normal mt-0">
                          Satışa
                          <span v-if="batchProcessForm.onsale == true">Açık</span>
                          <span v-else class="bp-panel__off font-weight-bold">Kapalı</span>
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
              <v-card variant="outlined" class="bp-panel__col bp-panel__col--scroll mb-0 mt-0 pt-0 fill-height">
                <v-card-text class="bp-panel__platforms-text">

                  <v-checkbox v-model="batchProcessForm.platformUploadStatus" label="Platform Yükleme Durumu"
                    class="ml-0"></v-checkbox>

                  <div class="d-flex flex-wrap">
                    <template v-if="integrationStore"
                      v-for="(integration, index) of integrationStore.getClientMarketplaces().filter((item: any) => item.type.code == 'marketplace')">
                      <IntegrationAvatarComponent mode="text" :platform="integration" width="120px" height="65px"
                        :class="platformReady(integration.code) ? 'bp-panel__platform--ready' : 'bp-panel__platform--idle'"
                        :style="platformReady(integration.code) ? { 'background-color': integration.color } : undefined"
                        class="bp-panel__platform mb-2 mr-1"
                        @click.stop="batchProcessForm.platformUploadStatus ? setPlatformUploads(integration.code) : ''" />
                    </template>
                  </div>

                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
      <div class="bp-panel__footer pa-4">
        <v-row>
          <v-col>
            <v-btn-group elevation="1" class="d-block" density="compact">
              <v-btn density="compact" block class="fill-height" color="neutral"
                @click="resetBatchProcessForm">
                <span class="">
                  <v-icon>mdi-undo-variant</v-icon> {{ $t('common.clear') }}
                </span></v-btn>
            </v-btn-group>
          </v-col>
          <v-col>
            <v-btn-group elevation="1" class="d-block" density="compact">
              <v-btn density="compact" block class="fill-height" color="error"
                @click="validateAndBatchProcessDelete">
                <span class="">
                  <v-icon>mdi-trash-can-outline</v-icon> {{ $t('common.batchDelete') }}
                </span></v-btn>
            </v-btn-group>
          </v-col>
          <v-col>
            <v-btn-group elevation="1" class="d-block" density="compact">
              <v-btn density="compact" block class="fill-height" color="primary"
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
import CategorySelectBoxComponent from '@/components/common/CategorySelectBoxComponent.vue'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import useRestApi from '@/composables/restapi'
import IntegrationAvatarComponent from '@/components/IntegrationAvatarComponent.vue';
import { useIntegrationStore } from '@/stores/integrationStore';

const integrationStore = useIntegrationStore()

const restApi = useRestApi()

const formRules = useFormRules()
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



const platformReady = (code: string) => !!(batchProcessForm.value?.platformUploadStatus && batchProcessForm.value?.platformUploads?.[code]?.isReady)
</script>

<style scoped>
.bp-panel {
  transition: none !important;
  box-shadow: none;
  transform: none !important;
  right: 0;
  background-color: var(--ek-color-surface-sunken);
}

.bp-panel__topline {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  width: auto;
  opacity: 0.9;
  background-color: var(--ek-color-error);
}

.bp-panel__close {
  position: absolute;
  top: 0;
  height: var(--ek-control-h-lg);
  width: var(--ek-control-h-lg);
  opacity: 0.9;
  border-radius: var(--ek-radius-none);
}

.bp-panel__close--right {
  right: 0;
  border-bottom-left-radius: var(--ek-radius-xl);
}

.bp-panel__close--left {
  left: 0;
  border-bottom-right-radius: var(--ek-radius-xl);
}

.bp-panel__heading {
  position: absolute;
  top: 2px;
  left: var(--ek-space-5);
  opacity: 0.8;
}

.bp-panel__heading-icon {
  opacity: 0.7;
}

.bp-panel__body {
  position: absolute;
  overflow-y: auto;
  top: var(--ek-space-12);
  left: 0;
  right: 0;
  bottom: 70px;
  border-top: 1px solid var(--ek-color-border-default);
  background-color: var(--ek-color-surface-muted);
}

.bp-panel__col {
  border-color: transparent;
}

.bp-panel__col--scroll {
  overflow-y: auto;
}

.bp-panel__switch-label {
  line-height: 1;
  font-size: var(--ek-type-body-size) !important;
}

.bp-panel__off {
  color: var(--ek-color-error);
}

.bp-panel__platforms-text {
  height: 90%;
}

.bp-panel__platform {
  cursor: pointer;
}

.bp-panel__platform--ready {
  opacity: 1;
  border: 1px solid var(--ek-color-border-default) !important;
}

.bp-panel__platform--idle {
  opacity: 0.6;
  background-color: var(--ek-color-content-muted) !important;
  border: 1px solid var(--ek-color-surface) !important;
}

.bp-panel__footer {
  position: absolute;
  bottom: 0;
  width: 100%;
  border-top: 1px solid var(--ek-color-border-default);
}
</style>