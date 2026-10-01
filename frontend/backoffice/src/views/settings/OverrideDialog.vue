<!-- İstisna ekle / düzenle / kaldır: numara → mevcut etkin ayar → alanlar (boş = plan değeri) → gerekçe (GuardedDialog). -->
<template>
  <GuardedDialog
    :action="save"
    :title="cs.hadOverride ? 'Müşteri istisnasını düzenle' : 'Müşteri istisnası ekle'"
    :description="cs.tenantLabel ? 'Bu müşteri için plan değerleri alan alan geçersiz kılınır.' : 'Önce müşteri numarasını girip mevcut ayarını getirin.'"
    icon="mdi-tune-variant"
    :items="items"
    reversible
    reversible-note="İstisna istenildiği an değiştirilebilir ya da kaldırılabilir; plan değerleri geri döner."
    :tenant="cs.tenantLabel"
    scope="Rekabet izleme ayarı (yalnız bu müşteri)"
    :confirm-label="cs.willClear ? 'İstisnayı kaldır' : 'İstisnayı kaydet'"
    :confirm-icon="cs.willClear ? 'mdi-delete-outline' : 'mdi-check'"
    :danger="cs.willClear"
    :confirm-disabled="disabled"
    width="lg"
  >
    <div class="bo-od" data-testid="override-dialog">
      <form class="bo-od__tid" @submit.prevent="cs.lookup()">
        <v-text-field
          :model-value="cs.tidText"
          label="Müşteri numarası"
          inputmode="numeric"
          density="compact"
          hide-details="auto"
          :error-messages="tidInvalid ? 'Pozitif bir tam sayı girin.' : undefined"
          data-testid="override-tid"
          @update:model-value="(v) => cs.onTidInput(String(v ?? ''))"
        />
        <EkButton type="submit" tone="secondary" icon="mdi-magnify" :loading="cs.lookupPhase === 'loading'" :disabled="cs.tid === null" data-testid="override-lookup">Ayarını getir</EkButton>
      </form>

      <EkAlert v-if="cs.lookupError" tone="error" live dense :text="cs.lookupError.message" data-testid="override-lookup-error" />
      <p v-else-if="cs.lookupPhase === 'idle'" class="bo-panel__hint">Müşteri numarasını yazıp “Ayarını getir”e basın; mevcut etkin ayar ve plan değerleri burada görünür.</p>

      <template v-if="cs.tenant && limits">
        <p class="bo-od__who">
          <EkStatusChip tone="neutral" :label="`Plan: ${planLabel(cs.tenant.effective.plan)}`" />
          <EkStatusChip v-if="cs.tenant.billingExempt" tone="neutral" label="Faturalamadan muaf (Büyüme değerleri)" />
          <EkStatusChip v-if="cs.tenant.effective.planCode === null" tone="warning" label="Plan kodu yok (Başlangıç değerleri)" />
        </p>

        <BoTableFrame label="Mevcut etkin ayar" data-testid="override-current">
          <template #head><tr><th scope="col">Alan</th><th scope="col">Plan değeri</th><th scope="col">Şu an etkin</th><th scope="col">Kaynak</th></tr></template>
          <tr v-for="f in FIELDS" :key="f">
            <th scope="row">{{ FIELD_LABEL[f] }}</th>
            <td class="ek-num">{{ planRow ? formatFieldValue(f, planRow[f]) : '—' }}</td>
            <td class="ek-num">{{ formatFieldValue(f, cs.tenant.effective[f]) }}</td>
            <td>{{ cs.tenant.effective.sources[f] === 'tenant' ? 'İstisna' : 'Plan' }}</td>
          </tr>
        </BoTableFrame>

        <fieldset class="bo-od__fields">
          <legend class="bo-od__legend">İstisna değerleri <span class="bo-muted">(boş bırakılan alan plan değerini kullanır)</span></legend>
          <v-text-field
            v-for="f in NUMERIC_FIELDS"
            :key="f"
            v-model="cs.draft[f]"
            :label="`${FIELD_LABEL[f]} (${FIELD_UNIT[f]})`"
            inputmode="numeric"
            density="compact"
            :placeholder="planRow ? `Plan: ${formatFieldValue(f, planRow[f])}` : undefined"
            persistent-placeholder
            :hint="`${fmtInt(limits[f].min)}–${fmtInt(limits[f].max)}${f === 'refreshMin' && refreshText ? ' · ' + refreshText : ''}`"
            persistent-hint
            :error-messages="cs.check.errors[f]"
            :data-testid="`override-${f}`"
          />
          <v-select
            v-model="cs.draft.priority"
            :items="priorityItems"
            item-title="title"
            item-value="value"
            label="Öncelik politikası"
            density="compact"
            clearable
            :placeholder="planRow ? `Plan: ${formatFieldValue('priority', planRow.priority)}` : undefined"
            persistent-placeholder
            :hint="cs.draft.priority ? PRIORITY_HELP[cs.draft.priority] : 'Boş: plan değeri'"
            persistent-hint
            :error-messages="cs.check.errors.priority"
            data-testid="override-priority"
          />
          <v-text-field
            v-model="cs.draft.note"
            label="Not (isteğe bağlı)"
            density="compact"
            counter="280"
            hide-details="auto"
            :error-messages="cs.check.errors.note"
            data-testid="override-note"
          />
        </fieldset>

        <div class="bo-od__foot">
          <p class="bo-od__preview" aria-live="polite" data-testid="override-preview">
            <template v-if="cs.willClear">Kayıttan sonra: <strong>istisna kaldırılır</strong>; tüm alanlar plan değerine döner.</template>
            <template v-else-if="cs.check.isEmpty">Henüz bir istisna değeri girilmedi.</template>
            <template v-else>Kayıttan sonra etkin: <strong class="ek-num">{{ afterText }}</strong></template>
          </p>
          <BoAction kind="delete" label="İstisnayı kaldır" size="sm" :disabled="!cs.hadOverride" data-testid="override-clear" @click="cs.clearFields()" />
        </div>
      </template>
    </div>
  </GuardedDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkAlert, EkButton, EkStatusChip } from '@entegrasyonik/ui/components'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import { planLabel } from '@bo/utils/labels'
import type { CompetitionState, useCompetition } from './useCompetition'
import { FIELDS, FIELD_LABEL, FIELD_UNIT, NUMERIC_FIELDS, PRIORITY_HELP, PRIORITY_LABEL, fmtInt, formatFieldValue, refreshHint } from './competitionLogic'

const props = defineProps<{ cs: CompetitionState; save: ReturnType<typeof useCompetition>['save'] }>()
const limits = computed(() => props.cs.limits)
const planRow = computed(() => props.cs.planRow)
const priorityItems = computed(() => props.cs.priorities.map((p) => ({ value: p, title: PRIORITY_LABEL[p as keyof typeof PRIORITY_LABEL] ?? p })))
const tidInvalid = computed(() => props.cs.tidText.trim() !== '' && props.cs.tid === null)
const refreshText = computed(() => {
  const n = Number(props.cs.draft.refreshMin)
  return props.cs.draft.refreshMin.trim() && Number.isFinite(n) ? refreshHint(n) : planRow.value ? refreshHint(planRow.value.refreshMin) + ' (plan)' : ''
})
const disabled = computed(() => {
  const c = props.cs
  return c.lookupPhase !== 'ready' || !c.limits || !c.check.valid || (c.check.isEmpty && !c.hadOverride)
})
const items = computed(() => [
  `${props.cs.tenantLabel ? props.cs.tenantLabel.name : 'Seçilen müşteri'} için buybox izleme ayarı değişir; en geç bir sonraki dakikalık tazeleme turunda etkili olur, yeniden başlatma gerekmez.`,
  'Önce/sonra değerleri denetime yazılır (abonelik olayı “subscription.competition_override” ve yönetici işlemi “backoffice.write”).',
])
/** Kayıttan sonra etkin değerlerin özeti: dolu alan istisna, boş alan plan değeri. */
const afterText = computed(() => {
  const o = props.cs.check.override
  const base = planRow.value
  return FIELDS.map((f) => formatFieldValue(f, o[f] ?? base?.[f])).join(' · ')
})
</script>

<style scoped>
.bo-od {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-width: 0;
}
.bo-od__tid {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
}
.bo-od__tid :deep(.v-input) {
  flex: 1 1 auto;
}
.bo-od__who {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
}
.bo-od__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--ek-space-3) var(--ek-space-4);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.bo-od__legend {
  grid-column: 1 / -1;
  padding: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-od__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
}
.bo-od__preview {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}
</style>
