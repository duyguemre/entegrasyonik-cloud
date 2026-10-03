<!--
  A13 — müşteri baş harf avatarı. Nötr token zemin (kişisel foto YOK), ince kenarlık; anonim müşteride ikon.
  Dekoratif (`aria-hidden`): ad her zaman yanında metin olarak yazılır.
-->
<template>
  <span class="ek-cust-avatar" :class="`ek-cust-avatar--${size}`" aria-hidden="true">
    <v-icon v-if="anonymized || !letters" :icon="anonymized ? 'mdi-account-off-outline' : 'mdi-account-outline'" />
    <template v-else>{{ letters }}</template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { initials } from '../customerCard'

const props = withDefaults(
  defineProps<{ firstName?: string | null; lastName?: string | null; anonymized?: boolean; size?: 'sm' | 'md' | 'lg' }>(),
  { firstName: '', lastName: '', anonymized: false, size: 'md' },
)
const letters = computed(() => initials(props.firstName, props.lastName))
</script>

<style scoped>
.ek-cust-avatar {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-neutral-subtle);
  border: 1px solid var(--ek-color-border-default);
  color: var(--ek-color-neutral-emphasis);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.02em;
  font-feature-settings: 'tnum';
  user-select: none;
}
.ek-cust-avatar--sm { width: 28px; height: 28px; font-size: var(--ek-type-micro-size); }
.ek-cust-avatar--md { width: 40px; height: 40px; font-size: var(--ek-type-label-size); }
.ek-cust-avatar--lg { width: 56px; height: 56px; font-size: var(--ek-type-heading-size); }
.ek-cust-avatar--sm :deep(.v-icon) { font-size: var(--ek-icon-xs); }
.ek-cust-avatar--md :deep(.v-icon) { font-size: var(--ek-icon-md); }
.ek-cust-avatar--lg :deep(.v-icon) { font-size: var(--ek-icon-xl); }

/* FE-LOCAL-1045: avatar — yuvarlak gri yerine eylem renginin açık tonunda kutu (ikon kapsülleriyle aynı aile). */
.ek-cust-avatar {
  border-color: var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-cust-avatar--lg {
  border-radius: var(--ek-radius-card);
}
</style>
