<!--
  frontend/src/components/page/templates/EkWizardTemplate.vue

  ADR-0015 Karar 3.9.3/6.1 — sihirbaz/onboarding TEK KAYNAK şablonu.
  Adımlayıcı; ≥1024px'te YATAY, altında DİKEY, "Adım 2/4" gösterir. Alt
  çubuk: SOL "Daha sonra" · SAĞ "Geri · İleri/Tamamla" (Karar 6.1 sihirbaz
  istisnası — diğer şablonlarda eylemler hep sağda tek gruptur).

  İlerleme kalıcılığı (yalnızca ADIM İNDEKSİ, form verisi/PII YAZILMAZ —
  ADR-0012 persist ilkesi): `persistKey` verilirse `sessionStorage`'a yazılır.
  Kullanıcı+tenant kapsamlı anahtarı (ör. `ek.wizard.onboarding.<tenantId>`)
  ÇAĞIRAN oluşturur — bu bileşen tenant/kullanıcı bağlamını bilmez (saf).

  Kullanım:
    <EkWizardTemplate
      :steps="[{ key: 'store', label: 'Mağaza' }, { key: 'catalog', label: 'Katalog' }]"
      v-model:step-index="stepIndex"
      persist-key="ek.wizard.onboarding.tenant123"
      @finish="complete"
    >
      <template #step-store><StoreStepForm /></template>
      <template #step-catalog><CatalogStepForm /></template>
    </EkWizardTemplate>
-->
<template>
  <div class="ek-wizard">
    <div class="ek-wizard__stepper" role="list">
      <div
        v-for="(step, index) in steps"
        :key="step.key"
        class="ek-wizard__step"
        :class="{ 'ek-wizard__step--active': index === stepIndex, 'ek-wizard__step--done': index < stepIndex }"
        role="listitem"
      >
        <span class="ek-wizard__step-index ek-num">{{ index + 1 }}</span>
        <span class="ek-wizard__step-label">{{ step.label }}</span>
      </div>
    </div>

    <p class="ek-wizard__progress">Adım {{ stepIndex + 1 }}/{{ steps.length }}</p>

    <div class="ek-wizard__body">
      <slot :name="`step-${steps[stepIndex]?.key}`" :step="steps[stepIndex]" />
    </div>

    <div class="ek-wizard__actions">
      <v-btn variant="text" @click="emit('later')">Daha sonra</v-btn>
      <v-spacer />
      <v-btn v-if="stepIndex > 0" variant="outlined" @click="goTo(stepIndex - 1)">Geri</v-btn>
      <v-btn color="primary" :loading="loading" @click="onNext">
        {{ isLastStep ? 'Tamamla' : 'İleri' }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'

export interface EkWizardStep {
  key: string
  label: string
}

const props = withDefaults(
  defineProps<{
    steps: EkWizardStep[]
    stepIndex: number
    loading?: boolean
    persistKey?: string
  }>(),
  {
    loading: false,
  },
)

const emit = defineEmits<{
  'update:stepIndex': [value: number]
  finish: []
  later: []
}>()

const isLastStep = computed(() => props.stepIndex >= props.steps.length - 1)

function goTo(index: number) {
  emit('update:stepIndex', index)
  if (props.persistKey) sessionStorage.setItem(props.persistKey, String(index))
}

function onNext() {
  if (isLastStep.value) {
    emit('finish')
    if (props.persistKey) sessionStorage.removeItem(props.persistKey)
    return
  }
  goTo(props.stepIndex + 1)
}

// İlk yüklemede kalıcı adım indeksini geri yükle (yalnızca sayı, PII yok).
watch(
  () => props.persistKey,
  (key) => {
    if (!key) return
    const saved = sessionStorage.getItem(key)
    const index = saved !== null ? Number(saved) : NaN
    if (!Number.isNaN(index) && index >= 0 && index < props.steps.length && index !== props.stepIndex) {
      emit('update:stepIndex', index)
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.ek-wizard {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
  max-width: 720px;
  margin: 0 auto;
}

.ek-wizard__stepper {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

@media (min-width: 1024px) {
  .ek-wizard__stepper {
    flex-direction: row;
    align-items: center;
    gap: var(--ek-space-4);
  }
}

.ek-wizard__step {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
}

.ek-wizard__step--active {
  color: var(--ek-color-content-strong);
}

.ek-wizard__step--done {
  color: var(--ek-color-success);
}

.ek-wizard__step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--ek-radius-full);
  border: 1px solid currentColor;
  font-size: var(--ek-font-size-xs);
  flex: none;
}

.ek-wizard__step-label {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
}

.ek-wizard__progress {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
  margin: 0;
}

.ek-wizard__body {
  min-height: 200px;
}

.ek-wizard__actions {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-default);
}
</style>
