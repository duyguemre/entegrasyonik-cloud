<!--
  frontend/src/components/integrations/IntegrationCapabilityChips.vue

  C1.2 — "Bu kanalda neler çalışır": seçili kanalın kapsam çipleri (ADR-0018 Karar 1 yetenek manifestosu, E3 dürüstlük).
  Kaynak YALNIZ `IntegrationService/getCatalog` (bkz. `integrationCatalog.ts`); ekran düzey/renk SEÇMEZ.
    - Çip = ikon + yetenek adı (+ desteklenmiyorsa/sınırlıysa düzey metni) → renk tek başına anlam taşımaz.
    - Manifestoda yazılmayan yetenekler çip OLMAZ; "Kayıtta yer almıyor" satırında adlarıyla listelenir
      (kodda kanıtı olmayan bir şeyi "var" ya da "yok" diye iddia etmeyiz).
    - "Ayrıntılar ve sınırlamalar" açılır bölümü: her yeteneğin düzeyi + kullanıcıya dönük notu, bilinen sınırlamalar
      ve doğrulama durumu (canlı API / test ortamı).
  Durumlar: yükleniyor (iskelet çipler) · hata (bilgi satırı + Tekrar dene; form KULLANILABİLİR kalır) ·
  kanal katalogda yok → hiçbir şey çizmez (çağıran "Yakında" panelini gösterir).
-->
<template>
  <section v-if="state !== 'absent'" class="ek-coverage" :aria-labelledby="titleId" :aria-busy="state === 'loading'">
    <header class="ek-coverage__head">
      <EkIconTile icon="mdi-format-list-checks" tone="action" size="sm" />
      <div class="ek-coverage__titles">
        <h2 :id="titleId" class="ek-coverage__title">{{ t('integrationCoverage.title') }}</h2>
        <p class="ek-coverage__subtitle">
          <template v-if="entry">{{ t('integrationCoverage.subtitle', { name: entry.displayName }) }}</template>
          <template v-else>{{ t('integrationCoverage.subtitleLoading') }}</template>
        </p>
      </div>
      <div class="ek-coverage__head-end">
        <EkStatusChip v-if="entry && entry.status === 'limited'" tone="warning" :label="t('integrationCoverage.statusLimited')" />
        <EkButton v-if="showHealthLink" tone="ghost" size="sm" trailing-icon="mdi-arrow-right" @click="emit('open-health')">
          {{ t('integrationCoverage.healthLink') }}
        </EkButton>
      </div>
    </header>

    <div v-if="state === 'loading'" class="ek-coverage__chips" aria-hidden="true">
      <span v-for="n in 6" :key="n" class="ek-coverage__bone"></span>
    </div>

    <p v-else-if="state === 'error'" class="ek-coverage__error" role="status">
      <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
      <span>{{ t('integrationCoverage.loadError') }}</span>
      <EkButton tone="ghost" size="sm" icon="mdi-refresh" @click="load(true)">{{ t('integrationCoverage.retry') }}</EkButton>
    </p>

    <template v-else-if="entry">
      <ul class="ek-coverage__chips" :aria-label="t('integrationCoverage.chipsAria', { name: entry.displayName })">
        <li
          v-for="row in declared"
          :key="row.key"
          class="ek-coverage__chip"
          :class="`ek-coverage__chip--${row.level}`"
          :data-level="row.level"
        >
          <v-icon :icon="LEVEL_PRESENTATION[row.level].icon" size="14" aria-hidden="true" />
          <span>{{ capabilityLabel(row.key) }}</span>
          <span v-if="row.level !== 'supported'" class="ek-coverage__chip-level">· {{ t(LEVEL_PRESENTATION[row.level].labelKey) }}</span>
          <span v-else class="ek-visually-hidden">— {{ t(LEVEL_PRESENTATION.supported.labelKey) }}</span>
        </li>
      </ul>

      <p v-if="undeclared.length" class="ek-coverage__undeclared">
        <span class="ek-coverage__micro">{{ t('integrationCoverage.undeclared') }}</span>
        {{ undeclared.map((row) => capabilityLabel(row.key)).join(', ') }}
      </p>

      <div class="ek-coverage__foot">
        <p class="ek-coverage__summary ek-num">
          <span v-for="level in SUMMARY_LEVELS" :key="level" v-show="counts[level]" class="ek-coverage__summary-item">
            <v-icon :icon="LEVEL_PRESENTATION[level].icon" size="14" :class="`ek-coverage__ic--${level}`" aria-hidden="true" />
            {{ t('integrationCoverage.count.' + level, { n: counts[level] }) }}
          </span>
        </p>
        <button
          type="button"
          class="ek-coverage__toggle"
          :aria-expanded="expanded"
          :aria-controls="detailsId"
          @click="expanded = !expanded"
        >
          {{ t('integrationCoverage.details', { n: entry.limitations.length }) }}
          <v-icon :icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="16" aria-hidden="true" />
        </button>
      </div>

      <div v-show="expanded" :id="detailsId" class="ek-coverage__details">
        <div class="ek-coverage__col">
          <h3 class="ek-coverage__micro">{{ t('integrationCoverage.detailsCapabilities') }}</h3>
          <dl class="ek-coverage__dl">
            <div v-for="row in declared" :key="row.key" class="ek-coverage__dl-row">
              <dt>{{ capabilityLabel(row.key) }}</dt>
              <dd>
                <span class="ek-coverage__dl-level" :class="`ek-coverage__ic--${row.level}`">
                  <v-icon :icon="LEVEL_PRESENTATION[row.level].icon" size="14" aria-hidden="true" />
                  {{ t(LEVEL_PRESENTATION[row.level].labelKey) }}
                </span>
                <span v-if="userFacingNote(row.note)" class="ek-coverage__dl-note">{{ userFacingNote(row.note) }}</span>
              </dd>
            </div>
          </dl>
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
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkIconTile, EkButton, EkStatusChip } from '@entegrasyonik/ui/components'
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
.ek-coverage {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.ek-coverage__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

.ek-coverage__titles {
  flex: 1;
  min-width: 0;
}

.ek-coverage__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-type-subheading-weight);
  line-height: var(--ek-type-subheading-line);
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

.ek-coverage__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-coverage__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: 28px;
  padding: 0 var(--ek-space-3) 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-label-line);
  white-space: nowrap;
}

.ek-coverage__chip--supported {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.ek-coverage__chip--limited {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.ek-coverage__chip--platform_auto {
  border-color: var(--ek-color-info-border);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
}

.ek-coverage__chip--not_supported {
  border-style: dashed;
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
}

.ek-coverage__chip-level {
  font-weight: var(--ek-font-weight-regular, 400);
}

.ek-coverage__bone {
  display: block;
  width: 112px;
  height: 28px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
}

.ek-coverage__error,
.ek-coverage__undeclared,
.ek-coverage__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
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
  margin-top: var(--ek-space-4);
}

.ek-coverage__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-coverage__summary {
  gap: var(--ek-space-4);
}

.ek-coverage__summary-item {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.ek-coverage__ic--supported { color: var(--ek-color-success-emphasis); }
.ek-coverage__ic--limited { color: var(--ek-color-warning-emphasis); }
.ek-coverage__ic--platform_auto { color: var(--ek-color-info-emphasis); }
.ek-coverage__ic--not_supported { color: var(--ek-color-content-muted); }

.ek-coverage__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: var(--ek-space-1) var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-action);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-label-line);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-coverage__toggle:hover {
  background: var(--ek-color-action-subtle);
}

.ek-coverage__toggle:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.ek-coverage__details {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--ek-space-6);
  padding-top: var(--ek-space-2);
}

.ek-coverage__col {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
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
  padding: var(--ek-space-2) 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-coverage__dl-row:last-child {
  border-bottom: 0;
}

.ek-coverage__dl-row dt {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-label-line);
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
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-label-line);
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

.ek-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 767px) {
  .ek-coverage {
    padding: var(--ek-space-4);
  }

  .ek-coverage__head {
    flex-wrap: wrap;
  }

  .ek-coverage__head-end {
    flex-basis: 100%;
    justify-content: flex-start;
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
