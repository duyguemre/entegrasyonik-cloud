<!--
  frontend/src/components/productDefinitions/variants/ProductBatchVariantAttributesComponent.vue

  TOPLU ÖZELLİK DÜZENLE — varyantların pazaryeri özelliklerini ve kanal bilgilerini tek seferde atar.
  Toplu varyant düzenleyiciyle (grid/VariantBulkEditor.vue) aynı mantık:
    · kapsam: seçili varyantlar ya da tümü (başlıkta yazar) · değişiklikler TASLAKTA, önce önizleme, sonra "Uygula" ile forma
      (kalıcı kayıt ürün kaydet ile) · uygulanmamış değişiklikte kapatmadan önce satır içi onay
    · kanal seçici (kanal adı + rengi + değişiklik sayısı) · aranabilir, süzülebilir (Tümü / Zorunlu / Eksik / Değişen),
      sayfalı özellik tablosu — yatay kaydırma yok · "Varyantlarda şu an" kolonu mevcut değerleri özetler
    · tablo alanının yüksekliği yalnız büyür (arama/süzme diyaloğu zıplatmaz)
  Veri yolu değişmedi: `variant.platforms[kanal].attributes[özellikId] = { attributeName, attributeValue, attributeValueId }`,
  `variant.platforms[kanal].mapping` (kanal bilgileri: başlık, kargo, desi…). Kanal özellik listesi `loadIntegrationCategoryChoices`.
-->
<template>
  <EkDialogCard class="bva" title="Toplu özellik düzenle" icon="mdi-tag-multiple-outline" width="custom" hide-actions
    :description="`${variants.length === allCount ? 'Tüm' : 'Seçili'} ${variants.length} varyant · kanal özellikleri önce önizlenir, sonra forma yazılır`"
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
        :text="`Kategoriler ekranında “${categoryTitle}” kategorisini ${activeTitle} kategorisiyle eşleştirin; özellik listesi eşleştirmeden sonra gelir.`">
        <template v-if="canOpenScreen(CATEGORY_SCREEN)" #actions>
          <EkButton tone="secondary" size="sm" @click="openScreen(CATEGORY_SCREEN)">{{ t('channelAttributes.goCategoryMapping') }}</EkButton>
        </template>
      </EkAlert>
      <EkAlert v-else-if="mappingState.code === 'CHOICE'" tone="warning" dense :title="`${activeTitle} seçenek eşleştirmesi eksik`"
        :text="`“${categoryTitle}” kategorisinin ${activeTitle} ayarlarında şu seçenekleri eşleştirin: ${mappingState.choices.map((c: string) => choicesStore.getChoiceTitle(c as any)).join(', ')}.`" />

      <template v-else>
        <!-- kanal bilgileri (katlanır) -->
        <section class="bva-info" :class="{ 'is-open': infoOpen }">
          <button type="button" class="bva-info__head" :aria-expanded="infoOpen" aria-controls="bva-info-body" @click="infoOpen = !infoOpen">
            <v-icon class="bva-chev" icon="mdi-chevron-right" aria-hidden="true" />
            <span class="bva-info__title">Kanal bilgileri</span>
            <span class="bva-caption bva-info__sub">Başlık, kargo, desi, garanti… — boş bırakılan alan ürün varsayılanını kullanır</span>
            <span v-if="mappingChangeCount(active)" class="bva-dot ek-num" :aria-label="`${mappingChangeCount(active)} alan dolduruldu`">{{ mappingChangeCount(active) }}</span>
          </button>
          <!-- Açılma yumuşak: içerik önceden çizilir (kanal bileşenleri yüklenmiş olur), yükseklik 0fr → 1fr geçişiyle açılır;
               kapalıyken `inert` (odak/ekran okuyucu içeri girmez). Diyalog "tak" diye uzamaz. -->
          <div id="bva-info-body" class="bva-info__reveal" :inert="!infoOpen || undefined">
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
            <AttrTableSkeleton v-else-if="!attrs.get(active)" :columns="3" :label="`${activeTitle} kategori özellikleri alınıyor…`" />
            <table v-else-if="pageAttrs.length" class="bva-table">
              <caption class="ek-sr-only">{{ activeTitle }} özellikleri</caption>
              <colgroup><col class="bva-c-name" /><col class="bva-c-value" /><col class="bva-c-now" /></colgroup>
              <thead>
                <tr><th scope="col">Özellik</th><th scope="col">Yeni değer</th><th scope="col">Varyantlarda şu an</th></tr>
              </thead>
              <tbody>
                <tr v-for="a in pageAttrs" :key="a._id" :class="{ 'is-changed': isChanged(a), 'is-missing': isMissing(a) }">
                  <th scope="row">
                    <span class="bva-name" :title="a.title">{{ a.title }}</span>
                    <span v-if="a.required" class="bva-req" :class="{ 'is-missing': isMissing(a) }">Zorunlu</span>
                  </th>
                  <td class="bva-valuecell">
                    <AttrValueField :attribute="a" :model-value="draft[active]?.attributes[a._id]" :loading="lazyLoading.has(a._id)"
                      :placeholder="a.allowCustom ? 'Değişiklik yok · yazın ya da seçin' : 'Değişiklik yok'"
                      :error="valueErrors.get(a._id)" :mapped="isAttributeMapped(active, a)" :channel-title="activeTitle"
                      @open="loadLazyValues(active, a)" @retry="retryValues(active, a)" @go-mapping="openScreen(CATEGORY_SCREEN)"
                      @update:model-value="(v) => setValue(a, v)" />
                  </td>
                  <td class="bva-now"><span class="bva-now__txt" :class="{ 'is-empty': nowOf(a).empty }" :title="nowOf(a).title">{{ nowOf(a).text }}</span></td>
                </tr>
              </tbody>
            </table>
            <EkEmptyState v-else-if="query || filter !== 'all'" class="bva-empty" variant="no-results" title="Bu ölçüte uyan özellik yok"
              message="Aramayı temizleyin ya da “Tümü” süzgecine dönün."
              show-action action-text="Tümünü göster" action-icon="mdi-close" @action="query = ''; filter = 'all'" />
            <EkEmptyState v-else class="bva-empty" variant="no-data" title="Düzenlenecek özellik yok"
              :message="`${activeTitle} bu kategori için varyant düzeyinde ek özellik istemiyor.`" />
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
          <EkButton size="sm" tone="danger" icon="mdi-trash-can-outline" @click="emit('close')">Değişiklikleri at</EkButton>
        </div>
        <div v-else class="bva-foot__actions">
          <EkButton @click="requestClose">Vazgeç</EkButton>
          <EkButton tone="primary" icon="mdi-eye-outline" :disabled="!changes.length" @click="openPreview">
            Değişiklikleri gözden geçir ({{ changes.length }})
          </EkButton>
        </div>
      </div>
      <div class="ek-sr-only" aria-live="polite">{{ live }}</div>
    </template>

    <!-- önizleme -->
    <template v-else>
      <div class="bva-preview">
        <div class="bva-preview__head">
          <EkIconTile icon="mdi-format-list-checks" tone="action" size="sm" />
          <div>
            <h3 class="bva-preview__title">{{ changes.length }} değişiklik, {{ variants.length }} varyanta yazılacak</h3>
            <p class="bva-preview__desc">Varyantlardaki farklı değerlerin üzerine yazılır. Uygula ile değerler forma yazılır; kalıcı olması için ardından ürünü kaydedin.</p>
          </div>
        </div>
        <div class="bva-frame">
          <div class="bva-diffwrap">
            <table class="bva-diff">
              <caption class="ek-sr-only">Değişiklik önizlemesi</caption>
              <colgroup><col class="bva-d-ch" /><col class="bva-d-name" /><col /><col /></colgroup>
              <thead><tr><th scope="col">Kanal</th><th scope="col">Alan</th><th scope="col">Varyantlarda şu an</th><th scope="col">Yeni değer</th></tr></thead>
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
          <EkButton tone="primary" icon="mdi-check" @click="apply">{{ variants.length }} varyanta uygula</EkButton>
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
import EkHelpHint from '@/components/page/EkHelpHint.vue'
import IntegrationErrorPanel from '@/components/integrations/IntegrationErrorPanel.vue'
import AttrTableSkeleton from './AttrTableSkeleton.vue'
import VariantInfoComponent from './platformInfos/VariantInfoComponent.vue'
import AttrValueField from './AttrValueField.vue'
import { useI18n } from 'vue-i18n'
import { useHelpNavigation } from '@/help/useHelpNavigation'
import {
  INFO_LABELS, attrValueText, infoDisplay, isFilled, platformInfoComponents, useChannelAttributes, type StoredAttr,
} from './channelAttributes'

const PAGE_SIZES = [10, 25, 50, 100]

const props = defineProps<{ variants: any[]; allCount: number; productInfoForm: any }>()
const emit = defineEmits<{ close: []; applied: [count: number] }>()

const choicesStore = useChoicesStore()
// Varyant ekseni (varianter) ve zorunlu ayırıcı (slicer) seçeneklerden gelir; toplu düzenlenmez.
const {
  channels, channelTitle, categoryTitle, mappingState: mappingOf, attrs, attrErrors, retrying, loadAttrs, retry, loadLazyValues, lazyLoading,
  retryValues, valueErrors, isAttributeMapped,
} = useChannelAttributes({ category: () => props.productInfoForm.category, keep: (a) => !a.varianter && !(a.required && a.slicer) })
/** [eslesme-fiyat WP2, Ek C P1-3] Eşleme uyarıları/değer alanı ilgili ekrana götürür (Kategoriler: kanal eşleme satırı orada). */
const CATEGORY_SCREEN = 'productDefinitions/CategoryListView'
const { openScreen, canOpenScreen } = useHelpNavigation()
const { t } = useI18n()

// ── kanal + taslak ──
const active = ref<string>(channels.value[0]?.code || '')
const activeTitle = computed(() => channelTitle(active.value))
const mappingState = computed(() => mappingOf(active.value))
type ChannelDraft = { attributes: Record<string, StoredAttr>; mapping: Record<string, any> }
const draft = reactive<Record<string, ChannelDraft>>({})
const ensureDraft = (code: string) => { if (!draft[code]) draft[code] = { attributes: {}, mapping: {} } }
function setChannel(code: string) {
  active.value = code
  ensureDraft(code)
  page.value = 1
  void loadAttrs(code)
}
onMounted(() => { if (active.value) setChannel(active.value) })

// ── mevcut değerler (hedef varyantlarda) ──
function nowOf(a: any, code = active.value) {
  const texts = props.variants.map((v) => attrValueText(a, v.platforms?.[code]?.attributes?.[a._id]))
  const filled = texts.filter(Boolean)
  const distinct = [...new Set(filled)]
  const empty = texts.length - filled.length
  if (!distinct.length) return { text: 'Boş', title: 'Hiçbir varyantta değer yok', empty: true, missing: true }
  if (distinct.length === 1) return { text: empty ? `${distinct[0]} · ${empty} boş` : distinct[0], title: distinct[0], empty: false, missing: empty > 0 }
  return { text: `${distinct.length} farklı değer${empty ? ` · ${empty} boş` : ''}`, title: distinct.join(', '), empty: false, missing: empty > 0 }
}
function setValue(a: any, v: StoredAttr | null) {
  const d = draft[active.value]
  if (!d) return
  if (v) d.attributes[a._id] = v
  else delete d.attributes[a._id]
}

// ── süzme / sayfalama ──
type Filter = 'all' | 'required' | 'missing' | 'changed'
const filter = ref<Filter>('all')
const query = ref<string | null>('')
const page = ref(1)
const pageSize = ref(25)
const isChanged = (a: any) => !!draft[active.value]?.attributes[a._id]
const isMissing = (a: any) => !!a.required && !isChanged(a) && nowOf(a).missing
const activeAttrs = computed(() => attrs.value.get(active.value) || [])
const filters = computed(() => [
  { key: 'all' as Filter, label: 'Tümü', count: activeAttrs.value.length },
  { key: 'required' as Filter, label: 'Zorunlu', count: activeAttrs.value.filter((a) => a.required).length },
  { key: 'missing' as Filter, label: 'Eksik zorunlu', count: activeAttrs.value.filter(isMissing).length },
  { key: 'changed' as Filter, label: 'Değişen', count: activeAttrs.value.filter(isChanged).length },
])
const visibleAttrs = computed(() => {
  const q = (query.value || '').trim().toLocaleLowerCase('tr')
  return activeAttrs.value.filter((a) => {
    if (q && !String(a.title || '').toLocaleLowerCase('tr').includes(q)) return false
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
const mappingEntries = (code: string) => Object.entries(draft[code]?.mapping || {}).filter(([, v]) => isFilled(v))
const mappingChangeCount = (code: string) => mappingEntries(code).length

// ── değişiklikler ──
interface Change { key: string; channel: string; kind: 'attr' | 'info'; label: string; before: string; after: string }
const attrById = (code: string, id: string) => (attrs.value.get(code) || []).find((a: any) => a._id === id)
const changes = computed<Change[]>(() => {
  const out: Change[] = []
  for (const ch of channels.value) {
    const d = draft[ch.code]
    if (!d) continue
    for (const [key, v] of mappingEntries(ch.code)) {
      out.push({ key: `${ch.code}|i|${key}`, channel: ch.code, kind: 'info', label: INFO_LABELS[key] || key, before: '—', after: infoDisplay(v) })
    }
    for (const [id, val] of Object.entries(d.attributes)) {
      const a = attrById(ch.code, id)
      out.push({ key: `${ch.code}|a|${id}`, channel: ch.code, kind: 'attr', label: val.attributeName, before: a ? nowOf(a, ch.code).text : '—', after: val.attributeValue || '—' })
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
const live = ref('')
function openPreview() { previewPage.value = 1; step.value = 'preview' }
function requestClose() {
  if (step.value === 'edit' && changes.value.length && !confirmDiscard.value) { confirmDiscard.value = true; return }
  if (step.value === 'preview') { step.value = 'edit'; confirmDiscard.value = true; return }
  emit('close')
}
function apply() {
  for (const v of props.variants) {
    v.platforms = v.platforms || {}
    for (const ch of channels.value) {
      const d = draft[ch.code]
      if (!d || (!Object.keys(d.attributes).length && !mappingChangeCount(ch.code))) continue
      const p = (v.platforms[ch.code] = v.platforms[ch.code] || {})
      p.attributes = p.attributes || {}
      p.mapping = p.mapping || {}
      for (const [key, val] of mappingEntries(ch.code)) p.mapping[key] = Array.isArray(val) ? [...val] : val
      for (const [id, val] of Object.entries(d.attributes)) p.attributes[id] = { ...val }
    }
  }
  emit('applied', changes.value.length)
}

// ── sabit yükseklik: süzme/arama tabloyu kısaltınca diyalog zıplamasın (toplu düzenleyiciyle aynı) ──
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
</style>
