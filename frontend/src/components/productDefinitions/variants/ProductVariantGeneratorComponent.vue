<template>
  <v-form ref="newVariantsFormRef" v-model="isNewVariantsFormValid">


    <CardComponent>
      <div class="ma-4">
        <div class="d-flex mb-4">

          <v-btn-group elevation="0" class="d-block flex-grow-1  mr-1 pvg-s1" density="compact">
            <v-btn density="compact" block class="fill-height pvg-s2" color="surface"
              @click="clearForm">
              <span class="">
                Vazgeç
              </span></v-btn>
          </v-btn-group>
          <v-btn-group elevation="0" class="d-block  flex-grow-1 ml-1" density="compact">
            <v-btn density="compact" block class="fill-height pvg-s2" color="primary"
              @click="validateAndAddVariants">
              <span class="">
                {{ $t('common.add') }}
              </span></v-btn>
          </v-btn-group>
        </div>


        <div class="flex-grow-1 " id="myfeature-1">



          <template v-for="(choice, index) of computedChoices">
            <v-select multiple item-value="_id" item-title="title" @click.stop
              v-if="newVariant && newVariant['choices']" v-model="newVariants[index].choiceValueIds"
              :label="choice.title" @change="newVariantCounter++" :items="choice.values" density="compact" class="mb-2 pvg-s3"
              v-model:menu="newVariants[index].isMenuOpen" variant="outlined" hide-details>
              <template v-slot:append-item>
                <v-list-item class="pvg-s4" @click.stop>
                  <div class="mt-4 mb-2">
                    <v-form v-model="choiceForm" @keydown.enter.prevent @submit.prevent class="pvg-s5">
                      <v-text-field variant="outlined" @mousedown.stop density="compact" type="tel" maxlength="32"
                        counter clearable hint="Yeni Seçenek Değeri" class="customTextField"
                        v-model="choiceValueTitle" @keydown.stop
                        @keyup.enter="choicesStore.addChoiceValue(choice._id, choiceValueTitle); choiceValueTitle = undefined">
                        <template v-slot:label>
                          <span class="font-ital1ic font-weight-light">Yeni Değer</span>
                        </template>
                        <template v-slot:append-inner>
                          <v-btn class="" size="40" flat min-width=0 density="comfortable" color="neutral"
                            :disabled="!choiceForm || choiceValueTitle == undefined"
                            @click="choicesStore.addChoiceValue(choice._id, choiceValueTitle); choiceValueTitle = undefined"><span
                              class="">
                              <v-icon>mdi-plus</v-icon>
                            </span></v-btn>
                        </template>

                      </v-text-field>
                    </v-form>
                  </div>
                </v-list-item>
              </template>
              <template #append>
                <v-icon :color="newVariants[index].isMenuOpen ? 'content-muted' : 'transparent'" class="pvg-s6">mdi-close</v-icon>
              </template>

            </v-select>

          </template>
        </div>


      </div>
    </CardComponent>

  </v-form>


</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

import { useChoicesStore } from '@/stores/choicesStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import CardComponent from '@/components/CardComponent.vue';
const categoriesStore = useCategoriesStore()


const choiceValueTitle = ref()
const choiceForm = ref(false)
const choicesStore = useChoicesStore()
const newVariant: any = ref({})
const newVariants: any = ref([])
var newVariantCounter = ref(0)
const isNewVariantsFormValid = ref(false)
const newVariantsFormRef: any = ref(null)
const marketPrice: any = ref()
const salePrice: any = ref()

const props = defineProps<{
  productInfoForm: any
}>()

const emits = defineEmits(['generateVariants', 'close'])

onMounted(() => {
  init()
})

const clearForm = () => {
  for (const newVariant of newVariants.value) {
    newVariant.choiceValueIds = []
  }

  emits('close')
}

const computedChoices: any = computed(() => {
  const allChoices = choicesStore.getChoices().value
  return allChoices || []
})

const computedCategory = computed(() => {
  return categoriesStore.getCategory(props.productInfoForm.category)
})

const init = async () => {
  marketPrice.value = undefined
  salePrice.value = undefined
  newVariant.value = { choices: [], images: [], prices: {} }
  newVariants.value = []
  newVariant.value.prices.isPlatformBasedPrice = props.productInfoForm.prices.isPlatformBasedPrice

  for (let choice of computedChoices.value) {
    newVariant.value.choices.push({ choiceId: choice._id, choiceValueId: undefined })
    newVariants.value.push({ choiceId: choice._id, choiceValueIds: [] })
  }
}


const validateAndAddVariants = async () => {
  const filtered = newVariants.value.filter((item: any) => item.choiceValueIds?.length > 0)
  emits('generateVariants', filtered)
  clearForm()
}

</script>

<style scoped></style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.pvg-s1 {
  box-shadow: none !important;
}

.pvg-s2 {
  border: 1px solid var(--ek-color-border-strong) !important;
}

.pvg-s3 {
  min-width: 200px !important;
}

.pvg-s4 {
  border: 1px solid var(--ek-color-border-default) !important;
  border-top: none !important;
}

.pvg-s5 {
  display: contents !important;
}

.pvg-s6 {
  cursor: pointer !important;
}
</style>
