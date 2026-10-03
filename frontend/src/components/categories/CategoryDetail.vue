<!--
  frontend/src/components/categories/CategoryDetail.vue

  Seçili kategorinin DETAY paneli (masaüstünde sağ panel, dar ekranda tam ekran sayfa):
    başlık : üst kategori yolu (muted) · ad (satır içi düzenlenebilir: kalem → alan → Enter / Esc) · ⋯ menüsü
    gövde  : yaprak kategori → "Kanal eşlemeleri" (bağlı TÜM kanallar alt alta; CategoryChannelRow)
             üst kategori   → eşlemenin yalnız uç kategorilerde yapıldığı bilgisi + eksik uç kategoriler listesi
  API çağrılarını CategoryManager yapar (`rename` yalnız sonucu bekler); burada yalnız sunum ve yerel düzenleme durumu.
-->
<template>
  <section class="cat-detail" :aria-labelledby="titleId">
    <header class="cat-detail__head">
      <EkButton v-if="showBack" class="cat-detail__back" tone="ghost" size="sm" icon="mdi-arrow-left" @click="emit('back')">Kategoriler</EkButton>
      <!-- FE-LOCAL-1048: tür etiketi (kısa eylem çizgisiyle) + üst kategori yolu — kayıt sayfası başlığıyla aynı dil. -->
      <p class="cat-detail__path">
        <span class="cat-detail__kind">{{ node.children.length ? 'Üst kategori' : 'Uç kategori' }}</span>
        <span class="cat-detail__crumb">{{ node.path.length > 1 ? node.path.slice(0, -1).join(' › ') : 'Üst düzey kategori' }}</span>
      </p>
      <div class="cat-detail__titlerow">
        <span class="cat-detail__tile" aria-hidden="true"><v-icon :icon="node.children.length ? 'mdi-folder-outline' : 'mdi-tag-outline'" size="20" /></span>
        <template v-if="!renaming">
          <h2 :id="titleId" class="cat-detail__title">{{ node.title }}</h2>
          <EkActionButton action="edit" label="Kategori adını düzenle" @click="startRename" />
        </template>
        <form v-else class="cat-detail__rename" @submit.prevent="submitRename">
          <input ref="renameRef" v-model="draft" class="cat-detail__input" type="text" maxlength="160" autocomplete="off"
            aria-label="Kategori adı" :aria-invalid="!!renameError" :disabled="renameBusy" @keydown.esc.prevent.stop="cancelRename" />
          <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Vazgeç" :disabled="renameBusy" @click="cancelRename" />
          <EkButton tone="primary" size="sm" icon="mdi-check" icon-only type="submit" aria-label="Adı kaydet" :loading="renameBusy" />
        </form>
        <span class="cat-detail__spacer" />
        <EkContextMenu :groups="menuGroups" :label="`${node.title} işlemleri`" @select="(i: EkMenuItem) => emit('action', i.key as ActionKey)">
          <template #activator="{ props: act }">
            <EkButton v-bind="act" tone="ghost" size="sm" icon="mdi-dots-horizontal" icon-only :aria-label="`${node.title} işlemleri`" data-action="more" />
          </template>
        </EkContextMenu>
      </div>
      <p v-if="renameError" class="cat-detail__error" role="alert">{{ renameError }}</p>
    </header>

    <!-- FE-LOCAL-1048: özet hücreleri (ince çizgiyle ayrılan bilgi şeridi). -->
    <dl class="cat-detail__facts">
      <div v-for="f in facts" :key="f.label" class="cat-detail__fact" :class="f.tone ? `is-${f.tone}` : undefined">
        <dt>{{ f.label }}</dt>
        <dd class="ek-num">{{ f.value }}</dd>
      </div>
    </dl>

    <div class="cat-detail__body">
      <!-- Yaprak: kanal eşlemeleri -->
      <template v-if="!node.children.length">
        <div class="cat-detail__sechead">
          <h3 class="cat-detail__section">Kanal eşlemeleri</h3>
          <EkHelpHint hint="mapping.category" />
        </div>
        <EkErrorState v-if="mappingError" size="inline" message="Eşleme durumu alınamadı — Bağlantınızı kontrol edip tekrar deneyin."
          @retry="emit('retry-mappings')" />
        <p v-else-if="!channels.length" class="cat-detail__note">
          <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
          <span>Bağlı bir pazaryeri ya da e-ticaret kanalı yok. Entegrasyonlar bölümünden bir kanal bağladığınızda burada eşleyebilirsiniz.</span>
        </p>
        <ul v-else class="cat-detail__rows" aria-label="Kanal eşlemeleri">
          <CategoryChannelRow v-for="ch in channels" :key="`${node.id}-${ch.code}`" :channel="ch" :category="node"
            :mapped-id="mappingFor(ch.code)" :ready="mappingReady" @saved="emit('mapping-saved')" />
        </ul>
      </template>

      <!-- Üst kategori: eşleme uç kategorilerde -->
      <template v-else>
        <h3 class="cat-detail__section">Kanal eşlemeleri</h3>
        <p class="cat-detail__note">
          <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
          <span>Kanal eşlemesi yalnızca alt kategorisi olmayan (uç) kategorilerde yapılır. Bu kategorinin altında
            <strong class="ek-num">{{ ownCoverage?.leafCount ?? 0 }}</strong> uç kategori var<template v-if="channels.length && mappingReady">;
            <strong class="ek-num">{{ ownCoverage?.incompleteLeafCount ?? 0 }}</strong> tanesinde eksik eşleme bulunuyor</template>.</span>
        </p>
        <template v-if="incompleteLeaves.length">
          <h3 class="cat-detail__section">Eşlemesi eksik uç kategoriler</h3>
          <ul class="cat-detail__leaves" aria-label="Eşlemesi eksik uç kategoriler">
            <li v-for="leaf in incompleteLeaves" :key="leaf.id">
              <button type="button" class="cat-detail__leaf" @click="emit('select', leaf.id)">
                <span class="cat-detail__leaf-path">{{ leaf.path.slice(node.path.length).join(' › ') }}</span>
                <span class="cat-detail__leaf-miss">{{ missingText(leaf.id) }}</span>
                <v-icon icon="mdi-chevron-right" size="16" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <p v-if="hiddenLeafCount > 0" class="cat-detail__more">ve {{ hiddenLeafCount }} uç kategori daha — ağaçta “Eksik eşlemeli” süzgecini kullanın.</p>
        </template>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { EkActionButton, EkButton, EkContextMenu, EkErrorState } from '@entegrasyonik/ui/components'
import type { EkMenuGroup, EkMenuItem } from '@entegrasyonik/ui/components'
import EkHelpHint from '@/components/page/EkHelpHint.vue'
import CategoryChannelRow from '@/components/categories/CategoryChannelRow.vue'
import { leavesOf, type CatCoverage, type CatNode, type CatTree, type CategoryMappingIndex } from '@/composables/categoryTree'

type ActionKey = 'add-child' | 'move-up' | 'move-down' | 'move-to' | 'delete'

const props = defineProps<{
  node: CatNode
  tree: CatTree
  channels: Array<{ code: string; title: string }>
  mappings: CategoryMappingIndex
  mappingReady: boolean
  mappingError: boolean
  coverage: Map<string, CatCoverage>
  showBack?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  /** Ad değişimini yapar; başarıda `true`, aksi halde insan-okunur hata metni döner. */
  rename: (title: string) => Promise<true | string>
}>()

const emit = defineEmits<{
  back: []
  select: [id: string]
  action: [key: ActionKey]
  'retry-mappings': []
  'mapping-saved': []
}>()

const titleId = `cat-detail-${useId()}`
const mappingFor = (code: string) => props.mappings.get(props.node.id)?.get(code)
const ownCoverage = computed(() => props.coverage.get(props.node.id))

const MAX_LEAVES = 8
const incompleteAll = computed(() => (props.node.children.length ? leavesOf(props.node).filter((l) => props.coverage.get(l.id)?.missing.length) : []))
const incompleteLeaves = computed(() => (props.mappingReady && props.channels.length ? incompleteAll.value.slice(0, MAX_LEAVES) : []))
const hiddenLeafCount = computed(() => Math.max(0, incompleteAll.value.length - MAX_LEAVES))
const missingText = (id: string) => {
  const m = props.coverage.get(id)?.missing ?? []
  return `${m.length}/${props.channels.length} kanalda eksik`
}

// FE-LOCAL-1048: başlığın altındaki özet hücreleri (yalnız eldeki veriden; eşleme durumu hazır değilse "—").
const facts = computed<Array<{ label: string; value: string; tone?: 'success' | 'warning' }>>(() => {
  const cov = ownCoverage.value
  const known = props.mappingReady && props.channels.length > 0 && !!cov
  if (!props.node.children.length) {
    const missing = cov?.missing.length ?? 0
    return [
      { label: 'Düzey', value: `${props.node.path.length}. düzey` },
      { label: 'Eşli kanal', value: known ? `${cov!.mapped.length}/${props.channels.length}` : '—', tone: known && !missing ? 'success' : undefined },
      { label: 'Eksik eşleme', value: known ? (missing ? String(missing) : 'Yok') : '—', tone: known && missing ? 'warning' : undefined },
    ]
  }
  const incomplete = cov?.incompleteLeafCount ?? 0
  return [
    { label: 'Alt kategori', value: String(props.node.children.length) },
    { label: 'Uç kategori', value: String(cov?.leafCount ?? 0) },
    { label: 'Eksik eşleme', value: known ? (incomplete ? String(incomplete) : 'Yok') : '—', tone: known && incomplete ? 'warning' : undefined },
  ]
})

const menuGroups = computed<EkMenuGroup[]>(() => [
  {
    items: [
      { key: 'add-child', label: 'Alt kategori ekle', icon: 'mdi-plus' },
      { key: 'move-up', label: 'Yukarı taşı', icon: 'mdi-arrow-up', disabled: !props.canMoveUp },
      { key: 'move-down', label: 'Aşağı taşı', icon: 'mdi-arrow-down', disabled: !props.canMoveDown },
      { key: 'move-to', label: 'Başka bir kategorinin altına taşı…', icon: 'mdi-file-move-outline' },
    ],
  },
  { items: [{ key: 'delete', label: 'Kategoriyi sil', icon: 'mdi-trash-can-outline', danger: true }] },
])

// ---- Satır içi ad düzenleme ---------------------------------------------------------------------------------------------
const renaming = ref(false)
const draft = ref('')
const renameBusy = ref(false)
const renameError = ref('')
const renameRef = ref<HTMLInputElement | null>(null)

watch(() => props.node.id, () => { renaming.value = false; renameError.value = '' })

async function startRename() {
  draft.value = props.node.title
  renameError.value = ''
  renaming.value = true
  await nextTick()
  renameRef.value?.focus()
  renameRef.value?.select()
}
function cancelRename() { renaming.value = false; renameError.value = '' }
async function submitRename() {
  const v = draft.value.trim()
  if (v === props.node.title) return cancelRename()
  if (v.length < 2 || v.length > 160) { renameError.value = v ? 'Kategori adı 2–160 karakter olmalı.' : 'Kategori adı gerekli.'; return }
  renameBusy.value = true
  const result = await props.rename(v)
  renameBusy.value = false
  if (result === true) { renaming.value = false; renameError.value = '' } else renameError.value = result
}
</script>

<style scoped>
.cat-detail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.cat-detail__head {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: var(--ek-space-1);
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.cat-detail__back {
  align-self: flex-start;
  margin-inline-start: calc(-1 * var(--ek-space-2));
}

.cat-detail__path {
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-detail__titlerow {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 36px;
}

.cat-detail__tile {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-sm);
  background: color-mix(in srgb, var(--ek-color-action) 14%, var(--ek-color-surface));
  color: var(--ek-color-action);
}

.cat-detail__title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-type-heading-weight);
  line-height: var(--ek-type-heading-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-detail__spacer {
  flex: 1;
}

.cat-detail__rename {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ek-space-1);
  min-width: 0;
}

.cat-detail__input {
  flex: 1;
  min-width: 0;
  height: var(--ek-control-h-field);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-action);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font: inherit;
  font-size: var(--ek-type-body-size);
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.cat-detail__error {
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-caption-size);
}

.cat-detail__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-height: 0;
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-6);
  overflow-y: auto;
}

.cat-detail__section {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-label-line);
}

.cat-detail__sechead {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.cat-detail__note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.cat-detail__note .v-icon {
  flex: none;
}

.cat-detail__rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cat-detail__leaves {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cat-detail__leaf {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: var(--ek-control-h-lg);
  padding: 0 var(--ek-space-2);
  border: 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: none;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-body-size);
  text-align: start;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.cat-detail__leaf:hover {
  background: var(--ek-color-surface-muted);
}

.cat-detail__leaf:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.cat-detail__leaf-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-detail__leaf-miss {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.cat-detail__more {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

@media (max-width: 599px) {
  .cat-detail__head {
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .cat-detail__body {
    padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-6);
  }
}

/* ================= FE-LOCAL-1048 — detay paneli: kayıt sayfası dili =================
   Tür etiketi kısa eylem çizgisiyle başlar; kutucuk çerçeveli kapsül; başlığın altında ince çizgili bilgi hücreleri;
   bölüm başlıkları mikro etiket; ad düzenleme alanı parlamasız (yalnız eylem renginde çerçeve). */
.cat-detail__head {
  gap: var(--ek-space-2);
  border-bottom: 0;
  padding-bottom: var(--ek-space-3);
}

.cat-detail__path {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.cat-detail__kind {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.cat-detail__kind::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.cat-detail__crumb {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-detail__crumb::before {
  content: '·';
  margin-inline-end: var(--ek-space-2);
  color: var(--ek-color-content-subtle);
}

.cat-detail__tile {
  width: 36px;
  height: 36px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.cat-detail__input {
  box-shadow: none;
}

.cat-detail__facts {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: var(--ek-space-3) 0;
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-5);
  border-block: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.cat-detail__fact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0 var(--ek-space-5);
}

.cat-detail__fact:first-child {
  padding-inline-start: 0;
}

.cat-detail__fact + .cat-detail__fact {
  border-inline-start: 1px solid var(--ek-color-border-default);
}

.cat-detail__fact dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.cat-detail__fact dd {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  font-weight: var(--ek-font-weight-semibold);
}

.cat-detail__fact.is-success dd { color: var(--ek-color-success-emphasis); }
.cat-detail__fact.is-warning dd { color: var(--ek-color-warning-emphasis); }

.cat-detail__section {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.cat-detail__section::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.cat-detail__rows {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.cat-detail__leaf {
  padding: 0 var(--ek-space-1);
}

.cat-detail__leaf-miss {
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

@media (max-width: 599px) {
  .cat-detail__facts {
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .cat-detail__fact {
    padding: 0 var(--ek-space-3);
  }
}
</style>
