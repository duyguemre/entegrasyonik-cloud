<!--
  frontend/src/components/catalogPages/CategoryDetail.vue

  B7 — seçili kategori detayı (yalnız CategoryListView). Üstte özet kartı: yol (üst kategorilere bağlantı), ad, tür,
  platform eşleme durumu (veri: AttributeMappingService kategori düzeyi kayıtları). Grupta alt kategoriler hızlı listesi
  + "eksikleri göster". Altta MEVCUT düzenleme/eşleme paneli `CategorySyncComponent` AYNEN (kaydet/sil, platform
  kategori + seçenek eşleme, hata durumları) — ortak bileşen değişmedi, yalnız bu sarmalayıcıda boşluğu hizalandı.
-->
<template>
  <div class="cat-detail">
    <article class="cat-detail__summary" :aria-labelledby="titleId">
      <div class="cat-detail__top">
        <nav v-if="ancestors.length" class="cat-detail__path" aria-label="Kategori yolu">
          <template v-for="(a, i) in ancestors" :key="a.id">
            <button type="button" class="cat-detail__crumb" @click="emit('select', a)">{{ a.title }}</button>
            <span v-if="i < ancestors.length - 1" class="cat-detail__sep" aria-hidden="true">›</span>
          </template>
        </nav>
        <span v-else class="cat-detail__path cat-detail__path--root">Ana kategori</span>
        <EkButton class="cat-detail__close" tone="ghost" size="sm" :icon="icons.close" icon-only aria-label="Seçimi kapat" @click="emit('close')" />
      </div>

      <div class="cat-detail__head">
        <EkIconTile :icon="isGroup ? 'mdi-folder-outline' : 'mdi-tag-outline'" :tone="isGroup ? 'neutral' : 'action'" size="md" />
        <div class="cat-detail__titles">
          <h2 :id="titleId" class="cat-detail__title">{{ node.title }}</h2>
          <p class="cat-detail__meta">
            <template v-if="isGroup">Grup · {{ node.children.length }} alt kategori · {{ stats?.leaves ?? 0 }} yaprak</template>
            <template v-else>Yaprak kategori · ürünler bu seviyeye bağlanır</template>
          </p>
        </div>
      </div>

      <!-- Yaprak: platform platform eşleme durumu -->
      <div v-if="!isGroup" class="cat-detail__block">
        <h3 class="cat-detail__label">Pazaryeri eşlemesi</h3>
        <ul v-if="mapping.length" class="cat-detail__maps">
          <li v-for="m in mapping" :key="m.code" class="cat-detail__map" :class="[channelClass(m.code), m.mapped ? 'is-on' : 'is-off']">
            <span class="cat-detail__map-dot" aria-hidden="true"></span>
            <span class="cat-detail__map-name">{{ m.name }}</span>
            <span class="cat-detail__map-state">
              <v-icon :icon="m.mapped ? 'mdi-check' : 'mdi-minus'" size="14" aria-hidden="true" />{{ m.mapped ? 'Eşli' : 'Eşlenmedi' }}
            </span>
          </li>
        </ul>
        <p v-else class="cat-detail__muted">Bağlı pazaryeri ya da e-ticaret platformu yok.</p>
        <p v-if="mapping.length && mappedCount < mapping.length" class="cat-detail__hint">
          <v-icon icon="mdi-arrow-down" size="14" aria-hidden="true" /> Aşağıdaki <strong>Platform Kategori Eşleştirme</strong> bölümünden platform seçip eşleyin.
        </p>
      </div>

      <!-- Grup: alt kategoriler -->
      <div v-else class="cat-detail__block">
        <div class="cat-detail__block-head">
          <h3 class="cat-detail__label">Alt kategoriler</h3>
          <span v-if="(stats?.missing ?? 0) > 0" class="cat-detail__warn ek-num">{{ stats?.missing }} yaprakta eşleme eksik</span>
          <span v-else-if="platforms.length" class="cat-detail__ok"><v-icon icon="mdi-check" size="14" aria-hidden="true" />Tüm yapraklar eşli</span>
        </div>
        <ul class="cat-detail__children">
          <li v-for="c in node.children" :key="c.id">
            <button type="button" class="cat-detail__child" @click="emit('select', c)">
              <v-icon :icon="c.children.length ? 'mdi-folder-outline' : 'mdi-tag-outline'" size="16" aria-hidden="true" />
              <span class="cat-detail__child-title">{{ c.title }}</span>
              <span v-if="c.children.length" class="cat-detail__child-meta ek-num">{{ c.children.length }}</span>
              <CatMappingDots v-else-if="platforms.length" :states="leafStates(c)" :show-count="false" />
              <v-icon icon="mdi-chevron-right" size="16" class="cat-detail__child-go" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <div class="cat-detail__actions">
          <EkButton tone="secondary" size="sm" icon="mdi-plus" @click="emit('add-child', node)">Alt kategori ekle</EkButton>
          <EkButton v-if="(stats?.missing ?? 0) > 0" tone="ghost" size="sm" icon="mdi-filter-variant" @click="emit('show-missing')">Eksikleri ağaçta göster</EkButton>
        </div>
      </div>
    </article>

    <div class="cat-detail__sync">
      <CategorySyncComponent v-model="syncModel" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import CategorySyncComponent from '@/components/CategorySyncComponent.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import { channelClass } from '@/design/channels'
import { icons } from '@/design/icons'
import CatMappingDots from './CatMappingDots.vue'
import { leafMapping, type CatNode, type CatTree, type GroupStats, type PlatformRef } from './catalogModel'

const props = defineProps<{
  node: CatNode
  tree: CatTree
  index: Map<string, Set<string>>
  platforms: PlatformRef[]
  stats: GroupStats | undefined
}>()
const emit = defineEmits<{ select: [node: CatNode]; close: []; 'add-child': [node: CatNode]; 'show-missing': []; deleted: [] }>()

const titleId = `cat-detail-title-${useId()}`
const isGroup = computed(() => props.node.children.length > 0)
const ancestors = computed(() => {
  const out: CatNode[] = []
  let cur = props.node.parentId ? props.tree.byId.get(props.node.parentId) : undefined
  while (cur) {
    out.unshift(cur)
    cur = cur.parentId ? props.tree.byId.get(cur.parentId) : undefined
  }
  return out
})
const mapping = computed(() => leafMapping(props.node.id, props.index, props.platforms))
const mappedCount = computed(() => mapping.value.filter((m) => m.mapped).length)
const leafStates = (c: CatNode) => leafMapping(c.id, props.index, props.platforms)

// Mevcut panel: seçili kategorinin backend kaydı (derin kopya — panel kendi kopyasını düzenler). Panel silince
// modeli boşaltır → sayfaya "silindi" bildirilir.
const syncModel = ref<any>(JSON.parse(JSON.stringify(props.node.raw)))
watch(
  () => [props.node.id, props.node.title, props.node.children.length] as const,
  () => (syncModel.value = JSON.parse(JSON.stringify(props.node.raw))),
)
watch(syncModel, (v) => {
  if (v === undefined) emit('deleted')
})
</script>

<style scoped>
.cat-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}

.cat-detail__summary {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.cat-detail__top {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: var(--ek-control-h-sm);
}

.cat-detail__path {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px var(--ek-space-1);
  min-width: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.cat-detail__path--root {
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.cat-detail__crumb {
  padding: 2px var(--ek-space-1);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-content-muted);
  font: inherit;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.cat-detail__crumb:hover {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
  text-decoration: underline;
}

.cat-detail__crumb:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.cat-detail__sep {
  color: var(--ek-color-content-subtle);
}

.cat-detail__close {
  flex: none;
  margin-left: auto;
}

.cat-detail__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
}

.cat-detail__titles {
  min-width: 0;
}

.cat-detail__title {
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-detail__meta {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.cat-detail__block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.cat-detail__block-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
}

.cat-detail__label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.cat-detail__maps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cat-detail__map {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}

.cat-detail__map.is-on {
  border-color: var(--ek-ch-border);
  background: var(--ek-ch-subtle);
}

.cat-detail__map-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  box-sizing: border-box;
}

.cat-detail__map.is-on .cat-detail__map-dot {
  background: var(--ek-ch-solid);
}

.cat-detail__map.is-off .cat-detail__map-dot {
  border: 1.5px solid var(--ek-color-border-strong);
}

.cat-detail__map-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-detail__map.is-on .cat-detail__map-name {
  color: var(--ek-ch-text);
}

.cat-detail__map-state {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.cat-detail__map.is-on .cat-detail__map-state {
  color: var(--ek-ch-text);
}

.cat-detail__hint,
.cat-detail__muted {
  display: block;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.cat-detail__hint .v-icon {
  margin-right: 2px;
  vertical-align: -2px;
}

.cat-detail__hint strong {
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-semibold);
}

.cat-detail__warn,
.cat-detail__ok {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 var(--ek-space-2);
  border: 1px solid;
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-type-caption-size);
  line-height: 20px;
}

.cat-detail__warn {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.cat-detail__ok {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.cat-detail__children {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  list-style: none;
}

.cat-detail__children li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.cat-detail__child {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-3);
  border: 0;
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-body-size);
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.cat-detail__child:hover {
  background: var(--ek-color-surface-sunken);
}

.cat-detail__child:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.cat-detail__child .v-icon {
  color: var(--ek-color-content-muted);
}

.cat-detail__child-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-detail__child-meta {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.cat-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

/* Mevcut panelin kendi dış boşluğu (iki bölmeli eski yerleşime göre) bu sarmalayıcıda sıfırlanır. */
.cat-detail__sync :deep(.ek-category-sync) {
  padding: 0;
}

/* Dar kapta (tek bölme) üstteki "← Tüm …" bağlantısı zaten var → kapat düğmesi gizlenir. */
@container (max-width: 919px) {
  .cat-detail__close {
    display: none;
  }
}
</style>
