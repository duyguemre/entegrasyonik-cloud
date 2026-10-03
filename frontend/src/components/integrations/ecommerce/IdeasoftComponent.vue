<!--
  ADR-0015 Aşama B2 — Ideasoft (canlı, `docs/INTEGRATIONS_REGISTRY.md` §3.1).
  ARAŞTIRMA BULGUSU (BACKLOG'a taşındı): önceki sürümde `isAuthDialog` HİÇBİR
  YERDEN `true` yapılmıyordu (gerçek OAuth akışı `startAuthFlow()`'un açtığı
  native popup penceresidir, `window.open`) — bu yüzden template'teki
  eski diyalog + `IdeasoftAuthComponent` bloğu asla render OLMUYORDU. Ayrıca
  `IdeasoftAuthComponent.vue` içeriği Ideasoft'la alakasız (ürün görseli
  sürükle-bırak) kopyala-yapıştır kalıntısıydı, global (scoped OLMAYAN)
  `.dropZone` CSS'i sızdırıyordu. Ölü + alakasız kod silindi (davranış
  DEĞİŞMEDİ — zaten hiç render olmuyordu); `IdeasoftAuthComponent.vue` de
  bu nedenle kaldırıldı (grep: sıfır kalan referans).
-->
<template>
  <div class="ideasoftComponent" v-if="editingClientIntegration">
    <LoadingComponent attach=".ecommerceView" ref="loadingComponentRef"></LoadingComponent>

    <v-row class="pa-0 ma-0">
      <v-col cols="12" class="pa-0">
        <IntegrationFormFrame v-model="activeTab" :tabs="[
          { value: 1, label: 'Api Bilgileri' },
          { value: 2, label: 'Varsayılan Bilgiler' },
        ]" @save="emits('update', editingClientIntegration)" @clear="emits('refresh', editingClientIntegration.code)">
          <!-- API Information Tab -->
          <v-window-item :value="1">
            <v-text-field class="customTextField" clearable density="compact"
              v-model="editingClientIntegration.settings.storeName" label="Mağaza Adı" variant="outlined"
              bg-color="textfieldColor"></v-text-field>

            <v-text-field class="customTextField" clearable density="compact" label="Client ID"
              v-model="editingClientIntegration.settings.key" variant="outlined"
              bg-color="textfieldColor"></v-text-field>

            <v-text-field class="customTextField" clearable density="compact" label="Client Secret"
              v-model="editingClientIntegration.settings.secret" variant="outlined"
              bg-color="textfieldColor"></v-text-field>

            <div class="d-flex align-center flex-wrap mt-4 pa-4 ga-3 ek-ideasoft-status-row">
              <div class="d-flex align-center ga-2">
                <span class="text-subtitle-2 font-weight-bold opacity-70">Entegrasyon Durumu:</span>
                <EkStatusChip v-if="editingClientIntegration.settings?.auth?.refresh_token == 'sensitive'"
                  tone="success" label="YETKİLİ" />
                <EkStatusChip v-else tone="danger" label="YETKİSİZ" />
              </div>
              <v-spacer class="d-none d-sm-block"></v-spacer>
              <v-btn color="primary" size="small" variant="flat" prepend-icon="mdi-shield-check-outline"
                @click="startAuthFlow()">
                Entegrasyona Yetki Ver
              </v-btn>
            </div>

            <div class="mt-6">
              <v-btn block variant="outlined" class="rounded-lg border-opacity-25" prepend-icon="mdi-download-outline"
                @click="retrieveCategories()">
                Ürün ve Kategorileri Getir
              </v-btn>
              <div class="text-caption mt-2 opacity-60 text-center">
                Bağlantı başarılı olduktan sonra verilerinizi senkronize etmek için kullanın.
              </div>
            </div>
          </v-window-item>

          <!-- Default Values Tab -->
          <v-window-item :value="2">
            <v-container class="pa-0">
              <v-row dense>
                <v-col cols="12">
                  <div class="text-subtitle-2 mb-2 ml-1 font-weight-bold opacity-70">
                    <v-icon size="small" class="mr-1">mdi-tag-outline</v-icon> Satış ve KDV Ayarları
                  </div>
                  <v-divider class="mb-4" />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-select class="customTextField" density="compact" :items="taxList" item-value="_id"
                    v-model.number="editingClientIntegration.settings.taxPercentage" variant="outlined"
                    bg-color="textfieldColor" label="KDV Oranı" clearable />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-text-field class="customTextField" clearable density="compact" label="Varsayılan Desi"
                    v-model="editingClientIntegration.settings.desi" variant="outlined" bg-color="textfieldColor" />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-text-field class="customTextField" clearable density="compact" label="Varsayılan Garanti"
                    v-model="editingClientIntegration.settings.warranty" variant="outlined"
                    bg-color="textfieldColor" />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-select class="customTextField" clearable density="compact" label="Ürünün Stok Tipi"
                    v-model="editingClientIntegration.settings.stockTypeLabel" variant="outlined"
                    :items="staticsStore.ideasoft.stockTypeLabelOptions" bg-color="textfieldColor" />
                </v-col>

                <v-col cols="12" sm="6">
                  <v-select class="customTextField" clearable density="compact" label="Hediye Durumu"
                    v-model="editingClientIntegration.settings.hasGift" variant="outlined" :items="[
                      { title: 'Hediyesiz', value: 0 },
                      { title: 'Hediyeli', value: 1 }
                    ]" bg-color="textfieldColor" />
                </v-col>

                <v-col cols="12" sm="6">
                  <VCurrencyComponentVue @click.stop v-model="editingClientIntegration.settings.customShippingCost"
                    :compact="true" label="Varsayılan Kargo Ücreti" clearable :isIconExist="false" :required="false"
                    bg-color="textfieldColor" />
                </v-col>
              </v-row>
            </v-container>
          </v-window-item>
        </IntegrationFormFrame>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, onBeforeUnmount, onMounted } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import LoadingComponent from '@/components/LoadingComponent.vue'
import IntegrationFormFrame from '@/components/integrations/IntegrationFormFrame.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import useRestApi from '@/composables/restapi'
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue'
import { useStaticsStore } from '@/stores/staticsStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { isTrustedPopupMessage } from '@/utils/oauthPopup'

const snackbarStore = useSnackbarStore()
const activeTab = ref(1)
const emits = defineEmits(['update', 'refresh', 'retrieveProducts'])
const props = defineProps<{ editingClientIntegration: any }>()

const taxList = Array.from({ length: 29 }, (_, i) => ({ _id: i + 1, value: i + 1, title: i + 1 }))
const staticsStore = useStaticsStore()
const integrationStore = useIntegrationStore()
const restApi = useRestApi()
const loadingComponentRef: any = ref(null)
const integration: any = ref()
const integrationCode = "ideasoft"
const authUrl = ref('')
const state: any = ref()
// G-06: mesajın bizim açtığımız popup'tan geldiğini doğrulamak için referansı tutuyoruz.
let authPopup: Window | null = null

const startAuthFlow = async () => {
  setAuthUrl()
  const width = 1000
  const height = 700
  const title = 'Ideasoft Entegrasyonu Yetkilendirme'
  const dualScreenLeft = window.screenLeft ?? window.screenX
  const dualScreenTop = window.screenTop ?? window.screenY

  const screenWidth = window.innerWidth || document.documentElement.clientWidth || screen.width
  const screenHeight = window.innerHeight || document.documentElement.clientHeight || screen.height

  const left = screenWidth / 2 - width / 2 + dualScreenLeft
  const top = screenHeight / 2 - height / 2 + dualScreenTop
  authPopup = window.open(
    authUrl.value,
    title,
    `scrollbars=yes, width=${width}, height=${height}, top=${top}, left=${left}`
  )

  if (authPopup && authPopup.focus) authPopup.focus()
  // Önceki (kapatılmış popup'tan kalan) dinleyici birikmesin.
  window.removeEventListener('message', onMessageFromPopup)
  window.addEventListener('message', onMessageFromPopup);
}

const onMessageFromPopup = (event: any) => {
  // G-06: yalnızca uygulamanın kendi origin'inden ve kendi popup'ından gelen mesaj işlenir (yabancı mesajlar yok sayılır, dinleyici düşmez).
  if (!isTrustedPopupMessage(event, { origin: window.location.origin, popup: authPopup })) return
  if (event.data?.type === 'redirectParams') {
    const data = event.data.data
    if (data.state === state.value) {
      retrieveAndSetExternalToken(data.code)
    }
    window.removeEventListener('message', onMessageFromPopup);
  }
}

const retrieveCategories = async () => {
  let guid = loadingComponentRef.value.info('Veriler getiriliyor...')
  try {
    let response = await restApi.post("ECommerceService/retrieveProductsFromIntegration", { integrationCode: props.editingClientIntegration.code })
    loadingComponentRef.value.remove(guid)
    if (response) {
      snackbarStore.addSnackbar({ show: true, text: 'Veriler başarıyla güncellendi.', color: 'success' })
    }
  } catch (error) {
    loadingComponentRef.value.remove(guid)
  }
}

const retrieveAndSetExternalToken = async (code: any) => {
  let guid = loadingComponentRef.value.info('Yetkilendirme tamamlanıyor...')
  let response = await restApi.post("IntegrationService/retrieveAndSetExternalToken", {
    integrationCode: props.editingClientIntegration.code,
    data: { code: code, redirectUrl: buildRedirectUrl() }
  })
  loadingComponentRef.value.remove(guid)
  if (response?.result == true) {
    emits('refresh', props.editingClientIntegration.code)
    snackbarStore.addSnackbar({ show: true, text: 'Yetkilendirme başarıyla tamamlandı.', color: 'success' })
  }
  return response
}

const buildRedirectUrl = () => {
  const url = new URL(window.location.href)
  const hostWithPort = url.protocol + '//' + (url.port ? `${url.hostname}:${url.port}` : url.hostname)
  return hostWithPort + '/' + integration.value.urls.redirectUrl
}

const setAuthUrl = () => {
  state.value = uuidv4()
  authUrl.value = integration.value.urls.baseUrl.replace('<STORENAME>', props.editingClientIntegration.settings.storeName)
  authUrl.value += '/' + integration.value.urls.authorizationUrl
  authUrl.value += '?client_id=' + props.editingClientIntegration.settings.key
  authUrl.value += '&response_type=code'
  authUrl.value += '&state=' + state.value
  authUrl.value += '&redirect_uri=' + buildRedirectUrl()
}

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessageFromPopup)
})

onBeforeMount(() => {
  integration.value = integrationStore.getIntegration(integrationCode)
  props.editingClientIntegration.settings = props.editingClientIntegration.settings || {}
  props.editingClientIntegration.settings.stockTypeLabel = props.editingClientIntegration.settings.stockTypeLabel || 'Piece'
  props.editingClientIntegration.settings.hasGift = props.editingClientIntegration.settings.hasGift || 0
})
</script>

<script lang="ts">
export default {
  name: 'IdeasoftComponent'
}
</script>

<style scoped>
.ek-ideasoft-status-row {
  gap: var(--ek-space-2);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.opacity-70 {
  opacity: 0.7;
}

.opacity-60 {
  opacity: 0.6;
}
</style>
