<!--
  Form parçası (awaiting-input): sunucunun tanımladığı ≤ 8 alan. Sır/parola alanı YOKTUR (ADR-0019 §4.2).
  Gönderilince `input.kind='form'` turu başlar; yeni metin gönderilirse form `cancelled` olur (§4.1).
-->
<template>
  <form class="ek-chat-form" :aria-labelledby="titleId" novalidate @submit.prevent="submit">
    <p :id="titleId" class="ek-chat-part-head__title">{{ part.title }}</p>
    <fieldset class="ek-chat-form__fields" :disabled="!isOpen">
      <template v-for="field in part.fields" :key="field.name">
        <v-textarea
          v-if="field.kind === 'text' && field.multiline"
          v-model="values[field.name]"
          :label="label(field)"
          :hint="field.help"
          :persistent-hint="!!field.help"
          :counter="field.maxLength"
          :maxlength="field.maxLength"
          rows="2"
          auto-grow
          density="compact"
          :error-messages="errors[field.name]"
        />
        <v-text-field
          v-else-if="field.kind === 'text'"
          v-model="values[field.name]"
          :label="label(field)"
          :hint="field.help"
          :persistent-hint="!!field.help"
          :maxlength="field.maxLength"
          density="compact"
          :error-messages="errors[field.name]"
        />
        <v-text-field
          v-else-if="field.kind === 'number' || field.kind === 'money'"
          v-model.number="values[field.name]"
          type="number"
          inputmode="decimal"
          :label="label(field)"
          :hint="field.help"
          :persistent-hint="!!field.help"
          :min="field.min"
          :max="field.kind === 'number' ? field.max : undefined"
          :step="field.kind === 'number' ? field.step : 0.01"
          :suffix="field.kind === 'money' ? field.currency : undefined"
          density="compact"
          :error-messages="errors[field.name]"
        />
        <v-select
          v-else-if="field.kind === 'select'"
          v-model="values[field.name]"
          :items="field.options"
          item-title="label"
          item-value="value"
          :multiple="!!field.multiple"
          :chips="!!field.multiple"
          :label="label(field)"
          :hint="field.help"
          :persistent-hint="!!field.help"
          density="compact"
          :error-messages="errors[field.name]"
        />
        <v-text-field
          v-else-if="field.kind === 'date'"
          v-model="values[field.name]"
          type="date"
          :label="label(field)"
          :hint="field.help"
          :persistent-hint="!!field.help"
          density="compact"
          :error-messages="errors[field.name]"
        />
        <v-checkbox
          v-else-if="field.kind === 'boolean'"
          v-model="values[field.name]"
          :label="label(field)"
          :hint="field.help"
          :persistent-hint="!!field.help"
          density="compact"
        />
        <v-text-field
          v-else-if="field.kind === 'entity'"
          v-model="values[field.name]"
          :label="label(field)"
          :hint="field.help || t('form.entityHint')"
          persistent-hint
          autocomplete="off"
          spellcheck="false"
          density="compact"
          :error-messages="errors[field.name]"
        />
      </template>
    </fieldset>
    <p v-if="formError" class="ek-chat-form__error" role="alert">{{ formError }}</p>
    <footer v-if="isOpen" class="ek-chat-form__foot">
      <EkButton type="submit" tone="primary" size="sm" icon="mdi-arrow-right" :disabled="!chat.canCompose.value">{{ part.submitLabel }}</EkButton>
    </footer>
    <p v-else class="ek-chat-form__state" role="status">{{ t(`form.state.${part.state as 'submitted' | 'cancelled' | 'expired'}`) }}</p>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, ref, useId } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import { formatMoney } from '@entegrasyonik/ui/format'
import type { FormField, FormPart, FormValue } from '../../protocol/v1'
import { useChat } from '../../state/useChat'

const props = defineProps<{ part: FormPart; messageId?: string }>()
const chat = useChat()
const { t } = chat
const titleId = `ek-chat-form-${useId()}`

const values = reactive<Record<string, FormValue>>(Object.fromEntries(props.part.fields.map((f) => [f.name, initial(f)])))
const errors = reactive<Record<string, string[]>>({})
const formError = ref('')
const isOpen = computed(() => props.part.state === 'open')

function initial(field: FormField): FormValue {
  if (field.kind === 'boolean') return false
  if (field.kind === 'select' && field.multiple) return []
  if (field.kind === 'number' || field.kind === 'money') return null
  return ''
}

const label = (field: FormField) => (field.required ? `${field.label} *` : field.label)

function empty(value: FormValue) {
  return value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function normalize(field: FormField, value: FormValue): FormValue {
  if (field.kind === 'entity') {
    const ids = String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return field.multiple ? ids : ids[0] ?? null
  }
  if ((field.kind === 'number' || field.kind === 'money') && (value === '' || value === null)) return null
  if (field.kind === 'text' && typeof value === 'string') return value.trim()
  return value
}

function display(field: FormField, value: FormValue): string {
  if (Array.isArray(value)) {
    if (field.kind === 'select') return value.map((v) => field.options.find((o) => o.value === v)?.label ?? v).join(', ')
    return value.join(', ')
  }
  if (field.kind === 'money' && typeof value === 'number') return formatMoney(value, field.currency)
  if (field.kind === 'select') return field.options.find((o) => o.value === value)?.label ?? String(value ?? '')
  if (typeof value === 'boolean') return value ? t('table.yes') : t('table.no')
  return String(value ?? '')
}

function submit() {
  formError.value = ''
  const out: Record<string, FormValue> = {}
  let valid = true
  for (const field of props.part.fields) {
    const value = normalize(field, values[field.name])
    errors[field.name] = []
    if (field.required && empty(value)) {
      errors[field.name] = [t('form.required')]
      valid = false
    }
    out[field.name] = value
  }
  if (!valid) {
    formError.value = t('form.invalid')
    return
  }
  const summary = [props.part.title, ...props.part.fields.filter((f) => !empty(out[f.name])).map((f) => `${f.label}: ${display(f, out[f.name])}`)].join(' · ')
  chat.submitForm(props.part, out, summary)
}
</script>
