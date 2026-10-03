<template>

  <v-card variant="elevated" class="ma-2 pa-0" elevation="1"
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
      <!--       <v-icon class="mr-2 ml-10" style="opacity:.7">mdi-card-multiple-outline</v-icon>
      {{
        $t('productDefinitions.product.variants.batch')
      }}
 -->

      <div class="font-weight-light ml-8 text-body-1" style="position:absolute;top:2px;left:20px;opacity:.8">
        <span class="font-weight-bold">{{ productInfoForm.stockcode }} <span class="ml-2 mr-2"></span> <span
            class="font-weight-medium">{{ productInfoForm.title }}</span></span>

        <span class="ml-2 mr-2"></span>
        <!-- Ürününe Ait -->
        <!-- <span class="font-weight-bold">{{ pagination.totalNumberOfRecords }}</span> {{ $t('common.count') }}  -->
        <span class="font-weight-bold text-h6"> |
          <v-icon class="mr-0" style="opacity:.7" size="20">mdi-card-multiple-outline</v-icon>
          {{ $t('productDefinitions.product.variants.batch') }}</span>
      </div>


    </v-card-title>
    <v-form ref="batchProcessFormsFormRef" v-model="isUpdatesVariantFormValid">
      <v-card v-if="batchProcessForm"
        style="position:absolute;overflow-y:auto;top: 48px;left:0;right:0;bottom:70px;border-top:1px solid #ddd;background-color:#eee"
        variant="flat">
        <v-card-text class="fill-height">
          <v-row class="fill-height">
            <v-col cols="4">
              <v-card variant="outlined" class="mb-0 mt-0 pt-0" style="border-color:transparent">
                <v-card-text>

                  <v-select prepend-icon="mdi-help-rhombus-outline" density="compact" v-model="batchProcessForm.scope"
                    :items="scopes" label="Hangi Ürün Seçenekleri Dahil Olacak?" variant="outlined"
                    bg-color="textfieldColor">
                  </v-select>


                  <v-text-field prepend-icon="mdi-numeric" @click.stop clearable maxlength="16" type="tel"
                    style="min-width:250px" :label="$t('productDefinitions.product.define.variants.headers.stock')"
                    density="compact" variant="outlined" bg-color="textfieldColor" class="mt-2"
                    v-model.number="batchProcessForm.stock"
                    :rules="[formRules.numberRulesWithoutZero].flat()"></v-text-field>
                  <v-text-field prepend-icon="mdi-numeric" @click.stop clearable
                    :label="$t('productDefinitions.product.define.variants.headers.shelf')" maxlength="16" type="tel"
                    :rules="formRules.numberRulesWithoutZero" density="compact" variant="outlined"
                    bg-color="textfieldColor" class="mt-2" v-model="batchProcessForm.shelf"></v-text-field>
                </v-card-text>
              </v-card>
            </v-col>
            <v-col>
              <v-card variant="outlined" class="mb-0 mt-0 pt-0 fill-height"
                style="border-color:transparent;overflow-y:auto;">
                <v-card-text style="height:90%">
                  <v-checkbox :label="$t('productDefinitions.product.platformPrice')" density="compact" hide-details
                    v-model="batchProcessForm.prices.isPlatformBasedPrice" class="ma-0 pa-0 mb-7 ml-5 mt-1" />

                  <div v-if="batchProcessForm.prices.isPlatformBasedPrice == false" class="text-center">
                    <v-row>
                      <v-col>
                        <div class="d-flex justify-center  align-center row-title mt-2 mr-0">
                          <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop
                            v-model="batchProcessForm.prices.salePrice" :compact="false"
                            :label="$t('productDefinitions.product.variants.salePrice')" clearable :required="false"
                            class="ml-0" style="min-width:200px">
                          </VCurrencyComponentVue>
                          <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop
                            v-model="batchProcessForm.prices.marketPrice" :compact="false"
                            :label="$t('productDefinitions.product.variants.marketPrice')" clearable :required="false"
                            class="ml-2" style="min-width:200px">
                          </VCurrencyComponentVue>
                        </div>
                      </v-col>
                    </v-row>
                  </div>
                  <template v-else>
                    <PlatformPriceComponent :platformPriceForm="batchProcessForm"  :categoryId="productInfoForm.category"/>
                  </template>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
          <!--           <div class="d-flex justify-center align-center d-block mt-1">
            <span class="text-caption font-italic">Etkilenecek Ürün Seçeneklerinin Sayısı :</span><span
              class="font-weight-bold pl-2" style="font-size:1.2em">{{ totalNumberOfVariants }}</span>
          </div> -->
        </v-card-text>
      </v-card>
      <div style="position:absolute;bottom:0px;width:100%;border-top:1px solid #ddd" class="pa-4">
        <v-row>
          <!--             <v-col>
              <v-btn-group elevation="1" class="d-block" density="compact">
                <v-btn density="compact" block class="fill-height" color="processButtonColor"
                  @click="batchProcessFormMenu = false">
                  <span class="">
                    <v-icon>mdi-close</v-icon> {{ $t('common.cancel') }}
                  </span></v-btn>
              </v-btn-group>
            </v-col>
 --> <v-col>
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
              <v-btn density="compact" :disabled="totalNumberOfVariants <= 0" block class="fill-height"
                color="deleteButtonColor" @click="validateAndBatchProcessDelete">
                <span class="">
                  <v-icon>mdi-delete</v-icon> {{ $t('common.batchDelete') }}
                </span></v-btn>
            </v-btn-group>
          </v-col>
          <v-col>
            <v-btn-group elevation="1" class="d-block" density="compact">
              <v-btn density="compact" :disabled="totalNumberOfVariants <= 0" block class="fill-height"
                color="saveButtonColor" @click="validateAndBatchProcessUpdate">
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
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';
import useFormRules from '@/composables/formrules';
import useIntegrations from '@/composables/integrations';
import PlatformPriceComponent from '@/components/productDefinitions/crud/PlatformPriceComponent.vue';

const formRules = useFormRules()
const integrations: any = useIntegrations()
const isUpdatesVariantFormValid = ref(false)
const batchProcessFormsFormRef: any = ref(null)
const marketPrice: any = ref()
const salePrice: any = ref()
const priceAmount: any = ref()
const percentageAmount: any = ref()
const isDecrease = ref(false)

const batchProcessForm: any = ref()
const { t } = useI18n()

const props = defineProps<{
  totalNumberOfVariants: any,
  productInfoForm: any
}>()

const batchProcessFormMenu: any = defineModel({ default: false })
const scopes = ref([{ value: 0, title: 'Tablodan Seçilenler' }, { value: 1, title: 'Sorgu Sonucu Eşleşenler' }, { value: 2, title: 'Ürünün Bütün Ürün Seçenekleri' }])
const emits = defineEmits(['batchProcessUpdate', 'batchProcessDelete', 'close'])

onMounted(() => {
  resetBatchProcessForm()
})

const resetBatchProcessForm = (event: any = undefined, marketPriceValue: any = undefined, salePriceValue: any = undefined) => {
  batchProcessForm.value = {}
  batchProcessForm.value.prices = { ...props.productInfoForm.prices }
  batchProcessForm.value.prices.isPlatformBasedPrice = props.productInfoForm.prices.isPlatformBasedPrice
  batchProcessForm.value.images = []
  batchProcessForm.value.scope = 0
  marketPrice.value = undefined
  salePrice.value = undefined
  for (let platform of integrations.getPlatforms()) {
    batchProcessForm.value.prices[platform.code] = {
      salePrice: salePriceValue,
      marketPrice: marketPriceValue
    }

  }
}

const validateAndBatchProcessUpdate = async () => {
  await batchProcessFormsFormRef.value?.validate()
  if (isUpdatesVariantFormValid.value == false) return
  emits('batchProcessUpdate', batchProcessForm.value)
  batchProcessFormMenu.value = false
}

const validateAndBatchProcessDelete = async () => {
  emits('batchProcessDelete', batchProcessForm.value)
  batchProcessFormMenu.value = false
}

</script>

<style scoped></style>