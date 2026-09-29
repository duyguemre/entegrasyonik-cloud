<template>
  <div class="ideasoftComponent" v-if="editingClientIntegration">
    <LoadingComponent attach=".ecommerceView" ref="loadingComponentRef"></LoadingComponent>

    <IntegrationFormFrame v-model="activeTab" :tabs="[
        { value: 1, label: 'Api Bilgileri' },
        { value: 2, label: 'Varsayılan Bilgiler' },
      ]" @save="emits('update', editingClientIntegration)" @clear="emits('refresh', editingClientIntegration.code)">
      <v-window-item :value="1">
        <EkFormSection title="Bağlantı bilgileri" icon="mdi-key-outline"
          description="Ideasoft yönetim panelindeki uygulama (API) ayarlarından alınır.">
          <v-text-field class="ek-span-full" clearable v-model="editingClientIntegration.settings.storeName"
            label="Mağaza Adı" />
          <v-text-field clearable v-model="editingClientIntegration.settings.key" label="Client ID" />
          <v-text-field clearable v-model="editingClientIntegration.settings.secret" label="Client Secret" />
          <div class="ek-span-full ek-ideasoft-status-row">
            <span class="ek-ideasoft-status-row__label">Entegrasyon Durumu</span>
            <EkStatusChip v-if="editingClientIntegration.settings?.auth?.refresh_token == 'sensitive'"
              tone="success" label="YETKİLİ" />
            <EkStatusChip v-else tone="danger" label="YETKİSİZ" />
            <EkButton tone="primary" size="sm" icon="mdi-shield-check-outline" class="ek-ideasoft-status-row__action"
              @click="startAuthFlow()">
              Entegrasyona Yetki Ver
            </EkButton>
          </div>
        </EkFormSection>

        <EkFormSection title="Ürün eşitleme" icon="mdi-sync"
          description="Bağlantı başarılı olduktan sonra verilerinizi senkronize etmek için kullanın.">
          <div class="ek-span-full">
            <EkButton tone="secondary" icon="mdi-download-outline" @click="retrieveCategories()">
              Ürün ve Kategorileri Getir
            </EkButton>
          </div>
        </EkFormSection>
      </v-window-item>

      <v-window-item :value="2">
        <EkFormSection title="Satış ve KDV ayarları" icon="mdi-tag-outline">
          <v-select :items="taxList" item-value="_id" clearable
            v-model.number="editingClientIntegration.settings.taxPercentage" label="KDV Oranı" />
          <v-text-field clearable label="Varsayılan Desi" v-model="editingClientIntegration.settings.desi" />
          <v-text-field clearable label="Varsayılan Garanti" v-model="editingClientIntegration.settings.warranty" />
          <v-select clearable label="Ürünün Stok Tipi" v-model="editingClientIntegration.settings.stockTypeLabel"
            :items="staticsStore.ideasoft.stockTypeLabelOptions" />
          <v-select clearable label="Hediye Durumu" v-model="editingClientIntegration.settings.hasGift" :items="[
              { title: 'Hediyesiz', value: 0 },
              { title: 'Hediyeli', value: 1 }
            ]" />
          <VCurrencyComponentVue @click.stop v-model="editingClientIntegration.settings.customShippingCost"
            :compact="true" label="Varsayılan Kargo Ücreti" clearable :isIconExist="false" :required="false" />
        </EkFormSection>
      </v-window-item>
    </IntegrationFormFrame>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, onBeforeUnmount, onMounted } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import LoadingComponent from '@/components/LoadingComponent.vue'
import IntegrationFormFrame from '@/components/integrations/IntegrationFormFrame.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkFormSection from '@/components/ds/EkFormSection.vue'
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
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface-sunken);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
}

.ek-ideasoft-status-row__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
}

.ek-ideasoft-status-row__action {
  margin-left: auto;
}
</style>
