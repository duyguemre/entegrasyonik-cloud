<!--
  frontend/src/components/ds/templates/EkListScreen.vue

  DS-v2 Aşama 2 — TÜM veri listeleme ekranlarının TEK şablonu (liste standardı).
  EkListFrame + EkFilterPanel + EkActiveFilters + EkBulkBar + EkDataGrid + EkPagerBar
  bileşimidir; ekran yalnız VERİ, KOLON, FİLTRE ALANLARI ve EYLEMLERİ verir.

    başlık  : H1 + açıklama ................. [hızlı arama] [#header-actions] [yenile]
    filtre  : sayfa İÇİ katlanır panel (#filters dolu ise) — popup/overlay DEĞİL,
              yalnız bu sekmenin bileşen örneğinde yaşar → filtre yalnız bu sekmeyi etkiler
    çipler  : aktif filtreler (`chips`), tek tıkla kaldır + Tümünü temizle
    kart    : EkBulkBar (seçim → #bulk-actions; yoksa #toolbar-start/#toolbar-end)
              → EkDataGrid (YALNIZ satırlar kayar, başlık yapışkan)
              → EkPagerBar (kartın ALTINA SABİT; sol boyut+toplam, orta sayfalar, sağ #pager-trailing)
  Durumlar AYRI: yükleniyor (iskelet) · hata (`error`, Tekrar dene) ·
  filtre sonucu boş (`chips` dolu → Filtreleri temizle) · hiç veri yok (`emptyTitle`).
  Hücreler: `#cell-<key>="{ row, item, value }"` doğrudan EkDataGrid'e iletilir.
-->
<template>
  <div class="ek-list-screen">
    <header class="ek-list-screen__head" :class="{ 'is-headless': !title }">
      <div v-if="title" class="ek-list-screen__titles">
        <h1 class="ek-list-screen__title">{{ title }}</h1>
        <p v-if="description" class="ek-list-screen__desc">{{ description }}</p>
      </div>
      <div class="ek-list-screen__head-actions">
        <v-text-field
          v-if="searchPlaceholder !== undefined"
          :model-value="search"
          :label="searchPlaceholder"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
          density="compact"
          class="ek-list-screen__search"
          @update:model-value="(v: string | null) => emit('update:search', v ?? '')"
          @keyup.enter="emit('search-submit')"
          @click:clear="emit('search-submit')"
        />
        <slot name="header-actions" />
        <EkButton v-if="refreshable" tone="ghost" icon="mdi-refresh" icon-only :aria-label="refreshLabel" :loading="loading" @click="emit('refresh')" />
      </div>
    </header>

    <EkListFrame :label="label" class="ek-list-screen__frame">
      <template v-if="$slots.filters || chips.length" #filters>
        <EkFilterPanel
          v-if="$slots.filters"
          :collapsed="collapsedState"
          :active-count="filterCount ?? chips.length"
          :columns="filterColumns"
          :loading="loading"
          @update:collapsed="setCollapsed"
          @submit="emit('filter-submit')"
          @reset="emit('filter-reset')"
        >
          <slot name="filters" />
          <template v-if="$slots['filter-extra-actions']" #extra-actions><slot name="filter-extra-actions" /></template>
        </EkFilterPanel>
        <EkActiveFilters :filters="chips" @remove="(k: string) => emit('remove-chip', k)" @clear="emit('clear-filters')" />
      </template>

      <template v-if="selectable || $slots['toolbar-start'] || $slots['toolbar-end']" #toolbar>
        <EkBulkBar :count="selected.length" :noun="noun" :hint="selectable ? 'Toplu işlem için satır seçin' : ''" @clear="emit('update:selected', [])">
          <template #actions><slot name="bulk-actions" /></template>
          <template #start><slot name="toolbar-start"><span class="ek-list-screen__hint">{{ selectable ? 'Toplu işlem için satır seçin' : '' }}</span></slot></template>
          <template #end><slot name="toolbar-end" /></template>
        </EkBulkBar>
      </template>

      <EkDataGrid
        :columns="columns"
        :rows="rows"
        :label="label"
        :row-key="rowKey"
        :label-key="labelKey ?? rowKey"
        :row-class="rowClass"
        :expanded-keys="expandedKeys"
        :indeterminate-keys="indeterminateKeys"
        :selectable="selectable"
        :selected="selected"
        :sort="sort"
        :loading="loading"
        :skeleton-rows="skeletonRows"
        :error="error"
        :error-title="errorTitle"
        :error-text="errorText"
        :empty-title="isFiltered ? filteredEmptyTitle : emptyTitle"
        :empty-text="isFiltered ? filteredEmptyText : emptyText"
        :empty-icon="isFiltered ? 'mdi-filter-remove-outline' : emptyIcon"
        @update:selected="(k: Array<string | number>) => emit('update:selected', k)"
        @update:sort="(s: EkGridSort) => emit('update:sort', s)"
        @row-click="(r: Record<string, any>) => emit('row-click', r)"
      >
        <template v-for="name in cellSlots" :key="name" #[name]="scope"><slot :name="name" v-bind="scope" /></template>
        <template v-if="$slots.expanded" #expanded="scope"><slot name="expanded" v-bind="scope" /></template>
        <template #empty-action>
          <EkButton v-if="isFiltered" tone="secondary" size="sm" icon="mdi-filter-remove-outline" @click="emit('clear-filters')">Filtreleri temizle</EkButton>
          <slot v-else name="empty-action" />
        </template>
        <template #error-action>
          <EkButton tone="secondary" size="sm" icon="mdi-refresh" @click="emit('refresh')">Tekrar dene</EkButton>
        </template>
      </EkDataGrid>

      <template v-if="total !== undefined" #pager>
        <EkPagerBar
          :page="page"
          :page-size="pageSize"
          :total="total"
          :page-size-options="pageSizeOptions"
          :label="`${label} sayfalama`"
          @update:page="(p: number) => emit('update:page', p)"
          @update:page-size="(s: number) => emit('update:pageSize', s)"
        >
          <template v-if="$slots['pager-trailing']" #trailing><slot name="pager-trailing" /></template>
        </EkPagerBar>
      </template>
    </EkListFrame>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'
import EkListFrame from '../EkListFrame.vue'
import EkFilterPanel from '../EkFilterPanel.vue'
import EkActiveFilters, { type EkActiveFilterChip } from '../EkActiveFilters.vue'
import EkBulkBar from '../EkBulkBar.vue'
import EkDataGrid, { type EkGridColumn, type EkGridSort } from '../EkDataGrid.vue'
import EkPagerBar from '../EkPagerBar.vue'
import EkButton from '../EkButton.vue'

const props = withDefaults(
  defineProps<{
    /** Boşsa başlık bloğu çizilmez (ör. sekmeli bir sayfanın içindeki liste — başlığı taşıyan sayfadır). */
    title?: string
    description?: string
    /** Tablo ve çerçevenin erişilebilir adı. */
    label: string
    /** Seçim çubuğu için nesne adı ("sipariş", "ürün" …). */
    noun?: string
    columns: EkGridColumn[]
    rows: Array<Record<string, any>>
    rowKey?: string
    labelKey?: string
    rowClass?: (row: Record<string, any>) => string | Record<string, boolean> | undefined
    expandedKeys?: Array<string | number>
    indeterminateKeys?: Array<string | number>
    loading?: boolean
    error?: boolean
    errorTitle?: string
    errorText?: string
    search?: string
    searchPlaceholder?: string
    chips?: EkActiveFilterChip[]
    /** Paneldeki aktif filtre sayısı (varsayılan: çip sayısı). */
    filterCount?: number
    filterColumns?: 1 | 2 | 3 | 4
    filterCollapsed?: boolean
    selectable?: boolean
    selected?: Array<string | number>
    sort?: EkGridSort
    page?: number
    pageSize?: number
    /** Tanımsızsa sayfalama çubuğu çizilmez (sayfalamasız liste). */
    total?: number
    pageSizeOptions?: number[]
    skeletonRows?: number
    emptyTitle?: string
    emptyText?: string
    emptyIcon?: string
    filteredEmptyTitle?: string
    filteredEmptyText?: string
    refreshable?: boolean
    refreshLabel?: string
  }>(),
  {
    noun: 'kayıt',
    rowKey: 'id',
    loading: false,
    error: false,
    errorTitle: 'Kayıtlar yüklenemedi',
    errorText: 'Bağlantınızı kontrol edip yeniden deneyin.',
    chips: () => [],
    filterColumns: 4,
    filterCollapsed: undefined,
    selectable: false,
    selected: () => [],
    sort: null,
    page: 1,
    pageSize: 25,
    pageSizeOptions: () => [10, 25, 50, 100],
    skeletonRows: 8,
    emptyTitle: 'Henüz kayıt yok',
    emptyText: 'Kayıtlar oluştuğunda burada listelenir.',
    emptyIcon: 'mdi-tray',
    filteredEmptyTitle: 'Bu filtrelerle kayıt yok',
    filteredEmptyText: 'Filtreleri gevşetin veya temizleyip yeniden sorgulayın.',
    refreshable: true,
    refreshLabel: 'Yenile',
    title: '',
  },
)

const emit = defineEmits<{
  'update:search': [value: string]
  /** Hızlı aramada Enter / temizle — "yazdıkça" değil "Enter ile" arayan ekranlar için. */
  'search-submit': []
  'update:filterCollapsed': [value: boolean]
  'update:selected': [keys: Array<string | number>]
  'update:sort': [sort: EkGridSort]
  'update:page': [page: number]
  'update:pageSize': [size: number]
  'filter-submit': []
  'filter-reset': []
  'remove-chip': [key: string]
  'clear-filters': []
  refresh: []
  'row-click': [row: Record<string, any>]
}>()

const slots = useSlots()
const cellSlots = computed(() => Object.keys(slots).filter((n) => n.startsWith('cell-')))
const isFiltered = computed(() => props.chips.length > 0)

// Panel açık/kapalı durumu: v-model verilmişse dışarıdan, yoksa bu örnekte (sekmeye yerel) tutulur.
// Dar ekranda (<768px) panel kapalı başlar: tablo ilk ekranda görünür kalsın.
const localCollapsed = ref(typeof window !== 'undefined' && window.innerWidth < 768)
const collapsedState = computed(() => props.filterCollapsed ?? localCollapsed.value)
function setCollapsed(v: boolean) {
  localCollapsed.value = v
  emit('update:filterCollapsed', v)
}
</script>

<style scoped>
.ek-list-screen {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  height: 100%;
  min-height: 0;
}

.ek-list-screen__head {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3) var(--ek-space-4);
}

.ek-list-screen__head.is-headless .ek-list-screen__head-actions {
  flex: 1;
  justify-content: flex-start;
}

.ek-list-screen__head.is-headless .ek-list-screen__search {
  flex: 0 1 420px;
}

.ek-list-screen__titles {
  min-width: 0;
}

.ek-list-screen__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
}

.ek-list-screen__desc {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-list-screen__head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}

.ek-list-screen__search {
  width: 340px;
  max-width: 100%;
}

.ek-list-screen__frame {
  flex: 1;
  min-height: 0;
}

.ek-list-screen__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

@media (max-width: 767px) {
  .ek-list-screen {
    height: auto;
  }

  .ek-list-screen__head-actions,
  .ek-list-screen__search {
    width: 100%;
  }

  .ek-list-screen__search {
    flex: 1;
  }
}
</style>
