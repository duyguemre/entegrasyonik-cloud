<!--
  frontend/src/views/secure/settings/NotificationPreferencesView.vue

  C2b (ADR-0029 Karar 4-5, NOTIFICATION_PLAN §2.3 + F-N2) — "Bildirim tercihleri" (kişisel).
  `EkSettingsTemplate` (başlık + bölümler + kirli durumda yapışkan Vazgeç/Kaydet çubuğu). `EkPageHeader` doğrudan
  kullanılmaz — şablon onu içinde render eder (AccountSecurityView / EngineSettingsView emsali).

  Bölümler:
    1. Kategori × kanal matrisi — satırlar katalog kategorileri (getCatalog; yoksa plan v1 yedeği), sütunlar
       "Uygulama içi" (anahtar) ve "E-posta" (Kapalı · Anında · Özet; radyo grubu). Tümü zorunlu kategori
       (abonelik, güvenlik) KİLİTLİ: kontroller devre dışı + kilit + "Zorunlu — kapatılamaz". Kısmen zorunlu
       kategoride (stok, entegrasyon) zorunlu olay adları satır altında listelenir: kategori kapatılsa da gelir.
    2. E-posta özeti — günlük (saat) / saatlik; yalnız "Özet" seçili kategori varsa etkin.
    3. Sessiz saatler — anında e-postalar aralık sonuna ertelenir (NB5 kabul listesi).
    4. E-posta dili — tr / en.
  Sözleşme gövdesi: `stores/notificationPreferences.ts` (şekil sözleşme kopyasında yazılı değil — savunmacı okuma).
  Ham renk yok; tüm kontroller etiketli; kilitli hücrelerde açıklama `aria-describedby` ile bağlı.
-->
<template>
  <div class="ek-notification-prefs">
    <EkSettingsTemplate
      section="Ayarlar"
      title="Bildirim tercihleri"
      description="Hangi bildirimleri uygulama içinde ve e-postayla alacağınızı seçin. Zorunlu bildirimler (kilit simgesi) güvenliğiniz ve hesabınızın sürekliliği için kapatılamaz."
      :dirty="dirty"
      :saving="saving"
      unsaved-hint="Kaydedilmemiş tercih değişiklikleriniz var."
      @save="save"
      @discard="discard"
    >
      <EkSkeleton v-if="state === 'loading'" type="form" />
      <EkProblemState v-else-if="state === 'error'" title="Tercihler yüklenemedi" cause="Sunucuya ulaşılamadı ya da yanıt geçersizdi."
        action="Bağlantınızı kontrol edip tekrar deneyin." @retry="load" />
      <template v-else-if="form">
        <EkAlert v-if="saveError" tone="error" :text="saveError" live dense />

        <!-- Matris tam genişlik: 3 sütunlu tablo 2/3 kolona sığmıyor (1. iterasyon: ipuçları 4 satıra sarılıyordu). -->
        <section class="ek-np-block" aria-labelledby="np-matrix-title">
          <header class="ek-np-block__intro">
            <h2 id="np-matrix-title" class="ek-np-block__title">Kategoriler ve kanallar</h2>
            <p class="ek-np-block__desc">Her kategori için uygulama içi bildirimi ve e-posta sıklığını seçin. “Özet” seçilen bildirimler, aşağıda belirlediğiniz saatte tek e-postada toplanır.</p>
          </header>
          <div class="ek-np-matrix" role="group" aria-label="Kategori ve kanal tercihleri">
            <div class="ek-np-matrix__head" aria-hidden="true">
              <span>Kategori</span>
              <span>Uygulama içi</span>
              <span>E-posta</span>
            </div>
            <div v-for="cat in rows" :key="cat.key" class="ek-np-row" :class="{ 'is-locked': cat.locked }" :data-category="cat.key">
              <div class="ek-np-row__label">
                <EkIconTile :icon="cat.icon" :tone="cat.locked ? 'neutral' : 'action'" size="sm" />
                <div class="ek-np-row__text">
                  <span :id="`np-${cat.key}-name`" class="ek-np-row__name">
                    {{ cat.label }}
                    <span v-if="cat.locked" class="ek-np-lock" role="img" aria-label="Zorunlu bildirim">
                      <v-icon icon="mdi-lock-outline" aria-hidden="true" />
                    </span>
                  </span>
                  <span :id="`np-${cat.key}-hint`" class="ek-np-row__hint">
                    {{ cat.locked ? 'Zorunlu — kapatılamaz. Anında e-posta ile de gönderilir.' : cat.hint }}
                  </span>
                  <span v-if="!cat.locked && cat.mandatoryLabels.length" :id="`np-${cat.key}-mandatory`" class="ek-np-row__mandatory">
                    <v-icon icon="mdi-lock-outline" aria-hidden="true" />
                    <span>Her zaman gönderilir: {{ cat.mandatoryLabels.join(', ') }}</span>
                  </span>
                </div>
              </div>

              <div class="ek-np-row__cell" data-col="inApp">
                <span class="ek-np-row__cell-label" aria-hidden="true">Uygulama içi</span>
                <v-switch
                  role="switch"
                  v-model="form.categories[cat.key].inApp"
                  :disabled="cat.locked"
                  color="primary"
                  hide-details
                  density="compact"
                  :aria-label="`${cat.label}: uygulama içi bildirim`"
                  :aria-describedby="describedBy(cat)"
                />
              </div>

              <div class="ek-np-row__cell" data-col="email">
                <span class="ek-np-row__cell-label" aria-hidden="true">E-posta</span>
                <div class="ek-np-seg" role="radiogroup" :aria-label="`${cat.label}: e-posta`" :aria-describedby="describedBy(cat)"
                  :aria-disabled="cat.locked || undefined">
                  <label v-for="opt in EMAIL_OPTIONS" :key="opt.value" class="ek-np-seg__opt"
                    :class="{ 'is-on': form.categories[cat.key].email === opt.value, 'is-disabled': cat.locked }">
                    <input v-model="form.categories[cat.key].email" class="ek-sr-only" type="radio" :name="`np-${cat.key}-email`"
                      :value="opt.value" :disabled="cat.locked" />
                    <span>{{ opt.label }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <p v-if="catalog.source === 'fallback'" class="ek-np-note">
            <v-icon icon="mdi-information-outline" aria-hidden="true" />
            Kategori listesi sunucudan alınamadı; varsayılan katalog gösteriliyor.
          </p>
        </section>

        <EkSettingsSection title="E-posta özeti" description="“Özet” seçili kategorilerdeki bildirimler tek e-postada toplanır. Saat dilimi: Türkiye (GMT+3).">
          <div class="ek-np-fields" :class="{ 'is-muted': !digestActive }">
            <div class="ek-np-seg ek-np-seg--wide" role="radiogroup" aria-label="Özet sıklığı">
              <label v-for="opt in DIGEST_OPTIONS" :key="opt.value" class="ek-np-seg__opt" :class="{ 'is-on': form.digest.frequency === opt.value }">
                <input v-model="form.digest.frequency" class="ek-sr-only" type="radio" name="np-digest" :value="opt.value" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
            <EkSelect v-if="form.digest.frequency === 'daily'" v-model="form.digest.hour" :items="HOUR_OPTIONS" label="Gönderim saati"
              class="ek-np-field" hide-details="auto" />
            <p class="ek-np-help">
              {{ digestActive ? digestSummary : 'Şu an “Özet” seçili kategori yok; bu ayar yalnız özet seçildiğinde kullanılır.' }}
            </p>
          </div>
        </EkSettingsSection>

        <EkSettingsSection title="Sessiz saatler" description="Bu aralıkta anında e-postalar gönderilmez; aralığın sonunda iletilir. Uygulama içi bildirimler etkilenmez.">
          <div class="ek-np-fields">
            <v-switch v-model="form.quietHours.enabled" role="switch" color="primary" hide-details density="compact" label="Sessiz saatleri kullan" />
            <div v-if="form.quietHours.enabled" class="ek-np-time">
              <EkSelect v-model="form.quietHours.start" :items="TIME_OPTIONS" label="Başlangıç" class="ek-np-field" hide-details="auto" />
              <EkSelect v-model="form.quietHours.end" :items="TIME_OPTIONS" label="Bitiş" class="ek-np-field" hide-details="auto"
                :error-messages="quietError ? [quietError] : []" />
            </div>
          </div>
        </EkSettingsSection>

        <EkSettingsSection title="E-posta dili" description="Bildirim e-postalarının dili.">
          <div class="ek-np-seg ek-np-seg--wide" role="radiogroup" aria-label="E-posta dili">
            <label v-for="opt in LOCALE_OPTIONS" :key="opt.value" class="ek-np-seg__opt" :class="{ 'is-on': form.locale === opt.value }">
              <input v-model="form.locale" class="ek-sr-only" type="radio" name="np-locale" :value="opt.value" />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </EkSettingsSection>
      </template>
    </EkSettingsTemplate>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import EkSettingsTemplate from '@/components/ds/templates/EkSettingsTemplate.vue'
import EkSettingsSection from '@/components/ds/templates/EkSettingsSection.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import EkProblemState from '@/components/ds/EkProblemState.vue'
import EkAlert from '@/components/ds/EkAlert.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkSelect from '@/components/ds/EkSelect.vue'
import { useToast } from '@/composables/useToast'
import { labelsFor, useNotificationCatalogStore } from '@/stores/notificationCatalog'
import {
  samePreferences,
  useNotificationPreferencesApi,
  usesDigest,
  validatePreferences,
  type NotificationPreferences,
} from '@/stores/notificationPreferences'
import type { EmailMode } from '@/types/NotificationTypes'

const catalog = useNotificationCatalogStore()
const api = useNotificationPreferencesApi()
const { showToast } = useToast()
const { locale } = useI18n({ useScope: 'global' })
const labels = computed(() => labelsFor(locale.value))

const EMAIL_OPTIONS: Array<{ value: EmailMode; label: string }> = [
  { value: 'off', label: 'Kapalı' },
  { value: 'inst', label: 'Anında' },
  { value: 'dig', label: 'Özet' },
]
const DIGEST_OPTIONS = [
  { value: 'daily', label: 'Günlük' },
  { value: 'hourly', label: 'Saatlik' },
]
const LOCALE_OPTIONS = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
]
const pad = (n: number) => String(n).padStart(2, '0')
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: h, title: `${pad(h)}:00` }))
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const v = `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`
  return { value: v, title: v }
})

const state = ref<'loading' | 'ready' | 'error'>('loading')
const saving = ref(false)
const saveError = ref('')
const form = ref<NotificationPreferences | null>(null)
const saved = ref<NotificationPreferences | null>(null)

const clone = (p: NotificationPreferences): NotificationPreferences => JSON.parse(JSON.stringify(p))

const rows = computed(() =>
  catalog.categories
    .filter((c) => c.codes.length)
    .map((c) => ({
      ...c,
      label: labels.value.categories[c.key],
      hint: labels.value.categoryHints[c.key],
      mandatoryLabels: c.mandatoryCodes.map((code) => labels.value.events[code] ?? code),
    })),
)

const describedBy = (cat: { key: string; locked: boolean; mandatoryLabels: string[] }) =>
  [`np-${cat.key}-hint`, !cat.locked && cat.mandatoryLabels.length ? `np-${cat.key}-mandatory` : ''].filter(Boolean).join(' ')

const dirty = computed(() => !!form.value && !!saved.value && !samePreferences(form.value, saved.value))
const digestActive = computed(() => !!form.value && usesDigest(form.value))
const digestSummary = computed(() => {
  const d = form.value?.digest
  if (!d) return ''
  return d.frequency === 'hourly' ? 'Özet her saat başı gönderilir.' : `Özet her gün ${pad(d.hour)}:00'da gönderilir.`
})
const quietError = computed(() => (form.value ? validatePreferences(form.value) : null))

async function load() {
  state.value = 'loading'
  saveError.value = ''
  await catalog.ensureLoaded()
  const prefs = await api.load(catalog.categories)
  if (!prefs) {
    state.value = 'error'
    return
  }
  saved.value = prefs
  form.value = clone(prefs)
  state.value = 'ready'
}

async function save() {
  if (!form.value) return
  const invalid = validatePreferences(form.value)
  if (invalid) {
    saveError.value = invalid
    return
  }
  saving.value = true
  saveError.value = ''
  const result = await api.save(form.value, catalog.categories)
  saving.value = false
  if (result.ok) {
    saved.value = clone(form.value)
    showToast({ tone: 'success', message: 'Bildirim tercihleriniz kaydedildi.' })
  } else {
    saveError.value = result.message
  }
}

function discard() {
  if (saved.value) form.value = clone(saved.value)
  saveError.value = ''
}

defineExpose({
  initialize: () => load(),
  activate: () => (state.value === 'ready' ? undefined : load()),
})
</script>

<style scoped>
/* Kendi kaydırıcısı (DashboardView emsali): sekme kabı `h-100` verir; içerik taşınca pencere kayıyor ve zemin
   görünüm yüksekliğinde bitiyordu (2. iterasyon). Yapışkan kaydet çubuğu bu kaydırıcıya göre durur. */
.ek-notification-prefs {
  height: 100%;
  overflow-y: auto;
  padding: var(--ek-space-6);
  background: var(--ek-color-app-bg);
}

.ek-np-block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding-bottom: var(--ek-space-8);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ek-np-block__intro {
  max-width: 640px;
}

.ek-np-block__title {
  margin: 0 0 var(--ek-space-1);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.ek-np-block__desc {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-np-matrix {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  overflow: hidden;
  container-type: inline-size;
}

.ek-np-matrix__head,
.ek-np-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 232px;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-4);
}

.ek-np-matrix__head {
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-default);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-np-row + .ek-np-row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-np-row.is-locked {
  background: var(--ek-color-surface-sunken);
}

.ek-np-row__label {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  min-width: 0;
}

.ek-np-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ek-np-row__name {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-np-lock,
.ek-np-row__mandatory :deep(.v-icon),
.ek-np-note :deep(.v-icon) {
  display: inline-flex;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-xs);
}

.ek-np-lock :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}

.ek-np-row__hint,
.ek-np-row__mandatory,
.ek-np-help,
.ek-np-note {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-np-row__mandatory {
  display: inline-flex;
  align-items: flex-start;
  gap: var(--ek-space-1);
  margin-top: 2px;
}

.ek-np-row__mandatory :deep(.v-icon) {
  margin-top: 1px;
}

.ek-np-row__cell {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-np-row__cell-label {
  display: none;
}

/* Parçalı seçim (radyo grubu): tek kontrol ritmi (32px), seçili = action-subtle zemin + action-emphasis metin. */
.ek-np-seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}

.ek-np-seg__opt {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  height: 28px;
  padding: 0 var(--ek-space-3);
  border-radius: calc(var(--ek-radius-control) - 2px);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
  user-select: none;
  transition: var(--ek-transition-colors);
}

.ek-np-seg__opt:hover {
  background: var(--ek-color-surface-muted);
}

.ek-np-seg__opt.is-on {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  box-shadow: inset 0 0 0 1px var(--ek-color-action-border);
}

.ek-np-seg__opt:focus-within {
  box-shadow: var(--ek-focus-ring);
}

.ek-np-seg__opt.is-disabled {
  cursor: not-allowed;
  color: var(--ek-color-content-muted);
}

.ek-np-seg__opt.is-disabled:hover {
  background: transparent;
}

.ek-np-seg__opt.is-on.is-disabled {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-default);
}

.ek-np-seg--wide {
  align-self: flex-start;
}

.ek-np-seg--wide .ek-np-seg__opt {
  min-width: 96px;
}

.ek-np-fields {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ek-np-fields.is-muted .ek-np-seg,
.ek-np-fields.is-muted .ek-np-field {
  opacity: 0.72;
}

.ek-np-field {
  max-width: 240px;
}

.ek-np-time {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-4);
}

.ek-np-time .ek-np-field {
  flex: 1 1 160px;
}

.ek-np-help,
.ek-np-note {
  margin: 0;
}

.ek-np-note {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin-top: var(--ek-space-3);
}

/* Dar kap: satır kart gibi; kontroller etiketiyle alt alta (başlık satırı gizli). */
@container (max-width: 560px) {
  .ek-np-matrix__head {
    display: none;
  }

  .ek-np-row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-2);
    padding: var(--ek-space-4);
  }

  .ek-np-row__cell {
    justify-content: space-between;
    padding-left: calc(28px + var(--ek-space-3));
  }

  .ek-np-row__cell-label {
    display: inline;
    color: var(--ek-color-content-muted);
    font-size: var(--ek-type-caption-size);
  }

  .ek-np-seg__opt {
    min-width: 0;
    flex: 1;
  }

  .ek-np-row__cell[data-col='email'] .ek-np-seg {
    flex: 0 1 228px;
  }
}

@media (max-width: 767px) {
  .ek-notification-prefs {
    padding: var(--ek-space-4);
  }
}
</style>
