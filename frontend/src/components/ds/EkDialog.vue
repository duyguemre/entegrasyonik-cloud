<!--
  frontend/src/components/ds/EkDialog.vue

  DS-v2 — diyalog. Üç bölge HER diyalogda aynı:
    Başlık bandı: [ikon kapsülü] Başlık / açıklama ............ [kapat ×]
    İçerik: varsayılan slot (form ise EkFormGrid)
    Eylem çubuğu (sağa yaslı): [#actions-start] ... Vazgeç (ikincil) · Onay (birincil)
  `tone="danger"`: ikon kapsülü ve onay düğmesi `error`; başlık soru cümlesidir
  ("… silinsin mi?"), varsayılan odak Vazgeç'tedir (yanlışlıkla Enter ile
  silme yok). Genişlik: sm 440 (onay) · md 560 (kısa form) · lg 760.
  Esc kapatır; odak diyalog içinde tutulur (Vuetify v-dialog).
  `inline` yalnızca geliştirme vitrini içindir: aynı kartı overlay'siz çizer.
-->
<template>
  <component
    :is="inline ? 'div' : VDialog"
    v-bind="inline ? { class: 'ek-dialog-inline' } : dialogAttrs"
  >
    <div
      class="ek-dialog"
      :class="[`ek-dialog--${tone}`, `ek-dialog--${width}`]"
      :role="inline ? 'group' : undefined"
      :aria-labelledby="titleId"
      :aria-describedby="description ? descId : undefined"
    >
      <header class="ek-dialog__header">
        <EkIconTile v-if="icon" :icon="icon" :tone="tone === 'danger' ? 'error' : 'action'" size="md" />
        <div class="ek-dialog__titles">
          <h2 :id="titleId" class="ek-dialog__title">{{ title }}</h2>
          <p v-if="description" :id="descId" class="ek-dialog__desc">{{ description }}</p>
        </div>
        <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Kapat" @click="close" />
      </header>
      <div class="ek-dialog__body">
        <slot />
      </div>
      <footer class="ek-dialog__actions">
        <div class="ek-dialog__actions-start"><slot name="actions-start" /></div>
        <slot name="actions">
          <EkButton ref="cancelRef" tone="secondary" @click="cancel">{{ cancelLabel }}</EkButton>
          <EkButton
            :tone="tone === 'danger' ? 'danger' : 'primary'"
            :icon="confirmIcon"
            :loading="confirmLoading"
            :disabled="confirmDisabled"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </EkButton>
        </slot>
      </footer>
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { VDialog } from 'vuetify/components'
import EkButton from './EkButton.vue'
import EkIconTile from './EkIconTile.vue'

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

const uid = useId()
const titleId = `ek-dialog-title-${uid}`
const descId = `ek-dialog-desc-${uid}`
const cancelRef = ref<InstanceType<typeof EkButton> | null>(null)

const dialogAttrs = computed(() => ({
  modelValue: props.modelValue,
  'onUpdate:modelValue': (value: boolean) => emit('update:modelValue', value),
  persistent: props.persistent || props.confirmLoading,
  maxWidth: props.width === 'sm' ? 440 : props.width === 'md' ? 560 : 760,
  scrim: true,
  class: 'ek-dialog-overlay',
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
    const el = (cancelRef.value as unknown as { $el?: HTMLElement } | null)?.$el
    el?.focus()
  },
)
</script>

<style scoped>
.ek-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: calc(100vh - var(--ek-space-16));
  background: var(--ek-color-surface-raised);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-dialog);
  box-shadow: var(--ek-shadow-dialog);
  overflow: hidden;
}

.ek-dialog-inline .ek-dialog {
  max-height: none;
}

.ek-dialog--sm {
  max-width: 440px;
}

.ek-dialog--md {
  max-width: 560px;
}

.ek-dialog--lg {
  max-width: 760px;
}

.ek-dialog__header {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-5) var(--ek-space-4) var(--ek-space-4) var(--ek-space-6);
}

.ek-dialog__titles {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}

.ek-dialog__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.ek-dialog__desc {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-dialog__body {
  flex: 1;
  overflow: auto;
  /* üst 8px: outlined alanın yüzen etiketi kaydırma alanında kesilmesin */
  padding: var(--ek-space-2) var(--ek-space-6) var(--ek-space-5);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-dialog__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-6);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.ek-dialog__actions-start {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-dialog--danger .ek-dialog__header {
  box-shadow: inset 0 3px 0 var(--ek-color-error);
}
</style>

<style>
/* Overlay'in kendisi (teleport edildiği için scoped DEĞİL). Scrim token'dan. */
.ek-dialog-overlay > .v-overlay__scrim {
  background: var(--ek-color-scrim-veil);
  opacity: 1;
}

.ek-dialog-overlay > .v-overlay__content {
  box-shadow: none;
}
</style>
