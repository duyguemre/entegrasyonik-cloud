<template>
  <section class="bo-panel" aria-labelledby="bo-res-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-res-title" class="bo-panel__title">Dayanıklılık durumu</h2>
        <p class="bo-panel__hint">Devre kesici, hız bütçesi ve alım (intake) kipi; her pod kendi anlık görüntüsünü yaklaşık 60 sn'de bir yazar.</p>
      </div>
      <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
    </header>

    <StateBlock
      :phase="phase"
      :error="res.error.value"
      skeleton="cards"
      :rows="3"
      degraded-title="Dayanıklılık verisi okunamıyor"
      empty-title="Henüz anlık görüntü yok"
      empty-message="Podlar ilk metrik aktarımını (yaklaşık 60 sn) henüz yapmadı ya da hiç dış çağrı yapılmadı. Bir dakika sonra yenileyin."
      @retry="res.load()"
    >
      <div v-if="res.data.value" class="bo-stack">
        <EkAlert v-if="drift.length" tone="warning" title="Podlar arasında alım kipi sapması var" :text="`${drift.map((c) => CHANNEL[c] ?? c).join(', ')} için podların alım kipi aynı değil; bir pod boşaltılıyor ya da kapatılmış olabilir. Pod başına değerleri aşağıdaki tabloda karşılaştırın.`" live />
        <EkAlert v-if="engineDrift" tone="warning" title="Motor alım kipi podlar arasında farklı" text="Podların motor alım kipi aynı değil; ayarın tüm podlara yayıldığını doğrulayın." />

        <EkCard flush>
          <div class="bo-res__scroll" tabindex="0" role="region" aria-label="Entegrasyon ve pod matrisi">
            <table class="bo-res__table">
              <caption class="bo-res__caption">Satır: entegrasyon · sütun: pod</caption>
              <thead>
                <tr>
                  <th scope="col">Entegrasyon</th>
                  <th v-for="p in res.data.value.pods" :key="p.pod" scope="col">
                    <span class="bo-cell-stack">
                      <span class="bo-res__pod"><code class="bo-code">{{ p.pod }}</code><EkStatusChip :tone="intakeTone(p.engineIntake)" :label="`motor ${INTAKE[p.engineIntake]}`" /></span>
                      <span>{{ ago(p.observedAt) }}</span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in res.data.value.items" :key="row.integrationCode" :class="{ 'is-drift': drift.includes(row.integrationCode) }">
                  <th scope="row">
                    <span class="bo-cell-stack">
                      <EkChannelDot :code="row.integrationCode" :name="CHANNEL[row.integrationCode] ?? row.integrationCode" variant="plain" />
                      <span v-if="drift.includes(row.integrationCode)" class="bo-res__drift"><EkStatusChip tone="warning" label="Alım kipi sapması" icon="mdi-call-split" /></span>
                    </span>
                  </th>
                  <td v-for="c in row.pods" :key="c.pod" :data-cell="`${row.integrationCode}-${c.pod}`">
                    <div class="bo-res__cell">
                      <div class="bo-res__chips">
                        <EkStatusChip tone="success" :label="`${c.circuits.closed} kapalı`" title="Devre kesici kapalı (normal)" />
                        <EkStatusChip :tone="c.circuits.open ? 'danger' : 'neutral'" :label="`${c.circuits.open} açık`" title="Devre kesici açık (çağrılar durduruldu)" />
                        <EkStatusChip :tone="c.circuits.half_open ? 'warning' : 'neutral'" :label="`${c.circuits.half_open} yarı açık`" title="Yarı açık (deneme çağrıları)" />
                      </div>
                      <span class="bo-res__line">Hız: {{ c.rate.limited }}/{{ c.rate.tenants }} müşteri yavaşlatıldı · {{ c.rate.minRatio === null ? 'taban yok' : `en düşük hız ${formatPercent(c.rate.minRatio, 0)}` }}</span>
                      <span class="bo-res__line">Son açılma: {{ c.lastOpenedAt ? `${formatRelative(c.lastOpenedAt)} · ${formatDateTime(c.lastOpenedAt)}` : 'hiç' }}</span>
                      <EkStatusChip :tone="intakeTone(c.intake)" :label="`alım ${INTAKE[c.intake]}`" :icon="c.intake === 'on' ? undefined : 'mdi-alert-outline'" />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </EkCard>
        <p class="bo-panel__hint">Alım kipi: «açık» normal, «boşaltılıyor» yeni iş alınmıyor, «kapalı» hiç iş alınmıyor. Pod kapanırsa satırı bir dakika içinde listeden düşer.</p>
      </div>
    </StateBlock>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { EkAlert, EkCard, EkChannelDot, EkRefreshButton, EkStatusChip, type StatusTone } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { IntakeMode } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { CHANNEL } from '@bo/utils/labels'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import { formatPercent } from '@bo/utils/units'
import '@bo/styles/kit.css'

const INTAKE: Record<IntakeMode, string> = { on: 'açık', drain: 'boşaltılıyor', off: 'kapalı' }
const res = useResource(() => api.call('BackofficeIntegrationService/getResilienceState', {}))
onMounted(() => res.load())

const phase = computed(() => (res.phase.value === 'ready' && !res.data.value?.pods.length && !res.data.value?.items.length ? 'empty' : res.phase.value))
const drift = computed(() => (res.data.value?.items ?? []).filter((r) => new Set(r.pods.map((p) => p.intake)).size > 1).map((r) => r.integrationCode))
const engineDrift = computed(() => new Set((res.data.value?.pods ?? []).map((p) => p.engineIntake)).size > 1)
const intakeTone = (m: IntakeMode): StatusTone => (m === 'on' ? 'success' : m === 'drain' ? 'warning' : 'danger')

function ago(iso: string): string {
  const base = res.loadedAt.value ?? Date.now()
  const s = Math.max(0, Math.round((base - Date.parse(iso)) / 1000))
  return s < 90 ? `${s} sn önce` : `${Math.round(s / 60)} dk önce`
}
</script>

<style scoped>
.bo-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
.bo-res__scroll {
  overflow-x: auto;
}
.bo-res__table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  font-size: var(--ek-type-label-size);
}
.bo-res__caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.bo-res__table th,
.bo-res__table td {
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  text-align: left;
  vertical-align: top;
}
.bo-res__table thead th {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-res__table tbody th {
  min-width: 140px;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-res__table tr.is-drift > * {
  background: var(--ek-color-warning-subtle);
}
.bo-res__pod {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}
.bo-res__cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-2);
}
.bo-res__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}
.bo-res__line {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
}
</style>
