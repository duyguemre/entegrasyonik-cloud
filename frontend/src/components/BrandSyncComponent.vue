<template>
  <div class="brandListComponentView pa-4 pt-0 pb-0">

    <LoadingComponent attach=".brandDefinition" ref="loadingComponentRef"></LoadingComponent>

    <ConfirmationDialogComponent v-model="isConfirmationDialogOpen" :title="selectedBrand?.title"
      :subtitle="$t('productDefinitions.brand.deleteConfirmation')" color="danger" icon="mdi-delete-outline"
      confirm-text="SİL" @confirm="deleteBrand()" />

    <div v-if="!selectedBrand" class="d-flex align-center justify-center fill-height sync-info">
      <div class="mb-12 text-center">
        <div><v-icon size="300">mdi-cog-outline</v-icon></div>
        <div class="text-h6 mt-8">{{ $t('productDefinitions.brand.brandWarning') }}</div>
      </div>
    </div>
    <div v-else>

      <div class="d-flex">
        <div>
          <v-divider vertical class="mr-2 fill-height" thickness="3" color="#888" />
        </div>


        <div class="mt-0 pa-2 pt-0 pt-0 mt-1 flex-grow-1">

          <CardComponent icon="mdi-cog" title="Platform Kategori Eşleştirme" class="">
            <v-form v-model="editingBrand.form" style="display:contents" @keydown.enter.prevent @submit.prevent>
              <div class="d-flex">
                <v-text-field @click.stop="1" v-ripple.stop variant="outlined" density="compact" type="tel"
                  maxlength="160" width="200" clearable bg-color="textfieldColor" class="customTextField"
                  :hint="$t('productDefinitions.brand.updateBrandDesc')" v-model="newBrandTitle"
                  :rules="formRules.titleRules" @keyup.enter="updateBrand()">
                  <template v-slot:label>
                    <span class="font-weight-light">{{ $t('productDefinitions.brand.title')
                      }}</span>
                  </template>
                </v-text-field>

                <v-btn class="premium-delete-btn ml-4" variant="flat" @click.stop="isConfirmationDialogOpen = true">
                  <v-icon size="large" class="btn-icon">mdi-delete-outline</v-icon>
                </v-btn>
              </div>

              <v-btn class="premium-save-btn ml-0" color="saveButtonColor" variant="flat"
                :disabled="newBrandTitle == selectedBrand.title" @click.stop="updateBrand()">
                <v-icon start size="small" class="mr-1">mdi-check-circle-outline</v-icon>
                {{ $t('common.save') }}
              </v-btn>
            </v-form>
          </CardComponent>
          <CardComponent icon="mdi-connection" title="Platform Marka Eşleştirme" class="mt-12">
            <v-form v-model="editingPlatformForm" style="display:contents" @keydown.enter.prevent @submit.prevent>

              <div class="d-flex align-center mt-2" style="gap: 12px;">
                <div
                  v-for="clientPlatform of [...integrationStore.getClientMarketplaces(), ...integrationStore.getClientECommerces(), ...integrationStore.getClientErps()]"
                  :key="clientPlatform.code">

                  <PlatformImageComponent :integrationCode="clientPlatform.code" height="50" width="100"
                    :is-active="integrationCode == clientPlatform.code" isSelectable
                    @select="integrationCode = clientPlatform.code" />
                </div>
              </div>
              <div v-if="checkIfHasBrandMapping()" class="mt-8 d-flex flex-column" style="gap: 8px;">
                <BrandIntegrationSelectBoxComponent class="mr-0 flex-grow-1" v-model="integrationBrand"
                  :integrationCode="integrationCode" />

                <v-btn variant="flat" class="premium-connection-btn mt-1"
                  :class="{ 'is-connected': integrationBrand?.id && integrationBrand?.id == selectedBrand.platforms?.[integrationCode]?.id }"
                  :disabled="!integrationBrand?.id && !(integrationBrand?.id && integrationBrand?.id == selectedBrand.platforms?.[integrationCode]?.id)"
                  :color="integrationBrand?.id && integrationBrand?.id == selectedBrand.platforms?.[integrationCode]?.id ? 'transparent' : 'saveButtonColor'"
                  style="height:40px; min-width:130px;"
                  :ripple="!(integrationBrand?.id && integrationBrand?.id == selectedBrand.platforms?.[integrationCode]?.id)"
                  @click.stop="integrationBrand?.id && integrationBrand?.id == selectedBrand.platforms?.[integrationCode]?.id ? null : saveIntegrationBrand()">
                  <v-icon start size="small" class="mr-1"
                    :color="integrationBrand?.id && integrationBrand?.id == selectedBrand.platforms?.[integrationCode]?.id ? '#059669' : ''">
                    {{ integrationBrand?.id && integrationBrand?.id == selectedBrand.platforms?.[integrationCode]?.id ?
                      'mdi-check-decagram' : 'mdi-content-save-outline' }}
                  </v-icon>

                  {{ integrationBrand?.id && integrationBrand?.id == selectedBrand.platforms?.[integrationCode]?.id ?
                    'Bağlantı Kuruldu' : $t('common.save') }}
                </v-btn>
              </div>

              <template v-else>

                <div class="ma-6 mt-8 dialog-info1 fill-height align-center justify-center text-center"
                  style="max-width:600px" v-if="integrationCode != -1">
                  <div class="d-flex align-center text-center justify-center " style="font-size:.8em">
                    <v-icon class="mr-0" color="processButtonColor">mdi-lightbulb-outline</v-icon>
                    <span>
                      <span class="font-weight-bold">{{ integrationCode }}</span> platformu marka eşleştirme yeteneği
                      sunmamaktadır.
                    </span>
                  </div>
                </div>
              </template>
            </v-form>
          </CardComponent>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, inject, watch, ref, onMounted, onBeforeMount } from 'vue'
import BrandIntegrationSelectBoxComponent from '@/components/BrandIntegrationSelectBoxComponent.vue'
import PlatformImageComponent from './platforms/PlatformImageComponent.vue';
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
.sync-info {
  opacity: .3;
}

.selected-choice {
  filter: brightness(1.2);
}
</style>