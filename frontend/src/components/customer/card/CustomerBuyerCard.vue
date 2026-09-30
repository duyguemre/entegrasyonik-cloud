<!--
  A13 — kayıt detayında (sipariş "Alıcı", iade "Müşteri") müşteri kartı. Çerçeve EkInfoCard (kardeş Kargo/Fatura kartlarıyla
  aynı başlık motifi); başlık sağında KVKK göster/gizle anahtarı. Gövde: kimlik (avatar · ad · tür · kanal · müşteri olma) →
  ikonlu iletişim satırları (maskeli + kopya) → fatura/teslimat adresi → (varsa) özet metrikler. Uydurma yok: alan yoksa satır/blok yok.
-->
<template>
  <EkInfoCard :title="title" icon="mdi-account-outline" class="ek-cust-card" :class="{ 'ek-cust-card--wide': wide }">
    <template v-if="canReveal && hasPersonal" #aside>
      <CustomerRevealToggle v-model="revealed" compact />
    </template>
    <p v-if="!person" class="ek-cust-card__empty">{{ emptyText }}</p>
    <div v-else class="ek-cust-card__body">
      <div class="ek-cust-card__who">
        <CustomerIdentity :first-name="person.firstName" :last-name="person.lastName" :company-name="person.companyName"
          :is-corporate="person.isCorporate" :channel="channel" :created-at="person.createdAt" />
        <CustomerContactList dense :phone="person.phone" :email="person.email" :tax-number="person.taxNumber" :tax-office="person.taxOffice"
          :show-tax="!!person.isCorporate" :is-phone-masked="person.isPhoneMasked" :is-email-masked="person.isEmailMasked" :revealed="revealed" />
      </div>
      <CustomerAddresses v-if="billing || shipping" :billing="billing" :shipping="shipping" :revealed="revealed" />
      <CustomerMetrics v-if="metrics" :summary="metrics" class="ek-cust-card__metrics" />
    </div>
  </EkInfoCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EkInfoCard from '@/components/ds/EkInfoCard.vue'
import CustomerIdentity from './CustomerIdentity.vue'
import CustomerContactList from './CustomerContactList.vue'
import CustomerAddresses from './CustomerAddresses.vue'
import CustomerMetrics from './CustomerMetrics.vue'
import CustomerRevealToggle from './CustomerRevealToggle.vue'
import { isAnonymized, type AddressView, type MetricSummary } from '../customerCard'

export interface BuyerPerson {
  id?: string
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
  isCorporate?: boolean | null
  taxNumber?: string | null
  taxOffice?: string | null
  phone?: string | null
  email?: string | null
  isPhoneMasked?: boolean
  isEmailMasked?: boolean
  createdAt?: string | Date | null
}

const props = withDefaults(
  defineProps<{
    person: BuyerPerson | null
    title?: string
    channel?: string | null
    billing?: AddressView | null
    shipping?: AddressView | null
    metrics?: MetricSummary | null
    canReveal?: boolean
    /** Geniş kart (ızgarada tam satır): kimlik + adresler yan yana. */
    wide?: boolean
    emptyText?: string
  }>(),
  { title: 'Alıcı', channel: undefined, billing: null, shipping: null, metrics: null, canReveal: true, wide: false, emptyText: 'Müşteri bilgisi yok.' },
)

// Maskeleme kayıt başına: başka kayda geçince yeniden maskelenir.
const revealed = ref(false)
watch(() => props.person?.id ?? `${props.person?.firstName}|${props.person?.phone}`, () => { revealed.value = false })

const hasPersonal = computed(() => {
  const p = props.person
  if (!p || isAnonymized(p.firstName)) return false
  return [p.phone, p.email, p.taxNumber, props.billing?.line, props.shipping?.line].some((v) => typeof v === 'string' && v.trim() && !isAnonymized(v))
})
</script>

<style scoped>
.ek-cust-card__empty {
  margin: 0;
  font-size: var(--ek-type-body-size);
  color: var(--ek-color-content-muted);
}
.ek-cust-card :deep(.ek-info-card__body) { container-type: inline-size; }
.ek-cust-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}
.ek-cust-card__who {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
}
.ek-cust-card__metrics {
  margin: 0 calc(-1 * var(--ek-space-4)) calc(-1 * var(--ek-space-3));
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
}
@container (min-width: 720px) {
  .ek-cust-card--wide .ek-cust-card__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
    column-gap: var(--ek-space-6);
  }
  .ek-cust-card--wide .ek-cust-card__metrics { grid-column: 1 / -1; }
}
</style>
