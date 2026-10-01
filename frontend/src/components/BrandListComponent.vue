<!--
  Marka listesi (standart liste iskeleti: EkListScreen). Üstte EkPageBar (Katalog › Markalar + ampul +
  `#status`ta "N marka · M eksik eşleme"), altında çerçevesiz araç şeridi: solda arama (36px) + segment
  [Tümü | Eksik eşlemeli], sağ uçta birincil "+ Yeni marka".
  Satır: 28px mavi kutucuk + ad (13px semibold, gerçek düğme → Enter açar) + meta ("2 kanalda eşli · 1 eksik");
  sağda kanal kapsamı karoları (eşli kanal = kısa rozet + ✓, eşlenmemişler tek soluk "+n"). Satır tıklanınca/Enter ile detay
  paneli açılır (üst ekran), seçili satır vurgulu; ↑/↓ satır adları arasında gezinir.
  Yeni marka: listenin en üstünde satır içi satır (odaklı ad alanı, Enter ekler, Esc vazgeçer; boş/aynı ad uyarısı satır içinde).
  Kaydedilince yeni marka seçilir ve detay (eşleme akışı) açılır. İstek: BrandService/addBrand (gövde DEĞİŞMEDİ).
-->
<template>
  <div class="bl" @keydown="onNavKey">
    <EkListScreen
      section="Katalog"
      title="Markalar"
      description="Markalarınızı tanımlayın ve her markayı bağlı kanallardaki karşılığıyla eşleyin."
      label="Marka listesi"
      noun="marka"
      row-key="_id"
      label-key="title"
      :columns="columns"
      :rows="tableRows"
      :row-class="(r) => (r._id === selectedId ? 'bl-row-open' : undefined)"
      :loading="loading"
      :error="loadError"
      error-title="Markalar yüklenemedi"
      error-text="Bağlantınızı kontrol edip tekrar deneyin."
      v-model:search="searchText"
      search-placeholder="Marka ara"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="filtered.length"
      :empty-title="hasBrands ? 'Marka bulunamadı' : 'Henüz marka yok'"
      :empty-text="hasBrands ? 'Arama veya filtreye uyan marka yok. Yazımı kontrol edin ya da filtreyi temizleyin.' : 'Ürünlerinizi gruplamak ve kanallardaki markalarla eşlemek için ilk markanızı ekleyin.'"
      empty-icon="mdi-tag-multiple-outline"
      refresh-label="Yenile"
      @update:sort="(s) => { gridSort = s; pagination.page = 1 }"
      @update:page="(p) => (pagination.page = p)"
      @update:page-size="(n) => { pagination.limit = n; pagination.page = 1 }"
      @row-click="(r) => !r.__new && emit('select', r)"
      @refresh="reload()"
    >
      <template #status>
        <EkStatusChip v-if="hasBrands" tone="neutral" :label="`${allBrands.length} marka`" />
        <EkStatusChip v-if="missingCount > 0" tone="warning" icon="mdi-minus-circle-outline" :label="`${missingCount} eksik eşleme`" />
      </template>

      <template #search-append>
        <div class="bl-seg" role="group" aria-label="Marka filtresi">
          <button type="button" class="bl-seg__btn" :class="{ 'is-on': segment === 'all' }" :aria-pressed="segment === 'all'"
            @click="setSegment('all')">Tümü</button>
          <button type="button" class="bl-seg__btn" :class="{ 'is-on': segment === 'missing' }" :aria-pressed="segment === 'missing'"
            @click="setSegment('missing')">Eksik eşlemeli</button>
        </div>
      </template>

      <template #create>
        <EkButton tone="primary" icon="mdi-plus" class="bl-new" @click="startAdd()">Yeni marka</EkButton>
      </template>

      <template #empty-action>
        <EkButton v-if="!hasBrands" tone="primary" icon="mdi-plus" @click="startAdd()">İlk markanı ekle</EkButton>
        <EkButton v-else tone="secondary" size="sm" icon="mdi-filter-remove-outline" @click="clearFilters()">Filtreleri temizle</EkButton>
      </template>

      <template #cell-title="{ row }">
        <div v-if="row.__new" class="bl-title-row">
          <span class="ek-brand-tile" aria-hidden="true"><v-icon icon="mdi-tag-plus-outline" /></span>
          <v-text-field v-model="newTitle" autofocus clearable maxlength="160" density="compact" variant="outlined"
            hide-details="auto" autocomplete="off" label="Yeni marka adı" class="bl-new-input"
            :error-messages="newError" :disabled="newSaving" @update:model-value="newTouched = true"
            @keyup.enter="submitNew()" @keyup.esc="cancelAdd()" />
        </div>
        <div v-else class="bl-title-row">
          <span class="ek-brand-tile" aria-hidden="true"><v-icon icon="mdi-tag-outline" /></span>
          <button type="button" class="bl-name" data-brand-open :aria-label="`${row.title} ayrıntısını aç. ${metaOf(row).text}`"
            @click.stop="emit('select', row)">
            <span class="bl-name__title">{{ row.title }}</span>
            <span class="bl-name__meta" :class="metaOf(row).tone">{{ metaOf(row).text }}</span>
          </button>
        </div>
      </template>

      <template #cell-channels="{ row }">
        <span v-if="row.__new" class="bl-muted"></span>
        <span v-else-if="!mappableChannels.length" class="bl-muted">—</span>
        <span v-else class="bl-ch" role="img" :aria-label="coverageLabel(row)">
          <ChannelStatusTile v-for="c in summarize(row).mapped" :key="c.code" :status="liveStatus(c.code)" :name="c.title" size="xs" />
          <span v-if="summarize(row).missing.length" class="bl-absent" :title="`Eşlenmemiş: ${summarize(row).missing.map((c) => c.title).join(', ')}`">
            <span aria-hidden="true">+{{ summarize(row).missing.length }}</span>
          </span>
        </span>
      </template>

      <template #cell-actions="{ row }">
        <div v-if="row.__new" class="bl-new-actions">
          <EkButton tone="primary" size="sm" icon="mdi-check" icon-only aria-label="Markayı ekle" :loading="newSaving"
            :disabled="!!newError || !newTitle?.trim()" @click="submitNew()" />
          <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Eklemekten vazgeç" :disabled="newSaving"
            @click="cancelAdd()" />
        </div>
        <EkRowActions v-else :label="`${row.title} işlemleri`" :items="[
          { key: 'open', action: 'edit', label: `${row.title} ayrıntısı ve eşlemeleri`, onClick: () => emit('select', row) },
          { key: 'delete', action: 'delete', label: `${row.title} markasını sil`, onClick: () => emit('delete', row) },
        ]" />
      </template>
    </EkListScreen>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeMount, reactive, ref, watch } from 'vue'
import { EkButton, EkRowActions, EkStatusChip } from '@entegrasyonik/ui/components'
import type { EkGridColumn, EkGridSort } from '@entegrasyonik/ui/components'
import { sortRows } from '@entegrasyonik/ui/components/listStandard'
import EkListScreen from '@/components/page/templates/EkListScreen.vue'
import ChannelStatusTile from '@/components/productDefinitions/products/ChannelStatusTile.vue'
import './brands/brands.css'
import useRestApi from '@/composables/restapi'
import { useBrandsStore } from '@/stores/brandsStore'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useBrandChannels } from '@/composables/brandChannels'

defineProps<{ selectedId?: string }>()
const emit = defineEmits<{ select: [brand: any]; delete: [brand: any] }>()

const brandsStore = useBrandsStore()
const snackbarStore = useSnackbarStore()
const restApi = useRestApi()
const { mappableChannels, summarize } = useBrandChannels()
const brandsRef = brandsStore.getBrands()

const loading = ref(true)
const loadError = ref(false)
const searchText = ref('')
const segment = ref<'all' | 'missing'>('all')
const gridSort = ref<EkGridSort>(null)
const pagination = reactive({ page: 1, limit: 25 })

const allBrands = computed<any[]>(() => (brandsRef.value ?? []).filter((b: any) => !b.isMain))
const hasBrands = computed(() => allBrands.value.length > 0)
const hasMissing = (b: any) => { const s = summarize(b); return s.total > 0 && s.missing.length > 0 }
const missingCount = computed(() => allBrands.value.filter(hasMissing).length)

const filtered = computed(() => {
  const q = searchText.value?.trim().toLocaleLowerCase('tr') ?? ''
  let list = allBrands.value
  if (q) list = list.filter((b: any) => (b.title ?? '').toLocaleLowerCase('tr').includes(q))
  if (segment.value === 'missing') list = list.filter(hasMissing)
  return list
})

const pagedBrands = computed(() => {
  const start = (pagination.page - 1) * pagination.limit
  return sortRows(filtered.value, gridSort.value).slice(start, start + pagination.limit)
})

watch([searchText, segment], () => { pagination.page = 1 })

// --- Yeni marka (satır içi, listenin en üstünde) ---
const adding = ref(false)
const newTitle = ref<string | null>('')
const newTouched = ref(false)
const newSaving = ref(false)
const newFailed = ref(false)

const tableRows = computed(() => (adding.value ? [{ _id: '__new__', __new: true }, ...pagedBrands.value] : pagedBrands.value))

const newError = computed(() => {
  if (newFailed.value) return 'Marka eklenemedi — bağlantınızı kontrol edip tekrar deneyin.'
  const v = (newTitle.value ?? '').trim()
  if (!v) return newTouched.value ? 'Marka adı boş olamaz.' : ''
  if (v.length < 2 || v.length > 160) return 'Marka adı 2–160 karakter olmalı.'
  const dup = allBrands.value.some((b: any) => (b.title ?? '').toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr'))
  return dup ? 'Bu adda bir marka zaten var.' : ''
})
watch(newTitle, () => { newFailed.value = false })

const startAdd = () => {
  newTitle.value = ''
  newTouched.value = false
  newFailed.value = false
  adding.value = true
  pagination.page = 1
  nextTick(() => (document.querySelector('.bl-new-input input') as HTMLInputElement | null)?.focus())
}
const cancelAdd = () => { adding.value = false; newTitle.value = '' }

const submitNew = async () => {
  newTouched.value = true
  const title = (newTitle.value ?? '').trim()
  if (!title || newError.value || newSaving.value) return
  newSaving.value = true
  const response = await restApi.post('BrandService/addBrand', { title })
  newSaving.value = false
  if (response && response._id) {
    adding.value = false
    newTitle.value = ''
    await brandsStore.retrieve()
    snackbarStore.addSnackbar({ show: true, text: 'Marka eklendi', timeout: 2000, color: 'success' })
    const created = allBrands.value.find((b: any) => b._id === response._id)
    if (created) emit('select', created)
  } else {
    newFailed.value = true
  }
}

const setSegment = (s: 'all' | 'missing') => { segment.value = s }
const clearFilters = () => { searchText.value = ''; segment.value = 'all' }

// --- Yükleme ---
const reload = async () => {
  loading.value = true
  loadError.value = false
  const result = await brandsStore.retrieve()
  loadError.value = !Array.isArray(result)
  loading.value = false
}
onBeforeMount(() => reload())

// --- Hücre yardımcıları ---
const metaOf = (brand: any) => {
  const s = summarize(brand)
  if (!s.total) return { text: 'Bağlı kanal yok', tone: '' }
  if (!s.missing.length) return { text: `${s.mapped.length} kanalda eşli`, tone: 'is-ok' }
  if (!s.mapped.length) return { text: `Hiçbir kanalda eşli değil · ${s.missing.length} eksik`, tone: 'is-warn' }
  return { text: `${s.mapped.length} kanalda eşli · ${s.missing.length} eksik`, tone: 'is-warn' }
}

const liveStatus = (code: string): any => ({ code, key: 'live', tone: 'success', icon: 'mdi-check-circle-outline', label: 'Eşli', ready: false, counts: { live: 1, offsale: 0, failed: 0, waiting: 0, none: 0, total: 1 } })

const coverageLabel = (brand: any) => {
  const s = summarize(brand)
  const parts: string[] = []
  if (s.mapped.length) parts.push(`Eşli: ${s.mapped.map((c) => c.title).join(', ')}`)
  if (s.missing.length) parts.push(`Eşlenmemiş: ${s.missing.map((c) => c.title).join(', ')}`)
  return parts.join('. ')
}

// ↑/↓: marka adı düğmeleri arasında gezinir (Enter düğmenin kendi davranışıyla detayı açar).
const onNavKey = (e: KeyboardEvent) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const target = e.target as HTMLElement
  if (!target?.closest?.('[data-brand-open]')) return
  const all = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-brand-open]'))
  const i = all.indexOf(target.closest('[data-brand-open]') as HTMLElement)
  const next = all[i + (e.key === 'ArrowDown' ? 1 : -1)]
  if (next) { e.preventDefault(); next.focus() }
}

const columns: EkGridColumn[] = [
  { key: 'title', label: 'Marka', sortable: true, wrap: true },
  { key: 'channels', label: 'Kanal eşlemeleri' },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]

defineExpose({ reload, startAdd })
</script>

<style scoped>
.bl {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.bl-title-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) 0;
  min-width: 0;
}

.bl-name {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: start;
  cursor: pointer;
  border-radius: var(--ek-radius-sm);
}

.bl-name:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bl-name__title {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
}

.bl-name__meta {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-regular);
}

.bl-name__meta.is-ok { color: var(--ek-color-success-emphasis); }
.bl-name__meta.is-warn { color: var(--ek-color-warning-emphasis); }

.bl-new-input {
  flex: 1;
  min-width: 160px;
  max-width: 360px;
}

.bl-new-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.bl-muted {
  color: var(--ek-color-content-subtle);
}

/* Kanal kapsamı: ürün listesindeki karo dili — eşli kanallar rozet + ✓, eşlenmeyenler tek soluk "+n". */
.bl-ch {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px var(--ek-space-2);
}

.bl-absent {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-chip);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

/* Segment filtre: iki konumlu, etkin = site mavisi. */
.bl-seg {
  display: inline-flex;
  flex: none;
  padding: 2px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}

.bl-seg__btn {
  height: 30px;
  padding: 0 var(--ek-space-3);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  color: var(--ek-color-content-muted);
  font: inherit;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bl-seg__btn:hover {
  color: var(--ek-color-content-default);
}

.bl-seg__btn.is-on {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
}

.bl-seg__btn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

/* Seçili (detayı açık) satır. */
:deep(.bl-row-open) > td {
  background: var(--ek-color-action-subtle) !important;
}

:deep(.bl-row-open) > td:first-child {
  box-shadow: inset 3px 0 0 var(--ek-color-action) !important;
}

/* Sayfanın birincil eylemi; dar ekranda yalnız "+" (etiket ekran okuyucuya açık). */
@media (max-width: 599px) {
  .bl-new {
    gap: 0;
    min-width: var(--ek-control-h-md);
    padding-inline: 0;
    justify-content: center;
  }

  .bl-new :deep(.ek-btn__label) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>

<style>
/* Arama + segment aynı şeritte: arama alanı biraz daha geniş pay alır. */
.brandDefinition .ek-list-screen__strip-search {
  flex-basis: 520px;
}

@media (max-width: 599px) {
  .brandDefinition .ek-list-screen__strip-search {
    flex-wrap: wrap;
  }
}
</style>
