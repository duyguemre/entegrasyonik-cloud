<!--
  frontend/src/components/printouts/TemplatePaper.vue

  FR3 madde 15 — şablonun salt-görüntü sayfası (galeri küçük resmi, önizleme). Tuval ve yazdırma da aynı
  `TemplatePage` bileşenini + `geometryCss` kurallarını kullanır (tek render motoru).
  Ölçek: `zoom` (1 = gerçek boy) ya da `fit` kutusuna sığdırma. Kâğıt her temada beyazdır.
-->
<template>
  <div class="ek-tpl-frame" :data-frame="key" role="img" :aria-label="label">
    <div class="ek-tpl-frame__inner" aria-hidden="true">
      <TemplatePage :doc="doc" :data="data" :page-key="key" :design="design" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TemplatePage from './TemplatePage'
import { geometryCss } from './renderTemplate'
import { paperSize, type PrintData, type TemplateDoc } from './templateModel'
import { PX_PER_MM, useTemplateCss } from './useTemplateCss'

const props = withDefaults(defineProps<{
  doc: TemplateDoc
  data: PrintData
  /** Gerçek boya göre ölçek (fit verilmezse). */
  zoom?: number
  /** Sığdırma kutusu (px). */
  fit?: { w: number; h: number }
  design?: boolean
  label?: string
}>(), { zoom: 1, design: false, label: 'Şablon önizlemesi' })

const key = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const scale = computed(() => {
  if (!props.fit) return props.zoom
  const { w, h } = paperSize(props.doc.paper)
  return Math.min(props.fit.w / (w * PX_PER_MM), props.fit.h / (h * PX_PER_MM))
})

const css = computed(() => {
  const { w, h } = paperSize(props.doc.paper)
  const z = Math.round(scale.value * 1000) / 1000
  const frame = `.ek-tpl-frame[data-frame="${key}"]`
  return [
    `${frame}{width:${Math.round(w * PX_PER_MM * z)}px;height:${Math.round(h * PX_PER_MM * z)}px}`,
    `${frame} .ek-tpl-page{transform:scale(${z});transform-origin:0 0}`,
    geometryCss(props.doc, key),
  ].join('\n')
})
useTemplateCss(css)
</script>

<style scoped>
.ek-tpl-frame {
  position: relative;
  flex: none;
  overflow: hidden;
  border-radius: var(--ek-radius-sm);
  box-shadow: var(--ek-shadow-card);
  outline: 1px solid var(--ek-color-border-subtle);
}
.ek-tpl-frame__inner {
  pointer-events: none;
}
</style>
