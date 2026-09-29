<template>

  <div class="fill-height">

    <v-card variant="elevated" class="ma-0  pa-0"
      style="transition: none!important; box-shadow: none; transform: none!important;right:0;background-color:#f3f3f3"
      height="100%">

      <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>

      <v-card-title style="" class="mb-0">

        <div style="position:absolute;top:0px;left:0px;right:0;height:1px;width:auto;opacity:.9;background-color:red"
          class="elevation-1">
        </div>

        <v-btn
          style="position:absolute;border:1px solid #fff;border-top:none;border-right:none;top:0px;right:0px;height:40px;width:40px; opacity:.9;border-radius:0;border-bottom-left-radius:20px;"
          @click="emits('close')" elevation="1" min-width="0" color="red"><v-icon
            size="x-large">mdi-close</v-icon></v-btn>

        <v-btn
          style="position:absolute;border:1px solid #fff;border-top:none;border-left:none;top:0px;left:0px;height:40px;width:40px; opacity:.9;border-radius:0;border-bottom-right-radius:20px;"
          @click="emits('close')" elevation="1" min-width="0" color="red"><v-icon
            size="x-large">mdi-close</v-icon></v-btn>


        <span class="ml-8"></span> <span class="font-weight-medium  text-h6">
          <v-icon class="mr-0" style="opacity:.7" size="20">mdi-checkbox-multiple-marked</v-icon>
          Platform Seçenek Eşleştirme</span>

      </v-card-title>

      <v-card-text style="background-color:#eee" class="mt-2"
        v-if="choiceSyncInfo?.integrationCategoryChoices?.length > 0">
        <v-row>
          <v-col cols="4" class="pl-2">



            <v-card class="pa-4"
              style="margin-top:1px;overflow-y:auto;border:1px solid #ddd;height:calc(100vh - 190px);background-color:#f3f3f3;border-top-right-radius: 0;border-top-left-radius: 0;"
              variant="flat">

              <div class="mt-4 mb-8">
                <div class="d-flex align-center">
                  <div style="min-width:180px">
                    <div class="font-weight-light text-caption mt-2" style="line-height: .7;font-size:10px!important">
                      Entegrasyonik Kategori
                    </div>
                    <span class="font-weight-medium">{{ choiceSyncInfo.category.title }}</span>
                    <div class="font-weight-light text-caption mt-4" style="line-height: .7;font-size:10px!important">
                      Entegrasyonik Seçenek
                    </div>
                    <span class="font-weight-medium">{{ choiceSyncInfo.choice.title }}</span>
                    <div class="font-weight-light text-caption mt-4" style="line-height: .7;font-size:10px!important">
                      Platform
                    </div>
                    <span class="font-weight-medium">{{ choiceSyncInfo.integration.title }}</span>
                    <div class="font-weight-light text-caption mt-4" style="line-height: .7;font-size:10px!important">
                      {{ choiceSyncInfo.integration.title }} Kategori
                    </div>
                    <span class="font-weight-medium">{{ choiceSyncInfo.integrationCategory.title }}</span>
                  </div>
                  <div class="ml-12">
                    <v-card class="pa-4"
                      style="border:1px solid #ddd;background-color:#f3f3f3;border-top-right-radius: 0;border-top-left-radius: 0;"
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
                type="tel" maxlength="160" width="200" bg-color="textfieldColor" item-value="_id"
                :items="choiceSyncInfo.integrationCategoryChoices" prepend-icon="mdi-checkbox-multiple-outline"
                :hint="$t('productDefinitions.category.platformChoiceDesc')" persistent-hint
                v-model="choiceSyncInfo.mapping.integrationCategoryChoiceId" hide-details>
                <template v-slot:label>
                  <span class="font-weight-medium">
                    {{ choiceSyncInfo.integration.title }}</span> Seçeneği
                </template>


                <template v-slot:selection="{ item, index }: any">
                  {{ item.title }} <span v-if="item.raw.mandatory == true" class="ml-2 font-weight-bold"
                    style="color:red">Zorunlu</span>
                </template>


                <template v-slot:prepend-item>
                  <v-list-item class="" style="border:1px solid #ddd;border-top:none">
                    <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop variant="outlined"
                      @mousedown.stop="1" density="compact" type="tel" maxlength="160" class="mt-2" clearable counter
                      bg-color="textfieldColor" :rules="formRules.searchRules" v-model="choiceSearchText"
                      :hint="$t('productDefinitions.category.searchDesc')">
                      <template v-slot:label>
                        <span class="font-weight-light">Filtrele</span>
                      </template>
                    </v-text-field>
                  </v-list-item>
                </template>
                <template v-slot:item="{ item, index, props }: any">
                  <v-list-item v-bind="props" class="" style="border:1px solid #ddd;border-top:none">
                    <template #title>
                    </template>
                    <div class="d-flex justify-start align-center ml-6">
                      <div v-if="item.raw.level && item.raw.level > 0" v-for="n in item.raw.level" style="width:25px">
                      </div>
                      <div class="mr-2 font-weight-thin">{{ index + 1 }}</div> {{ item.title }} <span
                        v-if="item.raw.mandatory == true" class="ml-2 font-weight-bold" style="color:red">Zorunlu</span>
                    </div>
                  </v-list-item>
                </template>

              </v-select>
            </v-card>


          </v-col>

          <v-col>
            <v-card class="pa-4"
              style="margin-top:1px;overflow-y:scroll;border:1px solid #ddd;height:calc(100vh - 190px);background-color:#f3f3f3;border-top-right-radius: 0;border-top-left-radius: 0;"
              variant="flat">
              <div class="d-flex align-center fill-height justify-center"
                v-if="!choiceSyncInfo.mapping.integrationCategoryChoiceId">
                <HintComponent>
                  Seçenek Değerleri eşleştirmek için önce sol taraftaki bölümden <span class="font-weight-bold ma-1">
                    {{ choiceSyncInfo.integration.title }} Seçeneği</span> ' ni belirleyiniz.
                </HintComponent>
              </div>


              <div class="d-flex align-start mt-4 justify-center" v-else>
                <!--                 <v-divider thickness="2" class="mr-4" style="" vertical/> -->
                <div class="flex-grow-1">

                  <v-row>
                    <v-col cols=4 v-for="(choiceValue, index) of choiceSyncInfo.choice?.values">
                      <div class="">


                        <v-text-field v-if="computedAllowCustom == true" prepend-icon="mdi-checkbox-outline"
                          variant="outlined" density="compact" type="tel" maxlength="160" width="200" clearable
                          bg-color="textfieldColor" class="customTextField" hide-details
                          v-model="choiceSyncInfo.mapping.values[choiceValue._id]">
                          <template v-slot:label>
                            <span class="font-weight-normal"> <span style="opacity:.6">Entegrasyonik</span> {{
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

<style></style>