<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="cfg.loadedAt ?? undefined">
      <template #actions>
        <BoAction kind="refresh" :loading="cfg.refreshing || cs.comp.refreshing || cfg.phase === 'loading'" data-page-refresh @click="state.load()" />
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
        <!-- DURUM her zaman görünür (K51); karar/eylem ve ayrıntı sekmelerde (BO2-70) -->
        <CompetitionStatusPanel :cs="cs" />

        <BoTabs :tabs="TABS" label="Rekabet ayarları bölümleri">
          <template #default="{ tab }">
            <CompetitionPlansPanel v-if="tab === 'planlar'" :cs="cs" />
            <CompetitionOverridesPanel v-else-if="tab === 'istisnalar'" :cs="cs" />
            <!-- PRC-R2: fiyat kuralları kill-switch + toplam istatistik (tenant verisi yok) -->
            <PricingRulesPanel v-else-if="tab === 'fiyat-kurallari'" :cfg="cfg" />
            <template v-else>
              <!-- AYRINTI: geçmiş ve denetim -->
              <HistoryPanel :cfg="cfg" />
              <BoSection id="bo-cs-audit" title="Denetim" description="Hangi değişiklik nerede görünür?" icon="mdi-shield-search" data-testid="competition-audit-note">
                <ul class="bo-audit-note">
                  <li><strong>Plan, bütçe ve gölge mod:</strong> yukarıdaki yayın geçmişinde (gerekçe, yayınlayan, fark) ve geri alınabilir.</li>
                  <li>
                    <strong>Müşteri istisnası:</strong> müşterinin abonelik olaylarında “subscription.competition_override” (önce/sonra, gerekçe) ve
                    <RouterLink :to="{ path: '/denetim', query: { event: 'backoffice.write' } }">denetim kaydında</RouterLink> “backoffice.write” olarak görünür.
                  </li>
                </ul>
              </BoSection>
            </template>
          </template>
        </BoTabs>
      </div>
    </StateBlock>

    <PublishDialogs :cfg="cfg" :publish="platformState.publish" :rollback="platformState.rollback" />
    <OverrideDialog :cs="cs" :save="state.save" />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTabs from '@bo/components/r2/BoTabs.vue'
import { onMounted, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton } from '@entegrasyonik/ui/components'
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

/** BO2-70: Durum üstte sabit; plan / istisna / fiyat kuralı / geçmiş sekmelerde (`?sekme=`, varsayılan Planlar URL'e yazılmaz). */
const TABS = [
  { value: 'planlar', label: 'Plan varsayılanları', icon: 'mdi-view-list-outline' },
  { value: 'istisnalar', label: 'Müşteri istisnaları', icon: 'mdi-account-cog-outline' },
  { value: 'fiyat-kurallari', label: 'Fiyat kuralları', icon: 'mdi-tag-multiple-outline' },
  { value: 'gecmis', label: 'Geçmiş ve denetim', icon: 'mdi-history' },
]

// Bağlantı: /sistem/rekabet?tid=101 → istisna diyaloğu o müşteriyle açılır (müşteri/abonelik detayından). Sorgu bir kez tüketilir.
const route = useRoute()
const router = useRouter()
function consumeTid() {
  const id = parseTidParam(route.query.tid)
  if (id === null) return
  cs.openEditor(id)
  void router.replace({ query: { ...route.query, tid: undefined, sekme: 'istisnalar' } }) // sonuç şeridi istisnalar sekmesinde
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
  gap: var(--ek-space-5);
}
.bo-draftbar {
  margin-bottom: var(--ek-space-4);
}
.bo-audit-note {
  margin: 0;
  padding-left: var(--ek-space-5);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
}
.bo-audit-note li + li {
  margin-top: var(--ek-space-2);
}
</style>
