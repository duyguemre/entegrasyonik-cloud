<!--
  A13 — ikonlu iletişim satırları (telefon · e-posta · vergi no · platform kimlikleri). KVKK: değerler varsayılan
  MASKELİ (`revealed` ile açılır); kopya eylemi (kayıt defteri `copy`) tam değeri panoya yazar ve toast ile bildirir.
  Pazaryerinin gizlediği / anonimleştirilen değerde kopya yok, açıklayıcı metin var. Değer yoksa "Kayıtlı değil".
-->
<template>
  <div class="ek-cust-contact" :class="{ 'ek-cust-contact--dense': dense }">
    <dl class="ek-cust-contact__list">
      <div v-for="row in rows" :key="row.key" class="ek-cust-contact__row">
        <dt class="ek-cust-contact__label">
          <v-icon :icon="row.icon" class="ek-cust-contact__icon" aria-hidden="true" />{{ row.label }}
        </dt>
        <dd class="ek-cust-contact__value">
          <span v-if="row.value.display" class="ek-cust-contact__text" :class="{ 'ek-num': row.numeric }"
            :data-masked="row.value.maskable && !revealed ? 'true' : undefined">{{ row.value.display }}</span>
          <span v-else-if="row.value.hidden" class="ek-cust-contact__empty">
            <v-icon :icon="row.value.hidden === 'anonymized' ? 'mdi-account-off-outline' : 'mdi-shield-lock-outline'" size="14" aria-hidden="true" />
            {{ row.value.hidden === 'anonymized' ? 'Anonimleştirildi' : 'Pazaryeri gizledi' }}
          </span>
          <span v-else class="ek-cust-contact__empty">Kayıtlı değil</span>
        </dd>
        <dd class="ek-cust-contact__action">
          <EkActionButton v-if="row.value.copy" action="copy" :label="row.copyLabel" @click="copy(row.noun, row.value.copy)" />
        </dd>
      </div>
    </dl>
    <template v-if="platformRows.length">
      <p class="ek-cust-contact__group">Platform kimlikleri</p>
      <dl class="ek-cust-contact__list">
        <div v-for="row in platformRows" :key="row.key" class="ek-cust-contact__row">
          <dt class="ek-cust-contact__label"><EkChannelDot :code="row.channel" variant="plain" /></dt>
          <dd class="ek-cust-contact__value"><span class="ek-cust-contact__text ek-num">{{ row.value.display }}</span></dd>
          <dd class="ek-cust-contact__action">
            <EkActionButton action="copy" :label="row.copyLabel" @click="copy(row.noun, row.value.copy!)" />
          </dd>
        </div>
      </dl>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkActionButton, EkChannelDot } from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { channelName } from '@entegrasyonik/ui/tokens'
import { contactValue, type ContactValue } from '../customerCard'

const props = withDefaults(
  defineProps<{
    phone?: string | null
    email?: string | null
    taxNumber?: string | null
    taxOffice?: string | null
    isPhoneMasked?: boolean
    isEmailMasked?: boolean
    /** Platform kimlikleri (maskelenmez: pazaryeri müşteri no'su kişisel iletişim değildir). */
    identities?: Array<{ integrationCode?: string; externalCustomerId?: string }>
    showTax?: boolean
    revealed?: boolean
    dense?: boolean
  }>(),
  { phone: '', email: '', taxNumber: '', taxOffice: '', isPhoneMasked: false, isEmailMasked: false, identities: () => [], showTax: false, revealed: false, dense: false },
)

interface Row { key: string; label: string; icon: string; value: ContactValue; noun: string; copyLabel: string; numeric?: boolean; channel?: string }

const rows = computed<Row[]>(() => {
  const r: Row[] = [
    { key: 'phone', label: 'Telefon', icon: 'mdi-phone-outline', noun: 'Telefon numarası', copyLabel: 'Telefon numarasını kopyala', numeric: true, value: contactValue('phone', props.phone, { revealed: props.revealed, sourceMasked: props.isPhoneMasked }) },
    { key: 'email', label: 'E-posta', icon: 'mdi-email-outline', noun: 'E-posta adresi', copyLabel: 'E-posta adresini kopyala', value: contactValue('email', props.email, { revealed: props.revealed, sourceMasked: props.isEmailMasked }) },
  ]
  if (props.showTax) {
    const v = contactValue('tax', props.taxNumber, { revealed: props.revealed })
    if (v.display && props.taxOffice) v.display = `${v.display} · ${props.taxOffice}`
    r.push({ key: 'tax', label: 'Vergi no', icon: 'mdi-card-account-details-outline', noun: 'Vergi numarası', copyLabel: 'Vergi numarasını kopyala', numeric: true, value: v })
  }
  return r
})

// Platform kimlikleri maskelenmez: pazaryeri müşteri no'su kişisel iletişim verisi değildir.
const platformRows = computed<Row[]>(() =>
  (props.identities ?? []).filter((id) => id?.externalCustomerId).map((id) => ({
    key: `id-${id.integrationCode}-${id.externalCustomerId}`, label: 'Platform no', icon: 'mdi-identifier', channel: id.integrationCode,
    noun: 'Kanal müşteri no', copyLabel: `${channelName(id.integrationCode)} müşteri numarasını kopyala`, numeric: true,
    value: { kind: 'tax', display: id.externalCustomerId!, copy: id.externalCustomerId!, hidden: null, maskable: false },
  })),
)

const { showToast } = useToast()
async function copy(noun: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    showToast({ tone: 'success', message: `${noun} panoya kopyalandı.` })
  } catch {
    showToast({ tone: 'warning', message: `${noun} kopyalanamadı — tarayıcı pano erişimine izin vermedi.` })
  }
}
</script>

<style scoped>
.ek-cust-contact {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ek-cust-contact__list {
  display: grid;
  grid-template-columns: minmax(96px, max-content) minmax(0, 1fr) 32px;
  margin: 0;
}
.ek-cust-contact__row {
  display: contents;
}
.ek-cust-contact__row > * {
  display: flex;
  align-items: center;
  min-height: 40px;
  margin: 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}
.ek-cust-contact__row:last-child > * { border-bottom: 0; }
.ek-cust-contact--dense .ek-cust-contact__row > * { min-height: 36px; }
.ek-cust-contact__label {
  gap: var(--ek-space-2);
  padding-right: var(--ek-space-4);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
  white-space: nowrap;
}
.ek-cust-contact__icon {
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-muted);
}
.ek-cust-contact__value { min-width: 0; padding-right: var(--ek-space-2); }
.ek-cust-contact__text {
  min-width: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ek-cust-contact__text[data-masked] { letter-spacing: 0.03em; }
.ek-cust-contact__action { justify-content: flex-end; }
.ek-cust-contact__empty {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ek-type-body-size);
  color: var(--ek-color-content-muted);
}
.ek-cust-contact__group {
  margin: var(--ek-space-4) 0 var(--ek-space-1);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}
</style>
