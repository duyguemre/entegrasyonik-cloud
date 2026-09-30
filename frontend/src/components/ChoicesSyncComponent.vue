<template>

  <div class="fill-height">

    <v-card variant="elevated" class="choices-sync ma-0  pa-0"
      height="100%">

      <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>

      <v-card-title class="mb-0">

        <div class="choices-sync__topline elevation-1">
        </div>

        <v-btn class="choices-sync__close choices-sync__close--right"
          @click="emits('close')" elevation="1" min-width="0" color="error"><v-icon
            size="x-large">mdi-close</v-icon></v-btn>

        <v-btn class="choices-sync__close choices-sync__close--left"
          @click="emits('close')" elevation="1" min-width="0" color="error"><v-icon
            size="x-large">mdi-close</v-icon></v-btn>


        <span class="ml-8"></span> <span class="font-weight-medium  text-h6">
          <v-icon class="choices-sync__title-icon mr-0" size="20">mdi-checkbox-multiple-marked-outline</v-icon>
          Platform Seçenek Eşleştirme</span>

      </v-card-title>

      <v-card-text class="choices-sync__body mt-2"
        v-if="choiceSyncInfo?.integrationCategoryChoices?.length > 0">
        <v-row>
          <v-col cols="4" class="pl-2">



            <v-card class="choices-sync__panel choices-sync__panel--auto pa-4"
              variant="flat">

              <div class="mt-4 mb-8">
                <div class="d-flex align-center">
                  <div class="choices-sync__summary">
                    <div class="choices-sync__label font-weight-light text-caption mt-2">
                      Entegrasyonik Kategori
                    </div>
                    <span class="font-weight-medium">{{ choiceSyncInfo.category.title }}</span>
                    <div class="choices-sync__label font-weight-light text-caption mt-4">
                      Entegrasyonik Seçenek
                    </div>
                    <span class="font-weight-medium">{{ choiceSyncInfo.choice.title }}</span>
                    <div class="choices-sync__label font-weight-light text-caption mt-4">
                      Platform
                    </div>
                    <span class="font-weight-medium">{{ choiceSyncInfo.integration.title }}</span>
                    <div class="choices-sync__label font-weight-light text-caption mt-4">
                      {{ choiceSyncInfo.integration.title }} Kategori
                    </div>
                    <span class="font-weight-medium">{{ choiceSyncInfo.integrationCategory.title }}</span>
                  </div>
                  <div class="ml-12">
                    <v-card class="choices-sync__panel choices-sync__panel--hint pa-4"
                      variant="flat">
                      <HintComponent>
                        {{ choiceSyncInfo.category.title }} {{ choiceSyncInfo.choice.title }} seçeneği için
                        {{ choiceSyncInfo.integration.title }} {{ choiceSyncInfo.integrationCategory.title }}
                        kategorisinde
                        seçenek eşleştirmesi yapabilirsiniz.
                      </HintComponent>

                    </v-card>

                  </div>
                </div>
              </div>



              <v-select @click.stop="1" v-ripple.stop variant="outlined" @update:modelValue="" density="compact"
                type="tel" maxlength="160" width="200" item-value="_id"
                :items="choiceSyncInfo.integrationCategoryChoices" prepend-icon="mdi-checkbox-multiple-outline"
                :hint="$t('productDefinitions.category.platformChoiceDesc')" persistent-hint
                v-model="choiceSyncInfo.mapping.integrationCategoryChoiceId" hide-details>
                <template v-slot:label>
                  <span class="font-weight-medium">
                    {{ choiceSyncInfo.integration.title }}</span> Seçeneği
                </template>


                <template v-slot:selection="{ item, index }: any">
                  {{ item.title }} <span v-if="item.raw.mandatory == true" class="choices-sync__required ml-2 font-weight-bold">Zorunlu</span>
                </template>


                <template v-slot:prepend-item>
                  <v-list-item class="choices-sync__item">
                    <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop variant="outlined"
                      @mousedown.stop="1" density="compact" type="tel" maxlength="160" class="mt-2" clearable counter
                      :rules="formRules.searchRules" v-model="choiceSearchText"
                      :hint="$t('productDefinitions.category.searchDesc')">
                      <template v-slot:label>
                        <span class="font-weight-light">Filtrele</span>
                      </template>
                    </v-text-field>
                  </v-list-item>
                </template>
                <template v-slot:item="{ item, index, props }: any">
                  <v-list-item role="option" v-bind="props" class="choices-sync__item">
                    <template #title>
                    </template>
                    <div class="d-flex justify-start align-center ml-6">
                      <div v-if="item.raw.level && item.raw.level > 0" v-for="n in item.raw.level" class="choices-sync__indent">
                      </div>
                      <div class="mr-2 font-weight-thin">{{ index + 1 }}</div> {{ item.title }} <span
                        v-if="item.raw.mandatory == true" class="choices-sync__required ml-2 font-weight-bold">Zorunlu</span>
                    </div>
                  </v-list-item>
                </template>

              </v-select>
            </v-card>


          </v-col>

          <v-col>
            <v-card class="choices-sync__panel choices-sync__panel--scroll pa-4"
              variant="flat">
              <div class="d-flex align-center fill-height justify-center"
                v-if="!choiceSyncInfo.mapping.integrationCategoryChoiceId">
                <HintComponent>
                  Seçenek Değerleri eşleştirmek için önce sol taraftaki bölümden <span class="font-weight-bold ma-1">
                    {{ choiceSyncInfo.integration.title }} Seçeneği</span> ' ni belirleyiniz.
                </HintComponent>
              </div>


              <div class="d-flex align-start mt-4 justify-center" v-else>
                                <div class="flex-grow-1">

                  <v-row>
                    <v-col cols=4 v-for="(choiceValue, index) of choiceSyncInfo.choice?.values">
                      <div class="">


                        <v-text-field v-if="computedAllowCustom == true" prepend-icon="mdi-checkbox-outline"
                          variant="outlined" density="compact" type="tel" maxlength="160" width="200" clearable
                          class="customTextField" hide-details
                          v-model="choiceSyncInfo.mapping.values[choiceValue._id]">
                          <template v-slot:label>
                            <span class="font-weight-normal"> <span class="choices-sync__brand">Entegrasyonik</span> {{
                              choiceValue.title }}
                            </span>
                          </template>

                        </v-text-field>

                        <IntegrationChoiceValuesSelectBoxComponent v-else
                          v-model="choiceSyncInfo.mapping.values[choiceValue._id]"
                          :integrationValues="computedIntegrationChoiceIdValues"
                          :integrationChoiceValue="choiceValue" />
                      </div>
                    </v-col>
                  </v-row>
                </div>
              </div>
            </v-card>

          </v-col>
        </v-row>

      </v-card-text>
      <v-card-actions>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { Sortable } from "sortablejs-vue3";

import { ref, computed, onMounted, onBeforeMount, nextTick, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'
import IntegrationChoiceValuesSelectBoxComponent from '@/components/IntegrationChoiceValuesSelectBoxComponent.vue';
import HintComponent from '@/components/HintComponent.vue';

import { useIntegrationStore } from '@/stores/integrationStore';
import useRestApi from '@/composables/restapi'
import { useChoicesStore } from '@/stores/choicesStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import useFormRules from '@/composables/formrules';
const formRules: any = useFormRules()
const integrationStore = useIntegrationStore()
const choiceSearchText: any = ref()
/* const selectedIntegrationChoice:any = ref()
 */
var choiceSyncInfo: any = defineModel({ default: {} })
const selectedCategory: any = ref({})
const integrationCode: any = ref()
const categoriesStore = useCategoriesStore()


const choicesStore = useChoicesStore()
var choicesStoreChoices: any = ref()

const emits = defineEmits(['refreshImages', 'close'])
const props = defineProps<{
}>()
const restApi = useRestApi()
const loadingComponentRef: any = ref(null)



const { t } = useI18n()

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const computedAllowCustom = computed(() => {
  const integrationChoice = choiceSyncInfo.value.integrationCategoryChoices.find((item: any) => item._id == choiceSyncInfo.value.mapping.integrationCategoryChoiceId)
  return integrationChoice?.allowCustom
})


const computedIntegrationChoiceIdValues = computed(() => {
  if (choiceSyncInfo.value.mapping.checkIntegrationCategoryChoiceId == undefined || choiceSyncInfo.value.mapping.checkIntegrationCategoryChoiceId != choiceSyncInfo.value.mapping.integrationCategoryChoiceId) {
    choiceSyncInfo.value.mapping.checkIntegrationCategoryChoiceId = undefined
    choiceSyncInfo.value.mapping.values = {}
  }
  const integrationChoice = choiceSyncInfo.value.integrationCategoryChoices.find((item: any) => item._id == choiceSyncInfo.value.mapping.integrationCategoryChoiceId)
  console.log("integrationChoice", integrationChoice)
  return integrationChoice?.values
})

/* watch(() => choiceSyncInfo.value.isChoiceSyncOpen, (oldValue, newValue) => {
  selectedIntegrationChoice.value = choiceSyncInfo.value.integrationCategoryChoices.find((item:any)=>item._id==choiceSyncInfo.value.mapping.integrationCategoryChoiceId) 
}, { deep: true, immediate: true })
 */
/* const updateValues = (selectedValue:any) => {
  choiceSyncInfo.value.mapping.integrationCategoryChoiceId=selectedValue._id
  if(choiceSyncInfo.value.mapping)
    choiceSyncInfo.value.mapping.values = {}
}
 */



</script>

<style scoped>
.choices-sync {
  transition: none !important;
  box-shadow: none;
  transform: none !important;
  right: 0;
  background-color: var(--ek-color-surface-sunken);
}

.choices-sync__topline {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  width: auto;
  opacity: 0.9;
  background-color: var(--ek-color-error);
}

.choices-sync__close {
  position: absolute;
  top: 0;
  height: var(--ek-control-h-lg);
  width: var(--ek-control-h-lg);
  opacity: 0.9;
  border: 1px solid var(--ek-color-surface);
  border-top: none;
  border-radius: var(--ek-radius-none);
}

.choices-sync__close--right {
  right: 0;
  border-right: none;
  border-bottom-left-radius: var(--ek-radius-xl);
}

.choices-sync__close--left {
  left: 0;
  border-left: none;
  border-bottom-right-radius: var(--ek-radius-xl);
}

.choices-sync__title-icon {
  opacity: 0.7;
}

.choices-sync__body {
  background-color: var(--ek-color-surface-muted);
}

.choices-sync__panel {
  border: 1px solid var(--ek-color-border-default);
  background-color: var(--ek-color-surface-sunken);
  border-top-right-radius: var(--ek-radius-none);
  border-top-left-radius: var(--ek-radius-none);
}

.choices-sync__panel--auto,
.choices-sync__panel--scroll {
  margin-top: 1px;
  height: calc(100vh - 190px);
}

.choices-sync__panel--auto {
  overflow-y: auto;
}

.choices-sync__panel--scroll {
  overflow-y: scroll;
}

.choices-sync__summary {
  min-width: 180px;
}

.choices-sync__label {
  line-height: 0.7;
  font-size: var(--ek-type-micro-size) !important;
}

.choices-sync__required {
  color: var(--ek-color-error);
}

.choices-sync__item {
  border: 1px solid var(--ek-color-border-default);
  border-top: none;
}

.choices-sync__indent {
  width: 25px;
}

.choices-sync__brand {
  opacity: 0.6;
}
</style>