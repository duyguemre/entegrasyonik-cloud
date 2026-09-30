<template>
  <div class="bo-page">
    <div class="bo-page__head">
      <div>
        <h1 class="bo-page__title">Sistem ayarları</h1>
        <p class="bo-page__lede">Bakım modu, destek ve duyuru ayarları, özellik bayrakları ve ortam bilgisi. Ayarlar taslak → önizleme → gerekçeli yayın sırasıyla değişir; her yayın geri alınabilir.</p>
      </div>
      <EkRefreshButton :loading="cfg.refreshing || cfg.phase === 'loading'" @refresh="cfg.load()" />
    </div>

    <StateBlock :phase="cfg.phase" :error="cfg.error" skeleton="form" :rows="6" error-title="Sistem ayarları yüklenemedi" degraded-title="Ayar servisi şu an kullanılamıyor" @retry="cfg.load()">
      <EkAlert v-if="cfg.stale" tone="warning" dense title="Gösterilen veri eski olabilir" text="Son yenileme başarısız oldu; yenilemeyi yeniden deneyin." />

      <EkAlert v-if="cfg.hasDraft" tone="info" live dense class="bo-draftbar" data-testid="draft-bar" title="Yayınlanmamış taslak var" :text="`${cfg.preview ? cfg.preview.diff.length + ' ayar değişecek. ' : ''}Yayınlanana kadar müşteri uygulaması bundan etkilenmez.`">
        <template #actions>
          <EkButton size="sm" tone="primary" :disabled="!cfg.preview" @click="cfg.publish.open({})">Önizle ve yayınla</EkButton>
          <EkButton size="sm" tone="secondary" :loading="cfg.discarding" data-testid="discard-draft" @click="cfg.discard()">Vazgeç</EkButton>
        </template>
      </EkAlert>

      <div class="bo-settings">
        <MaintenanceCard :cfg="cfg" />
        <PlatformSettingsPanel :cfg="cfg" />
        <FeatureFlagsPanel :cfg="cfg" />
        <EnvPanel />
        <HistoryPanel :cfg="cfg" />
      </div>
    </StateBlock>

    <PublishDialogs :cfg="cfg" :publish="state.publish" :rollback="state.rollback" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { EkAlert, EkButton, EkRefreshButton } from '@entegrasyonik/ui/components'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { usePlatformConfig } from './usePlatformConfig'
import MaintenanceCard from './MaintenanceCard.vue'
import PlatformSettingsPanel from './PlatformSettingsPanel.vue'
import FeatureFlagsPanel from './FeatureFlagsPanel.vue'
import EnvPanel from './EnvPanel.vue'
import HistoryPanel from './HistoryPanel.vue'
import PublishDialogs from './PublishDialogs.vue'
import '@bo/styles/kit.css'

const state = usePlatformConfig()
const cfg = reactive(state)
onMounted(() => cfg.load())
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
</style>
