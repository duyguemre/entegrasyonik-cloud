<!--
  frontend/src/components/ds/EkDialogCard.vue

  DS-v2 — `EkDialog`'un iç kartı (başlık bandı · içerik · eylem çubuğu). Tek
  başına kullanılmaz; overlay'li ve vitrin (inline) sunumu aynı kartı paylaşır.
-->
<template>
  <component
    :is="asForm ? 'form' : 'div'"
    class="ek-dialog"
    :class="[`ek-dialog--${tone}`, `ek-dialog--${width}`, { 'ek-dialog--inline': inline }]"
    :role="inline ? 'group' : undefined"
    :aria-labelledby="inline ? resolvedTitleId : undefined"
    :aria-describedby="inline && (description || $slots.description) ? resolvedDescId : undefined"
    :novalidate="asForm || undefined"
    @submit.prevent="onSubmit"
  >
    <header class="ek-dialog__header">
      <EkIconTile v-if="icon" :icon="icon" :tone="iconTone ?? (tone === 'danger' ? 'error' : 'action')" size="md" />
      <div class="ek-dialog__titles">
        <h2 :id="resolvedTitleId" class="ek-dialog__title">{{ title }}</h2>
        <p v-if="description || $slots.description" :id="resolvedDescId" class="ek-dialog__desc">
          <slot name="description">{{ description }}</slot>
        </p>
      </div>
      <slot name="header-actions" />
      <EkButton v-if="!hideClose" tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Kapat" @click="close" />
    </header>
    <div v-if="$slots.default" class="ek-dialog__body">
      <slot />
    </div>
    <footer v-if="!hideActions" class="ek-dialog__actions">
      <div class="ek-dialog__actions-start"><slot name="actions-start" /></div>
      <slot name="actions">
        <EkButton v-if="!hideCancel" ref="cancelRef" tone="secondary" @click="cancel">{{ cancelLabel }}</EkButton>
        <EkButton
          :tone="tone === 'danger' ? 'danger' : 'primary'"
          :icon="confirmIcon"
          :loading="confirmLoading"
          :disabled="confirmDisabled"
          :type="asForm ? 'submit' : 'button'"
          @click="asForm ? undefined : emit('confirm')"
        >
          {{ confirmLabel }}
        </EkButton>
      </slot>
    </footer>
  </component>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import EkButton from './EkButton.vue'
import EkIconTile, { type EkTone } from './EkIconTile.vue'

const props = withDefaults(
  defineProps<{
    title: string
    /** EkDialog'un overlay'e verdiği başlık kimliği (aria-labelledby) — yoksa yerel üretilir. */
    titleId?: string
    /** EkDialog'un overlay'e verdiği açıklama kimliği (aria-describedby) — yoksa yerel üretilir. */
    descId?: string
    hideActions?: boolean
    hideCancel?: boolean
    hideClose?: boolean
    asForm?: boolean
    description?: string
    icon?: string
    iconTone?: EkTone
    tone?: 'default' | 'danger'
    width?: 'sm' | 'md' | 'lg' | 'xl' | 'custom'
    confirmLabel?: string
    confirmIcon?: string
    cancelLabel?: string
    confirmLoading?: boolean
    confirmDisabled?: boolean
    inline?: boolean
  }>(),
  { hideActions: false, hideCancel: false, hideClose: false, asForm: false, tone: 'default', width: 'md', confirmLabel: 'Kaydet', cancelLabel: 'Vazgeç', confirmLoading: false, confirmDisabled: false, inline: false },
)

const emit = defineEmits<{ close: []; cancel: []; confirm: [] }>()

const uid = useId()
const resolvedTitleId = computed(() => props.titleId ?? `ek-dialog-title-${uid}`)
// Ad/açıklama ilişkisi YALNIZ rolü olan öğede: overlay sunumunda `role="dialog"` taşıyan Vuetify içerik
// kabı (EkDialog aria-labelledby/-describedby'ı oraya verir); rolsüz bu kökte aria-labelledby geçersizdir
// (axe aria-prohibited-attr — başlık görünür değilken, ör. açılış geçişinde, ihlal olarak raporlanıyordu).
const resolvedDescId = computed(() => props.descId ?? `ek-dialog-desc-${uid}`)
const cancelRef = ref<InstanceType<typeof EkButton> | null>(null)

function close() {
  emit('close')
}

function cancel() {
  emit('cancel')
}

function onSubmit() {
  if (props.asForm && !props.confirmDisabled && !props.confirmLoading) emit('confirm')
}

defineExpose({
  focusCancel: () => (cancelRef.value as unknown as { $el?: HTMLElement } | null)?.$el?.focus(),
})
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

.ek-dialog--inline {
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

.ek-dialog--xl {
  max-width: 1040px;
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
