<!--
  frontend/src/components/productDefinitions/variants/ProductVariantAttributesComponent.vue

  VARYANT BİLGİLERİ — tek varyantın pazaryeri özellikleri ve kanal bilgileri (ızgarada satırın kalem düğmesi).
  Toplu özellik düzenle (ProductBatchVariantAttributesComponent) ile AYNI yapı ve ortak parçalar
  (channelAttributes.ts · AttrValueField.vue · channelAttributeEditor.css):
    · kanal seçici (ad + renk + değişiklik sayısı) · eşleştirme eksikse anlaşılır uyarı · katlanır, yumuşak açılan kanal bilgileri
    · aranabilir, süzülebilir (Tümü / Varyant ekseni / Zorunlu / Eksik zorunlu / Değişen), sayfalı özellik tablosu — yatay kaydırma yok
    · değişiklikler TASLAKTA (eskiden alanlar varyanta anında yazılıyor, "Varyanta Ata" yalnız kapatıyordu); değişen satırda
      önceki değer görünür; önizleme → "Varyanta uygula"; uygulanmamış değişiklikte kapatmadan önce satır içi onay
    · kayıtlı değeri kanal listesinde artık olmayan özellik işaretlenir (eskiden açılışta sessizce siliniyordu)
  Veri yolu değişmedi: `variant.platforms[kanal].attributes[özellikId] = { attributeName, attributeValue, attributeValueId }`,
  `variant.platforms[kanal].mapping`. Kalıcı kayıt ürün kaydet/güncelle ile.
-->
<template>
  <EkDialogCard class="bva" title="Varyant bilgileri" icon="mdi-tag-outline" width="custom" hide-actions
    :description="`${variantLabel}${editingVariant?.stockcode ? ` · ${editingVariant.stockcode}` : ''} · değişiklikler önizlenir, sonra varyanta yazılır`"
    @close="requestClose">
    <template v-if="!channels.length">
      <EkEmptyState variant="not-connected" title="Bağlı pazaryeri yok"
        message="Varyant özellikleri pazaryerine özgüdür. Önce Entegrasyonlar ekranından bir pazaryeri bağlayın." />
    </template>

    <template v-else-if="step === 'edit'">
      <!-- kanal -->
      <div class="bva-chans" role="radiogroup" aria-label="Özellikleri düzenlenen kanal">
        <span class="bva-label">Kanal</span>
        <button v-for="ch in channels" :key="ch.code" type="button" role="radio" class="bva-chan" :class="[channelClass(ch.code), { 'is-on': ch.code === active }]"
          :aria-checked="ch.code === active" @click="setChannel(ch.code)">
          <EkPlatformMark :code="ch.code" :name="ch.title" />
          <span v-if="channelChangeCount(ch.code)" class="bva-dot ek-num" :aria-label="`${channelChangeCount(ch.code)} değişiklik`">{{ channelChangeCount(ch.code) }}</span>
        </button>
      </div>

      <EkAlert v-if="mappingState.code === 'PLATFORM'" tone="warning" dense :title="`${activeTitle} kategori eşleştirmesi eksik`"
        :text="`Kategoriler ekranında “${categoryTitle}” kategorisini ${activeTitle} kategorisiyle eşleştirin; özellik listesi eşleştirmeden sonra gelir.`" />
      <EkAlert v-else-if="mappingState.code === 'CHOICE'" tone="warning" dense :title="`${activeTitle} seçenek eşleştirmesi eksik`"
        :text="`“${categoryTitle}” kategorisinin ${activeTitle} ayarlarında şu seçenekleri eşleştirin: ${mappingState.choices.map((c: string) => choicesStore.getChoiceTitle(c as any)).join(', ')}.`" />

      <template v-else>
        <!-- kanal bilgileri (katlanır, yumuşak açılır) -->
        <section class="bva-info" :class="{ 'is-open': infoOpen }">
          <button type="button" class="bva-info__head" :aria-expanded="infoOpen" aria-controls="pva-info-body" @click="infoOpen = !infoOpen">
            <v-icon class="bva-chev" icon="mdi-chevron-right" aria-hidden="true" />
            <span class="bva-info__title">Kanal bilgileri</span>
            <span class="bva-caption bva-info__sub">Başlık, kargo, desi, garanti… — boş bırakılan alan ürün varsayılanını kullanır</span>
            <span v-if="mappingChanges(active).length" class="bva-dot ek-num" :aria-label="`${mappingChanges(active).length} alan değişti`">{{ mappingChanges(active).length }}</span>
          </button>
          <div id="pva-info-body" class="bva-info__reveal" :inert="!infoOpen || undefined">
            <div class="bva-info__clip">
              <div v-if="draft[active]" class="bva-info__body ci-grid">
                <VariantInfoComponent v-model="draft[active].mapping" :productInfoForm="productInfoForm" :channel="active" />
                <component :is="platformInfoComponents.get(active)" v-if="platformInfoComponents.get(active)"
                  v-model="draft[active].mapping" :productInfoForm="productInfoForm" />
              </div>
            </div>
          </div>
        </section>

        <!-- özellik araçları -->
        <div class="bva-tools">
          <v-text-field v-model="query" class="bva-search" density="compact" variant="outlined" hide-details clearable
            prepend-inner-icon="mdi-magnify" placeholder="Özellik ara" aria-label="Özelliklerde ara" />
          <div class="bva-seg" role="radiogroup" aria-label="Gösterilen özellikler">
            <button v-for="f in filters" :key="f.key" type="button" role="radio" class="bva-seg__btn" :class="{ 'is-on': filter === f.key }"
              :aria-checked="filter === f.key" @click="filter = f.key">
              {{ f.label }}<span class="bva-seg__n ek-num" :class="{ 'is-warn': f.key === 'missing' && f.count > 0 }">{{ f.count }}</span>
            </button>
          </div>
          <EkHelpHint hint="attributes.required" />
        </div>

        <!-- özellik tablosu -->
        <div class="bva-frame">
          <div ref="scrollRef" class="bva-scroll">
            <div v-if="attrErrors.get(active)" class="bva-state">
              <IntegrationErrorPanel :info="attrErrors.get(active)!" :retrying="retrying" :autofocus="false" @retry="retry(active)" />
            </div>
            <AttrTableSkeleton v-else-if="!attrs.get(active)" :columns="2" :label="`${activeTitle} kategori özellikleri alınıyor…`" />
            <table v-else-if="pageAttrs.length" class="bva-table">
              <caption class="ek-sr-only">{{ activeTitle }} özellikleri</caption>
              <colgroup><col class="pva-c-name" /><col class="pva-c-value" /></colgroup>
              <thead>
                <tr><th scope="col">Özellik</th><th scope="col">Değer</th></tr>
              </thead>
              <tbody>
                <tr v-for="a in pageAttrs" :key="a._id" :class="{ 'is-changed': isChanged(a), 'is-missing': isMissing(a) || isInvalid(a) }">
                  <th scope="row">
                    <span class="bva-name" :title="a.title">{{ a.title }}</span>
                    <span class="pva-tags">
                      <span v-if="a.varianter || a.slicer" class="bva-req pva-axis">Varyant ekseni</span>
                      <span v-if="a.required" class="bva-req" :class="{ 'is-missing': isMissing(a) }">Zorunlu</span>
                      <span v-if="isChanged(a)" class="pva-before" :title="`Önceki: ${beforeText(a)}`">Önceki: {{ beforeText(a) }}</span>
                      <span v-else-if="isInvalid(a)" class="pva-before is-warn">Kayıtlı değer kanalda yok — yeniden seçin</span>
                    </span>
                  </th>
                  <td class="bva-valuecell">
                    <AttrValueField :attribute="a" :model-value="draft[active]?.attributes[a._id]" :loading="lazyLoading.has(a._id)"
                      :placeholder="a.allowCustom ? 'Yazın ya da seçin' : 'Seçin'"
                      @open="loadLazyValues(active, a)" @update:model-value="(v) => setValue(a, v)" />
                  </td>
                </tr>
              </tbody>
            </table>
            <EkEmptyState v-else-if="query || filter !== 'all'" class="bva-empty" variant="no-results" title="Bu ölçüte uyan özellik yok"
              message="Aramayı temizleyin ya da “Tümü” süzgecine dönün."
              show-action action-text="Tümünü göster" action-icon="mdi-close" @action="query = ''; filter = 'all'" />
            <EkEmptyState v-else class="bva-empty" variant="no-data" title="Düzenlenecek özellik yok"
              :message="`${activeTitle} bu kategori için varyant düzeyinde özellik istemiyor.`" />
          </div>
          <EkPagerBar v-if="visibleAttrs.length > PAGE_SIZES[0]" :page="page" :page-size="pageSize" :total="visibleAttrs.length"
            :page-size-options="PAGE_SIZES" label="Özellik sayfaları" @update:page="(p: number) => (page = p)"
            @update:page-size="(n: number) => { pageSize = n; page = 1 }" />
        </div>
      </template>

      <div class="bva-foot">
        <div class="bva-foot__summary" role="status">
          <span class="bva-sum" :class="{ 'is-on': changes.length > 0 }"><strong class="ek-num">{{ changes.length }}</strong> değişiklik</span>
          <span v-if="changedChannels > 1" class="bva-sum">{{ changedChannels }} kanalda</span>
        </div>
        <div v-if="confirmDiscard" class="bva-discard" role="alert">
          <v-icon icon="mdi-alert-outline" aria-hidden="true" />
          <span><strong>{{ changes.length }} değişiklik uygulanmadı.</strong> Çıkarsanız bu değişiklikler kaybolur.</span>
          <EkButton size="sm" @click="confirmDiscard = false">Düzenlemeye dön</EkButton>
          <EkButton size="sm" tone="danger" icon="mdi-trash-can-outline" @click="emits('close')">Değişiklikleri at</EkButton>
        </div>
        <div v-else class="bva-foot__actions">
          <EkButton @click="requestClose">Vazgeç</EkButton>
          <EkButton tone="primary" icon="mdi-eye-outline" :disabled="!changes.length" @click="openPreview">
            Değişiklikleri gözden geçir ({{ changes.length }})
          </EkButton>
        </div>
      </div>
    </template>

    <!-- önizleme -->
    <template v-else>
      <div class="bva-preview">
        <div class="bva-preview__head">
          <EkIconTile icon="mdi-format-list-checks" tone="action" size="sm" />
          <div>
            <h3 class="bva-preview__title">{{ changes.length }} değişiklik · {{ variantLabel }}</h3>
            <p class="bva-preview__desc">Uygula ile değerler varyanta yazılır; kalıcı olması için ardından ürünü kaydedin.</p>
          </div>
        </div>
        <div class="bva-frame">
          <div class="bva-diffwrap">
            <table class="bva-diff">
              <caption class="ek-sr-only">Değişiklik önizlemesi</caption>
              <colgroup><col class="bva-d-ch" /><col class="bva-d-name" /><col /><col /></colgroup>
              <thead><tr><th scope="col">Kanal</th><th scope="col">Alan</th><th scope="col">Önce</th><th scope="col">Sonra</th></tr></thead>
              <tbody>
                <tr v-for="c in previewRows" :key="c.key">
                  <td><EkPlatformMark :code="c.channel" :name="channelTitle(c.channel)" /></td>
                  <th scope="row"><span class="bva-ellipsis">{{ c.label }}</span><span class="bva-diff__sub">{{ c.kind === 'info' ? 'Kanal bilgisi' : 'Özellik' }}</span></th>
                  <td class="bva-diff__before"><span class="bva-ellipsis" :title="c.before">{{ c.before }}</span></td>
                  <td class="bva-diff__after"><span class="bva-ellipsis" :title="c.after">{{ c.after }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <EkPagerBar v-if="changes.length > PAGE_SIZES[0]" :page="previewPage" :page-size="previewSize" :total="changes.length"
            :page-size-options="PAGE_SIZES" label="Önizleme sayfaları" @update:page="(p: number) => (previewPage = p)"
            @update:page-size="(n: number) => { previewSize = n; previewPage = 1 }" />
        </div>
      </div>
      <div class="bva-foot">
        <div class="bva-foot__summary"></div>
        <div class="bva-foot__actions">
          <EkButton icon="mdi-arrow-left" @click="step = 'edit'">Düzenlemeye dön</EkButton>
          <EkButton tone="primary" icon="mdi-check" @click="apply">Varyanta uygula</EkButton>
        </div>
      </div>
    </template>
  </EkDialogCard>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { EkAlert, EkButton, EkPlatformMark, EkDialogCard, EkEmptyState, EkIconTile, EkPagerBar } from '@entegrasyonik/ui/components'
import { channelClass } from '@entegrasyonik/ui/tokens'
import { useChoicesStore } from '@/stores/choicesStore'
import { useSnackbarStore } from '@/stores/snackbarStore'
import EkHelpHint from '@/components/page/EkHelpHint.vue'
import IntegrationErrorPanel from '@/components/integrations/IntegrationErrorPanel.vue'
import AttrTableSkeleton from './AttrTableSkeleton.vue'
import VariantInfoComponent from './platformInfos/VariantInfoComponent.vue'
import AttrValueField from './AttrValueField.vue'
import {
  INFO_LABELS, attrValueText, infoDisplay, isFilled, normalizeStored, platformInfoComponents, sameStored, useChannelAttributes,
  type StoredAttr,
} from './channelAttributes'

const PAGE_SIZES = [10, 25, 50, 100]

// Çağıran `v-model` bağlıyor (açık/kapalı); panel kendisi kullanmaz, `close` yayar.
defineModel({ default: false })
const emits = defineEmits(['refreshImages', 'close'])
const props = defineProps<{ productInfoForm: any; editingVariant: any }>()

const choicesStore = useChoicesStore()
const snackbarStore = useSnackbarStore()
const {
  channels, channelTitle, categoryTitle, mappingState: mappingOf, attrs, attrErrors, retrying, loadAttrs, retry, loadLazyValues, lazyLoading,
} = useChannelAttributes({ category: () => props.productInfoForm.category })

const variantLabel = computed(() => (props.editingVariant?.choices || [])
  .map((c: any) => choicesStore.getDirectChoiceValueTitle(c.choiceValueId)).filter(Boolean).join(' / ') || 'Varyant')

// ── kanal + taslak (varyantın o kanaldaki değerlerinin kopyası; varyanta "Varyanta uygula" ile yazılır) ──
const active = ref<string>(channels.value[0]?.code || '')
const activeTitle = computed(() => channelTitle(active.value))
const mappingState = computed(() => mappingOf(active.value))
type ChannelDraft = { attributes: Record<string, StoredAttr>; mapping: Record<string, any> }
const draft = reactive<Record<string, ChannelDraft>>({})
const base: Record<string, ChannelDraft> = {}
function ensureDraft(code: string) {
  if (draft[code]) return
  const src = props.editingVariant?.platforms?.[code] || {}
  const attrsCopy: Record<string, StoredAttr> = {}
  for (const [id, v] of Object.entries(src.attributes || {})) {
    const n = normalizeStored({ title: (v as any)?.attributeName }, v)
    if (n) attrsCopy[id] = n
  }
  base[code] = { attributes: JSON.parse(JSON.stringify(attrsCopy)), mapping: JSON.parse(JSON.stringify(src.mapping || {})) }
  draft[code] = { attributes: attrsCopy, mapping: JSON.parse(JSON.stringify(src.mapping || {})) }
}
function setChannel(code: string) {
  active.value = code
  ensureDraft(code)
  page.value = 1
  void loadAttrs(code)
}
onMounted(() => { if (active.value) setChannel(active.value) })
function setValue(a: any, v: StoredAttr | null) {
  const d = draft[active.value]
  if (!d) return
  if (v) d.attributes[a._id] = v
  else delete d.attributes[a._id]
}

// ── durumlar ──
const isChanged = (a: any, code = active.value) => !sameStored(draft[code]?.attributes[a._id], base[code]?.attributes[a._id])
const hasValue = (a: any) => !!draft[active.value]?.attributes[a._id]
const isMissing = (a: any) => !!a.required && !hasValue(a)
/** Liste değerli özellikte kayıtlı kimlik kanal listesinde yok (kanal değeri kaldırmış / kategori değişmiş). */
const isInvalid = (a: any) => {
  const cur = draft[active.value]?.attributes[a._id]
  if (!cur || a.allowCustom || a.lazyValues || !a.values?.length || !cur.attributeValueId) return false
  return !a.values.some((v: any) => String(v.id) === cur.attributeValueId)
}
const beforeText = (a: any) => attrValueText(a, base[active.value]?.attributes[a._id]) || 'boş'

// ── süzme / sayfalama ──
type Filter = 'all' | 'axis' | 'required' | 'missing' | 'changed'
const filter = ref<Filter>('all')
const query = ref<string | null>('')
const page = ref(1)
const pageSize = ref(25)
const activeAttrs = computed(() => attrs.value.get(active.value) || [])
const isAxis = (a: any) => !!(a.varianter || a.slicer)
const filters = computed(() => [
  { key: 'all' as Filter, label: 'Tümü', count: activeAttrs.value.length },
  { key: 'axis' as Filter, label: 'Varyant ekseni', count: activeAttrs.value.filter(isAxis).length },
  { key: 'required' as Filter, label: 'Zorunlu', count: activeAttrs.value.filter((a) => a.required).length },
  { key: 'missing' as Filter, label: 'Eksik zorunlu', count: activeAttrs.value.filter(isMissing).length },
  { key: 'changed' as Filter, label: 'Değişen', count: activeAttrs.value.filter((a) => isChanged(a)).length },
].filter((f) => f.key !== 'axis' || f.count > 0))
const visibleAttrs = computed(() => {
  const q = (query.value || '').trim().toLocaleLowerCase('tr')
  return activeAttrs.value.filter((a) => {
    if (q && !String(a.title || '').toLocaleLowerCase('tr').includes(q)) return false
    if (filter.value === 'axis') return isAxis(a)
    if (filter.value === 'required') return !!a.required
    if (filter.value === 'missing') return isMissing(a)
    if (filter.value === 'changed') return isChanged(a)
    return true
  })
})
const pageAttrs = computed(() => visibleAttrs.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([query, filter], () => { page.value = 1 })
watch(() => visibleAttrs.value.length, (n) => { const max = Math.max(1, Math.ceil(n / pageSize.value)); if (page.value > max) page.value = max })

// ── kanal bilgileri ──
const infoOpen = ref(false)
const norm = (v: any) => (isFilled(v) ? JSON.stringify(v) : '')
function mappingChanges(code: string) {
  const d = draft[code]?.mapping || {}
  const b = base[code]?.mapping || {}
  return [...new Set([...Object.keys(d), ...Object.keys(b)])].filter((k) => norm(d[k]) !== norm(b[k]))
}

// ── değişiklikler ──
interface Change { key: string; channel: string; kind: 'attr' | 'info'; label: string; before: string; after: string }
const attrById = (code: string, id: string) => (attrs.value.get(code) || []).find((a: any) => a._id === id)
const changes = computed<Change[]>(() => {
  const out: Change[] = []
  for (const ch of channels.value) {
    const d = draft[ch.code]
    if (!d) continue
    for (const k of mappingChanges(ch.code)) {
      out.push({ key: `${ch.code}|i|${k}`, channel: ch.code, kind: 'info', label: INFO_LABELS[k] || k, before: infoDisplay(base[ch.code].mapping[k]), after: infoDisplay(d.mapping[k]) })
    }
    const ids = new Set([...Object.keys(d.attributes), ...Object.keys(base[ch.code]?.attributes || {})])
    for (const id of ids) {
      const cur = d.attributes[id]
      const prev = base[ch.code]?.attributes[id]
      if (sameStored(cur, prev)) continue
      const a = attrById(ch.code, id)
      out.push({ key: `${ch.code}|a|${id}`, channel: ch.code, kind: 'attr', label: a?.title || cur?.attributeName || prev?.attributeName || id,
        before: prev?.attributeValue || '—', after: cur?.attributeValue || 'Kaldırıldı' })
    }
  }
  return out
})
const channelChangeCount = (code: string) => changes.value.filter((c) => c.channel === code).length
const changedChannels = computed(() => new Set(changes.value.map((c) => c.channel)).size)

// ── önizleme / uygula / kapat ──
const step = ref<'edit' | 'preview'>('edit')
const confirmDiscard = ref(false)
const previewPage = ref(1)
const previewSize = ref(25)
const previewRows = computed(() => changes.value.slice((previewPage.value - 1) * previewSize.value, previewPage.value * previewSize.value))
function openPreview() { previewPage.value = 1; step.value = 'preview' }
function requestClose() {
  if (step.value === 'edit' && changes.value.length && !confirmDiscard.value) { confirmDiscard.value = true; return }
  if (step.value === 'preview') { step.value = 'edit'; confirmDiscard.value = true; return }
  emits('close')
}
function apply() {
  const v = props.editingVariant
  const count = changes.value.length
  v.platforms = v.platforms || {}
  for (const ch of channels.value) {
    const d = draft[ch.code]
    if (!d || !channelChangeCount(ch.code)) continue
    const p = (v.platforms[ch.code] = v.platforms[ch.code] || {})
    p.attributes = p.attributes || {}
    p.mapping = p.mapping || {}
    for (const id of Object.keys(base[ch.code].attributes)) if (!d.attributes[id]) delete p.attributes[id]
    for (const [id, val] of Object.entries(d.attributes)) p.attributes[id] = { ...val }
    for (const k of mappingChanges(ch.code)) {
      if (isFilled(d.mapping[k])) p.mapping[k] = Array.isArray(d.mapping[k]) ? [...d.mapping[k]] : d.mapping[k]
      else delete p.mapping[k]
    }
  }
  snackbarStore.addSnackbar({ show: true, text: `${count} değişiklik varyanta yazıldı — kaydetmek için ürünü kaydedin`, timeout: 3000, color: 'success' })
  emits('close')
}

// ── sabit yükseklik: süzme/arama tabloyu kısaltınca diyalog zıplamasın ──
const scrollRef = ref<HTMLElement | null>(null)
const lockH = ref(0)
const lockMin = computed(() => (lockH.value ? `min(${lockH.value}px, max(240px, calc(100dvh - 480px)))` : '240px'))
let ro: ResizeObserver | null = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  ro = new ResizeObserver(() => { const h = scrollRef.value?.offsetHeight || 0; if (h > lockH.value) lockH.value = h })
  if (scrollRef.value) ro.observe(scrollRef.value)
})
watch(scrollRef, (el) => { if (el && ro) ro.observe(el) })
onBeforeUnmount(() => ro?.disconnect())

defineExpose({ changes, apply, requestClose })
</script>

<style scoped src="./channelAttributeEditor.css"></style>
<style scoped>
/* tablo alanı yalnız büyür (diyalog zıplamasın) */
.bva-scroll { min-height: v-bind(lockMin); }
/* tek varyant: 2 kolon (özellik | değer) */
.pva-c-name { width: 36%; }
.pva-c-value { width: 64%; }
.pva-tags { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-1) var(--ek-space-2); margin-top: 2px; }
.pva-tags .bva-req { margin-left: 0; }
.pva-axis { background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); }
.pva-before {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pva-before.is-warn { color: var(--ek-color-warning-emphasis); }
.bva-table tbody th { height: auto; padding-top: var(--ek-space-2); padding-bottom: var(--ek-space-2); }
@media (max-width: 600px) {
  .pva-c-name { width: 40%; }
  .pva-c-value { width: 60%; }
}
</style>
