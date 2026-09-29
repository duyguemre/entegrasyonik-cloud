<template>
  <EkDialog v-model="isPlatformPrice" :title="$t('productDefinitions.product.define.competitivePricesEdit')"
    icon="mdi-compare-horizontal" width="lg" attach=".productDefinitionView" hide-cancel
    :confirm-label="$t('common.ok')" confirm-icon="mdi-check" @confirm="isPlatformPrice = false">
    <HintComponent :hintText="$t('productDefinitions.product.define.competitivePricesDesc')" class="pcp-hint" />
    <EkFormGrid :columns="3">
      <v-checkbox :label="$t('productDefinitions.product.define.competitivePrices')"
        @update:model-value="productInfoForm.prices.competitivePricesFlag?calculateSetCompetitivePrices():'';productInfoForm.prices.competitivePricesFlag=!productInfoForm.prices.competitivePricesFlag"
        hide-details v-model="productInfoForm.prices.competitivePricesFlag" />
      <VCurrencyComponentVue :disabled="!productInfoForm.prices.competitivePricesFlag" @click.stop
        v-model="productInfoForm.prices.competitive.minPrice" :compact="true" :isIconExist="false"
        :label="$t('productDefinitions.product.define.competitiveMinPrice')" clearable :required="false"
        :hint="$t('productDefinitions.product.define.competitiveMinPriceDesc')" persistent-hint />
      <VCurrencyComponentVue :disabled="!productInfoForm.prices.competitivePricesFlag" @click.stop
        v-model="productInfoForm.prices.competitive.stepAmount" :compact="true" :isIconExist="false"
        :label="$t('productDefinitions.product.define.competitiveStepAmount')" clearable :required="false"
        :hint="$t('productDefinitions.product.define.competitiveStepAmountDesc')" persistent-hint />
    </EkFormGrid>
  </EkDialog>
</template>

<script setup lang="ts">
import { ref, inject, computed, onBeforeMount, onBeforeUnmount, onMounted, onActivated, onDeactivated } from 'vue'
import useIntegrations from '@/composables/integrations';
import { useI18n } from 'vue-i18n';
import useFormRules from '@/composables/formrules';
import usePriceCalculator from '@/composables/priceCalculator';
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';
import HintComponent from '@/components/HintComponent.vue';
import EkDialog from '@/components/ds/EkDialog.vue'
import EkFormGrid from '@/components/ds/EkFormGrid.vue'
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

<style scoped>
.pcp-hint {
  margin-bottom: var(--ek-space-4);
}
</style>
