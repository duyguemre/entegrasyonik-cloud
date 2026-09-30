<!--
  frontend/src/components/layout/ShortcutHelpDialog.vue

  DS-v2 Aşama 2 — klavye kısayolları listesi (`?`, Yardım/Hesap menüsü, "Sayfa hakkında → Tüm kısayollar").
  fe-a14 — premium sürüm (iki bölmeli):
    Başlık bandı: ikon · "Klavye kısayolları" · açıklama satırında AÇAN kısayolun kendisi (`shortcutHelp` kaydından)
    Araç satırı:  arama (ad/açıklama/bağlam/tuş, eşleşme `<mark>` + eşleşen tuş kapakları) · platform anahtarı (Windows/Linux ↔ macOS)
    Sol:          kategori listesi (dikey sekme listesi; ↑/↓ ←/→ Home/End; dar ekranda yatay kayan çipler) + eşleşme sayıları
    Sağ:          "İpucu" kuşağı (en çok kullanılan 3, `featured`) · satır = ad + bağlam rozeti + tek satır açıklama + tuş kapakları
  TEK KAYNAK: tüm satırlar `navigation/shortcutCatalog.ts` → `SHORTCUTS` + `CONTEXT_SHORTCUTS` kayıtlarından; burada elle
  yazılmış kısayol YOK (tests/shortcut-help-dialog.test.ts korur). Uygulama geneli örtü: SecureLayout'ta sekme ağacının
  dışında bağlanır (DESIGN_SYSTEM §17.1 tam ekran listesi) — `attach` verilmez.
-->
<template>
  <EkDialog
    :model-value="modelValue"
    title="Klavye kısayolları"
    icon="mdi-keyboard-outline"
    :max-width="920"
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)"
  >
    <template #description>
      <span class="ek-sc__opener">
        Bu listeyi her an
        <ShortcutKeycaps :keys="openerKeys" :platform="platform" />
        ile açın · {{ catalog.length }} kısayol
      </span>
    </template>

    <div class="ek-sc" :class="{ 'is-searching': !!query }">
      <div class="ek-sc__toolbar">
        <label class="ek-sc__search">
          <v-icon class="ek-sc__search-icon" icon="mdi-magnify" aria-hidden="true" />
          <input
            ref="searchRef"
            v-model="query"
            class="ek-sc__search-input"
            type="search"
            aria-label="Kısayol ara"
            :aria-describedby="statusId"
            placeholder="Eylem, açıklama veya tuş ara (ör. Ctrl K)"
            autocomplete="off"
            spellcheck="false"
            @keydown.esc="onSearchEsc"
            @keydown.down.prevent="focusCategory(activeCategory)"
          />
        </label>
        <div class="ek-sc__platform" role="radiogroup" aria-label="Tuş gösterimi" @keydown="onPlatformKey">
          <button
            v-for="p in PLATFORMS"
            :key="p.id"
            type="button"
            role="radio"
            class="ek-sc__platform-btn"
            :class="{ 'is-active': platform === p.id }"
            :aria-checked="platform === p.id"
            :tabindex="platform === p.id ? 0 : -1"
            :data-platform="p.id"
            @click="setPlatform(p.id)"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <div class="ek-sc__main">
        <div class="ek-sc__side">
          <div class="ek-sc__cats" role="tablist" aria-label="Kısayol kategorileri" :aria-orientation="narrow ? 'horizontal' : 'vertical'" @keydown="onCategoryKey">
            <button
              v-for="cat in categoryTabs"
              :id="`${uid}-tab-${cat.id}`"
              :key="cat.id"
              type="button"
              role="tab"
              class="ek-sc__cat"
              :class="{ 'is-active': activeCategory === cat.id, 'is-empty': !cat.count }"
              :aria-selected="activeCategory === cat.id"
              :aria-controls="panelId"
              :tabindex="activeCategory === cat.id ? 0 : -1"
              :data-category="cat.id"
              @click="selectCategory(cat.id)"
            >
              <v-icon class="ek-sc__cat-icon" :icon="cat.icon" aria-hidden="true" />
              <span class="ek-sc__cat-label">{{ cat.label }}</span>
              <span class="ek-sc__cat-count">{{ cat.count }}</span>
            </button>
          </div>
          <p class="ek-sc__legend">
            <span class="ek-sc__badge ek-sc__badge--typing">Yazarken de</span>
            metin alanına yazarken de çalışan genel kısayol. Diğer genel kısayollar yazarken devre dışıdır — yazdığınız bozulmaz.
          </p>
        </div>

        <div
          :id="panelId"
          ref="panelRef"
          class="ek-sc__panel"
          role="tabpanel"
          tabindex="0"
          :aria-labelledby="`${uid}-tab-${activeCategory}`"
        >
          <section v-if="showTips" class="ek-sc__tips" aria-labelledby="ek-sc-tips-title">
            <h3 id="ek-sc-tips-title" class="ek-sc__tips-title">
              <v-icon icon="mdi-lightbulb-on-outline" size="16" aria-hidden="true" />
              İpucu · en çok kullanılan üç kısayol
            </h3>
            <ul class="ek-sc__tips-list">
              <li v-for="tip in tips" :key="tip.id" class="ek-sc__tip">
                <ShortcutKeycaps :keys="tip.keys" :platform="platform" :sequence="tip.sequence" size="lg" class="ek-sc__tip-keys" />
                <span class="ek-sc__tip-label">{{ tip.shortLabel }}</span>
                <span class="ek-sc__tip-desc">{{ tip.description }}</span>
              </li>
            </ul>
          </section>

          <p v-if="activeCategoryInfo && !query" class="ek-sc__intro">{{ activeCategoryInfo.description }}</p>

          <section
            v-for="section in visibleSections"
            :key="section.id"
            class="ek-sc__section"
            :aria-labelledby="`${uid}-sec-${section.id}`"
          >
            <h3 :id="`${uid}-sec-${section.id}`" class="ek-sc__section-title" :class="{ 'ek-sr-only': activeCategory !== 'all' }">
              <v-icon :icon="section.icon" size="16" aria-hidden="true" />
              {{ section.label }}
              <span class="ek-sc__section-count">{{ section.items.length }}</span>
            </h3>
            <ul class="ek-sc__list">
              <li v-for="{ item, keyMatch } in section.items" :key="item.id" class="ek-sc__row" :data-shortcut="item.id">
                <div class="ek-sc__text">
                  <span class="ek-sc__name">
                    <template v-for="(part, pi) in highlightParts(item.label, query)" :key="pi">
                      <mark v-if="part.match" class="ek-sc__mark">{{ part.text }}</mark>
                      <template v-else>{{ part.text }}</template>
                    </template>
                  </span>
                  <span class="ek-sc__badges">
                    <span class="ek-sc__badge" :class="{ 'ek-sc__badge--global': item.context === DEFAULT_CONTEXT }">
                      <span>
                        <template v-for="(part, pi) in highlightParts(item.context, query)" :key="pi">
                          <mark v-if="part.match" class="ek-sc__mark">{{ part.text }}</mark>
                          <template v-else>{{ part.text }}</template>
                        </template>
                      </span>
                    </span>
                    <span v-if="item.allowInEditable" class="ek-sc__badge ek-sc__badge--typing">Yazarken de</span>
                  </span>
                  <span v-if="item.description" class="ek-sc__desc">
                    <template v-for="(part, pi) in highlightParts(item.description, query)" :key="pi">
                      <mark v-if="part.match" class="ek-sc__mark">{{ part.text }}</mark>
                      <template v-else>{{ part.text }}</template>
                    </template>
                  </span>
                </div>
                <ShortcutKeycaps
                  class="ek-sc__keys"
                  :keys="item.keys"
                  :aliases="item.aliases"
                  :sequence="item.sequence"
                  :platform="platform"
                  :query="keyMatch ? query : ''"
                />
              </li>
            </ul>
          </section>

          <div v-if="!visibleSections.length" class="ek-sc__empty">
            <v-icon icon="mdi-keyboard-off-outline" size="24" aria-hidden="true" />
            <p class="ek-sc__empty-title">“{{ query }}” için kısayol bulunamadı</p>
            <p class="ek-sc__empty-hint">Eylemin adını (ör. “sekme”) ya da tuşu (ör. “Alt R”) yazmayı deneyin.</p>
            <EkButton tone="secondary" size="sm" @click="clearSearch">Aramayı temizle</EkButton>
          </div>
        </div>
      </div>

      <p :id="statusId" class="ek-sr-only" role="status" aria-live="polite">{{ statusText }}</p>
    </div>

    <template #actions-start>
      <EkButton v-if="helpCenterAvailable" tone="ghost" size="sm" icon="mdi-lifebuoy" @click="openHelpCenter">
        Yardım merkezinde oku
      </EkButton>
    </template>
    <template #actions>
      <EkButton tone="primary" @click="$emit('update:modelValue', false)">Tamam</EkButton>
    </template>
  </EkDialog>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import EkDialog from '@/components/ds/EkDialog.vue'
import EkButton from '@/components/ds/EkButton.vue'
import ShortcutKeycaps from '@/components/layout/ShortcutKeycaps.vue'
import { SHORTCUT_CATEGORIES, shortcutKeys, type ShortcutCategoryId } from '@/navigation/shortcuts'
import {
  DEFAULT_CONTEXT,
  SHORTCUT_CATALOG,
  detectPlatform,
  featuredShortcuts,
  highlightParts,
  searchShortcuts,
  type KeyPlatform,
  type ShortcutMatchInfo,
} from '@/navigation/shortcutCatalog'
import { resolveScreenByKey } from '@/navigation/screens'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

type CategoryKey = ShortcutCategoryId | 'all'

const uid = `ek-sc-${useId()}`
const panelId = `${uid}-panel`
const statusId = `${uid}-status`
const catalog = SHORTCUT_CATALOG
const tips = featuredShortcuts(catalog)
const openerKeys = shortcutKeys('shortcutHelp')

// ---- Platform (algıla + elle geçiş; tercih yalnız bu tarayıcıda, erişilemezse yok sayılır) ----
const PLATFORM_KEY = 'ek.shortcuts.platform'
const PLATFORMS: ReadonlyArray<{ id: KeyPlatform; label: string }> = [
  { id: 'win', label: 'Windows / Linux' },
  { id: 'mac', label: 'macOS' },
]
function storedPlatform(): KeyPlatform | undefined {
  try {
    const v = window.localStorage.getItem(PLATFORM_KEY)
    return v === 'mac' || v === 'win' ? v : undefined
  } catch {
    return undefined
  }
}
const platform = ref<KeyPlatform>(storedPlatform() ?? detectPlatform())
function setPlatform(p: KeyPlatform) {
  platform.value = p
  try {
    window.localStorage.setItem(PLATFORM_KEY, p)
  } catch {
    /* depolama kapalı: yalnız bu oturum */
  }
}
function onPlatformKey(e: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
  e.preventDefault()
  const next: KeyPlatform = platform.value === 'win' ? 'mac' : 'win'
  setPlatform(next)
  nextTick(() => document.querySelector<HTMLElement>(`.ek-sc__platform-btn[data-platform="${next}"]`)?.focus())
}

// Dar ekranda kategori listesi yatay çip şeridi olur (CSS 719px ile aynı eşik) → aria-orientation buna uyar.
const narrowQuery = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 719px)') : undefined
const narrow = ref(!!narrowQuery?.matches)
const onNarrow = (e: MediaQueryListEvent) => (narrow.value = e.matches)
narrowQuery?.addEventListener?.('change', onNarrow)
onBeforeUnmount(() => narrowQuery?.removeEventListener?.('change', onNarrow))

// ---- Arama + kategoriler ----
const query = ref('')
const activeCategory = ref<CategoryKey>('all')
const results = computed<ShortcutMatchInfo[]>(() => searchShortcuts(query.value, catalog))

const categoryTabs = computed(() => [
  { id: 'all' as CategoryKey, label: 'Tümü', icon: 'mdi-view-grid-outline', count: results.value.length },
  ...SHORTCUT_CATEGORIES.map((c) => ({
    id: c.id as CategoryKey,
    label: c.label,
    icon: c.icon,
    count: results.value.filter((r) => r.item.category === c.id).length,
  })),
])
const activeCategoryInfo = computed(() => SHORTCUT_CATEGORIES.find((c) => c.id === activeCategory.value))

const visibleSections = computed(() =>
  SHORTCUT_CATEGORIES.filter((c) => activeCategory.value === 'all' || c.id === activeCategory.value)
    .map((c) => ({ ...c, items: results.value.filter((r) => r.item.category === c.id) }))
    .filter((s) => s.items.length),
)
const showTips = computed(() => !query.value && activeCategory.value === 'all' && tips.length > 0)

const statusText = computed(() => {
  if (!query.value) return ''
  const n = results.value.length
  return n ? `${n} kısayol bulundu` : 'Kısayol bulunamadı'
})

// Arama her zaman TÜM kategorilerde yapılır; yazmaya başlayınca "Tümü"ne geçilir (sonuç başka kategoride saklanmasın).
watch(query, (q, prev) => {
  if (q && !prev) activeCategory.value = 'all'
})

const searchRef = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

function selectCategory(id: CategoryKey) {
  activeCategory.value = id
  panelRef.value?.scrollTo?.({ top: 0 })
}
function focusCategory(id: CategoryKey) {
  nextTick(() => document.getElementById(`${uid}-tab-${id}`)?.focus())
}
function onCategoryKey(e: KeyboardEvent) {
  const ids = categoryTabs.value.map((c) => c.id)
  const i = ids.indexOf(activeCategory.value)
  let next: number | undefined
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % ids.length
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + ids.length) % ids.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = ids.length - 1
  if (next === undefined) return
  e.preventDefault()
  selectCategory(ids[next])
  focusCategory(ids[next])
  document.getElementById(`${uid}-tab-${ids[next]}`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

function onSearchEsc(e: KeyboardEvent) {
  // Doluyken Esc önce aramayı temizler (diyalog kapanmaz); boşken diyaloğa bırakılır.
  if (!query.value) return
  e.preventDefault()
  e.stopPropagation()
  query.value = ''
}
function clearSearch() {
  query.value = ''
  searchRef.value?.focus()
}

// Açılışta: temiz durum + arama kutusuna odak (dokunmatik ekranda klavye açılıp listeyi örtmesin diye odak verilmez).
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    query.value = ''
    activeCategory.value = 'all'
    await nextTick()
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
    if (!coarse) setTimeout(() => searchRef.value?.focus(), 60)
  },
)

// ---- Yardım merkezi (faz3-fe-help `HelpCenterView` kayıtlıysa görünür; makale `app-shortcuts`) ----
const router = (() => {
  try {
    return useRouter()
  } catch {
    return undefined
  }
})()
const helpCenterAvailable = !!router && !!resolveScreenByKey('HelpCenterView')
function openHelpCenter() {
  emit('update:modelValue', false)
  router?.push({ path: '/help', query: { article: 'app-shortcuts' } }).catch(() => undefined)
}
</script>

<style scoped>
.ek-sc {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  height: min(600px, calc(100vh - 248px));
  min-height: 320px;
  animation: ek-sc-enter var(--ek-duration-slow) var(--ek-easing-enter) both;
}

@keyframes ek-sc-enter {
  from {
    opacity: 0;
    transform: translateY(var(--ek-motion-distance-md));
  }
}

@media (prefers-reduced-motion: reduce) {
  .ek-sc {
    animation: none;
  }
}

.ek-sc__opener {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-2);
}

/* ---- Araç satırı ---- */
.ek-sc__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.ek-sc__search {
  position: relative;
  display: flex;
  flex: 1 1 280px;
  align-items: center;
  min-width: 0;
}

.ek-sc__search-icon {
  position: absolute;
  left: var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-heading-size);
  pointer-events: none;
}

.ek-sc__search-input {
  width: 100%;
  height: 40px;
  padding: 0 var(--ek-space-3) 0 var(--ek-space-10);
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: var(--ek-font-sans);
  font-size: var(--ek-type-body-size);
  outline: none;
  transition: var(--ek-transition-colors);
}

.ek-sc__search-input::placeholder {
  color: var(--ek-color-content-muted);
  opacity: 1;
}

.ek-sc__search-input:hover {
  border-color: var(--ek-color-border-strong);
}

.ek-sc__search-input:focus-visible,
.ek-sc__search-input:focus {
  border-color: var(--ek-color-border-focus);
  box-shadow: 0 0 0 3px var(--ek-color-action-subtle);
}

.ek-sc__platform {
  display: inline-flex;
  flex: none;
  padding: 2px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-sunken);
}

.ek-sc__platform-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: 34px;
  padding: 0 var(--ek-space-3);
  border-radius: calc(var(--ek-radius-control) - 2px);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  transition: var(--ek-transition-colors);
}

.ek-sc__platform-btn:hover {
  color: var(--ek-color-content-strong);
}

.ek-sc__platform-btn.is-active {
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  color: var(--ek-color-content-strong);
}

.ek-sc__platform-btn:focus-visible,
.ek-sc__cat:focus-visible,
.ek-sc__panel:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

/* ---- İki bölme ---- */
.ek-sc__main {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: var(--ek-space-5);
  min-height: 0;
}

.ek-sc__side {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.ek-sc__cats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow: auto;
}

.ek-sc__cat {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 36px;
  padding: var(--ek-space-1) var(--ek-space-2) var(--ek-space-1) var(--ek-space-3);
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-label-line);
  text-align: left;
  transition: var(--ek-transition-colors);
}

.ek-sc__cat:hover {
  background: var(--ek-color-surface-muted);
}

.ek-sc__cat.is-active {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-sc__cat.is-active::before {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 3px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action);
}

.ek-sc__cat-icon {
  flex: none;
  font-size: var(--ek-type-label-icon, 16px);
  opacity: 0.9;
}

.ek-sc__cat-label {
  flex: 1 1 auto;
  min-width: 0;
}

.ek-sc__cat-count {
  flex: none;
  min-width: 22px;
  padding: 1px 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  font-feature-settings: 'tnum';
  text-align: center;
}

.ek-sc__cat.is-active .ek-sc__cat-count {
  background: var(--ek-color-surface);
  color: var(--ek-color-action-emphasis);
}

.ek-sc__cat.is-empty:not(.is-active) {
  color: var(--ek-color-content-muted);
}

.ek-sc__legend {
  margin: auto 0 0;
  padding: var(--ek-space-3) var(--ek-space-2) 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-sc__legend .ek-sc__badge {
  margin-right: 2px;
}

.ek-sc__panel {
  min-height: 0;
  overflow: auto;
  padding: 0 var(--ek-space-1) var(--ek-space-2) 0;
  border-radius: var(--ek-radius-control);
  scroll-padding-top: var(--ek-space-2);
}

/* ---- İpucu kuşağı ---- */
.ek-sc__tips {
  margin-bottom: var(--ek-space-5);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-action-subtle);
}

.ek-sc__tips-title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: var(--ek-type-micro-tracking);
  line-height: var(--ek-type-micro-line);
  text-transform: uppercase;
}

.ek-sc__tips-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-sc__tip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-1);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.ek-sc__tip-keys {
  justify-content: flex-start;
  margin-bottom: var(--ek-space-1);
}

.ek-sc__tip-label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-type-subheading-weight);
  line-height: var(--ek-type-subheading-line);
}

.ek-sc__tip-desc {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-sc__intro {
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

/* ---- Bölümler ve satırlar ---- */
.ek-sc__section + .ek-sc__section {
  margin-top: var(--ek-space-5);
}

.ek-sc__section-title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-type-subheading-weight);
  line-height: var(--ek-type-subheading-line);
}

.ek-sc__section-title .v-icon {
  color: var(--ek-color-content-muted);
}

.ek-sc__section-count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
  font-feature-settings: 'tnum';
}

.ek-sc__list {
  margin: 0;
  padding: 0;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  list-style: none;
}

.ek-sc__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-4);
  transition: var(--ek-transition-colors);
}

.ek-sc__row + .ek-sc__row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-sc__row:hover {
  background: var(--ek-color-surface-muted);
}

.ek-sc__row:first-child {
  border-radius: var(--ek-radius-card) var(--ek-radius-card) 0 0;
}

.ek-sc__row:last-child {
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
}

.ek-sc__text {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px var(--ek-space-2);
  min-width: 0;
}

.ek-sc__name {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-medium);
  line-height: var(--ek-type-body-line);
}

.ek-sc__badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}

.ek-sc__badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
  line-height: 1;
  white-space: nowrap;
}

.ek-sc__badge--global {
  border-color: transparent;
  background: transparent;
  padding: 0;
}

.ek-sc__badge--typing {
  border-color: var(--ek-color-info-border);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
}

.ek-sc__desc {
  flex: 1 1 100%;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-sc__mark {
  border-radius: 2px;
  background: var(--ek-color-highlight);
  color: inherit;
  box-shadow: 0 0 0 1px var(--ek-color-highlight);
}

.ek-sc__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-10) var(--ek-space-4);
  color: var(--ek-color-content-muted);
  text-align: center;
}

.ek-sc__empty-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-sc__empty-hint {
  margin: 0 0 var(--ek-space-2);
  font-size: var(--ek-type-caption-size);
}

/* ---- Dar ekran (390): tek sütun, kategori seçici yatay kayan çipler ---- */
@media (max-width: 719px) {
  .ek-sc {
    height: calc(100dvh - 232px);
    gap: var(--ek-space-3);
  }

  .ek-sc__platform {
    width: 100%;
  }

  .ek-sc__platform-btn {
    flex: 1 1 0;
    justify-content: center;
  }

  .ek-sc__main {
    display: flex;
    flex-direction: column;
    gap: var(--ek-space-3);
  }

  .ek-sc__cats {
    flex: none;
    flex-direction: row;
    gap: var(--ek-space-2);
    margin: 0 calc(-1 * var(--ek-space-6));
    padding: 2px var(--ek-space-6) var(--ek-space-1);
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    scroll-padding-inline: var(--ek-space-6);
    scrollbar-width: none;
  }

  .ek-sc__cats::-webkit-scrollbar {
    display: none;
  }

  .ek-sc__cat {
    flex: none;
    min-height: 32px;
    padding: 0 var(--ek-space-2) 0 var(--ek-space-3);
    border: 1px solid var(--ek-color-border-default);
    border-radius: var(--ek-radius-chip);
    background: var(--ek-color-surface);
    scroll-snap-align: start;
    white-space: nowrap;
  }

  .ek-sc__cat.is-active {
    border-color: var(--ek-color-action-border);
  }

  .ek-sc__cat.is-active::before {
    display: none;
  }

  .ek-sc__legend {
    display: none;
  }

  .ek-sc__panel {
    flex: 1 1 auto;
  }

  .ek-sc__tips-list {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-2);
  }

  .ek-sc__tip {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: var(--ek-space-3);
    padding: var(--ek-space-2) var(--ek-space-3);
    box-shadow: none;
  }

  .ek-sc__tip-keys {
    margin: 0;
  }

  .ek-sc__tip-desc {
    display: none;
  }

  .ek-sc__tips {
    padding: var(--ek-space-3);
  }

  .ek-sc__row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-2);
    padding: var(--ek-space-3);
  }

  .ek-sc__keys {
    justify-content: flex-start;
  }
}
</style>
