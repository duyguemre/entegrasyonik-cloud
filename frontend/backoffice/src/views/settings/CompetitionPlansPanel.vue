<!-- KARAR/EYLEM: plan varsayılanları + Trendyol bütçesi + gölge mod. Düzenleme mevcut `_platform` taslak → yayın akışıyla (PublishDialogs). -->
<template>
  <BoSection id="bo-cs-plans" title="Plan varsayılanları" description="Her abonelik planının buybox izleme kapsamı. Tek tek müşteri için “Müşteri istisnaları” bölümü bu değerleri alan alan geçersiz kılar." data-testid="competition-plans">
      <StateBlock v-if="!cs.hasCatalog" phase="empty" empty-title="Rekabet ayarları katalogda yok" empty-message="Sunucu sürümü bu ayar grubunu henüz içermiyor; sunucuyu güncelleyin ve sayfayı yenileyin." />
      <div v-else class="bo-cp">
        <BoTableFrame label="Plan varsayılanları">
          <template #head>
            <tr>
              <th scope="col">Plan</th>
              <th v-for="f in FIELDS" :key="f" scope="col">{{ FIELD_LABEL[f] }}<span v-if="FIELD_UNIT[f]" class="bo-cp__unit"> ({{ FIELD_UNIT[f] }})</span></th>
            </tr>
          </template>
              <tr v-for="plan in plans" :key="plan" :data-plan="plan">
                <th scope="row">{{ PLAN_NAME[plan] }}</th>
                <td v-for="f in FIELDS" :key="f" class="bo-cp__cell" :class="{ 'is-changed': cfg.isChanged(keyOf(plan, f)) }">
                  <v-select
                    v-if="f === 'priority'"
                    :model-value="cfg.form[keyOf(plan, f)]"
                    :items="priorityItems"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    hide-details
                    single-line
                    :error="!!errorOf(keyOf(plan, f))"
                    :aria-label="`${PLAN_NAME[plan]}: ${FIELD_LABEL[f]}`"
                    :data-testid="`plan-${plan}-${f}`"
                    @update:model-value="(v) => (cfg.form[keyOf(plan, f)] = v)"
                  />
                  <template v-else>
                    <v-text-field
                      :model-value="cfg.form[keyOf(plan, f)] as number"
                      type="number"
                      inputmode="numeric"
                      density="compact"
                      hide-details
                      single-line
                      :error="!!errorOf(keyOf(plan, f))"
                      :aria-label="`${PLAN_NAME[plan]}: ${FIELD_LABEL[f]} (${FIELD_UNIT[f]})`"
                      :data-testid="`plan-${plan}-${f}`"
                      @update:model-value="(v) => (cfg.form[keyOf(plan, f)] = v === '' || v === null ? null : Number(v))"
                    />
                    <span v-if="f === 'refreshMin'" class="bo-cp__hint ek-num">{{ refreshHint(cfg.form[keyOf(plan, 'refreshMin')] as number) }}</span>
                    <span v-else-if="f === 'skuCap' && cfg.form[keyOf(plan, 'skuCap')] === 0" class="bo-cp__hint">izleme kapalı</span>
                  </template>
                </td>
              </tr>
        </BoTableFrame>
        <p class="bo-panel__hint">
          Tazeleme aralığı: bir barkodun buybox bilgisi en erken bu kadar dakikada bir okunur (360 dk = günde 4). Tazelik eşiği: bundan eski gözlem “eski veri” etiketi alır ve bildirim üretmez.
          Öncelik politikası bütçe dar kaldığında hangi SKU’ların önce okunacağını belirler.
        </p>

        <div class="bo-cp__fields">
          <SettingField
            v-for="item in sharedItems"
            :key="item.key"
            :item="item"
            :model-value="cfg.form[item.key]"
            :effective="cfg.data?.values[item.key]"
            :changed="cfg.isChanged(item.key)"
            :error="errorOf(item.key)"
            @update:model-value="(v) => (cfg.form[item.key] = v)"
          />
        </div>

        <ul v-if="messages.length" class="bo-cp__errors" role="alert" data-testid="plans-errors">
          <li v-for="m in messages" :key="m">{{ m }}</li>
        </ul>
        <EkAlert v-if="cfg.saveError && !messages.length" tone="error" live dense :text="cfg.saveError.message" data-testid="save-error" />

        <p class="bo-panel__hint bo-cp__effect">
          <v-icon icon="mdi-timer-sand" aria-hidden="true" />
          Yayınlanan değerler en geç ~15 sn içinde tüm sunucularda etkinleşir; yeniden başlatma gerekmez. Yayın gerekçe ister, geçmişten geri alınabilir.
        </p>
      </div>
    <template v-if="cs.hasCatalog" #footer>
      <div class="bo-cp__actions">
        <BoAction kind="save" label="Taslak kaydet ve önizle" :loading="cfg.saving" :disabled="saveDisabled" data-testid="competition-save" @click="cfg.saveAndPreview()" />
        <span class="bo-panel__hint" aria-live="polite">{{ hint }}</span>
      </div>
    </template>
  </BoSection>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkAlert } from '@entegrasyonik/ui/components'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import SettingField from './SettingField.vue'
import type { CompetitionState } from './useCompetition'
import { BUDGET_KEY, FIELDS, FIELD_LABEL, FIELD_UNIT, PLAN_NAME, PLAN_ORDER, PRIORITY_LABEL, SHADOW_KEY, refreshHint, validatePricingForm } from './competitionLogic'
import type { CompetitionField, CompetitionPlanCode } from '@bo/api/contract'
import '@bo/styles/kit.css'

const props = defineProps<{ cs: CompetitionState }>()
const cfg = computed(() => props.cs.cfg)
const plans = PLAN_ORDER
const keyOf = (plan: CompetitionPlanCode, f: CompetitionField) => `pricing.buybox.plan.${plan}.${f}`
const priorityItems = computed(() => props.cs.priorities.map((p) => ({ value: p, title: PRIORITY_LABEL[p as keyof typeof PRIORITY_LABEL] ?? p })))
const sharedItems = computed(() => props.cs.pricingItems.filter((i) => i.key === BUDGET_KEY || i.key === SHADOW_KEY))

/** İstemci tarafı erken denetim (yalnız değişen alanlar) + sunucunun alan hataları (VALIDATION → alanın yanında). */
const localErrors = computed(() => (props.cs.limits ? validatePricingForm(props.cs.cfg.form, props.cs.limits, props.cs.priorities) : {}))
const errorOf = (key: string): string | undefined => props.cs.cfg.fieldErrors[key] ?? (props.cs.cfg.isChanged(key) ? localErrors.value[key] : undefined)
const messages = computed(() => {
  const keys = new Set([...Object.keys(props.cs.cfg.fieldErrors), ...Object.keys(localErrors.value).filter((k) => props.cs.cfg.isChanged(k))])
  return [...keys].map((k) => errorOf(k)).filter((m): m is string => !!m)
})
const pending = computed(() => props.cs.pendingKeys.length)
const saveDisabled = computed(() => (!pending.value && !props.cs.cfg.hasDraft) || messages.value.length > 0)
const hint = computed(() => (messages.value.length ? 'Geçersiz değer var; düzeltmeden kaydedilemez.' : pending.value ? `${pending.value} değişiklik bekliyor` : 'Değişiklik yok'))
</script>

<style scoped>
.bo-cp {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.bo-cp__unit {
  text-transform: none;
}
.bo-cp__cell {
  min-width: 150px;
  padding-top: var(--ek-space-2);
  padding-bottom: var(--ek-space-2);
  vertical-align: top;
}
.bo-cp__cell.is-changed {
  background: var(--ek-color-info-subtle);
}
.bo-cp__hint {
  display: block;
  margin-top: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-cp__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--ek-space-2) var(--ek-space-4);
}
.bo-cp__errors {
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-5);
  list-style: none;
  border: 1px solid var(--ek-color-error-border);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-label-size);
}
.bo-cp__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}
.bo-cp__effect {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}
</style>
