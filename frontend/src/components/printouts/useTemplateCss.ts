/**
 * frontend/src/components/printouts/useTemplateCss.ts
 *
 * Şablon geometrisi (mm) ve yakınlaştırma çerçeveleri VERİDEN üretilen CSS kurallarıdır; öğelere satır içi
 * stil yazılmaz (style-ratchet). Bu bileşenin `<style>` düğümü belgeye eklenir, değişince güncellenir,
 * bileşen kalkınca silinir. `TEMPLATE_CSS` (taban kurallar) tek kez eklenir.
 */
import { onBeforeUnmount, watch, type Ref } from 'vue'
import { TEMPLATE_CSS } from './renderTemplate'

const BASE_ID = 'ek-tpl-base-css'

function ensureBase() {
  if (typeof document === 'undefined' || document.getElementById(BASE_ID)) return
  const el = document.createElement('style')
  el.id = BASE_ID
  el.textContent = TEMPLATE_CSS
  document.head.appendChild(el)
}

export function useTemplateCss(css: Ref<string>) {
  ensureBase()
  const el = typeof document === 'undefined' ? null : document.createElement('style')
  if (el) {
    el.dataset.ekTpl = ''
    document.head.appendChild(el)
  }
  watch(css, (v) => { if (el) el.textContent = v }, { immediate: true })
  onBeforeUnmount(() => el?.remove())
}

/** 1 mm = 96/25,4 CSS pikseli (CSS mutlak birim tanımı). */
export const PX_PER_MM = 96 / 25.4
