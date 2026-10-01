<!--
  Duyuru önizlemesi (previewAnnouncement yanıtı): müşterinin göreceği bant, uygulama içi bildirim ve e-posta. Gönderim yok.
  Dil seçimi: `en` yoksa sunucu `tr`'ye düşer (bant da aynı kuralı izler).
-->
<template>
  <BoSection id="bo-annp" title="Müşteri ne görecek?" description="Gönderim yapılmaz; yalnız önizleme." icon="mdi-eye-outline">
    <template #actions>
      <BoSegmented v-model="locale" label="Önizleme dili" :options="LOCALES" />
    </template>
    <div class="bo-annp">
    <EkPageTabs v-model="tab" :tabs="tabs" label="Önizleme kanalı" dense />

    <StateBlock v-if="!preview" :phase="phase === 'ready' ? 'loading' : phase" :error="error" skeleton="detail" :rows="3" size="compact" @retry="emit('retry')" />
    <div v-else class="bo-annp__body" :aria-busy="refreshing ? 'true' : 'false'">
      <template v-if="tab === 'bant'">
        <p v-if="!channels.banner" class="bo-muted bo-annp__off">Bant kanalı kapalı: bu duyuru uygulamanın üstünde bant olarak görünmez.</p>
        <div class="bo-annp__app" data-testid="banner-preview">
          <EkAlert :tone="ANN_SEVERITY[preview.banner.severity].alert" :title="pick(preview.banner.title)" :text="pick(preview.banner.body)" :icon="ANN_KIND[preview.banner.kind].icon" />
          <p class="bo-muted bo-annp__note">
            {{ preview.banner.dismissible ? 'Kullanıcı bandı kapatabilir.' : 'Bant kapatılamaz (bakım ve olay duyuruları).' }}
            Görünme penceresi: {{ windowText(preview.banner) }}.
          </p>
        </div>
      </template>
      <template v-else-if="tab === 'uygulama'">
        <p v-if="!channels.inApp" class="bo-muted bo-annp__off">Uygulama içi kanal kapalı: bildirim merkezine düşmez.</p>
        <article class="bo-annp__notif" aria-label="Uygulama içi bildirim örneği">
          <v-icon :icon="ANN_KIND[preview.banner.kind].icon" aria-hidden="true" />
          <div>
            <h3 class="bo-annp__notif-title">{{ preview.notification[locale].title }}</h3>
            <p class="bo-annp__notif-msg">{{ preview.notification[locale].message }}</p>
          </div>
        </article>
      </template>
      <template v-else>
        <p v-if="!channels.email" class="bo-muted bo-annp__off">E-posta kanalı kapalı: e-posta gönderilmez.</p>
        <EmailFrame :subject="preview.email[locale].subject" :html="preview.email[locale].html" :text="preview.email[locale].text" />
      </template>
    </div>
    <slot />
    </div>
  </BoSection>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { EkAlert, EkPageTabs, type EkPageTab } from '@entegrasyonik/ui/components'
import type { AnnouncementChannels, AnnouncementPreview, AnnouncementText } from '@bo/api/contract'
import type { DescribedError } from '@bo/utils/errors'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoSegmented, { type BoSegmentOption } from '@bo/components/r2/BoSegmented.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { ANN_KIND, ANN_SEVERITY } from '@bo/utils/labels'
import EmailFrame from './EmailFrame.vue'
import { windowText } from './announcementText'
import '@bo/styles/kit.css'

defineProps<{
  preview: AnnouncementPreview | null
  channels: AnnouncementChannels
  phase: 'loading' | 'ready' | 'error' | 'degraded' | 'notFound' | 'empty'
  error?: DescribedError | null
  refreshing?: boolean
}>()
const emit = defineEmits<{ retry: [] }>()

const LOCALES: Array<BoSegmentOption<'tr' | 'en'>> = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
]
const locale = ref<'tr' | 'en'>('tr')
const tab = ref<'bant' | 'uygulama' | 'eposta'>('bant')
const tabs = computed<EkPageTab[]>(() => [
  { value: 'bant', label: 'Bant', icon: 'mdi-page-layout-header' },
  { value: 'uygulama', label: 'Uygulama içi', icon: 'mdi-bell-outline' },
  { value: 'eposta', label: 'E-posta', icon: 'mdi-email-outline' },
])
const pick = (t: AnnouncementText) => (locale.value === 'en' && t.en) || t.tr
</script>

<style scoped>
.bo-annp {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-width: 0;
}
.bo-annp__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  transition: opacity var(--ek-duration-fast) var(--ek-easing-standard);
}
.bo-annp__body[aria-busy='true'] {
  opacity: 0.6;
}
.bo-annp__off {
  margin: 0;
  font-size: var(--ek-type-caption-size);
}
.bo-annp__app {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3);
  border: 1px dashed var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
}
.bo-annp__note {
  margin: 0;
  font-size: var(--ek-type-caption-size);
}
.bo-annp__notif {
  display: flex;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-raised);
}
.bo-annp__notif .v-icon {
  color: var(--ek-color-content-muted);
}
.bo-annp__notif-title {
  margin: 0;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-annp__notif-msg {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  white-space: pre-line;
}
@media (prefers-reduced-motion: reduce) {
  .bo-annp__body {
    transition: none;
  }
}
</style>
