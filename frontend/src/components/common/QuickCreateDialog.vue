<!--
  frontend/src/components/common/QuickCreateDialog.vue

  FR2-PFORM madde 23 — seçim kutusundan (marka/kategori) YENİ KAYIT: kısa form diyaloğu (EkFormDialog).
  Akış: ad (arama metniyle dolu gelir) → "Ekle ve seç" → istek beklenir → liste yenilenir → yeni kayıt SEÇİLİ gelir
  (`created`). Aynı adlı kayıt varsa uyarı + "Onu seç" (yinelenen kayıt açılmaz). Hata diyalogda kalır, ham hata yok.
  Ek alanlar (ör. kategori için üst kategori) varsayılan slot'a gelir. Mantık: quickCreate.ts.
-->
<template>
  <EkFormDialog v-model="open" :title="`Yeni ${noun}`" :icon="icon" :description="description" width="sm"
    submit-label="Ekle ve seç" submit-icon="mdi-plus" :loading="saving" :submit-disabled="saving || !!problem || !!duplicate"
    @submit="submit" @cancel="open = false">
    <v-text-field v-model="name" :label="`${Noun} adı *`" :maxlength="TITLE_MAX" counter autofocus
      :error-messages="touched && problem ? [problem] : []" :hint="hint" persistent-hint data-qc-field="name"
      @blur="touched = true" @update:model-value="error = ''" />
    <slot />
    <EkAlert v-if="duplicate" tone="info" dense live :title="`“${duplicate.title}” zaten listede`"
      text="Aynı adla ikinci bir kayıt açmak yerine mevcut olanı seçin.">
      <template #actions>
        <EkButton size="sm" tone="primary" icon="mdi-check" @click="pickExisting">Onu seç</EkButton>
      </template>
    </EkAlert>
    <EkAlert v-if="error" tone="error" dense live :title="error" />
  </EkFormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkAlert, EkButton, EkFormDialog } from '@entegrasyonik/ui/components'
import { capitalize, createErrorMessage, findDuplicate, normalizeTitle, titleProblem, TITLE_MAX, type CreateResult } from './quickCreate'

const props = withDefaults(defineProps<{
  /** Küçük harf tekil ad: "marka", "kategori". */
  noun: string
  icon?: string
  description?: string
  hint?: string
  /** Açılışta ad kutusuna gelen metin (combobox'ta yazılan). */
  initialName?: string
  /** Yineleme denetimi için mevcut kayıtlar. */
  existing?: ReadonlyArray<{ _id: string; title?: string }>
  create: (title: string) => Promise<CreateResult>
}>(), { icon: 'mdi-plus-circle-outline', initialName: '', existing: () => [] })

const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ created: [id: string, title: string]; picked: [id: string] }>()

const Noun = computed(() => capitalize(props.noun))
const name = ref('')
const touched = ref(false)
const saving = ref(false)
const error = ref('')

watch(open, (on) => {
  if (!on) return
  name.value = normalizeTitle(props.initialName)
  touched.value = !!name.value
  error.value = ''
  saving.value = false
}, { immediate: true })

const problem = computed(() => titleProblem(name.value, props.noun))
const duplicate = computed(() => findDuplicate(props.existing, name.value))

async function submit() {
  touched.value = true
  if (problem.value || duplicate.value || saving.value) return
  const title = normalizeTitle(name.value)
  saving.value = true
  error.value = ''
  const res = await props.create(title)
  saving.value = false
  if (res.id) {
    emit('created', res.id, title)
    open.value = false
  } else {
    error.value = createErrorMessage(res.error, props.noun)
  }
}

function pickExisting() {
  if (!duplicate.value) return
  emit('picked', duplicate.value._id)
  open.value = false
}
</script>
