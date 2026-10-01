<!-- Tenant istisnaları: plan değerini alan alan geçersiz kılan müşteriler. Düzenleme OverrideDialog (gerekçeli, denetime yazılır). -->
<template>
  <BoSection id="bo-cs-ovr" flush title="Müşteri istisnaları" :description="description" data-testid="competition-overrides">
    <template #actions>
      <BoAction kind="add" label="İstisna ekle" :disabled="cs.comp.phase !== 'ready'" data-testid="override-add" @click="cs.openEditor()" />
    </template>

    <EkAlert v-if="cs.lastChange" tone="success" live dismissible dense class="bo-co__result" data-testid="override-result" :title="resultTitle" @dismiss="cs.lastChange = null">
      <table class="bo-co__diff">
        <caption class="ek-sr-only">İstisna değişikliği: önce ve sonra</caption>
        <thead><tr><th scope="col">Alan</th><th scope="col">Önce</th><th scope="col">Sonra</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.field" :class="{ 'is-changed': r.changed }">
            <th scope="row">{{ r.label }}</th><td>{{ r.before }}</td><td>{{ r.after }}</td>
          </tr>
        </tbody>
      </table>
    </EkAlert>

      <StateBlock
        :phase="phase"
        :error="cs.comp.error"
        skeleton="table"
        :rows="3"
        error-title="Müşteri istisnaları yüklenemedi"
        degraded-title="İstisna listesi şu an okunamıyor"
        empty-title="Henüz müşteri istisnası yok"
        empty-message="Tüm müşteriler plan varsayılanlarını kullanıyor. Pilot ya da özel anlaşmalı bir müşteri için “İstisna ekle” ile alan bazında değer verebilirsiniz."
        @retry="cs.comp.load()"
      >
        <BoTableFrame label="Müşteri istisnaları" flat>
          <template #head>
            <tr>
              <th scope="col">Müşteri</th>
              <th scope="col" class="bo-hide-sm">Plan</th>
              <th scope="col">İstisna</th>
              <th scope="col">Etkin değerler</th>
              <th scope="col" class="bo-hide-sm">Not</th>
              <th scope="col">Güncelleme</th>
              <th scope="col"><span class="ek-sr-only">Eylem</span></th>
            </tr>
          </template>
              <tr v-for="o in overrides" :key="o.tid" :data-tid="o.tid">
                <th scope="row">
                  <span class="bo-cell-stack">
                    <RouterLink :to="`/musteriler/${o.tid}`" class="bo-co__tid ek-num">#{{ o.tid }}</RouterLink>
                    <span class="bo-muted">{{ o.tenantName ?? '—' }}</span>
                  </span>
                </th>
                <td class="bo-hide-sm">{{ planLabel(o.effective.plan) }}</td>
                <td>
                  <ul class="bo-co__chips" :aria-label="`#${o.tid} istisna alanları`">
                    <li v-for="d in describeOverride(o.override)" :key="d.field"><EkStatusChip tone="info" :label="`${d.label}: ${d.value}`" /></li>
                  </ul>
                </td>
                <td>
                  <span class="bo-co__eff ek-num">
                    <template v-for="(f, i) in FIELDS" :key="f"><span v-if="i">{{ ' · ' }}</span><span :class="{ 'is-tenant': o.effective.sources[f] === 'tenant' }">{{ formatFieldValue(f, o.effective[f]) }}<span v-if="o.effective.sources[f] === 'tenant'" class="ek-sr-only"> (istisna)</span></span></template>
                  </span>
                </td>
                <td class="bo-hide-sm bo-co__note">{{ o.note || '—' }}</td>
                <td><EkRelativeTime v-if="o.updatedAt" :value="o.updatedAt" /><span v-else class="bo-muted">—</span></td>
                <td class="bo-co__act"><BoAction kind="edit" icon-only size="sm" :object="`#${o.tid} istisnasını`" data-testid="override-edit" @click="cs.openEditor(o.tid, o.note)" /></td>
              </tr>
        </BoTableFrame>
      </StateBlock>
    <template v-if="overrides.length" #footer>
      <BoPagination :count="overrides.length" :has-more="false" source="BackofficeBillingService/getCompetitionSettings" />
    </template>
  </BoSection>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkAlert, EkRelativeTime, EkStatusChip } from '@entegrasyonik/ui/components'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { planLabel } from '@bo/utils/labels'
import type { CompetitionState } from './useCompetition'
import { FIELDS, beforeAfterRows, describeOverride, formatFieldValue } from './competitionLogic'
import '@bo/styles/kit.css'

const props = defineProps<{ cs: CompetitionState }>()
const description = computed(
  () => `Belirli bir müşteri için plan değerini geçersiz kılar; boş bırakılan alan plan değerini kullanır. Kayıt anında etkilidir (taslak/yayın yok), gerekçe ister. Etkin değerlerde kalın yazı istisnayı, düz yazı plan değerini gösterir.${overrides.value.length >= 200 ? ' En çok 200 istisna gösterilir.' : ''}`,
)
const overrides = computed(() => props.cs.comp.data?.overrides ?? [])
const phase = computed(() => (props.cs.comp.phase === 'ready' && !overrides.value.length ? 'empty' : props.cs.comp.phase))
const rows = computed(() => (props.cs.lastChange ? beforeAfterRows(props.cs.lastChange.before, props.cs.lastChange.after, props.cs.lastChange.effective) : []))
const resultTitle = computed(() => {
  const c = props.cs.lastChange
  if (!c) return ''
  const who = `#${c.tid}${props.cs.lastChangeName ? ` · ${props.cs.lastChangeName}` : ''}`
  return c.cleared ? `${who}: istisna kaldırıldı, plan değerleri geçerli` : `${who}: istisna kaydedildi`
})
</script>

<style scoped>
.bo-co__result {
  margin: var(--ek-space-4) var(--ek-space-5);
}
.bo-co__diff {
  border-collapse: collapse;
  margin-top: var(--ek-space-2);
  font-size: var(--ek-type-label-size);
}
.bo-co__diff th,
.bo-co__diff td {
  padding: var(--ek-space-1) var(--ek-space-4) var(--ek-space-1) 0;
  text-align: left;
  font-weight: var(--ek-font-weight-regular);
}
.bo-co__diff tr.is-changed th,
.bo-co__diff tr.is-changed td {
  font-weight: var(--ek-font-weight-semibold);
}
.bo-co__tid {
  color: var(--ek-color-action-emphasis);
  font-family: var(--ek-font-mono);
  text-decoration: none;
}
.bo-co__tid:hover {
  text-decoration: underline;
}
.bo-co__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-co__eff .is-tenant {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-co__legend {
  display: block;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-co__note {
  max-width: 260px;
  white-space: normal;
}
.bo-co__act {
  text-align: right;
}
</style>
