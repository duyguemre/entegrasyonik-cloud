<template>
  <v-dialog v-model="isPlatformPrice" max-width="1100" location-strategy="connected" target="cursor"
    :attach="'.productDefinitionView'" :contained="true" location="left">
    <v-card style="background-color:#f3f5f3;overflow:hidden" variant="elevated" class=" mb-12">
      <v-btn style="position:absolute;right:10px;z-index:1;top:4px;right:5px" @click="isPlatformPrice = false" flat
        variant="outlined" color="grey" min-width="0"><v-icon size="x-large">mdi-close</v-icon></v-btn>
      <v-card-title>
        <v-icon class="mr-2" style="opacity:.7">mdi-compare-horizontal</v-icon>{{
    $t('productDefinitions.product.define.competitivePricesEdit')
  }}
        <v-divider class="mt-2 mb-0" />
      </v-card-title>
      <v-card-text>
        <v-row class="mb-4">
          <v-col>
            <HintComponent :hintText="$t('productDefinitions.product.define.competitivePricesDesc')" />
          </v-col>
        </v-row>
        <v-row no-gutters>

          <v-col cols=4>
          <v-checkbox :label="$t('productDefinitions.product.define.competitivePrices')"
                        @update:model-value="productInfoForm.prices.competitivePricesFlag?calculateSetCompetitivePrices():'';productInfoForm.prices.competitivePricesFlag=!productInfoForm.prices.competitivePricesFlag" density="comfortable"
                        hide-details v-model="productInfoForm.prices.competitivePricesFlag" class="ma-0 pa-0" />
</v-col>
          <v-col cols=4>
            <VCurrencyComponentVue :disabled="!productInfoForm.prices.competitivePricesFlag" prepend-icon="mdi-currency-try" @click.stop v-model="productInfoForm.prices.competitive.minPrice"
              :compact="false" :label="$t('productDefinitions.product.define.competitiveMinPrice')" clearable
              :required="false" :hint="$t('productDefinitions.product.define.competitiveMinPriceDesc')" class="ml-4"
              :hide-details="false" counter>
            </VCurrencyComponentVue>
          </v-col>
          <v-col cols=4>
            <VCurrencyComponentVue :disabled="!productInfoForm.prices.competitivePricesFlag" prepend-icon="mdi-currency-try" @click.stop v-model="productInfoForm.prices.competitive.stepAmount"
              :compact="false" :label="$t('productDefinitions.product.define.competitiveStepAmount')" clearable
              :required="false" :hint="$t('productDefinitions.product.define.competitiveStepAmountDesc')" class="ml-4"
              :hide-details="false" counter>
            </VCurrencyComponentVue>
          </v-col>
        </v-row>


      </v-card-text>
      <v-card-actions>
        <v-row>
          <v-col>
            <v-btn-group elevation="1" class="d-block">
              <v-btn density="default" block class="fill-height" color="processButtonColor"
                @click="isPlatformPrice = false">
                <span class="">
                  <v-icon size="30">mdi-check</v-icon> {{ $t('common.ok') }}
                </span></v-btn>
            </v-btn-group>
          </v-col>
        </v-row>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, inject, computed, onBeforeMount, onBeforeUnmount, onMounted, onActivated, onDeactivated } from 'vue'
import useIntegrations from '@/composables/integrations';
import { useI18n } from 'vue-i18n';
import useFormRules from '@/composables/formrules';
import usePriceCalculator from '@/composables/priceCalculator';
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';
import HintComponent from '@/components/HintComponent.vue';
const priceCalculator = usePriceCalculator()
const isPlatformPrice = defineModel({ default: false })
const formRules: any = useFormRules()
const { t } = useI18n()
var oldSalePrice: any = undefined
const props = defineProps<{
  productInfoForm: any
}>()

onMounted(() => {
})

const calculateSetCompetitivePrices = ()=>{
  props.productInfoForm.prices.competitive.minPrice = props.productInfoForm.prices.price
  props.productInfoForm.prices.competitive.stepAmount = 0
}

defineExpose({
});

</script>

<style></style>