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

      <DraftBar :cfg="cfg" />

      <BoTabs :tabs="TABS" label="Sistem ayarları bölümleri" class="bo-settings">
        <template #default="{ tab }">
          <PlatformSettingsPanel v-if="tab === 'ayarlar'" :cfg="cfg" />
          <MaintenanceCard v-else-if="tab === 'bakim'" :cfg="cfg" />
          <FeatureFlagsPanel v-else-if="tab === 'bayraklar'" :cfg="cfg" />
          <EnvPanel v-else-if="tab === 'ortam'" />
          <HistoryPanel v-else :cfg="cfg" />
        </template>
      </BoTabs>
    </StateBlock>

    <PublishDialogs :cfg="cfg" :publish="state.publish" :rollback="state.rollback" />
    <EkConfirmDialog
      v-model="leave.open.value"
      :title="LEAVE_DIALOG.title"
      :description="`Kaydedilmemiş ya da yayınlanmamış ${cfg.changedKeys.length} ayar değişikliği bu sayfadan çıkınca kaybolur. Bu işlem geri alınamaz.`"
      :confirm-label="LEAVE_DIALOG.confirmLabel"
      :cancel-label="LEAVE_DIALOG.cancelLabel"
      danger
      @confirm="leave.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoTabs from '@bo/components/r2/BoTabs.vue'
import { computed, nextTick, onMounted, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { EkAlert, EkConfirmDialog } from '@entegrasyonik/ui/components'
import { LEAVE_DIALOG, useLeaveGuard } from '@bo/composables/useLeaveGuard'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { usePlatformConfig } from './usePlatformConfig'
import MaintenanceCard from './MaintenanceCard.vue'
import PlatformSettingsPanel from './PlatformSettingsPanel.vue'
import FeatureFlagsPanel from './FeatureFlagsPanel.vue'
import EnvPanel from './EnvPanel.vue'
import HistoryPanel from './HistoryPanel.vue'
import PublishDialogs from './PublishDialogs.vue'
import DraftBar from './DraftBar.vue'
import { settingsVerdict } from './settingsVerdict'
import '@bo/styles/kit.css'

const state = usePlatformConfig()
const cfg = reactive(state)
/** BO-WDG: yayınlanmamış değişiklikle ayrılırken (gezinti / sekme kapatma) sorar. */
const leave = useLeaveGuard(() => cfg.changedKeys.length > 0)

/** BO2-70: uzun sayfa sekmelere bölünür (`?sekme=`); varsayılan sekme (Platform ayarları) URL'e yazılmaz. */
const TABS = [
  { value: 'ayarlar', label: 'Platform ayarları', icon: 'mdi-tune-variant' },
  { value: 'bakim', label: 'Bakım modu', icon: 'mdi-wrench-clock' },
  { value: 'bayraklar', label: 'Özellik bayrakları', icon: 'mdi-flag-outline' },
  { value: 'ortam', label: 'Ortam', icon: 'mdi-server-outline' },
  { value: 'gecmis', label: 'Yayın geçmişi', icon: 'mdi-history' },
]
/**
 * Hüküm bağlantıları `#bakim` / `#taslak` / `#gecmis` / `#ayarlar` konumudur (BO_UI_PATTERNS §11.6). Bölüm artık bir sekmede
 * olduğundan bağlantı önce ilgili sekmeyi açar (`?sekme=`), sonra bölüm başlığına odaklanır.
 */
const ANCHORS: Record<string, { selector: string; tab?: string }> = {
  '#bakim': { selector: '#bo-maint-title', tab: 'bakim' },
  '#taslak': { selector: '[data-testid="draft-bar"]' },
  '#gecmis': { selector: '#bo-hist-title', tab: 'gecmis' },
  '#ayarlar': { selector: '#bo-plat-title', tab: 'ayarlar' },
}
const route = useRoute()
async function focusAnchor() {
  const anchor = ANCHORS[route.hash]
  if (!anchor) return
  await nextTick()
  await nextTick()
  const el = document.querySelector<HTMLElement>(anchor.selector)
  if (!el) return
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.scrollIntoView({ block: 'start' })
  el.focus({ preventScroll: true })
}
watch(() => route.fullPath, () => void focusAnchor())
const at = (hash: string) => {
  const tab = ANCHORS[hash]?.tab
  return { hash, query: { ...route.query, sekme: tab && tab !== 'ayarlar' ? tab : undefined } }
}

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
</style>
