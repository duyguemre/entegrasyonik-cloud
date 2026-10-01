<!--
  frontend/src/components/categories/ChannelCategoryPicker.vue

  Kanal kategorisi seçici (Kategoriler › detay › kanal satırı genişleyince). Birincil yol ARAMA: yerel kategori
  adıyla ÖNDEN DOLU, en az 2 harf, kısa gecikmeli; sonuçlar YAPRAK kanal kategorileri ve TAM YOLLARIYLA gelir, yerel
  adla benzeyenler "Önerilen" olarak üstte. İkincil yol: eski kademeli ağaç seçici (EkCascadeDialog) — "Ağaçtan seç".
  Sözleşme (eski CategoryIntegrationSelectBoxComponent ile AYNI): v-model = seçilen YAPRAK kanal kategorisinin `_id`
  (orijinal tipiyle); kanal listesi `integrationStore.loadIntegrationCategories` ile yüklenir (yükleniyor / hata /
  boş liste ayrı durumlar). Seçilince komisyon oranı (`retrieveCommisionForCategoryFromIntegration`) gösterilir.
-->
<template>
  <div class="ccp">
    <IntegrationLoadingBlock v-if="status === 'loading' && !loadError" :label="`${platformTitle} kategorileri alınıyor…`" />
    <IntegrationErrorPanel v-else-if="loadError" :info="loadError" :retrying="loading" @retry="load" />
    <template v-else-if="index && index.leaves.length > 0">
      <div class="ccp__search">
        <div class="ccp__field">
          <v-icon icon="mdi-magnify" size="18" class="ccp__field-icon" aria-hidden="true" />
          <input ref="fieldRef" v-model="query" class="ccp__input" type="text" role="combobox" autocomplete="off" aria-autocomplete="list"
            aria-haspopup="listbox" :aria-expanded="results.length > 0" :aria-controls="listId" :aria-activedescendant="activeOptionId"
            :placeholder="`${platformTitle} kategorisi ara (en az 2 harf)`" :aria-label="`${platformTitle} kategorisi ara`"
            @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="chooseActive" @keydown.esc="onEsc" />
          <button v-if="query" type="button" class="ccp__clear" aria-label="Aramayı temizle" @click="clearQuery">
            <v-icon icon="mdi-close" size="16" aria-hidden="true" />
          </button>
        </div>
        <EkButton tone="ghost" size="sm" icon="mdi-file-tree-outline" @click="pickerOpen = true">Ağaçtan seç</EkButton>
      </div>

      <p v-if="query.trim().length < 2" class="ccp__hint">Aramak için en az 2 harf yazın ya da ağaçtan seçin.</p>
      <p v-else-if="!results.length" class="ccp__hint" role="status">
        “{{ query.trim() }}” için yaprak kategori bulunamadı — farklı bir sözcük deneyin ya da ağaçtan seçin.
      </p>

      <ul v-if="results.length" :id="listId" class="ccp__list" role="listbox" :aria-label="`${platformTitle} kategori sonuçları`">
        <template v-for="(hit, i) in results" :key="hit.id">
          <li v-if="i === 0 && hit.suggested" class="ccp__group" role="presentation">Önerilen</li>
          <li v-else-if="!hit.suggested && (i === 0 || results[i - 1].suggested)" class="ccp__group" role="presentation">
            {{ i === 0 ? 'Sonuçlar' : 'Diğer sonuçlar' }}
          </li>
          <li :id="`${listId}-${i}`" role="option" class="ccp__opt"
            :class="{ 'is-active': i === activeIndex, 'is-picked': String(model) === hit.id }"
            :aria-selected="String(model) === hit.id" @click="choose(hit.id)" @mousemove="activeIndex = i">
            <span class="ccp__opt-path">
              <template v-for="(seg, s) in hit.segments" :key="s">
                <span v-if="s > 0" class="ccp__sep" aria-hidden="true">›</span>
                <span :class="s === hit.segments.length - 1 ? 'ccp__leaf' : 'ccp__anc'">
                  <template v-for="(p, k) in seg" :key="k"><mark v-if="p.hit" class="ccp__mark">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
                </span>
              </template>
            </span>
            <v-icon v-if="String(model) === hit.id" icon="mdi-check" size="16" class="ccp__check" aria-hidden="true" />
          </li>
        </template>
      </ul>

      <p v-if="selectedPath" class="ccp__selected" role="status">
        <v-icon icon="mdi-check-circle-outline" size="16" aria-hidden="true" />
        <span><span class="ccp__selected-label">Seçilen:</span> {{ selectedPath }}<template v-if="commissionText"> · {{ commissionText }}</template></span>
      </p>

      <EkCascadeDialog v-model="pickerOpen" :nodes="index.tree" :path="selectedIds" :attach="attach"
        :title="`${platformTitle} kategorisi seç`" :subtitle="`${formatNumber(index.leaves.length)} yaprak kategori`"
        @confirm="(ids: string[]) => choose(ids[ids.length - 1])" />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import { EkButton, EkCascadeDialog } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import IntegrationErrorPanel from '@/components/integrations/IntegrationErrorPanel.vue'
import IntegrationLoadingBlock from '@/components/integrations/IntegrationLoadingBlock.vue'
import { useIntegrationLoad } from '@/composables/useIntegrationError'
import { useIntegrationStore } from '@/stores/integrationStore'
import { channelIndexFor, searchLeaves, suggestLeaves, type ChannelCategoryIndex } from '@/composables/channelCategoryIndex'
import { highlightParts, type HighlightPart } from '@/composables/categoryTree'

const props = withDefaults(defineProps<{
  integrationCode: string
  /** Önden dolu arama + "Önerilen" için yerel kategori adı. */
  localTitle: string
  attach?: string
}>(), { attach: '.cat-manager' })

const model = defineModel<string | number | undefined>({ default: undefined })
const integrationStore = useIntegrationStore()
const listId = `ccp-${useId()}`
const fieldRef = ref<HTMLInputElement | null>(null)
const pickerOpen = ref(false)
const index = ref<ChannelCategoryIndex | null>(null)
const commission = ref<any>(undefined)

const platformTitle = computed(() => integrationStore.getIntegrationTitle(props.integrationCode) || props.integrationCode)

const { status, error: loadError, loading, run } = useIntegrationLoad(() => integrationStore.loadIntegrationCategories(props.integrationCode))

async function load() {
  const result = await run()
  if (result.ok) {
    index.value = channelIndexFor(result.data as any[])
    await nextTick()
    fieldRef.value?.focus()
  } else index.value = null
}

// Önden dolu: yerel kategori adı. Kullanıcı yazdıkça (≥2 harf) kısa gecikmeyle sonuç güncellenir.
const query = ref(props.localTitle ?? '')
const debounced = refDebounced(query, 150)
const activeIndex = ref(0)
const clearQuery = () => { query.value = ''; fieldRef.value?.focus() }
// Esc: önce metni temizler; metin boşsa olay yukarı çıkar (satırdaki diyalog/menü kuralları).
const onEsc = (e: KeyboardEvent) => { if (query.value) { e.stopPropagation(); clearQuery() } }

interface Hit { id: string; segments: HighlightPart[][]; suggested: boolean }

const results = computed<Hit[]>(() => {
  const idx = index.value
  if (!idx) return []
  const q = (debounced.value ?? '').trim()
  const hits = searchLeaves(idx, q, props.localTitle)
  const suggested = new Set(suggestLeaves(idx, props.localTitle).map((h) => h.id))
  const list = hits.map((h) => ({ ...h, suggested: suggested.has(h.id) }))
  list.sort((a, b) => Number(b.suggested) - Number(a.suggested))
  return list.map((h) => ({
    id: h.id,
    suggested: h.suggested,
    segments: h.path.split(' › ').map((seg) => highlightParts(seg, q)),
  }))
})

watch(results, () => { activeIndex.value = 0 })
const activeOptionId = computed(() => (results.value.length ? `${listId}-${activeIndex.value}` : undefined))

function move(delta: number) {
  const n = results.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  nextTick(() => document.getElementById(`${listId}-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' }))
}

function choose(id: string | undefined) {
  if (id == undefined || !index.value) return
  // Kanal kimlikleri sayısal olabilir: seçilen yol string'dir, orijinal tipe geri çevrilir (eski sözleşme).
  model.value = index.value.byId.get(id)?._id ?? id
  pickerOpen.value = false
}
function chooseActive() {
  const hit = results.value[activeIndex.value]
  if (hit) choose(hit.id)
}

const selectedIds = computed<string[]>(() => (model.value == undefined || !index.value?.byId.has(String(model.value)) ? [] : index.value.pathIds(String(model.value))))
const selectedPath = computed(() => (model.value == undefined || !index.value ? '' : index.value.pathText(String(model.value))))
const commissionText = computed(() => (commission.value?.commission != undefined ? `%${commission.value.commission} komisyon` : ''))

watch(model, async (id) => {
  commission.value = undefined
  if (id != undefined) commission.value = await integrationStore.retrieveCommisionForCategoryFromIntegration(props.integrationCode, id as any)
}, { immediate: true })

onMounted(load)
</script>

<style scoped>
.ccp {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ccp__search {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ccp__field {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
}

.ccp__field-icon {
  position: absolute;
  inset-inline-start: var(--ek-space-3);
  color: var(--ek-color-content-muted);
  pointer-events: none;
}

.ccp__input {
  width: 100%;
  height: var(--ek-control-h-field);
  padding: 0 var(--ek-space-8) 0 calc(var(--ek-space-3) + var(--ek-space-5) + var(--ek-space-1));
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font: inherit;
  font-size: var(--ek-type-body-size);
  outline: none;
  transition: var(--ek-transition-colors);
}

.ccp__input::placeholder {
  color: var(--ek-color-content-muted);
  opacity: 1;
}

.ccp__input:focus {
  border-color: var(--ek-color-border-focus);
  box-shadow: var(--ek-focus-ring);
}

.ccp__clear {
  position: absolute;
  inset-inline-end: var(--ek-space-1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  color: var(--ek-color-content-muted);
  cursor: pointer;
}

.ccp__clear:hover {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
}

.ccp__clear:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ccp__hint {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ccp__list {
  display: flex;
  flex-direction: column;
  max-height: 232px;
  margin: 0;
  padding: var(--ek-space-1);
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}

.ccp__group {
  padding: var(--ek-space-2) var(--ek-space-2) var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ccp__opt {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-sm);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ccp__opt.is-active {
  background: var(--ek-color-surface-muted);
}

.ccp__opt.is-picked {
  background: var(--ek-color-action-subtle);
}

.ccp__opt-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--ek-type-caption-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ccp__anc {
  color: var(--ek-color-content-muted);
}

.ccp__leaf {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ccp__sep {
  margin: 0 var(--ek-space-1);
  color: var(--ek-color-content-subtle);
}

.ccp__mark {
  padding: 0;
  background: var(--ek-color-highlight);
  color: inherit;
  border-radius: 2px;
}

.ccp__check {
  flex: none;
  color: var(--ek-color-action);
}

.ccp__selected {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ccp__selected .v-icon {
  flex: none;
  color: var(--ek-color-success-emphasis);
}

.ccp__selected-label {
  color: var(--ek-color-content-muted);
}
</style>
