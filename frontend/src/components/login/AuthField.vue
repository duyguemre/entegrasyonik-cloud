<!--
  frontend/src/components/login/AuthField.vue

  Kimlik ekranları (giriş / kayıt / parola sıfırlama) form alanı. Etiket alanın ÜSTÜNDE ve sabit (eski yüzen etiket
  v-window'un taşma kırpmasında kesiliyordu); `<label for>` ile bağlı → erişilebilir ad ve `getByLabel` aynı kalır.
  Baştaki ikon, parola alanında göster/gizle düğmesi ve Caps Lock uyarısı; hata metni alanın altında.
  Etiket satırının sağına isteğe bağlı bağlantı (#label-end, ör. "Parolanızı mı unuttunuz?").
  `hide-label`: etiket görsel olarak gizlenir (yer tutucu anlatır) ama `<label for>` olarak KALIR — erişilebilir ad ve
  testlerin `getByLabel` kancaları değişmez.
-->
<template>
  <div class="auf" :class="{ 'has-error': !!error, 'is-readonly': readonly }">
    <div class="auf__labelrow" :class="{ 'auf__labelrow--hidden': hideLabel }">
      <label class="auf__label" :for="id">{{ label }}</label>
      <slot name="label-end" />
    </div>
    <v-text-field :id="id" v-model="model" :type="inputType" :autocomplete="autocomplete" :placeholder="placeholder"
      :prepend-inner-icon="icon" variant="outlined" class="auf__input" :readonly="readonly"
      :error="!!error" :hide-details="true" :aria-describedby="describedBy" :aria-invalid="error ? 'true' : undefined"
      spellcheck="false" @keydown="onKey" @keyup="onKey" @blur="caps = false">
      <template v-if="password" #append-inner>
        <button type="button" class="auf__eye" :aria-label="shown ? 'Parolayı gizle' : 'Parolayı göster'" :aria-pressed="shown"
          @click="shown = !shown" @mousedown.prevent>
          <v-icon :icon="shown ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" aria-hidden="true" />
        </button>
      </template>
    </v-text-field>
    <p v-if="error" :id="`${id}-err`" class="auf__msg auf__msg--error"><v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />{{ error }}</p>
    <p v-else-if="password && caps" :id="`${id}-caps`" class="auf__msg auf__msg--warn" role="status">
      <v-icon icon="mdi-keyboard-caps" aria-hidden="true" />Caps Lock açık
    </p>
    <p v-else-if="hint" :id="`${id}-hint`" class="auf__msg">{{ hint }}</p>
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
  hint?: string
  hideLabel?: boolean
  /** Salt-okunur (ör. Google ile kayıtta belirteçten gelen e-posta). */
  readonly?: boolean
}>(), { type: 'text', autocomplete: 'off', placeholder: '', icon: undefined, error: '', hint: '', hideLabel: false, readonly: false })
const model = defineModel<string>({ default: '' })

const password = computed(() => props.type === 'password')
const shown = ref(false)
const inputType = computed(() => (password.value && shown.value ? 'text' : props.type))
const caps = ref(false)
function onKey(e: KeyboardEvent) { if (password.value && typeof e.getModifierState === 'function') caps.value = e.getModifierState('CapsLock') }
const describedBy = computed(() => (props.error ? `${props.id}-err` : password.value && caps.value ? `${props.id}-caps` : props.hint ? `${props.id}-hint` : undefined))
</script>

<style scoped>
.auf { display: flex; flex-direction: column; gap: var(--ek-space-2); min-width: 0; }
.auf__labelrow { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ek-space-3); }
.auf__label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
}
/* Alan: 52px, ince düz çerçeve, gölge YOK. Üzerine gelince çerçeve koyulaşır; odakta yalnız çerçeve birincil renge
   döner ve 1,5px'e kalınlaşır, baştaki ikon renklenir. */
.auf__labelrow--hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.auf__input :deep(.v-field) {
  min-height: 52px;
  border-radius: 12px;
  background: var(--ek-color-surface);
  box-shadow: none !important;
}
/* İkonsuz alanda metin çerçeveye yapışmasın: ikonlu alanlardaki metin hizasına yakın iç boşluk. */
.auf__input :deep(.v-field:not(.v-field--prepended) .v-field__input) { padding-inline-start: 16px; }
.auf__input :deep(.v-field__input) {
  min-height: 52px;
  font-size: 0.9375rem;
  color: var(--ek-color-content-strong);
  letter-spacing: 0.005em;
}
/* Çerçeve RENGİ global kuraldan (vuetify-overrides.css: --ek-color-border-input, WCAG 1.4.11 ≥3:1) — burada
   yalnız geçiş ve odakta kalınlık; hata rengi Vuetify'dan. */
.auf__input :deep(.v-field__outline) {
  --v-field-border-width: 1px;
  transition: color var(--ek-motion-feedback);
}
.auf__input :deep(.v-field--focused .v-field__outline) { --v-field-border-width: 1.5px; color: var(--ek-color-primary); }
.auf__input :deep(.v-field__prepend-inner) { padding-inline: 2px 10px; }
.auf__input :deep(.v-field__prepend-inner .v-icon) {
  font-size: 19px;
  color: var(--ek-color-content-subtle);
  opacity: 1;
  transition: color var(--ek-motion-feedback);
}
.auf__input :deep(.v-field--focused .v-field__prepend-inner .v-icon),
.auf__input :deep(.v-field--dirty .v-field__prepend-inner .v-icon) { color: var(--ek-color-content-default); }
.auf__input :deep(.v-field--focused .v-field__prepend-inner .v-icon) { color: var(--ek-color-primary); }
.auf.is-readonly .auf__input :deep(.v-field) { background: var(--ek-color-surface-muted); }
.auf__input :deep(input::placeholder) { color: var(--ek-color-content-muted); opacity: 1; }
/* Parola noktaları: biraz daha sıkı ve dengeli. */
.auf__input :deep(input[type='password']) { letter-spacing: 0.12em; }
.auf__input :deep(input[type='password']:placeholder-shown) { letter-spacing: 0.005em; }
/* Tarayıcı otomatik doldurması: mavi/sarı dolgu yerine alanın kendi yüzeyi ve metin rengi. */
.auf__input :deep(input:-webkit-autofill),
.auf__input :deep(input:-webkit-autofill:hover),
.auf__input :deep(input:-webkit-autofill:focus) {
  -webkit-text-fill-color: var(--ek-color-content-strong);
  -webkit-box-shadow: 0 0 0 1000px var(--ek-color-surface) inset;
  caret-color: var(--ek-color-content-strong);
}
.auf__eye {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  margin-inline-end: -4px;
  border-radius: 50%;
  color: var(--ek-color-content-subtle);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}
.auf__eye .v-icon { font-size: 19px; }
.auf__eye:hover { background: var(--ek-color-surface-muted); color: var(--ek-color-content-strong); }
.auf__eye:focus-visible { outline: 2px solid var(--ek-color-primary); outline-offset: 1px; }
.auf__msg {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding-inline-start: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-xs);
}
.auf__msg .v-icon { font-size: var(--ek-icon-sm); }
.auf__msg--error { color: var(--ek-color-error-emphasis); }
.auf__msg--warn { color: var(--ek-color-warning-emphasis); }
@media (prefers-reduced-motion: reduce) { .auf__input :deep(.v-field), .auf__input :deep(.v-field__outline), .auf__eye { transition: none; } }
</style>
