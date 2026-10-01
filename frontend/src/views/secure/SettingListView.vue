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
    <EkPageHeader section="Ayarlar" title="Mağaza ayarları"
      description="Mağaza kimliği, fatura bilgileri, lojistik varsayılanları ve bildirim tercihleri." />
    <LoadingComponent attach=".settingListView" ref="loadingComponentRef"></LoadingComponent>

    <div v-if="settings" class="sl-layout">
      <!-- FR3-14: sol — ayar arama + grup gezinmesi (dikey sekme listesi; değişen grupta nokta). -->
      <nav class="sl-nav" aria-label="Ayar bölümleri">
        <v-text-field v-model="query" class="sl-nav__search" prepend-inner-icon="mdi-magnify" placeholder="Ayarlarda ara"
          aria-label="Ayarlarda ara" clearable hide-details @keydown.esc="query = ''" />
        <div class="sl-nav__list" role="tablist" aria-orientation="vertical" aria-label="Ayar bölümleri">
          <button v-for="g in GROUPS" :key="g.value" type="button" role="tab" class="sl-nav__item"
            :class="{ 'is-active': !searching && activeTab === g.value }"
            :aria-selected="!searching && activeTab === g.value" :aria-controls="`sl-group-${g.value}`" @click="selectGroup(g.value)">
            <v-icon :icon="g.icon" class="sl-nav__icon" aria-hidden="true" />
            <span class="sl-nav__text">
              <span class="sl-nav__label">{{ g.label }}</span>
              <span class="sl-nav__desc">{{ g.short }}</span>
            </span>
            <span v-if="searching && hitsByGroup[g.value]" class="sl-nav__count ek-num">{{ hitsByGroup[g.value] }}</span>
            <span v-else-if="dirtyGroups.has(g.value)" class="sl-nav__dot" title="Kaydedilmemiş değişiklik var"><span class="ek-sr-only">Kaydedilmemiş değişiklik var</span></span>
          </button>
        </div>
      </nav>

      <div class="sl-content">
        <p v-if="searching" class="sl-search-state" role="status">
          <template v-if="hitCount"><strong class="ek-num">{{ hitCount }}</strong> ayar “{{ query }}” ile eşleşti.</template>
          <template v-else>“{{ query }}” ile eşleşen ayar yok. Farklı bir kelime deneyin ya da aramayı temizleyin.</template>
        </p>

        <!-- 1 · Mağaza kimliği -->
        <section v-show="groupShown(1)" :id="'sl-group-1'" class="sl-group" role="tabpanel" aria-labelledby="sl-group-1-title">
          <header class="sl-group__head">
            <h2 id="sl-group-1-title" class="sl-group__title">{{ GROUPS[0].label }}</h2>
            <p class="sl-group__desc">{{ GROUPS[0].description }}</p>
          </header>
          <div class="sl-identity">
            <EkDetailPanel v-show="cardShown(['storeName', 'brandColor', 'logo'])" title="Ad ve görünüm" icon="mdi-store-outline" flush>
              <SettingRow v-show="rowShown('storeName')" name="storeName" label="Mağaza Adı" for-id="sl-storeName"
                :description="row('storeName').description" :changed="changed('storeName')">
                <v-text-field id="sl-storeName" v-model="settings.storeName" clearable maxlength="128" counter />
              </SettingRow>
              <SettingRow v-show="rowShown('brandColor')" name="brandColor" label="Mağaza Renk Paleti" stacked
                :description="row('brandColor').description" :changed="changed('brandColor')">
                <div class="sl-swatches">
                  <button v-for="color in premiumPalettes" :key="color.hex" type="button" class="color-swatch-item"
                    :class="{ 'active': settings.brandColor === color.hex }"
                    :style="{ backgroundColor: color.hex }" :aria-label="color.name"
                    :aria-pressed="settings.brandColor === color.hex" @click="settings.brandColor = color.hex">
                    <v-tooltip activator="parent" location="top" :eager="false">{{ color.name }}</v-tooltip>
                    <v-icon v-if="settings.brandColor === color.hex" class="color-swatch-item__check" size="20">mdi-check</v-icon>
                  </button>
                  <v-menu :close-on-content-click="false" location="top">
                    <template v-slot:activator="{ props }">
                      <button v-bind="props" type="button" class="color-swatch-item custom-picker-trigger" aria-label="Özel Renk">
                        <v-icon size="24">mdi-plus</v-icon>
                        <v-tooltip activator="parent" location="top" :eager="false">Özel Renk</v-tooltip>
                      </button>
                    </template>
                    <v-card min-width="300" class="settingListView__picker">
                      <v-color-picker v-model="settings.brandColor" hide-inputs show-swatches flat mode="hex"></v-color-picker>
                    </v-card>
                  </v-menu>
                  <v-text-field v-model="settings.brandColor" label="Seçili Renk Kodu" class="sl-color-code" prepend-inner-icon="mdi-pound" hide-details />
                </div>
              </SettingRow>
              <SettingRow v-show="rowShown('logo')" name="logo" label="Mağaza Logosu" stacked
                :description="row('logo').description" :changed="changed('logo')">
                <div class="sl-logo">
                  <v-switch v-model="useLogoUrl" label="URL kullan" color="primary" density="compact" hide-details class="sl-logo__mode" />
                  <div v-if="!useLogoUrl" class="settingListView__upload">
                    <v-avatar size="72" rounded="lg" class="settingListView__avatar">
                      <v-img v-if="settings.logo" :src="settings.logo" cover>
                        <template v-slot:placeholder><v-skeleton-loader type="image" /></template>
                      </v-img>
                      <v-icon v-else size="28" class="settingListView__avatar-icon">mdi-image-plus-outline</v-icon>
                    </v-avatar>
                    <div class="settingListView__upload-text">
                      <p class="settingListView__help">Resmi mağaza logonuzu buradan yükleyebilirsiniz.</p>
                      <EkButton tone="secondary" size="sm" icon="mdi-upload-outline" @click="logoInput?.click()">{{ settings.logo ? 'Logoyu Değiştir' : 'Logo Seç' }}</EkButton>
                    </div>
                    <input type="file" ref="logoInput" class="d-none" accept="image/*" @change="onLogoFileChange($event)" />
                  </div>
                  <v-text-field v-else v-model="settings.logo" clearable maxlength="512" placeholder="https://example.com/logo.png"
                    aria-label="Logo bağlantısı" prepend-inner-icon="mdi-link-variant"
                    hint="Doğrudan bir görsel bağlantısı yapıştırmak için kullanın." persistent-hint />
                </div>
              </SettingRow>
            </EkDetailPanel>

            <!-- Önizleme: müşterinin göreceği kimlik (yalnız arama dışında). -->
            <aside v-show="!searching" class="settingListView__preview" aria-label="Önizleme">
              <div class="settingListView__preview-head">
                <p class="settingListView__overline">Önizleme</p>
                <EkStatusChip tone="success" label="Canlı" />
              </div>
              <div class="settingListView__preview-card">
                <span class="settingListView__preview-accent" :style="{ backgroundColor: settings.brandColor }" aria-hidden="true"></span>
                <v-avatar size="64" rounded="lg" class="settingListView__avatar flex-shrink-0">
                  <v-img v-if="settings.logo" :src="settings.logo" cover>
                    <template v-slot:placeholder><v-skeleton-loader type="image" /></template>
                  </v-img>
                  <v-icon v-else size="24" class="settingListView__avatar-icon">mdi-image-plus-outline</v-icon>
                </v-avatar>
                <div class="settingListView__preview-text">
                  <h3 class="settingListView__preview-name">{{ settings.storeName || 'Mağaza Adı' }}</h3>
                  <div class="settingListView__verified">
                    <v-icon size="14" color="success">mdi-check-decagram-outline</v-icon>
                    <span>Doğrulanmış Mağaza</span>
                  </div>
                </div>
              </div>
              <p class="settingListView__help">Ad, renk ve logo değiştikçe önizleme anında güncellenir; değişiklikler kaydettiğinizde saklanır.</p>
            </aside>
          </div>
        </section>

        <!-- 2 · Fatura & yasal bilgiler -->
        <section v-show="groupShown(2)" :id="'sl-group-2'" class="sl-group" role="tabpanel" aria-labelledby="sl-group-2-title">
          <header class="sl-group__head">
            <h2 id="sl-group-2-title" class="sl-group__title">{{ GROUPS[1].label }}</h2>
            <p class="sl-group__desc">{{ GROUPS[1].description }}</p>
          </header>
          <EkDetailPanel v-show="cardShown(['invoiceType', 'firstname', 'lastname', 'tckn', 'invoicePhone'])" title="Fatura kimliği" icon="mdi-card-account-details-outline" flush>
            <SettingRow v-show="rowShown('invoiceType')" name="invoiceType" label="Fatura tipi" label-id="sl-invoiceType"
              :description="row('invoiceType').description" :changed="changed('invoiceType')">
              <v-radio-group v-model="settings.invoice.type" inline hide-details aria-labelledby="sl-invoiceType">
                <v-radio :value="0" :label="$t('customers.customer.new.real')" color="primary" />
                <v-radio :value="1" :label="$t('customers.customer.new.corporate')" color="primary" />
              </v-radio-group>
            </SettingRow>
            <SettingRow v-show="rowShown('firstname')" name="firstname" label="İsim" for-id="sl-firstname" :changed="changed('firstname')">
              <v-text-field id="sl-firstname" v-model="settings.invoice.firstname" clearable />
            </SettingRow>
            <SettingRow v-show="rowShown('lastname')" name="lastname" label="Soyisim" for-id="sl-lastname" :changed="changed('lastname')">
              <v-text-field id="sl-lastname" v-model="settings.invoice.lastname" clearable />
            </SettingRow>
            <SettingRow v-show="rowShown('tckn')" name="tckn" label="T.C. Kimlik No" for-id="sl-tckn"
              :description="row('tckn').description" :changed="changed('tckn')">
              <v-text-field id="sl-tckn" v-model="settings.invoice.tckn" clearable maxlength="11" inputmode="numeric" />
            </SettingRow>
            <SettingRow v-show="rowShown('invoicePhone')" name="invoicePhone" label="Fatura Telefon" for-id="sl-invoicePhone" :changed="changed('invoicePhone')">
              <v-text-field id="sl-invoicePhone" v-model="settings.invoice.phone" clearable inputmode="tel" />
            </SettingRow>
          </EkDetailPanel>

          <EkDetailPanel v-if="settings.invoice.type === 1" v-show="cardShown(['companyName', 'taxOffice', 'taxNumber', 'mersisNo', 'ticaretSicilNo'])"
            title="Şirket bilgileri" icon="mdi-domain" description="Yalnız kurumsal fatura tipinde" flush>
            <SettingRow v-show="rowShown('companyName')" name="companyName" label="Firma Ünvanı" for-id="sl-companyName" :changed="changed('companyName')">
              <v-text-field id="sl-companyName" v-model="settings.invoice.companyName" clearable />
            </SettingRow>
            <SettingRow v-show="rowShown('taxOffice')" name="taxOffice" label="Vergi Dairesi" for-id="sl-taxOffice" :changed="changed('taxOffice')">
              <v-text-field id="sl-taxOffice" v-model="settings.invoice.taxOffice" clearable />
            </SettingRow>
            <SettingRow v-show="rowShown('taxNumber')" name="taxNumber" label="Vergi No" for-id="sl-taxNumber" :changed="changed('taxNumber')">
              <v-text-field id="sl-taxNumber" v-model="settings.invoice.taxNumber" clearable inputmode="numeric" />
            </SettingRow>
            <SettingRow v-show="rowShown('mersisNo')" name="mersisNo" label="MERSIS No" for-id="sl-mersisNo"
              :description="row('mersisNo').description" :changed="changed('mersisNo')">
              <v-text-field id="sl-mersisNo" v-model="settings.mersisNo" clearable />
            </SettingRow>
            <SettingRow v-show="rowShown('ticaretSicilNo')" name="ticaretSicilNo" label="Ticaret Sicil No" for-id="sl-ticaretSicilNo"
              :description="row('ticaretSicilNo').description" :changed="changed('ticaretSicilNo')">
              <v-text-field id="sl-ticaretSicilNo" v-model="settings.ticaretSicilNo" clearable />
            </SettingRow>
          </EkDetailPanel>

          <EkDetailPanel v-show="cardShown(['address', 'city', 'district'])" title="Fatura adresi" icon="mdi-map-marker-outline" flush>
            <SettingRow v-show="rowShown('address')" name="address" label="Fatura Adresi" for-id="sl-address"
              :description="row('address').description" :changed="changed('address')">
              <v-textarea id="sl-address" v-model="settings.invoice.address" clearable rows="3" auto-grow />
            </SettingRow>
            <SettingRow v-show="rowShown('city')" name="city" label="İl" for-id="sl-city" :changed="changed('city')">
              <v-select id="sl-city" v-model="settings.invoice.city" :items="staticsStore.cities" clearable aria-label="İl" />
            </SettingRow>
            <SettingRow v-show="rowShown('district')" name="district" label="İlçe" for-id="sl-district" :changed="changed('district')">
              <v-text-field id="sl-district" v-model="settings.invoice.district" clearable />
            </SettingRow>
          </EkDetailPanel>
        </section>

        <!-- 3 · Lojistik & operasyon -->
        <section v-show="groupShown(3)" :id="'sl-group-3'" class="sl-group" role="tabpanel" aria-labelledby="sl-group-3-title">
          <header class="sl-group__head">
            <h2 id="sl-group-3-title" class="sl-group__title">{{ GROUPS[2].label }}</h2>
            <p class="sl-group__desc">{{ GROUPS[2].description }}</p>
          </header>
          <EkDetailPanel v-show="cardShown(['shippingDuration', 'desi', 'taxPercentage', 'warranty', 'maxPurchaseQuantity'])" title="Ürün ve gönderi varsayılanları"
            icon="mdi-package-variant-closed" description="Boş bırakılan alanda platform varsayılanı geçerlidir" flush>
            <SettingRow v-show="rowShown('shippingDuration')" name="shippingDuration" label="Kargo Süresi (Gün)" for-id="sl-shippingDuration"
              :changed="changed('shippingDuration')">
              <template #description>Siparişi kargoya verme süreniz. <span class="ek-num">(Varsayılan: {{ computedDefaultShipingDuration }})</span></template>
              <v-text-field id="sl-shippingDuration" v-model.number="settings.shippingDuration" type="number" clearable suffix="gün" />
            </SettingRow>
            <SettingRow v-show="rowShown('desi')" name="desi" label="Varsayılan Desi (dm³)" for-id="sl-desi" :changed="changed('desi')">
              <template #description>Üründe desi yoksa kullanılan değer. <span class="ek-num">(Varsayılan: {{ computedDefaultDesi }})</span></template>
              <v-text-field id="sl-desi" v-model.number="settings.desi" type="number" clearable suffix="dm³" />
            </SettingRow>
            <SettingRow v-show="rowShown('taxPercentage')" name="taxPercentage" label="Varsayılan KDV Oranı" for-id="sl-taxPercentage"
              :description="row('taxPercentage').description" :changed="changed('taxPercentage')">
              <v-select id="sl-taxPercentage" v-model.number="settings.taxPercentage" item-value="_id" :items="taxList" aria-label="Varsayılan KDV Oranı" />
            </SettingRow>
            <SettingRow v-show="rowShown('warranty')" name="warranty" label="Garanti Süresi (Ay)" for-id="sl-warranty" :changed="changed('warranty')">
              <template #description>Mağaza genelindeki garanti süresi. <span class="ek-num">(Varsayılan: {{ computedDefaultWarranty }})</span></template>
              <v-text-field id="sl-warranty" v-model.number="settings.warranty" type="number" clearable suffix="ay" />
            </SettingRow>
            <SettingRow v-show="rowShown('maxPurchaseQuantity')" name="maxPurchaseQuantity" label="Maksimum Satış Adedi" for-id="sl-maxPurchaseQuantity"
              :changed="changed('maxPurchaseQuantity')">
              <template #description>Tek siparişte satılabilecek en fazla adet. <span class="ek-num">(Varsayılan: {{ computedDefaultMaxPurchaseQuantity }})</span></template>
              <v-text-field id="sl-maxPurchaseQuantity" v-model.number="settings.maxPurchaseQuantity" type="number" clearable suffix="adet" />
            </SettingRow>
          </EkDetailPanel>

          <EkDetailPanel v-show="cardShown(['timezone', 'workingDays'])" title="Çalışma takvimi" icon="mdi-calendar-clock-outline" flush>
            <SettingRow v-show="rowShown('timezone')" name="timezone" label="Zaman Dilimi" for-id="sl-timezone"
              :description="row('timezone').description" :changed="changed('timezone')">
              <v-select id="sl-timezone" v-model="settings.timezone" :items="timezones" aria-label="Zaman Dilimi" />
            </SettingRow>
            <SettingRow v-show="rowShown('workingDays')" name="workingDays" label="Çalışma Günleri" stacked
              :description="row('workingDays').description" :changed="changed('workingDays')">
              <div class="settingListView__days">
                <v-checkbox v-for="day in weekDays" :key="day.id" v-model="settings.workingDays" :label="day.name"
                  :value="day.id" density="compact" hide-details color="primary" />
              </div>
            </SettingRow>
          </EkDetailPanel>
        </section>

        <!-- 4 · İletişim & bildirimler -->
        <section v-show="groupShown(4)" :id="'sl-group-4'" class="sl-group" role="tabpanel" aria-labelledby="sl-group-4-title">
          <header class="sl-group__head">
            <h2 id="sl-group-4-title" class="sl-group__title">{{ GROUPS[3].label }}</h2>
            <p class="sl-group__desc">{{ GROUPS[3].description }}</p>
          </header>
          <EkDetailPanel v-show="cardShown(['alertEmail', 'supportPhone'])" title="Bildirim ve destek" icon="mdi-bell-ring-outline" flush>
            <SettingRow v-show="rowShown('alertEmail')" name="alertEmail" label="Hata Bildirim E-postası" for-id="sl-alertEmail"
              :description="row('alertEmail').description" :changed="changed('alertEmail')">
              <v-text-field id="sl-alertEmail" v-model="settings.alertEmail" clearable type="email" prepend-inner-icon="mdi-email-alert-outline" />
            </SettingRow>
            <SettingRow v-show="rowShown('supportPhone')" name="supportPhone" label="Müşteri Destek Telefonu" for-id="sl-supportPhone"
              :description="row('supportPhone').description" :changed="changed('supportPhone')">
              <v-text-field id="sl-supportPhone" v-model="settings.supportPhone" clearable inputmode="tel" prepend-inner-icon="mdi-headphones" />
            </SettingRow>
          </EkDetailPanel>
          <EkAlert v-show="!searching" tone="info" title="Entegrasyon sağlık durumu">
            Entegrasyonlarınızın anlık durumunu ve son hatalarını Entegrasyon sağlığı ekranından izleyebilirsiniz.
          </EkAlert>
        </section>

        <!-- Kaydetme durumu: sabit alt çubuk — değişiklik var mı, kaydedildi mi tek bakışta. -->
        <div class="sl-savebar" :class="{ 'is-dirty': isDirty }" role="region" aria-label="Kaydetme durumu">
          <p class="sl-savebar__state" aria-live="polite">
            <template v-if="isDirty">
              <v-icon icon="mdi-circle-medium" class="sl-savebar__icon is-dirty" aria-hidden="true" />
              <span><strong>Kaydedilmemiş değişiklik var</strong> · {{ dirtyGroupNames }}</span>
            </template>
            <template v-else>
              <v-icon icon="mdi-check-circle-outline" class="sl-savebar__icon" aria-hidden="true" />
              <span>{{ savedAt ? `Tüm değişiklikler kaydedildi · ${savedAt}` : 'Kaydedilmemiş değişiklik yok' }}</span>
            </template>
          </p>
          <div class="sl-savebar__actions">
            <EkButton v-if="isDirty" tone="secondary" @click="revertChanges">Vazgeç</EkButton>
            <!-- fe-polish: FR2 §2 tek kaydet standardı (intent="save": primary · kaydet ikonu). -->
            <EkButton intent="save" class="settingListView__save" @click="saveSettings">Ayarları Kaydet</EkButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EkAlert, EkStatusChip, EkButton, EkDetailPanel } from '@entegrasyonik/ui/components'
import SettingRow from '@/components/settings/SettingRow.vue'
import { formatDateTime } from '@entegrasyonik/ui/format'
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import { useStaticsStore } from '@/stores/staticsStore';
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore';

const restApi = useRestApi()
const snackbarStore = useSnackbarStore();
const activeTab = ref<GroupId>(1)
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

/**
 * FR3-14 — ayar kayıt defteri: grup, etiket, açıklama, arama anahtar kelimeleri ve değerin yolu (değişiklik izi).
 * Arama yalnız bu metinlerde yapılır; değişiklik "kaydedilen anlık görüntü" ile karşılaştırılarak bulunur.
 */
type GroupId = 1 | 2 | 3 | 4
const GROUPS: Array<{ value: GroupId; label: string; short: string; description: string; icon: string }> = [
  { value: 1, label: 'Mağaza Kimliği', short: 'Ad, renk, logo', description: 'Müşterilerin gördüğü mağaza adı, marka rengi ve logo.', icon: 'mdi-store-cog-outline' },
  { value: 2, label: 'Fatura & Yasal Bilgiler', short: 'Fatura kimliği, adres', description: 'Faturalarda ve yasal belgelerde basılan kimlik ve adres bilgileri.', icon: 'mdi-file-document-outline' },
  { value: 3, label: 'Lojistik & Operasyon', short: 'Varsayılanlar, takvim', description: 'Ürün ve gönderi varsayılanları, zaman dilimi ve çalışma günleri.', icon: 'mdi-truck-delivery-outline' },
  { value: 4, label: 'İletişim & Bildirimler', short: 'Hata e-postası, destek', description: 'Hata bildirimlerinin gideceği adres ve müşterilerinizin göreceği destek numarası.', icon: 'mdi-bell-ring-outline' },
]

interface SettingDef { group: GroupId; label: string; description?: string; keywords?: string; path: string; corporate?: boolean }
const ROWS: Record<string, SettingDef> = {
  storeName: { group: 1, label: 'Mağaza Adı', description: 'Müşterilere ve e-postalarda görünecek resmi mağaza adınız.', keywords: 'isim unvan', path: 'storeName' },
  brandColor: { group: 1, label: 'Mağaza Renk Paleti', description: 'Mağaza kimliğinizin rengi; önizlemede görünür. Paletten seçin ya da kendi renginizi girin.', keywords: 'renk marka tema', path: 'brandColor' },
  logo: { group: 1, label: 'Mağaza Logosu', description: 'Dosya yükleyin ya da doğrudan bir görsel bağlantısı yapıştırın.', keywords: 'logo görsel resim', path: 'logo' },
  invoiceType: { group: 2, label: 'Fatura tipi', description: 'Kurumsal seçildiğinde şirket bilgileri bölümü açılır.', keywords: 'bireysel kurumsal şahıs şirket', path: 'invoice.type' },
  firstname: { group: 2, label: 'İsim', keywords: 'ad', path: 'invoice.firstname' },
  lastname: { group: 2, label: 'Soyisim', keywords: 'soyad', path: 'invoice.lastname' },
  tckn: { group: 2, label: 'T.C. Kimlik No', description: 'Bireysel faturalarda basılır; 11 hane.', keywords: 'tckn kimlik', path: 'invoice.tckn' },
  invoicePhone: { group: 2, label: 'Fatura Telefon', keywords: 'telefon', path: 'invoice.phone' },
  companyName: { group: 2, label: 'Firma Ünvanı', keywords: 'şirket unvan', path: 'invoice.companyName', corporate: true },
  taxOffice: { group: 2, label: 'Vergi Dairesi', keywords: 'vergi', path: 'invoice.taxOffice', corporate: true },
  taxNumber: { group: 2, label: 'Vergi No', keywords: 'vkn vergi', path: 'invoice.taxNumber', corporate: true },
  mersisNo: { group: 2, label: 'MERSIS No', description: 'Hukuki belgelerde basılacaktır.', keywords: 'mersis', path: 'mersisNo', corporate: true },
  ticaretSicilNo: { group: 2, label: 'Ticaret Sicil No', description: 'Hukuki belgelerde basılacaktır.', keywords: 'sicil', path: 'ticaretSicilNo', corporate: true },
  address: { group: 2, label: 'Fatura Adresi', description: 'Faturada görünen açık adres.', keywords: 'adres', path: 'invoice.address' },
  city: { group: 2, label: 'İl', keywords: 'şehir adres', path: 'invoice.city' },
  district: { group: 2, label: 'İlçe', keywords: 'adres', path: 'invoice.district' },
  shippingDuration: { group: 3, label: 'Kargo Süresi (Gün)', description: 'Siparişi kargoya verme süreniz.', keywords: 'kargo gün teslim', path: 'shippingDuration' },
  desi: { group: 3, label: 'Varsayılan Desi (dm³)', description: 'Üründe desi yoksa kullanılan değer.', keywords: 'desi hacim kargo', path: 'desi' },
  taxPercentage: { group: 3, label: 'Varsayılan KDV Oranı', description: 'Yeni ürünlerde önerilen KDV oranı.', keywords: 'kdv vergi oran', path: 'taxPercentage' },
  warranty: { group: 3, label: 'Garanti Süresi (Ay)', description: 'Mağaza genelindeki garanti süresi.', keywords: 'garanti', path: 'warranty' },
  maxPurchaseQuantity: { group: 3, label: 'Maksimum Satış Adedi', description: 'Tek siparişte satılabilecek en fazla adet.', keywords: 'adet limit sınır', path: 'maxPurchaseQuantity' },
  timezone: { group: 3, label: 'Zaman Dilimi', description: 'Mağazanızın çalıştığı zaman dilimi.', keywords: 'saat dilim', path: 'timezone' },
  workingDays: { group: 3, label: 'Çalışma Günleri', description: 'Mağazanızın sipariş hazırlayıp kargoya verdiği günler.', keywords: 'gün tatil hafta', path: 'workingDays' },
  alertEmail: { group: 4, label: 'Hata Bildirim E-postası', description: 'Entegrasyon hata bildirimleri için iletişim adresiniz.', keywords: 'e-posta mail uyarı hata', path: 'alertEmail' },
  supportPhone: { group: 4, label: 'Müşteri Destek Telefonu', description: 'Müşterilerinizin göreceği iletişim numarası.', keywords: 'telefon destek', path: 'supportPhone' },
}
const row = (key: string) => ROWS[key]

const query = ref<string | null>('')
const norm = (v: string) => v.toLocaleLowerCase('tr').trim()
const searching = computed(() => !!query.value && norm(query.value).length > 0)
const hits = computed<Set<string>>(() => {
  if (!searching.value) return new Set()
  const q = norm(query.value as string)
  const corporate = settings.value?.invoice?.type === 1
  return new Set(Object.entries(ROWS).filter(([, d]) => (!d.corporate || corporate) && norm(`${d.label} ${d.description ?? ''} ${d.keywords ?? ''}`).includes(q)).map(([k]) => k))
})
const hitCount = computed(() => hits.value.size)
const hitsByGroup = computed(() => {
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  hits.value.forEach((k) => { out[ROWS[k].group]++ })
  return out
})
const hit = (key: string) => hits.value.has(key)
const rowShown = (key: string) => !searching.value || hit(key)
const cardShown = (keys: string[]) => keys.some(rowShown)
const groupShown = (g: GroupId) => (searching.value ? hitsByGroup.value[g] > 0 : activeTab.value === g)
const selectGroup = (g: GroupId) => { query.value = ''; activeTab.value = g }

// Değişiklik izi: son yüklenen/kaydedilen anlık görüntü ile karşılaştırma.
const snapshot = ref<string>('')
const valueAt = (obj: any, path: string) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
const savedState = computed(() => (snapshot.value ? JSON.parse(snapshot.value) : null))
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const changed = (key: string) => !!savedState.value && !same(valueAt(settings.value, ROWS[key].path), valueAt(savedState.value, ROWS[key].path))
const isDirty = computed(() => !!savedState.value && JSON.stringify(settings.value) !== snapshot.value)
const dirtyGroups = computed(() => new Set(Object.keys(ROWS).filter(changed).map((k) => ROWS[k].group)))
const dirtyGroupNames = computed(() => GROUPS.filter((g) => dirtyGroups.value.has(g.value)).map((g) => g.label).join(', ') || 'Ayarlar')
const savedAt = ref<string>('')
const takeSnapshot = () => { snapshot.value = JSON.stringify(settings.value) }
const revertChanges = () => { if (snapshot.value) settings.value = JSON.parse(snapshot.value) }

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
      savedAt.value = formatDateTime(new Date().toISOString())
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
    takeSnapshot()
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
  gap: var(--ek-space-5);
  padding: var(--ek-space-6) var(--ek-space-6) 0;
  max-width: 1200px;
  /* fe-polish: ortalanmıyor — başlık/breadcrumb diğer tüm ekranlarla aynı sol hizada. */
  margin: 0;
}

/* FR3-14: iki kolon — sol gezinme (yapışkan), sağ içerik + sabit kaydetme çubuğu. */
.sl-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: var(--ek-space-6);
  align-items: start;
}

.sl-nav {
  position: sticky;
  top: var(--ek-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.sl-nav__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sl-nav__item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid transparent;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.sl-nav__item:hover {
  background: var(--ek-color-surface-muted);
}

.sl-nav__item:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.sl-nav__item.is-active {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.sl-nav__icon {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
}

.sl-nav__item.is-active .sl-nav__icon {
  color: var(--ek-color-action);
}

.sl-nav__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.sl-nav__label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  font-weight: var(--ek-font-weight-semibold);
}

.sl-nav__desc {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.sl-nav__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action);
}

.sl-nav__count {
  flex: none;
  min-width: 22px;
  padding: 0 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  text-align: center;
}

.sl-content {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
  min-width: 0;
}

.sl-search-state {
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
}

.sl-group {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.sl-group__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sl-group__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.sl-group__desc {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.sl-identity {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--ek-space-4);
  align-items: start;
}

.sl-swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.sl-color-code {
  flex: 0 0 180px;
}

.sl-logo {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.sl-logo__mode {
  flex: none;
}

/* Kaydetme durumu çubuğu: içerik kolonunun altına yapışık; değişiklik varken aksiyon tonunda kenar. */
.sl-savebar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  margin: 0 0 var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  transition: var(--ek-transition-colors);
}

/* Değişiklik varken çubuk öne çıkar (aksiyon kenarı + yükseltilmiş gölge); temizken sakin. */
.sl-savebar.is-dirty {
  border-color: var(--ek-color-action-border);
  box-shadow: var(--ek-shadow-raised);
}

.sl-savebar__state {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.sl-savebar__state strong {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.sl-savebar__icon {
  flex: none;
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-icon-md);
}

.sl-savebar__icon.is-dirty {
  color: var(--ek-color-action);
}

.sl-savebar__actions {
  display: flex;
  flex: none;
  gap: var(--ek-space-2);
}

.settingListView__help {
  margin: var(--ek-space-2) 0 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.settingListView__overline {
  margin: 0;
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.settingListView__upload {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-card);
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
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
  overflow: hidden;
}

.settingListView__preview {
  position: sticky;
  top: var(--ek-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
}

.settingListView__preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settingListView__preview-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-4) var(--ek-space-4) var(--ek-space-5);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
  overflow: hidden;
}

.settingListView__preview-accent {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--ek-space-1);
  transition: var(--ek-transition-colors);
}

.settingListView__preview-text {
  min-width: 0;
}

.settingListView__preview-name {
  margin: 0;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}

.settingListView__verified {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.settingListView__days {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--ek-space-4);
}

.color-swatch-item {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  border: 2px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  transition: var(--ek-transition-colors);
}

.color-swatch-item:hover {
  border-color: var(--ek-color-border-strong);
  box-shadow: var(--ek-shadow-sm);
}

.color-swatch-item:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
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

@media (max-width: 1279px) {
  .sl-identity {
    grid-template-columns: minmax(0, 1fr);
  }

  .settingListView__preview {
    position: static;
  }
}

/* Dar ekran: gezinme üstte yatay şerit (kaydırılabilir), içerik tek kolon. */
@media (max-width: 959px) {
  .sl-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .sl-nav {
    position: static;
  }

  .sl-nav__list {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .sl-nav__item {
    flex: none;
    width: auto;
  }

  .sl-nav__desc {
    display: none;
  }
}

@media (max-width: 599px) {
  .settingListView {
    padding: var(--ek-space-4) var(--ek-space-4) 0;
  }

  .sl-savebar__state {
    font-size: var(--ek-type-caption-size);
    line-height: var(--ek-type-caption-line);
  }

  .settingListView__upload {
    flex-direction: column;
    text-align: center;
  }
}
</style>
