<!-- DURUM: yayındaki değerlerle "şu an ne açık, dikkat gerektiren var mı?" (K51: Durum → Karar → Eylem → Ayrıntı). -->
<template>
  <section class="bo-panel" aria-labelledby="bo-cs-status-title" data-testid="competition-status">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-cs-status-title" class="bo-panel__title">Durum</h2>
        <p class="bo-panel__hint">Yayındaki değerler gösterilir; taslak değişiklikler yayınlanana kadar burada görünmez.</p>
      </div>
    </header>

    <div v-if="cs.attention.length" class="bo-cs__attention" data-testid="competition-attention">
      <EkAlert v-for="a in cs.attention" :key="a.id" :tone="a.tone" dense :title="a.title" :text="a.text" :data-attention="a.id" />
    </div>

    <EkCard flush>
      <dl class="bo-cs__tiles">
        <div class="bo-cs__tile" data-tile="feature">
          <dt>Özellik</dt>
          <dd>
            <EkStatusChip :tone="cs.status.enabled ? 'success' : 'neutral'" :label="cs.status.enabled ? 'Açık' : 'Kapalı'" dot data-testid="competition-flag-state" />
            <span class="bo-cs__sub">{{ scopeText }}</span>
            <RouterLink v-if="cs.flagDefined" to="/sistem/bayraklar" class="bo-cs__link">Bayrağı Platform ayarlarında değiştir</RouterLink>
          </dd>
        </div>
        <div class="bo-cs__tile" data-tile="budget">
          <dt>Trendyol çağrı bütçesi</dt>
          <dd>
            <span class="bo-cs__value ek-num">{{ cs.status.budget === null ? '—' : fmtInt(cs.status.budget) }}</span>
            <span class="bo-cs__sub">istek / dakika (tüm müşteriler için ortak)</span>
          </dd>
        </div>
        <div class="bo-cs__tile" data-tile="shadow">
          <dt>Bildirim gölge modu</dt>
          <dd>
            <EkStatusChip :tone="cs.status.shadow === false ? 'info' : 'warning'" :label="cs.status.shadow === false ? 'Kapalı' : 'Açık'" dot />
            <span class="bo-cs__sub">{{ cs.status.shadow === false ? '“Buybox kaybedildi” bildirimi müşteriye gider.' : 'Bildirim yalnız deftere yazılır, müşteriye gitmez.' }}</span>
          </dd>
        </div>
        <div class="bo-cs__tile" data-tile="overrides">
          <dt>Tenant istisnası</dt>
          <dd>
            <span class="bo-cs__value ek-num" data-testid="competition-override-count">{{ cs.comp.phase === 'ready' ? fmtInt(cs.status.overrideCount) : '—' }}</span>
            <span class="bo-cs__sub">{{ cs.comp.phase === 'ready' ? 'müşteride plan değeri geçersiz kılınmış' : 'istisna listesi şu an okunamıyor' }}</span>
          </dd>
        </div>
      </dl>
      <p class="bo-cs__note">
        <v-icon icon="mdi-information-outline" aria-hidden="true" />
        Trendyol buybox alanları yerelde doğrulanana kadar özellik kapalı tutulur; açmadan önce pilot müşteri listesini daraltın.
      </p>
    </EkCard>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkAlert, EkCard, EkStatusChip } from '@entegrasyonik/ui/components'
import type { CompetitionState } from './useCompetition'
import { fmtInt } from './competitionLogic'
import '@bo/styles/kit.css'

const props = defineProps<{ cs: CompetitionState }>()
const scopeText = computed(() => {
  const s = props.cs.status
  if (!s.enabled) return 'Buybox okuması çalışmıyor.'
  return s.pilotTenants.length ? `Pilot: ${s.pilotTenants.map((t) => `#${t}`).join(', ')}` : 'Tüm müşteriler için çalışıyor.'
})
</script>

<style scoped>
.bo-cs__attention {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}
.bo-cs__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin: 0;
}
.bo-cs__tile {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
  padding: var(--ek-space-4) var(--ek-space-5);
  border-right: 1px solid var(--ek-color-border-subtle);
}
.bo-cs__tile:last-child {
  border-right: 0;
}
.bo-cs__tile dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}
.bo-cs__tile dd {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-1);
  margin: 0;
}
.bo-cs__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-cs__sub {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-cs__link {
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
}
.bo-cs__note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
@media (max-width: 767px) {
  .bo-cs__tile {
    border-right: 0;
    border-bottom: 1px solid var(--ek-color-border-subtle);
  }
}
</style>
