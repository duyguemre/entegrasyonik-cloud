<template>
  <div class="categorySyncComponent pa-4 pt-0 pb-0">

    <v-menu v-model="confirmationDelete.isDialogOpen" :close-on-content-click="false"
      :activator="confirmationDelete.activator" @update:model-value="cancelDeleteCategory()">
      <template v-slot:activator="{ props }">
        <span v-bind="props"></span>
      </template>

      <v-card prepend-icon="mdi-delete-outline" color="danger" class="pl-4 pr-4">
        <template v-slot:title>
          <div class="d-flex align-center justify-center">
            <v-icon>mdi-exclamation</v-icon>
            KATEGORİ SİLİNECEK
            <v-icon size="xx-large">mdi-exclamation</v-icon>
          </div>
        </template>
        <template v-slot:text>
          <div class="d-flex justify-center">Silmek istediğinizden emin misiniz?</div>
          <div class="mt-4 mb-4 text-center">
            <v-btn color="tonal" min-width="100" variant="outlined" @click="cancelDeleteCategory()" class="mr-4">
              {{ $t('common.cancel') }}
            </v-btn>
            <v-btn color="error" bg-color="error" variant="flat" style="border:1px solid white" min-width="100"
              @click="deleteCategory()">
              {{ $t('common.delete') }}
            </v-btn>
          </div>
        </template>
      </v-card>
    </v-menu>

    <LoadingComponent attach=".categoryListView" ref="loadingComponentRef"></LoadingComponent>

    <v-dialog scrim persistent :retain-focus="false" v-model="show" location-strategy="connected" target="cursor"
      no-click-animation :close-on-content-click="false" :attach="'.categoryListComponentView'"
      style="transition: opacity .1s ease-in!important"
      :style="!choiceSyncInfo.isChoiceSyncOpen && !isChoiceMappingOpen ? { 'visibility': 'hidden', 'opacity': '.2!important' } : {}"
      :contained="true" location="left" height="100%" width="100%">

      <keep-alive>
        <ChoicesSyncComponent v-model="choiceSyncInfo" style="transition: opacity .2s ease-in!important"
          :style="!choiceSyncInfo.isChoiceSyncOpen ? { 'opacity': '.2!important' } : {}" key="ChoicesSyncComponent"
          @close="choiceSyncInfo.isChoiceSyncOpen = false" v-if="choiceSyncInfo.isChoiceSyncOpen == true" />
      </keep-alive>

      <keep-alive>
        <ChoicesMappingComponent v-model="isChoiceMappingOpen" :integrationCode="integrationCode"
          :integrationCategoryId="integrationCategoryId" :integrationChoice="integrationChoice"
          :localCategoryId="selectedCategory?._id" style="transition: opacity .2s ease-in!important"
          :style="!isChoiceMappingOpen ? { 'opacity': '.2!important' } : {}" key="ChoicesMappingComponent"
          @close="isChoiceMappingOpen = false" v-if="isChoiceMappingOpen == true" />
      </keep-alive>
    </v-dialog>

    <div v-if="!selectedCategory?._id" class="d-flex align-center justify-center fill-height sync-info">
      <div class="mb-12 text-center" style="max-width: 600px;">
        <div><v-icon size="120" color="blue-grey-lighten-4">mdi-auto-fix</v-icon></div>

        <div class="text-h5 mt-6 blue-grey--text text--darken-3 font-weight-bold">
          {{ $t('productDefinitions.category.categoryWarning') }}
        </div>

        <div class="mt-10 pa-6 rounded-lg border-dashed" style="border: 2px dashed #cfd8dc">
          <p class="text-body-1 blue-grey--text text--darken-1 mb-6">
            Sisteminizdeki eşleşmemiş tüm <strong>uç (leaf)</strong> kategorileri, yapay zeka desteğiyle saniyeler
            içinde
            otomatik olarak eşleştirebilirsiniz.
          </p>

          <v-btn color="primary" size="x-large" class="px-12 font-weight-black elevation-2" prepend-icon="mdi-flash"
            :loading="isAutoMatching" rounded="lg" @click="startAutoMatch">
            OTOMATİK EŞLEŞTİRMEYİ BAŞLAT
          </v-btn>

          <div
            class="mt-4 text-caption blue-grey--text text--darken-1 d-flex align-center justify-center bg-blue-grey-lighten-5 pa-2 rounded">
            <v-icon size="16" color="blue-grey" class="mr-2">mdi-information-outline</v-icon>
            <span>
              Yapay zeka bazen benzer isimli kategorilerde hatalı eşleştirme yapabilir.
              <strong>İşlem sonrası eşleşmeleri kontrol etmeniz önerilir.</strong>
            </span>
          </div>

          <div class="mt-3 text-caption grey--text text--darken-1 d-flex align-center justify-center">
            <v-icon size="14" color="orange-darken-2" class="mr-1">mdi-alert-circle-outline</v-icon>
            Mevcut manuel eşleşmeleriniz korunur, sadece boş olanlar doldurulur.
          </div>
        </div>

        <div class="mt-8">
          <div class="d-flex align-center mb-4">
            <v-divider></v-divider>
            <span class="mx-4 text-caption font-weight-bold blue-grey--text text--lighten-2">VEYA</span>
            <v-divider></v-divider>
          </div>

          <p class="text-body-2 blue-grey--text text--darken-1">
            Soldaki kategori ağacından bir kategori seçip
            <v-icon size="small" class="mx-1" color="blue-grey-lighten-1">mdi-cog</v-icon>
            <strong>ayar</strong> butonuna tıklayarak manuel ilerleyebilirsiniz.
          </p>
        </div>
      </div>
    </div>


    <div v-else>
      <div class="d-flex">
        <div>
          <v-divider vertical class="mr-2 fill-height" thickness="3" color="#888" />
        </div>

        <div class="mt-0 pa-2 pt-1 flex-grow-1">
          <CardComponent icon="mdi-cog" :title="selectedCategory.title + ' Kategorisini Düzenle'">
            <v-form v-model="editingCategory.form" style="display:contents" @keydown.enter.prevent @submit.prevent>
              <div class="d-flex">
                <v-text-field @click.stop="1" v-ripple.stop variant="outlined" density="compact" maxlength="160"
                  width="200" clearable bg-color="textfieldColor" class="customTextField"
                  v-model="editingCategory.title" :rules="formRules.titleRules" @keyup.enter="updateCategory()">
                  <template v-slot:label>
                    <span class="font-weight-light">{{ $t('productDefinitions.category.title') }}</span>
                  </template>
                </v-text-field>

                <!--                 <v-btn-group class="fill-height ml-4" style="border:1px solid #bbb" density="compact">
                  <v-btn flat color="saveButtonColor" style="min-width:0;width:40px;height:40px;"
                    @click.stop="deleteConfirmation(selectedCategory, $event)">
                    <v-icon size="x-large">mdi-delete</v-icon>
                  </v-btn>
                </v-btn-group>
 -->
                <v-btn class="premium-delete-btn ml-4" variant="flat"
                  @click.stop="deleteConfirmation(selectedCategory, $event)">
                  <v-icon size="large" class="btn-icon">mdi-delete-outline</v-icon>
                </v-btn>

              </div>
              <!--               <v-btn flat :disabled="editingCategory.title == selectedCategory.title" class=" ml-0"
                style="height:40px;min-width:130px;" color="saveButtonColor" @click.stop="updateCategory()">{{
                  $t('common.save') }}</v-btn>
 -->
              <v-btn class="premium-save-btn ml-0" color="saveButtonColor" variant="flat"
                :disabled="editingCategory.title == selectedCategory.title" @click.stop="updateCategory()">
                <v-icon start size="small" class="mr-1">mdi-check-circle-outline</v-icon>
                {{ $t('common.save') }}
              </v-btn>

            </v-form>
          </CardComponent>

          <v-divider class="mt-8" />


          <CardComponent icon="mdi-connection" title="Platform Kategori Eşleştirme" class="mt-4"
            v-if="selectedCategory.children?.length == 0">


            <div class="d-flex align-center mt-2" style="gap: 12px;">
              <div
                v-for="clientPlatform of [...integrationStore.getClientMarketplaces(), ...integrationStore.getClientECommerces()]"
                :key="clientPlatform.code">


                <PlatformImageComponent :integrationCode="clientPlatform.code" height="50" width="100"
                  :is-active="integrationCode == clientPlatform.code" isSelectable
                  @select="integrationCode = clientPlatform.code; setPlatform()" />

                <!-- 
                <v-sheet @click="integrationCode = clientPlatform.code; setPlatform()"
                  class="platform-card pa-4 d-flex justify-center align-center"
                  :class="[integrationCode == clientPlatform.code ? 'active-platform' : 'inactive-platform']" :style="{
                    '--brand-color': clientPlatform.color,
                    '--brand-glow': clientPlatform.color + '40', // %25 opacity glow
                    width: '110px',
                    height: '70px',
                    borderRadius: '12px !important'
                  }">
                  <div class="logo-box">
                    <v-img :width="clientPlatform.width" contain
                      :src="integrationStore.getIntegrationImagePath(clientPlatform)" class="platform-logo"></v-img>
                  </div>
                </v-sheet> -->
              </div>
            </div>


            <div class="ma-2">
              <template v-if="integrationCode && integrationCode != -1">
                <div class="d-flex mt-6">
                  <CategoryIntegrationSelectBoxComponent class="flex-grow-1" v-model="integrationCategoryId"
                    :integrationCode="integrationCode" />
                </div>
                <!--                 <v-btn flat :disabled="!integrationCategoryId || isCategorySaved" class="mt-1"
                  style="height:40px;min-width:130px;" :color="isCategorySaved ? 'success' : 'saveButtonColor'"
                  @click.stop="saveIntegrationCategory">
                  {{ isCategorySaved ? 'Bağlantı Kuruldu' : $t('common.save') }}
                </v-btn>
 -->


                <v-btn variant="flat" class="premium-connection-btn mt-1" :class="{ 'is-connected': isCategorySaved }"
                  :disabled="!integrationCategoryId && !isCategorySaved"
                  :color="isCategorySaved ? 'transparent' : 'saveButtonColor'" style="height:40px; min-width:130px;"
                  :ripple="!isCategorySaved" @click.stop="isCategorySaved ? null : saveIntegrationCategory()">
                  <v-icon start size="small" class="mr-1" :color="isCategorySaved ? '#059669' : ''">
                    {{ isCategorySaved ? 'mdi-check-decagram' : 'mdi-content-save-outline' }}
                  </v-icon>

                  {{ isCategorySaved ? 'Bağlantı Kuruldu' : $t('common.save') }}
                </v-btn>


                <v-divider class="mt-8" />
                <template v-if="integrationChoices && integrationChoices.length > 0">
                  <div class="d-flex  mt-8">
                    <v-autocomplete class="customTextField" variant="outlined" density="compact"
                      bg-color="textfieldColor" return-object item-value="_id" item-title="title"
                      :items="integrationChoices" v-model="integrationChoice" :disabled="!isCategorySaved"
                      placeholder="Lütfen Seçiniz" persistent-placeholder no-data-text="Seçenek bulunamadı"
                      @update:model-value="retrieveIntegrationCategoryAttributeValues()">
                      <template v-slot:selection="{ item }: any">
                        <v-chip size="x-small"
                          :color="item.raw.slicer ? 'purple' : (item.raw.varianter ? 'red' : 'blue-grey-lighten-1')"
                          class="mr-2 font-weight-bold" variant="flat">
                          {{ item.raw.slicer ? 'ÜRÜN BÖLEN' : (item.raw.varianter ? 'VARYANT' : 'NİTELİK') }}
                        </v-chip>
                        <span class="text-subtitle-2">{{ item.title }}</span>
                      </template>

                      <template v-slot:item="{ item, index, props: itemProps }: any">
                        <v-list-item v-bind="itemProps" class="custom-list-item">
                          <template v-slot:title>
                            <div class="d-flex align-center">
                              <span class="index-column">
                                {{integrationChoices.findIndex((x: any) => x._id === item.raw._id) + 1}}
                              </span>

                              <v-chip size="x-small"
                                :color="item.raw.slicer ? 'purple' : (item.raw.varianter ? 'red' : 'blue-grey-lighten-2')"
                                class="mr-2 font-weight-black text-white"
                                style="min-width: 85px; justify-content: center;">
                                {{ item.raw.slicer ? 'ÜRÜN BÖLEN' : (item.raw.varianter ? 'VARYANT' : 'NİTELİK') }}
                              </v-chip>

                              <span
                                style="  font-weight: 500;color: rgb(var(--v-theme-passiveColor));font-size: 0.85rem;"
                                :class="{ 'font-weight-bold': item.raw.slicer || item.raw.varianter }">
                                {{ item.title }}
                              </span>
                            </div>
                          </template>

                          <template v-slot:append>
                            <v-icon v-if="item.raw.required" color="error" size="x-small">mdi-asterisk</v-icon>
                          </template>
                        </v-list-item>
                      </template>
                    </v-autocomplete>
                  </div>
                  <!--                   <v-btn flat :disabled="!integrationChoice || !isCategorySaved" class="mt-0" style="height:41px;"
                    color="processButtonColor" @click.stop="isChoiceMappingOpen = true">
                    Seçenek Eşleştir
                  </v-btn>
 -->
                  <v-btn class="premium-process-btn mt-0" color="processButtonColor" variant="flat"
                    :disabled="!integrationChoice || !isCategorySaved" @click.stop="isChoiceMappingOpen = true">
                    <v-icon start size="small" class="mr-1">mdi-link-variant</v-icon>
                    Seçenek Eşleştir
                  </v-btn>

                </template>
              </template>
            </div>
          </CardComponent>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, ref, onMounted, nextTick, reactive } from 'vue'
import CategoryIntegrationSelectBoxComponent from '@/components/CategoryIntegrationSelectBoxComponent.vue';
import LoadingComponent from '@/components/LoadingComponent.vue'
import ChoicesSyncComponent from '@/components/ChoicesSyncComponent.vue';
import ChoicesMappingComponent from '@/components/ChoicesMappingComponent.vue';
import CardComponent from '@/components/CardComponent.vue';

import useRestApi from '@/composables/restapi'
import useFormRules from '@/composables/formrules';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useSnackbarStore } from '@/stores/snackbarStore';
import PlatformImageComponent from './platforms/PlatformImageComponent.vue';

const snackbarStore = useSnackbarStore();
const categoriesStore = useCategoriesStore()
const formRules = useFormRules()
const restApi = useRestApi()
const integrationStore = useIntegrationStore()

const selectedCategoryModel: any = defineModel({ default: undefined })
const selectedCategory: any = ref({})
const show = ref(false)
const choiceSyncInfo: any = ref({ isChoiceSyncOpen: false })
const isChoiceMappingOpen = ref(false)
const integrationCode: any = ref(-1)
const integrationCategoryId: any = ref()
const editingCategory: any = ref({})
const loadingComponentRef: any = ref(null)
const integrationChoices: any = ref([])
const integrationChoice: any = ref()
const isCategorySaved = ref(false)

const confirmationDelete = reactive<any>({
  activator: undefined,
  isDialogOpen: false,
  category: undefined
})


const isAutoMatching = ref(false);

const startAutoMatch = async () => {
  let guid = loadingComponentRef.value.info("Kategoriler analiz ediliyor ve eşleştiriliyor...");
  isAutoMatching.value = true;

  try {
    const response = await restApi.post("AttributeMappingService/autoMatchAllCategories", {});
    if (response && response.result) {
      snackbarStore.addSnackbar({
        show: true,
        text: `${response.matchedCount} yeni kategori başarıyla eşleştirildi!`,
        color: "success"
      });
    }
  } catch (error) {
    console.error("AutoMatch Hatası:", error);
  } finally {
    isAutoMatching.value = false;
    loadingComponentRef.value.remove(guid);
  }
};


// Yerel Kategori değiştiğinde her şeyi resetle
watch(() => selectedCategoryModel.value, () => reset(), { deep: true })

// Platform veya kategori seçimi değiştiğinde her şeyi temizle
watch(() => integrationCategoryId.value, async (newVal, oldVal) => {
  // Platform veya kategori değiştiğinde eski seçimleri ve seçenekleri temizle
  integrationChoice.value = undefined
  integrationChoices.value = []
  isCategorySaved.value = false

  if (newVal) {
    // DOM'un render olması ve alt componentlerin (select box vb) hazırlanması için bekle
    await nextTick()
    await checkCategoryMappingStatus()
  }
})

const reset = async () => {
  if (selectedCategoryModel.value) {
    selectedCategory.value = JSON.parse(JSON.stringify(selectedCategoryModel.value))
    editingCategory.value = { ...selectedCategory.value }

    integrationCode.value = -1
    integrationCategoryId.value = undefined
    integrationChoices.value = []
    integrationChoice.value = undefined
    isCategorySaved.value = false
  }
}

/**
 * Platform logosuna tıklandığında (veya resetlendiğinde) 
 * o platform için kayıtlı kategori var mı diye bakar.
 */
const setPlatform = async () => {
  // Yeni platforma geçerken her şeyi anında sıfırla
  integrationCategoryId.value = undefined
  isCategorySaved.value = false
  integrationChoices.value = []
  integrationChoice.value = undefined

  if (!selectedCategory.value?._id || integrationCode.value === -1) {
    return
  }

  let guid = loadingComponentRef.value.info("Platform eşleşmesi kontrol ediliyor...")
  try {
    const response = await restApi.post("AttributeMappingService/getCategoryMapping", {
      localCategoryId: selectedCategory.value._id,
      integrationCode: integrationCode.value
    })

    if (response && response.platformCategoryId) {
      // Eşleşme bulundu, kategoriyi set et (bu işlem watch'u tetikleyecek)
      integrationCategoryId.value = response.platformCategoryId
    } else {
      // Eşleşme yok, sadece kategorilerin yüklenmesini bekle (select box kendi işini yapacak)
      isCategorySaved.value = false
    }
  } finally {
    loadingComponentRef.value.remove(guid)
  }
}

/**
 * Select box içinden her seçim yapıldığında (vazgeçip eskisini seçsen bile)
 * veritabanındaki kayıtlı durumla karşılaştırma yapar.
 */
const checkCategoryMappingStatus = async () => {
  if (!selectedCategory.value?._id || integrationCode.value === -1 || !integrationCategoryId.value) return

  // Veritabanındaki gerçek kaydı sor
  const response = await restApi.post("AttributeMappingService/getCategoryMapping", {
    localCategoryId: selectedCategory.value._id,
    integrationCode: integrationCode.value
  })

  // Eğer select box'taki ID ile veritabanındaki ID aynıysa, butonu yeşil yap ve seçenekleri getir
  if (response && response.platformCategoryId === integrationCategoryId.value) {
    isCategorySaved.value = true
    await retrieveIntegrationCategoryChoices()
  } else {
    // Farklı bir kategori seçilmişse veya henüz kaydedilmemişse seçenekleri gösterme
    isCategorySaved.value = false
    integrationChoices.value = []
  }
}

const saveIntegrationCategory = async () => {
  if (!selectedCategory.value?._id || integrationCode.value === -1 || !integrationCategoryId.value) {
    snackbarStore.addSnackbar({ show: true, text: 'Lütfen kategori seçimi yapın', color: 'warning' });
    return;
  }
  let guid = loadingComponentRef.value.info("Kaydediliyor...");
  try {
    const response = await restApi.post("AttributeMappingService/saveCategoryMapping", {
      localCategoryId: selectedCategory.value._id,
      integrationCode: integrationCode.value,
      platformCategoryId: integrationCategoryId.value
    });
    if (response && response.result) {
      isCategorySaved.value = true;
      snackbarStore.addSnackbar({ show: true, text: 'Kategori eşleşmesi kaydedildi.', timeout: 3000, color: 'success' });
      await retrieveIntegrationCategoryChoices();
    }
  } finally {
    loadingComponentRef.value.remove(guid);
  }
};

const retrieveIntegrationCategoryChoices = async () => {
  if (!integrationCategoryId.value) return
  let guid = loadingComponentRef.value.info("")
  const resp = await integrationStore.retrieveIntegrationCategoryChoices(integrationCode.value, integrationCategoryId.value)
  loadingComponentRef.value.remove(guid)

  if (resp && resp.length > 0) {
    integrationChoices.value = resp.sort((a: any, b: any) => {
      const scoreA = (a.slicer ? 2 : (a.varianter ? 1 : 0));
      const scoreB = (b.slicer ? 2 : (b.varianter ? 1 : 0));
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.title?.localeCompare(b.title);
    });
  }
}

const retrieveIntegrationCategoryAttributeValues = async () => {
  if (!integrationChoice.value || integrationChoice.value.allowCustom) return
  // Eğer zaten değerler varsa ve boş değilse tekrar çekme (Örn: N11 CDN hepsini bir kerede getiriyor)
  if (integrationChoice.value.values && integrationChoice.value.values.length > 0) return

  const resp = await integrationStore.retrieveIntegrationCategoryAttributeValues(
    integrationCode.value, integrationCategoryId.value, integrationChoice.value._id
  )
  if (resp) integrationChoice.value.values = resp
}

const updateCategory = async () => {
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("CategoryService/updateCategory", {
    categoryId: editingCategory.value._id,
    title: editingCategory.value.title
  })
  if (response && response.result) {
    categoriesStore.getCategories(true)
    selectedCategory.value.title = editingCategory.value.title
  }
  loadingComponentRef.value.remove(guid)
}

const deleteCategory = async () => {
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("CategoryService/deleteCategory", { _id: selectedCategory.value._id })
  if (response && response.acknowledged) {
    await restApi.post("AttributeMappingService/deleteFullMapping", {
      localCategoryId: selectedCategory.value._id,
      integrationCode: integrationCode.value
    })
    categoriesStore.getCategories(true)
    cancelDeleteCategory()
    selectedCategoryModel.value = undefined
  }
  loadingComponentRef.value.remove(guid)
}

const deleteConfirmation = (category: any, event: any) => {
  confirmationDelete.activator = event.currentTarget
  confirmationDelete.isDialogOpen = true
  confirmationDelete.category = category
}

const cancelDeleteCategory = () => {
  confirmationDelete.isDialogOpen = false
  confirmationDelete.category = undefined
}

onMounted(() => {
  show.value = true
  reset()
})
</script>

<style scoped>
.sync-info {
  opacity: .6;
}

.customTextField {
  margin-bottom: 8px;
}

.index-column {
  min-width: 30px;
  font-weight: 200;
  opacity: 0.5;
  font-size: 0.8rem;
}

.custom-list-item {
  border-bottom: 1px solid #eeeeee !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

.custom-list-item:last-child {
  border-bottom: none !important;
}



.platform-card {
  position: relative;
  border: 1px solid rgba(0, 0, 0, 0.05);
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
}


/* Seçili olan kart için "Glow" ve belirginleşme efekti */
.active-platform {
  z-index: 2;
  border-color: var(--brand-color);
  background: rgb(from var(--brand-color) r g b / 0.08);
  /* Modern alpha kullanımı */
  transform: translateY(-6px);

}

.active-platform::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 30%;
  height: 3px;
  background: var(--brand-color);
  border-radius: 10px 10px 0 0;
}

.inactive-platform {
  border: 1px solid #aaa !important;
  cursor: pointer;
}




.logo-box {
  width: 80px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  filter: grayscale(0.8);
  /* Aktif değilken gri tonlama */
  opacity: 0.9;
  transition: all 0.3s ease;
}

.platform-logo {
  opacity: 0.9;
}

.active-platform .logo-box {
  opacity: 1;
  filter: grayscale(0);
}
</style>