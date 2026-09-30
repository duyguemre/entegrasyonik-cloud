<!--
  A13 — müşteri kimlik başlığı: baş harf avatarı · ad soyad · tür rozeti (Bireysel/Kurumsal) · kanal kökeni
  (kanal rengi nokta + ad) · müşteri olma tarihi. Firma adı kurumsal müşteride adın altında. Değer yoksa satır çizilmez.
-->
<template>
  <div class="ek-cust-id" :class="`ek-cust-id--${size}`">
    <CustomerAvatar :first-name="firstName" :last-name="lastName" :anonymized="anonymized" :size="size === 'lg' ? 'lg' : 'md'" />
    <div class="ek-cust-id__text">
      <div class="ek-cust-id__line">
        <component :is="as" class="ek-cust-id__name">{{ name }}</component>
        <EkBadge :tone="kind.value === 'corporate' ? 'info' : 'neutral'" class="ek-cust-id__kind">
          <v-icon :icon="kind.icon" size="12" aria-hidden="true" />{{ kind.label }}
        </EkBadge>
        <EkBadge v-if="anonymized" tone="neutral">Anonimleştirildi</EkBadge>
        <slot name="tags" />
      </div>
      <span v-if="company" class="ek-cust-id__company">{{ company }}</span>
      <div class="ek-cust-id__meta">
        <EkChannelDot v-if="channel !== undefined" :code="channel" :name="channel ? undefined : 'Sistem'" variant="plain" />
        <span v-if="since" class="ek-cust-id__since">
          <v-icon icon="mdi-calendar-account-outline" size="14" aria-hidden="true" />{{ sinceLabel }} <span class="ek-num">{{ since }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkBadge from '@/components/ds/EkBadge.vue'
import EkChannelDot from '@/components/ds/EkChannelDot.vue'
import CustomerAvatar from './CustomerAvatar.vue'
import { customerKind, customerSince, displayName, isAnonymized } from '../customerCard'

const props = withDefaults(
  defineProps<{
    firstName?: string | null
    lastName?: string | null
    companyName?: string | null
    isCorporate?: boolean | null
    /** Kanal kodu; `null`/'' → "Sistem" (nötr nokta); `undefined` → kanal satırı yok. */
    channel?: string | null
    createdAt?: string | Date | null
    sinceLabel?: string
    size?: 'md' | 'lg'
    /** Ad öğesi (detayda başlık `h2`). */
    as?: string
  }>(),
  { firstName: '', lastName: '', companyName: '', isCorporate: false, channel: undefined, createdAt: null, sinceLabel: 'Müşteri', size: 'md', as: 'span' },
)

const anonymized = computed(() => isAnonymized(props.firstName))
const name = computed(() => displayName({ firstName: props.firstName, lastName: props.lastName }))
const kind = computed(() => customerKind(props.isCorporate))
const company = computed(() => (props.isCorporate && props.companyName && !isAnonymized(props.companyName) ? props.companyName : ''))
const since = computed(() => customerSince(props.createdAt))
</script>

<style scoped>
.ek-cust-id {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
}
.ek-cust-id--lg { gap: var(--ek-space-4); }
.ek-cust-id__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ek-cust-id__line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-2);
  min-width: 0;
}
.ek-cust-id__name {
  margin: 0;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}
.ek-cust-id--lg .ek-cust-id__name {
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  letter-spacing: -0.01em;
}
.ek-cust-id__kind { gap: 4px; }
.ek-cust-id__company {
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-default);
}
.ek-cust-id__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-4);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}
.ek-cust-id__since {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
