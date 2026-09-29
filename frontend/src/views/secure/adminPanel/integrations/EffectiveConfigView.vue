<!--
  frontend/src/views/secure/adminPanel/integrations/EffectiveConfigView.vue

  ADR-0020 Karar 4.1 "Etkin yapılandırma" — `admin.effectiveConfig?code=`, `EkReadonlyPanelTemplate`,
  `platformAdmin`. Salt-okunur tablo: anahtar, etkin değer, kaynak çipi, varsayılan, uygulanma zamanı.

  NOT (dürüstlük, rapora yazıldı): ADR'nin istediği "Çelişkiler" filtresi (legacy ≠ default / emekli /
  env kilidi) bu RPC'nin verisiyle KURULAMAZ — `getEffectiveConfig` yalnızca `default|platform|env`
  kaynaklarını döndürüyor (`legacy` katmanı bu uçta YOK, host/emekli-uç verisi hiç YOK). Bu yüzden
  filtre GERÇEKTEN bilinen tek anlamı ("varsayılan dışına çıkmış değerler") ile "Varsayılan dışı"
  adıyla sunulur — var olmayan bir "çelişki" tespiti iddia EDİLMEZ (E3/C7).

  Not (ADR-0015 Karar 6.4 desen mandalı): `EkPageHeader` bu dosyada DOĞRUDAN kullanılmaz —
  `EkReadonlyPanelTemplate` onu İÇİNDE render eder.
-->
<template>
  <div class="effectiveConfigView">
   <PlatformAdminGuard :allowed="isPlatformAdmin()">
    <EkEmptyState v-if="!target" variant="no-data" title="Hedef seçilmedi" message="Bu ekran bir entegrasyon kodu (?code=) ya da motor hedefiyle açılmalıdır." />
    <EkReadonlyPanelTemplate
      v-else
      :title="`Etkin Yapılandırma — ${targetLabel}`"
      description="Her ayarın şu an gerçekten kullanılan değeri ve kaynağı."
      :last-updated="lastUpdated"
      @refresh="load"
    >
      <template #kpis>
        <EkKpiRow>
          <EkKpiCard label="Yayındaki sürüm" :value="publishedVersionLabel" />
          <EkKpiCard label="Katalog sürümü" :value="catalogVersionLabel" />
          <EkKpiCard label="Toplam ayar" :value="rows.length" />
          <EkKpiCard label="Varsayılan dışı" :value="nonDefaultCount" />
        </EkKpiRow>
      </template>

      <EkSkeleton v-if="state === 'loading'" type="table" />
      <EkErrorState v-else-if="state === 'error'" :message="errorMessage" @retry="load" />
      <template v-else>
        <div class="effectiveConfigView__toolbar">
          <v-btn size="small" class="text-none" :variant="conflictsOnly ? 'flat' : 'outlined'" :color="conflictsOnly ? 'primary' : undefined" @click="conflictsOnly = !conflictsOnly">
            Varsayılan dışı
          </v-btn>
          <v-spacer />
          <v-btn variant="outlined" prepend-icon="mdi-download-outline" @click="exportJson">Dışa aktar (JSON)</v-btn>
        </div>

        <EkEmptyState v-if="!filteredRows.length" variant="no-results" title="Sonuç yok" message="Bu filtreye uyan bir ayar bulunamadı." show-action action-text="Filtreyi temizle" action-icon="mdi-filter-off-outline" @action="conflictsOnly = false" />
        <EkDataTable v-else :items="filteredRows" :columns="columns" row-key="key" aria-label="Etkin yapılandırma tablosu">
          <template #cell-label="{ item }">
            <div class="effectiveConfigView__label-cell">
              <span>{{ item.label }}</span>
              <code class="effectiveConfigView__key">{{ item.key }}</code>
            </div>
          </template>
          <template #cell-source="{ item }">
            <EkStatusChip :tone="sourceTone(item.source)" :label="item.sourceLabel" />
          </template>
        </EkDataTable>
      </template>
    </EkReadonlyPanelTemplate>
   </PlatformAdminGuard>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import EkReadonlyPanelTemplate from '@/components/ds/templates/EkReadonlyPanelTemplate.vue'
import EkKpiRow from '@/components/ds/EkKpiRow.vue'
import EkKpiCard from '@/components/ds/EkKpiCard.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import PlatformAdminGuard from '@/components/adminPanel/integrations/PlatformAdminGuard.vue'
import useUser from '@/composables/user'
import { formatDuration, formatNumber } from '@/composables/format'
import { getSettingMeta, resolveDefault, ENGINE_TARGET } from '@/components/adminPanel/integrations/settingsCatalogMirror'
import { useIntegrationConfigApi, isErrorShapedResponse, serverErrorMessage, type EffectiveConfigResponse, type ValueSource } from '@/components/adminPanel/integrations/useIntegrationConfigApi'

const KNOWN_CODES = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap']
const { isPlatformAdmin } = useUser()
const api = useIntegrationConfigApi()

const target = ref<string | null>(null)
const targetLabel = computed(() => {
  if (!target.value) return ''
  if (target.value === ENGINE_TARGET) return 'Motor Ayarları'
  return target.value.charAt(0).toUpperCase() + target.value.slice(1)
})

function applyParameters(parameters: any) {
  const c = parameters?.code
  if (c === ENGINE_TARGET || (typeof c === 'string' && KNOWN_CODES.includes(c))) {
    target.value = c
    void load()
  } else {
    target.value = null
  }
}

const state = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')
const effective = ref<EffectiveConfigResponse | null>(null)
const lastUpdated = ref<Date | null>(null)
const conflictsOnly = ref(false)

async function load() {
  if (!target.value) return
  state.value = 'loading'
  const res: any = await api.getEffectiveConfig(target.value)
  if (res && Array.isArray(res.values)) {
    effective.value = res
    lastUpdated.value = new Date()
    state.value = 'ready'
  } else {
    errorMessage.value = isErrorShapedResponse(res)
      ? serverErrorMessage(res, 'Etkin yapılandırma yüklenemedi — tekrar deneyin.')
      : 'Etkin yapılandırma yüklenemedi — tekrar deneyin.'
    state.value = 'error'
  }
}

const SOURCE_LABELS: Record<ValueSource, string> = { default: 'Varsayılan', platform: 'Platform', env: 'Ortam değişkeni', tenant: 'Kiracı', legacy: 'Eski DB' }
function sourceTone(source: ValueSource) {
  return ({ default: 'neutral', platform: 'info', env: 'warning', tenant: 'info', legacy: 'danger' } as const)[source]
}

function displayValue(value: unknown, unit?: string, type?: string): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Açık' : 'Kapalı'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(boş liste)'
  if (typeof value === 'number') return type === 'duration' ? formatDuration(value, unit) : formatNumber(value)
  return String(value)
}

const APPLIES_LABELS: Record<string, string> = { immediate: 'Hemen', next_cycle: 'Sonraki turda', restart: 'Yeniden başlatma gerekir' }

const rows = computed(() => {
  return (effective.value?.values ?? []).map((v) => {
    const meta = getSettingMeta(v.key)
    return {
      key: v.key,
      label: meta?.label.tr ?? v.key,
      value: displayValue(v.value, meta?.unit, meta?.type),
      source: v.source,
      sourceLabel: v.source === 'platform' && v.revision ? `${SOURCE_LABELS[v.source]} v${v.revision}` : SOURCE_LABELS[v.source],
      default: meta ? displayValue(resolveDefault(meta, target.value !== ENGINE_TARGET ? target.value ?? undefined : undefined), meta.unit, meta.type) : '—',
      applies: meta ? APPLIES_LABELS[meta.applies] ?? meta.applies : '—',
    }
  })
})

const filteredRows = computed(() => (conflictsOnly.value ? rows.value.filter((r) => r.source !== 'default') : rows.value))
const nonDefaultCount = computed(() => rows.value.filter((r) => r.source !== 'default').length)
const publishedVersionLabel = computed(() => (effective.value ? `v${effective.value.publishedVersion}` : '—'))
const catalogVersionLabel = computed(() => effective.value?.catalogVersion ?? '—')

const columns: EkTableColumn[] = [
  { key: 'label', label: 'Ayar' },
  { key: 'value', label: 'Etkin değer' },
  { key: 'source', label: 'Kaynak' },
  { key: 'default', label: 'Varsayılan' },
  { key: 'applies', label: 'Uygulanma zamanı' },
]

function exportJson() {
  const payload = { target: target.value, publishedVersion: effective.value?.publishedVersion, catalogVersion: effective.value?.catalogVersion, values: effective.value?.values ?? [] }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `entegrasyonik-etkin-yapilandirma-${target.value}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const initialize = (parameters?: any) => applyParameters(parameters)
const activate = (parameters?: any) => applyParameters(parameters)
defineExpose({ initialize, activate })
</script>

<style scoped>
.effectiveConfigView {
  padding: var(--ek-space-6);
}

.effectiveConfigView__toolbar {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.effectiveConfigView__label-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.effectiveConfigView__key {
  /* NOT (araştırma bulgusu, mobil genişlikte axe `color-contrast`): `content-muted` + `font-size-xs`
   * kombinasyonu 4.48/4.5 ile SINIRDA başarısız oluyordu — `content-default`e yükseltildi. */
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-default);
}
</style>
