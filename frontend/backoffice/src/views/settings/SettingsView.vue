<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="cfg.loadedAt ?? undefined" :stale="cfg.stale">
      <template #actions>
        <BoAction kind="refresh" :loading="cfg.refreshing || cfg.phase === 'loading'" data-page-refresh @click="cfg.load()" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

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
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import { computed, nextTick, onMounted, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { EkAlert, EkButton } from '@entegrasyonik/ui/components'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { usePlatformConfig } from './usePlatformConfig'
import MaintenanceCard from './MaintenanceCard.vue'
import PlatformSettingsPanel from './PlatformSettingsPanel.vue'
import FeatureFlagsPanel from './FeatureFlagsPanel.vue'
import EnvPanel from './EnvPanel.vue'
import HistoryPanel from './HistoryPanel.vue'
import PublishDialogs from './PublishDialogs.vue'
import { settingsVerdict } from './settingsVerdict'
import '@bo/styles/kit.css'

const state = usePlatformConfig()
const cfg = reactive(state)

/** Hüküm bağlantıları `#bakim` / `#taslak` / `#gecmis` / `#ayarlar` konumudur (BO_UI_PATTERNS §11.6). */
const ANCHORS: Record<string, string> = { '#bakim': '#bo-maint-title', '#taslak': '[data-testid="draft-bar"]', '#gecmis': '#bo-hist-title', '#ayarlar': '#bo-plat-title' }
const route = useRoute()
async function focusAnchor() {
  const selector = ANCHORS[route.hash]
  if (!selector) return
  await nextTick()
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) return
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.scrollIntoView({ block: 'start' })
  el.focus({ preventScroll: true })
}
watch(() => route.fullPath, () => void focusAnchor())
const at = (hash: string) => ({ hash, query: route.query })

const verdict = computed(() =>
  cfg.phase === 'loading' && !cfg.data
    ? null
    : settingsVerdict({
        data: cfg.data ? { published: cfg.data.published, values: cfg.data.values, history: cfg.data.history } : null,
        stale: cfg.stale,
        hasDraft: cfg.hasDraft,
        draftCount: cfg.preview ? cfg.preview.diff.length : null,
        unsavedCount: cfg.changedKeys.length,
        now: Date.now(),
        retry: () => void cfg.load(),
        to: { maintenance: at('#bakim'), draft: at('#taslak'), history: at('#gecmis'), settings: at('#ayarlar') },
        closeMaintenance: () => {
          cfg.form['maintenance.enabled'] = false
          void nextTick(() => cfg.saveAndPreview())
        },
        publish: () => cfg.publish.open({}),
      }),
)

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
