<template>
  <v-form ref="newVariantsFormRef" v-model="isNewVariantsFormValid">


    <CardComponent>
      <div class="ma-4">
        <div class="d-flex mb-4">

          <v-btn-group elevation="0" class="d-block flex-grow-1  mr-1" density="compact"
            style="box-shadow:0px 0px 10px rgba(200,220,240,.0)!important">
            <v-btn density="compact" block class="fill-height" color="white" style="border:1px solid #bbb;"
              @click="clearForm">
              <span class="">
                Vazgeç
              </span></v-btn>
          </v-btn-group>
          <v-btn-group elevation="0" class="d-block  flex-grow-1 ml-1" density="compact" style="">
            <v-btn density="compact" block class="fill-height" color="#E53935ff" style="border:1px solid #aaa;"
              @click="validateAndAddVariants">
              <span class="">
                {{ $t('common.add') }}
              </span></v-btn>
          </v-btn-group>
        </div>


        <div class="flex-grow-1 " id="myfeature-1">



          <template v-for="(choice, index) of computedChoices">
            <v-select multiple item-value="_id" item-title="title" @click.stop style="min-width:200px"
              v-if="newVariant && newVariant['choices']" v-model="newVariants[index].choiceValueIds"
              :label="choice.title" @change="newVariantCounter++" :items="choice.values" density="compact" class="mb-2"
              v-model:menu="newVariants[index].isMenuOpen" variant="outlined" bg-color="textfieldColor" hide-details>
              <template v-slot:append-item>
                <v-list-item class="" style="border:1px solid #ddd;border-top:none" @click.stop>
                  <div class="mt-4 mb-2">
                    <v-form v-model="choiceForm" style="display:contents" @keydown.enter.prevent @submit.prevent>
                      <v-text-field variant="outlined" @mousedown.stop density="compact" type="tel" maxlength="32"
                        counter clearable bg-color="textfieldColor" hint="Yeni Seçenek Değeri" class="customTextField"
                        v-model="choiceValueTitle" @keydown.stop
                        @keyup.enter="choicesStore.addChoiceValue(choice._id, choiceValueTitle); choiceValueTitle = undefined">
                        <template v-slot:label>
                          <span class="font-ital1ic font-weight-light">Yeni Değer</span>
                        </template>
                        <template v-slot:append-inner>
                          <v-btn class="" size="40" flat min-width=0 density="comfortable" color="processButtonColor"
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
                <v-icon style="cursor:pointer" :color="newVariants[index].isMenuOpen ? 'passiveColor' : 'transparent'">mdi-close</v-icon>
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