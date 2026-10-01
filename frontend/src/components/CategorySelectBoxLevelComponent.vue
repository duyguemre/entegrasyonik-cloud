<!--
  frontend/src/components/CategorySelectBoxLevelComponent.vue

  Ürün tanımlama/güncelleme sihirbazının "Kategori Seçimi" adımı. DS-v2 Aşama 2:
  `EkCascadePicker` (kademeli çok kolonlu, aramalı, seçili yol vurgulu) — sayfa
  içine gömülü (`embedded`). Veri: `categoriesStore` kategori ağacı (backend
  ağacı; tek `isMain` kök varsa onun altı ana kategorilerdir).

  Sözleşme DEĞİŞMEDİ: `v-model` = seçili YAPRAK kategorinin `_id`'si; klasör
  (alt kategorisi olan) öğe seçilince model `undefined` olur (eski davranış).
-->
<template>
  <EkEmptyState v-if="!tree.length" variant="first-run" title="Henüz kategori tanımlanmamış"
    message="İlk kategorinizi buradan ekleyebilir ya da ağacınızı Tanımlar › Kategoriler ekranından kurabilirsiniz."
    show-action action-text="Kategori ekle" @action="createOpen = true" />
  <EkCascadePicker
    v-else
    v-model="path"
    embedded
    class="ek-category-picker"
    :nodes="tree"
    title="Ürün kategorisi"
    :subtitle="subtitle"
    icon="mdi-file-tree-outline"
    root-label="Ana kategoriler"
    search-placeholder="Kategori ara…"
    @update:model-value="onPathChange"
  >
    <template #actions>
      <EkButton tone="ghost" size="sm" icon="mdi-plus" data-qc-open="category" @click="createOpen = true">
        {{ createParent ? `“${createParent.label}” altına kategori ekle` : 'Yeni kategori ekle' }}
      </EkButton>
    </template>
  </EkCascadePicker>
  <QuickCreateCategoryDialog v-model="createOpen" :initial-parent-id="createParent?.id" @created="onCreated" @picked="onPicked" />
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { EkButton, EkCascadePicker, type EkCascadeNode, EkEmptyState } from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import QuickCreateCategoryDialog from '@/components/common/QuickCreateCategoryDialog.vue'
import { formatNumber } from '@entegrasyonik/ui/format'
import { useCategoriesStore } from '@/stores/categoriesStore'

const categoryId = defineModel<string | undefined>({ default: undefined })
const categoriesStore = useCategoriesStore()

interface CategoryRecord {
  _id: string
  title: string
  isMain?: boolean
  children?: CategoryRecord[]
}

function toNodes(list: CategoryRecord[] | undefined): EkCascadeNode[] {
  return (list ?? []).map((c) => {
    const children = toNodes(c.children)
    return {
      id: c._id,
      label: c.title,
      count: children.length ? countLeaves(children) : undefined,
      children,
    }
  })
}

function countLeaves(nodes: EkCascadeNode[]): number {
  return nodes.reduce((sum, n) => sum + (n.children?.length ? countLeaves(n.children) : 1), 0)
}

const tree = computed<EkCascadeNode[]>(() => {
  const source = categoriesStore.getCategories() as { value?: CategoryRecord[] } | CategoryRecord[] | undefined
  const roots = (Array.isArray(source) ? source : source?.value) ?? []
  // Tek "ana" kök (isMain) varsa kullanıcıya görünen ilk kademe onun çocuklarıdır. Backend `get` ana kökü
  // çocuksuz ilk öğe + ana seviye kategoriler olarak da döndürür — o durumda ana kök listelenmez.
  const main = roots.length === 1 && roots[0].isMain ? roots[0].children : roots.filter((r) => !r.isMain)
  return toNodes(main)
})

const subtitle = computed(() => {
  const leaves = countLeaves(tree.value)
  return `${formatNumber(leaves)} yaprak kategori · en uçtaki (yaprak) kategoriyi seçin`
})

function findPath(nodes: EkCascadeNode[], id: string, trail: string[] = []): string[] | undefined {
  for (const n of nodes) {
    const next = [...trail, n.id]
    if (n.id === id) return next
    const found = n.children?.length ? findPath(n.children, id, next) : undefined
    if (found) return found
  }
  return undefined
}

const path = ref<string[]>([])

watch(
  [categoryId, tree],
  ([id]) => {
    if (!id) return
    const current = path.value[path.value.length - 1]
    if (current === id) return
    path.value = findPath(tree.value, id) ?? []
  },
  { immediate: true },
)

function nodeFor(ids: string[]): EkCascadeNode | undefined {
  let level = tree.value
  let node: EkCascadeNode | undefined
  for (const id of ids) {
    node = level.find((n) => n.id === id)
    if (!node) return undefined
    level = node.children ?? []
  }
  return node
}

// ---- FR2-PFORM 23: yeni kategori (açık klasörün altına; yaprak seçiliyse onun klasörüne) ----
const { showToast } = useToast()
const createOpen = ref(false)
const createParent = computed<EkCascadeNode | undefined>(() => {
  const ids = path.value.slice()
  while (ids.length) {
    const n = nodeFor(ids)
    if (n?.children?.length) return n
    ids.pop()
  }
  return undefined
})
function onCreated(id: string, title: string) {
  categoryId.value = id
  showToast({ tone: 'success', message: `“${title}” kategorisi eklendi ve seçildi.` })
}
function onPicked(id: string) {
  categoryId.value = id
}

function onPathChange(ids: string[]) {
  const node = nodeFor(ids)
  categoryId.value = node && !node.children?.length ? node.id : undefined
}
</script>

<style scoped>
.ek-category-picker {
  height: min(520px, calc(100vh - 280px));
  min-height: 360px;
}
</style>
