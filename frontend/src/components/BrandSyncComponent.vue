<!--
  frontend/src/components/BrandSyncComponent.vue

  Marka tanımları sağ paneli: seçili markayı düzenleme + platform marka eşleştirme.
  DS-v2 Aşama 2: kartlar, `EkFormGrid` (yardım metni kalıcı — odak kaybında düğme
  kaymaz), `PlatformChoiceChip`, tehlikeli silme onayı (ConfirmationDialogComponent →
  EkDialog), bağlantı durumu `EkStatusChip`. İstek gövdeleri/akışlar DEĞİŞMEDİ.
-->
<template>
  <div class="brandListComponentView ek-brand-sync">

    <LoadingComponent attach=".brandDefinition" ref="loadingComponentRef"></LoadingComponent>

    <ConfirmationDialogComponent v-model="isConfirmationDialogOpen" :title="`'${selectedBrand?.title ?? ''}' markası silinsin mi?`"
      :subtitle="$t('productDefinitions.brand.deleteConfirmation')" color="error" icon="mdi-trash-can-outline"
      confirm-icon="mdi-trash-can-outline" attach=".brandDefinition" confirm-text="Sil" @confirm="deleteBrand()" />

    <section v-if="!selectedBrand" class="ek-brand-sync__empty" aria-labelledby="ek-brand-sync-empty-title">
      <EkIconTile icon="mdi-cog-outline" tone="neutral" size="lg" />
      <h2 id="ek-brand-sync-empty-title" class="ek-brand-sync__empty-title">{{ $t('productDefinitions.brand.brandWarning') }}</h2>
      <p class="ek-brand-sync__empty-text">
        Soldaki listeden bir markanın <v-icon icon="mdi-cog" size="16" aria-hidden="true" /> ayar düğmesine basarak
        marka adını düzenleyebilir ve platform markalarıyla eşleştirebilirsiniz.
      </p>
    </section>

    <div v-else class="ek-brand-sync__panels">
      <CardComponent icon="mdi-cog" :title="`${selectedBrand.title} Markasını Düzenle`" :isHovered="false">
        <v-form v-model="editingBrand.form" @keydown.enter.prevent @submit.prevent>
          <EkFormGrid :columns="1">
            <v-text-field @click.stop type="tel" maxlength="160" clearable
              :hint="$t('productDefinitions.brand.updateBrandDesc')" persistent-hint v-model="newBrandTitle"
              :rules="formRules.titleRules" :label="$t('productDefinitions.brand.title')" @keyup.enter="updateBrand()" />
          </EkFormGrid>
          <div class="ek-brand-sync__row-actions">
            <EkButton tone="ghost" icon="mdi-trash-can-outline" class="ek-brand-sync__delete"
              @click.stop="isConfirmationDialogOpen = true">
              {{ $t('common.delete') }}
            </EkButton>
            <EkButton tone="primary" icon="mdi-content-save-outline" :disabled="newBrandTitle == selectedBrand.title"
              @click.stop="updateBrand()">
              {{ $t('common.save') }}
            </EkButton>
          </div>
        </v-form>
      </CardComponent>

      <CardComponent icon="mdi-connection" title="Platform Marka Eşleştirme" :isHovered="false">
        <v-form v-model="editingPlatformForm" @keydown.enter.prevent @submit.prevent>
          <EkFormSection title="Platform" icon="mdi-storefront-outline" :columns="1"
            description="Marka eşleştirmesi yapılacak platformu seçin.">
            <div class="ek-brand-sync__platforms">
              <PlatformChoiceChip
                v-for="clientPlatform of [...integrationStore.getClientMarketplaces(), ...integrationStore.getClientECommerces(), ...integrationStore.getClientErps()]"
                :key="clientPlatform.code" :code="clientPlatform.code" :name="platformName(clientPlatform.code)"
                :active="integrationCode == clientPlatform.code" @select="integrationCode = clientPlatform.code" />
            </div>
          </EkFormSection>

          <EkFormSection v-if="checkIfHasBrandMapping()" title="Platform markası" icon="mdi-tag-outline" :columns="1">
            <BrandIntegrationSelectBoxComponent v-model="integrationBrand" :integrationCode="integrationCode" />
            <div class="ek-brand-sync__row-actions">
              <EkStatusChip v-if="isBrandConnected" tone="success" label="Bağlantı Kuruldu" />
              <EkButton v-else tone="primary" icon="mdi-content-save-outline" :disabled="!integrationBrand?.id"
                @click.stop="saveIntegrationBrand()">
                {{ $t('common.save') }}
              </EkButton>
            </div>
          </EkFormSection>

          <p v-else-if="integrationCode != -1" class="ek-brand-sync__note">
            <v-icon icon="mdi-lightbulb-outline" size="16" aria-hidden="true" />
            <span><strong>{{ platformName(integrationCode) }}</strong> platformu marka eşleştirme yeteneği sunmamaktadır.</span>
          </p>
        </v-form>
      </CardComponent>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, inject, watch, ref, onMounted, onBeforeMount } from 'vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkFormGrid from '@/components/ds/EkFormGrid.vue'
import EkFormSection from '@/components/ds/EkFormSection.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import PlatformChoiceChip from '@/components/platforms/PlatformChoiceChip.vue'
import BrandIntegrationSelectBoxComponent from '@/components/BrandIntegrationSelectBoxComponent.vue'
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import useRestApi from '@/composables/restapi'
import LoadingComponent from '@/components/LoadingComponent.vue'

import { useI18n } from 'vue-i18n';
import { useIntegrationStore } from '@/stores/integrationStore';
import useFormRules from '@/composables/formrules';
import { useBrandsStore } from '@/stores/brandsStore';
import CardComponent from './CardComponent.vue'
import { useSnackbarStore } from '@/stores/snackbarStore';
const snackbarStore = useSnackbarStore();

const brandsStore = useBrandsStore()

const formRules = useFormRules()
const restApi = useRestApi()

const { t } = useI18n()
const integrationStore = useIntegrationStore()
const editingBrand: any = ref({})
const integrationBrand: any = ref()

const editingPlatformForm: any = ref()
const editingPlatform: any = ref()
const selectedBrandModel: any = defineModel({ default: undefined })
const selectedBrand: any = ref()
const isConfirmationDialogOpen = ref(false)
const loadingComponentRef: any = ref(null)
const selectedIntegrationBrand: any = ref()
const integrationCode: any = ref(-1)
const newBrandTitle: any = ref()

const platformName = (code: string) => integrationStore.getIntegrationTitle(code) || (code ? code.charAt(0).toUpperCase() + code.slice(1) : '')
// Seçili platform markası, markanın kayıtlı eşleşmesiyle aynıysa bağlantı kurulmuş sayılır (eski düğme durumu).
const isBrandConnected = computed(() => !!(integrationBrand.value?.id && integrationBrand.value?.id == selectedBrand.value?.platforms?.[integrationCode.value]?.id))

const reset = async () => {
  integrationBrand.value = undefined
  if (selectedBrandModel.value) {
    selectedBrand.value = JSON.parse(JSON.stringify(brandsStore.getBrand(selectedBrandModel.value._id)))
    newBrandTitle.value = selectedBrand.value.title

    const svalue = selectedBrand.value.platforms?.[integrationCode.value]
    if (svalue?.id) {
      integrationBrand.value = JSON.parse(JSON.stringify(svalue))
    }

    editingBrand.value.platforms = selectedBrand.value.platforms || {}
    editingBrand.value.title = selectedBrand.value.title
    editingBrand.value._id = selectedBrand.value._id
    const clientMarketplaces = integrationStore.getClientMarketplaces()
    clientMarketplaces.forEach((clientMarketplace: any) => {
      editingBrand.value.platforms[clientMarketplace.code] = editingBrand.value.platforms[clientMarketplace.code] || {}
    })
  }
}


const checkIfHasBrandMapping = () => {
  if (!integrationCode.value || integrationCode.value == -1) return false
  const currentIntegration = integrationStore.getIntegration(integrationCode.value)
  if (currentIntegration?.hasBrandMapping == false) return false
  return true
}

watch(() => integrationCode.value, (newValue: any, oldValue: any) => {
  reset()
})


watch(() => selectedBrandModel.value, (newValue: any, oldValue: any) => {
  reset()
})

const updateBrand = async () => {
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("BrandService/updateBrand", { brandId: selectedBrand.value._id, title: newBrandTitle.value })
  if (response && response.result == true) {
    brandsStore.getBrands(true)

    snackbarStore.addSnackbar({
      show: true,
      text: 'Marka güncellendi',
      timeout: 2000,
      color: 'success'
    })


    selectedBrand.value.title = editingBrand.value.title
  }
  loadingComponentRef.value.remove(guid)
}

const saveIntegrationBrand = async () => {
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("BrandService/saveIntegrationBrand", { brandId: selectedBrand.value._id, integrationCode: integrationCode.value, integrationBrand: integrationBrand.value })
  if (response && response.result == true) {
    brandsStore.getBrands(true)
    snackbarStore.addSnackbar({
      show: true,
      text: 'Platform marka eşlemesi kaydedildi',
      timeout: 2000,
      color: 'success'
    })

  }
  loadingComponentRef.value.remove(guid)
}



const deleteBrand = async () => {
  if (!editingBrand.value)
    return
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("BrandService/deleteBrand", { _id: selectedBrand.value._id })
  if (response && response.acknowledged == true) {
    selectedBrand.value = undefined
    brandsStore.getBrands(true)
    isConfirmationDialogOpen.value = false
  }
  loadingComponentRef.value.remove(guid)
}

onMounted(() => {
  reset()
})

// R4/T-02 (docs/FRONTEND_CODE_AUDIT.md): `save()` şablondan HİÇ ÇAĞRILMIYOR (doğrulandı — gerçek
// kaydet düğmesi `saveIntegrationBrand()`'i çağırıyor, `IntegrationService/saveOrUpdateIntegrationBrand`
// uç noktası bu bileşende başka hiçbir yerde kullanılmıyor). `integrationStore.retrieveIntegrationBrandsMap()`
// store'da YOK (vue-tsc TS2551) — niyeti (bir "Map" önbelleğini yenilemek) doğrulanamadı ve karşılığı
// yok; ölü/erişilemeyen bu kod yolunda var olmayan bir metoda "uydurma" bir çağrı bağlanmadı (R4
// kuralı). Fonksiyonun kendisi R1/R2 (ölü kod) kapsamına girer — silinmedi, yalnızca kırık çağrı
// kaldırıldı; kayıt sonrası yenileme burada YAPILMAZ (önceki hâlde zaten hiç çalışmıyordu — TypeError
// fırlatıyordu; davranış "hiçbir şey olmaz" olarak aynı kalır, yalnızca artık sessiz).
const save = async () => {
  editingPlatform.value.integrationBrandId = selectedIntegrationBrand.value ? selectedIntegrationBrand.value.id : undefined
  editingPlatform.value.integrationBrandTitle = selectedIntegrationBrand.value ? selectedIntegrationBrand.value.title : undefined

  let guid = loadingComponentRef.value.info("")
  await restApi.post("IntegrationService/saveOrUpdateIntegrationBrand", { integrationBrand: editingPlatform.value })
  loadingComponentRef.value.remove(guid)
}

</script>

<style scoped>
.ek-brand-sync {
  padding: var(--ek-space-1) var(--ek-space-6) var(--ek-space-6) var(--ek-space-2);
}

.ek-brand-sync__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  max-width: 480px;
  margin: var(--ek-space-12) auto 0;
  text-align: center;
}

.ek-brand-sync__empty-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.ek-brand-sync__empty-text {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-brand-sync__panels {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-brand-sync__row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-3);
}

.ek-brand-sync__delete {
  margin-right: auto;
  color: var(--ek-color-error);
}

.ek-brand-sync__platforms {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--ek-space-3);
}

.ek-brand-sync__note {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: var(--ek-space-4) 0 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-caption-size);
}
</style>
