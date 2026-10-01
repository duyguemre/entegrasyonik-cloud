<!--
  frontend/src/views/secure/PrintoutListView.vue

  FR3 madde 15 (fe-r3c) — Çıktılar: şablon galerisi → düzenleyici → önizleme → yazdır (K49 onaylı yeniden tasarım;
  araştırma: frontend/docs/research/TEMPLATE_DESIGNER_2026-10-01.md). Eski ekran backend'e hiç bağlı olmayan bir
  sürükle-bırak taslağıydı (ADR-0015 B5-3 karakterizasyonu); onun yerine:
    - Galeri: belge türüne göre süzülen "Şablonlarım" + "Hazır şablonlar"; küçük resimler gerçek render.
      Hazır şablon salt-okunurdur → "Kopyasını düzenle". Tür başına bir varsayılan.
    - Düzenleyici (TemplateEditor): sol alanlar/bileşenler, orta tuval (mm), sağ özellikler; geri al/yinele, klavye.
    - Önizleme (TemplatePreview): örnek / stres / eksik veri ya da son siparişler (mevcut OrderService/getOrders),
      denetim, toplu yazdırma (tarayıcı yazdır penceresi; PDF aynı yerden).
  Saklama: backend sözleşmesi yok → bu tarayıcı, kullanıcı + mağaza kapsamlı (templateStore). Ekran bunu söyler.
  Sipariş ekranındaki "Kargo etiketi yazdır" (BarcodePrintComponent) DEĞİŞMEDİ; varsayılan şablona bağlanması
  PROPOSALS_PENDING'de (backend şablon kaydı ile birlikte).
-->
<template>
  <div class="printoutListView">
    <EkPageHeader section="Finans" :title="$t('menu.printoutList')"
      description="Kargo etiketi, sipariş fişi, irsaliye taslağı ve toplama listesi şablonlarınızı tasarlayın, gerçek siparişle önizleyip yazdırın."
      :tips="TIPS" :primary-action="view === 'gallery' ? { label: 'Yeni şablon', icon: 'mdi-plus', onClick: openCreate } : undefined" />

    <!-- GALERİ -->
    <template v-if="view === 'gallery'">
      <EkAlert v-if="!persistent" tone="warning" dense title="Tarayıcı depolaması kullanılamıyor"
        text="Şablonlarınız bu oturumda çalışır ama sayfadan çıkınca kaybolur. Gizli pencere kullanıyorsanız normal pencerede açın." />

      <div class="ek-tpl-gallery__toolbar">
        <EkPageTabs v-model="kindFilter" :tabs="kindTabs" label="Belge türü" />
      </div>

      <section class="ek-tpl-gallery__section" aria-labelledby="ek-tpl-mine">
        <header class="ek-tpl-gallery__head">
          <h2 id="ek-tpl-mine">Şablonlarım</h2>
          <span>{{ mine.length }}</span>
          <p class="ek-tpl-gallery__storage"><v-icon icon="mdi-laptop" size="14" aria-hidden="true" />
            {{ mine.length ? 'Bu tarayıcıda, hesabınıza ve mağazanıza özel saklanır.' : 'Henüz kendi şablonunuz yok — hazır bir şablonun kopyasıyla ya da boş tuvalle başlayın. Şablonlar bu tarayıcıda, hesabınıza özel saklanır.' }}</p>
        </header>
        <ul class="ek-tpl-grid">
          <li>
            <button type="button" class="ek-tpl-create" @click="openCreate">
              <span class="ek-tpl-create__icon" aria-hidden="true"><v-icon icon="mdi-plus" size="24" /></span>
              <strong>Boş şablon</strong>
              <span>{{ kindFilter === 'all' ? 'Tür ve kâğıt seçerek başlayın' : `${docKindLabel(kindFilter)} · boş tuval` }}</span>
            </button>
          </li>
          <li v-for="t in mine" :key="t.id">
            <article class="ek-tpl-card" :aria-label="t.name">
              <button type="button" class="ek-tpl-card__thumb" :aria-label="`${t.name} önizle`" @click="openPreview(t)">
                <TemplatePaper :doc="t" :data="thumbData" :fit="THUMB" :label="`${t.name} küçük resmi`" />
              </button>
              <div class="ek-tpl-card__body">
                <h3 class="ek-tpl-card__name">{{ t.name }}</h3>
                <p class="ek-tpl-card__meta">{{ docKindLabel(t.kind) }} · {{ paperLabel(t.paper) }}</p>
                <div class="ek-tpl-card__badges">
                  <EkBadge v-if="isDefault(t)" text="Varsayılan" tone="success" />
                  <span v-if="t.updatedAt" class="ek-tpl-card__time">{{ formatDateTime(t.updatedAt) }}</span>
                </div>
              </div>
              <footer class="ek-tpl-card__actions">
                <EkButton tone="secondary" size="sm" icon="mdi-pencil-outline" @click="openEditor(t)">Düzenle</EkButton>
                <EkRowActions :label="`${t.name} işlemleri`" :items="cardActions(t)" />
              </footer>
            </article>
          </li>
        </ul>
      </section>

      <section class="ek-tpl-gallery__section" aria-labelledby="ek-tpl-starters">
        <header class="ek-tpl-gallery__head">
          <h2 id="ek-tpl-starters">Hazır şablonlar</h2>
          <span>{{ starters.length }}</span>
          <p>Değiştirilemez; kopyasını düzenleyerek kendi şablonunuzu oluşturun.</p>
        </header>
        <ul class="ek-tpl-grid">
          <li v-for="t in starters" :key="t.id">
            <article class="ek-tpl-card" :aria-label="t.name">
              <button type="button" class="ek-tpl-card__thumb" :aria-label="`${t.name} önizle`" @click="openPreview(t)">
                <TemplatePaper :doc="t" :data="thumbData" :fit="THUMB" :label="`${t.name} küçük resmi`" />
              </button>
              <div class="ek-tpl-card__body">
                <h3 class="ek-tpl-card__name">{{ t.name }}</h3>
                <p class="ek-tpl-card__meta">{{ docKindLabel(t.kind) }} · {{ paperLabel(t.paper) }}</p>
                <div class="ek-tpl-card__badges">
                  <EkBadge text="Hazır" tone="neutral" />
                  <EkBadge v-if="isDefault(t)" text="Varsayılan" tone="success" />
                </div>
              </div>
              <footer class="ek-tpl-card__actions">
                <EkButton tone="secondary" size="sm" icon="mdi-content-copy" @click="editCopy(t)">Kopyasını düzenle</EkButton>
                <EkRowActions :label="`${t.name} işlemleri`" :items="cardActions(t)" />
              </footer>
            </article>
          </li>
        </ul>
      </section>
    </template>

    <!-- Düzenleyiciden önizlemeye geçerken düzenleyici AÇIK kalır (v-show): geri al geçmişi ve kaydedilmemiş durum korunur. -->
    <TemplateEditor v-if="current && (view === 'editor' || (view === 'preview' && previewFrom === 'editor'))" v-show="view === 'editor'"
      :template="current" @save="onSave" @close="requestClose" @preview="(d) => openPreview(d, 'editor')" @dirty="(v) => (editorDirty = v)" />

    <TemplatePreview v-if="view === 'preview' && previewDoc" :doc="previewDoc" :back-label="previewFrom === 'editor' ? 'Düzenleyici' : 'Şablonlar'"
      @back="previewFrom === 'editor' ? (view = 'editor') : backToGallery()" @edit="onPreviewEdit"
      @printed="(n) => toast(`${n} sayfa yazdırma penceresine gönderildi.`)" />

    <!-- Yeni şablon -->
    <EkFormDialog v-model="createOpen" title="Yeni şablon" description="Belge türünü ve kâğıdı seçin; boş tuvalle başlarsınız." submit-label="Oluştur" submit-icon="mdi-plus"
      @submit="createBlank" @cancel="createOpen = false">
      <fieldset class="ek-tpl-kinds">
        <legend>Belge türü</legend>
        <label v-for="k in DOC_KINDS" :key="k.id" class="ek-tpl-kind" :class="{ 'is-active': createKind === k.id }">
          <input v-model="createKind" type="radio" name="ek-tpl-kind" :value="k.id" />
          <v-icon :icon="k.icon" size="20" aria-hidden="true" />
          <span><strong>{{ k.label }}</strong><small>{{ k.hint }}</small></span>
        </label>
      </fieldset>
      <v-select v-model="createPaper" :items="PAPER_PRESETS" item-title="label" item-value="id" label="Kâğıt / etiket" hide-details>
        <template #item="{ props: ip, item }"><v-list-item v-bind="ip" role="option" :subtitle="item.raw.hint" /></template>
      </v-select>
    </EkFormDialog>

    <EkConfirmDialog v-model="deleteAsk.open" :title="`'${deleteAsk.doc?.name}' silinsin mi?`" danger confirm-label="Sil"
      description="Şablon bu tarayıcıdan kalıcı olarak silinir. Varsayılan şablonsa bu türün varsayılanı hazır şablona döner."
      @confirm="confirmDelete" @cancel="deleteAsk.open = false" />
    <EkConfirmDialog v-model="leaveAsk" title="Kaydedilmemiş değişiklikler silinsin mi?" danger confirm-label="Değişiklikleri at"
      description="Düzenleyiciden çıkarsanız son kaydettiğiniz sürüm kalır." @confirm="discardAndLeave" @cancel="leaveAsk = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { EkAlert, EkBadge, EkButton, EkConfirmDialog, EkFormDialog, EkPageTabs, EkRowActions, type EkPageTab, type EkRowAction } from '@entegrasyonik/ui/components'
import { formatDateTime } from '@entegrasyonik/ui/format'
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import useUser from '@/composables/user'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import TemplateEditor from '@/components/printouts/TemplateEditor.vue'
import TemplatePaper from '@/components/printouts/TemplatePaper.vue'
import TemplatePreview from '@/components/printouts/TemplatePreview.vue'
import {
  DOC_KINDS, PAPER_PRESETS, STARTER_TEMPLATES, blankTemplate, cloneDoc, copyTemplate, docKindLabel, paperLabel, sampleData,
  type DocKind, type TemplateDoc,
} from '@/components/printouts/templateModel'
import { TEMPLATE_LIMIT, readTemplates, templateStorageKey, writeTemplates, type TemplateFile } from '@/components/printouts/templateStore'

const TIPS = [
  'Hazır bir şablonun kopyasıyla başlayın; alanları soldan tıklayarak ya da sürükleyerek ekleyin.',
  'Önizlemede "Uzun içerik" verisiyle taşmayı yazdırmadan görün; denetim sorunlu öğeyi gösterir.',
  'Birden çok sipariş seçip tek seferde yazdırın; her sipariş ayrı sayfa olur.',
]
const THUMB = { w: 176, h: 168 }

const { getSessionScope } = useUser()
const { showToast } = useToast()
const toast = (message: string) => showToast({ tone: 'success', message })

// ─── Saklama ───
const storageKey = computed(() => templateStorageKey(getSessionScope.value.userId, getSessionScope.value.tenantId))
const file = ref<TemplateFile>({ v: 1, templates: [], defaults: {} })
const persistent = ref(true)
watch(storageKey, (k) => {
  const r = readTemplates(k)
  file.value = r.file
  persistent.value = r.persistent || !k
}, { immediate: true })
function persist() {
  if (!writeTemplates(storageKey.value, file.value) && storageKey.value) persistent.value = false
}

// ─── Galeri ───
type KindFilter = DocKind | 'all'
const kindFilter = ref<KindFilter>('all')
const all = computed(() => [...file.value.templates, ...STARTER_TEMPLATES])
const kindTabs = computed<EkPageTab[]>(() => [
  { value: 'all', label: 'Tümü', count: all.value.length },
  ...DOC_KINDS.map((k) => ({ value: k.id, label: k.label, count: all.value.filter((t) => t.kind === k.id).length })),
])
const byKind = (list: readonly TemplateDoc[]) => (kindFilter.value === 'all' ? [...list] : list.filter((t) => t.kind === kindFilter.value))
const mine = computed(() => byKind(file.value.templates).sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))))
const starters = computed(() => byKind(STARTER_TEMPLATES))
const thumbData = sampleData('normal')

/** Tür başına varsayılan: kullanıcı seçimi yoksa o türün ilk hazır şablonu. */
function isDefault(t: TemplateDoc) {
  const chosen = file.value.defaults[t.kind]
  if (chosen && all.value.some((x) => x.id === chosen)) return chosen === t.id
  return STARTER_TEMPLATES.find((s) => s.kind === t.kind)?.id === t.id
}
function setDefault(t: TemplateDoc) {
  file.value = { ...file.value, defaults: { ...file.value.defaults, [t.kind]: t.id } }
  persist()
  toast(`'${t.name}' artık ${docKindLabel(t.kind).toLocaleLowerCase('tr-TR')} için varsayılan.`)
}
function cardActions(t: TemplateDoc): EkRowAction[] {
  const items: EkRowAction[] = [
    { key: 'view', action: 'view', label: 'Önizle ve yazdır', icon: 'mdi-printer-outline', onClick: () => openPreview(t), inline: true },
    { key: 'copy', action: 'copy', label: 'Çoğalt', onClick: () => duplicate(t), inline: false },
  ]
  if (!isDefault(t)) items.push({ key: 'default', action: 'approve', label: 'Varsayılan yap', icon: 'mdi-star-outline', onClick: () => setDefault(t), inline: false })
  if (!t.system) items.push({ key: 'delete', action: 'delete', label: 'Sil', onClick: () => askDelete(t), inline: false })
  return items
}

// ─── Görünüm akışı ───
const view = ref<'gallery' | 'editor' | 'preview'>('gallery')
/** Düzenleyicideki şablon (kayıtlı sürüm). */
const current = ref<TemplateDoc | null>(null)
/** Önizlenen anlık görüntü (düzenleyiciden geldiyse kaydedilmemiş değişiklikleri içerir). */
const previewDoc = ref<TemplateDoc | null>(null)
const previewFrom = ref<'gallery' | 'editor'>('gallery')
const editorDirty = ref(false)
const leaveAsk = ref(false)

function addTemplate(doc: TemplateDoc): boolean {
  if (file.value.templates.length >= TEMPLATE_LIMIT) {
    showToast({ tone: 'warning', message: `En fazla ${TEMPLATE_LIMIT} şablon saklanabilir — kullanmadıklarınızı silin.` })
    return false
  }
  const stamped = { ...doc, updatedAt: new Date().toISOString() }
  file.value = { ...file.value, templates: [stamped, ...file.value.templates] }
  persist()
  return true
}
function openEditor(t: TemplateDoc) {
  current.value = cloneDoc(t)
  previewDoc.value = null
  editorDirty.value = false
  view.value = 'editor'
}
function editCopy(t: TemplateDoc) {
  const c = copyTemplate(t)
  if (!addTemplate(c)) return
  toast(`'${c.name}' oluşturuldu.`)
  openEditor(file.value.templates[0])
}
function duplicate(t: TemplateDoc) {
  const c = copyTemplate(t)
  if (addTemplate(c)) toast(`'${c.name}' oluşturuldu.`)
}
function openPreview(t: TemplateDoc, from: 'gallery' | 'editor' = 'gallery') {
  previewDoc.value = cloneDoc(t)
  previewFrom.value = from
  if (from === 'gallery') current.value = null
  view.value = 'preview'
}
function onPreviewEdit() {
  const d = previewDoc.value
  if (!d) return
  if (previewFrom.value === 'editor') view.value = 'editor'
  else if (d.system) editCopy(d)
  else openEditor(file.value.templates.find((t) => t.id === d.id) ?? d)
}
function backToGallery() {
  view.value = 'gallery'
  current.value = null
  previewDoc.value = null
}
function onSave(doc: TemplateDoc) {
  const stamped = { ...doc, system: false, updatedAt: new Date().toISOString() }
  const exists = file.value.templates.some((t) => t.id === doc.id)
  file.value = { ...file.value, templates: exists ? file.value.templates.map((t) => (t.id === doc.id ? stamped : t)) : [stamped, ...file.value.templates] }
  persist()
  current.value = stamped
  editorDirty.value = false
  toast(`'${doc.name}' kaydedildi.`)
}
function requestClose() {
  if (editorDirty.value) leaveAsk.value = true
  else backToGallery()
}
function discardAndLeave() {
  leaveAsk.value = false
  editorDirty.value = false
  backToGallery()
}

// ─── Yeni şablon ───
const createOpen = ref(false)
const createKind = ref<DocKind>('shipping-label')
const createPaper = ref('label-100x150')
watch(createKind, (k) => { createPaper.value = k === 'shipping-label' ? 'label-100x150' : 'a4' })
function openCreate() {
  createKind.value = kindFilter.value === 'all' ? 'shipping-label' : kindFilter.value
  createOpen.value = true
}
function createBlank() {
  const doc = blankTemplate(createKind.value, createPaper.value)
  if (!addTemplate(doc)) return
  createOpen.value = false
  openEditor(file.value.templates[0])
}

// ─── Silme ───
const deleteAsk = reactive<{ open: boolean; doc: TemplateDoc | null }>({ open: false, doc: null })
function askDelete(t: TemplateDoc) { deleteAsk.doc = t; deleteAsk.open = true }
function confirmDelete() {
  const t = deleteAsk.doc
  deleteAsk.open = false
  if (!t) return
  const defaults = { ...file.value.defaults }
  if (defaults[t.kind] === t.id) delete defaults[t.kind]
  file.value = { ...file.value, templates: file.value.templates.filter((x) => x.id !== t.id), defaults }
  persist()
  toast(`'${t.name}' silindi.`)
}
</script>

<style scoped>
.printoutListView {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-6);
  min-width: 0;
}
.ek-tpl-gallery__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}
.ek-tpl-gallery__toolbar :deep(.ek-page-tabs) { min-width: 0; max-width: 100%; }
.ek-tpl-gallery__head .ek-tpl-gallery__storage { display: flex; align-items: flex-start; gap: var(--ek-space-1); }
.ek-tpl-gallery__storage .v-icon { margin-top: 2px; flex: none; }
.ek-tpl-create {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-1);
  width: 100%;
  height: 100%;
  min-height: 200px;
  padding: var(--ek-space-4);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-sm);
  text-align: center;
  transition: var(--ek-transition-colors);
}
.ek-tpl-create > span:last-child { font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }
.ek-tpl-create:hover { border-color: var(--ek-color-action-border); background: var(--ek-color-action-subtle); }
.ek-tpl-create:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ek-tpl-create__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
}
.ek-tpl-gallery__section + .ek-tpl-gallery__section { margin-top: var(--ek-space-4); }
.ek-tpl-gallery__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-2);
  margin-bottom: var(--ek-space-3);
}
.ek-tpl-gallery__head h2 { margin: 0; font-size: var(--ek-font-size-md); font-weight: var(--ek-font-weight-semibold); color: var(--ek-color-content-strong); }
.ek-tpl-gallery__head > span { font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); font-variant-numeric: tabular-nums; }
.ek-tpl-gallery__head p { flex-basis: 100%; margin: 0; font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }

.ek-tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  gap: var(--ek-space-4);
  list-style: none;
  margin: 0;
  padding: 0;
}
.ek-tpl-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  overflow: hidden;
  transition: var(--ek-transition-colors);
}
.ek-tpl-card:hover { border-color: var(--ek-color-border-strong); box-shadow: var(--ek-shadow-md); }
.ek-tpl-card__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  background: var(--ek-color-surface-sunken);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  cursor: zoom-in;
}
.ek-tpl-card__thumb:focus-visible { outline: none; box-shadow: inset var(--ek-focus-ring); }
.ek-tpl-card__body { display: flex; flex-direction: column; gap: var(--ek-space-1); flex: 1 1 auto; padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-2); }
.ek-tpl-card__name { margin: 0; font-size: var(--ek-font-size-sm); font-weight: var(--ek-font-weight-semibold); color: var(--ek-color-content-strong); }
.ek-tpl-card__meta { margin: 0; font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }
.ek-tpl-card__badges { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-2); min-height: 22px; margin-top: var(--ek-space-1); }
.ek-tpl-card__time { font-size: var(--ek-font-size-2xs); color: var(--ek-color-content-subtle); font-variant-numeric: tabular-nums; }
.ek-tpl-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3) var(--ek-space-3) var(--ek-space-4);
}

.ek-tpl-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ek-space-2); border: 0; margin: 0 0 var(--ek-space-4); padding: 0; }
.ek-tpl-kinds legend { margin-bottom: var(--ek-space-2); font-size: var(--ek-font-size-sm); font-weight: var(--ek-font-weight-medium); color: var(--ek-color-content-strong); }
.ek-tpl-kind {
  display: flex;
  gap: var(--ek-space-2);
  align-items: flex-start;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  cursor: pointer;
  color: var(--ek-color-content-muted);
  transition: var(--ek-transition-colors);
}
.ek-tpl-kind:hover { border-color: var(--ek-color-border-strong); }
.ek-tpl-kind.is-active { border-color: var(--ek-color-action-border); background: var(--ek-color-action-subtle); color: var(--ek-color-action); }
.ek-tpl-kind input { position: absolute; opacity: 0; pointer-events: none; }
.ek-tpl-kind:has(input:focus-visible) { box-shadow: var(--ek-focus-ring); }
.ek-tpl-kind span { display: flex; flex-direction: column; font-size: var(--ek-font-size-sm); color: var(--ek-color-content-strong); }
.ek-tpl-kind small { font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }

@media (max-width: 599px) {
  .ek-tpl-kinds { grid-template-columns: 1fr; }
  .ek-tpl-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--ek-space-3); }
  .ek-tpl-card__thumb { height: 168px; }
  .ek-tpl-card__actions { flex-wrap: wrap; padding-left: var(--ek-space-3); }
}
@media (prefers-reduced-motion: reduce) {
  .ek-tpl-card, .ek-tpl-kind, .ek-tpl-create { transition: none; }
}
</style>
