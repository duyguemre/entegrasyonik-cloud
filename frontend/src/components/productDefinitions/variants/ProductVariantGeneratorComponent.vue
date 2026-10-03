<!--
  frontend/src/components/productDefinitions/variants/ProductVariantGeneratorComponent.vue

  Varyant oluşturucu (FE-LOCAL-1002b): dar açılır menü yerine pencere.
    · Sol: seçenek grupları (renk, beden…) — değerler tıklanabilir çip; grup başına "tümü / temizle" ve yeni değer ekleme.
    · Sağ: canlı önizleme — formül (3 renk × 4 beden), oluşacak yeni varyant sayısı, zaten var olanlar (atlanır),
      ilk birleşimler. Üründe varyant varsa aynı gruplar zorunludur (ProductVariantsComponent.generateVariants kuralı)
      → bu gruplar "Bu üründe kullanılıyor" ile işaretlenir, eksikse oluştur düğmesi kapalı ve neden yazılır.
  Sözleşme DEĞİŞMEDİ: `generateVariants([{ choiceId, choiceValueIds }])` · `close`.
-->
<template>
  <EkDialog :model-value="modelValue" :attach="attach" width="xl" icon="mdi-layers-plus" title="Varyant oluştur"
    description="Seçenek gruplarından değer seçin; her birleşim ayrı stok kodu, barkod, fiyat ve stok taşıyan bir varyant olur."
    :confirm-label="newCount ? `${newCount} varyant oluştur` : 'Varyant oluştur'" confirm-icon="mdi-plus"
    :confirm-disabled="!newCount || !!blockReason" cancel-label="Vazgeç"
    @update:model-value="(v: boolean) => !v && close()" @cancel="close" @confirm="confirm">
    <div class="pvg">
      <section class="pvg-groups" aria-label="Seçenek grupları">
        <div v-if="groups.length" class="pvg-toolbar">
          <span class="pvg-toolbar__text">
            <template v-if="totalPicked"><strong class="ek-num">{{ totalPicked }}</strong> değer seçildi · {{ activeGroups.length }} grup</template>
            <template v-else>Değerlere tıklayarak seçin; birden fazla grup seçerseniz tüm birleşimler oluşur.</template>
          </span>
          <button v-if="totalPicked" type="button" class="pvg-link" @click="clearAll">Seçimleri temizle</button>
        </div>

        <div v-if="!groups.length" class="pvg-empty">
          <span class="pvg-empty__icon" aria-hidden="true"><v-icon icon="mdi-shape-plus-outline" /></span>
          <strong>Henüz seçenek grubu yok</strong>
          <span>Tanımlar › Seçenek grupları ekranından renk, beden gibi grupları ekleyin.</span>
        </div>

        <article v-for="g in groups" :key="g._id" class="pvg-group" :class="{ 'is-active': picked(g._id).length }">
          <header class="pvg-group__head">
            <span class="pvg-group__icon" aria-hidden="true"><v-icon :icon="groupIcon(g.title)" /></span>
            <div class="pvg-group__titles">
              <h3 class="pvg-group__title">{{ g.title }}</h3>
              <span class="pvg-group__sub">
                <template v-if="picked(g._id).length"><span class="ek-num">{{ picked(g._id).length }}</span> / <span class="ek-num">{{ g.values?.length || 0 }}</span> seçili</template>
                <template v-else>{{ g.values?.length || 0 }} değer</template>
              </span>
            </div>
            <span v-if="required.has(g._id)" class="pvg-tag"><v-icon icon="mdi-link-variant" size="14" aria-hidden="true" />Bu üründe kullanılıyor</span>
            <label v-if="(g.values?.length || 0) > 12" class="pvg-filter">
              <v-icon icon="mdi-magnify" size="16" aria-hidden="true" />
              <input v-model="filters[g._id]" :aria-label="`${g.title} değerlerinde ara`" placeholder="Ara" />
            </label>
            <button v-if="g.values?.length" type="button" class="pvg-link pvg-group__all" @click="toggleAll(g)">
              {{ picked(g._id).length === g.values.length ? 'Temizle' : 'Tümünü seç' }}
            </button>
          </header>
          <div class="pvg-chips" role="group" :aria-label="`${g.title} değerleri`">
            <button v-for="v in visibleValues(g)" :key="v._id" type="button" class="pvg-chip" :class="{ 'is-on': isPicked(g._id, v._id) }"
              :aria-pressed="isPicked(g._id, v._id)" @click="toggle(g._id, v._id)">
              <span class="pvg-chip__mark" aria-hidden="true"><v-icon icon="mdi-check" size="14" /></span>{{ v.title }}
            </button>
            <span v-if="!g.values?.length" class="pvg-chips__empty">Bu grupta değer yok — ilkini ekleyin:</span>
            <span v-else-if="filters[g._id] && !visibleValues(g).length" class="pvg-chips__empty">“{{ filters[g._id] }}” bulunamadı</span>
            <form class="pvg-add" @submit.prevent="addValue(g)">
              <v-icon icon="mdi-plus" size="16" class="pvg-add__icon" aria-hidden="true" />
              <input v-model="drafts[g._id]" class="pvg-add__input" maxlength="32" :aria-label="`${g.title} için yeni değer`" placeholder="Yeni değer" />
              <button v-if="drafts[g._id]?.trim()" type="submit" class="pvg-add__btn" aria-label="Değeri ekle"><v-icon icon="mdi-keyboard-return" size="14" /></button>
            </form>
          </div>
        </article>
      </section>

      <aside class="pvg-preview" aria-live="polite">
        <div class="pvg-hero" :class="{ 'is-on': newCount }">
          <span class="pvg-preview__eyebrow">Oluşacak</span>
          <div class="pvg-hero__num">
            <strong class="ek-num">{{ newCount }}</strong>
            <span>yeni varyant</span>
          </div>
          <span v-if="formula" class="pvg-hero__formula">{{ formula }}</span>
          <span v-else class="pvg-hero__formula is-muted">Soldan en az bir değer seçin</span>
        </div>

        <dl v-if="activeGroups.length" class="pvg-sum">
          <div v-for="g in activeGroups" :key="g._id" class="pvg-sum__row">
            <dt>{{ g.title }}</dt>
            <dd>{{ summaryOf(g) }}</dd>
          </div>
        </dl>

        <p v-if="existingCount" class="pvg-note"><v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />{{ existingCount }} birleşim zaten var, atlanacak.</p>
        <p v-if="combos.length > LARGE" class="pvg-note is-warn"><v-icon icon="mdi-alert-outline" size="16" aria-hidden="true" />{{ combos.length }} birleşim çok fazla; her biri ayrı stok kodu ve barkod ister.</p>
        <p v-if="blockReason" class="pvg-note is-warn" role="alert"><v-icon icon="mdi-alert-outline" size="16" aria-hidden="true" />{{ blockReason }}</p>

        <div v-if="previewRows.length" class="pvg-table" role="table" aria-label="Birleşim önizlemesi">
          <div class="pvg-table__row pvg-table__row--head" role="row">
            <span v-for="g in activeGroups" :key="g._id" role="columnheader">{{ g.title }}</span>
          </div>
          <div v-for="(row, i) in previewRows" :key="i" class="pvg-table__row" :class="{ 'is-existing': row.exists }" role="row">
            <span v-for="(label, li) in row.labels" :key="li" role="cell">{{ label }}</span>
            <span v-if="row.exists" class="pvg-table__state" role="cell">var</span>
          </div>
          <div v-if="combos.length > previewRows.length" class="pvg-table__more">+{{ combos.length - previewRows.length }} birleşim daha</div>
        </div>
      </aside>
    </div>
  </EkDialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { EkDialog } from '@entegrasyonik/ui/components'
import { useChoicesStore } from '@/stores/choicesStore'

const props = defineProps<{
  modelValue: boolean
  productInfoForm: any
  attach?: string | boolean
}>()

const emits = defineEmits(['generateVariants', 'close'])

const choicesStore = useChoicesStore()
const groups = computed<any[]>(() => choicesStore.getChoices().value || [])

/** Seçimler: grup id → seçili değer id'leri (seçim sırası korunur). */
const selection = reactive<Record<string, string[]>>({})
const drafts = reactive<Record<string, string>>({})

const filters = reactive<Record<string, string>>({})
/** Bu sayının üstündeki birleşim için uyarı (oluşturma engellenmez). */
const LARGE = 100

const picked = (gid: string) => selection[gid] ?? []
const totalPicked = computed(() => Object.values(selection).reduce((n, ids) => n + ids.length, 0))

function clearAll() {
  for (const k of Object.keys(selection)) selection[k] = []
}

/** Grup adına göre simge (renk, beden, malzeme…); bilinmeyen grup genel simge. */
function groupIcon(title: string = '') {
  const t = title.toLocaleLowerCase('tr')
  if (/renk|color/.test(t)) return 'mdi-palette-outline'
  if (/beden|numara|ölçü|boy|size/.test(t)) return 'mdi-ruler'
  if (/malzeme|kumaş|materyal/.test(t)) return 'mdi-texture-box'
  if (/hacim|litre|ml|gram|ağırlık|kapasite/.test(t)) return 'mdi-scale-balance'
  return 'mdi-shape-outline'
}

const visibleValues = (g: any) => {
  const q = filters[g._id]?.trim().toLocaleLowerCase('tr')
  return q ? (g.values ?? []).filter((v: any) => String(v.title).toLocaleLowerCase('tr').includes(q)) : g.values ?? []
}
const isPicked = (gid: string, vid: string) => picked(gid).includes(vid)

function toggle(gid: string, vid: string) {
  const cur = picked(gid)
  selection[gid] = cur.includes(vid) ? cur.filter((x) => x !== vid) : [...cur, vid]
}

function toggleAll(g: any) {
  selection[g._id] = picked(g._id).length === g.values.length ? [] : g.values.map((v: any) => v._id)
}

async function addValue(g: any) {
  const title = drafts[g._id]?.trim()
  if (!title) return
  await choicesStore.addChoiceValue(g._id, title)
  drafts[g._id] = ''
}

/** Üründe varyant varsa onların grupları yeni birleşimlerde de bulunmalı. */
const required = computed(() => new Set<string>((props.productInfoForm?.variants?.[0]?.choices ?? []).map((c: any) => c.choiceId).filter(Boolean)))

const activeGroups = computed(() => groups.value.filter((g) => picked(g._id).length))

const blockReason = computed(() => {
  if (!activeGroups.value.length) return ''
  const missing = groups.value.filter((g) => required.value.has(g._id) && !picked(g._id).length)
  return missing.length ? `Bu üründeki varyantlarla aynı gruplar gerekli: ${missing.map((g) => g.title).join(', ')} için de değer seçin.` : ''
})

/** Birleşimler (generateVariants ile aynı sıra: grup sırası, seçim sırası). */
const combos = computed(() =>
  activeGroups.value.reduce<{ choiceId: string; choiceValueId: string }[][]>(
    (acc, g) => acc.flatMap((a) => picked(g._id).map((vid) => [...a, { choiceId: g._id, choiceValueId: vid }])),
    [[]],
  ).filter((c) => c.length),
)

const existingKeys = computed(() => new Set<string>((props.productInfoForm?.variants ?? []).map((v: any) => (v.choices ?? []).map((c: any) => `${c.choiceId}:${c.choiceValueId}`).join('|'))))
const keyOf = (c: { choiceId: string; choiceValueId: string }[]) => c.map((x) => `${x.choiceId}:${x.choiceValueId}`).join('|')

const existingCount = computed(() => combos.value.filter((c) => existingKeys.value.has(keyOf(c))).length)
const newCount = computed(() => combos.value.length - existingCount.value)

const formula = computed(() => {
  if (!activeGroups.value.length) return ''
  const parts = activeGroups.value.map((g) => `${picked(g._id).length} ${g.title.toLocaleLowerCase('tr')}`)
  return parts.length > 1 ? `${parts.join(' × ')} = ${combos.value.length} birleşim` : `${parts[0]}`
})

const valueTitle = (vid: string) => choicesStore.getDirectChoiceValueTitle(vid) ?? '—'
/** Grup seçim özeti: ilk 3 değer + kalan sayısı. */
const summaryOf = (g: any) => {
  const names = picked(g._id).map(valueTitle)
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')
}
const previewRows = computed(() =>
  combos.value.slice(0, 10).map((c) => ({ labels: c.map((x) => valueTitle(x.choiceValueId)), exists: existingKeys.value.has(keyOf(c)) })),
)

function reset() {
  for (const k of Object.keys(selection)) delete selection[k]
  for (const k of Object.keys(drafts)) delete drafts[k]
  for (const k of Object.keys(filters)) delete filters[k]
}

watch(() => props.modelValue, (open) => { if (open) reset() })

function close() {
  emits('close')
}

function confirm() {
  if (!newCount.value || blockReason.value) return
  emits('generateVariants', groups.value.filter((g) => picked(g._id).length).map((g) => ({ choiceId: g._id, choiceValueIds: [...picked(g._id)] })))
}
</script>

<style scoped>
.pvg {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--ek-space-5);
  min-height: 360px;
}

/* ── sol: seçenek grupları ─────────────────────────────────────────────── */
.pvg-groups {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-width: 0;
}

.pvg-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 24px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pvg-toolbar__text strong {
  color: var(--ek-color-content-strong);
}

.pvg-toolbar .pvg-link {
  margin-left: auto;
}

.pvg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-1);
  padding: var(--ek-space-8) var(--ek-space-4);
  border: 1px dashed var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  text-align: center;
}

.pvg-empty strong {
  color: var(--ek-color-content-strong);
}

.pvg-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ek-icon-tile-md);
  height: var(--ek-icon-tile-md);
  margin-bottom: var(--ek-space-2);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
  font-size: var(--ek-icon-md);
}

.pvg-group {
  position: relative;
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  transition: var(--ek-transition-colors);
}

/* Seçimi olan grup: solda aksiyon çizgisi + aksiyon kenarlığı. */
.pvg-group.is-active {
  border-color: var(--ek-color-action-border);
  box-shadow: inset 3px 0 0 var(--ek-color-action);
}

.pvg-group__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  margin-bottom: var(--ek-space-3);
}

.pvg-group__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
  transition: var(--ek-transition-colors);
}

.pvg-group.is-active .pvg-group__icon {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
}

.pvg-group__titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pvg-group__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.pvg-group__sub {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pvg-group.is-active .pvg-group__sub {
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-medium);
}

.pvg-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  white-space: nowrap;
}

.pvg-filter {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  margin-left: auto;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-muted);
}

.pvg-filter:focus-within {
  border-color: var(--ek-color-border-focus);
}

.pvg-filter input {
  width: 96px;
  border: 0;
  outline: none;
  background: none;
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-caption-size);
}

.pvg-group__all {
  margin-left: auto;
}

.pvg-filter + .pvg-group__all {
  margin-left: 0;
}

.pvg-link {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ek-color-action);
  font-family: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
}

.pvg-link:hover {
  text-decoration: underline;
}

/* Değer çipleri: seçilmemiş = çerçeveli; seçili = aksiyon dolgulu, onay işareti genişleyerek girer. */
.pvg-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.pvg-chips__empty {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.pvg-chip {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  cursor: pointer;
  transition:
    var(--ek-transition-colors),
    transform var(--ek-motion-feedback);
}

.pvg-chip__mark {
  display: inline-flex;
  overflow: hidden;
  width: 0;
  opacity: 0;
  transition:
    width var(--ek-motion-overlay),
    opacity var(--ek-motion-overlay),
    margin var(--ek-motion-overlay);
}

.pvg-chip:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.pvg-chip:active {
  transform: scale(0.97);
}

.pvg-chip.is-on {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-weight: var(--ek-font-weight-medium);
}

.pvg-chip.is-on .pvg-chip__mark {
  width: 14px;
  margin-right: 4px;
  opacity: 1;
}

.pvg-chip:focus-visible,
.pvg-link:focus-visible,
.pvg-add__btn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.pvg-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 4px 0 var(--ek-space-2);
  border: 1px dashed var(--ek-color-border-default);
  border-radius: var(--ek-radius-full);
  color: var(--ek-color-content-muted);
  transition: var(--ek-transition-colors);
}

.pvg-add:focus-within {
  border-style: solid;
  border-color: var(--ek-color-border-focus);
  color: var(--ek-color-action);
}

.pvg-add__input {
  width: 96px;
  border: 0;
  outline: none;
  background: none;
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
}

.pvg-add__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  cursor: pointer;
}

/* ── sağ: önizleme (yapışkan) ──────────────────────────────────────────── */
.pvg-preview {
  position: sticky;
  top: 0;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.pvg-preview__eyebrow {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pvg-hero {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  transition: var(--ek-transition-colors);
}

.pvg-hero.is-on {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.pvg-hero.is-on .pvg-preview__eyebrow {
  color: var(--ek-color-action-emphasis);
}

.pvg-hero__num {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.pvg-hero__num strong {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-font-weight-semibold);
}

.pvg-hero.is-on .pvg-hero__num strong {
  color: var(--ek-color-action-emphasis);
}

.pvg-hero__formula {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-medium);
}

.pvg-hero__formula.is-muted {
  color: var(--ek-color-content-muted);
  font-weight: inherit;
}

.pvg-sum {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
}

.pvg-sum__row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--ek-space-2);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pvg-sum__row dt {
  overflow: hidden;
  color: var(--ek-color-content-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pvg-sum__row dd {
  margin: 0;
  color: var(--ek-color-content-strong);
}

.pvg-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pvg-note.is-warn {
  color: var(--ek-color-warning-emphasis);
}

/* Birleşim tablosu: sütun = grup; var olan birleşim üstü çizili. */
.pvg-table {
  overflow: hidden;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pvg-table__row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: 6px var(--ek-space-3);
}

.pvg-table__row > span {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pvg-table__row + .pvg-table__row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.pvg-table__row--head {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
}

.pvg-table__row.is-existing {
  color: var(--ek-color-content-muted);
  text-decoration: line-through;
}

.pvg-table__row > .pvg-table__state {
  flex: none;
  text-decoration: none;
}

.pvg-table__more {
  padding: 6px var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
  text-align: center;
}

@media (max-width: 899px) {
  .pvg {
    grid-template-columns: minmax(0, 1fr);
  }

  .pvg-preview {
    position: static;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pvg-chip,
  .pvg-chip__mark {
    transition: none;
  }
}

/* ================= FE-LOCAL-1057 — "Varyant oluştur": uygulamanın tasarım diliyle (DESIGN_SYSTEM §35) =================
   Yalnız sunum. Grup kartı ince çerçeveli düz yüzey; seçimi olan grupta sol kalın şerit YOK — eylem renginin ince
   çerçevesi + açık tonlu başlık ikonu yeter. Grup ikonu çerçeveli köşeli kutu. Değer çipleri, "Bu üründe kullanılıyor"
   etiketi ve "Yeni değer" alanı köşeli (hap değil). Önizleme panelinde "Oluşacak" etiketi kısa eylem çizgili mikro etiket. */
.pvg-group {
  border-color: var(--ek-color-border-default);
}

.pvg-group.is-active {
  border-color: var(--ek-color-action-border);
  box-shadow: none;
}

.pvg-group__icon,
.pvg-empty__icon {
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}

.pvg-group.is-active .pvg-group__icon {
  border-color: var(--ek-color-action-border);
  color: var(--ek-color-action-emphasis);
}

.pvg-tag {
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-md);
}

.pvg-chip,
.pvg-add {
  border-radius: var(--ek-radius-md);
}

.pvg-add__btn {
  border-radius: var(--ek-radius-sm);
}

.pvg-preview {
  border-color: var(--ek-color-border-default);
}

.pvg-preview__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  line-height: var(--ek-type-micro-line);
}

.pvg-preview__eyebrow::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.pvg-hero {
  border-color: var(--ek-color-border-default);
}

.pvg-hero.is-on {
  border-color: var(--ek-color-action-border);
}
</style>
