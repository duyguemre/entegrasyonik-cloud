<!-- Vitrin §12 — kademeli çok kolonlu seçici: ürün kategori ağacı seçimi. -->
<template>
  <DsSpecimen title="Kategori ağacı seçimi (EkCascadePicker)" note="Seçili yol her kolonda vurgulu; klasör › ile, yaprak ● ile biter. Yazınca yaprak kategoriler tam yollarıyla listelenir. ↑↓ · → alt kolon · ← üst kolon · Enter seç." canvas>
    <EkCascadePicker
      v-model="path"
      :nodes="categoryTree"
      title="Pazaryeri kategorisi seç"
      subtitle="Trendyol kategori ağacı · 2.946 yaprak kategori"
      root-label="Ana kategoriler"
      closable
    >
      <template #actions="{ leafChosen }">
        <EkButton tone="secondary">Vazgeç</EkButton>
        <EkButton tone="primary" icon="mdi-check" :disabled="!leafChosen">Kategoriyi seç</EkButton>
      </template>
    </EkCascadePicker>
  </DsSpecimen>
  <DsSpecimen
    title="Alt seviye yükleniyor (loadChildren + lazy)"
    note="A9: alt seviye sunucudan gelirken kolon iskelet satırları gösterir; liste gelince aynı dilde (opaklık + 4px) yer değiştirir. Seviye açılışı opaklık + 8px yatay kayma, alt seviyeler derinden sığa sırayla kapanır; reduced-motion'da anında."
    canvas
  >
    <EkCascadePicker
      v-model="lazyPath"
      class="ds-cascade-lazy"
      :nodes="lazyTree"
      :load-children="loadChildren"
      embedded
      title="Ürün kategorisi"
      subtitle="Alt kategoriler istek üzerine yüklenir"
      root-label="Ana kategoriler"
    />
  </DsSpecimen>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import DsSpecimen from './DsSpecimen.vue'
import { EkCascadePicker, type EkCascadeNode, EkButton } from '@entegrasyonik/ui/components'
import { categoryTree } from './demoData'

const path = ref(['moda', 'kadin', 'giyim', 'tisort'])
const lazyPath = ref<string[]>([])

/** Kökler tam, alt seviyeler "sunucudan" gecikmeli gelir (vitrin: sabit veri + bekleme). */
const lazyTree: EkCascadeNode[] = categoryTree.map((n) => ({ id: n.id, label: n.label, count: n.count, lazy: true }))

function findNode(nodes: EkCascadeNode[], id: string): EkCascadeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = n.children?.length ? findNode(n.children, id) : undefined
    if (hit) return hit
  }
  return undefined
}

function loadChildren(node: EkCascadeNode): Promise<EkCascadeNode[]> {
  const source = findNode(categoryTree, node.id)?.children ?? []
  const kids = source.map((c) => ({ id: c.id, label: c.label, count: c.count, lazy: !!c.children?.length }))
  return new Promise((resolve) => window.setTimeout(() => resolve(kids), 900))
}
</script>

<style scoped>
.ds-cascade-lazy {
  height: 420px;
}
</style>
