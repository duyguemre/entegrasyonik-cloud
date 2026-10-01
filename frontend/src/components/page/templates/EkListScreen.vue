<!--
  frontend/src/components/page/templates/EkListScreen.vue

  DS-v2 Aşama 2 — TÜM veri listeleme ekranlarının TEK şablonu (liste standardı).
  EkListFrame + EkFilterPanel + EkActiveFilters + EkBulkBar + EkDataGrid + EkPagerBar
  bileşimidir; ekran yalnız VERİ, KOLON, FİLTRE ALANLARI ve EYLEMLERİ verir.

    başlık  : H1 + açıklama ................. [hızlı arama] [#header-actions] [yenile]
              #search-append: arama kutusunun hemen yanında (MOB-03 barkod düğmesi; yalnız telefon/tablet)
    filtre  : sayfa İÇİ katlanır panel (#filters dolu ise) — popup/overlay DEĞİL,
              yalnız bu sekmenin bileşen örneğinde yaşar → filtre yalnız bu sekmeyi etkiler
    çipler  : aktif filtreler (`chips`) — A8: filtre panelinin BAŞLIĞINDA kompakt özet (kapalıyken de görünür),
              tek tıkla kaldır + Temizle; panelsiz listede ayrı satır (`EkActiveFilters`)
    kart    : EkBulkBar (seçim → #bulk-actions; yoksa #toolbar-start/#toolbar-end)
              → EkDataGrid (YALNIZ satırlar kayar, başlık yapışkan)
              → EkPagerBar (kartın ALTINA SABİT; sol boyut+toplam, orta sayfalar, sağ #pager-trailing)
  Durumlar AYRI: yükleniyor (iskelet) · hata (`error`, Tekrar dene) ·
  filtre sonucu boş (`chips` dolu → Filtreleri temizle) · hiç veri yok (`emptyTitle`).
  Hücreler: `#cell-<key>="{ row, item, value }"` doğrudan EkDataGrid'e iletilir.
  C2.4 (geri uyumlu): `saved-views` verilirse filtre başlığında "Görünümler" menüsü
  (EkSavedViews) açılır; uygulanan görünüm `apply-view` ile ekrana döner.
-->
<template>
  <div class="ek-list-screen">
    <!-- Aşama 5: başlık = EkPageBar (bölüm › H1 (i) … arama + eylemler tek satırda; açıklama "Sayfa hakkında" panelinde). -->
    <header v-if="title" class="ek-list-screen__head">
      <EkPageBar :section="section" :section-icon="sectionIcon" :trail="trail" :record="record" :title="title" :description="description" :tips="tips ?? autoTips"
        :refreshable="refreshable" :refreshing="loading" :refresh-label="refreshLabel" @refresh="emit('refresh')">
        <template #actions>
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
            <slot name="search-append" />
            <span v-if="$slots['header-actions']" class="ek-list-screen__extra"><slot name="header-actions" /></span>
          </div>
        </template>
      </EkPageBar>
    </header>
    <header v-else v-show="!hostedTarget" class="ek-list-screen__head is-headless">
      <!-- P03 (K49): sekmeli ekranda etkin sekmenin arama + ek eylemler + yenile'si sayfa başlık çubuğuna taşınır
           (EkPageHeader `tools-id`); sekme kendi gövdesinde araç satırı taşımaz. -->
      <Teleport defer :to="hostedTarget || 'body'" :disabled="!hostedTarget">
      <div class="ek-list-screen__head-actions" :class="{ 'is-hosted': !!hostedTarget }">
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
        <slot name="search-append" />
        <span v-if="$slots['header-actions']" class="ek-list-screen__extra"><slot name="header-actions" /></span>
        <span v-if="refreshable" class="ek-list-screen__refresh"><EkRefreshButton :loading="loading" :label="refreshLabel" @refresh="emit('refresh')" /></span>
      </div>
      </Teleport>
    </header>

    <!-- Aşama 3: başlık ile liste arasında özet (KPI satırı vb.) — başlığın ÜSTÜNE konmasın (hiyerarşi). -->
    <div v-if="$slots.summary" class="ek-list-screen__summary"><slot name="summary" /></div>

    <EkListFrame :label="label" class="ek-list-screen__frame">
      <template v-if="$slots.filters || chips.length" #filters>
        <EkFilterPanel
          v-if="$slots.filters"
          :collapsed="collapsedState"
          :active-count="filterCount ?? chips.length"
          :columns="filterColumns"
          :loading="loading"
          :chips="chips"
          @update:collapsed="setCollapsed"
          @submit="emit('filter-submit')"
          @reset="emit('filter-reset')"
          @remove-chip="(k: string) => emit('remove-chip', k)"
          @clear="emit('clear-filters')"
        >
          <slot name="filters" />
          <template v-if="savedViews" #head-actions>
            <EkSavedViews v-bind="savedViews" @apply="(p: Record<string, any>) => emit('apply-view', p)" />
          </template>
          <template v-if="$slots['filter-extra-actions']" #extra-actions><slot name="filter-extra-actions" /></template>
        </EkFilterPanel>
        <!-- A8: çipler filtre panelinin BAŞLIĞINDA (kompakt özet); panelsiz listede ayrı satır. -->
        <EkActiveFilters v-else :filters="chips" @remove="(k: string) => emit('remove-chip', k)" @clear="emit('clear-filters')" />
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
        :channel-key="channelKey"
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
        :error-cause="errorCause"
        :error-details="errorDetails"
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

      <template v-if="total !== undefined && !error && !(loading && !rows.length)" #pager>
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
import { computed, inject, onActivated, onDeactivated, ref, useSlots } from 'vue'
import { LIST_TOOLS_TARGET } from '../listTools'
import { EkListFrame, EkFilterPanel, EkActiveFilters, type EkActiveFilterChip, EkBulkBar, EkDataGrid, type EkGridColumn, type EkGridSort, EkPagerBar, EkButton, EkRefreshButton } from '@entegrasyonik/ui/components'
import EkSavedViews, { type EkSavedViewsConfig } from '../EkSavedViews.vue'
import EkPageBar from '../EkPageBar.vue'
import type { EkCrumb, EkRecordRef } from '@entegrasyonik/ui/components/pageTrail'
import { provideRefreshState } from '@entegrasyonik/ui/components/refreshState'
import { defaultListPageSize } from '@/stores/publicConfig'

const props = withDefaults(
  defineProps<{
    /** Boşsa başlık bloğu çizilmez (ör. sekmeli bir sayfanın içindeki liste — başlığı taşıyan sayfadır). */
    title?: string
    /** Bölüm yolu (breadcrumb) — sol menüdeki bölüm adı (ör. "Satış"); EkPageHeader ile aynı ritim. */
    section?: string
    /** A7: breadcrumb (EkPageBar) — kök ikonu, üst ekranlar, kayıt kimliği. */
    sectionIcon?: string
    trail?: EkCrumb[]
    record?: EkRecordRef | null
    /** Sayfanın amacı — Aşama 5: "Sayfa hakkında" (i) panelinde. */
    description?: string
    /** Panel ipuçları; verilmezse listenin yeteneklerinden (arama, filtre, seçim, sıralama, görünümler) üretilir. */
    tips?: string[]
    /** Tablo ve çerçevenin erişilebilir adı. */
    label: string
    /** Seçim çubuğu için nesne adı ("sipariş", "ürün" …). */
    noun?: string
    columns: EkGridColumn[]
    rows: Array<Record<string, any>>
    rowKey?: string
    labelKey?: string
    rowClass?: (row: Record<string, any>) => string | Record<string, boolean> | undefined
    /** Satırın kanal kodu alanı → satır solunda kanal şeridi (EkDataGrid `channelKey`). */
    channelKey?: string
    expandedKeys?: Array<string | number>
    indeterminateKeys?: Array<string | number>
    loading?: boolean
    error?: boolean
    errorTitle?: string
    errorText?: string
    /** Aşama 6b: olası neden + katlanır teknik ayrıntı (bkz. `problemFromError`). */
    errorCause?: string
    errorDetails?: Array<{ label: string; value: string }>
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
    /** C2.4 kayıtlı görünümler — verilmezse menü yok (geri uyumlu). */
    savedViews?: EkSavedViewsConfig
    /**
     * P03: başlıksız (sekme) listede araç satırının taşınacağı sayfa başlığı yuvası (CSS seçici). Verilmezse sayfanın
     * sağladığı yuva (`provideListToolsTarget`) kullanılır; `false` → yerinde kalır (ör. `v-show` ile gizlenen sekme).
     */
    toolsTarget?: string | false
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
    // FE-CFG-1: varsayılan boyut backoffice ayarı (`ui.listPageSize`); ekran kendi değerini verirse o geçer.
    pageSize: () => defaultListPageSize(),
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
    section: undefined,
    toolsTarget: undefined,
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
  /** Seçilen görünümün filtreleri (ekranın okuduğu şekilde; çoklu alanlar dizi). */
  'apply-view': [params: Record<string, any>]
}>()

// P03: sayfa başlığındaki araç yuvası. KeepAlive ile önbelleğe alınan sekme pasifken yuvayı bırakır (iki sekmenin
// araçları üst üste binmesin); yalnız başlıksız listede geçerlidir.
const injectedToolsTarget = inject(LIST_TOOLS_TARGET, null)
const keepAliveActive = ref(true)
onActivated(() => (keepAliveActive.value = true))
onDeactivated(() => (keepAliveActive.value = false))
const hostedTarget = computed(() => {
  if (props.title || props.toolsTarget === false || !keepAliveActive.value) return ''
  return props.toolsTarget || injectedToolsTarget || ''
})

const slots = useSlots()
const cellSlots = computed(() => Object.keys(slots).filter((n) => n.startsWith('cell-')))
const isFiltered = computed(() => props.chips.length > 0)

/** Listenin GERÇEKTEN sunduğu yeteneklerden kısa kullanım ipuçları (uydurma özellik anlatılmaz). */
const autoTips = computed(() => {
  const tips: string[] = []
  if (props.searchPlaceholder !== undefined) tips.push(`Arama kutusunda arayın (${props.searchPlaceholder.replace(/\s+Ara$/i, '').toLocaleLowerCase('tr-TR')}).`)
  if (slots.filters) tips.push('Filtreler panelini başlığından açıp kapatın; uygulanan filtreler çip olarak görünür ve tek tıkla kaldırılır.')
  if (props.savedViews) tips.push('Sık kullandığınız filtreleri "Görünümler" menüsüyle kaydedip tek tıkla uygulayın.')
  if (props.columns.some((c) => c.sortable)) tips.push('Sıralamak için kolon başlığına tıklayın; ikinci tıklama yönü değiştirir.')
  if (props.selectable) tips.push(`Toplu işlem için ${props.noun} satırlarını seçin; eylemler tablonun üstünde belirir.`)
  return tips
})

// A8: başlıktaki yenile düğmesi liste hatasını gösterir (kırmızı nokta + ipucu) — EkPageBar'a prop taşımadan.
provideRefreshState(() => ({ error: props.error }))

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
  /* P15 (K49): liste kartı asgari yükseklikten (EkListFrame) aşağı ezilmez; sığmazsa ekran KENDİ içinde kayar.
     4px iç pay + eşit negatif dış pay: kaydırma kabı kart gölgesini ve odak halkasını kırpmasın. */
  height: calc(100% + 2 * var(--ek-space-1));
  min-height: 0;
  margin: calc(-1 * var(--ek-space-1));
  padding: var(--ek-space-1);
  overflow-y: auto;
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

.ek-list-screen__extra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-list-screen__frame {
  flex: 1;
  min-height: 0;
}

.ek-list-screen__summary {
  flex: none;
}
/* Yuva içeriği koşullu (v-if) boşalabilir: boş sarmalayıcı boşluk üretmesin. */
.ek-list-screen__summary:empty {
  display: none;
}

@media (min-width: 1024px) {
  .ek-list-screen__head:not(.is-headless) .ek-list-screen__head-actions {
    flex-wrap: nowrap;
  }
}

.ek-list-screen__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

@media (max-width: 767px) {
  .ek-list-screen {
    height: auto;
    overflow-y: visible;
  }

  .ek-list-screen__head-actions {
    width: 100%;
  }

  /* Aşama 4: arama + yenile ilk satırda; metinli eylemler sığmazsa alt satıra (yenile tek başına kalmaz). */
  .ek-list-screen__extra {
    order: 2;
  }

  /* Aşama 3: mobilde arama geniş tabanlı (220px); yalnız "yenile" varsa aynı satırda kalır, metinli birincil
     eylem varsa birincil + yenile birlikte alt satıra geçer — yenile tek başına bir satır kaplamaz. */
  .ek-list-screen__search,
  .ek-list-screen__head.is-headless .ek-list-screen__search {
    /* Aşama 4: 160px taban — arama + metinli birincil eylem + yenile 390px'te TEK satır (yenile tek başına alt
       satıra düşüyordu, ör. Ürünler). */
    flex: 1 1 160px;
    width: auto;
  }
}
</style>
