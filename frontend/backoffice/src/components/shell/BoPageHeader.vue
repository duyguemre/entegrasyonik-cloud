<!--
  BoPageHeader — HER backoffice sayfasının başlık deseni (BO_UI_PATTERNS §2).
  Breadcrumb (ekran kaydından otomatik) → başlık + durum rozeti (Taslak/Yakında) → tek cümle açıklama → meta satırı
  (ör. "Güncellendi 2 dk önce") ; sağda sayfa eylemleri (Yenile her zaman en sağda). Başlık ve açıklama kayıttan gelir;
  yalnız detay sayfaları `title`/`lede` verir.

    <BoPageHeader :updated-at="loadedAt">
      <template #actions><EkButton icon="mdi-refresh" @click="load">Yenile</EkButton></template>
    </BoPageHeader>
-->
<template>
  <header class="bo-ph">
    <nav v-if="crumbs.length > 1" class="bo-ph__crumbs" aria-label="Konum">
      <ol>
        <li v-for="(c, i) in crumbs" :key="`${i}-${c.label}`">
          <RouterLink v-if="c.to && i < crumbs.length - 1" :to="c.to" class="bo-ph__crumb-link">{{ c.label }}</RouterLink>
          <span v-else :aria-current="i === crumbs.length - 1 ? 'page' : undefined" :class="{ 'bo-ph__crumb-current': i === crumbs.length - 1 }">{{ c.label }}</span>
          <v-icon v-if="i < crumbs.length - 1" class="bo-ph__sep" icon="mdi-chevron-right" aria-hidden="true" />
        </li>
      </ol>
    </nav>
    <div class="bo-ph__row">
      <div class="bo-ph__titles">
        <div class="bo-ph__title-row">
          <h1 class="bo-ph__title">{{ title ?? screen?.label }}</h1>
          <EkStatusChip v-if="badge" :tone="badge.tone" :label="badge.text" />
          <slot name="status" />
        </div>
        <p v-if="lede ?? screen?.lede" class="bo-ph__lede">{{ lede ?? screen?.lede }}</p>
        <div v-if="$slots.meta || updatedAt || autoRefresh" class="bo-ph__meta">
          <slot name="meta" />
          <span v-if="autoRefresh" class="bo-ph__updated" data-testid="page-auto-refresh">
            <v-icon icon="mdi-autorenew" aria-hidden="true" />Sekme açıkken {{ autoRefresh }} sn'de bir yenilenir
          </span>
          <span v-if="updatedAt" class="bo-ph__updated" :class="{ 'is-stale': stale }" data-testid="page-updated">
            <v-icon :icon="stale ? 'mdi-alert-circle-outline' : 'mdi-clock-outline'" aria-hidden="true" />
            <template v-if="stale">Yenilenemedi — gösterilen veri <EkRelativeTime :value="updatedAt" /> alındı</template>
            <template v-else>Güncellendi <EkRelativeTime :value="updatedAt" /></template>
          </span>
        </div>
      </div>
      <div v-if="$slots.actions" class="bo-ph__actions"><slot name="actions" /></div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { EkRelativeTime, EkStatusChip } from '@entegrasyonik/ui/components'
import { STATUS_BADGE, crumbsFor, screenByKey, type Crumb } from '@bo/navigation/screens'

const props = defineProps<{
  /** Kayıt anahtarı; verilmezse rotanın `meta.screen` değeri. */
  screenKey?: string
  title?: string
  lede?: string
  /** Detay sayfaları: ekranın altına eklenen breadcrumb düzeyleri (son düzey = bu sayfa). */
  extraCrumbs?: Crumb[]
  updatedAt?: number | string
  /** Son yenileme başarısız; ekrandaki veri `updatedAt` anından (BO-ELEV DG-3: bozulma dürüsttür). */
  stale?: boolean
  /** NT-09 (TX-2): otomatik yenileme aralığı (sn) — tek metin "Sekme açıkken 30 sn'de bir yenilenir". */
  autoRefresh?: number
}>()

const route = useRoute()
const screen = computed(() => screenByKey(props.screenKey ?? String(route.meta.screen ?? '')))
const crumbs = computed(() => crumbsFor(screen.value, props.extraCrumbs))
const badge = computed(() => (screen.value && !props.extraCrumbs?.length ? STATUS_BADGE[screen.value.status] : null))
</script>

<style scoped>
.bo-ph {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.bo-ph__crumbs ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.bo-ph__crumbs li {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-width: 0;
}

.bo-ph__crumb-link {
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-content-muted);
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.bo-ph__crumb-link:hover {
  color: var(--ek-color-content-strong);
}

.bo-ph__crumb-link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-ph__crumb-current {
  overflow: hidden;
  max-width: 40ch;
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-ph__sep {
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-xs);
}

.bo-ph__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ek-space-3) var(--ek-space-6);
}

.bo-ph__titles {
  display: flex;
  flex: 1 1 420px;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.bo-ph__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
}

.bo-ph__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: -0.01em;
}

.bo-ph__lede {
  max-width: 88ch;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.bo-ph__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-4);
  margin-top: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-ph__updated {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.bo-ph__updated.is-stale {
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-font-weight-medium);
}

.bo-ph__updated .v-icon {
  font-size: var(--ek-icon-xs);
}

.bo-ph__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}
</style>
