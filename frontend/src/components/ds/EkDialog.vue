<!--
  frontend/src/components/ds/EkDialog.vue

  DS-v2 — diyalog. Üç bölge HER diyalogda aynı (bkz. EkDialogCard):
    Başlık bandı: [ikon kapsülü] Başlık / açıklama ............ [kapat ×]
    İçerik: varsayılan slot (form ise EkFormGrid)
    Eylem çubuğu (sağa yaslı): [#actions-start] ... Vazgeç (ikincil) · Onay (birincil)
  `tone="danger"`: ikon kapsülü ve onay düğmesi `error`; başlık soru cümlesidir
  ("… silinsin mi?"), varsayılan odak Vazgeç'tedir (yanlışlıkla Enter ile
  silme yok). Genişlik: sm 440 (onay) · md 560 (kısa form) · lg 760.
  Esc kapatır; odak diyalog içinde tutulur (Vuetify v-dialog).
  Aşama 2 eklemeleri (geri uyumlu): `width="xl"` (1040) · `maxWidth` (özel genişlik;
  ön ayarı geçersiz kılar) · `attach` (diyalog yalnızca o çalışma alanı sekmesini
  örter — `contained`) · `hideActions` / `hideCancel` / `hideClose` · `asForm`
  (gövde + eylemler `<form>`: Enter onayı gönderir) · `retainFocus`.
  `inline` yalnızca geliştirme vitrini içindir: aynı kartı overlay'siz çizer.
  Not: v-dialog şablonda DOĞRUDAN yazılır — vite-plugin-vuetify bileşen CSS'ini
  yalnızca şablonda gördüğü bileşenler için yükler (dinamik `<component :is>` ile
  dialog stilleri eksik kalıp içerik sol üste yapışıyordu).
-->
<template>
  <v-dialog
    v-if="!inline"
    :model-value="modelValue"
    :persistent="persistent || confirmLoading"
    :max-width="resolvedMaxWidth"
    :attach="resolvedAttach"
    :contained="!!resolvedAttach"
    :retain-focus="retainFocus"
    :aria-labelledby="titleId"
    class="ek-dialog-overlay"
    :content-class="`ek-dialog-content ek-dialog-content--${maxWidth ? 'custom' : width}`"
    :content-props="contentProps"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <EkDialogCard ref="cardRef" v-bind="cardProps" @close="dismiss" @cancel="cancel" @confirm="emit('confirm')">
      <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}" /></template>
    </EkDialogCard>
  </v-dialog>
  <div v-else class="ek-dialog-inline">
    <EkDialogCard v-bind="cardProps" inline @close="dismiss" @cancel="cancel" @confirm="emit('confirm')">
      <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}" /></template>
    </EkDialogCard>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import EkDialogCard from './EkDialogCard.vue'
import type { EkTone } from './EkIconTile.vue'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    title: string
    description?: string
    icon?: string
    tone?: 'default' | 'danger'
    width?: 'sm' | 'md' | 'lg' | 'xl'
    /** Özel en fazla genişlik (ör. 800 veya '800px'); verilirse `width` ön ayarını geçersiz kılar. */
    maxWidth?: number | string
    /** Çalışma alanı sekmesi kabı (CSS seçici; baştaki '.' isteğe bağlı) — diyalog yalnızca onu örter. */
    attach?: string | boolean | Element
    hideActions?: boolean
    hideCancel?: boolean
    hideClose?: boolean
    asForm?: boolean
    retainFocus?: boolean
    /** İkon kapsülü tonu (varsayılan: tehlikede `error`, değilse `action`). */
    iconTone?: EkTone
    /** false: Vazgeç yalnızca `cancel` yayar, diyaloğu kapatmaz (ör. "Temizle" düğmesi). */
    cancelCloses?: boolean
    confirmLabel?: string
    confirmIcon?: string
    cancelLabel?: string
    confirmLoading?: boolean
    confirmDisabled?: boolean
    persistent?: boolean
    inline?: boolean
  }>(),
  {
    modelValue: false,
    tone: 'default',
    width: 'md',
    confirmLabel: 'Kaydet',
    cancelLabel: 'Vazgeç',
    confirmLoading: false,
    confirmDisabled: false,
    persistent: false,
    inline: false,
    attach: false,
    hideActions: false,
    hideCancel: false,
    hideClose: false,
    asForm: false,
    retainFocus: true,
    cancelCloses: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
  /** Başlıktaki × ile kapatıldı (Esc/perde yalnızca `update:modelValue` yayar). */
  close: []
}>()

const cardRef = ref<InstanceType<typeof EkDialogCard> | null>(null)
const PRESET: Record<string, number> = { sm: 440, md: 560, lg: 760, xl: 1040 }
const titleId = `ek-dialog-title-${useId()}`
const cssWidth = (v: number | string) => (typeof v === 'number' || /^\d+$/.test(v) ? `${v}px` : v)
const resolvedMaxWidth = computed(() => (props.maxWidth ? cssWidth(props.maxWidth) : PRESET[props.width]))
// Eski çağıranlar sekme kabını noktasız verebiliyor ("orderListView") — sınıf seçicisine çevrilir.
const resolvedAttach = computed(() => {
  const a = props.attach
  if (!a) return false
  if (typeof a === 'string' && /^[A-Za-z][\w-]*$/.test(a)) return `.${a}`
  return a
})
// Özel genişlik: eski global kural `max-width: unset !important` kullandığı için değer de önemli.
const contentProps = computed(() => (props.maxWidth ? { style: { maxWidth: `${cssWidth(props.maxWidth)} !important` } } : {}))
const cardProps = computed(() => ({
  titleId,
  hideActions: props.hideActions,
  hideCancel: props.hideCancel,
  hideClose: props.hideClose,
  asForm: props.asForm,
  title: props.title,
  description: props.description,
  icon: props.icon,
  iconTone: props.iconTone,
  tone: props.tone,
  width: props.maxWidth ? ('custom' as const) : props.width,
  confirmLabel: props.confirmLabel,
  confirmIcon: props.confirmIcon,
  cancelLabel: props.cancelLabel,
  confirmLoading: props.confirmLoading,
  confirmDisabled: props.confirmDisabled,
}))

function close() {
  emit('update:modelValue', false)
}

function dismiss() {
  emit('close')
  close()
}

function cancel() {
  emit('cancel')
  if (props.cancelCloses) close()
}

// Tehlikeli diyalogda varsayılan odak "Vazgeç" (ADR-0015 6.1 EkConfirmDialog kuralı).
watch(
  () => props.modelValue,
  async (open) => {
    if (!open || props.tone !== 'danger') return
    await nextTick()
    setTimeout(() => cardRef.value?.focusCancel(), 0)
  },
)
</script>

<style>
/* Overlay'in kendisi (teleport edildiği için scoped DEĞİL). Scrim token'dan. */
.ek-dialog-overlay > .v-overlay__scrim {
  background: var(--ek-color-scrim-veil);
  opacity: 1;
}

.ek-dialog-overlay > .v-overlay__content {
  box-shadow: none;
}

/* Eski global kural (`public/assets/css/site.css`: `.v-dialog .v-overlay__content
 * { top:0; left:0; max-width: unset !important; padding: 8px !important … }`)
 * diyaloğu sol üste ve tam genişliğe zorluyor. DS-v2 diyaloğu kendi içerik
 * sınıfıyla bu kuraldan korunur (Aşama 2'de eski kural kaldırılınca bu blok
 * sadeleşir — DESIGN_SYSTEM.md §Envanter). `!important` gerekçesi: eski kural
 * `!important` kullanıyor. */
.v-dialog > .ek-dialog-content.v-overlay__content {
  position: relative;
  inset: auto;
  /* `scrollable` varsayılanı içeriği `flex: 1 1 100%` yapıyor → genişlik yok sayılıyordu. */
  flex: 0 1 auto;
  width: calc(100% - var(--ek-space-12));
  max-height: calc(100% - var(--ek-space-12)) !important;
  margin: var(--ek-space-6) auto !important;
  padding: 0 !important;
}

.v-dialog > .ek-dialog-content--sm.v-overlay__content {
  max-width: 440px !important;
}

.v-dialog > .ek-dialog-content--md.v-overlay__content {
  max-width: 560px !important;
}

.v-dialog > .ek-dialog-content--lg.v-overlay__content {
  max-width: 760px !important;
}

.v-dialog > .ek-dialog-content--xl.v-overlay__content {
  max-width: 1040px !important;
}

/* Sekmeye iliştirilmiş (contained) diyalog: kabın içinde ortalanır. */
.v-dialog.v-overlay--contained > .ek-dialog-content.v-overlay__content {
  max-height: calc(100% - var(--ek-space-8)) !important;
  margin: var(--ek-space-4) auto !important;
}

@media (max-width: 599px) {
  .v-dialog > .ek-dialog-content.v-overlay__content {
    width: calc(100% - var(--ek-space-6));
    margin: var(--ek-space-3) auto !important;
  }
}
</style>
