<template>
  <BoSection id="bo-res" title="Dayanıklılık durumu" description="Devre kesici, hız bütçesi ve alım (intake) kipi; her pod kendi anlık görüntüsünü yaklaşık 60 sn'de bir yazar." icon="mdi-shield-half-full">
    <template #actions>
      <EkRefreshButton quiet-success :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
    </template>

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

        <BoTableFrame label="Entegrasyon ve pod matrisi (satır: entegrasyon · sütun: pod)" density="comfortable" class="bo-res__frame">
          <template #head>
                <tr>
                  <th scope="col">Entegrasyon</th>
                  <th v-for="p in res.data.value.pods" :key="p.pod" scope="col">
                    <span class="bo-cell-stack">
                      <span class="bo-res__pod"><code class="bo-code">{{ p.pod }}</code><EkStatusChip :tone="intakeTone(p.engineIntake)" :label="`motor ${INTAKE[p.engineIntake]}`" /></span>
                      <span>{{ formatRelative(p.observedAt, res.loadedAt.value ?? Date.now()) }}</span>
                    </span>
                  </th>
                </tr>
          </template>
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
        </BoTableFrame>
      </div>
    </StateBlock>
    <template #footer>
      <span class="bo-res__note">Alım kipi: «açık» normal, «boşaltılıyor» yeni iş alınmıyor, «kapalı» hiç iş alınmıyor. Pod kapanırsa satırı bir dakika içinde listeden düşer.</span>
    </template>
  </BoSection>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { EkAlert, EkChannelDot, EkRefreshButton, EkStatusChip, type StatusTone } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { IntakeMode } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
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

</script>

<style scoped>
.bo-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
.bo-res__frame :deep(.bo-table) {
  min-width: 720px;
}
.bo-res__note {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
:deep(.bo-res__frame tr.is-drift > *) {
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

/* BO-LOCAL-01 — pod başlığı ve hücre: sapma satırı düz uyarı zemini (şerit yok); hücre satırları ince çizgiyle ayrılır. */
:deep(.bo-res__frame tr.is-drift > *) {
  background: var(--ek-color-warning-subtle);
}

.bo-res__line + .bo-res__line {
  padding-top: var(--ek-space-1);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-res__cell {
  gap: var(--ek-space-1);
}
</style>
