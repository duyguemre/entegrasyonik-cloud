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
    :max-width="maxWidth"
    class="ek-dialog-overlay"
    :content-class="`ek-dialog-content ek-dialog-content--${width}`"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <EkDialogCard ref="cardRef" v-bind="cardProps" @close="close" @cancel="cancel" @confirm="emit('confirm')">
      <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}" /></template>
    </EkDialogCard>
  </v-dialog>
  <div v-else class="ek-dialog-inline">
    <EkDialogCard v-bind="cardProps" inline @close="close" @cancel="cancel" @confirm="emit('confirm')">
      <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}" /></template>
    </EkDialogCard>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import EkDialogCard from './EkDialogCard.vue'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    title: string
    description?: string
    icon?: string
    tone?: 'default' | 'danger'
    width?: 'sm' | 'md' | 'lg'
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
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

const cardRef = ref<InstanceType<typeof EkDialogCard> | null>(null)
const maxWidth = computed(() => (props.width === 'sm' ? 440 : props.width === 'md' ? 560 : 760))
const cardProps = computed(() => ({
  title: props.title,
  description: props.description,
  icon: props.icon,
  tone: props.tone,
  width: props.width,
  confirmLabel: props.confirmLabel,
  confirmIcon: props.confirmIcon,
  cancelLabel: props.cancelLabel,
  confirmLoading: props.confirmLoading,
  confirmDisabled: props.confirmDisabled,
}))

function close() {
  emit('update:modelValue', false)
}

function cancel() {
  emit('cancel')
  close()
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
</style>
