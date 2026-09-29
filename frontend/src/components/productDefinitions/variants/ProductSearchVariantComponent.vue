<template>
   <!--     <template v-slot:activator="{ props: menuProps }">
      <v-tooltip text="Ürün seçeneklerinde arama yapmak için kullanabilirsiniz">
        <template v-slot:activator="{ props: tooltipProps }">
           <v-btn flat size="medium" v-bind="{ ...tooltipProps, ...menuProps }" class="pa-2 mr-1" style="min-width:0;" :color="isFiltered?'activeButtonColor':'processButtonColor'" 
                       ><v-icon>mdi-magnify</v-icon></v-btn>
 
        </template>
</v-tooltip>
</template> -->


    <v-card variant="elevated" class="ma-2 pa-0" elevation="1"
      style="transition: none!important; box-shadow: none; transform: none!important;right:0;background-color:#f3f3f3"
      height="100%">



      <v-card-title>
        <div style="position:absolute;top:0px;left:0px;right:0;height:1px;width:auto;opacity:.9;background-color:red" class="elevation-1">
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
        <span class="font-weight-bold">{{ productInfoForm.stockcode }} <span class="ml-2 mr-2"></span> <span
            class="font-weight-medium">{{ productInfoForm.title }}</span></span>

        <span class="ml-2 mr-2"></span>
        <!-- Ürününe Ait -->
        <!-- <span class="font-weight-bold">{{ pagination.totalNumberOfRecords }}</span> {{ $t('common.count') }}  -->
        <span class="font-weight-bold text-h6"> |
          <v-icon class="mr-0" style="opacity:.7" size="20">mdi-magnify</v-icon>
          {{ $t('productDefinitions.product.variants.search') }}</span>
      </div>

          </v-card-title>


      <v-form ref="searchVariantFormRef" v-model="isSearchVariantFormValid">

            <v-card  v-if="searchVariantForm" style="position:absolute;overflow-y:scroll;top: 48px;left:0;right:0;bottom:70px;border-top:1px solid #ddd;background-color:#eee" variant="flat">
          <v-card-text>
            <v-row>
              <v-col>
                <v-card variant="outlined" class="mb-0 mt-0 pt-0" style="border-color:transparent">
                  <v-card-text>


                    <template v-for="(choice, index) of choicesStoreChoices" :key="choice.title">
                      <v-select prepend-icon="mdi-checkbox-outline" multiple item-value="_id" item-title="title"
                        @click.stop style="min-width:200px" v-if="searchVariantForm && searchVariantForm['choices']"
                        v-model="searchVariantForm['choices'][index].choiceValueIds" :label="choice.title"
                        :items="choice.values" density="compact" class="mt-2" variant="outlined"
                        bg-color="textfieldColor">
                      </v-select>
                    </template>

                    <!--                     <template v-for="choice of choicesStoreChoices" :key="choice.title">
                      <v-select prepend-icon="mdi-checkbox-outline" item-value="id" multiple item-title="title" @click.stop style="min-width:400px"
                        v-if="searchVariantForm && searchVariantForm['choices']"
                        v-model="searchVariantForm['choices'][choice.title]" :label="choice.title"
                        :items="choice.values" density="compact" class="mt-2"
                        variant="outlined" bg-color="textfieldColor">
                      </v-select>
                    </template> -->
                  </v-card-text>
                </v-card>
              </v-col>
              <v-col>
                <v-card variant="outlined" class="mb-0 mt-0 pt-0" style="border-color:transparent">
                  <v-card-text>
                    <v-text-field style="min-width:260px" prepend-icon="mdi-qrcode" @click.stop maxlength="32"
                      type="tel" clearable :label="$t('productDefinitions.product.define.variants.headers.stockcode')"
                      density="compact" variant="outlined" bg-color="textfieldColor" class="mt-2"
                      v-model="searchVariantForm.stockcode"></v-text-field>
                    <v-text-field prepend-icon="mdi-barcode" @click.stop clearable maxlength="32" type="tel"
                      :label="$t('productDefinitions.product.define.variants.headers.barcode')" density="compact"
                      variant="outlined" bg-color="textfieldColor" class="mt-2"
                      v-model="searchVariantForm.barcode"></v-text-field>
                    <v-text-field prepend-icon="mdi-numeric" @click.stop clearable maxlength="16" type="tel"
                      :label="$t('productDefinitions.product.define.variants.headers.stock')" density="compact"
                      variant="outlined" bg-color="textfieldColor" class="mt-2" v-model="searchVariantForm.stock"
                      :rules="[formRules.numberRulesWithoutZero].flat()"></v-text-field>
                    <v-text-field prepend-icon="mdi-numeric" @click.stop clearable
                      :label="$t('productDefinitions.product.define.variants.headers.shelf')" maxlength="16" type="tel"
                      :rules="formRules.numberRulesWithoutZero" density="compact" variant="outlined"
                      bg-color="textfieldColor" class="mt-2" v-model="searchVariantForm.shelf"></v-text-field>
<!--                     <v-checkbox :label="$t('productDefinitions.product.platformPrice')" density="compact" hide-details
                      v-model="searchVariantForm.isPlatformBasedPrice" class="ma-0 mr-4 pa-0" />
 -->
                  </v-card-text>
                </v-card>
              </v-col>
              <v-col>
                <v-card variant="outlined" class="mb-0 mt-0 pt-0"
                  style="border-color:transparent;height:400px;border-bottom:1px solid #ddd">
                  <v-card-text>
                    <div class="d-flex mt-2" style="min-width:300px">
                      <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop :compact="false"
                        v-model="searchVariantForm.min" :label="$t('common.min')" clearable :required="false"
                         style="min-width:200px">
                      </VCurrencyComponentVue>
                      <VCurrencyComponentVue @click.stop :compact="false" :label="$t('common.max')" clearable
                        v-model="searchVariantForm.max" :required="false" class="ml-4" style="min-width:200px">
                      </VCurrencyComponentVue>
                    </div>


                    <v-select label="Fiyatlandırma" variant="outlined" density="compact" bg-color="textfieldColor" prepend-icon="mdi-vector-point-select" outlined v-model="searchVariantForm.isPlatformBasedPrice" :items="[{value:0,title:'Hepsi'},{value:1,title:'Tek Fiyat'},{value:2,title:'Platform Bazında Fiyat'}]" class="mt-2">
                      </v-select>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-card-text>

        </v-card>
        <div style="position:absolute;bottom:0px;width:100%;border-top:1px solid #ddd" class="pa-4">
          <v-row>
<!--             <v-col>
              <v-btn-group elevation="1" class="d-block" density="compact">
                <v-btn density="compact" block class="fill-height" color="processButtonColor"
                  @click="searchVariantForm.searchVariantFormMenu = false">
                  <span class="">
                    <v-icon>mdi-close</v-icon> {{ $t('common.cancel') }}
                  </span></v-btn>
              </v-btn-group>
            </v-col> -->
            <v-col>
              <v-btn-group elevation="1" class="d-block" density="compact">
                <v-btn density="compact" block class="fill-height" color="processButtonColor"
                  @click="resetSearchVariantForm">
                  <span class="">
                    <v-icon>mdi-undo-variant</v-icon> {{ $t('common.clear') }}
                  </span></v-btn>
              </v-btn-group>
            </v-col>
            <v-col>
              <v-btn-group elevation="1" class="d-block" density="compact">
                <v-btn density="compact" block class="fill-height" color="primary" @click="validateAndSearchVariants">
                  <span class="">
                    <v-icon>mdi-magnify</v-icon> {{ $t('common.search') }}
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
import { useChoicesStore } from '@/stores/choicesStore';
import useFormRules from '@/composables/formrules';
const choicesStore = useChoicesStore()
var choicesStoreChoices: any = undefined
const formRules = useFormRules()
const isSearchVariantFormValid = ref(false)
const searchVariantFormRef: any = ref(null)
const searchVariantForm: any = defineModel({ default: { searchVariantFormMenu: false } })
const { t } = useI18n()
const show = ref(false)

const emits = defineEmits(['searchVariants','close'])


var props = defineProps<{
  isFiltered: any,
  productInfoForm:any
}>()
onMounted(() => {
  choicesStoreChoices = choicesStore.getChoices()
  resetSearchVariantForm()
})

const resetSearchVariantForm = () => {
  searchVariantForm.value.min = undefined
  searchVariantForm.value.max = undefined
  searchVariantForm.value.isPlatformBasedPrice = 0
  searchVariantForm.value.stockcode = undefined
  searchVariantForm.value.barcode = undefined
  searchVariantForm.value.stock = undefined
  searchVariantForm.value.shelf = undefined
  searchVariantForm.value.choices = []
  /*   searchVariantForm.value.isPlatformBasedPrice = false */
  for (let choice of choicesStoreChoices.value) {
    searchVariantForm.value.choices.push({ choiceId: choice._id, choiceValueIds: [] })
  }

}


const validateAndSearchVariants = async () => {
  await searchVariantFormRef.value?.validate()
  if (isSearchVariantFormValid.value == false) return
  searchVariantForm.value.searchVariantFormMenu = false
  emits('searchVariants')
}

</script>

<style scoped></style>