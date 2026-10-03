<!--
  frontend/src/components/integrations/IntegrationGuideCard.vue

  DS-v2 Aşama 2 — entegrasyon ekranlarının (pazaryeri/e-ticaret/kargo/e-fatura/ERP)
  sağ kolonundaki "Hızlı başlangıç rehberi" kartı, TEK KAYNAK. Önceden 5 ekran
  aynı eski kart + tonlu uyarı kutusunu ayrı ayrı çiziyordu. `EkCard` başlık
  motifi (ikon kapsülü + başlık) + numaralı adımlar (`ol`) + bilgi notu.
-->
<template>
  <EkCard title="Hızlı başlangıç rehberi" icon="mdi-lightbulb-on-outline" icon-tone="info" :heading-level="2">
    <ol class="ek-guide">
      <li v-for="(step, i) in steps" :key="i" class="ek-guide__step">
        <span class="ek-guide__num ek-num" aria-hidden="true">{{ i + 1 }}</span>
        <div class="ek-guide__text">
          <div class="ek-guide__title">{{ step.title }}</div>
          <div class="ek-guide__desc">{{ step.text }}</div>
        </div>
      </li>
    </ol>
    <p v-if="note" class="ek-guide__note">
      <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
      <span>{{ note }}</span>
    </p>
  </EkCard>
</template>

<script setup lang="ts">
import { EkCard } from '@entegrasyonik/ui/components'

withDefaults(
  defineProps<{
    steps: Array<{ title: string; text: string }>
    note?: string
  }>(),
  { note: 'API bilgileriniz hatalı ise bağlantı "Pasif" görünecektir.' },
)
</script>

<style scoped>
.ek-guide {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-guide__step {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
}

/* Adımlar ince çizgiyle ayrılır (kart içi liste dili). */
.ek-guide__step + .ek-guide__step {
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-guide__num {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ek-space-6);
  height: var(--ek-space-6);
  /* FE-LOCAL-1048: adım numarası = çerçeveli küçük kutu (ikon kapsülleriyle aynı aile). */
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-guide__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-guide__desc {
  margin-top: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-guide__note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: var(--ek-space-5) 0 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-guide__note .v-icon {
  margin-top: 1px;
}
</style>
