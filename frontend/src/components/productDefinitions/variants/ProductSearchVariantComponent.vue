<template>
  <EkDialogCard :title="$t('productDefinitions.product.variants.search')" icon="mdi-magnify"
    :description="[productInfoForm?.stockcode, productInfoForm?.title].filter(Boolean).join(' · ')"
    width="custom" class="psv-card" @close="emits('close')">
    <v-form ref="searchVariantFormRef" v-model="isSearchVariantFormValid" @submit.prevent="validateAndSearchVariants">
      <EkFormSection v-if="searchVariantForm && searchVariantForm['choices'] && choiceList.length"
        title="Seçenekler" icon="mdi-checkbox-multiple-outline">
        <template v-for="(choice, index) of choiceList" :key="choice.title">
          <v-select multiple chips closable-chips item-value="_id" item-title="title" @click.stop
            v-model="searchVariantForm['choices'][index].choiceValueIds" :label="choice.title" :items="choice.values" />
        </template>
      </EkFormSection>

      <EkFormSection v-if="searchVariantForm" title="Kod ve stok" icon="mdi-barcode">
        <v-text-field prepend-inner-icon="mdi-qrcode" @click.stop maxlength="32" type="tel" clearable
          :label="$t('productDefinitions.product.define.variants.headers.stockcode')"
          v-model="searchVariantForm.stockcode" />
        <v-text-field prepend-inner-icon="mdi-barcode" @click.stop clearable maxlength="32" type="tel"
          :label="$t('productDefinitions.product.define.variants.headers.barcode')" v-model="searchVariantForm.barcode" />
        <v-text-field prepend-inner-icon="mdi-numeric" @click.stop clearable maxlength="16" type="tel"
          :label="$t('productDefinitions.product.define.variants.headers.stock')" v-model="searchVariantForm.stock"
          :rules="[formRules.numberRulesWithoutZero].flat()" />
        <v-text-field prepend-inner-icon="mdi-numeric" @click.stop clearable maxlength="16" type="tel"
          :label="$t('productDefinitions.product.define.variants.headers.shelf')"
          :rules="formRules.numberRulesWithoutZero" v-model="searchVariantForm.shelf" />
      </EkFormSection>

      <EkFormSection v-if="searchVariantForm" title="Fiyat" icon="mdi-currency-try" :columns="3">
        <VCurrencyComponentVue @click.stop :compact="true" v-model="searchVariantForm.min" :label="$t('common.min')"
          clearable :required="false" :isIconExist="false" />
        <VCurrencyComponentVue @click.stop :compact="true" :label="$t('common.max')" clearable
          v-model="searchVariantForm.max" :required="false" :isIconExist="false" />
        <v-select label="Fiyatlandırma" v-model="searchVariantForm.isPlatformBasedPrice"
          :items="[{ value: 0, title: 'Hepsi' }, { value: 1, title: 'Tek Fiyat' }, { value: 2, title: 'Platform Bazında Fiyat' }]" />
      </EkFormSection>
    </v-form>

    <template #actions>
      <EkButton tone="secondary" icon="mdi-undo-variant" @click="resetSearchVariantForm">{{ $t('common.clear') }}</EkButton>
      <EkButton tone="primary" icon="mdi-magnify" @click="validateAndSearchVariants">{{ $t('common.search') }}</EkButton>
    </template>
  </EkDialogCard>
</template>

<script setup lang="ts">
import { ref, inject, nextTick, watch, computed, onActivated, onBeforeMount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n';
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';
import EkDialogCard from '@/components/ds/EkDialogCard.vue'
import EkFormSection from '@/components/ds/EkFormSection.vue'
import EkButton from '@/components/ds/EkButton.vue'
import { useChoicesStore } from '@/stores/choicesStore';
import useFormRules from '@/composables/formrules';
const choicesStore = useChoicesStore()
var choicesStoreChoices: any = undefined
// Şablon için reaktif seçenek listesi (grup başına bir çoklu seçim).
const choiceList = computed<any[]>(() => (choicesStore.getChoices() as any)?.value ?? [])
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
