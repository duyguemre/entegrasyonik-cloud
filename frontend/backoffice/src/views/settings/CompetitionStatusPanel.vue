<!-- DURUM: yayındaki değerlerle "şu an ne açık, dikkat gerektiren var mı?" (K51: Durum → Karar → Eylem → Ayrıntı). -->
<template>
  <BoSection id="bo-cs-status" title="Durum" description="Yayındaki değerler gösterilir; taslak değişiklikler yayınlanana kadar burada görünmez." data-testid="competition-status">
    <div v-if="cs.attention.length" class="bo-cs__attention" data-testid="competition-attention">
      <EkAlert v-for="a in cs.attention" :key="a.id" :tone="a.tone" dense :title="a.title" :text="a.text" :data-attention="a.id" />
    </div>

    <BoTileGrid :min="220" dense>
      <dl class="bo-cs__tile" data-tile="feature">
        <dt>Özellik</dt>
        <dd>
          <EkStatusChip :tone="cs.status.enabled ? 'success' : 'neutral'" :label="cs.status.enabled ? 'Açık' : 'Kapalı'" dot data-testid="competition-flag-state" />
          <span class="bo-cs__sub">{{ scopeText }}</span>
          <RouterLink v-if="cs.flagDefined" :to="{ path: '/sistem/bayraklar', query: { sekme: 'bayraklar' } }" class="bo-cs__link">Bayrağı Platform ayarlarında değiştir</RouterLink>
        </dd>
      </dl>
      <dl class="bo-cs__tile" data-tile="budget">
        <dt>Trendyol çağrı bütçesi</dt>
        <dd>
          <span class="bo-cs__value ek-num">{{ cs.status.budget === null ? '—' : fmtInt(cs.status.budget) }}</span>
          <span class="bo-cs__sub">istek / dakika (tüm müşteriler için ortak)</span>
        </dd>
      </dl>
      <dl class="bo-cs__tile" data-tile="shadow">
        <dt>Bildirim gölge modu</dt>
        <dd>
          <EkStatusChip :tone="cs.status.shadow === false ? 'info' : 'warning'" :label="cs.status.shadow === false ? 'Kapalı' : 'Açık'" dot />
          <span class="bo-cs__sub">{{ cs.status.shadow === false ? '“Buybox kaybedildi” bildirimi müşteriye gider.' : 'Bildirim yalnız deftere yazılır, müşteriye gitmez.' }}</span>
        </dd>
      </dl>
      <dl class="bo-cs__tile" data-tile="overrides">
        <dt>Tenant istisnası</dt>
        <dd>
          <span class="bo-cs__value ek-num" data-testid="competition-override-count">{{ cs.comp.phase === 'ready' ? fmtInt(cs.status.overrideCount) : '—' }}</span>
          <span class="bo-cs__sub">{{ cs.comp.phase === 'ready' ? 'müşteride plan değeri geçersiz kılınmış' : 'istisna listesi şu an okunamıyor' }}</span>
        </dd>
      </dl>
    </BoTileGrid>
    <template #footer>
      <p class="bo-cs__note">
        <v-icon icon="mdi-information-outline" aria-hidden="true" />
        Trendyol buybox alanları yerelde doğrulanana kadar özellik kapalı tutulur; açmadan önce pilot müşteri listesini daraltın.
      </p>
    </template>
  </BoSection>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkAlert, EkStatusChip } from '@entegrasyonik/ui/components'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
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
  margin-bottom: var(--ek-space-4);
}
.bo-cs__tile {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
}
.bo-cs__tile dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
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
  font-weight: var(--ek-type-heading-weight);
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
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* ================= BO-LOCAL-01 — rekabet durumu kutuları =================
   Düz yüzey + ince çerçeve; etiket mikro büyük harf, değer büyük rakam (özet şeritleriyle aynı aile). */
.bo-cs__tile {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface);
}

.bo-cs__tile dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-cs__value {
  font-size: var(--ek-type-metric-size, var(--ek-type-heading-size));
  line-height: 1.15;
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: -0.02em;
}

.bo-cs__link {
  font-weight: var(--ek-font-weight-semibold);
}
</style>
