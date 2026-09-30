<template>
  <EkDetailSheet :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" :identity="invoice ? (invoice.invoiceNumber || '—') : 'Fatura detayı'">
    <template #status>
      <EkStatusChip v-if="invoice" :tone="statusEntry.tone" :label="$t(statusEntry.labelKey)" />
      <EkStatusChip v-if="invoice" tone="neutral" :label="invoice.documentType === 'E_FATURA' ? 'e-Fatura' : 'e-Arşiv'" />
    </template>

    <div v-if="invoice" class="d-flex flex-column ek-gap-8">
      <div class="d-flex align-center justify-space-between ek-gap-4 flex-wrap">
        <span class="text-caption ek-muted">Tarih: {{ formatDateTime(invoice.issueDate || invoice.createdAt) }} · {{ INVOICE_TYPE_LABELS[invoice.type as InvoiceTypeEnum] || invoice.type }}</span>
        <div class="score-widget pa-3 rounded-lg border-subtle d-flex flex-column align-center justify-center">
          <span class="text-caption font-weight-medium ek-muted">FATURA TUTARI</span>
          <span class="text-h6 font-weight-bold ek-num ek-text-success">{{ formatMoney(invoice.totalAmount) }}</span>
        </div>
      </div>

      <v-row dense>
        <v-col cols="12" md="6">
          <EkSection title="Fatura Detayları">
            <EkDescriptionList :items="[
              { label: 'Durum kodu', value: $t(statusEntry.labelKey) },
              { label: 'Kesen sistem', value: INVOICE_METHOD_LABELS[invoice.invoiceMethod as InvoiceMethodEnum] || invoice.invoiceMethod },
              { label: 'ETTN', value: invoice.ettn || '—' },
            ]" />
            <v-btn v-if="invoice.pdfUrl" block color="primary" prepend-icon="mdi-printer-outline" class="mt-4" :href="invoice.pdfUrl" target="_blank">
              Arşiv görüntüle
            </v-btn>
            <v-btn v-else block variant="outlined" prepend-icon="mdi-printer-off" class="mt-4" disabled>
              PDF dosyası yok
            </v-btn>
          </EkSection>
        </v-col>

        <v-col cols="12" md="6">
          <EkSection title="Sipariş metrikleri">
            <div class="d-flex align-center ek-gap-2 mb-4">
              <EkPlatformMark :name="platformName(invoice.integrationCode)" :code="invoice.integrationCode" />
            </div>
            <EkDescriptionList :items="[
              { label: 'Sipariş numarası', value: invoice.externalOrderId || invoice.order?.orderNumber || '—' },
              { label: 'Görünen müşteri', value: `${invoice.customer?.firstName || ''} ${invoice.customer?.lastName || ''}`.trim() || '—' },
              { label: 'Müşteri vergi numarası', value: invoice.customer?.identities?.[0]?.tcknOrVkn || '—' },
            ]" />
          </EkSection>
        </v-col>
      </v-row>
    </div>

    <EkSkeleton v-else type="detail" />
  </EkDetailSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EkDetailSheet from '@/components/ds/EkDetailSheet.vue';
import EkSection from '@/components/ds/EkSection.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkDescriptionList from '@/components/ds/EkDescriptionList.vue';
import EkSkeleton from '@/components/ds/EkSkeleton.vue';
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue';
import { formatMoney, formatDateTime } from '@/composables/format';
import { INVOICE_STATUS_TONE } from '@/design/status-map';
import { InvoiceStatusEnum, InvoiceTypeEnum, INVOICE_TYPE_LABELS, InvoiceMethodEnum, INVOICE_METHOD_LABELS } from '@/types/InvoiceTypes';

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  invoice: {
    type: Object,
    default: () => null
  }
});

defineEmits(['update:modelValue']);

const statusEntry = computed(() => INVOICE_STATUS_TONE[props.invoice?.status as InvoiceStatusEnum] ?? { tone: 'neutral' as const, labelKey: 'status.invoice.draft' });

function platformName(code: string): string {
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : 'Bilinmeyen';
}
</script>

<style scoped>
.ek-gap-2 { gap: var(--ek-space-2); }
.ek-gap-4 { gap: var(--ek-space-4); }
.ek-gap-8 { gap: var(--ek-space-8); }

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-text-success {
  color: var(--ek-color-success);
}

.border-subtle {
  border: 1px solid var(--ek-color-border-default);
}

.score-widget {
  min-width: 160px;
}
</style>
