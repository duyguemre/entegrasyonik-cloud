<!--
  A13 — fatura / teslimat adresi ayrımı. KVKK: açık adres satırı varsayılan GİZLİ (il/ilçe görünür);
  `revealed` ile açılır. Aynı adres iki kez yazılmaz ("Fatura adresiyle aynı"). Kopya tam adresi yazar.
-->
<template>
  <div class="ek-cust-addr" :class="{ 'ek-cust-addr--stack': stack }">
    <section v-for="b in blocks" :key="b.key" class="ek-cust-addr__block" :aria-label="b.title">
      <header class="ek-cust-addr__head">
        <v-icon :icon="b.icon" aria-hidden="true" />
        <span class="ek-cust-addr__title">{{ b.title }}</span>
        <span v-if="b.address?.title" class="ek-cust-addr__tag">{{ b.address.title }}</span>
        <span v-if="b.copy" class="ek-cust-addr__copy"><EkActionButton action="copy" :label="`${b.title}ni kopyala`" @click="copy(b.title, b.copy)" /></span>
      </header>
      <p v-if="b.same" class="ek-cust-addr__muted">Fatura adresiyle aynı</p>
      <template v-else-if="b.address">
        <p v-if="b.address.anonymized" class="ek-cust-addr__muted">
          <v-icon icon="mdi-account-off-outline" size="14" aria-hidden="true" /> Anonimleştirildi
        </p>
        <template v-else>
          <p v-if="b.address.line && revealed" class="ek-cust-addr__line">{{ b.address.line }}</p>
          <p v-else-if="b.address.line" class="ek-cust-addr__muted" data-masked="true">
            <v-icon icon="mdi-shield-lock-outline" size="14" aria-hidden="true" /> Açık adres gizli
          </p>
          <p v-if="b.address.region" class="ek-cust-addr__region">
            {{ b.address.region }}<span v-if="b.address.postalCode && revealed" class="ek-num"> · {{ b.address.postalCode }}</span>
          </p>
        </template>
      </template>
      <p v-else class="ek-cust-addr__muted">Kayıtlı değil</p>
      <slot :name="`${b.key}-extra`" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkActionButton } from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { sameAddress, type AddressView } from '../customerCard'

const props = withDefaults(
  defineProps<{ billing: AddressView | null; shipping: AddressView | null; revealed?: boolean; stack?: boolean }>(),
  { revealed: false, stack: false },
)

const fullText = (a: AddressView | null) => (a && !a.anonymized ? [a.line, a.region, a.postalCode].filter(Boolean).join(', ') : '')

const blocks = computed(() => {
  const same = sameAddress(props.billing, props.shipping)
  return [
    { key: 'billing', title: 'Fatura adresi', icon: 'mdi-receipt-text-outline', address: props.billing, same: false, copy: fullText(props.billing) },
    { key: 'shipping', title: 'Teslimat adresi', icon: 'mdi-truck-outline', address: props.shipping, same, copy: same ? '' : fullText(props.shipping) },
  ]
})

const { showToast } = useToast()
async function copy(title: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    showToast({ tone: 'success', message: `${title} panoya kopyalandı.` })
  } catch {
    showToast({ tone: 'warning', message: `${title} kopyalanamadı — tarayıcı pano erişimine izin vermedi.` })
  }
}
</script>

<style scoped>
.ek-cust-addr {
  container-type: inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ek-space-3);
}
@container (min-width: 480px) {
  .ek-cust-addr:not(.ek-cust-addr--stack) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.ek-cust-addr__block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}
.ek-cust-addr__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 32px;
  color: var(--ek-color-content-muted);
}
.ek-cust-addr__head :deep(.v-icon) { font-size: var(--ek-icon-sm); }
.ek-cust-addr__title {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}
.ek-cust-addr__tag {
  padding: 0 6px;
  border-radius: var(--ek-radius-sm);
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  font-size: var(--ek-type-caption-size);
  line-height: 16px;
  color: var(--ek-color-content-default);
}
.ek-cust-addr__copy { margin-left: auto; }
.ek-cust-addr__line,
.ek-cust-addr__region,
.ek-cust-addr__muted {
  margin: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  overflow-wrap: anywhere;
}
.ek-cust-addr__line { color: var(--ek-color-content-strong); }
.ek-cust-addr__region { color: var(--ek-color-content-default); }
.ek-cust-addr__muted {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ek-color-content-muted);
}
</style>
