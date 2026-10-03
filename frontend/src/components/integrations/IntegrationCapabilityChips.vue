<!--
  frontend/src/components/integrations/IntegrationCapabilityChips.vue

  C1.2 — "Bu kanalda neler çalışır": seçili kanalın kapsamı (ADR-0018 Karar 1 yetenek manifestosu, E3 dürüstlük).
  Kaynak YALNIZ `IntegrationService/getCatalog` (bkz. `integrationCatalog.ts`); ekran düzey/renk SEÇMEZ.

  FE-LOCAL-1048 (kullanıcı kararı): kapsam, bağlantı ayarlarından DAHA ÖNEMSİZ → ayar formunun ALTINDA, sakin ve
  KATLANIR tek satır (varsayılan kapalı): [ikon] Bu kanalda neler çalışır · 8 destekleniyor · 1 sınırlı … [v].
  Düz yüzey + ince çerçeve, gölge / tonlu zemin / renkli çip yok. Açılınca kompakt satır listesi:
    - Yetenekler: ad → düzey (küçük ikon + metin; renk tek başına anlam taşımaz) + kullanıcıya dönük not.
    - Manifestoda yazılmayan yetenekler "Kayıtta yer almıyor" satırında adlarıyla listelenir
      (kodda kanıtı olmayan bir şeyi "var" ya da "yok" diye iddia etmeyiz).
    - Bilinen sınırlamalar + doğrulama durumu (canlı API / test ortamı) + "Bağlantı sağlığı" bağlantısı.
  Durumlar: yükleniyor (satırda "alınıyor…") · hata (satırda bilgi + açılınca Tekrar dene; form KULLANILABİLİR kalır) ·
  kanal katalogda yok → hiçbir şey çizmez (çağıran "Yakında" panelini gösterir).
-->
<template>
  <section v-if="state !== 'absent'" class="ek-coverage" :class="{ 'is-open': expanded }" :aria-labelledby="titleId" :aria-busy="state === 'loading'">
    <h2 class="ek-coverage__heading">
      <button type="button" class="ek-coverage__bar" :aria-expanded="expanded" :aria-controls="detailsId" @click="expanded = !expanded">
        <v-icon class="ek-coverage__bar-icon" icon="mdi-format-list-checks" size="16" aria-hidden="true" />
        <span :id="titleId" class="ek-coverage__title">{{ t('integrationCoverage.title') }}</span>
        <span v-if="state === 'ready' && entry" class="ek-coverage__summary ek-num">
          <span v-for="level in SUMMARY_LEVELS.filter((l) => counts[l])" :key="level" class="ek-coverage__summary-item">
            {{ t('integrationCoverage.count.' + level, { n: counts[level] }) }}
          </span>
        </span>
        <span v-else-if="state === 'loading'" class="ek-coverage__summary">{{ t('integrationCoverage.subtitleLoading') }}</span>
        <v-icon class="ek-coverage__chevron" icon="mdi-chevron-down" size="18" aria-hidden="true" />
      </button>
    </h2>

    <div v-show="expanded" :id="detailsId" class="ek-coverage__body">
      <p v-if="state === 'error'" class="ek-coverage__error" role="status">
        <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
        <span>{{ t('integrationCoverage.loadError') }}</span>
        <EkButton tone="ghost" size="sm" icon="mdi-refresh" @click="load(true)">{{ t('integrationCoverage.retry') }}</EkButton>
      </p>

      <template v-else-if="entry">
        <div class="ek-coverage__intro">
          <p class="ek-coverage__subtitle">{{ t('integrationCoverage.subtitle', { name: entry.displayName }) }}</p>
          <div class="ek-coverage__head-end">
            <EkStatusChip v-if="entry.status === 'limited'" tone="warning" :label="t('integrationCoverage.statusLimited')" />
            <EkButton v-if="showHealthLink" tone="ghost" size="sm" trailing-icon="mdi-arrow-right" @click="emit('open-health')">
              {{ t('integrationCoverage.healthLink') }}
            </EkButton>
          </div>
        </div>

        <div class="ek-coverage__details">
          <div class="ek-coverage__col">
            <h3 class="ek-coverage__micro">{{ t('integrationCoverage.detailsCapabilities') }}</h3>
            <dl class="ek-coverage__dl" :aria-label="t('integrationCoverage.chipsAria', { name: entry.displayName })">
              <div v-for="row in declared" :key="row.key" class="ek-coverage__dl-row" :data-level="row.level">
                <dt>{{ capabilityLabel(row.key) }}</dt>
                <dd>
                  <span class="ek-coverage__dl-level">
                    <v-icon :icon="LEVEL_PRESENTATION[row.level].icon" size="14" :class="`ek-coverage__ic--${row.level}`" aria-hidden="true" />
                    {{ t(LEVEL_PRESENTATION[row.level].labelKey) }}
                  </span>
                  <span v-if="userFacingNote(row.note)" class="ek-coverage__dl-note">{{ userFacingNote(row.note) }}</span>
                </dd>
              </div>
            </dl>
            <p v-if="undeclared.length" class="ek-coverage__undeclared">
              <span class="ek-coverage__micro">{{ t('integrationCoverage.undeclared') }}</span>
              {{ undeclared.map((row) => capabilityLabel(row.key)).join(', ') }}
            </p>
          </div>
          <div class="ek-coverage__col">
            <h3 class="ek-coverage__micro">{{ t('integrationCoverage.limitations') }}</h3>
            <ul v-if="entry.limitations.length" class="ek-coverage__limits">
              <li v-for="(item, i) in entry.limitations" :key="i">{{ userFacingNote(item) || item }}</li>
            </ul>
            <p v-else class="ek-coverage__dl-note">{{ t('integrationCoverage.noLimitations') }}</p>
            <h3 class="ek-coverage__micro ek-coverage__micro--gap">{{ t('integrationCoverage.verification') }}</h3>
            <p class="ek-coverage__dl-note">{{ verificationText }}</p>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkButton, EkStatusChip } from '@entegrasyonik/ui/components'
import {
  LEVEL_PRESENTATION, capabilityRows, levelCounts, toCatalogCategory, useIntegrationCatalog, userFacingNote,
  type CapabilityLevel, type CatalogEntry,
} from './integrationCatalog'

const props = withDefaults(
  defineProps<{
    /** Seçili kanal kodu (ör. `trendyol`). */
    code: string
    /** Ekran kategorisi: `marketplace` | `ecommerce` | `erp` | `shipment` | `einvoice`. */
    category: string
    /** "Bağlantı sağlığı" bağlantısı (çağıran, sağlık ekranı menüde varsa açar). */
    showHealthLink?: boolean
  }>(),
  { showHealthLink: false },
)

const emit = defineEmits<{ 'open-health': [] }>()

const { t, te } = useI18n()
const { getCatalog } = useIntegrationCatalog()
const uid = useId()
const titleId = `ek-coverage-title-${uid}`
const detailsId = `ek-coverage-details-${uid}`

const SUMMARY_LEVELS: CapabilityLevel[] = ['supported', 'limited', 'platform_auto', 'not_supported']

const state = ref<'loading' | 'ready' | 'error' | 'absent'>('loading')
const entry = ref<CatalogEntry | null>(null)
const expanded = ref(false)

const rows = computed(() => (entry.value ? capabilityRows(entry.value) : []))
const declared = computed(() => rows.value.filter((r) => !r.implicit))
const undeclared = computed(() => rows.value.filter((r) => r.implicit))
const counts = computed(() => levelCounts(declared.value))

const verificationText = computed(() => {
  const v = entry.value?.verification
  if (v?.liveApi) return t('integrationCoverage.verifiedLive')
  if (v?.mockEnvironment) return t('integrationCoverage.verifiedMock')
  return t('integrationCoverage.verifiedNone')
})

function capabilityLabel(key: string) {
  const k = `integrationCoverage.capability.${key}`
  return te(k) ? t(k) : key
}

async function load(force = false) {
  const code = props.code
  state.value = 'loading'
  const res = await getCatalog(force)
  if (code !== props.code) return // seçim bu arada değişti; yeni yükleme sonucu yazacak
  if (!res.ok) {
    entry.value = null
    state.value = 'error'
    return
  }
  const category = toCatalogCategory(props.category)
  const found = res.data.find((e) => e.code === code && e.category === category) ?? null
  entry.value = found
  state.value = found ? 'ready' : 'absent'
}

watch(
  () => props.code,
  () => {
    expanded.value = false
    load()
  },
  { immediate: true },
)
</script>

<style scoped>
/* Sakin, ikincil görünüm: düz yüzey + ince çerçeve; gölge, tonlu zemin ve vurgu rengi yok. */
.ek-coverage {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-coverage__heading {
  margin: 0;
  font: inherit;
}

.ek-coverage__bar {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: 40px;
  padding: var(--ek-space-2) var(--ek-space-4);
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-coverage__bar:hover {
  background: var(--ek-color-surface-muted);
}

.ek-coverage__bar:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-coverage.is-open .ek-coverage__bar {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.ek-coverage__bar-icon,
.ek-coverage__chevron {
  flex: none;
  color: var(--ek-color-content-muted);
}

.ek-coverage.is-open .ek-coverage__chevron {
  transform: rotate(180deg);
}

.ek-coverage__title {
  flex: none;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-label-line);
}

.ek-coverage__summary {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ek-space-1) var(--ek-space-3);
  min-width: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-coverage__summary-item + .ek-coverage__summary-item::before {
  content: '·';
  margin-right: var(--ek-space-3);
}

.ek-coverage__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-coverage__intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.ek-coverage__subtitle {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-coverage__head-end {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}

.ek-coverage__error,
.ek-coverage__undeclared {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-coverage__undeclared {
  margin-top: var(--ek-space-2);
}

.ek-coverage__micro {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  line-height: var(--ek-type-micro-line);
  text-transform: uppercase;
}

.ek-coverage__micro--gap {
  margin-top: var(--ek-space-3);
}

/* Düzey rengi YALNIZ küçük ikonda (metin her zaman yanında — renk tek başına anlam taşımaz). */
.ek-coverage__ic--supported { color: var(--ek-color-success-emphasis); }
.ek-coverage__ic--limited { color: var(--ek-color-warning-emphasis); }
.ek-coverage__ic--platform_auto { color: var(--ek-color-info-emphasis); }
.ek-coverage__ic--not_supported { color: var(--ek-color-content-muted); }

.ek-coverage__details {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--ek-space-6);
}

.ek-coverage__col {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.ek-coverage__dl {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.ek-coverage__dl-row {
  display: grid;
  grid-template-columns: minmax(120px, 34%) minmax(0, 1fr);
  gap: var(--ek-space-3);
  padding: 6px 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-coverage__dl-row:last-child {
  border-bottom: 0;
}

.ek-coverage__dl-row dt {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-caption-line);
}

.ek-coverage__dl-row dd {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
}

.ek-coverage__dl-level {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-coverage__dl-note {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-coverage__limits {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding-left: var(--ek-space-4);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

@media (max-width: 767px) {
  .ek-coverage__summary {
    justify-content: flex-start;
    flex-basis: 100%;
    order: 3;
  }

  .ek-coverage__bar {
    flex-wrap: wrap;
  }

  .ek-coverage__title {
    flex: 1;
  }

  .ek-coverage__details {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-4);
  }

  .ek-coverage__dl-row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-1);
  }
}
</style>
