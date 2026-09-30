<template>

  <CardComponent icon="mdi-checkbox-multiple-marked" title="Varyant Bilgileri" :isHovered="false" class="pva-s1">
    <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>

    <template #header>

      <EkButton tone="primary" size="sm" icon="mdi-check" @click="save()">Varyanta Ata</EkButton>

      <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Kapat" @click="emits('close')" />

    </template>

    <template v-if="tab">

      <div
        class="pt-0 pva-s4">

        <div v-for="clientMarketplace of computedPlatformList" class="pa-0 pt-0"
          :class="tab.code == clientMarketplace.code ? 'pva-tab--active' : 'pva-tab--idle-8'">
          <v-sheet v-if="clientMarketplace?.type?.code == 'marketplace'"
            @click="changeIntegration(clientMarketplace.code); tab = clientMarketplace"
            class="mt-0 mr-0 mb-0 ml-0 mr-0 pa-3 text-center d-flex justify-center pva-s5"
            :class="[tab.code == clientMarketplace.code ? 'elevation-5 pva-logo--active' : 'pva-logo--idle']" :style="{ 'background-color': clientMarketplace.color }">
            <v-img :width="clientMarketplace.width"
              :src="integrationStore.getIntegrationImagePath(clientMarketplace)"></v-img>
          </v-sheet>
        </div>

        <div v-for="clientEcommerce of integrationStore.getClientECommerces()" class="pa-0 pt-0"
          :class="tab.code == clientEcommerce.code ? 'pva-tab--active' : 'pva-tab--idle-9'">
          <v-sheet
            @click="changeIntegration(clientEcommerce.code); tab = clientEcommerce"
            class="mt-0 mr-0 mb-0 ml-0 mr-0 pa-3 text-center d-flex justify-center pva-s5"
            :class="[tab.code == clientEcommerce.code ? 'elevation-5 pva-logo--active' : 'pva-logo--idle']" :style="{ 'background-color': clientEcommerce.color }">
            <v-img :width="clientEcommerce.width"
              :src="integrationStore.getIntegrationImagePath(clientEcommerce)"></v-img>
          </v-sheet>
        </div>



        <div v-for="clientErp of integrationStore.getClientErps()" class="pa-0 pt-0"
          :class="tab.code == clientErp.code ? 'pva-tab--active' : 'pva-tab--idle-9'">
          <v-sheet
            @click="changeIntegration(clientErp.code); tab = clientErp"
            class="mt-0 mr-0 mb-0 ml-0 mr-0 pa-3 text-center d-flex justify-center pva-s5"
            :class="[tab.code == clientErp.code ? 'elevation-5 pva-logo--active' : 'pva-logo--idle']" :style="{ 'background-color': clientErp.color }">
            <v-img :width="clientErp.width" :src="integrationStore.getIntegrationImagePath(clientErp)"></v-img>
          </v-sheet>
        </div>

      </div>


      <div v-if="editingVariant.platforms" class="pva-s6">

        <v-list class="pa-0 ma-0 card-component pva-s7">

          <v-list-group value="batch">
            <template v-slot:activator="{ props }">

              <v-list-item v-bind="props" class="pl-2 pr-2 card-component-header pva-s8">
                <template #title>
                  <span class="pva-s9">
                    <div class="font-weight-bold pva-s10"><v-icon
                        class="mr-1">mdi-information-outline</v-icon>Platform Bazında Bilgiler</div>
                  </span>
                </template>
              </v-list-item>
            </template>
            <v-divider class="mb-4" />

            <v-list-item class="pl-0 pva-s11"
              v-if="editingVariant.platforms[tab.code]">
              <VariantInfoComponent v-model="editingVariant.platforms[tab.code].mapping"
                :productInfoForm="productInfoForm" />
              <component :is="platformInfoComponentsMap.get(tab.code)"
                v-model="editingVariant.platforms[tab.code].mapping" :productInfoForm="productInfoForm" />
            </v-list-item>
          </v-list-group>
        </v-list>
        <v-divider class="mb-8" />



        <div>
          <div class="d-flex justify-center" v-if="checkCategoryPlatformMappingResult.code != 'SUCCESS'">
            <LoadingComponent :info="$t('productDefinitions.category.platformChoiceLoading')" />


            <div v-if="checkCategoryPlatformMappingResult.code == 'PLATFORM'">

              <div class="d-flex justify-center mt-4 text-error font-weight-medium">
                Kategorisi Eşleştirmesi Yapılmalı.
              </div>
              <div class="d-flex justify-center mt-1 mb-4">
                <ul class="">
                  <li v-for="choice of checkCategoryPlatformMappingResult.choices">
                    <div class="font-weight-bold">
                      {{ choicesStore.getChoiceTitle(choice) }}
                    </div>
                  </li>
                </ul>
              </div>

              <HintComponent>
                Kategoriler sayfasında
                <span class="font-weight-bold mr-1 ml-1">
                  {{ categoriesStore.getCategoryTitle(productInfoForm.category) }}
                </span>
                kategorisi ayarlarında
                <span class="font-weight-bold mr-1 ml-1">
                  {{ integrationStore.getIntegrationTitle(tab.code) }}
                </span>
                eşleştirmesi yapılmalı.
              </HintComponent>

            </div>
            <div v-else-if="checkCategoryPlatformMappingResult.code == 'CHOICE'">

              <div class="d-flex justify-center mt-4 text-error font-weight-medium">
                Seçenek Eşleştirmesi Yapılmalı.
              </div>
              <div class="d-flex justify-center mt-1 mb-4">
                <ul class="">
                  <li v-for="choice of checkCategoryPlatformMappingResult.choices">
                    <div class="font-weight-bold">
                      {{ choicesStore.getChoiceTitle(choice) }}
                    </div>
                  </li>
                </ul>
              </div>

              <HintComponent>
                Kategoriler sayfasında
                <span class="font-weight-bold mr-1 ml-1">
                  {{ categoriesStore.getCategoryTitle(productInfoForm.category) }}
                </span>
                kategorisi ayarlarında
                <span class="font-weight-bold mr-1 ml-1">
                  {{ integrationStore.getIntegrationTitle(tab.code) }}
                </span>
                platformu için seçenek eşleştirmeleri tamamlanmalıdır.
                <div>
                </div>

              </HintComponent>

            </div>

          </div>
          <template v-else>
            <template v-if="editingVariant.platforms[selectedIntegrationCode]?.attributes" :color="platform.color+'08'">

              <template v-if="platformAttributes.get(selectedIntegrationCode)">




                <CardComponent title="Varyant Özellikleri (*)">
                  <v-row>
                    <v-col cols="12" md="4" sm="6" lg="3" xl="2"
                      v-for="attribute of platformAttributes.get(selectedIntegrationCode).filter((item: any) => item.varianter || item.slicer)">

                      <v-combobox v-if="attribute.allowCustom" @click.stop="1" v-ripple.stop auto-select-first="exact"
                        clearable variant="outlined" density="compact" type="tel" maxlength="160" min-width="170"
                        item-value="id" class="customTextField"
                        :items="getLimitedAttributeValues(attribute, selectedIntegrationCode)"
                        :hint="$t('productDefinitions.category.platformChoiceDesc')" persistent-hint hide-details
                        :model-value="getComboboxDisplayValue(attribute, selectedIntegrationCode)"
                        @update:model-value="(val: any) => handleUpdate(val, selectedIntegrationCode, attribute)">

                        <template v-slot:label>
                          <span class="font-weight-light">
                            {{ attribute.title }}</span>
                        </template>
                        <template v-slot:no-data>
                          <div class="d-flex justify-center align-center font-weight-bold">
                            {{ attribute.lazyValues == true ? 'Yükleniyor' : 'Veri Yok' }}
                          </div>
                        </template>

                        <template v-slot:prepend-item>
                          <v-list-item class="pva-s12">
                            <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop
                              variant="outlined" @keydown.stop @mousedown.stop="1" density="compact" type="tel"
                              maxlength="160" class="mt-2 customTextField" clearable counter
                              v-model="attributeSearchText[selectedIntegrationCode + '_' + attribute._id]"
                              :hint="$t('productDefinitions.category.searchDesc')">
                              <template v-slot:label>
                                <span class="font-weight-light">Filtrele</span>
                              </template>
                            </v-text-field>
                          </v-list-item>
                        </template>

                        <template v-slot:item="{ item, index, props }: any">
                          <v-list-item v-bind="props" class="pva-s12">
                            <template #title>
                            </template>
                            <div class="d-flex justify-start align-center ml-6">
                              <div v-if="item.raw.level && item.raw.level > 0" v-for="n in item.raw.level" class="pva-s13">
                              </div>
                              <div class="mr-2 font-weight-thin">{{ index + 1 }}</div> {{ item.title }} <span
                                v-if="item.raw.mandatory == true" class="ml-2 font-weight-bold pva-s14">Zorunlu</span>
                            </div>
                          </v-list-item>
                        </template>

                      </v-combobox>

                      <v-select v-else @click.stop v-ripple.stop variant="outlined" density="compact" type="tel"
                        clearable maxlength="160" min-width="170" item-value="id" class="customTextField"
                        :items="getLimitedAttributeValues(attribute, selectedIntegrationCode)"
                        :hint="$t('productDefinitions.category.platformChoiceDesc')" persistent-hint hide-details
                        :model-value="getSelectDisplayValue(attribute, selectedIntegrationCode)"
                        @update:model-value="(val: any) => handleUpdate(val, selectedIntegrationCode, attribute)"
                        :readonly="disabledAttributes.includes(attribute._id)">

                        <template v-slot:label>
                          <span class="font-weight-light">
                            {{ attribute.title }}</span>
                        </template>
                        <template v-slot:no-data>
                          <div class="d-flex justify-center align-center font-weight-bold">
                            {{ attribute.lazyValues == true ? 'Yükleniyor' : 'Veri Yok' }}
                          </div>
                        </template>

                        <template v-slot:prepend-item>
                          <v-list-item class="pva-s12">
                            <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop
                              variant="outlined" @keydown.stop @mousedown.stop="1" density="compact" type="tel"
                              maxlength="160" class="mt-2 customTextField" clearable counter
                              v-model="attributeSearchText[selectedIntegrationCode + '_' + attribute._id]"
                              :hint="$t('productDefinitions.category.searchDesc')">
                              <template v-slot:label>
                                <span class="font-weight-light">Filtrele</span>
                              </template>
                            </v-text-field>
                          </v-list-item>
                        </template>

                        <template v-slot:item="{ item, index, props }: any">
                          <v-list-item v-bind="props" class="pva-s12">
                            <template #title>
                            </template>
                            <div class="d-flex justify-start align-center ml-6">
                              <div v-if="item.raw.level && item.raw.level > 0" v-for="n in item.raw.level" class="pva-s13">
                              </div>
                              <div class="mr-2 font-weight-thin">{{ index + 1 }}</div> {{ item.title }} <span
                                v-if="item.raw.mandatory == true" class="ml-2 font-weight-bold pva-s14">Zorunlu</span>
                            </div>
                          </v-list-item>
                        </template>

                      </v-select>
                    </v-col>
                  </v-row>
                </CardComponent>

                <div class="mt-8"></div>
                <CardComponent title="Zorunlu Özellikleri (*)">

                  <v-row>
                    <v-col cols="4" md="4" sm="6" lg="3" xl="2"
                      v-for="attribute of platformAttributes.get(selectedIntegrationCode).filter((item: any) => item.required && item.varianter == false && item.slicer == false)">
                      <v-combobox v-if="attribute.allowCustom" @click.stop="1" v-ripple.stop auto-select-first="exact"
                        clearable variant="outlined" density="compact" type="tel" maxlength="160" min-width="170"
                        item-value="id" class="customTextField"
                        :items="getLimitedAttributeValues(attribute, selectedIntegrationCode)"
                        :hint="$t('productDefinitions.category.platformChoiceDesc')" persistent-hint hide-details
                        :model-value="getComboboxDisplayValue(attribute, selectedIntegrationCode)"
                        @update:model-value="(val: any) => handleUpdate(val, selectedIntegrationCode, attribute)"
                        :readonly="disabledAttributes.includes(attribute._id)">

                        <template v-slot:label>
                          <span class="font-weight-light">
                            {{ attribute.title }}</span>
                        </template>
                        <template v-slot:no-data>
                          <div class="d-flex justify-center align-center font-weight-bold">
                            {{ attribute.lazyValues == true ? 'Yükleniyor' : 'Veri Yok' }}
                          </div>
                        </template>

                        <template v-slot:prepend-item>
                          <v-list-item class="pva-s12">
                            <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop
                              variant="outlined" @keydown.stop @mousedown.stop="1" density="compact" type="tel"
                              maxlength="160" class="mt-2 customTextField" clearable counter
                              v-model="attributeSearchText[selectedIntegrationCode + '_' + attribute._id]"
                              :hint="$t('productDefinitions.category.searchDesc')">
                              <template v-slot:label>
                                <span class="font-weight-light">Filtrele</span>
                              </template>
                            </v-text-field>
                          </v-list-item>
                        </template>

                        <template v-slot:item="{ item, index, props }: any">
                          <v-list-item v-bind="props" class="pva-s12">
                            <template #title>
                            </template>
                            <div class="d-flex justify-start align-center ml-6">
                              <div v-if="item.raw.level && item.raw.level > 0" v-for="n in item.raw.level" class="pva-s13">
                              </div>
                              <div class="mr-2 font-weight-thin">{{ index + 1 }}</div> {{ item.title }} <span
                                v-if="item.raw.mandatory == true" class="ml-2 font-weight-bold pva-s14">Zorunlu</span>
                            </div>
                          </v-list-item>
                        </template>

                      </v-combobox>

                      <v-select v-else @click.stop v-ripple.stop variant="outlined" density="compact" type="tel"
                        clearable maxlength="160" min-width="170" item-value="id" class="customTextField"
                        :items="getLimitedAttributeValues(attribute, selectedIntegrationCode)"
                        :hint="$t('productDefinitions.category.platformChoiceDesc')" persistent-hint hide-details
                        :model-value="getSelectDisplayValue(attribute, selectedIntegrationCode)"
                        @update:model-value="(val: any) => handleUpdate(val, selectedIntegrationCode, attribute)"
                        :readonly="disabledAttributes.includes(attribute._id)">
                        <template v-slot:label>
                          <span class="font-weight-light">
                            {{ attribute.title }}</span>
                        </template>
                        <template v-slot:no-data>
                          <div class="d-flex justify-center align-center font-weight-bold">
                            {{ attribute.lazyValues == true ? 'Yükleniyor' : 'Veri Yok' }}
                          </div>
                        </template>

                        <template v-slot:prepend-item>
                          <v-list-item class="pva-s12">
                            <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop
                              variant="outlined" @keydown.stop @mousedown.stop="1" density="compact" type="tel"
                              maxlength="160" class="mt-2 customTextField" clearable counter
                              v-model="attributeSearchText[selectedIntegrationCode + '_' + attribute._id]"
                              :hint="$t('productDefinitions.category.searchDesc')">
                              <template v-slot:label>
                                <span class="font-weight-light">Filtrele</span>
                              </template>
                            </v-text-field>
                          </v-list-item>
                        </template>

                        <template v-slot:item="{ item, index, props }: any">
                          <v-list-item v-bind="props" class="pva-s12">
                            <template #title>
                            </template>
                            <div class="d-flex justify-start align-center ml-6">
                              <div v-if="item.raw.level && item.raw.level > 0" v-for="n in item.raw.level" class="pva-s13">
                              </div>
                              <div class="mr-2 font-weight-thin">{{ index + 1 }}</div> {{ item.title }} <span
                                v-if="item.raw.mandatory == true" class="ml-2 font-weight-bold pva-s14">Zorunlu</span>
                            </div>
                          </v-list-item>
                        </template>

                      </v-select>
                    </v-col>
                  </v-row>
                </CardComponent>

                <div class="mt-8"></div>
                <CardComponent title="Opsiyonel Özellikleri">

                  <v-row>
                    <v-col cols="12" md="4" sm="6" lg="3" xl="2"
                      v-for="attribute of platformAttributes.get(selectedIntegrationCode).filter((item: any) => item.required == false && item.varianter == false)">

                      <v-combobox v-if="attribute.allowCustom" @click.stop="1" v-ripple.stop auto-select-first="exact"
                        clearable variant="outlined" density="compact" type="tel" maxlength="160" min-width="170"
                        item-value="id" class="customTextField"
                        :items="getLimitedAttributeValues(attribute, selectedIntegrationCode)"
                        :hint="$t('productDefinitions.category.platformChoiceDesc')" persistent-hint hide-details
                        :model-value="getComboboxDisplayValue(attribute, selectedIntegrationCode)"
                        @update:model-value="(val: any) => handleUpdate(val, selectedIntegrationCode, attribute)"
                        :readonly="disabledAttributes.includes(attribute._id)">
                        <template v-slot:label>
                          <span class="font-weight-light">
                            {{ attribute.title }}</span>
                        </template>
                        <template v-slot:no-data>
                          <div class="d-flex justify-center align-center font-weight-bold">
                            {{ attribute.lazyValues == true ? 'Yükleniyor' : 'Veri Yok' }}
                          </div>
                        </template>
                        <template v-slot:prepend-item>
                          <v-list-item class="pva-s12">
                            <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop
                              variant="outlined" @keydown.stop @mousedown.stop="1" density="compact" type="tel"
                              maxlength="160" class="mt-2 customTextField" clearable counter
                              v-model="attributeSearchText[selectedIntegrationCode + '_' + attribute._id]"
                              :hint="$t('productDefinitions.category.searchDesc')">
                              <template v-slot:label>
                                <span class="font-weight-light">Filtrele</span>
                              </template>
                            </v-text-field>
                          </v-list-item>
                        </template>

                        <template v-slot:item="{ item, index, props }: any">
                          <v-list-item v-bind="props" class="pva-s12">
                            <template #title>
                            </template>
                            <div class="d-flex justify-start align-center ml-6">
                              <div v-if="item.raw.level && item.raw.level > 0" v-for="n in item.raw.level" class="pva-s13">
                              </div>
                              <div class="mr-2 font-weight-thin">{{ index + 1 }}</div> {{ item.title }} <span
                                v-if="item.raw.mandatory == true" class="ml-2 font-weight-bold pva-s14">Zorunlu</span>
                            </div>
                          </v-list-item>
                        </template>

                      </v-combobox>

                      <v-select v-else @click.stop v-ripple.stop variant="outlined" density="compact" type="tel"
                        clearable maxlength="160" min-width="170" item-value="id" class="customTextField"
                        :items="getLimitedAttributeValues(attribute, selectedIntegrationCode)"
                        :hint="$t('productDefinitions.category.platformChoiceDesc')" persistent-hint hide-details
                        :model-value="getSelectDisplayValue(attribute, selectedIntegrationCode)"
                        @update:model-value="(val: any) => handleUpdate(val, selectedIntegrationCode, attribute)"
                        :readonly="disabledAttributes.includes(attribute._id)">
                        <template v-slot:label>
                          <span class="font-weight-light">
                            {{ attribute.title }}</span>
                        </template>
                        <template v-slot:no-data>
                          <div class="d-flex justify-center align-center font-weight-bold">
                            {{ attribute.lazyValues == true ? 'Yükleniyor' : 'Veri Yok' }}
                          </div>
                        </template>

                        <template v-slot:prepend-item>
                          <v-list-item class="pva-s12">
                            <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop
                              variant="outlined" @keydown.stop @mousedown.stop="1" density="compact" type="tel"
                              maxlength="160" class="mt-2 customTextField" clearable counter
                              v-model="attributeSearchText[selectedIntegrationCode + '_' + attribute._id]"
                              :hint="$t('productDefinitions.category.searchDesc')">
                              <template v-slot:label>
                                <span class="font-weight-light">Filtrele</span>
                              </template>
                            </v-text-field>
                          </v-list-item>
                        </template>

                        <template v-slot:item="{ item, index, props }: any">
                          <v-list-item v-bind="props" class="pva-s12">
                            <template #title>
                            </template>
                            <div class="d-flex justify-start align-center ml-6">
                              <div v-if="item.raw.level && item.raw.level > 0" v-for="n in item.raw.level" class="pva-s13">
                              </div>
                              <div class="mr-2 font-weight-thin">{{ index + 1 }}</div> {{ item.title }} <span
                                v-if="item.raw.mandatory == true" class="ml-2 font-weight-bold pva-s14">Zorunlu</span>
                            </div>
                          </v-list-item>
                        </template>

                      </v-select>
                    </v-col>
                  </v-row>
                </CardComponent>

              </template>
              <template v-else>
                <v-card flat class="mt-12 mb-12">
                  <v-card-text class="text-center">
                    <span class="font-weight-bold">{{ selectedIntegrationCode }}</span> kategori özellikleri yükleniyor
                  </v-card-text>
                </v-card>
              </template>
            </template>
          </template>
        </div>
      </div>
    </template>

  </CardComponent>

</template>

<script setup lang="ts">
import { formatNumber } from '@/composables/format'
import { Sortable } from "sortablejs-vue3";
import EkButton from '@/components/ds/EkButton.vue'

import { ref, computed, onMounted, onBeforeMount, nextTick, reactive, onActivated, defineAsyncComponent, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import { useChoicesStore } from '@/stores/choicesStore';
import HintComponent from '@/components/HintComponent.vue';
import CardComponent from '@/components/CardComponent.vue';


import { useIntegrationStore } from '@/stores/integrationStore';
import { useBrandsStore } from '@/stores/brandsStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
const categoriesStore = useCategoriesStore()
const attributeSearchText: any = ref({})
import { useSnackbarStore } from '@/stores/snackbarStore';
import VariantInfoComponent from "./platformInfos/VariantInfoComponent.vue";
const snackbarStore = useSnackbarStore();

const integrationStore = useIntegrationStore()
const brandStore = useBrandsStore()
const platformAttributes: any = ref(new Map())
const choicesStore = useChoicesStore()
var choicesStoreChoices: any = ref()
const tab: any = ref()
const isImages = defineModel({ default: false })
const baseImageURL = ref('https://images.entegrasyonik.com/products/')
const baseTempImageURL = ref(baseImageURL.value + 'temp/')

const emits = defineEmits(['refreshImages', 'close'])
const props = defineProps<{
  productInfoForm: any,
  editingVariant: any
}>()

const selectedIntegrationCode: any = ref()
const restApi = useRestApi()
const variantsList: any = ref()
const loadingComponentRef: any = ref(null)
const fileInputRef: any = ref(null)
const selectedImages: any = ref([])
const checkCategoryPlatformMappingResult: any = ref({})
const productImagesInfo: any = ref(
  {
    isVariant: false,
    selectedChoice: { choiceId: -1, choiceValueId: -1 },
    selectedChoiceForFilter: { choiceId: -1, choiceValueId: -1 },
  }
)

const { t } = useI18n()

const platformInfoComponentsMap = new Map<string, any>([
  ['hepsiburada', defineAsyncComponent(() => import('./platformInfos/HepsiburadaVariantInfoComponent.vue'))],
  ['trendyol', defineAsyncComponent(() => import('./platformInfos/TrendyolVariantInfoComponent.vue'))],
  ['n11', defineAsyncComponent(() => import('./platformInfos/N11VariantInfoComponent.vue'))],
  ['pazarama', defineAsyncComponent(() => import('./platformInfos/PazaramaVariantInfoComponent.vue'))],
  ['ideasoft', defineAsyncComponent(() => import('./platformInfos/IdeasoftVariantInfoComponent.vue'))],
])

const isCustomMap = (integrationCode: any, attributeId: any) => {
  const customMap = integrationStore.getIntegrationCustomMap(integrationCode)
  const found = customMap?.find((item: any) => String(item.attributeId) === String(attributeId))
  if (found) return true
  return false
}

// ---- YENİ FONKSİYONLAR (Nesne yapısı gösterimi için) ----

// Combobox (Serbest metin/Custom) için gösterim değeri
const getComboboxDisplayValue = (attribute: any, integrationCode: string) => {
  const attrObj = props.editingVariant.platforms[integrationCode]?.attributes?.[attribute._id];
  if (!attrObj) return null;

  let valId = typeof attrObj === 'object' ? attrObj.attributeValueId : attrObj;
  let valText = typeof attrObj === 'object' ? attrObj.attributeValue : attrObj;

  if (typeof attrObj === 'object') {
    if (valId) {
      const found = attribute.values?.find((item: any) => String(item.id) === String(valId));
      if (found) return found;
    }
    return valText;
  } else {
    const found = attribute.values?.find((item: any) => String(item.id) === String(attrObj));
    return found || attrObj;
  }
};

// Select Box (Sadece liste seçimi/Id üzerinden) için gösterim değeri
const getSelectDisplayValue = (attribute: any, integrationCode: string) => {
  const attrObj = props.editingVariant.platforms[integrationCode]?.attributes?.[attribute._id];
  if (!attrObj) return null;

  let valId = typeof attrObj === 'object' ? attrObj.attributeValueId : attrObj;
  return valId ? String(valId) : null;
};
// --------------------------------------------------------

const getLimitedAttributeValues = (attribute: any, integrationCode: any) => {
  const searchText =
    (attributeSearchText.value[integrationCode + '_' + attribute._id] || '').toLowerCase();

  const attrObj = props.editingVariant.platforms[integrationCode].attributes[attribute._id];

  const selectedId = attrObj && typeof attrObj === 'object' ? attrObj.attributeValueId : attrObj;

  // filtre
  const filtered =
    (attribute.values || []).filter((v: any) =>
      !searchText ||
      searchText.length < 1 ||
      (selectedId && String(selectedId) === String(v.id)) ||
      (v.title || '').toLowerCase().startsWith(searchText) // ✅ includes → startsWith
    );

  // ilk 500
  let limited = filtered.slice(0, 500);

  if (!selectedId) return limited;

  const idEq = (a: any, b: any) => String(a) === String(b);

  const selIndexInFiltered = filtered.findIndex((v: any) => idEq(v.id, selectedId));
  if (selIndexInFiltered === -1) return limited; // seçili id yoksa

  const selIndexInLimited = limited.findIndex((v: any) => idEq(v.id, selectedId));

  if (selIndexInLimited === 0) {
    // zaten en başta
    return limited;
  } else if (selIndexInLimited > -1) {
    // limited içindeyse başa taşı, diğerlerinin sırası bozulmaz
    const [sel] = limited.splice(selIndexInLimited, 1);
    limited.unshift(sel);
    return limited;
  } else {
    // limited dışında ise başa ekle ve uzunluğu 500'de tut
    const sel = filtered[selIndexInFiltered];
    if (sel) {
      if (limited.length === 500) limited.pop();
      limited.unshift(sel);
    }
    return limited;
  }
};


const loadAttributeValuesIfNeeded = async (attribute: any) => {
  if (attribute.lazyValues == true && (!attribute.values || attribute.values.length == 0)) {
    const tempValue = props.editingVariant?.platforms?.[selectedIntegrationCode.value]?.attributes?.[attribute._id]
    const entegrasyonikCategory = categoriesStore.getCategory(props.productInfoForm.category)
    const integrationCategoryId = entegrasyonikCategory?.platforms?.[selectedIntegrationCode.value]
    const attributeValues = await integrationStore.retrieveIntegrationCategoryAttributeValues(selectedIntegrationCode.value, integrationCategoryId, attribute._id)
    if (tempValue)
      props.editingVariant.platforms[selectedIntegrationCode.value].attributes[attribute._id] = tempValue

    attribute.values = attributeValues
  }
}

const save = () => {
  snackbarStore.addSnackbar({
    show: true,
    text: 'Varyant Özellikleri Kaydedildi',
    timeout: 2000,
    color: 'success'
  })
  emits('close')
}

// ---- YENİ NESNE KAYIT FONKSİYONU ----
const handleUpdate = (val: any, platformCode: any, attribute: any) => {
  const attrId = attribute._id;

  if (val === null || val === undefined || val === '') {
    delete props.editingVariant.platforms[platformCode].attributes[attrId];
    return;
  }

  const attrName = attribute.title;
  let valId = "";
  let valText = "";

  if (typeof val === 'object') {
    valId = String(val.id || "");
    valText = String(val.title || val.name || val.value || "");
  } else {
    if (attribute.allowCustom) {
      valText = String(val);
      const matchedItem = attribute.values?.find((v: any) => (v.title || '').toLowerCase() === valText.toLowerCase());
      if (matchedItem) {
        valId = String(matchedItem.id);
        valText = String(matchedItem.title);
      }
    } else {
      valId = String(val);
      const matchedItem = attribute.values?.find((v: any) => String(v.id) === String(valId));
      if (matchedItem) valText = String(matchedItem.title || matchedItem.name || "");
    }
  }

  props.editingVariant.platforms[platformCode].attributes[attrId] = {
    attributeName: attrName,
    attributeValue: valText,
    attributeValueId: valId
  };
}
// -------------------------------------

const changeIntegration = async (integrationCode: string) => {
  props.editingVariant.platforms = props.editingVariant.platforms || {}
  props.editingVariant.platforms[integrationCode] = props.editingVariant.platforms[integrationCode] || {}
  props.editingVariant.platforms[integrationCode].attributes = props.editingVariant.platforms[integrationCode].attributes || {}
  props.editingVariant.platforms[integrationCode].mapping = props.editingVariant.platforms[integrationCode].mapping || {}
  let guid = loadingComponentRef.value.info(t('loading.info.sortingImages'))
  await retrieveAndSetPlatformAttributes(integrationCode)
  loadingComponentRef.value.remove(guid)


  /* fillPlatformAttributes(integrationCode) */
  selectedIntegrationCode.value = integrationCode

  checkCategoryPlatformMappingResult.value = categoriesStore.checkCategoryPlatformMapping(props.productInfoForm.category, integrationCode)
}


const disabledAttributes: any = ref([])
const fillPlatformAttributes = (integrationCode: string) => {
  disabledAttributes.value = []
  props.editingVariant.choices.forEach((choice: any) => {
    const mapping = categoriesStore.getCategoryPlatformMappingForChoiceId(props.productInfoForm.category, integrationCode, choice.choiceId)
    platformAttributes.value.get(integrationCode)?.forEach((attribute: any) => {
      if (mapping && mapping.integrationCategoryChoiceId == attribute._id) {
        props.editingVariant.platforms[integrationCode].attributes[attribute._id] = mapping.values[choice.choiceValueId]
      }
    })
  })

  const customMap = integrationStore.getIntegrationCustomMap(integrationCode)
  if (customMap && customMap.length > 0) {
    customMap.forEach((item: any) => {
      platformAttributes.value.get(integrationCode)?.forEach((attribute: any) => {
        if (String(item.attributeId) == String(attribute._id)) {
          disabledAttributes.value.push(attribute._id)
          props.editingVariant.platforms[integrationCode].attributes[attribute._id] = brandStore.getBrandTitle(props.productInfoForm[item.value])
        }
      })
    })

  }
}

const retrieveAndSetPlatformAttributes = async (integrationCode: string) => {
  if (platformAttributes.value.get(integrationCode)) return platformAttributes.value.get(integrationCode)
  const resp = await integrationStore.retrieveIntegrationCategoryChoices(integrationCode, categoriesStore.getIntegrationCategoryId(integrationCode, props.productInfoForm.category))
  if (resp && resp.length > 0) {
    const filtered = resp.filter((attribute: any) => !isCustomMap(integrationCode, attribute._id));
    platformAttributes.value.set(integrationCode, filtered)
  }
}

const computedPlatformList = computed(() => {
  return integrationStore.getClientMarketplaces().filter((item: any) => item.type.code == 'marketplace')
})

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

var id = -1
const width = 160
var dragging = ref(false)

const onEndSort = (event: any) => {
  const { newIndex, oldIndex, from, to, item } = event
  if (newIndex == oldIndex) return
  const sortedImageIds = Array.from(to.children).map((item: any) => item.dataset.id)
  sortImages(newIndex, Number(item.dataset.id), sortedImageIds)
}


const sortImages = async (itemIndex: number, imageId: number, sortedImageIds: Array<number>) => {
  let guid = loadingComponentRef.value.info(t('loading.info.sortingImages'))
  const response = await restApi.postImage('sortImages', { sortedImageIds: sortedImageIds, order: props.productInfoForm.images[itemIndex].order, orderChangeId: imageId, productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId })
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount > 0) {
    getImages()
  }
}

const toggleSelectedImagesForId = (imageId: number) => {
  const index = isSelectionExist(imageId)
  if (index == -1) {
    selectedImages.value.push(imageId);
  } else {
    selectedImages.value.splice(index, 1);
  }
}

const isSelectionExist = (imageId: number) => {
  return selectedImages.value.indexOf(imageId)
}

const selectAllImages = computed({
  get() {
    if (!props.productInfoForm.images || props.productInfoForm.images.length == 0) return false
    return selectedImages.value.length === props.productInfoForm.images.length
  },
  set(newValue: boolean) {
    selectedImages.value = []
    if (newValue) {
      for (let currentImage of props.productInfoForm.images) {
        selectedImages.value.push(currentImage._id)
      }
    }
  }
})


const init = async () => {
  tab.value = computedPlatformList.value[0]
  choicesStoreChoices.value = choicesStore.getChoices()
  fileInputRef.value = ""

  const firstIntegrationCode = computedPlatformList.value[0]?.code
  changeIntegration(firstIntegrationCode)
  /* console.log("emre",firstIntegrationCode)
    retrieveAndSetPlatformAttributes(firstIntegrationCode) */
  /* await getImages() */
}


const checkVariantAttributes = async () => {
  const platforms = integrationStore.getClientMarketplaces().filter((item: any) => item.type.code == 'marketplace')
  const variants = [props.editingVariant]
  const currentCategory = categoriesStore.getCategory(props.productInfoForm.category)
  if (currentCategory == undefined) {
    console.error('Current category not found')
    return
  }
  for (const platform of platforms) {
    const integrationCategoryId = currentCategory.platforms[platform.code]
    const integrationCategoryAttributes = await integrationStore.retrieveIntegrationCategoryChoices(platform.code, integrationCategoryId)
    if (!Array.isArray(integrationCategoryAttributes)) continue
    for (const variant of variants) {
      variant.platforms = variant.platforms || {}

      const variantAttributes = variant.platforms[platform.code]?.attributes
      if (variantAttributes) {
        for (const variantIntegrationAttributeId in variantAttributes) {
          const integrationCategoryAttribute = integrationCategoryAttributes.find((item: any) => item._id == variantIntegrationAttributeId)
          let deleteFlag = false
          if (integrationCategoryAttribute?.allowCustom == false) {

            // YENİ NESNE YAPISI İÇİN VAL KONTROLÜ EKLENDİ
            const attrObj = variantAttributes[variantIntegrationAttributeId];
            const valIdToCheck = attrObj && typeof attrObj === 'object' ? attrObj.attributeValueId : attrObj;

            const found = integrationCategoryAttribute?.values?.find((item: any) => item.id == valIdToCheck)
            if (!found) deleteFlag = true
          }
          if (deleteFlag || !integrationCategoryAttribute || !variantAttributes[variantIntegrationAttributeId]) {
            delete variant.platforms[platform.code].attributes[variantIntegrationAttributeId]
          }
        }
      }
    }
  }
}

onBeforeMount(() => {
  /* init() */
})

onActivated(() => {
  checkVariantAttributes()
  console.log("activated att")
  init()
})

onMounted(() => {
  console.log("mounted att")
  init()
})


const downloadImage = (imageId: any) => {
  const link = document.createElement('a');
  link.href = restApi.downloadImage(imageId)
  link.target = "_blank"
  link.click();
}

const constructImageUrl = async (image: any) => {
  let binaryImageData = await restApi.postImage('getImage', image)

  return URL.createObjectURL(binaryImageData)

}

const getVariantsList = async () => {
  await nextTick(() => { })
  let guid = loadingComponentRef.value.info(t('loading.info.getVariantsList'))
  await sleep(1)
  let response = await restApi.post("VariantService/getVariantsList", { _id: props.productInfoForm._id })
  loadingComponentRef.value.remove(guid)
  if (response && response.variants) {
    variantsList.value = []
    let flag = true
    for (let variant of response.variants) {
      variantsList.value.push({ title: variant.title, value: variant._id })
      if (flag == true) {
        console.log(variantsList.value, variantsList.value[0])
        /* productImagesInfo.value.selectedChoice = variantsList.value[0].value */
        flag = false
      }
    }
  }
}

defineExpose({
  getVariantsList
});

const images = ref<Array<{ file: File, id: number }>>(
  []
)
const thumbnails = ref<Array<{ url: string, id: number, width: number, height: number }>>(
  []
)



var getFileName = (id: number) => {
  for (var image of images.value) {
    if (image.id == id) return image.file.name
  }
}

var getFileSizeOld = (id: number) => {
  for (var image of images.value) {
    if (image.id == id) {
      var suffix = "MB"
      var conversion = 1000000
      if (image.file.size < 1000000) {
        conversion = 1000
        suffix = "KB"
      }
      return formatNumber(Math.round(image.file.size / conversion * 10) / 10) + suffix

    }
  }
}

var getFileSize = (size: number) => {
  if (size == undefined) return 0
  var suffix = "MB"
  var conversion = 1000000
  if (size < 1000000) {
    conversion = 1000
    suffix = "KB"
  }
  return formatNumber(Math.round(size / conversion * 10) / 10) + suffix
}

var files = ref([])
function addImage1() {
  console.log(files)
}

const deleteImage = async (imageId: number) => {
  let guid = loadingComponentRef.value.info(t('loading.info.getVariantsList'))
  const response = await restApi.postImage('deleteImage', { imageId, productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId })
  loadingComponentRef.value.remove(guid)

  if (response && response.acknowledged == true && response.modifiedCount == 1) {
    getImages()
  }
}


const deleteImageSelected = async () => {
  let guid = loadingComponentRef.value.info(t('loading.info.getVariantsList'))
  await sleep(1)
  const response = await restApi.postImage('deleteImageSelected', { productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId, tempProductId: props.productInfoForm.tempId, selectedImages: selectedImages.value })
  loadingComponentRef.value.remove(guid)
  if (response && response.acknowledged == true) {
    getImages()
  }
}



const getImages = async () => {
  if (selectedImages.value) selectedImages.value.length = 0
  emits('refreshImages', '')
  /* await nextTick(() => { })
  
    let selectedChoice = productImagesInfo.value.selectedChoiceForFilter
      if(selectedChoice.choiceId==-1 || selectedChoice.choiceValueId==-1) selectedChoice = undefined
  
    let guid = loadingComponentRef.value.info(t('loading.info.getImages'))
    props.productInfoForm.images = await restApi.postImage('getImages', {
      productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId,
      selectedChoice: selectedChoice
    })
    selectedImages.value.length = 0
    await sleep(1)
    loadingComponentRef.value.remove(guid) */
}

const assignImages = async () => {
  await nextTick(() => { })
  let selectedChoice = productImagesInfo.value.selectedChoice
  if (selectedChoice.choiceId == -1 || selectedChoice.choiceValueId == -1) selectedChoice = undefined

  let guid = loadingComponentRef.value.info(t('loading.info.getImages'))
  await restApi.post('ImageService/assignImages', {
    productId: props.productInfoForm._id,
    selectedChoice: selectedChoice,
    selectedImages: selectedImages.value
  })
  await sleep(1)
  loadingComponentRef.value.remove(guid)
  getImages()
}

const addImage = async ($event: Event) => {
  const target = $event.target as HTMLInputElement;
  if (target && target.files) {
    if (target.files.length > 5) {
      target.value = ""
      return false
    }
    id++


    const formData = new FormData();
    const pid = productImagesInfo.value._id
    const tempId = productImagesInfo.value.tempId
    let selectedChoice = productImagesInfo.value.selectedChoice
    if (selectedChoice.choiceId == -1 || selectedChoice.choiceValueId == -1) selectedChoice = undefined

    formData.append('product', JSON.stringify({
      _id: props.productInfoForm._id,
      tempId: props.productInfoForm.tempId,
      selectedChoice: selectedChoice
    }));
    for (let i = 0; i < target.files.length; i++) {
      formData.append('files', target.files[i]);
    }


    let guid = loadingComponentRef.value.info(t('loading.info.imageUploading'))
    await restApi.postImageUpload(formData)
    loadingComponentRef.value.remove(guid)
    await getImages()


    target.value = ""
    /* for (let currentImage of currentImages.value) {
          currentImage.imageSrc = await constructImageUrl(currentImage)
        }
      */
    /* images.value.push({ file: target.files[0], id })
      */    //reader.readAsDataURL(target.files[0])
  }
}


const reader = new FileReader();
reader.onload = (event) => {
  const image = new Image();
  if (event.target)
    (<any>image.src) = event.target.result;
  image.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const thumbnailWidth = width + 400;
    const thumbnailHeight = (thumbnailWidth / image.width) * image.height;
    canvas.width = thumbnailWidth;
    canvas.height = thumbnailHeight;
    if (ctx)
      ctx.drawImage(image, 0, 0, thumbnailWidth, thumbnailHeight);
    thumbnails.value.push({ url: canvas.toDataURL('image/png'), id, width: canvas.width, height: canvas.height })
  };
};




const file = ref<File | null>();
const form = ref<HTMLFormElement>();
var thumbnailUrl = ref("")

const config = {
  maxSize: 2000000,
}
/* function onFileChanged($event: Event) {
  const target = $event.target as HTMLInputElement;
  if (target && target.files) {
    file.value = target.files[0];
    generateThumbnail(file.value)
  }
}
 */
async function saveImage() {
  if (file.value) {
    try {
      // save file.value
    } catch (error) {
      console.error(error);
      form.value?.reset();
      file.value = null;
    } finally {
    }
  }
};

function generateThumbnail1(file: any) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const image = new Image();
    if (event.target)
      (<any>image.src) = event.target.result;

    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Set the canvas size to the thumbnail size you desire
      const thumbnailWidth = 100;
      const thumbnailHeight = (thumbnailWidth / image.width) * image.height;

      canvas.width = thumbnailWidth;
      canvas.height = thumbnailHeight;

      // Draw the image on the canvas
      if (ctx)
        ctx.drawImage(image, 0, 0, thumbnailWidth, thumbnailHeight);

      // Convert the canvas content to a data URL
      thumbnailUrl.value = canvas.toDataURL('image/jpeg');
    };
  };

  // Read the file as a data URL
  reader.readAsDataURL(file);
}

const imageSrc = computed(() => {
  if (file.value)
    console.log(file.value.size)
  if (!file.value) return "ffff"
  console.log(file)
  var a = URL.createObjectURL(file.value)
  console.log(a)
  return a

})

</script>

<style>
.dropZone {
  position: relative;
  border: 1px dashed black;
}

.dropZone:hover {
  background-color: red;
}

.dropZone:hover .dropZone-title {
  color: var(--ek-color-info);
}

.dropZone-info {
  color: var(--ek-color-content-muted);
  position: absolute;
  text-align: center;
}

.dropZone-title {
  color: var(--ek-color-content-muted);
}

.fileInput {
  position: absolute;
  cursor: pointer;
  opacity: 0;
  height: 100%;
  width: 100%;
}

.dragDropOn .dragDropOnZone {
  background-color: var(--ek-color-info);
}

.dragDropOff .dragDropOnZone {}

.dragDropOn {
  background-color: var(--ek-color-info);
}

.dragDropOff {}

.dragDropOn .dragCard {
  /* top: 204px; */

}

.dragCard {
  /* position: absolute; */
  /* top: 184px; */
  /* top: 150px;
  bottom: 2px;
  right: 0;
  left: 0; */
  border: 0px dashed var(--ek-color-border-default);

}

.dropZone input {
  cursor: pointer;
  opacity: 1;
}

.dropZone-upload-limit-info {
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
}

.dropZone-over {
  background: var(--ek-color-surface-sunken);
  opacity: 0.8;
}

.dropZone-uploaded {
  width: 80%;
  height: 200px;
  position: relative;
  border: 0px dashed var(--ek-color-border-default);
}

.dropZone-uploaded-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--ek-color-content-muted);
  position: absolute;
  top: 50%;
  width: 100%;
  transform: translate(0, -50%);
  text-align: center;
}

.removeFile {
  width: 200px;
}
</style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.pva-s1 {
  overflow-y: scroll !important;
  border: 1px solid var(--ek-color-border-default) !important;
  height: calc(100vh - 110px) !important;
}

.pva-s2 {
  min-width: 150px !important;
  border: 1px solid var(--ek-color-border-strong) !important;
}

.pva-s3 {
  border: 1px solid var(--ek-color-border-strong) !important;
  width: 30px !important;
  opacity: .9 !important;
}

.pva-s4 {
  position: fixed !important;
  z-index: 0 !important;
  background-color: transparent !important;
  height: 100% !important;
  min-width: 150px !important;
  border-right: 0px solid var(--ek-color-border-default) !important;
}

.pva-s5 {
  cursor: pointer !important;
  border-radius: 5px !important;
  border: 1px solid white !important;
}

.pva-s6 {
  margin-left: 160px !important;
}

.pva-s7 {
  z-index: 0 !important;
}

.pva-s8 {
  border-radius: 0px !important;
  min-height: 40px !important;
  border: 1px solid var(--ek-color-border-default) !important;
}

.pva-s9 {
  font-size: .8em !important;
}

.pva-s10 {
  font-size: 1.1em !important;
}

.pva-s11 {
  padding-inline-start: 0px !important;
}

.pva-s12 {
  border: 1px solid var(--ek-color-border-default) !important;
  border-top: none !important;
}

.pva-s13 {
  width: 25px !important;
}

.pva-s14 {
  color: red !important;
}

/* Platform sekme logolari (onceki dinamik satir ici stil; arka plan VERI rengi olarak satir icinde kalir). */
.pva-tab--active {
  filter: brightness(1);
}

.pva-tab--idle-8 {
  opacity: .8;
  filter: brightness(0.9);
}

.pva-tab--idle-9 {
  opacity: .9;
  filter: brightness(0.9);
}

.pva-logo--active,
.pva-logo--idle {
  height: 70px !important;
  transition: width var(--ek-duration-slow) var(--ek-easing-standard), box-shadow var(--ek-duration-slow) var(--ek-easing-standard);
}

.pva-logo--active {
  width: 130px !important;
}

.pva-logo--idle {
  width: 80px !important;
}
</style>
