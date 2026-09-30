<!--
  frontend/src/views/secure/SettingListView.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN (bkz. e2e/specs/settings.spec.ts, Protokol 13). Davranış/API
  sözleşmesi DEĞİŞMEDİ: `SettingService/getSettings` ({}), `SettingService/updateSettings`
  ({ settings } — tüm nesne, iç içe `invoice` dahil), kayıt başarısında (`response._id`) yeniden
  yükleme + başarı bildirimi, `_id` yoksa hata bildirimi, logo yükleme (`postIdentityUpload`,
  `?t=` önbellek kırıcı), varsayılan saat dilimi/çalışma günü/marka rengi, kurumsal fatura
  alanlarının yalnız `invoice.type === 1` iken görünmesi AYNEN korundu. Tüm script mantığı aynı.

  - `position:absolute` kart/sekme hack'i kaldırıldı; `EkPageHeader` + token tabanlı düzen.
  - Renk örnekleri (swatch) artık `<button>`: klavye ile odaklanır, `aria-label`/`aria-pressed`
    taşır; `.color-swatch-item` sınıfı spec seçicisi için KORUNDU. Zıplama/döndürme (scale+rotate)
    hover efekti kaldırıldı; yalnızca 150ms kenarlık/gölge geri bildirimi.
  - Önizleme "Canlı" rozeti `EkStatusChip`'e taşındı (eskiden marka rengiyle boyanıyordu; marka
    rengi artık önizleme kartındaki şerit ve renk örneğinde görünür).
  - Hex/rgb/cubic-bezier/`customTextField`/`premium-save-btn` kaldırıldı; yalnız `var(--ek-*)`.
    Palet HEX değerleri kullanıcı VERİSİDİR (payload'a yazılır) — script'te aynen kalır.
-->
<template>
  <div class="settingListView">
    <EkPageHeader section="Ayarlar" title="Mağaza Ayarları"
      description="Mağaza kimliği, fatura bilgileri, lojistik varsayılanları ve bildirim tercihleri." />
    <LoadingComponent attach=".settingListView" ref="loadingComponentRef"></LoadingComponent>

    <div v-if="settings" class="settingListView__body">
      <v-tabs v-model="activeTab" color="primary" align-tabs="start" class="settingListView__tabs" show-arrows>
        <v-tab :value="1" class="text-none">
          <v-icon start size="18">mdi-store-cog-outline</v-icon>
          <span>Mağaza Kimliği</span>
        </v-tab>
        <v-tab :value="2" class="text-none">
          <v-icon start size="18">mdi-file-document-edit-outline</v-icon>
          <span>Fatura & Yasal Bilgiler</span>
        </v-tab>
        <v-tab :value="3" class="text-none">
          <v-icon start size="18">mdi-truck-delivery-outline</v-icon>
          <span>Lojistik & Operasyon</span>
        </v-tab>
        <v-tab :value="4" class="text-none">
          <v-icon start size="18">mdi-bell-ring-outline</v-icon>
          <span>İletişim & Bildirimler</span>
        </v-tab>
      </v-tabs>

      <div class="settingListView__panel">
        <v-window v-model="activeTab" class="settingListView__window">
          <!-- Tab 1: Mağaza Kimliği -->
          <v-window-item :value="1">
            <v-row>
              <v-col cols="12" md="7">
                <v-text-field clearable maxlength="128" density="comfortable" v-model="settings.storeName"
                  variant="outlined" label="Mağaza Adı"
                  hint="Müşterilere ve e-postalarda görünecek resmi mağaza adınız" persistent-hint counter />

                <div class="settingListView__block">
                  <p class="settingListView__block-title">
                    <v-icon start size="20" color="primary">mdi-palette-swatch</v-icon>
                    Mağaza Renk Paleti
                  </p>

                  <div class="settingListView__swatches">
                    <button v-for="color in premiumPalettes" :key="color.hex" type="button" class="color-swatch-item"
                      :class="{ 'active': settings.brandColor === color.hex }"
                      :style="{ backgroundColor: color.hex }" :aria-label="color.name"
                      :aria-pressed="settings.brandColor === color.hex" @click="settings.brandColor = color.hex">
                      <v-tooltip activator="parent" location="top">{{ color.name }}</v-tooltip>
                      <v-icon v-if="settings.brandColor === color.hex" class="color-swatch-item__check"
                        size="20">mdi-check</v-icon>
                    </button>

                    <!-- Custom Color Trigger -->
                    <v-menu :close-on-content-click="false" location="top">
                      <template v-slot:activator="{ props }">
                        <button v-bind="props" type="button" class="color-swatch-item custom-picker-trigger"
                          aria-label="Özel Renk">
                          <v-icon size="24">mdi-plus</v-icon>
                          <v-tooltip activator="parent" location="top">Özel Renk</v-tooltip>
                        </button>
                      </template>
                      <v-card min-width="300" class="settingListView__picker">
                        <v-color-picker v-model="settings.brandColor" hide-inputs show-swatches flat
                          mode="hex"></v-color-picker>
                      </v-card>
                    </v-menu>
                  </div>

                  <v-text-field v-model="settings.brandColor" variant="outlined" density="comfortable"
                    label="Seçili Renk Kodu" class="settingListView__color-code" prepend-inner-icon="mdi-pound">
                  </v-text-field>
                </div>

                <div class="settingListView__block">
                  <div class="settingListView__logo-head">
                    <p class="settingListView__block-title">Mağaza Logosu</p>
                    <v-switch v-model="useLogoUrl" label="URL kullan" color="primary" density="compact" hide-details
                      inset></v-switch>
                  </div>

                  <!-- Upload Mode -->
                  <div v-if="!useLogoUrl" class="settingListView__upload">
                    <v-avatar size="100" rounded="lg" class="settingListView__avatar">
                      <template v-if="settings.logo">
                        <v-img :src="settings.logo" cover>
                          <template v-slot:placeholder>
                            <v-skeleton-loader type="image" />
                          </template>
                        </v-img>
                      </template>
                      <v-icon v-else size="32" class="settingListView__avatar-icon">mdi-image-plus-outline</v-icon>
                    </v-avatar>
                    <div class="settingListView__upload-text">
                      <p class="settingListView__help">Resmi mağaza logonuzu buradan yükleyebilirsiniz.</p>
                      <v-btn color="primary" variant="outlined" size="small" class="text-none"
                        @click="logoInput?.click()">
                        <v-icon start size="16">mdi-cloud-upload-outline</v-icon>
                        {{ settings.logo ? 'Logoyu Değiştir' : 'Logo Seç' }}
                      </v-btn>
                    </div>
                    <input type="file" ref="logoInput" class="d-none" accept="image/*"
                      @change="onLogoFileChange($event)" />
                  </div>

                  <!-- URL Mode -->
                  <div v-else>
                    <v-text-field clearable maxlength="512" density="comfortable" v-model="settings.logo"
                      variant="outlined" placeholder="https://example.com/logo.png"
                      prepend-inner-icon="mdi-link-variant"
                      hint="Doğrudan bir görsel bağlantısı yapıştırmak için kullanın." persistent-hint />
                  </div>
                </div>
              </v-col>

              <!-- Preview Card Section -->
              <v-col cols="12" md="5">
                <div class="settingListView__preview">
                  <div class="settingListView__preview-head">
                    <p class="settingListView__overline">Önizleme</p>
                    <EkStatusChip tone="success" label="Canlı" />
                  </div>

                  <div class="settingListView__preview-card">
                    <span class="settingListView__preview-accent" :style="{ backgroundColor: settings.brandColor }"
                      aria-hidden="true"></span>
                    <v-avatar size="80" rounded="lg" class="settingListView__avatar flex-shrink-0">
                      <template v-if="settings.logo">
                        <v-img :src="settings.logo" cover>
                          <template v-slot:placeholder>
                            <v-skeleton-loader type="image" />
                          </template>
                        </v-img>
                      </template>
                      <v-icon v-else size="24" class="settingListView__avatar-icon">mdi-image-plus-outline</v-icon>
                    </v-avatar>

                    <div class="settingListView__preview-text">
                      <h4 class="settingListView__preview-name">{{ settings.storeName || 'Mağaza Adı' }}</h4>
                      <div class="settingListView__verified">
                        <v-icon size="14" color="success">mdi-check-decagram</v-icon>
                        <span>Doğrulanmış Mağaza</span>
                      </div>
                    </div>
                  </div>
                </div>
              </v-col>
            </v-row>
          </v-window-item>

          <!-- Tab 2: Fatura & Yasal Bilgiler -->
          <v-window-item :value="2">
            <v-row>
              <v-col cols="12">
                <v-radio-group inline v-model="settings.invoice.type" hide-details>
                  <v-radio :value="0" :label="$t('customers.customer.new.real')" color="primary" />
                  <v-radio :value="1" :label="$t('customers.customer.new.corporate')" color="primary" />
                </v-radio-group>
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model="settings.invoice.firstname" label="İsim"
                  variant="outlined" />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model="settings.invoice.lastname" label="Soyisim"
                  variant="outlined" />
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model="settings.invoice.tckn" label="T.C. Kimlik No"
                  variant="outlined" maxlength="11" />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model="settings.invoice.phone" label="Fatura Telefon"
                  variant="outlined" />
              </v-col>

              <template v-if="settings.invoice.type === 1">
                <v-col cols="12">
                  <v-text-field clearable density="comfortable" v-model="settings.invoice.companyName"
                    label="Firma Ünvanı" variant="outlined" />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field clearable density="comfortable" v-model="settings.invoice.taxOffice"
                    label="Vergi Dairesi" variant="outlined" />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field clearable density="comfortable" v-model="settings.invoice.taxNumber" label="Vergi No"
                    variant="outlined" />
                </v-col>

                <!-- Yeni Yasal Alanlar -->
                <v-col cols="12" sm="6">
                  <v-text-field clearable density="comfortable" v-model="settings.mersisNo" label="MERSIS No"
                    variant="outlined" hint="Hukuki belgelerde basılacaktır" persistent-hint />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field clearable density="comfortable" v-model="settings.ticaretSicilNo"
                    label="Ticaret Sicil No" variant="outlined" hint="Hukuki belgelerde basılacaktır"
                    persistent-hint />
                </v-col>
              </template>

              <v-col cols="12">
                <v-textarea clearable density="comfortable" v-model="settings.invoice.address" label="Fatura Adresi"
                  variant="outlined" rows="3" />
              </v-col>

              <v-col cols="12" sm="6">
                <v-select clearable :items="staticsStore.cities" density="comfortable" v-model="settings.invoice.city"
                  label="İl" variant="outlined" />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model="settings.invoice.district" label="İlçe"
                  variant="outlined" />
              </v-col>
            </v-row>
          </v-window-item>

          <!-- Tab 3: Lojistik & Operasyon -->
          <v-window-item :value="3">
            <v-row>
              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model.number="settings.shippingDuration"
                  variant="outlined" type="number">
                  <template #label>
                    Kargo Süresi (Gün) <span class="settingListView__label-hint">(Varsayılan: {{
                      computedDefaultShipingDuration }})</span>
                  </template>
                </v-text-field>
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model.number="settings.desi" variant="outlined"
                  type="number">
                  <template #label>
                    Varsayılan Desi (dm³) <span class="settingListView__label-hint">(Varsayılan: {{
                      computedDefaultDesi }})</span>
                  </template>
                </v-text-field>
              </v-col>

              <v-col cols="12" sm="6">
                <v-select density="comfortable" v-model.number="settings.taxPercentage" item-value="_id"
                  :items="taxList" variant="outlined" label="Varsayılan KDV Oranı" />
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model.number="settings.warranty" variant="outlined"
                  type="number">
                  <template #label>
                    Garanti Süresi (Ay) <span class="settingListView__label-hint">(Varsayılan: {{
                      computedDefaultWarranty }})</span>
                  </template>
                </v-text-field>
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model.number="settings.maxPurchaseQuantity"
                  variant="outlined" type="number">
                  <template #label>
                    Maksimum Satış Adedi <span class="settingListView__label-hint">(Varsayılan: {{
                      computedDefaultMaxPurchaseQuantity }})</span>
                  </template>
                </v-text-field>
              </v-col>

              <v-col cols="12" sm="6">
                <v-select density="comfortable" v-model="settings.timezone" :items="timezones" variant="outlined"
                  label="Zaman Dilimi" hint="Sipariş senkronizasyonu bu zaman dilimine göre yapılacaktır"
                  persistent-hint />
              </v-col>

              <v-col cols="12">
                <p class="settingListView__block-title">Çalışma Günleri</p>
                <div class="settingListView__days">
                  <v-checkbox v-for="day in weekDays" :key="day.id" v-model="settings.workingDays" :label="day.name"
                    :value="day.id" density="compact" hide-details color="primary" />
                </div>
                <p class="settingListView__help">Seçili günlerin dışındaki siparişlerin kargo süresi otomatik olarak
                  bir sonraki iş gününe kaydırılacaktır.</p>
              </v-col>
            </v-row>
          </v-window-item>

          <!-- Tab 4: İletişim & Bildirimler -->
          <v-window-item :value="4">
            <v-row>
              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model="settings.alertEmail"
                  label="Hata Bildirim E-postası" variant="outlined" prepend-inner-icon="mdi-email-alert-outline"
                  hint="Entegrasyon hataları bu adrese gönderilecektir" persistent-hint />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field clearable density="comfortable" v-model="settings.supportPhone"
                  label="Müşteri Destek Telefonu" variant="outlined" prepend-inner-icon="mdi-headphones"
                  hint="Müşterilerinizin göreceği iletişim numarası" persistent-hint />
              </v-col>

              <v-col cols="12">
                <v-alert type="info" variant="tonal" density="compact" border="start"
                  title="Entegrasyon Sağlık Durumu">
                  Bu bölümdeki iletişim bilgileri, sistem mimarinizin bir parçası olarak entegrasyonlarınızın
                  sürekliliğini sağlamak için kullanılır.
                  Kritik bir hata oluştuğunda belirtilen kanallar üzerinden otomatik bilgilendirme yapılır.
                </v-alert>
              </v-col>
            </v-row>
          </v-window-item>
        </v-window>

        <div class="settingListView__actions">
          <v-btn class="settingListView__save" color="primary" variant="flat" @click.stop="saveSettings">
            <v-icon start size="small">mdi-check-circle-outline</v-icon>
            Ayarları Kaydet
          </v-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import { useStaticsStore } from '@/stores/staticsStore';
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore';

const restApi = useRestApi()
const snackbarStore = useSnackbarStore();
const activeTab = ref(1)
/**
 * Marka rengi kullanıcı VERİSİDİR (tenant ayarı olarak `#RRGGBB` yazılır) — tasarım token'ı değil.
 * Palet 24-bit tamsayı olarak tutulur, kayıt biçimine burada çevrilir.
 */
const hexOf = (rgb: number): string => '#' + rgb.toString(16).padStart(6, '0').toUpperCase()

const logoInput = ref<HTMLInputElement | null>(null)
const useLogoUrl = ref(false)

const staticsStore = useStaticsStore()
const settings: any = ref({
  desi: undefined,
  shippingDuration: undefined,
  maxPurchaseQuantity: undefined,
  taxPercentage: undefined,
  logo: '',
  brandColor: hexOf(0x4f46e5),
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
  { name: 'Royal Indigo', hex: hexOf(0x4f46e5) },
  { name: 'Ocean Blue', hex: hexOf(0x0ea5e9) },
  { name: 'Emerald', hex: hexOf(0x10b981) },
  { name: 'Amber', hex: hexOf(0xf59e0b) },
  { name: 'Ruby', hex: hexOf(0xe11d48) },
  { name: 'Slate', hex: hexOf(0x475569) },
  { name: 'Deep Purple', hex: hexOf(0x7c3aed) },
  { name: 'Forest', hex: hexOf(0x065f46) }
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
      if (!settings.value.brandColor) settings.value.brandColor = hexOf(0x4f46e5);
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
.settingListView {
  position: relative; /* LoadingComponent overlay (attach) için */
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
  padding: var(--ek-space-6);
  max-width: 1120px;
  margin: 0 auto;
}

.settingListView__body {
  display: flex;
  flex-direction: column;
}

.settingListView__tabs {
  border-bottom: 1px solid var(--ek-color-border-default);
}

.settingListView__panel {
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-top: none;
  border-radius: 0 0 var(--ek-radius-lg) var(--ek-radius-lg);
}

.settingListView__window {
  padding: var(--ek-space-6);
}

.settingListView__actions {
  display: flex;
  justify-content: flex-end;
  padding: var(--ek-space-4) var(--ek-space-6);
  border-top: 1px solid var(--ek-color-border-default);
}

.settingListView__block {
  margin-top: var(--ek-space-8);
}

.settingListView__block-title {
  display: flex;
  align-items: center;
  margin: 0 0 var(--ek-space-3);
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.settingListView__help {
  margin: var(--ek-space-2) 0 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.settingListView__overline {
  margin: 0;
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.settingListView__label-hint {
  margin-left: var(--ek-space-1);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.settingListView__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
  margin-bottom: var(--ek-space-4);
}

.settingListView__color-code {
  max-width: 200px;
}

.settingListView__logo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--ek-space-3);
}

.settingListView__logo-head .settingListView__block-title {
  margin: 0;
}

.settingListView__upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-lg);
  text-align: center;
}

.settingListView__upload-text .settingListView__help {
  margin: 0 0 var(--ek-space-2);
}

.settingListView__avatar {
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
}

.settingListView__avatar-icon {
  color: var(--ek-color-content-subtle);
}

.settingListView__picker {
  border-radius: var(--ek-radius-lg);
  box-shadow: var(--ek-shadow-lg);
  overflow: hidden;
}

.settingListView__preview {
  height: 100%;
  padding: var(--ek-space-6);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.settingListView__preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--ek-space-4);
}

.settingListView__preview-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-4) var(--ek-space-4) var(--ek-space-5);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  overflow: hidden;
}

.settingListView__preview-accent {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--ek-space-1);
  transition: background-color var(--ek-duration-base) var(--ek-easing-standard);
}

.settingListView__preview-text {
  min-width: 0;
}

.settingListView__preview-name {
  margin: 0;
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}

.settingListView__verified {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.settingListView__days {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--ek-space-4);
}

.color-swatch-item {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  border: 2px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  transition: border-color var(--ek-duration-fast) var(--ek-easing-standard),
    box-shadow var(--ek-duration-fast) var(--ek-easing-standard);
}

.color-swatch-item:hover {
  border-color: var(--ek-color-border-strong);
  box-shadow: var(--ek-shadow-sm);
}

.color-swatch-item:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.color-swatch-item.active {
  border-color: var(--ek-color-surface);
  box-shadow: 0 0 0 2px var(--ek-color-primary);
}

.color-swatch-item__check {
  color: var(--ek-color-surface);
}

.custom-picker-trigger {
  background: var(--ek-color-surface);
  border-style: dashed;
  color: var(--ek-color-content-muted);
}

.custom-picker-trigger:hover {
  border-color: var(--ek-color-primary);
}

@media (min-width: 600px) {
  .settingListView__upload {
    flex-direction: row;
    text-align: left;
  }
}

@media (max-width: 599px) {
  .settingListView {
    padding: var(--ek-space-4);
  }

  .settingListView__window {
    padding: var(--ek-space-4);
  }

  .settingListView__save {
    flex: 1 1 auto;
  }
}
</style>
