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
</template>

<script setup lang="ts">
import { ref } from 'vue'
import DsSpecimen from './DsSpecimen.vue'
import EkCascadePicker from '@/components/ds/EkCascadePicker.vue'
import EkButton from '@/components/ds/EkButton.vue'
import { categoryTree } from './demoData'

const path = ref(['moda', 'kadin', 'giyim', 'tisort'])
</script>
