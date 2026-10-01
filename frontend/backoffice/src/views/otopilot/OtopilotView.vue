<!--
  Otopilot tam sayfa (backoffice, BO2-P3). Yan panelle AYNI denetleyici: geçişte konuşma sürer.
  R2: sohbet sayfa genişliğini kullanır (`wide`: UI parçaları 1180 px'e kadar, düz metin ≤ 80ch, dar kapta tablolar kart satır →
  yatay kaydırma yok). ≥ 1600 px sağda yardımcı sütun (daha dar ekranda sohbet tüm genişliği alır; öneriler boş durumda): "Ne sorabilirsiniz" (tek dokunuşla gönderir) + "Nasıl çalışır" + durum.
  Sohbet görünür alanı doldurur (sayfa kaymaz, yalnız konuşma kayar).
-->
<template>
  <div class="bo-page bo-otopilot-page">
    <BoPageHeader>
      <template #status>
        <EkStatusChip v-if="verdict" :tone="chipTone" :label="statusLabel" data-testid="otopilot-status" />
      </template>
      <template v-if="link" #meta>
        <RouterLink :to="link" class="bo-otopilot-page__link">Otopilot ayarını aç</RouterLink>
      </template>
    </BoPageHeader>

    <div class="bo-otopilot-page__layout">
      <div class="bo-otopilot-page__panel">
        <ChatPanel ref="panelRef" :controller="otopilot.controllerRef.value" mode="page" wide :show-close="false" @collapse="otopilot.collapseToSide()" />
      </div>

      <aside class="bo-otopilot-page__rail" aria-label="Otopilot yardımı" data-testid="otopilot-rail">
        <BoSection title="Ne sorabilirsiniz" description="Bir soruya dokunun; Otopilot hemen yanıtlar." :heading-level="2">
          <div v-for="g in PROMPT_GROUPS" :key="g.id" class="bo-otopilot-page__group">
            <p class="bo-otopilot-page__group-title">
              <v-icon :icon="g.icon" aria-hidden="true" />
              {{ g.label }}
            </p>
            <ul class="bo-otopilot-page__prompts" role="list">
              <li v-for="p in g.prompts" :key="p">
                <button type="button" class="bo-otopilot-page__prompt" :disabled="!canCompose" data-testid="otopilot-prompt" @click="ask(p)">
                  <span>{{ p }}</span>
                  <v-icon icon="mdi-arrow-up" aria-hidden="true" />
                </button>
              </li>
            </ul>
          </div>
        </BoSection>

        <BoSection title="Nasıl çalışır" :heading-level="2">
          <ul class="bo-otopilot-page__facts" role="list">
            <li v-for="f in FACTS" :key="f.title">
              <span class="bo-otopilot-page__fact-icon" aria-hidden="true"><v-icon :icon="f.icon" /></span>
              <span>
                <strong>{{ f.title }}</strong>
                <span class="bo-otopilot-page__fact-body">{{ f.body }}</span>
              </span>
            </li>
          </ul>
          <template #footer>
            <BoAction kind="detail" label="Otopilot ayarı" size="sm" :to="SETTINGS_ROUTE" />
          </template>
        </BoSection>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { EkStatusChip } from '@entegrasyonik/ui/components'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import { otopilot } from '@bo/chat/otopilot'
import { otopilotVerdict, SETTINGS_ROUTE } from './otopilotVerdict'

const ChatPanel = defineAsyncComponent(() => import('@entegrasyonik/chat').then((m) => m.ChatPanel))
const panelRef = ref<{ focusComposer: () => void } | null>(null)

/** Yönetim sohbeti için örnek sorular (salt okuma; platform kapsamı). Sunucu kendi önerilerini boş durumda ayrıca verir. */
const PROMPT_GROUPS = [
  { id: 'health', label: 'Platform sağlığı', icon: 'mdi-heart-pulse', prompts: ['Şu an müdahale gereken bir şey var mı?', 'Son 24 saatte 5xx hata oranı nasıl?'] },
  { id: 'engine', label: 'Kuyruklar ve işler', icon: 'mdi-cog-sync-outline', prompts: ['Başarısız işlerin en sık nedeni ne?', 'Hangi kuyrukta bekleyen iş birikiyor?'] },
  { id: 'tenants', label: 'Müşteriler', icon: 'mdi-storefront-outline', prompts: ['Deneme süresi bu hafta biten müşteriler', 'Kullanımı en çok düşen müşteriler'] },
] as const

const FACTS = [
  { icon: 'mdi-eye-outline', title: 'Yalnız okur', body: 'Platform verisini okur; işlem önermez ve hiçbir şeyi değiştirmez.' },
  { icon: 'mdi-shield-lock-outline', title: 'Kaydedilmez', body: 'Konuşma oturum kapanınca silinir; geçmiş tutulmaz.' },
  { icon: 'mdi-dock-right', title: 'Her ekranda yanınızda', body: 'Yan panelde açtığınızda bulunduğunuz ekranı bağlam olarak alır (Ctrl+J).' },
] as const

const controller = computed(() => otopilot.controllerRef.value)
const canCompose = computed(() => controller.value.canCompose.value)
const verdict = computed(() => {
  const m = controller.value.machine.value
  return otopilotVerdict({ status: m.status, unavailableReason: m.unavailableReason, errorCode: m.error?.code, retry: () => void otopilot.controller().ensureLoaded(true) })
})
const chipTone = computed(() => {
  const t = verdict.value?.tone
  return t === 'success' || t === 'error' || t === 'warning' ? t : 'info'
})
const statusLabel = computed(() => (verdict.value?.tone === 'success' ? 'Etkin' : verdict.value?.summary ?? ''))
/** Yalnız anahtar sorunlarında ayara bağlantı (hükmün ilk maddesinin hedefi). */
const link = computed(() => verdict.value?.attention.find((a) => a.to)?.to ?? null)

function ask(text: string) {
  if (controller.value.send(text)) panelRef.value?.focusComposer()
}

onMounted(() => void otopilot.controller().ensureLoaded())
</script>

<style scoped>
.bo-otopilot-page {
  /* Sohbet görünür alanı doldurur: sayfa üst bar altındaki yüksekliğe sabitlenir, sohbet kalan alanı alır (sayfa kaymaz). */
  box-sizing: border-box;
  height: calc(100dvh - var(--ek-app-topbar-height));
  min-height: 560px;
}
.bo-otopilot-page__link {
  color: var(--ek-color-content-strong);
  text-decoration: underline;
}
.bo-otopilot-page__layout {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ek-space-5);
  min-height: 0;
}
.bo-otopilot-page__panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-sm);
  overflow: hidden;
}
.bo-otopilot-page__rail {
  display: none;
}
@media (min-width: 1600px) {
  .bo-otopilot-page__layout {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
  .bo-otopilot-page__rail {
    display: flex;
    flex-direction: column;
    gap: var(--ek-space-4);
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }
}
.bo-otopilot-page__group + .bo-otopilot-page__group {
  margin-top: var(--ek-space-4);
}
.bo-otopilot-page__group-title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  line-height: var(--ek-type-micro-line);
  text-transform: uppercase;
}
.bo-otopilot-page__group-title .v-icon {
  font-size: var(--ek-icon-sm);
}
.bo-otopilot-page__prompts {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-otopilot-page__prompt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 40px;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-label-line);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--ek-motion-feedback),
    border-color var(--ek-motion-feedback);
}
.bo-otopilot-page__prompt .v-icon {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}
.bo-otopilot-page__prompt:hover:not(:disabled) {
  border-color: var(--ek-color-action-default);
  background: var(--ek-color-action-subtle);
}
.bo-otopilot-page__prompt:hover:not(:disabled) .v-icon {
  color: var(--ek-color-action-emphasis);
}
.bo-otopilot-page__prompt:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}
.bo-otopilot-page__prompt:disabled {
  color: var(--ek-color-content-muted);
  cursor: not-allowed;
}
.bo-otopilot-page__facts {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-otopilot-page__facts li {
  display: flex;
  gap: var(--ek-space-3);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}
.bo-otopilot-page__facts strong {
  display: block;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
}
.bo-otopilot-page__fact-body {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
.bo-otopilot-page__fact-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
}
.bo-otopilot-page__fact-icon .v-icon {
  font-size: var(--ek-icon-sm);
}
@media (pointer: coarse) {
  .bo-otopilot-page__prompt {
    min-height: 44px;
  }
}
@media (max-width: 767px) {
  .bo-otopilot-page {
    min-height: 480px;
    padding-bottom: 0;
  }
  .bo-otopilot-page__panel {
    margin: 0 calc(-1 * var(--ek-space-3));
    border-right: 0;
    border-left: 0;
    border-radius: 0;
    box-shadow: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bo-otopilot-page__prompt {
    transition: none;
  }
}
</style>
