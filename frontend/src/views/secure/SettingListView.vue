<template>
  <div class="settingListView">
    <div class="mt-6">
      <LoadingComponent attach=" .settingListView" ref="loadingComponentRef">
      </LoadingComponent>
      <v-row v-if="settings" class="pa-0 ma-0">
        <v-col cols="12" class="pa-0">
          <div class="px-0 px-md-6 mt-1">
            <v-tabs v-model="activeTab" color="passiveColor" align-tabs="start" class="stylish-tabs" height="auto"
              hide-slider show-arrows center-active>
              <v-tab :value="1" class="text-none stylish-tab-item">
                <v-icon start size="18">mdi-store-cog-outline</v-icon>
                <span>Mağaza Kimliği</span>
              </v-tab>
              <v-tab :value="2" class="text-none stylish-tab-item">
                <v-icon start size="18">mdi-file-document-edit-outline</v-icon>
                <span>Fatura & Yasal Bilgiler</span>
              </v-tab>
              <v-tab :value="3" class="text-none stylish-tab-item">
                <v-icon start size="18">mdi-truck-delivery-outline</v-icon>
                <span>Lojistik & Operasyon</span>
              </v-tab>
              <v-tab :value="4" class="text-none stylish-tab-item">
                <v-icon start size="18">mdi-bell-ring-outline</v-icon>
                <span>İletişim & Bildirimler</span>
              </v-tab>
            </v-tabs>
          </div>

          <v-card variant="flat" class="card-wrapper mx-0 mx-md-6 shadow-sm">
            <v-card-text class="pa-0">
              <v-window v-model="activeTab" class="pa-4 pa-md-8">
                <!-- Tab 1: Mağaza Kimliği -->
                <v-window-item :value="1">
                  <v-container class="pa-0">
                    <v-row dense>
                      <v-col cols="12" md="7">
                        <v-text-field clearable maxlength="128" class="customTextField" density="compact"
                          v-model="settings.storeName" variant="outlined" bg-color="textfieldColor" label="Mağaza Adı"
                          hint="Müşterilere ve e-postalarda görünecek resmi mağaza adınız" persistent-hint counter />

                        <div class="mt-8">
                          <p class="text-subtitle-2 font-weight-bold mb-4 d-flex align-center">
                            <v-icon start size="20" color="primary">mdi-palette-swatch</v-icon>
                            Mağaza Renk Paleti
                          </p>

                          <div class="d-flex flex-wrap ga-3 mb-6">
                            <div v-for="color in premiumPalettes" :key="color.hex" class="color-swatch-item"
                              :class="{ 'active': settings.brandColor === color.hex }"
                              :style="{ backgroundColor: color.hex }" @click="settings.brandColor = color.hex">
                              <v-tooltip activator="parent" location="top">{{ color.name }}</v-tooltip>
                              <v-icon v-if="settings.brandColor === color.hex" color="white"
                                size="20">mdi-check</v-icon>
                            </div>

                            <!-- Custom Color Trigger -->
                            <v-menu :close-on-content-click="false" location="top">
                              <template v-slot:activator="{ props }">
                                <div v-bind="props" class="color-swatch-item custom-picker-trigger shadow-sm">
                                  <v-icon size="24" color="grey-darken-1">mdi-plus</v-icon>
                                  <v-tooltip activator="parent" location="top">Özel Renk</v-tooltip>
                                </div>
                              </template>
                              <v-card min-width="300" elevation="12" class="rounded-xl border-0 overflow-hidden">
                                <v-color-picker v-model="settings.brandColor" hide-inputs show-swatches flat
                                  mode="hex"></v-color-picker>
                              </v-card>
                            </v-menu>
                          </div>

                          <v-text-field v-model="settings.brandColor" variant="underlined" density="compact"
                            label="Seçili Renk Kodu" class="mt-4" style="max-width: 150px;"
                            prepend-inner-icon="mdi-pound">
                          </v-text-field>
                        </div>

                        <v-col cols="12" class="mt-6 pa-0">
                          <div class="d-flex align-center justify-space-between mb-4">
                            <p class="text-caption font-weight-bold mb-0">Mağaza Logosu</p>
                            <v-switch v-model="useLogoUrl" label="URL kullan" color="primary" density="compact"
                              hide-details inset></v-switch>
                          </div>

                          <!-- Upload Mode -->
                          <div v-if="!useLogoUrl"
                            class="d-flex flex-column flex-sm-row align-center ga-4 pa-4 rounded-xl border border-dashed border-opacity-25 border-primary bg-lightColor">
                            <v-avatar size="100" class="rounded-lg bg-white border">
                              <template v-if="settings.logo">
                                <v-img :src="settings.logo" cover>
                                  <template v-slot:placeholder>
                                    <v-skeleton-loader type="image" />
                                  </template>
                                </v-img>
                              </template>
                              <v-icon v-else size="32" color="grey-lighten-1">mdi-image-plus-outline</v-icon>
                            </v-avatar>
                            <div class="text-center text-sm-left">
                              <p class="text-caption text-grey-darken-1 mb-2">Resmi mağaza logonuzu buradan
                                yükleyebilirsiniz.</p>
                              <v-btn color="info" variant="flat" size="small"
                                class="text-none rounded-lg premium-save-btn" @click="logoInput?.click()">
                                <v-icon start size="16">mdi-cloud-upload-outline</v-icon>
                                {{ settings.logo ? 'Logoyu Değiştir' : 'Logo Seç' }}
                              </v-btn>
                            </div>
                            <input type="file" ref="logoInput" class="d-none" accept="image/*"
                              @change="onLogoFileChange($event)" />
                          </div>

                          <!-- URL Mode -->
                          <div v-else>
                            <v-text-field clearable maxlength="512" class="customTextField" density="compact"
                              v-model="settings.logo" variant="outlined" bg-color="textfieldColor"
                              placeholder="https://example.com/logo.png" prepend-inner-icon="mdi-link-variant"
                              hint="Doğrudan bir görsel bağlantısı yapıştırmak için kullanın." persistent-hint />
                          </div>
                        </v-col>
                      </v-col>

                      <!-- Preview Card Section -->
                      <v-col cols="12" md="5" class="pl-md-8 pt-4">
                        <div
                          class="brand-preview-container pa-6 rounded-xl border border-dashed border-primary border-opacity-25">
                          <div class="d-flex align-center justify-space-between mb-4">
                            <p class="text-overline text-grey mb-0">Önizleme</p>
                            <v-chip size="x-small" :color="settings.brandColor" variant="flat"
                              class="font-weight-bold">Canlı</v-chip>
                          </div>

                          <v-card
                            class="elevation-0 rounded-lg border-0 overflow-hidden brand-preview-card bg-transparent"
                            min-height="160">
                            <div class="pa-4">
                              <div class="d-flex align-center mb-4">

                                <v-avatar size="80" class="rounded-lg bg-white border flex-shrink-0">
                                  <template v-if="settings.logo">
                                    <v-img :src="settings.logo" cover>
                                      <template v-slot:placeholder>
                                        <v-skeleton-loader type="image" />
                                      </template>
                                    </v-img>
                                  </template>
                                  <v-icon v-else size="24" color="grey-lighten-1">mdi-image-plus-outline</v-icon>
                                </v-avatar>


                                <div class="ml-3">
                                  <h4 class="text-subtitle-2 font-weight-bold mb-0 color-slate-900">{{
                                    settings.storeName
                                    || 'Mağaza Adı' }}
                                  </h4>
                                  <div class="d-flex align-center">
                                    <v-icon size="12" color="success" class="mr-1">mdi-check-decagram</v-icon>
                                    <span class="text-caption text-grey">Doğrulanmış Mağaza</span>
                                  </div>
                                </div>
                              </div>

                            </div>
                          </v-card>
                        </div>
                      </v-col>
                    </v-row>
                  </v-container>
                </v-window-item>

                <!-- Tab 2: Fatura & Yasal Bilgiler -->
                <v-window-item :value="2">
                  <v-container class="pa-0">
                    <v-row dense>
                      <v-col cols="12">
                        <v-radio-group inline v-model="settings.invoice.type" hide-details class="customTextField mb-4">
                          <v-radio :value="0" :label="$t('customers.customer.new.real')" color="primary" />
                          <v-radio :value="1" :label="$t('customers.customer.new.corporate')" color="primary" />
                        </v-radio-group>
                      </v-col>

                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact"
                          v-model="settings.invoice.firstname" label="İsim" variant="outlined"
                          bg-color="textfieldColor" />
                      </v-col>
                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact"
                          v-model="settings.invoice.lastname" label="Soyisim" variant="outlined"
                          bg-color="textfieldColor" />
                      </v-col>

                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact"
                          v-model="settings.invoice.tckn" label="T.C. Kimlik No" variant="outlined"
                          bg-color="textfieldColor" maxlength="11" />
                      </v-col>
                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact"
                          v-model="settings.invoice.phone" label="Fatura Telefon" variant="outlined"
                          bg-color="textfieldColor" />
                      </v-col>

                      <template v-if="settings.invoice.type === 1">
                        <v-col cols="12">
                          <v-text-field class="customTextField" clearable density="compact"
                            v-model="settings.invoice.companyName" label="Firma Ünvanı" variant="outlined"
                            bg-color="textfieldColor" />
                        </v-col>
                        <v-col cols="12" sm="6">
                          <v-text-field class="customTextField" clearable density="compact"
                            v-model="settings.invoice.taxOffice" label="Vergi Dairesi" variant="outlined"
                            bg-color="textfieldColor" />
                        </v-col>
                        <v-col cols="12" sm="6">
                          <v-text-field class="customTextField" clearable density="compact"
                            v-model="settings.invoice.taxNumber" label="Vergi No" variant="outlined"
                            bg-color="textfieldColor" />
                        </v-col>

                        <!-- Yeni Yasal Alanlar -->
                        <v-col cols="12" sm="6">
                          <v-text-field class="customTextField" clearable density="compact" v-model="settings.mersisNo"
                            label="MERSIS No" variant="outlined" bg-color="textfieldColor"
                            hint="Hukuki belgelerde basılacaktır" persistent-hint />
                        </v-col>
                        <v-col cols="12" sm="6">
                          <v-text-field class="customTextField" clearable density="compact"
                            v-model="settings.ticaretSicilNo" label="Ticaret Sicil No" variant="outlined"
                            bg-color="textfieldColor" hint="Hukuki belgelerde basılacaktır" persistent-hint />
                        </v-col>
                      </template>

                      <v-col cols="12" class="mt-2">
                        <v-textarea class="customTextField" clearable density="compact"
                          v-model="settings.invoice.address" label="Fatura Adresi" variant="outlined"
                          bg-color="textfieldColor" rows="3" />
                      </v-col>

                      <v-col cols="12" sm="6">
                        <v-select class="customTextField" clearable :items="staticsStore.cities" density="compact"
                          v-model="settings.invoice.city" label="İl" variant="outlined" bg-color="textfieldColor" />
                      </v-col>
                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact"
                          v-model="settings.invoice.district" label="İlçe" variant="outlined"
                          bg-color="textfieldColor" />
                      </v-col>
                    </v-row>
                  </v-container>
                </v-window-item>

                <!-- Tab 3: Lojistik & Operasyon -->
                <v-window-item :value="3">
                  <v-container class="pa-0">
                    <v-row dense>
                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact"
                          v-model.number="settings.shippingDuration" variant="outlined" bg-color="textfieldColor"
                          type="number">
                          <template #label>
                            Kargo Süresi (Gün) <span class="text-caption ml-1 font-weight-medium">(Varsayılan: {{
                              computedDefaultShipingDuration }})</span>
                          </template>
                        </v-text-field>
                      </v-col>

                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact" v-model.number="settings.desi"
                          variant="outlined" bg-color="textfieldColor" type="number">
                          <template #label>
                            Varsayılan Desi (dm³) <span class="text-caption ml-1 font-weight-medium">(Varsayılan: {{
                              computedDefaultDesi }})</span>
                          </template>
                        </v-text-field>
                      </v-col>

                      <v-col cols="12" sm="6">
                        <v-select class="customTextField" density="compact" v-model.number="settings.taxPercentage"
                          item-value="_id" :items="taxList" variant="outlined" bg-color="textfieldColor"
                          label="Varsayılan KDV Oranı" />
                      </v-col>

                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact"
                          v-model.number="settings.warranty" variant="outlined" bg-color="textfieldColor" type="number">
                          <template #label>
                            Garanti Süresi (Ay) <span class="text-caption ml-1 font-weight-medium">(Varsayılan: {{
                              computedDefaultWarranty }})</span>
                          </template>
                        </v-text-field>
                      </v-col>

                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact"
                          v-model.number="settings.maxPurchaseQuantity" variant="outlined" bg-color="textfieldColor"
                          type="number">
                          <template #label>
                            Maksimum Satış Adedi <span class="text-caption ml-1 font-weight-medium">(Varsayılan: {{
                              computedDefaultMaxPurchaseQuantity }})</span>
                          </template>
                        </v-text-field>
                      </v-col>

                      <v-col cols="12" sm="6">
                        <v-select class="customTextField" density="compact" v-model="settings.timezone"
                          :items="timezones" variant="outlined" bg-color="textfieldColor" label="Zaman Dilimi"
                          hint="Sipariş senkronizasyonu bu zaman dilimine göre yapılacaktır" persistent-hint />
                      </v-col>

                      <v-col cols="12" class="mt-4">
                        <p class="text-caption font-weight-bold mb-2">Çalışma Günleri</p>
                        <div class="d-flex flex-wrap ga-2">
                          <v-checkbox v-for="day in weekDays" :key="day.id" v-model="settings.workingDays"
                            :label="day.name" :value="day.id" density="compact" hide-details color="primary"
                            class="mr-4" />
                        </div>
                        <p class="text-caption text-grey mt-2">Seçili günlerin dışındaki siparişlerin kargo süresi
                          otomatik olarak bir
                          sonraki iş gününe kaydırılacaktır.</p>
                      </v-col>
                    </v-row>
                  </v-container>
                </v-window-item>

                <!-- Tab 4: İletişim & Bildirimler -->
                <v-window-item :value="4">
                  <v-container class="pa-0">
                    <v-row dense>
                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact" v-model="settings.alertEmail"
                          label="Hata Bildirim E-postası" variant="outlined" bg-color="textfieldColor"
                          prepend-inner-icon="mdi-email-alert-outline"
                          hint="Entegrasyon hataları bu adrese gönderilecektir" persistent-hint />
                      </v-col>
                      <v-col cols="12" sm="6">
                        <v-text-field class="customTextField" clearable density="compact"
                          v-model="settings.supportPhone" label="Müşteri Destek Telefonu" variant="outlined"
                          bg-color="textfieldColor" prepend-inner-icon="mdi-headphones"
                          hint="Müşterilerinizin göreceği iletişim numarası" persistent-hint />
                      </v-col>

                      <v-col cols="12" class="mt-8">
                        <v-alert type="info" variant="tonal" density="compact" border="start"
                          title="Entegrasyon Sağlık Durumu">
                          Bu bölümdeki iletişim bilgileri, sistem mimarinizin bir parçası olarak entegrasyonlarınızın
                          sürekliliğini
                          sağlamak için kullanılır.
                          Kritik bir hata oluştuğunda belirtilen kanallar üzerinden otomatik bilgilendirme yapılır.
                        </v-alert>
                      </v-col>
                    </v-row>
                  </v-container>
                </v-window-item>

              </v-window>

              <div class="pa-6 pt-4 d-flex align-center ga-4 flex-wrap action-wrapper border-t">
                <v-spacer class="d-none d-sm-block"></v-spacer>
                <v-btn class="premium-save-btn ml-0 flex-grow-1 flex-sm-grow-0" color="saveButtonColor" variant="flat"
                  @click.stop="saveSettings" elevation="2">
                  <v-icon start size="small" class="mr-1">mdi-check-circle-outline</v-icon>
                  Ayarları Kaydet
                </v-btn>
              </div>
            </v-card-text>
          </v-card>

        </v-col>
      </v-row>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'
import { useStaticsStore } from '@/stores/staticsStore';
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore';

const restApi = useRestApi()
const snackbarStore = useSnackbarStore();
const activeTab = ref(1)
const logoInput = ref<HTMLInputElement | null>(null)
const useLogoUrl = ref(false)

const staticsStore = useStaticsStore()
const settings: any = ref({
  desi: undefined,
  shippingDuration: undefined,
  maxPurchaseQuantity: undefined,
  taxPercentage: undefined,
  logo: '',
  brandColor: '#4F46E5',
  alertEmail: '',
  supportPhone: '',
  timezone: 'Europe/Istanbul',
  workingDays: [1, 2, 3, 4, 5],
  mersisNo: '',
  ticaretSicilNo: '',
  invoice: {
    firstname: '',
    lastname: '',
    tckn: '',
    type: 0,
    companyName: '',
    taxNumber: '',
    taxOffice: '',
    address: '',
    city: '',
    district: '',
    phone: ''
  }
})

const loadingComponentRef: any = ref(null)
const { t } = useI18n()

const taxList = Array.from({ length: 29 }, (_, i) => ({ _id: i + 1, value: i + 1, title: i + 1 }))

const premiumPalettes = [
  { name: 'Royal Indigo', hex: '#4F46E5' },
  { name: 'Ocean Blue', hex: '#0EA5E9' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Ruby', hex: '#E11D48' },
  { name: 'Slate', hex: '#475569' },
  { name: 'Deep Purple', hex: '#7C3AED' },
  { name: 'Forest', hex: '#065F46' }
]

const timezones = [
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'Asia/Dubai',
  'Asia/Tokyo'
]

const weekDays = [
  { id: 1, name: 'Pazartesi' },
  { id: 2, name: 'Salı' },
  { id: 3, name: 'Çarşamba' },
  { id: 4, name: 'Perşembe' },
  { id: 5, name: 'Cuma' },
  { id: 6, name: 'Cumartesi' },
  { id: 0, name: 'Pazar' }
]

const onLogoFileChange = async (event: any) => {
  const file = event.target.files[0]
  if (!file) return

  let guid = loadingComponentRef.value.info('Logo yükleniyor...')
  try {
    const formData = new FormData()
    formData.append('files', file)

    const response = await restApi.postIdentityUpload(formData)

    if (response?.result) {
      settings.value.logo = response.url + '?t=' + Date.now() // Browser cache prevention
      snackbarStore.addSnackbar({
        show: true,
        text: 'Logo başarıyla yüklendi.',
        timeout: 3000,
        color: 'success'
      })
    } else {
      snackbarStore.addSnackbar({
        show: true,
        text: 'Logo yüklenirken bir hata oluştu.',
        timeout: 5000,
        color: 'error'
      })
    }
  } catch (error) {
    console.error('Logo upload error:', error)
    snackbarStore.addSnackbar({
      show: true,
      text: 'Sistem hatası: Logo yüklenemedi.',
      timeout: 5000,
      color: 'error'
    })
  } finally {
    loadingComponentRef.value.remove(guid)
    if (event.target) event.target.value = '' // Clear input
  }
}

const saveSettings = async () => {
  let guid = loadingComponentRef.value.info(t('loading.info.closeTicket'))
  try {
    let response = await restApi.post("SettingService/updateSettings", { settings: settings.value })
    loadingComponentRef.value.remove(guid)
    if (response?._id) {
      await getSettings()
      snackbarStore.addSnackbar({
        show: true,
        text: 'Ayarlar başarıyla kaydedildi.',
        timeout: 5000,
        color: 'success'
      })
    } else {
      snackbarStore.addSnackbar({
        show: true,
        text: 'Ayarlar kaydedilirken bir hata oluştu.',
        timeout: 5000,
        color: 'error'
      })
    }
  } catch (error) {
    loadingComponentRef.value.remove(guid)
  }
}

const getSettings = async () => {
  let guid = loadingComponentRef.value.info()
  try {
    let response = await restApi.post("SettingService/getSettings", {})
    loadingComponentRef.value.remove(guid)
    if (response?.settings) {
      settings.value = response.settings
      if (settings.value.invoice === undefined) {
        settings.value.invoice = { type: 0 }
      }
      // Varsayılan dilim ve günler eğer DB'de yoksa set edelim
      if (!settings.value.timezone) settings.value.timezone = 'Europe/Istanbul';
      if (!settings.value.workingDays) settings.value.workingDays = [1, 2, 3, 4, 5];
      if (!settings.value.brandColor) settings.value.brandColor = '#4F46E5';
    }
  } catch (error) {
    loadingComponentRef.value.remove(guid)
  }
}

const computedDefaultDesi = computed(() => staticsStore.desi)
const computedDefaultWarranty = computed(() => staticsStore.warranty)
const computedDefaultShipingDuration = computed(() => staticsStore.shippingDuration)
const computedDefaultMaxPurchaseQuantity = computed(() => staticsStore.maxPurchaseQuantity)

onMounted(() => {
  getSettings()
})
</script>

<style scoped>
.settingListView {}

.card-wrapper {
  margin-top: -1px;
  flex: 1;
  overflow-y: auto;
  background: rgba(var(--v-theme-lightColor)) !important;
  border: 1px solid rgb(var(--v-theme-borderColor)) !important;
  border-radius: 0 12px 12px 12px !important;
  z-index: 0;

  position: absolute !important;
  top: 76px;
  bottom: auto;
  left: 0;
  right: 0;
}

.action-wrapper {
  height: auto !important;
  min-height: 80px;
  width: 100%;
  padding: 16px;
  background: rgba(var(--v-theme-loginColor));
}

.stylish-tabs {
  border-bottom: none !important;
  z-index: 2;
  flex-shrink: 0;
  top: 28px;
  position: absolute;
}

.stylish-tab-item {
  font-weight: 600 !important;
  font-size: 0.85rem !important;
  color: rgb(var(--v-theme-passiveColor)) !important;
  opacity: 0.5;
  margin-right: 0px;
  border: 1px solid rgb(var(--v-theme-borderColor)) !important;
  border-bottom: none !important;
  border-radius: 12px 12px 0 0 !important;
  transition: all 0.25s ease;
  min-width: 160px;
  background: transparent !important;
  height: 48px !important;
}

@media (max-width: 600px) {
  .stylish-tab-item {
    min-width: 120px;
    height: 40px !important;
    font-size: 0.75rem !important;
  }

  .card-wrapper {
    border-radius: 8px !important;
  }
}

.stylish-tab-item:hover {
  opacity: 0.8;
  background-color: rgba(var(--v-theme-passiveColor), 0.05);
}

.stylish-tab-item.v-tab--selected {
  opacity: 1 !important;
  background: rgba(var(--v-theme-lightColor)) !important;
  border-color: rgb(var(--v-theme-borderColor)) !important;
  box-shadow: 0 3px 0 0 rgba(var(--v-theme-lightColor)) !important;
  position: relative;
  z-index: 20;
}

.color-swatch-item {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid transparent;
}

.color-swatch-item:hover {
  transform: scale(1.15) rotate(5deg);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

.color-swatch-item.active {
  transform: scale(1.1);
  border-color: #fff;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.05), 0 10px 15px -3px rgba(0, 0, 0, 0.2);
}

.custom-picker-trigger {
  background: linear-gradient(135deg, #f6f8fb 0%, #e2e8f0 100%);
  border: 2px dashed #cbd5e1;
}

.custom-picker-trigger:hover {
  border-color: var(--v-theme-primary);
  background: white;
}

.brand-preview-container {
  background-color: rgba(var(--v-theme-primary), 0.02);
  height: 100%;
}

.brand-preview-card {
  transition: all 0.5s ease;
}
</style>