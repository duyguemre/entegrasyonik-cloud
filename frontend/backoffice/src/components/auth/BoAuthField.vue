<!--
  backoffice/src/components/auth/BoAuthField.vue

  BO-LOGIN — yönetim girişi form alanı; müşteri uygulamasının `AuthField`'ı (frontend/src/components/login/AuthField.vue)
  ile aynı görünüm: baştaki ikon, 52px düz çerçeveli alan, gölge YOK; parola alanında göster/gizle + Caps Lock uyarısı;
  hata metni alanın altında. Etiket görsel olarak gizlidir (yer tutucu anlatır) ama `<label for>` olarak KALIR —
  erişilebilir ad ve e2e `getByLabel('E-posta' | 'Parola' | 'Doğrulama kodu' …)` kancaları değişmez.
  Üst bileşen odak taşıyabilsin diye `focus()` dışarı açılır (hatalı alana odak).
-->
<template>
  <div class="bo-auf" :class="{ 'has-error': !!error, 'is-mono': mono }">
    <label class="bo-auf__label" :for="id">{{ label }}</label>
    <v-text-field ref="fieldEl" :id="id" v-model="model" :type="inputType" :autocomplete="autocomplete" :placeholder="placeholder"
      :prepend-inner-icon="icon" variant="outlined" class="bo-auf__input" :disabled="disabled" :autofocus="autofocus"
      :inputmode="inputmode" :maxlength="maxlength" :error="!!error" hide-details :aria-describedby="describedBy"
      :aria-invalid="error ? 'true' : undefined" spellcheck="false" autocapitalize="off" autocorrect="off"
      @keydown="onKey" @keyup="onKey" @blur="caps = false">
      <template v-if="password" #append-inner>
        <button type="button" class="bo-auf__eye" :aria-label="shown ? 'Parolayı gizle' : 'Parolayı göster'" :aria-pressed="shown"
          @click="shown = !shown" @mousedown.prevent>
          <v-icon :icon="shown ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" aria-hidden="true" />
        </button>
      </template>
    </v-text-field>
    <p v-if="error" :id="`${id}-err`" class="bo-auf__msg bo-auf__msg--error"><v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />{{ error }}</p>
    <p v-else-if="password && caps" :id="`${id}-caps`" class="bo-auf__msg bo-auf__msg--warn" role="status">
      <v-icon icon="mdi-keyboard-caps" aria-hidden="true" />Büyük harf kilidi (Caps Lock) açık
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  id: string
  label: string
  type?: string
  autocomplete?: string
  placeholder?: string
  icon?: string
  error?: string
  disabled?: boolean
  autofocus?: boolean
  inputmode?: string
  maxlength?: number | string
  /** Kod alanları: eşit aralıklı, iri rakamlar. */
  mono?: boolean
}>(), { type: 'text', autocomplete: 'off', placeholder: '', icon: undefined, error: undefined, disabled: false, autofocus: false, inputmode: undefined, maxlength: undefined, mono: false })
const model = defineModel<string>({ default: '' })

const fieldEl = ref<{ focus: () => void } | null>(null)
defineExpose({ focus: () => fieldEl.value?.focus() })

const password = computed(() => props.type === 'password')
const shown = ref(false)
const inputType = computed(() => (password.value && shown.value ? 'text' : props.type))
const caps = ref(false)
function onKey(e: KeyboardEvent) {
  if (password.value && typeof e.getModifierState === 'function') caps.value = e.getModifierState('CapsLock')
}
const describedBy = computed(() => (props.error ? `${props.id}-err` : password.value && caps.value ? `${props.id}-caps` : undefined))
</script>

<style scoped>
.bo-auf {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* Görsel olarak gizli etiket (erişilebilir ad + getByLabel kancası). */
.bo-auf__label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.bo-auf__input :deep(.v-field) {
  min-height: 52px;
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: none !important;
}

.bo-auf__input :deep(.v-field:not(.v-field--prepended) .v-field__input) {
  padding-inline-start: 16px;
}

.bo-auf__input :deep(.v-field__input) {
  min-height: 52px;
  color: var(--ek-color-content-strong);
  font-size: 0.9375rem;
  letter-spacing: 0.005em;
}

.bo-auf__input :deep(.v-field__outline) {
  --v-field-border-width: 1px;
  transition: color var(--ek-motion-feedback);
}

.bo-auf__input :deep(.v-field--focused .v-field__outline) {
  --v-field-border-width: 1.5px;
  color: var(--ek-color-action);
}

.bo-auf__input :deep(.v-field__prepend-inner) {
  padding-inline: 2px 10px;
}

.bo-auf__input :deep(.v-field__prepend-inner .v-icon) {
  color: var(--ek-color-content-subtle);
  font-size: 19px;
  opacity: 1;
  transition: color var(--ek-motion-feedback);
}

.bo-auf__input :deep(.v-field--dirty .v-field__prepend-inner .v-icon) {
  color: var(--ek-color-content-default);
}

.bo-auf__input :deep(.v-field--focused .v-field__prepend-inner .v-icon) {
  color: var(--ek-color-action);
}

.bo-auf__input :deep(input::placeholder) {
  color: var(--ek-color-content-muted);
  opacity: 1;
}

.bo-auf__input :deep(input[type='password']) {
  letter-spacing: 0.12em;
}

.bo-auf__input :deep(input[type='password']:placeholder-shown) {
  letter-spacing: 0.005em;
}

.bo-auf.is-mono .bo-auf__input :deep(input) {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-heading-size);
  letter-spacing: 0.4em;
}

.bo-auf.is-mono .bo-auf__input :deep(input:placeholder-shown) {
  font-family: inherit;
  font-size: 0.9375rem;
  letter-spacing: 0.005em;
}

.bo-auf__input :deep(input:-webkit-autofill),
.bo-auf__input :deep(input:-webkit-autofill:hover),
.bo-auf__input :deep(input:-webkit-autofill:focus) {
  -webkit-text-fill-color: var(--ek-color-content-strong);
  -webkit-box-shadow: 0 0 0 1000px var(--ek-color-surface) inset;
  caret-color: var(--ek-color-content-strong);
}

.bo-auf__eye {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  margin-inline-end: -4px;
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-subtle);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-auf__eye .v-icon {
  font-size: 19px;
}

.bo-auf__eye:hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.bo-auf__eye:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 1px;
}

.bo-auf__msg {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding-inline-start: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-auf__msg .v-icon {
  font-size: var(--ek-icon-sm);
}

.bo-auf__msg--error {
  color: var(--ek-color-error-emphasis);
}

.bo-auf__msg--warn {
  color: var(--ek-color-warning-emphasis);
}

@media (pointer: coarse) {
  .bo-auf__eye {
    min-width: 44px;
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bo-auf__input :deep(.v-field__outline),
  .bo-auf__eye {
    transition: none;
  }
}
</style>
