<template>
   <!--     <template v-slot:activator="{ props: menuProps }">
      <v-tooltip text="Ürün seçeneklerinde arama yapmak için kullanabilirsiniz">
        <template v-slot:activator="{ props: tooltipProps }">
           <v-btn flat size="medium" v-bind="{ ...tooltipProps, ...menuProps }" class="pa-2 mr-1" style="min-width:0;" :color="isFiltered?'activeButtonColor':'processButtonColor'" 
                       ><v-icon>mdi-magnify</v-icon></v-btn>
 
        </template>
</v-tooltip>
</template> -->


    <v-card variant="elevated" class="ma-2 pa-0 psv-s1" elevation="1"
      height="100%">



      <v-card-title>
        <div class="elevation-1 psv-s2">
          </div>

          <v-btn aria-label="Kapat"
        @click="emits('close')" elevation="1" min-width="0" color="red" class="psv-s3"><v-icon
          size="x-large">mdi-close</v-icon></v-btn>

        <v-btn aria-label="Kapat"
        @click="emits('close')" elevation="1" min-width="0" color="red" class="psv-s4"><v-icon
          size="x-large">mdi-close</v-icon></v-btn>

<div class="font-weight-light ml-8 text-body-1 psv-s5">
        <span class="font-weight-bold">{{ productInfoForm.stockcode }} <span class="ml-2 mr-2"></span> <span
            class="font-weight-medium">{{ productInfoForm.title }}</span></span>

        <span class="ml-2 mr-2"></span>
        <!-- Ürününe Ait -->
        <!-- <span class="font-weight-bold">{{ pagination.totalNumberOfRecords }}</span> {{ $t('common.count') }}  -->
        <span class="font-weight-bold text-h6"> |
          <v-icon class="mr-0 psv-s6" size="20">mdi-magnify</v-icon>
          {{ $t('productDefinitions.product.variants.search') }}</span>
      </div>

          </v-card-title>


      <v-form ref="searchVariantFormRef" v-model="isSearchVariantFormValid">

            <v-card  v-if="searchVariantForm" variant="flat" class="psv-s7">
          <v-card-text>
            <v-row>
              <v-col>
                <v-card variant="outlined" class="mb-0 mt-0 pt-0 psv-s8">
                  <v-card-text>


                    <template v-for="(choice, index) of choicesStoreChoices" :key="choice.title">
                      <v-select prepend-icon="mdi-checkbox-outline" multiple item-value="_id" item-title="title"
                        @click.stop v-if="searchVariantForm && searchVariantForm['choices']"
                        v-model="searchVariantForm['choices'][index].choiceValueIds" :label="choice.title"
                        :items="choice.values" density="compact" class="mt-2 psv-s9" variant="outlined"
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
                <v-card variant="outlined" class="mb-0 mt-0 pt-0 psv-s8">
                  <v-card-text>
                    <v-text-field prepend-icon="mdi-qrcode" @click.stop maxlength="32"
                      type="tel" clearable :label="$t('productDefinitions.product.define.variants.headers.stockcode')"
                      density="compact" variant="outlined" bg-color="textfieldColor" class="mt-2 psv-s10"
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
                <v-card variant="outlined" class="mb-0 mt-0 pt-0 psv-s11">
                  <v-card-text>
                    <div class="d-flex mt-2 psv-s12">
                      <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop :compact="false"
                        v-model="searchVariantForm.min" :label="$t('common.min')" clearable :required="false" class="psv-s9">
                      </VCurrencyComponentVue>
                      <VCurrencyComponentVue @click.stop :compact="false" :label="$t('common.max')" clearable
                        v-model="searchVariantForm.max" :required="false" class="ml-4 psv-s9">
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
        <div class="pa-4 psv-s13">
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

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.psv-s1 {
  transition: none !important;
  box-shadow: none !important;
  transform: none !important;
  right: 0 !important;
  background-color: var(--ek-color-surface-sunken) !important;
}

.psv-s2 {
  position: absolute !important;
  top: 0px !important;
  left: 0px !important;
  right: 0 !important;
  height: 1px !important;
  width: auto !important;
  opacity: .9 !important;
  background-color: red !important;
}

.psv-s3 {
  position: absolute !important;
  top: 0px !important;
  right: 0px !important;
  height: 40px !important;
  width: 40px !important;
  opacity: .9 !important;
  border-radius: 0 !important;
  border-bottom-left-radius: 20px !important;
}

.psv-s4 {
  position: absolute !important;
  top: 0px !important;
  left: 0px !important;
  height: 40px !important;
  width: 40px !important;
  opacity: .9 !important;
  border-radius: 0 !important;
  border-bottom-right-radius: 20px !important;
}

.psv-s5 {
  position: absolute !important;
  top: 2px !important;
  left: 20px !important;
  opacity: .8 !important;
}

.psv-s6 {
  opacity: .7 !important;
}

.psv-s7 {
  position: absolute !important;
  overflow-y: scroll !important;
  top: 48px !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 70px !important;
  border-top: 1px solid var(--ek-color-border-default) !important;
  background-color: var(--ek-color-surface-sunken) !important;
}

.psv-s8 {
  border-color: transparent !important;
}

.psv-s9 {
  min-width: 200px !important;
}

.psv-s10 {
  min-width: 260px !important;
}

.psv-s11 {
  border-color: transparent !important;
  height: 400px !important;
  border-bottom: 1px solid var(--ek-color-border-default) !important;
}

.psv-s12 {
  min-width: 300px !important;
}

.psv-s13 {
  position: absolute !important;
  bottom: 0px !important;
  width: 100% !important;
  border-top: 1px solid var(--ek-color-border-default) !important;
}
</style>
