<!--
  frontend/src/components/ds/EkSavedViews.vue

  DS-v2 — kişisel kayıtlı görünümler (C2.4). `EkFilterPanel` başlığının sağına
  (`#head-actions`) yerleşir; `EkListScreen` `saved-views` prop'u ile açar.
    tetikleyici: [yer imi] Görünümler (3) ⌄  — etkin görünüm varsa onun adı
    panel: başlık + sayaç (n / 20) → görünüm listesi (uygula · sil) → "Mevcut filtreleri kaydet" formu
  Görünüm yalnız ekranın URL'ye yazılabilen filtrelerini taşır (`useSavedViews` →
  `pickUrlParams`); arama metni gibi serbest metin ASLA saklanmaz. Saklama kullanıcı +
  mağaza kapsamlı yerel depolamadır; erişilemezse bileşen hiç çizilmez.
  Uygulama: `apply` olayı ekranın okuduğu şekle açılmış parametreleri verir; ekran
  filtrelerini bunlarla DEĞİŞTİRİR ve sorgular. Adres (ADR-0012) buradan kurulur.
  Silme anında yapılır, toast'taki "Geri al" ile döner.
-->
<template>
  <v-menu
    v-if="available"
    v-model="open"
    location="bottom end"
    :close-on-content-click="false"
    :offset="6"
    max-width="calc(100vw - 32px)"
    @update:model-value="onToggle"
  >
    <template #activator="{ props: activatorProps }">
      <button
        v-bind="activatorProps"
        ref="triggerRef"
        type="button"
        class="ek-views__trigger"
        :class="{ 'is-active': !!activeView }"
        aria-haspopup="dialog"
        :aria-label="triggerLabel"
      >
        <v-icon class="ek-views__trigger-icon" :icon="activeView ? 'mdi-bookmark-check' : 'mdi-bookmark-outline'" aria-hidden="true" />
        <span class="ek-views__trigger-text">{{ activeView ? activeView.name : 'Görünümler' }}</span>
        <EkBadge v-if="views.length && !activeView" variant="count" tone="neutral" :text="views.length" aria-hidden="true" />
        <v-icon class="ek-views__trigger-chevron" icon="mdi-chevron-down" aria-hidden="true" />
      </button>
    </template>

    <div ref="panelRef" class="ek-views" role="dialog" :aria-labelledby="titleId" @keydown="onPanelKeydown">
      <header class="ek-views__head">
        <div class="ek-views__head-row">
          <h3 :id="titleId" class="ek-views__title">Kayıtlı görünümler</h3>
          <span class="ek-views__count ek-num" :aria-label="`${views.length} / ${limit} görünüm`">{{ views.length }} / {{ limit }}</span>
        </div>
        <p class="ek-views__desc">Yalnız sizin için, bu tarayıcıda saklanır.</p>
      </header>

      <ul v-if="views.length" class="ek-views__list" aria-label="Görünümler">
        <li v-for="view in views" :key="view.id" class="ek-views__item" :class="{ 'is-active': view.id === activeView?.id }">
          <button
            type="button"
            class="ek-views__apply"
            data-view-apply
            :aria-current="view.id === activeView?.id ? 'true' : undefined"
            @click="apply(view)"
          >
            <v-icon
              class="ek-views__item-icon"
              :icon="view.id === activeView?.id ? 'mdi-check-circle' : 'mdi-bookmark-outline'"
              aria-hidden="true"
            />
            <span class="ek-views__item-text">
              <span class="ek-views__item-name">{{ view.name }}</span>
              <span class="ek-views__item-summary">{{ summarize(view.params) }}</span>
            </span>
            <span v-if="view.id === activeView?.id" class="ek-sr-only">(uygulanmış)</span>
          </button>
          <button type="button" class="ek-views__delete" :aria-label="`${view.name} görünümünü sil`" @click="remove(view)">
            <v-icon icon="mdi-trash-can-outline" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <div v-else class="ek-views__empty">
        <EkIconTile icon="mdi-bookmark-plus-outline" tone="neutral" size="sm" />
        <div>
          <p class="ek-views__empty-title">Henüz kayıtlı görünüm yok</p>
          <p class="ek-views__empty-text">Sık kullandığınız filtreleri sorgulayın, sonra aşağıdan bir adla kaydedin.</p>
        </div>
      </div>

      <form class="ek-views__save" :aria-labelledby="saveTitleId" @submit.prevent="save">
        <p :id="saveTitleId" class="ek-views__save-title">Mevcut filtreleri kaydet</p>
        <p class="ek-views__current" :class="{ 'is-empty': !hasCurrent }">
          {{ hasCurrent ? summarize(current) : `Kaydetmek için önce ${fieldList} seçip sorgulayın.` }}
        </p>
        <div class="ek-views__save-row">
          <v-text-field
            ref="nameFieldRef"
            v-model="name"
            label="Görünüm adı"
            density="compact"
            hide-details="auto"
            :maxlength="nameMax"
            :disabled="!hasCurrent"
            :error-messages="error ? [error] : []"
            class="ek-views__name"
            @update:model-value="error = ''"
          />
          <EkButton type="submit" tone="primary" size="sm" icon="mdi-content-save-outline" :disabled="!canSave">Kaydet</EkButton>
        </div>
        <p class="ek-views__note">Kaydedilen alanlar: {{ fieldList }}. Arama metni kaydedilmez.</p>
      </form>
    </div>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import EkBadge from './EkBadge.vue'
import EkButton from './EkButton.vue'
import EkIconTile from './EkIconTile.vue'
import { useToast } from '@/composables/useToast'
import {
  SAVED_VIEW_NAME_MAX,
  expandViewParams,
  sameViewParams,
  sanitizeViewParams,
  useSavedViews,
  type SavedView,
} from '@/composables/useSavedViews'

export interface EkSavedViewField {
  /** `screens.ts` `urlParams` adı (ör. `internalStatuses`). */
  name: string
  /** Özet satırındaki etiket (ör. "Durum"). */
  label: string
  /** Tek kodun görünen adı (ör. durum kodu → "Onay bekliyor"). */
  format?: (value: string) => string
}

export interface EkSavedViewsConfig {
  screenKey: string
  /** Ekranın SON SORGULANAN filtreleri (tamamı verilebilir — süzme burada yapılır). */
  params: Record<string, any>
  fields: EkSavedViewField[]
}

const props = defineProps<EkSavedViewsConfig>()
const emit = defineEmits<{ apply: [params: Record<string, any>] }>()

const { available, views, save: persist, remove: drop, restore, syncRoute, limit } = useSavedViews(props.screenKey)
const { showToast } = useToast()

const uid = useId()
const titleId = `ek-views-title-${uid}`
const saveTitleId = `ek-views-save-${uid}`
const nameMax = SAVED_VIEW_NAME_MAX

const open = ref(false)
const name = ref('')
const error = ref('')
const panelRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const nameFieldRef = ref<any>(null)

const current = computed(() => sanitizeViewParams(props.screenKey, props.params))
const hasCurrent = computed(() => Object.keys(current.value).length > 0)
const activeView = computed(() => (hasCurrent.value ? views.value.find((v) => sameViewParams(v.params, current.value)) : undefined))
const canSave = computed(() => hasCurrent.value && name.value.trim().length > 0)
const fieldList = computed(() => props.fields.map((f) => f.label.toLocaleLowerCase('tr')).join(', '))
const triggerLabel = computed(() =>
  activeView.value ? `Kayıtlı görünümler, uygulanan: ${activeView.value.name}` : `Kayıtlı görünümler, ${views.value.length} görünüm`,
)

function summarize(params: Record<string, string>): string {
  const parts: string[] = []
  for (const field of props.fields) {
    const raw = params[field.name]
    if (!raw) continue
    const values = raw.split(',').filter(Boolean).map((v) => (field.format ? field.format(v) : v))
    parts.push(`${field.label}: ${values.join(', ')}`)
  }
  return parts.join(' · ')
}

function onToggle(value: boolean) {
  if (!value) return
  error.value = ''
  nextTick(() => {
    const first = panelRef.value?.querySelector<HTMLElement>('[data-view-apply]')
    if (first) first.focus()
    else nameFieldRef.value?.focus?.()
  })
}

/**
 * ↑/↓ görünüm düğmeleri arasında gezinir (liste kısa; Tab sırası da korunur).
 * Enter: Vuetify menüsü `close-on-content-click=false` iken içerikteki Enter'ı yutup menüyü
 * kapatır (düğmenin tıklaması hiç oluşmaz) — düğmelerde yayılım burada kesilir, yerel tıklama çalışır.
 */
function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) {
    event.stopPropagation()
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const items = Array.from(panelRef.value?.querySelectorAll<HTMLElement>('[data-view-apply]') ?? [])
  const index = items.indexOf(document.activeElement as HTMLElement)
  if (index < 0) return
  event.preventDefault()
  const next = items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]
  next?.focus()
}

function apply(view: SavedView) {
  emit('apply', expandViewParams(props.screenKey, view.params))
  syncRoute(view.params)
  open.value = false
  // Programatik kapanışta odak tetikleyiciye döner (Esc ile kapanışta Vuetify zaten döndürür).
  nextTick(() => triggerRef.value?.focus())
}

function save() {
  if (!canSave.value) return
  const label = name.value.trim()
  const result = persist(label, props.params)
  if (result === 'limit') {
    error.value = `En fazla ${limit} görünüm kaydedilebilir; önce birini silin.`
    return
  }
  if (result === 'invalid-name' || result === 'empty') {
    error.value = 'Görünüm adı ve en az bir filtre gerekli.'
    return
  }
  if (result === 'unavailable') {
    showToast({ tone: 'error', message: 'Görünüm kaydedilemedi: tarayıcı depolaması kullanılamıyor.' })
    return
  }
  showToast({ tone: 'success', message: result === 'updated' ? `“${label}” görünümü güncellendi.` : `“${label}” görünümü kaydedildi.` })
  name.value = ''
}

function remove(view: SavedView) {
  const index = views.value.findIndex((v) => v.id === view.id)
  const removed = drop(view.id)
  if (!removed) {
    showToast({ tone: 'error', message: 'Görünüm silinemedi.' })
    return
  }
  showToast({ tone: 'info', message: `“${removed.name}” görünümü silindi.`, actionLabel: 'Geri al', onAction: () => restore(removed, index) })
  nextTick(() => panelRef.value?.querySelector<HTMLElement>('[data-view-apply]')?.focus() ?? nameFieldRef.value?.focus?.())
}
</script>

<style scoped>
.ek-views__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  max-width: 240px;
  height: var(--ek-control-h-sm);
  margin-right: var(--ek-space-2);
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-views__trigger:hover {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-sunken);
}

.ek-views__trigger:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-views__trigger.is-active {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-views__trigger-icon {
  color: var(--ek-color-action);
  font-size: var(--ek-icon-sm);
}

.ek-views__trigger-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-views__trigger-chevron {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.ek-views {
  width: 360px;
  max-width: 100%;
  overflow: hidden;
  background: var(--ek-color-surface-raised);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
  color: var(--ek-color-content-default);
}

.ek-views__head {
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-2);
}

.ek-views__head-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ek-space-2);
}

.ek-views__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-views__count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-views__desc {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-views__list {
  max-height: 264px;
  margin: 0;
  padding: var(--ek-space-1) var(--ek-space-2);
  overflow-y: auto;
  list-style: none;
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-views__item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  border-radius: var(--ek-radius-md);
  transition: var(--ek-transition-colors);
}

.ek-views__item:hover {
  background: var(--ek-color-surface-sunken);
}

.ek-views__item.is-active {
  background: var(--ek-color-action-subtle);
}

.ek-views__apply {
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: var(--ek-space-2);
  min-width: 0;
  padding: var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.ek-views__apply:focus-visible,
.ek-views__delete:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-views__item-icon {
  margin-top: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.ek-views__item.is-active .ek-views__item-icon {
  color: var(--ek-color-action);
}

.ek-views__item-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ek-views__item-name {
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
  line-height: var(--ek-type-body-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-views__item.is-active .ek-views__item-name {
  color: var(--ek-color-action-emphasis);
}

.ek-views__item-summary {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.ek-views__delete {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--ek-control-h-sm);
  height: var(--ek-control-h-sm);
  margin-right: var(--ek-space-1);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-views__delete:hover {
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.ek-views__empty {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-views__empty-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-views__empty-text {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-views__save {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-sunken);
}

.ek-views__save-title {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-views__current {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
  line-height: var(--ek-type-caption-line);
}

.ek-views__current.is-empty {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.ek-views__save-row {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
}

.ek-views__name {
  flex: 1;
  min-width: 0;
}

.ek-views__save-row :deep(.ek-btn) {
  flex: none;
  margin-top: var(--ek-space-1);
}

.ek-views__note {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

@media (max-width: 767px) {
  .ek-views__trigger {
    max-width: 160px;
  }
}
</style>
