<!--
  frontend/src/components/printouts/TemplatePreview.vue

  FR3 madde 15 — önizleme ve yazdırma (araştırma 4, 10). Veri kaynağı:
    - Örnek veri: normal / uzun içerik (stres) / eksik bilgi — taşmayı ve boş alanı yazdırmadan görmek için.
    - Siparişlerim: mevcut `OrderService/getOrders` sözleşmesiyle son siparişler (yalnız istendiğinde yüklenir);
      birden çok sipariş seçilirse her biri ayrı sayfa → toplu yazdırma.
  Sayfa, tuval ve yazdırma aynı render motorunu kullanır. Yazdırma tarayıcının yazdır penceresidir
  ("PDF olarak kaydet" aynı yerden). Denetim, seçili verinin sorunlarını yazdırmadan önce gösterir.
-->
<template>
  <section class="ek-tpl-preview" aria-label="Önizleme ve yazdırma">
    <header class="ek-tpl-preview__bar">
      <EkButton tone="ghost" icon="mdi-arrow-left" @click="emit('back')">{{ backLabel }}</EkButton>
      <div class="ek-tpl-preview__title">
        <h2>{{ doc.name }}</h2>
        <span>{{ docKindLabel(doc.kind) }} · {{ paperLabel(doc.paper) }}</span>
      </div>
      <div class="ek-tpl-preview__actions">
        <EkButton v-if="!doc.system" tone="secondary" icon="mdi-pencil-outline" @click="emit('edit')">Düzenle</EkButton>
        <EkButton v-else tone="secondary" icon="mdi-content-copy" @click="emit('edit')">Kopyasını düzenle</EkButton>
        <EkButton tone="primary" icon="mdi-printer-outline" :disabled="!pages.length" :loading="printing" @click="print">
          Yazdır{{ pageCount > 1 ? ` (${pageCount} sayfa)` : '' }}
        </EkButton>
      </div>
    </header>

    <div class="ek-tpl-preview__body">
      <aside class="ek-tpl-preview__side" aria-label="Önizleme ayarları">
        <EkPageTabs v-model="source" dense label="Veri kaynağı"
          :tabs="[{ value: 'sample', label: 'Örnek veri' }, { value: 'orders', label: 'Siparişlerim', count: orders.length ? chosen.size : null }]" />

        <div v-if="source === 'sample'" class="ek-tpl-preview__sources" role="radiogroup" aria-label="Örnek veri">
          <label v-for="s in SAMPLE_SETS" :key="s.id" class="ek-tpl-option" :class="{ 'is-active': sampleId === s.id }">
            <input v-model="sampleId" type="radio" name="ek-tpl-sample" :value="s.id" />
            <span><strong>{{ s.label }}</strong><small>{{ s.hint }}</small></span>
          </label>
        </div>

        <div v-else class="ek-tpl-preview__orders">
          <template v-if="ordersState === 'idle'">
            <p class="ek-tpl-preview__note">Son 20 siparişiniz yüklenir; yazdırmak istediklerinizi seçin. Her sipariş ayrı sayfa olur.</p>
            <EkButton tone="secondary" icon="mdi-download-outline" block @click="loadOrders">Siparişleri getir</EkButton>
          </template>
          <EkSkeleton v-else-if="ordersState === 'loading'" type="table" :rows="5" />
          <EkErrorState v-else-if="ordersState === 'error'" size="inline" message="Siparişler yüklenemedi — bağlantınızı kontrol edip yeniden deneyin. Örnek veriyle önizlemeye devam edebilirsiniz."
            :cause="problem?.cause" @retry="loadOrders" />
          <EkEmptyState v-else-if="!orders.length" variant="no-data" title="Henüz sipariş yok" message="Sipariş geldiğinde buradan gerçek veriyle önizleyip yazdırabilirsiniz." />
          <template v-else>
            <div class="ek-tpl-preview__pick">
              <span>{{ chosen.size }} / {{ orders.length }} seçili</span>
              <button type="button" class="ek-link ek-link--sm" @click="toggleAll">{{ chosen.size === orders.length ? 'Seçimi kaldır' : 'Tümünü seç' }}</button>
            </div>
            <ul class="ek-tpl-preview__list">
              <li v-for="(o, i) in orders" :key="i">
                <v-checkbox :model-value="chosen.has(i)" :label="o.label" hide-details density="compact" @update:model-value="(v: boolean | null) => toggle(i, !!v)" />
              </li>
            </ul>
          </template>
        </div>

        <EkFormSection :columns="1" title="Yazdırma" class="ek-tpl-preview__section">
          <v-text-field v-model.number="copies" label="Kopya (sipariş başına)" type="number" min="1" max="5" hide-details />
          <p class="ek-tpl-preview__note">
            Yazıcı penceresinde kâğıt boyutunu <strong>{{ paperPreset(doc.paper.preset).label }}</strong>, ölçeği <strong>%100 (gerçek boyut)</strong> seçin.
            PDF için hedef olarak "PDF olarak kaydet"i seçin.
          </p>
        </EkFormSection>

        <section class="ek-tpl-preview__section">
          <h3 class="ek-tpl-preview__h">Denetim</h3>
          <p v-if="!issues.length" class="ek-tpl-preview__ok"><v-icon icon="mdi-check-circle-outline" size="18" aria-hidden="true" /> Yazdırmaya hazır.</p>
          <ul v-else class="ek-tpl-preview__issues">
            <li v-for="(i, n) in issues" :key="n" :class="`is-${i.level}`">
              <v-icon :icon="i.level === 'error' ? 'mdi-alert-circle-outline' : 'mdi-alert-outline'" size="16" aria-hidden="true" />
              <span>{{ i.message }}</span>
            </li>
          </ul>
        </section>
      </aside>

      <div ref="stage" class="ek-tpl-preview__stage" tabindex="0" role="region" aria-label="Sayfa önizlemesi">
        <EkEmptyState v-if="!pages.length" variant="no-data" title="Önizlenecek sipariş seçilmedi" message="Soldan en az bir sipariş seçin ya da örnek veriye dönün." />
        <figure v-for="(p, i) in visiblePages" :key="`${p.label}-${i}`" class="ek-tpl-preview__page">
          <TemplatePaper :doc="doc" :data="p" :fit="fit" :label="`${doc.name} — ${p.label}`" />
          <figcaption>{{ pages.length > 1 ? `${i + 1}. sayfa · ` : '' }}{{ p.label }}</figcaption>
        </figure>
        <p v-if="pages.length > visiblePages.length" class="ek-tpl-preview__note">+{{ pages.length - visiblePages.length }} sayfa daha yazdırılacak (önizlemede ilk {{ visiblePages.length }} gösteriliyor).</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { EkButton, EkEmptyState, EkErrorState, EkFormSection, EkPageTabs, EkSkeleton } from '@entegrasyonik/ui/components'
import { isRequestError } from '@entegrasyonik/ui/components/listStandard'
import useRestApi from '@/composables/restapi'
import { problemFromError, type ProblemCopy } from '@/composables/useProblem'
import TemplatePaper from './TemplatePaper.vue'
import { printTemplate } from './printTemplate'
import {
  SAMPLE_SETS, buildPrintData, docKindLabel, paperLabel, paperPreset, paperSize, sampleData, validateTemplate,
  type PrintData, type SampleId, type TemplateDoc,
} from './templateModel'
import { PX_PER_MM } from './useTemplateCss'

const props = withDefaults(defineProps<{ doc: TemplateDoc; backLabel?: string }>(), { backLabel: 'Şablonlar' })
const emit = defineEmits<{ back: []; edit: []; printed: [pages: number] }>()

const source = ref<'sample' | 'orders'>('sample')
const sampleId = ref<SampleId>('normal')
const copies = ref(1)
const printing = ref(false)

// ─── Siparişlerim (mevcut sözleşme: OrderService/getOrders) ───
const restApi = useRestApi()
const ordersState = ref<'idle' | 'loading' | 'error' | 'ready'>('idle')
const orders = shallowRef<PrintData[]>([])
const chosen = ref(new Set<number>())
const problem = ref<ProblemCopy | null>(null)
async function loadOrders() {
  ordersState.value = 'loading'
  problem.value = null
  try {
    const res = await restApi.post('OrderService/getOrders', {
      searchOrderForm: { pagination: { page: 1, limit: 20 }, sort: { field: 'dates.orderDate', direction: 'desc' }, filter: {} },
    })
    if (isRequestError(res)) throw res
    orders.value = (Array.isArray(res?.orders) ? res.orders : []).map((o: unknown) => buildPrintData(o))
    chosen.value = new Set(orders.value.length ? [0] : [])
    ordersState.value = 'ready'
  } catch (e) {
    problem.value = problemFromError(e, 'OrderService/getOrders')
    ordersState.value = 'error'
  }
}
function toggle(i: number, on: boolean) {
  const s = new Set(chosen.value)
  if (on) s.add(i); else s.delete(i)
  chosen.value = s
}
function toggleAll() {
  chosen.value = chosen.value.size === orders.value.length ? new Set() : new Set(orders.value.map((_, i) => i))
}

// ─── Sayfalar ───
const pages = computed<PrintData[]>(() =>
  source.value === 'sample' ? [sampleData(sampleId.value)] : orders.value.filter((_, i) => chosen.value.has(i)))
const PREVIEW_MAX = 12
const visiblePages = computed(() => pages.value.slice(0, PREVIEW_MAX))
const n = computed(() => Math.min(Math.max(Math.round(Number(copies.value) || 1), 1), 5))
const pageCount = computed(() => pages.value.length * n.value)
const issues = computed(() => {
  const first = pages.value[0]
  if (!first) return []
  // Toplu seçimde tüm siparişlerin sorunları; aynı mesaj bir kez.
  const seen = new Set<string>()
  return pages.value.flatMap((p) => validateTemplate(props.doc, p)).filter((i) => (seen.has(i.message) ? false : (seen.add(i.message), true)))
})

// Sayfa, önizleme alanına sığar (genişlik öncelikli; dar ekranda tam genişlik).
const stage = ref<HTMLElement | null>(null)
const stageW = ref(640)
const stageH = ref(640)
let ro: ResizeObserver | undefined
onMounted(() => {
  const measure = () => { if (stage.value) { stageW.value = stage.value.clientWidth; stageH.value = stage.value.clientHeight } }
  measure()
  if (typeof ResizeObserver !== 'undefined' && stage.value) { ro = new ResizeObserver(measure); ro.observe(stage.value) }
})
onBeforeUnmount(() => ro?.disconnect())
/** Sayfanın tamamı görünür (genişlik ve yükseklik); küçük etiket en fazla 1,5× büyütülür, dar ekranda tam genişlik. */
const fit = computed(() => {
  const { w, h } = paperSize(props.doc.paper)
  const pad = 64
  const scale = Math.min((stageW.value - pad) / (w * PX_PER_MM), Math.max(360, stageH.value - pad) / (h * PX_PER_MM), 1.5)
  return { w: w * PX_PER_MM * scale, h: h * PX_PER_MM * scale }
})

async function print() {
  printing.value = true
  try {
    const list = pages.value.flatMap((p) => Array.from({ length: n.value }, () => p))
    await printTemplate(props.doc, list)
    emit('printed', list.length)
  } finally {
    printing.value = false
  }
}
</script>

<style scoped>
.ek-tpl-preview {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  overflow: hidden;
}
.ek-tpl-preview__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}
.ek-tpl-preview__title { display: flex; flex-direction: column; min-width: 0; flex: 1 1 200px; }
.ek-tpl-preview__title h2 { margin: 0; font-size: var(--ek-font-size-md); font-weight: var(--ek-font-weight-semibold); color: var(--ek-color-content-strong); }
.ek-tpl-preview__title span { font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }
.ek-tpl-preview__actions { display: flex; flex-wrap: wrap; gap: var(--ek-space-2); margin-left: auto; }
.ek-tpl-preview__body { display: grid; grid-template-columns: 320px minmax(0, 1fr); height: calc(100vh - 220px); min-height: 560px; }
.ek-tpl-preview__side {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  border-right: 1px solid var(--ek-color-border-subtle);
  min-width: 0;
  overflow-y: auto;
}
.ek-tpl-preview__section { margin-top: var(--ek-space-3); padding-top: var(--ek-space-4); border-top: 1px solid var(--ek-color-border-subtle); }
.ek-tpl-preview__h { margin: 0 0 var(--ek-space-3); font-size: var(--ek-type-subheading-size); line-height: var(--ek-type-subheading-line); font-weight: var(--ek-type-subheading-weight); color: var(--ek-color-content-strong); }
.ek-tpl-preview__sources { display: grid; gap: var(--ek-space-2); }
.ek-tpl-option {
  display: flex;
  gap: var(--ek-space-3);
  align-items: flex-start;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  cursor: pointer;
  transition: border-color var(--ek-duration-fast) var(--ek-easing-standard), background-color var(--ek-duration-fast) var(--ek-easing-standard);
}
.ek-tpl-option:hover { border-color: var(--ek-color-border-strong); }
.ek-tpl-option.is-active { border-color: var(--ek-color-action-border); background: var(--ek-color-action-subtle); }
.ek-tpl-option input { margin-top: 3px; accent-color: var(--ek-color-action); }
.ek-tpl-option input:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ek-tpl-option span { display: flex; flex-direction: column; font-size: var(--ek-font-size-sm); color: var(--ek-color-content-strong); }
.ek-tpl-option small { font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }
.ek-tpl-preview__orders { display: flex; flex-direction: column; gap: var(--ek-space-2); }
.ek-tpl-preview__pick { display: flex; justify-content: space-between; align-items: center; font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }
.ek-tpl-preview__list { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; }
.ek-tpl-preview__note { margin: 0; font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }
.ek-tpl-preview__note strong { color: var(--ek-color-content-default); font-weight: var(--ek-font-weight-medium); }
.ek-tpl-preview__ok { display: flex; align-items: center; gap: var(--ek-space-2); margin: 0; font-size: var(--ek-font-size-sm); color: var(--ek-color-success-emphasis); }
.ek-tpl-preview__issues { list-style: none; margin: 0; padding: 0; }
.ek-tpl-preview__issues li { display: flex; gap: var(--ek-space-2); align-items: flex-start; font-size: var(--ek-font-size-sm); color: var(--ek-color-content-default); }
.ek-tpl-preview__issues li + li { margin-top: var(--ek-space-2); }
.ek-tpl-preview__issues .is-error .v-icon { color: var(--ek-color-error-emphasis); }
.ek-tpl-preview__issues .is-warning .v-icon { color: var(--ek-color-warning-emphasis); }
.ek-tpl-preview__stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-6);
  padding: var(--ek-space-6);
  background: var(--ek-color-surface-sunken);
  overflow: auto;
  min-width: 0;
  outline: none;
}
.ek-tpl-preview__stage:focus-visible { box-shadow: inset var(--ek-focus-ring); }
.ek-tpl-preview__page { margin: 0; display: flex; flex-direction: column; align-items: center; gap: var(--ek-space-2); }
.ek-tpl-preview__page figcaption { font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }

@media (max-width: 959px) {
  .ek-tpl-preview__body { grid-template-columns: minmax(0, 1fr); height: auto; }
  .ek-tpl-preview__stage { max-height: 80vh; }
  .ek-tpl-preview__side { border-right: 0; border-bottom: 1px solid var(--ek-color-border-subtle); overflow: visible; }
  .ek-tpl-preview__stage { padding: var(--ek-space-4); }
}
@media (prefers-reduced-motion: reduce) {
  .ek-tpl-option { transition: none; }
}
</style>
