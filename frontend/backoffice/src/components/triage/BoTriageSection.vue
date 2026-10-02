<!--
  BoTriageSection — soru-cevap bölümü (BO_UI_PATTERNS §11.5). Başlık bir SORUDUR ("Müşterilerimde müdahale gereken var
  mı?"), hemen yanında tek kelimelik/kısa CEVAP rozeti ("Evet · 2 kritik" / "Hayır"). Gövde: cevabın kanıtı
  (dikkat listesi, sakin trend). `#tools` yuvası başlığın sağında (ör. aralık seçimi). Bölümler sayfada sorulma sırasıyla dizilir; numara okuma sırasını gösterir.

    <BoTriageSection id="sistem" :index="1" question="Sistemde müdahale gereken var mı?" :health="h" answer="Evet · 1 kritik">
      <BoAttentionList … />
    </BoTriageSection>
-->
<template>
  <section :id="id" class="bo-ts" :aria-labelledby="`${id}-q`" :data-testid="`triage-${id}`">
    <header class="bo-ts__head">
      <span v-if="index" class="bo-ts__index ek-num" aria-hidden="true">{{ index }}</span>
      <component :is="`h${headingLevel}`" :id="`${id}-q`" class="bo-ts__q">{{ question }}</component>
      <EkStatusChip v-if="answer" class="bo-ts__a" :tone="tone" :label="answer" dot data-testid="triage-answer" />
      <span class="bo-ts__spacer"></span>
      <slot name="tools" />
      <RouterLink v-if="more" :to="more.to" class="bo-ts__more">{{ more.label }}<v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
    </header>
    <p v-if="lede" class="bo-ts__lede">{{ lede }}</p>
    <div class="bo-ts__body"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { EkStatusChip, type StatusTone } from '@entegrasyonik/ui/components'
import { HEALTH_BADGE, type Health } from './triage'

const props = withDefaults(
  defineProps<{
    id: string
    question: string
    /** Kısa cevap ("Hayır", "Evet · 2 kritik", "Olağan"). Ton `health`'ten. */
    answer?: string
    health?: Health
    /** Sakin/bilgi bölümleri (büyük resim, kullanım) için nötr ton. */
    calm?: boolean
    index?: number
    lede?: string
    more?: { label: string; to: RouteLocationRaw }
    headingLevel?: 2 | 3
  }>(),
  { health: 'ok', calm: false, headingLevel: 2 },
)

const tone = computed<StatusTone>(() => (props.calm ? 'neutral' : HEALTH_BADGE[props.health].tone))
</script>

<style scoped>
.bo-ts {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-width: 0;
  padding: var(--ek-space-4) var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.bo-ts__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
}

.bo-ts__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  border: 1px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-full);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-ts__q {
  /* BO2-30: bölüm başlığı tek ölçekte `heading` (16/600) — sayfa başlığıyla (h1, `title`) yarışmaz. */
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-type-heading-weight);
  line-height: var(--ek-type-heading-line);
}

.bo-ts__spacer {
  flex: 1;
}

.bo-ts__more {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  text-decoration: none;
}

.bo-ts__more:hover {
  text-decoration: underline;
}

.bo-ts__more:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-ts__more .v-icon {
  font-size: var(--ek-icon-sm);
}

.bo-ts__lede {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

.bo-ts__body {
  min-width: 0;
}

@media (max-width: 600px) {
  .bo-ts {
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  /* Soru kendi satırında (numarayla); cevap rozeti ve bağlantı alt satıra iner — üst üste binme yok. */
  .bo-ts__q {
    flex: 1 1 calc(100% - 22px - var(--ek-space-3));
    min-width: 0;
  }
}
</style>
