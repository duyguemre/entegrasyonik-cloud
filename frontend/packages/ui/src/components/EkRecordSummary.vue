<!--
  frontend/src/components/ds/EkRecordSummary.vue

  DS-v2 Aşama 6b — Standart 6: KAYIT DETAYI ÖZET BAŞLIĞI (sipariş, iade; aynı dil diğer kayıt detaylarında).
      ▌[kanal avatarı] Kanal adı · tür                               [durum çipi]
      ▌ Sipariş No  E2E-200431        Tarih 25.09.2026 08:15   Kalem 2  │  TOPLAM  ₺1.178,80
  Sol şerit + avatar kanal renginde (`.ek-ch-<kod>`, tek kaynak `design/channels.ts`). Tutar `metric` tipografisinde,
  tabular. `facts` etiket–değer çiftleri (mikro etiket), dar ekranda iki kolon ızgara. Uydurma veri yok: boş değer "—".
-->
<template>
  <section class="ek-summary" :class="channelClass(channel)" :aria-label="label">
    <div class="ek-summary__head">
      <EkPlatformMark :name="channelName(channel, channelTitle)" :code="channel" size="lg" :show-name="false" />
      <div class="ek-summary__who">
        <span class="ek-summary__channel">{{ channelName(channel, channelTitle) }}<template v-if="kind"> · {{ kind }}</template></span>
        <span class="ek-summary__title ek-num">{{ title }}</span>
      </div>
      <div class="ek-summary__status"><slot name="status" /></div>
    </div>
    <div class="ek-summary__body">
      <dl class="ek-summary__facts">
        <div v-for="f in facts" :key="f.label" class="ek-summary__fact">
          <dt>{{ f.label }}</dt>
          <dd :class="{ 'ek-num': f.numeric }">{{ f.value || '—' }}</dd>
        </div>
      </dl>
      <div v-if="amount !== undefined" class="ek-summary__amount">
        <span class="ek-summary__amount-label">{{ amountLabel }}</span>
        <span class="ek-summary__amount-value ek-num">{{ amount }}</span>
        <span v-if="amountHint" class="ek-summary__amount-hint">{{ amountHint }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import EkPlatformMark from './EkPlatformMark.vue'
import { channelClass, channelName } from '../tokens/channels'

export interface EkSummaryFact {
  label: string
  value?: string | number | null
  numeric?: boolean
}

withDefaults(
  defineProps<{
    channel?: string
    channelTitle?: string
    /** Kayıt türü (ör. "Sipariş", "İade talebi"). */
    kind?: string
    title: string
    facts: EkSummaryFact[]
    amount?: string
    amountLabel?: string
    amountHint?: string
    label?: string
  }>(),
  { amountLabel: 'Toplam', label: 'Kayıt özeti' },
)
</script>

<style scoped>
.ek-summary {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4) var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-left: 4px solid var(--ek-ch-solid, var(--ek-color-border-strong));
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.ek-summary__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
}

.ek-summary__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}

.ek-summary__channel {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-ch-text, var(--ek-color-content-muted));
}

.ek-summary__title {
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}

.ek-summary__status {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  justify-content: flex-end;
}

.ek-summary__body {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ek-space-4);
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-summary__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3) var(--ek-space-6);
  margin: 0;
  min-width: 0;
}

.ek-summary__fact dt {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-summary__fact dd {
  margin: 2px 0 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}

.ek-summary__amount {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.ek-summary__amount-label {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-summary__amount-value {
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-content-strong);
}

.ek-summary__amount-hint {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

@media (max-width: 599px) {
  .ek-summary {
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .ek-summary__body {
    flex-direction: column;
    align-items: stretch;
  }

  .ek-summary__facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .ek-summary__amount {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    padding-top: var(--ek-space-2);
    border-top: 1px dashed var(--ek-color-border-default);
  }
}
</style>
