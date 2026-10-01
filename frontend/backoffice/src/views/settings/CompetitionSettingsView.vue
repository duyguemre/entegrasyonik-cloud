<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="cfg.loadedAt ?? undefined">
      <template #actions>
        <EkRefreshButton :loading="cfg.refreshing || cs.comp.refreshing || cfg.phase === 'loading'" @refresh="state.load()" />
      </template>
    </BoPageHeader>

    <StateBlock :phase="cfg.phase" :error="cfg.error" skeleton="form" :rows="6" error-title="Rekabet ayarları yüklenemedi" degraded-title="Ayar servisi şu an kullanılamıyor" @retry="state.load()">
      <EkAlert v-if="cfg.stale" tone="warning" dense title="Gösterilen veri eski olabilir" text="Son yenileme başarısız oldu; yenilemeyi yeniden deneyin." />

      <EkAlert v-if="cfg.hasDraft" tone="info" live dense class="bo-draftbar" data-testid="draft-bar" title="Yayınlanmamış taslak var" :text="`${cfg.preview ? cfg.preview.diff.length + ' ayar değişecek. ' : ''}Yayınlanana kadar müşteri uygulaması bundan etkilenmez.`">
        <template #actions>
          <EkButton size="sm" tone="primary" :disabled="!cfg.preview" @click="cfg.publish.open({})">Önizle ve yayınla</EkButton>
          <EkButton size="sm" tone="secondary" :loading="cfg.discarding" data-testid="discard-draft" @click="cfg.discard()">Vazgeç</EkButton>
        </template>
      </EkAlert>

      <div class="bo-settings">
        <CompetitionStatusPanel :cs="cs" />
        <!-- PRC-R2: fiyat kuralları kill-switch + toplam istatistik (tenant verisi yok) -->
        <PricingRulesPanel :cfg="cfg" />
        <CompetitionPlansPanel :cs="cs" />
        <CompetitionOverridesPanel :cs="cs" />

        <!-- AYRINTI: geçmiş ve denetim -->
        <HistoryPanel :cfg="cfg" />
        <EkCard title="Denetim" subtitle="Hangi değişiklik nerede görünür?" icon="mdi-shield-search" :heading-level="2" data-testid="competition-audit-note">
          <ul class="bo-audit-note">
            <li><strong>Plan, bütçe ve gölge mod:</strong> yukarıdaki yayın geçmişinde (gerekçe, yayınlayan, fark) ve geri alınabilir.</li>
            <li>
              <strong>Müşteri istisnası:</strong> müşterinin abonelik olaylarında “subscription.competition_override” (önce/sonra, gerekçe) ve
              <RouterLink :to="{ path: '/denetim', query: { event: 'backoffice.write' } }">denetim kaydında</RouterLink> “backoffice.write” olarak görünür.
            </li>
          </ul>
        </EkCard>
      </div>
    </StateBlock>

    <PublishDialogs :cfg="cfg" :publish="platformState.publish" :rollback="platformState.rollback" />
    <OverrideDialog :cs="cs" :save="state.save" />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import { onMounted, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton, EkCard, EkRefreshButton } from '@entegrasyonik/ui/components'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { usePlatformConfig } from './usePlatformConfig'
import { useCompetition } from './useCompetition'
import { parseTidParam } from './competitionLogic'
import CompetitionStatusPanel from './CompetitionStatusPanel.vue'
import CompetitionPlansPanel from './CompetitionPlansPanel.vue'
import CompetitionOverridesPanel from './CompetitionOverridesPanel.vue'
import PricingRulesPanel from './PricingRulesPanel.vue'
import OverrideDialog from './OverrideDialog.vue'
import HistoryPanel from './HistoryPanel.vue'
import PublishDialogs from './PublishDialogs.vue'
import '@bo/styles/kit.css'

const platformState = usePlatformConfig()
const cfg = reactive(platformState)
const state = useCompetition(cfg)
const cs = reactive(state)

// Bağlantı: /sistem/rekabet?tid=101 → istisna diyaloğu o müşteriyle açılır (müşteri/abonelik detayından). Sorgu bir kez tüketilir.
const route = useRoute()
const router = useRouter()
function consumeTid() {
  const id = parseTidParam(route.query.tid)
  if (id === null) return
  cs.openEditor(id)
  void router.replace({ query: { ...route.query, tid: undefined } })
}
onMounted(async () => {
  await state.load()
  consumeTid()
})
watch(
  () => route.query.tid,
  (v) => {
    if (v !== undefined && cs.comp.phase === 'ready') consumeTid()
  },
)
</script>

<style scoped>
.bo-settings {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}
.bo-draftbar {
  margin-bottom: var(--ek-space-4);
}
.bo-audit-note {
  margin: 0;
  padding-left: var(--ek-space-5);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}
.bo-audit-note li + li {
  margin-top: var(--ek-space-2);
}
</style>
