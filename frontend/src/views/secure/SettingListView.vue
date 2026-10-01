<!--
  frontend/src/views/secure/SettingListView.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN (bkz. e2e/specs/settings.spec.ts, Protokol 13). Davranış/API
  sözleşmesi DEĞİŞMEDİ: `SettingService/getSettings` ({}), `SettingService/updateSettings`
  ({ settings } — tüm nesne, iç içe `invoice` dahil), kayıt başarısında (`response._id`) yeniden
  yükleme + başarı bildirimi, `_id` yoksa hata bildirimi, logo yükleme (`postIdentityUpload`,
  `?t=` önbellek kırıcı), varsayılan saat dilimi/çalışma günü/marka rengi, kurumsal fatura
  alanlarının yalnız `invoice.type === 1` iken görünmesi AYNEN korundu.

  FE R4 C1 (K61) — baştan yeniden tasarım (e2e/specs/fe-r4c.spec.ts):
  - Sol kolon: arama + bölüm gezinmesi (durum: arama sayısı > hata sayısı > değişiklik noktası) + yapışkan canlı önizleme
    (`SettingsStorePreview`; dar ekranda kimlik bölümünde, tek kopya).
  - Bölüm = tek kart: başlık bandı (kapsül + başlık + "n değişiklik") + `fieldset` alt bölümler; alanlar 2 kolonlu ızgara,
    etiket üstte / açıklama altta (`SettingRow`).
  - Doğrulama (`settingsValidation.ts`, yalnız biçim; boş geçerli): hata alan odaktan çıkınca ya da kaydetmede görünür;
    geçersiz alan varken kayıt isteği GÖNDERİLMEZ, ilk hatalı alanın bölümü açılıp alana odaklanılır.
  - Kaydetme çubuğu durumları: temiz · kaydedildi · değişiklik var (bölümler + alan sayısı) · n alan düzeltilmeli ·
    kaydediliyor; Vazgeç · Ayarları kaydet · Ctrl/⌘+S (yalnız ekran görünürken).
  - Kirli form uyarısı: değişiklik varken sayfa yenileme/kapama tarayıcı onayı ister (`beforeunload`).
  - Renk örnekleri `<button>` (`aria-pressed`), `.color-swatch-item` spec seçicisi KORUNDU. Palet HEX değerleri kullanıcı
    VERİSİDİR (payload'a yazılır) — script'te aynen kalır.
-->
<template>
  <div ref="rootEl" class="settingListView">
    <EkPageHeader section="Ayarlar" title="Mağaza ayarları"
      description="Mağaza kimliği, fatura bilgileri, lojistik varsayılanları ve bildirim tercihleri." />
    <LoadingComponent attach=".settingListView" ref="loadingComponentRef"></LoadingComponent>

    <div v-if="settings" class="sl-layout" :style="{ '--sl-brand': settings.brandColor }">
      <!-- C1: sol kolon — arama + bölüm gezinmesi (dikey sekme listesi; durum: arama eşleşmesi > hata > değişiklik) + canlı önizleme. -->
      <div class="sl-side">
        <nav class="sl-nav" aria-label="Ayar bölümleri">
          <v-text-field v-model="query" class="sl-nav__search" prepend-inner-icon="mdi-magnify" placeholder="Ayarlarda ara…"
            aria-label="Ayarlarda ara" clearable hide-details autocomplete="off" spellcheck="false" @keydown.esc="query = ''" />
          <div class="sl-nav__list" role="tablist" aria-orientation="vertical" aria-label="Ayar bölümleri">
            <button v-for="g in GROUPS" :key="g.value" type="button" role="tab" class="sl-nav__item"
              :class="{ 'is-active': !searching && activeTab === g.value }"
              :aria-selected="!searching && activeTab === g.value" :aria-controls="`sl-group-${g.value}`" @click="selectGroup(g.value)">
              <span class="sl-nav__icon" aria-hidden="true"><v-icon :icon="g.icon" /></span>
              <span class="sl-nav__text">
                <span class="sl-nav__label">{{ g.label }}</span>
                <span class="sl-nav__desc">{{ g.short }}</span>
              </span>
              <span v-if="searching && hitsByGroup[g.value]" class="sl-nav__count ek-num">{{ hitsByGroup[g.value] }}</span>
              <span v-else-if="errorsByGroup[g.value]" class="sl-nav__errors ek-num">{{ errorsByGroup[g.value] }}<span class="ek-sr-only"> alan düzeltilmeli</span></span>
              <span v-else-if="dirtyGroups.has(g.value)" class="sl-nav__dot" title="Kaydedilmemiş değişiklik var"><span class="ek-sr-only">Kaydedilmemiş değişiklik var</span></span>
            </button>
          </div>
        </nav>
        <SettingsStorePreview v-if="wideLayout" class="sl-side__preview" :store-name="settings.storeName" :logo="settings.logo" :brand-color="settings.brandColor" />
      </div>

      <div class="sl-content">
        <p v-if="searching" class="sl-search-state" role="status">
          <v-icon icon="mdi-text-search" aria-hidden="true" />
          <span v-if="hitCount"><strong class="ek-num">{{ hitCount }}</strong> ayar “{{ query }}” ile eşleşti.</span>
          <span v-else>“{{ query }}” ile eşleşen ayar yok. Farklı bir kelime deneyin ya da aramayı temizleyin.</span>
        </p>

        <!-- 1 · Mağaza kimliği -->
        <section v-show="groupShown(1)" :id="'sl-group-1'" class="sl-group" role="tabpanel" aria-labelledby="sl-group-1-title">
          <header class="sl-group__head">
            <span class="sl-group__icon" aria-hidden="true"><v-icon :icon="GROUPS[0].icon" /></span>
            <div class="sl-group__titles">
              <h2 id="sl-group-1-title" class="sl-group__title">{{ GROUPS[0].label }}</h2>
              <p class="sl-group__desc">{{ GROUPS[0].description }}</p>
            </div>
            <span v-if="changedCount(1)" class="sl-group__badge ek-num">{{ changedCount(1) }} değişiklik</span>
          </header>
          <fieldset v-show="cardShown(['storeName', 'brandColor', 'logo'])" class="sl-sub">
            <legend class="sl-sub__title"><v-icon icon="mdi-store-outline" aria-hidden="true" />Ad ve görünüm</legend>
            <div class="sl-fields">
              <SettingRow v-show="rowShown('storeName')" name="storeName" label="Mağaza adı" for-id="sl-storeName" wide
                :description="row('storeName').description" :changed="changed('storeName')">
                <v-text-field id="sl-storeName" v-model="settings.storeName" class="sl-input--medium" clearable maxlength="128"
                  autocomplete="organization" />
              </SettingRow>
              <SettingRow v-show="rowShown('brandColor')" name="brandColor" label="Mağaza renk paleti" wide
                :description="row('brandColor').description" :changed="changed('brandColor')">
                <div class="sl-swatches">
                  <div class="sl-swatches__list">
                    <button v-for="color in premiumPalettes" :key="color.hex" type="button" class="color-swatch-item"
                      :class="{ 'active': settings.brandColor === color.hex }"
                      :style="{ backgroundColor: color.hex }" :aria-label="color.name"
                      :aria-pressed="settings.brandColor === color.hex" @click="settings.brandColor = color.hex">
                      <v-tooltip activator="parent" location="top" :eager="false">{{ color.name }}</v-tooltip>
                      <v-icon v-if="settings.brandColor === color.hex" class="color-swatch-item__check" size="18" aria-hidden="true">mdi-check</v-icon>
                    </button>
                    <v-menu :close-on-content-click="false" location="top">
                      <template v-slot:activator="{ props }">
                        <button v-bind="props" type="button" class="color-swatch-item custom-picker-trigger" aria-label="Özel Renk">
                          <v-icon size="20" aria-hidden="true">mdi-eyedropper-variant</v-icon>
                          <v-tooltip activator="parent" location="top" :eager="false">Özel Renk</v-tooltip>
                        </button>
                      </template>
                      <v-card min-width="300" class="settingListView__picker">
                        <v-color-picker v-model="settings.brandColor" hide-inputs show-swatches flat mode="hex"></v-color-picker>
                      </v-card>
                    </v-menu>
                  </div>
                  <v-text-field id="sl-brandColor" v-model="settings.brandColor" label="Seçili renk kodu" class="sl-color-code" prepend-inner-icon="mdi-pound"
                    autocomplete="off" spellcheck="false" v-bind="fieldState('brandColor')" />
                </div>
              </SettingRow>
              <SettingRow v-show="rowShown('logo')" name="logo" label="Mağaza logosu" wide
                :description="row('logo').description" :changed="changed('logo')">
                <div class="sl-logo">
                  <div class="sl-logo__mode">
                    <v-switch v-model="useLogoUrl" label="URL kullan" color="primary" density="compact" hide-details inset />
                  </div>
                  <div v-if="!useLogoUrl" class="settingListView__upload">
                    <v-avatar size="64" rounded="lg" class="settingListView__avatar">
                      <v-img v-if="settings.logo" :src="settings.logo" cover alt="Mevcut mağaza logosu">
                        <template v-slot:placeholder><v-skeleton-loader type="image" /></template>
                      </v-img>
                      <v-icon v-else size="26" class="settingListView__avatar-icon" aria-hidden="true">mdi-image-plus-outline</v-icon>
                    </v-avatar>
                    <div class="settingListView__upload-text">
                      <p class="settingListView__upload-title">{{ settings.logo ? 'Logo yüklü' : 'Henüz logo yok' }}</p>
                      <p class="settingListView__help">Resmi mağaza logonuzu buradan yükleyebilirsiniz. Kare, en az 256 px önerilir.</p>
                    </div>
                    <EkButton tone="secondary" size="sm" icon="mdi-upload-outline" class="settingListView__upload-btn" @click="logoInput?.click()">{{ settings.logo ? 'Logoyu Değiştir' : 'Logo seç' }}</EkButton>
                    <input type="file" ref="logoInput" class="d-none" accept="image/*" @change="onLogoFileChange($event)" />
                  </div>
                  <v-text-field v-else id="sl-logo" v-model="settings.logo" clearable maxlength="512" placeholder="https://example.com/logo.png"
                    aria-label="Logo bağlantısı" prepend-inner-icon="mdi-link-variant" type="url" inputmode="url" autocomplete="off" spellcheck="false"
                    hint="Doğrudan bir görsel bağlantısı yapıştırmak için kullanın." persistent-hint v-bind="fieldState('logo')" />
                </div>
              </SettingRow>
            </div>
          </fieldset>
          <SettingsStorePreview v-if="!wideLayout" v-show="!searching" class="sl-group__preview" :store-name="settings.storeName" :logo="settings.logo" :brand-color="settings.brandColor" />
        </section>

        <!-- 2 · Fatura & yasal bilgiler -->
        <section v-show="groupShown(2)" :id="'sl-group-2'" class="sl-group" role="tabpanel" aria-labelledby="sl-group-2-title">
          <header class="sl-group__head">
            <span class="sl-group__icon" aria-hidden="true"><v-icon :icon="GROUPS[1].icon" /></span>
            <div class="sl-group__titles">
              <h2 id="sl-group-2-title" class="sl-group__title">{{ GROUPS[1].label }}</h2>
              <p class="sl-group__desc">{{ GROUPS[1].description }}</p>
            </div>
            <span v-if="changedCount(2)" class="sl-group__badge ek-num">{{ changedCount(2) }} değişiklik</span>
          </header>
          <fieldset v-show="cardShown(['invoiceType', 'firstname', 'lastname', 'tckn', 'invoicePhone'])" class="sl-sub">
            <legend class="sl-sub__title"><v-icon icon="mdi-card-account-details-outline" aria-hidden="true" />Fatura kimliği</legend>
            <div class="sl-fields">
              <SettingRow v-show="rowShown('invoiceType')" name="invoiceType" label="Fatura tipi" label-id="sl-invoiceType" wide
                :description="row('invoiceType').description" :changed="changed('invoiceType')">
                <v-radio-group v-model="settings.invoice.type" inline hide-details aria-labelledby="sl-invoiceType" class="sl-segment">
                  <v-radio :value="0" :label="$t('customers.customer.new.real')" color="primary" />
                  <v-radio :value="1" :label="$t('customers.customer.new.corporate')" color="primary" />
                </v-radio-group>
              </SettingRow>
              <SettingRow v-show="rowShown('firstname')" name="firstname" label="İsim" for-id="sl-firstname" :changed="changed('firstname')">
                <v-text-field id="sl-firstname" v-model="settings.invoice.firstname" clearable autocomplete="given-name" />
              </SettingRow>
              <SettingRow v-show="rowShown('lastname')" name="lastname" label="Soyisim" for-id="sl-lastname" :changed="changed('lastname')">
                <v-text-field id="sl-lastname" v-model="settings.invoice.lastname" clearable autocomplete="family-name" />
              </SettingRow>
              <SettingRow v-show="rowShown('tckn')" name="tckn" label="T.C. Kimlik No" for-id="sl-tckn"
                :description="row('tckn').description" :changed="changed('tckn')">
                <v-text-field id="sl-tckn" v-model="settings.invoice.tckn" clearable maxlength="11" inputmode="numeric" autocomplete="off" spellcheck="false"
                  v-bind="fieldState('tckn')" />
              </SettingRow>
              <SettingRow v-show="rowShown('invoicePhone')" name="invoicePhone" label="Fatura Telefon" for-id="sl-invoicePhone" :changed="changed('invoicePhone')">
                <v-text-field id="sl-invoicePhone" v-model="settings.invoice.phone" clearable type="tel" inputmode="tel" autocomplete="tel"
                  v-bind="fieldState('invoicePhone')" />
              </SettingRow>
            </div>
          </fieldset>

          <fieldset v-if="settings.invoice.type === 1" v-show="cardShown(['companyName', 'taxOffice', 'taxNumber', 'mersisNo', 'ticaretSicilNo'])" class="sl-sub">
            <legend class="sl-sub__title"><v-icon icon="mdi-domain" aria-hidden="true" />Şirket bilgileri <span class="sl-sub__note">Yalnız kurumsal fatura tipinde</span></legend>
            <div class="sl-fields">
              <SettingRow v-show="rowShown('companyName')" name="companyName" label="Firma Ünvanı" for-id="sl-companyName" wide :changed="changed('companyName')">
                <v-text-field id="sl-companyName" v-model="settings.invoice.companyName" clearable autocomplete="organization" />
              </SettingRow>
              <SettingRow v-show="rowShown('taxOffice')" name="taxOffice" label="Vergi Dairesi" for-id="sl-taxOffice" :changed="changed('taxOffice')">
                <v-text-field id="sl-taxOffice" v-model="settings.invoice.taxOffice" clearable autocomplete="off" />
              </SettingRow>
              <SettingRow v-show="rowShown('taxNumber')" name="taxNumber" label="Vergi No" for-id="sl-taxNumber" :changed="changed('taxNumber')">
                <v-text-field id="sl-taxNumber" v-model="settings.invoice.taxNumber" clearable inputmode="numeric" autocomplete="off" spellcheck="false"
                  v-bind="fieldState('taxNumber')" />
              </SettingRow>
              <SettingRow v-show="rowShown('mersisNo')" name="mersisNo" label="MERSIS No" for-id="sl-mersisNo"
                :description="row('mersisNo').description" :changed="changed('mersisNo')">
                <v-text-field id="sl-mersisNo" v-model="settings.mersisNo" clearable inputmode="numeric" autocomplete="off" spellcheck="false"
                  v-bind="fieldState('mersisNo')" />
              </SettingRow>
              <SettingRow v-show="rowShown('ticaretSicilNo')" name="ticaretSicilNo" label="Ticaret Sicil No" for-id="sl-ticaretSicilNo"
                :description="row('ticaretSicilNo').description" :changed="changed('ticaretSicilNo')">
                <v-text-field id="sl-ticaretSicilNo" v-model="settings.ticaretSicilNo" clearable autocomplete="off" spellcheck="false" />
              </SettingRow>
            </div>
          </fieldset>

          <fieldset v-show="cardShown(['address', 'city', 'district'])" class="sl-sub">
            <legend class="sl-sub__title"><v-icon icon="mdi-map-marker-outline" aria-hidden="true" />Fatura adresi</legend>
            <div class="sl-fields">
              <SettingRow v-show="rowShown('address')" name="address" label="Fatura Adresi" for-id="sl-address" wide
                :description="row('address').description" :changed="changed('address')">
                <v-textarea id="sl-address" v-model="settings.invoice.address" clearable rows="2" auto-grow autocomplete="street-address" />
              </SettingRow>
              <SettingRow v-show="rowShown('city')" name="city" label="İl" for-id="sl-city" :changed="changed('city')">
                <v-select id="sl-city" v-model="settings.invoice.city" :items="staticsStore.cities" clearable aria-label="İl" />
              </SettingRow>
              <SettingRow v-show="rowShown('district')" name="district" label="İlçe" for-id="sl-district" :changed="changed('district')">
                <v-text-field id="sl-district" v-model="settings.invoice.district" clearable autocomplete="address-level2" />
              </SettingRow>
            </div>
          </fieldset>
        </section>

        <!-- 3 · Lojistik & operasyon -->
        <section v-show="groupShown(3)" :id="'sl-group-3'" class="sl-group" role="tabpanel" aria-labelledby="sl-group-3-title">
          <header class="sl-group__head">
            <span class="sl-group__icon" aria-hidden="true"><v-icon :icon="GROUPS[2].icon" /></span>
            <div class="sl-group__titles">
              <h2 id="sl-group-3-title" class="sl-group__title">{{ GROUPS[2].label }}</h2>
              <p class="sl-group__desc">{{ GROUPS[2].description }}</p>
            </div>
            <span v-if="changedCount(3)" class="sl-group__badge ek-num">{{ changedCount(3) }} değişiklik</span>
          </header>
          <fieldset v-show="cardShown(['shippingDuration', 'desi', 'taxPercentage', 'warranty', 'maxPurchaseQuantity'])" class="sl-sub">
            <legend class="sl-sub__title"><v-icon icon="mdi-package-variant-closed" aria-hidden="true" />Ürün ve gönderi varsayılanları
              <span class="sl-sub__note">Boş bırakılan alanda platform varsayılanı geçerlidir</span></legend>
            <div class="sl-fields">
              <SettingRow v-show="rowShown('shippingDuration')" name="shippingDuration" label="Kargo Süresi (Gün)" for-id="sl-shippingDuration"
                :changed="changed('shippingDuration')">
                <template #description>Siparişi kargoya verme süreniz. <span class="ek-num">(Varsayılan: {{ computedDefaultShipingDuration }})</span></template>
                <v-text-field id="sl-shippingDuration" v-model.number="settings.shippingDuration" type="number" min="0" clearable suffix="gün"
                  v-bind="fieldState('shippingDuration')" />
              </SettingRow>
              <SettingRow v-show="rowShown('desi')" name="desi" label="Varsayılan Desi (dm³)" for-id="sl-desi" :changed="changed('desi')">
                <template #description>Üründe desi yoksa kullanılan değer. <span class="ek-num">(Varsayılan: {{ computedDefaultDesi }})</span></template>
                <v-text-field id="sl-desi" v-model.number="settings.desi" type="number" min="0" clearable suffix="dm³" v-bind="fieldState('desi')" />
              </SettingRow>
              <SettingRow v-show="rowShown('taxPercentage')" name="taxPercentage" label="Varsayılan KDV Oranı" for-id="sl-taxPercentage"
                :description="row('taxPercentage').description" :changed="changed('taxPercentage')">
                <v-select id="sl-taxPercentage" v-model.number="settings.taxPercentage" item-value="_id" :items="taxList" aria-label="Varsayılan KDV Oranı" prefix="%" />
              </SettingRow>
              <SettingRow v-show="rowShown('warranty')" name="warranty" label="Garanti Süresi (Ay)" for-id="sl-warranty" :changed="changed('warranty')">
                <template #description>Mağaza genelindeki garanti süresi. <span class="ek-num">(Varsayılan: {{ computedDefaultWarranty }})</span></template>
                <v-text-field id="sl-warranty" v-model.number="settings.warranty" type="number" min="0" clearable suffix="ay" v-bind="fieldState('warranty')" />
              </SettingRow>
              <SettingRow v-show="rowShown('maxPurchaseQuantity')" name="maxPurchaseQuantity" label="Maksimum Satış Adedi" for-id="sl-maxPurchaseQuantity"
                :changed="changed('maxPurchaseQuantity')">
                <template #description>Tek siparişte satılabilecek en fazla adet. <span class="ek-num">(Varsayılan: {{ computedDefaultMaxPurchaseQuantity }})</span></template>
                <v-text-field id="sl-maxPurchaseQuantity" v-model.number="settings.maxPurchaseQuantity" type="number" min="0" clearable suffix="adet"
                  v-bind="fieldState('maxPurchaseQuantity')" />
              </SettingRow>
            </div>
          </fieldset>

          <fieldset v-show="cardShown(['timezone', 'workingDays'])" class="sl-sub">
            <legend class="sl-sub__title"><v-icon icon="mdi-calendar-clock-outline" aria-hidden="true" />Çalışma takvimi</legend>
            <div class="sl-fields">
              <SettingRow v-show="rowShown('timezone')" name="timezone" label="Zaman Dilimi" for-id="sl-timezone"
                :description="row('timezone').description" :changed="changed('timezone')">
                <v-select id="sl-timezone" v-model="settings.timezone" :items="timezones" aria-label="Zaman Dilimi" />
              </SettingRow>
              <SettingRow v-show="rowShown('workingDays')" name="workingDays" label="Çalışma Günleri" wide
                :description="row('workingDays').description" :changed="changed('workingDays')" :error="errorOf('workingDays')">
                <div class="settingListView__days" role="group" aria-label="Çalışma Günleri">
                  <v-checkbox v-for="day in weekDays" :key="day.id" v-model="settings.workingDays" :label="day.name"
                    :value="day.id" density="compact" hide-details color="primary" class="sl-day" />
                </div>
              </SettingRow>
            </div>
          </fieldset>
        </section>

        <!-- 4 · İletişim & bildirimler -->
        <section v-show="groupShown(4)" :id="'sl-group-4'" class="sl-group" role="tabpanel" aria-labelledby="sl-group-4-title">
          <header class="sl-group__head">
            <span class="sl-group__icon" aria-hidden="true"><v-icon :icon="GROUPS[3].icon" /></span>
            <div class="sl-group__titles">
              <h2 id="sl-group-4-title" class="sl-group__title">{{ GROUPS[3].label }}</h2>
              <p class="sl-group__desc">{{ GROUPS[3].description }}</p>
            </div>
            <span v-if="changedCount(4)" class="sl-group__badge ek-num">{{ changedCount(4) }} değişiklik</span>
          </header>
          <fieldset v-show="cardShown(['alertEmail', 'supportPhone'])" class="sl-sub">
            <legend class="sl-sub__title"><v-icon icon="mdi-bell-ring-outline" aria-hidden="true" />Bildirim ve destek</legend>
            <div class="sl-fields">
              <SettingRow v-show="rowShown('alertEmail')" name="alertEmail" label="Hata Bildirim E-postası" for-id="sl-alertEmail"
                :description="row('alertEmail').description" :changed="changed('alertEmail')">
                <v-text-field id="sl-alertEmail" v-model="settings.alertEmail" clearable type="email" inputmode="email" autocomplete="email" spellcheck="false"
                  prepend-inner-icon="mdi-email-alert-outline" v-bind="fieldState('alertEmail')" />
              </SettingRow>
              <SettingRow v-show="rowShown('supportPhone')" name="supportPhone" label="Müşteri Destek Telefonu" for-id="sl-supportPhone"
                :description="row('supportPhone').description" :changed="changed('supportPhone')">
                <v-text-field id="sl-supportPhone" v-model="settings.supportPhone" clearable type="tel" inputmode="tel" autocomplete="tel"
                  prepend-inner-icon="mdi-headphones" v-bind="fieldState('supportPhone')" />
              </SettingRow>
            </div>
            <EkAlert v-show="!searching" tone="info" title="Entegrasyon sağlık durumu" class="sl-sub__alert">
              Entegrasyonlarınızın anlık durumunu ve son hatalarını Entegrasyon sağlığı ekranından izleyebilirsiniz.
            </EkAlert>
          </fieldset>
        </section>

        <!-- Kaydetme durumu: içerik kolonunun altına yapışık. Durumlar: temiz · kaydedildi · değişiklik var · hata var · kaydediliyor. -->
        <div class="sl-savebar" data-ek-sticky-bottom :class="{ 'is-dirty': isDirty, 'is-invalid': shownErrorCount > 0 }" role="region" aria-label="Kaydetme durumu">
          <div class="sl-savebar__state" aria-live="polite">
            <template v-if="saving">
              <span class="sl-savebar__pulse" aria-hidden="true"></span>
              <span><strong>Kaydediliyor…</strong></span>
            </template>
            <template v-else-if="shownErrorCount">
              <v-icon icon="mdi-alert-circle-outline" class="sl-savebar__icon is-invalid" aria-hidden="true" />
              <span><strong class="ek-num">{{ shownErrorCount }} alan düzeltilmeli</strong> · Kaydetmeden önce işaretli alanları düzeltin.</span>
            </template>
            <template v-else-if="isDirty">
              <span class="sl-savebar__pulse" aria-hidden="true"></span>
              <span><strong>Kaydedilmemiş değişiklik var</strong> · {{ dirtyGroupNames }}<span class="sl-savebar__count ek-num"> ({{ changedKeys.length }} alan)</span></span>
            </template>
            <template v-else>
              <v-icon icon="mdi-check-circle-outline" class="sl-savebar__icon" aria-hidden="true" />
              <span>{{ savedAt ? `Tüm değişiklikler kaydedildi · ${savedAt}` : 'Kaydedilmemiş değişiklik yok' }}</span>
            </template>
          </div>
          <div class="sl-savebar__actions">
            <EkButton v-if="shownErrorCount" tone="ghost" icon="mdi-arrow-down-circle-outline" @click="goToFirstError">İlk hataya git</EkButton>
            <EkButton v-if="isDirty" tone="secondary" :disabled="saving" @click="revertChanges">Vazgeç</EkButton>
            <!-- fe-polish: FR2 §2 tek kaydet standardı (intent="save": primary · kaydet ikonu). -->
            <EkButton intent="save" class="settingListView__save" :loading="saving" @click="saveSettings">Ayarları kaydet</EkButton>
            <span class="sl-savebar__kbd" aria-hidden="true"><EkKbd :keys="['Ctrl', 'S']" /></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EkAlert, EkButton, EkKbd } from '@entegrasyonik/ui/components'
import SettingRow from '@/components/settings/SettingRow.vue'
import SettingsStorePreview from '@/components/settings/SettingsStorePreview.vue'
import { validateSettings } from '@/components/settings/settingsValidation'
import { formatDateTime } from '@entegrasyonik/ui/format'
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { useDisplay } from 'vuetify'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
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
  { value: 1, label: 'Mağaza kimliği', short: 'Ad, renk, logo', description: 'Müşterilerin gördüğü mağaza adı, marka rengi ve logo.', icon: 'mdi-store-cog-outline' },
  { value: 2, label: 'Fatura ve yasal bilgiler', short: 'Fatura kimliği, adres', description: 'Faturalarda ve yasal belgelerde basılan kimlik ve adres bilgileri.', icon: 'mdi-file-document-outline' },
  { value: 3, label: 'Lojistik ve operasyon', short: 'Varsayılanlar, takvim', description: 'Ürün ve gönderi varsayılanları, zaman dilimi ve çalışma günleri.', icon: 'mdi-truck-delivery-outline' },
  { value: 4, label: 'İletişim ve bildirimler', short: 'Hata e-postası, destek', description: 'Hata bildirimlerinin gideceği adres ve müşterilerinizin göreceği destek numarası.', icon: 'mdi-bell-ring-outline' },
]

interface SettingDef { group: GroupId; label: string; description?: string; keywords?: string; path: string; corporate?: boolean }
const ROWS: Record<string, SettingDef> = {
  storeName: { group: 1, label: 'Mağaza adı', description: 'Müşterilere ve e-postalarda görünecek resmi mağaza adınız.', keywords: 'isim unvan', path: 'storeName' },
  brandColor: { group: 1, label: 'Mağaza renk paleti', description: 'Mağaza kimliğinizin rengi; önizlemede görünür. Paletten seçin ya da kendi renginizi girin.', keywords: 'renk marka tema', path: 'brandColor' },
  logo: { group: 1, label: 'Mağaza logosu', description: 'Dosya yükleyin ya da doğrudan bir görsel bağlantısı yapıştırın.', keywords: 'logo görsel resim', path: 'logo' },
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
const revertChanges = () => {
  if (snapshot.value) settings.value = JSON.parse(snapshot.value)
  resetValidation()
}
const changedKeys = computed(() => Object.keys(ROWS).filter(changed))
const changedCount = (g: GroupId) => changedKeys.value.filter((k) => ROWS[k].group === g).length

/**
 * C1 (K61) — doğrulama: yalnız biçim (`settingsValidation.ts`). Hata, alan bir kez odaktan çıkınca ya da kaydetme
 * denendiğinde görünür (yazarken erken kırmızı yok); gün kutuları değiştiği anda. Geçersiz alan varken istek GÖNDERİLMEZ.
 */
const errors = computed(() => validateSettings(settings.value, { useLogoUrl: useLogoUrl.value }))
const touched = ref<Set<string>>(new Set())
const submitted = ref(false)
const touch = (key: string) => { if (!touched.value.has(key)) touched.value = new Set(touched.value).add(key) }
const errorOf = (key: string): string => {
  const msg = errors.value[key]
  if (!msg) return ''
  return submitted.value || touched.value.has(key) || (key === 'workingDays' && changed(key)) ? msg : ''
}
/** Vuetify alanına hata metni + odak kaybında "dokunuldu" işareti. */
const fieldState = (key: string) => ({
  errorMessages: errorOf(key) || undefined,
  'onUpdate:focused': (focused: boolean) => { if (!focused) touch(key) },
})
const shownErrorKeys = computed(() => Object.keys(ROWS).filter((k) => !!errorOf(k)))
const shownErrorCount = computed(() => shownErrorKeys.value.length)
const errorsByGroup = computed(() => {
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  shownErrorKeys.value.forEach((k) => { out[ROWS[k].group]++ })
  return out
})
const resetValidation = () => { submitted.value = false; touched.value = new Set() }

const rootEl = ref<HTMLElement | null>(null)
/** İlk hatalı alanın bölümünü açar, alanı görünür yapıp odaklar. */
const goToFirstError = async () => {
  const key = Object.keys(ROWS).find((k) => errors.value[k])
  if (!key) return
  query.value = ''
  activeTab.value = ROWS[key].group
  await nextTick()
  const el = rootEl.value?.querySelector<HTMLElement>(`[data-setting="${key}"] input:not([type="hidden"]), [data-setting="${key}"] textarea`)
  el?.scrollIntoView?.({ block: 'center' })
  el?.focus({ preventScroll: true })
}

/** Geniş düzen (≥960): önizleme sol kolonda yapışık; dar düzende kimlik bölümünde. Tek kopya render edilir. */
const { mdAndUp: wideLayout } = useDisplay()
const saving = ref(false)

/**
 * Kirli form uyarısı: değişiklik varken sayfa yenilenir/kapanırsa tarayıcı onay ister. `main.ts` `onbeforeunload`
 * uygulamayı unmount etmeden önce bu kayda danışır (`useUnsavedChanges`). Çalışma alanı sekmesini kapatma koruması
 * kabuk değişikliği ister — REPORT.md önerisi.
 */
useUnsavedChanges(() => isDirty.value)
/** Ctrl/⌘+S — yalnız bu ekran görünürken (sekme arka plandayken başka ekranın kısayolunu çalmaz). */
const onKeydown = (e: KeyboardEvent) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return
  if (!rootEl.value || rootEl.value.offsetParent === null) return
  e.preventDefault()
  if (!saving.value) saveSettings()
}

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
  if (Object.keys(errors.value).length) {
    submitted.value = true
    await goToFirstError()
    return
  }
  let guid = loadingComponentRef.value.info(t('loading.info.closeTicket'))
  saving.value = true
  try {
    let response = await restApi.post("SettingService/updateSettings", { settings: settings.value })
    loadingComponentRef.value.remove(guid)
    if (response?._id) {
      await getSettings()
      resetValidation()
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
  } finally {
    saving.value = false
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
  window.addEventListener('keydown', onKeydown)
  getSettings()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.settingListView {
  position: relative; /* LoadingComponent overlay (attach) için */
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  padding: var(--ek-space-6) var(--ek-space-6) 0;
  max-width: 1240px;
  /* fe-polish: ortalanmıyor — başlık/breadcrumb diğer tüm ekranlarla aynı sol hizada. */
  margin: 0;
}

/* C1: iki kolon — sol (gezinme + önizleme, yapışkan), sağ (bölüm kartı + yapışık kaydetme çubuğu). */
.sl-layout {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  gap: var(--ek-space-6);
  align-items: start;
}

.sl-side {
  position: sticky;
  top: var(--ek-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}

.sl-nav {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.sl-nav__search {
  margin-bottom: var(--ek-space-1);
}

.sl-nav__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sl-nav__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 52px;
  padding: var(--ek-space-2) var(--ek-space-3) var(--ek-space-2) var(--ek-space-2);
  border: 0;
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

/* Etkin bölüm — sol menüyle aynı dil: seçili zemin + 3px aksiyon göstergesi. */
.sl-nav__item.is-active {
  background: var(--ek-color-action-subtle);
}

.sl-nav__item.is-active::before {
  content: '';
  position: absolute;
  inset: var(--ek-space-2) auto var(--ek-space-2) 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--ek-color-action);
}

.sl-nav__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
  transition: var(--ek-transition-colors);
}

.sl-nav__icon .v-icon {
  font-size: var(--ek-icon-md);
}

.sl-nav__item.is-active .sl-nav__icon {
  background: var(--ek-color-surface);
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
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.sl-nav__item.is-active .sl-nav__label {
  color: var(--ek-color-action-emphasis);
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
  box-shadow: 0 0 0 3px var(--ek-color-action-subtle);
}

.sl-nav__count,
.sl-nav__errors {
  flex: none;
  min-width: 22px;
  padding: 0 6px;
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-type-caption-size);
  line-height: 20px;
  font-weight: var(--ek-font-weight-semibold);
  text-align: center;
}

.sl-nav__count {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.sl-nav__errors {
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.sl-content {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  min-width: 0;
}

.sl-search-state {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
}

.sl-search-state .v-icon {
  color: var(--ek-color-action);
  font-size: var(--ek-icon-md);
}

/* Bölüm = tek kart: başlık bandı + alt bölümler (fieldset) — alt bölümler ince ayraçla ayrılır. */
.sl-group {
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.sl-group__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-5) var(--ek-space-6);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.sl-group__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
  font-size: var(--ek-icon-xl);
}

.sl-group__icon .v-icon {
  font-size: inherit;
}

.sl-group__titles {
  flex: 1;
  min-width: 0;
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

.sl-group__badge {
  flex: none;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: 22px;
  font-weight: var(--ek-font-weight-semibold);
}

.sl-sub {
  min-width: 0;
  margin: 0;
  padding: var(--ek-space-5) var(--ek-space-6) var(--ek-space-6);
  border: 0;
}

.sl-sub + .sl-sub {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.sl-sub__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  float: left; /* legend'i fieldset akışına alır (kenarlık kesmesi yok) */
  width: 100%;
  margin: 0 0 var(--ek-space-4);
  padding: 0;
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.sl-sub__title .v-icon {
  font-size: var(--ek-icon-sm);
}

.sl-sub__title + * {
  clear: both;
}

.sl-sub__note {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
  letter-spacing: 0;
  text-transform: none;
  font-size: var(--ek-type-caption-size);
}

.sl-sub__alert {
  margin-top: var(--ek-space-5);
}

/* Alan ızgarası: 2 eşit kolon, geniş alanlar (`wide`) tam satır; dar ekranda tek kolon. */
.sl-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-5) var(--ek-space-5);
}

.sl-input--medium {
  max-width: 520px;
}

.sl-group__preview {
  margin: 0 var(--ek-space-6) var(--ek-space-6);
}

.sl-swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3) var(--ek-space-4);
}

.sl-swatches__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-sunken);
}

.sl-color-code {
  flex: 0 0 200px;
}

.sl-logo {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.sl-logo__mode {
  display: flex;
}

/* Gün seçimi — her gün bir kutucuk; işaretli gün aksiyon tonunda. Denetim `v-checkbox` (etiket + kutu tek hedef). */
.settingListView__days {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.sl-day {
  flex: none;
  padding: 0 var(--ek-space-3) 0 var(--ek-space-1);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  transition: var(--ek-transition-colors);
}

.sl-day:has(input:checked) {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.sl-day:has(input:focus-visible) {
  box-shadow: var(--ek-focus-ring);
}

[data-setting='workingDays'].srow--error .sl-day {
  border-color: var(--ek-color-error-border);
}

/* Kaydetme durumu çubuğu: içerik kolonunun altına yapışık; değişiklik/hata varken öne çıkar. */
.sl-savebar {
  position: sticky;
  bottom: var(--ek-space-3);
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  margin: 0 0 var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-3) var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  transition: var(--ek-transition-colors);
}

.sl-savebar.is-dirty {
  border-color: var(--ek-color-action-border);
  box-shadow: var(--ek-shadow-raised);
}

.sl-savebar.is-invalid {
  border-color: var(--ek-color-error-border);
  box-shadow: var(--ek-shadow-raised);
}

.sl-savebar__state {
  display: flex;
  flex: 1 1 260px;
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

.sl-savebar__icon.is-invalid {
  color: var(--ek-color-error-emphasis);
}

.sl-savebar.is-invalid .sl-savebar__state strong {
  color: var(--ek-color-error-emphasis);
}

.sl-savebar__pulse {
  flex: none;
  width: 10px;
  height: 10px;
  margin: 0 var(--ek-space-1);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action);
  box-shadow: 0 0 0 4px var(--ek-color-action-subtle);
}

.sl-savebar__count {
  color: var(--ek-color-content-muted);
}

.sl-savebar__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
}

.sl-savebar__kbd {
  display: inline-flex;
  margin-left: var(--ek-space-1);
}

.settingListView__help {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.settingListView__upload {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4);
  background: var(--ek-color-surface-sunken);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-card);
}

.settingListView__upload-text {
  flex: 1;
  min-width: 0;
}

.settingListView__upload-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.settingListView__upload-btn {
  flex: none;
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

.color-swatch-item {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: var(--ek-radius-control);
  transition: var(--ek-transition-colors);
}

.color-swatch-item:hover {
  border-color: var(--ek-color-border-strong);
}

.color-swatch-item:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.color-swatch-item.active {
  border-color: var(--ek-color-surface);
  box-shadow: 0 0 0 2px var(--ek-color-action);
}

.color-swatch-item__check {
  color: var(--ek-color-surface);
}

.custom-picker-trigger {
  border: 1px dashed var(--ek-color-border-strong);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
}

.custom-picker-trigger:hover {
  border-color: var(--ek-color-action);
  color: var(--ek-color-action);
}

@media (prefers-reduced-motion: reduce) {
  .sl-nav__item,
  .sl-nav__icon,
  .sl-day,
  .sl-savebar,
  .color-swatch-item {
    transition: none;
  }
}

/* Dar ekran: gezinme üstte yatay şerit (kaydırılabilir), içerik tek kolon; önizleme kimlik bölümüne iner. */
@media (max-width: 959px) {
  .sl-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-4);
  }

  .sl-side {
    position: static;
  }

  .sl-nav {
    padding: var(--ek-space-2);
  }

  .sl-nav__list {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: thin;
  }

  .sl-nav__item {
    flex: none;
    width: auto;
    min-height: 44px;
  }

  .sl-nav__item.is-active::before {
    inset: auto var(--ek-space-2) 0 var(--ek-space-2);
    width: auto;
    height: 3px;
    border-radius: 3px 3px 0 0;
  }

  .sl-nav__desc {
    display: none;
  }
}

@media (max-width: 767px) {
  .sl-fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .sl-savebar__kbd {
    display: none;
  }
}

@media (max-width: 599px) {
  .settingListView {
    padding: var(--ek-space-4) var(--ek-space-4) 0;
  }

  .sl-group__head {
    align-items: flex-start;
    padding: var(--ek-space-4);
  }

  .sl-group__icon {
    width: 36px;
    height: 36px;
    font-size: var(--ek-icon-md);
  }

  .sl-group__badge {
    display: none;
  }

  .sl-sub {
    padding: var(--ek-space-4);
  }

  .sl-group__preview {
    margin: 0 var(--ek-space-4) var(--ek-space-4);
  }

  .sl-color-code {
    flex: 1 1 100%;
  }

  .sl-savebar {
    padding: var(--ek-space-3);
    bottom: var(--ek-space-2);
  }

  .sl-savebar__state {
    font-size: var(--ek-type-caption-size);
    line-height: var(--ek-type-caption-line);
  }

  .sl-savebar__actions {
    flex: 1 1 100%;
    justify-content: flex-end;
  }

  .settingListView__upload {
    flex-wrap: wrap;
  }

  .settingListView__upload-btn {
    flex: 1 1 100%;
  }
}
</style>
