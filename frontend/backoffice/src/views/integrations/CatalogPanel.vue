<template>
  <section class="bo-panel" aria-labelledby="bo-cat-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-cat-title" class="bo-panel__title">Katalog ve etkin ayar</h2>
        <p class="bo-panel__hint">Ayar tanımları ile seçili hedefte bugün geçerli değerler. Değer kaynağı, riski ve uygulanma zamanı görünür. Bu ekranda ayar değiştirilmez.</p>
      </div>
      <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
    </header>

    <div class="bo-toolbar">
      <v-select v-model="target" :items="TARGET_ITEMS" item-title="title" item-value="value" label="Hedef" density="compact" hide-details class="bo-toolbar__field" data-testid="catalog-target" />
      <v-select v-model="group" :items="groupItems" label="Grup" density="compact" hide-details class="bo-toolbar__field" :disabled="!res.data.value" />
      <v-text-field v-model="query" label="Ara (anahtar, etiket, yardım)" density="compact" hide-details clearable prepend-inner-icon="mdi-magnify" class="bo-toolbar__field bo-cat__search" :disabled="!res.data.value" />
    </div>

    <StateBlock
      :phase="phase"
      :error="res.error.value"
      :rows="8"
      error-title="Katalog yüklenemedi"
      empty-title="Bu hedef için ayar yok"
      empty-message="Seçili hedefte uygulanabilir ayar anahtarı bulunmuyor."
      @retry="res.load()"
    >
      <div v-if="res.data.value" class="bo-stack">
        <EkAlert
          v-if="stale"
          tone="warning"
          title="Katalog sürümü etkin yapılandırmayla uyuşmuyor"
          :text="`Katalog ${res.data.value.catalog.catalogVersion}, etkin yapılandırma ${res.data.value.effective.catalogVersion} sürümünde. Yeni bir yayın sürüyor olabilir; bazı değerler eksik ya da eski görünebilir — sayfayı yenileyin.`"
          live
        />
        <dl class="bo-kv bo-cat__meta">
          <div><dt>Katalog sürümü</dt><dd>{{ res.data.value.catalog.catalogVersion }}</dd></div>
          <div><dt>Yayınlanan revizyon</dt><dd>{{ res.data.value.effective.publishedVersion }}</dd></div>
          <div><dt>Gösterilen ayar</dt><dd>{{ filtered.length }} / {{ res.data.value.catalog.items.length }}</dd></div>
        </dl>

        <EkCard flush>
          <EkDataTable tabindex="0" v-if="filtered.length" :items="filtered as unknown as Array<Record<string, unknown>>" :columns="COLUMNS" row-key="key">
            <template #cell-key="{ item }">
              <span class="bo-cell-stack bo-cat__key">
                <span class="bo-cat__label">{{ (item as unknown as Row).label.tr }}</span>
                <code class="bo-code">{{ item.key }}</code>
                <span>{{ (item as unknown as Row).help.tr }}</span>
                <EkStatusChip v-if="(item as unknown as Row).deprecated" tone="warning" label="Kullanımdan kalkıyor" />
              </span>
            </template>
            <template #cell-group="{ item }"><code class="bo-code">{{ item.group }}</code></template>
            <template #cell-type="{ item }">
              <span class="bo-cell-stack"><span>{{ TYPE[(item as unknown as Row).type] }}</span><span v-if="unitText(item as unknown as Row)">{{ unitText(item as unknown as Row) }}</span></span>
            </template>
            <template #cell-default="{ item }">
              <ul v-if="isPerIntegration((item as unknown as Row).default)" class="bo-cat__per" :aria-label="`${item.key} varsayılanları`">
                <li v-for="[k, v] in perEntries((item as unknown as Row).default)" :key="k"><span class="bo-muted">{{ k === '_' ? 'Tümü' : (CHANNEL[k] ?? k) }}</span> <span class="ek-num">{{ formatValue(v, item as unknown as Row) }}</span></li>
              </ul>
              <span v-else class="ek-num">{{ formatValue((item as unknown as Row).default, item as unknown as Row) }}</span>
            </template>
            <template #cell-effective="{ item }">
              <span v-if="effectiveOf(String(item.key))" class="bo-cell-stack">
                <span class="ek-num bo-cat__value">{{ formatValue(effectiveOf(String(item.key))!.value, item as unknown as Row) }}</span>
                <span><EkStatusChip :tone="SOURCE_TONE[effectiveOf(String(item.key))!.source]" :label="sourceLabel(effectiveOf(String(item.key))!)" :icon="effectiveOf(String(item.key))!.source === 'env' ? 'mdi-lock-outline' : undefined" /></span>
              </span>
              <span v-else class="bo-muted">—</span>
            </template>
            <template #cell-danger="{ item }">
              <EkStatusChip :tone="DANGER[(item as unknown as Row).danger].tone" :label="DANGER[(item as unknown as Row).danger].label" />
            </template>
            <template #cell-applies="{ item }">{{ APPLIES[(item as unknown as Row).applies] }}</template>
          </EkDataTable>
          <EkEmptyState v-else variant="no-results" title="Eşleşen ayar yok" message="Arama ya da grup filtresini değiştirin." />
        </EkCard>
      </div>
    </StateBlock>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkAlert, EkCard, EkDataTable, EkEmptyState, EkRefreshButton, EkStatusChip, type EkTableColumn, type StatusTone } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { CatalogItem, EffectiveValue, SettingApplies, SettingDanger, SettingType, ValueSource } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { CHANNEL } from '@bo/utils/labels'
import { formatCount, formatDuration } from '@bo/utils/units'
import '@bo/styles/kit.css'

type Row = CatalogItem
const COLUMNS: EkTableColumn[] = [
  { key: 'key', label: 'Ayar' },
  { key: 'group', label: 'Grup' },
  { key: 'type', label: 'Tür / birim' },
  { key: 'default', label: 'Varsayılan' },
  { key: 'effective', label: 'Etkin değer' },
  { key: 'danger', label: 'Risk' },
  { key: 'applies', label: 'Uygulanma' },
]
const TYPE: Record<SettingType, string> = { int: 'Tam sayı', duration: 'Süre', bool: 'Aç / kapat', enum: 'Seçenek', host: 'Adres', pathTemplate: 'Yol şablonu', stringList: 'Liste', text: 'Metin', decimal: 'Ondalık sayı' }
const UNIT: Record<string, string> = { count: 'adet', perMin: 'istek/dk', h: 'saat', ms: 'milisaniye' }
const DANGER: Record<SettingDanger, { label: string; tone: StatusTone }> = {
  safe: { label: 'Güvenli', tone: 'success' },
  caution: { label: 'Dikkat', tone: 'warning' },
  dangerous: { label: 'Tehlikeli', tone: 'danger' },
}
const APPLIES: Record<SettingApplies, string> = { immediate: 'Hemen', next_cycle: 'Sonraki turda', restart: 'Yeniden başlatmada' }
const SOURCE_TONE: Record<ValueSource, StatusTone> = { default: 'neutral', legacy: 'info', platform: 'info', tenant: 'info', env: 'warning' }
const TARGET_ITEMS = [
  { title: 'Motor', value: '_engine' },
  ...Object.entries(CHANNEL).filter(([c]) => ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'].includes(c)).map(([value, title]) => ({ title, value })),
  { title: 'Platform', value: '_platform' },
]

const target = ref('_engine')
const group = ref('Tümü')
const query = ref<string | null>('')

const res = useResource(async () => {
  const [catalog, effective] = await Promise.all([
    api.call('IntegrationConfigService/getCatalog', { target: target.value }),
    api.call('IntegrationConfigService/getEffectiveConfig', { target: target.value }),
  ])
  return { catalog, effective }
})
watch(
  target,
  () => {
    group.value = 'Tümü'
    res.load()
  },
  { immediate: true },
)

const phase = computed(() => (res.stale.value ? 'error' : res.phase.value))
const effectiveMap = computed(() => new Map((res.data.value?.effective.values ?? []).map((v) => [v.key, v])))
const effectiveOf = (key: string): EffectiveValue | undefined => effectiveMap.value.get(key)
const groupItems = computed(() => ['Tümü', ...new Set((res.data.value?.catalog.items ?? []).map((i) => i.group))])
const stale = computed(() => !!res.data.value && res.data.value.catalog.catalogVersion !== res.data.value.effective.catalogVersion)
const filtered = computed(() => {
  const q = (query.value ?? '').trim().toLocaleLowerCase('tr')
  return (res.data.value?.catalog.items ?? []).filter((i) => {
    if (group.value !== 'Tümü' && i.group !== group.value) return false
    return !q || [i.key, i.label.tr, i.help.tr].some((s) => s.toLocaleLowerCase('tr').includes(q))
  })
})

function isPerIntegration(d: unknown): d is Record<string, unknown> {
  return !!d && typeof d === 'object' && !Array.isArray(d) && '_' in d
}
const perEntries = (d: unknown) => Object.entries(d as Record<string, unknown>)
function unitText(i: Row): string {
  return i.unit ? (UNIT[i.unit] ?? i.unit) : ''
}
function formatValue(v: unknown, i: Row): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Açık' : 'Kapalı'
  if (typeof v === 'number') return i.type === 'duration' && i.unit === 'ms' ? formatDuration(v) : i.unit === 'h' ? `${formatCount(v)} sa` : formatCount(v)
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(boş)'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
function sourceLabel(v: EffectiveValue): string {
  switch (v.source) {
    case 'default': return 'Varsayılan'
    case 'legacy': return 'Eski yapılandırma'
    case 'platform': return v.revision !== undefined ? `Platform · rev ${v.revision}` : 'Platform'
    case 'tenant': return 'Müşteri'
    case 'env': return `Ortam değişkeni ${v.envVar ?? ''} (kilitli)`.trim()
  }
}
</script>

<style scoped>
.bo-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
.bo-cat__search {
  flex: 1 1 260px;
}
.bo-cat__meta {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.bo-cat__key {
  min-width: 260px;
  max-width: 420px;
}
.bo-cat__key .bo-code {
  align-self: flex-start;
}
.bo-cat__label {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-cat__value {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
  overflow-wrap: anywhere;
}
.bo-cat__per {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--ek-type-caption-size);
}
</style>
