<!--
  frontend/src/components/CategorySyncComponent.vue

  Kategori tanımları sağ paneli: seçili kategoriyi düzenleme + pazaryeri kategori
  eşleştirme + seçenek eşleştirme/eşitleme panelleri. DS-v2 Aşama 2: kartlar
  (CardComponent/EkCard dili), alanlar `EkFormGrid`, platform seçimi
  `PlatformChoiceChip`, silme onayı tehlikeli `EkConfirmDialog` (eski kırmızı açılır
  kart kaldırıldı), seçenek panelleri `EkDialogHost` (görünmez sürekli açık
  v-dialog kaldırıldı). Tüm istek gövdeleri ve akışlar DEĞİŞMEDİ.
-->
<template>
  <div class="categorySyncComponent ek-category-sync">

    <EkConfirmDialog :model-value="confirmationDelete.isDialogOpen"
      :title="`'${confirmationDelete.category?.title ?? selectedCategory?.title ?? ''}' kategorisi silinsin mi?`"
      description="Kategori ve platform eşleştirmeleri kalıcı olarak silinir. Bu işlem geri alınamaz."
      :confirm-label="$t('common.delete')" :cancel-label="$t('common.cancel')" confirm-icon="mdi-trash-can-outline"
      icon="mdi-trash-can-outline" danger attach=".categoryListView"
      @update:model-value="(v: boolean) => { if (!v) cancelDeleteCategory() }" @confirm="deleteCategory()" />

    <LoadingComponent attach=".categoryListView" ref="loadingComponentRef"></LoadingComponent>

    <EkDialogHost :model-value="choiceSyncInfo.isChoiceSyncOpen || isChoiceMappingOpen"
      attach=".categoryListView" width="xl"
      @update:model-value="(v) => { if (!v) { choiceSyncInfo.isChoiceSyncOpen = false; isChoiceMappingOpen = false } }">
      <keep-alive>
        <ChoicesSyncComponent v-model="choiceSyncInfo" key="ChoicesSyncComponent"
          @close="choiceSyncInfo.isChoiceSyncOpen = false" v-if="choiceSyncInfo.isChoiceSyncOpen == true" />
      </keep-alive>
      <keep-alive>
        <ChoicesMappingComponent v-model="isChoiceMappingOpen" :integrationCode="integrationCode"
          :integrationCategoryId="integrationCategoryId" :integrationChoice="integrationChoice"
          :localCategoryId="selectedCategory?._id" key="ChoicesMappingComponent"
          :valuesError="valuesLoad.error.value" :valuesLoading="valuesLoad.loading.value" @retryValues="retryValues"
          @close="isChoiceMappingOpen = false" v-if="isChoiceMappingOpen == true" />
      </keep-alive>
    </EkDialogHost>

    <!-- Seçim yokken: otomatik eşleştirme + yönlendirme -->
    <section v-if="!selectedCategory?._id" class="ek-category-sync__empty" aria-labelledby="ek-category-sync-empty-title">
      <EkIconTile icon="mdi-auto-fix" tone="action" size="lg" />
      <h2 id="ek-category-sync-empty-title" class="ek-category-sync__empty-title">
        {{ $t('productDefinitions.category.categoryWarning') }}
      </h2>

      <div class="ek-category-sync__auto">
        <p class="ek-category-sync__lead">
          Sisteminizdeki eşleşmemiş tüm <strong>uç (leaf)</strong> kategorileri, yapay zeka desteğiyle saniyeler
          içinde otomatik olarak eşleştirebilirsiniz.
        </p>
        <EkButton tone="primary" icon="mdi-flash" :loading="isAutoMatching" @click="startAutoMatch">
          Otomatik eşleştirmeyi başlat
        </EkButton>
        <p class="ek-category-sync__note ek-category-sync__note--info">
          <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
          <span>Yapay zeka benzer isimli kategorilerde hatalı eşleştirme yapabilir.
            <strong>İşlem sonrası eşleşmeleri kontrol etmeniz önerilir.</strong></span>
        </p>
        <p class="ek-category-sync__note ek-category-sync__note--warning">
          <v-icon icon="mdi-alert-circle-outline" size="16" aria-hidden="true" />
          <span>Mevcut manuel eşleşmeleriniz korunur, yalnızca boş olanlar doldurulur.</span>
        </p>
      </div>

      <div class="ek-category-sync__or" aria-hidden="true"><span>veya</span></div>
      <p class="ek-category-sync__manual">
        Soldaki kategori ağacından bir kategori seçip
        <v-icon icon="mdi-cog" size="16" aria-hidden="true" /> <strong>ayar</strong> düğmesiyle manuel ilerleyebilirsiniz.
      </p>
    </section>

    <div v-else class="ek-category-sync__panels">
      <CardComponent icon="mdi-cog" :title="selectedCategory.title + ' Kategorisini Düzenle'" :isHovered="false">
        <v-form v-model="editingCategory.form" @keydown.enter.prevent @submit.prevent>
          <EkFormGrid :columns="1">
            <v-text-field @click.stop maxlength="160" clearable counter v-model="editingCategory.title"
              :rules="formRules.titleRules" :label="$t('productDefinitions.category.title')"
              @keyup.enter="updateCategory()" />
          </EkFormGrid>
          <div class="ek-category-sync__row-actions">
            <EkButton tone="ghost" icon="mdi-trash-can-outline" class="ek-category-sync__delete"
              @click.stop="deleteConfirmation(selectedCategory, $event)">
              {{ $t('common.delete') }}
            </EkButton>
            <EkButton tone="primary" icon="mdi-content-save-outline"
              :disabled="editingCategory.title == selectedCategory.title" @click.stop="updateCategory()">
              {{ $t('common.save') }}
            </EkButton>
          </div>
        </v-form>
      </CardComponent>

      <CardComponent icon="mdi-connection" title="Platform Kategori Eşleştirme" :isHovered="false"
        v-if="selectedCategory.children?.length == 0">
        <EkFormSection title="Platform" icon="mdi-storefront-outline" :columns="1"
          description="Eşleştirme yapılacak pazaryeri veya e-ticaret platformunu seçin.">
          <div class="ek-category-sync__platforms">
            <PlatformChoiceChip
              v-for="clientPlatform of [...integrationStore.getClientMarketplaces(), ...integrationStore.getClientECommerces()]"
              :key="clientPlatform.code" :code="clientPlatform.code" :name="platformName(clientPlatform.code)"
              :active="integrationCode == clientPlatform.code"
              @select="integrationCode = clientPlatform.code; setPlatform()" />
          </div>
        </EkFormSection>

        <template v-if="integrationCode && integrationCode != -1">
          <EkFormSection title="Platform kategorisi" icon="mdi-file-tree-outline" :columns="1">
            <CategoryIntegrationSelectBoxComponent v-model="integrationCategoryId" :integrationCode="integrationCode" />
            <div class="ek-category-sync__row-actions">
              <EkStatusChip v-if="isCategorySaved" tone="success" label="Bağlantı Kuruldu" />
              <EkButton v-else tone="primary" icon="mdi-content-save-outline" :disabled="!integrationCategoryId"
                @click.stop="saveIntegrationCategory()">
                {{ $t('common.save') }}
              </EkButton>
            </div>
          </EkFormSection>

          <EkFormSection v-if="isCategorySaved && (integrationChoices.length > 0 || choicesLoad.status.value !== 'idle')"
            title="Seçenek eşleştirme" icon="mdi-link-variant" :columns="1"
            description="Kategori bağlantısı kaydedildikten sonra platform seçeneklerini eşleştirebilirsiniz.">
            <IntegrationLoadingBlock v-if="choicesLoad.status.value === 'loading' && !choicesLoad.error.value"
              :label="`${platformName(integrationCode)} kategori özellikleri alınıyor…`" />
            <IntegrationErrorPanel v-else-if="choicesLoad.error.value" :info="choicesLoad.error.value"
              :retrying="choicesLoad.loading.value" @retry="retryChoices" />
            <template v-else>
            <v-autocomplete ref="choiceFieldRef" return-object item-value="_id" item-title="title" :items="integrationChoices"
              v-model="integrationChoice" :disabled="!isCategorySaved" label="Platform seçeneği"
              placeholder="Lütfen seçiniz" persistent-placeholder no-data-text="Seçenek bulunamadı"
              @update:model-value="retrieveIntegrationCategoryAttributeValues()">
              <template v-slot:selection="{ item }: any">
                <EkBadge :tone="choiceKind(item.raw).tone" class="ek-category-sync__kind">{{ choiceKind(item.raw).label }}</EkBadge>
                <span>{{ item.title }}</span>
              </template>
              <template v-slot:item="{ item, props: itemProps }: any">
                <v-list-item v-bind="itemProps" :title="undefined">
                  <div class="ek-category-sync__choice">
                    <span class="ek-category-sync__choice-index ek-num">
                      {{ integrationChoices.findIndex((x: any) => x._id === item.raw._id) + 1 }}
                    </span>
                    <EkBadge :tone="choiceKind(item.raw).tone" class="ek-category-sync__kind">{{ choiceKind(item.raw).label }}</EkBadge>
                    <span :class="{ 'is-strong': item.raw.slicer || item.raw.varianter }">{{ item.title }}</span>
                    <v-icon v-if="item.raw.required" icon="mdi-asterisk" size="12" class="ek-category-sync__required"
                      aria-label="Zorunlu" />
                  </div>
                </v-list-item>
              </template>
            </v-autocomplete>
            <IntegrationLoadingBlock v-if="valuesLoad.status.value === 'loading' && !valuesLoad.error.value"
              :label="`${integrationChoice?.title ?? 'Özellik'} değerleri alınıyor…`" />
            <IntegrationErrorPanel v-else-if="valuesLoad.error.value" :info="valuesLoad.error.value"
              :retrying="valuesLoad.loading.value" @retry="retryValues" />
            <div class="ek-category-sync__row-actions">
              <EkButton tone="secondary" icon="mdi-link-variant" :disabled="!integrationChoice || !isCategorySaved"
                @click.stop="isChoiceMappingOpen = true">
                Seçenek Eşleştir
              </EkButton>
            </div>
            </template>
          </EkFormSection>
        </template>
      </CardComponent>
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
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue'
import EkDialogHost from '@/components/ds/EkDialogHost.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkFormGrid from '@/components/ds/EkFormGrid.vue'
import EkFormSection from '@/components/ds/EkFormSection.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkBadge from '@/components/ds/EkBadge.vue'
import PlatformChoiceChip from '@/components/platforms/PlatformChoiceChip.vue'
import IntegrationErrorPanel from '@/components/integrations/IntegrationErrorPanel.vue'
import IntegrationLoadingBlock from '@/components/integrations/IntegrationLoadingBlock.vue'
import { useIntegrationLoad } from '@/composables/useIntegrationError'

import useRestApi from '@/composables/restapi'
import useFormRules from '@/composables/formrules';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useSnackbarStore } from '@/stores/snackbarStore';

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
const choiceFieldRef: any = ref(null)

// Pazaryeri özellik / değer listeleri: yükleniyor · hata · boş liste ayrı durumlar (bkz. useIntegrationError.ts).
const choicesLoad = useIntegrationLoad(() =>
  integrationStore.loadIntegrationCategoryChoices(integrationCode.value, integrationCategoryId.value))
const valuesLoad = useIntegrationLoad(() =>
  integrationStore.loadIntegrationCategoryAttributeValues(integrationCode.value, integrationCategoryId.value, integrationChoice.value._id))
const resetLoads = () => { choicesLoad.reset(); valuesLoad.reset() }

const confirmationDelete = reactive<any>({
  activator: undefined,
  isDialogOpen: false,
  category: undefined
})


const isAutoMatching = ref(false);

const platformName = (code: string) => integrationStore.getIntegrationTitle(code) || (code ? code.charAt(0).toUpperCase() + code.slice(1) : '')

// Platform seçeneğinin türü: ürün bölen (slicer) · varyant · nitelik — renk değil anlamlı ton + metin.
const choiceKind = (choice: any): { label: string; tone: 'info' | 'warning' | 'neutral' } =>
  choice?.slicer ? { label: 'Ürün bölen', tone: 'info' } : choice?.varianter ? { label: 'Varyant', tone: 'warning' } : { label: 'Nitelik', tone: 'neutral' }

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
  resetLoads()

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
    resetLoads()
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
  resetLoads()

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
  const result = await choicesLoad.run()
  if (result.ok) {
    integrationChoices.value = [...result.data].sort((a: any, b: any) => {
      const scoreA = (a.slicer ? 2 : (a.varianter ? 1 : 0));
      const scoreB = (b.slicer ? 2 : (b.varianter ? 1 : 0));
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.title?.localeCompare(b.title);
    });
  } else {
    integrationChoices.value = []
  }
}

// Hata panelinden "Tekrar dene": başarılıysa odak yeni görünen alana taşınır.
const retryChoices = async () => {
  await retrieveIntegrationCategoryChoices()
  if (!choicesLoad.error.value) { await nextTick(); choiceFieldRef.value?.focus?.() }
}

const fetchIntegrationCategoryAttributeValues = async () => {
  const target = integrationChoice.value
  if (!target || target.allowCustom) return
  // Eğer zaten değerler varsa ve boş değilse tekrar çekme (Örn: N11 CDN hepsini bir kerede getiriyor)
  if (target.values && target.values.length > 0) return

  const result = await valuesLoad.run()
  // Kullanıcı bu arada başka bir seçenek seçtiyse eski yanıt yeni seçeneğe yazılmaz.
  if (result.ok && integrationChoice.value === target) target.values = result.data
}

// Seçenek değişti: önceki değer-yükleme durumunu (hata/boş) temizleyip yeniden yükle.
const retrieveIntegrationCategoryAttributeValues = async () => {
  valuesLoad.reset()
  await fetchIntegrationCategoryAttributeValues()
}

// "Tekrar dene": mevcut hata paneli yerinde kalır (düğme yükleniyor), sıfırlanmaz.
const retryValues = () => fetchIntegrationCategoryAttributeValues()

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
.ek-category-sync {
  padding: var(--ek-space-1) var(--ek-space-6) var(--ek-space-6) var(--ek-space-2);
}

.ek-category-sync__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-4);
  max-width: 560px;
  margin: var(--ek-space-10) auto 0;
  text-align: center;
}

.ek-category-sync__empty-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
}

.ek-category-sync__auto {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.ek-category-sync__lead {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-category-sync__note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  width: 100%;
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid;
  border-radius: var(--ek-radius-control);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-align: left;
}

.ek-category-sync__note--info {
  border-color: var(--ek-color-info-border);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
}

.ek-category-sync__note--warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.ek-category-sync__or {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-category-sync__or::before,
.ek-category-sync__or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ek-color-border-subtle);
}

.ek-category-sync__manual {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

.ek-category-sync__panels {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-category-sync__row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-3);
}

.ek-category-sync__delete {
  margin-right: auto;
  color: var(--ek-color-error);
}

.ek-category-sync__platforms {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--ek-space-3);
}

.ek-category-sync__choice {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-category-sync__choice-index {
  min-width: var(--ek-space-6);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-category-sync__choice .is-strong {
  font-weight: var(--ek-font-weight-semibold);
}

.ek-category-sync__kind {
  margin-right: var(--ek-space-2);
}

.ek-category-sync__required {
  color: var(--ek-color-error);
}
</style>
