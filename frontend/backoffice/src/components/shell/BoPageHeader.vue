<!--
  BoPageHeader — HER backoffice sayfasının başlık deseni (BO_UI_PATTERNS §2).
  Breadcrumb (ekran kaydından otomatik) → başlık + durum rozeti (Taslak/Yakında) → tek cümle açıklama → meta satırı
  (ör. "Güncellendi 2 dk önce") ; sağda canlılık hapı (otomatik yenileme + son güncelleme) ve sayfa eylemleri.
  Başlık ve açıklama kayıttan gelir; yalnız detay sayfaları `title`/`lede` verir.
  `refreshable`: sayfa adı yenileme düğmesidir (ayrı Yenile düğmesi gerekmez; Alt+R aynı düğmeye basar).

    <BoPageHeader :updated-at="loadedAt" refreshable :refreshing="loading" @refresh="load" />
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
      <span v-if="icon" class="bo-ph__icon" aria-hidden="true"><v-icon :icon="icon" /></span>
      <div class="bo-ph__titles">
        <div class="bo-ph__title-row">
          <h1 class="bo-ph__title">
            <v-tooltip v-if="refreshable" location="bottom start" :open-delay="400" transition="fade-transition">
              <template #activator="{ props: tip }">
                <button
                  v-bind="tip"
                  type="button"
                  class="bo-ph__title-btn"
                  :class="{ 'is-busy': refreshing }"
                  :aria-label="`${titleText} — yenile (Alt+R)`"
                  :aria-busy="refreshing || undefined"
                  :disabled="refreshing"
                  data-page-refresh
                  data-testid="page-title-refresh"
                  @click="$emit('refresh')"
                >
                  {{ titleText }}<v-icon class="bo-ph__title-refresh" icon="mdi-refresh" aria-hidden="true" />
                </button>
              </template>
              <span class="bo-ph__tip">Yenile <EkKbd :keys="['Alt', 'R']" tone="inverse" /></span>
            </v-tooltip>
            <template v-else>{{ titleText }}</template>
          </h1>
          <EkStatusChip v-if="badge" :tone="badge.tone" :label="badge.text" />
          <slot name="status" />
        </div>
        <p v-if="lede ?? screen?.lede" class="bo-ph__lede">{{ lede ?? screen?.lede }}</p>
        <div v-if="$slots.meta" class="bo-ph__meta"><slot name="meta" /></div>
      </div>
      <!-- Canlılık hapı: otomatik yenileme + son güncelleme tek yerde; bayatsa sarımsı. -->
      <div v-if="updatedAt || autoRefresh" class="bo-ph__live" :class="{ 'is-stale': stale, 'is-auto': !!autoRefresh }">
        <span class="bo-ph__live-dot" aria-hidden="true"></span>
        <span v-if="autoRefresh" class="bo-ph__live-auto" data-testid="page-auto-refresh" :title="`Sekme açıkken ${autoRefresh} sn'de bir yenilenir`">
          Canlı<span class="bo-ph__live-sub"> · {{ autoRefresh }} sn</span><span class="ek-sr-only">: sekme açıkken {{ autoRefresh }} sn'de bir yenilenir</span>
        </span>
        <span v-if="updatedAt" class="bo-ph__live-updated" data-testid="page-updated">
          <template v-if="stale">Yenilenemedi · veri <EkRelativeTime :value="updatedAt" /></template>
          <template v-else>Güncellendi <EkRelativeTime :value="updatedAt" /></template>
        </span>
      </div>
      <div v-if="$slots.actions" class="bo-ph__actions"><slot name="actions" /></div>
      <!-- bo-wdg: otomatik yenileme başarısızlığı kalıcı durum bölgesinde duyurulur (yalnız eski veri; "Güncellendi" her
           turda okunmaz). Bölge hep DOM'da → ilk başarısızlık da duyurulur. -->
      <span class="ek-sr-only" role="status" data-testid="page-stale-live">{{ stale && updatedAt ? 'Sayfa yenilenemedi; gösterilen veri eski.' : '' }}</span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { EkKbd, EkRelativeTime, EkStatusChip } from '@entegrasyonik/ui/components'
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
  /** Başlık ikonu: verilmezse ekran kaydındaki ikon. */
  icon?: string
  hideIcon?: boolean
  /** Sayfa adı yenileme düğmesi olur (`refresh` olayı; `data-page-refresh` → Alt+R). */
  refreshable?: boolean
  refreshing?: boolean
}>()
defineEmits<{ refresh: [] }>()

const route = useRoute()
const screen = computed(() => screenByKey(props.screenKey ?? String(route.meta.screen ?? '')))
const crumbs = computed(() => crumbsFor(screen.value, props.extraCrumbs))
/** BO2-20 (R2): ekranın kayıttaki ikonu başlığın solunda sakin kapsülde — sayfalar arasında tek kimlik dili. */
const icon = computed(() => (props.hideIcon ? undefined : (props.icon ?? screen.value?.icon)))
const titleText = computed(() => props.title ?? screen.value?.label ?? '')
const badge = computed(() => (screen.value && !props.extraCrumbs?.length ? STATUS_BADGE[screen.value.status] : null))
</script>

<style scoped>
.bo-ph {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-1) 0 var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.bo-ph__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  align-self: flex-start;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--ek-color-action-subtle);
  box-shadow: inset 0 0 0 1px var(--ek-color-action-border), var(--ek-shadow-sm);
  color: var(--ek-color-action-emphasis);
}

.bo-ph__icon .v-icon {
  font-size: 24px;
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
  align-items: center;
  gap: var(--ek-space-3) var(--ek-space-4);
}

.bo-ph__titles {
  display: flex;
  flex: 1 1 360px;
  flex-direction: column;
  gap: 4px;
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
  font-size: 26px;
  line-height: 32px;
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: -0.02em;
}

/* Yenilenebilir başlık: görünüşte düz başlık; üzerine gelince yenile ikonu belirir, yenilerken döner. */
.bo-ph__title-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 0 -6px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-ph__title-btn:hover {
  background: var(--ek-color-surface-muted);
}

.bo-ph__title-btn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-ph__title-btn:disabled {
  cursor: progress;
}

.bo-ph__title-refresh {
  color: var(--ek-color-content-muted);
  font-size: 20px;
  opacity: 0;
  transition: opacity var(--ek-motion-feedback);
}

.bo-ph__title-btn:hover .bo-ph__title-refresh,
.bo-ph__title-btn:focus-visible .bo-ph__title-refresh,
.bo-ph__title-btn.is-busy .bo-ph__title-refresh {
  opacity: 1;
}

.bo-ph__title-btn.is-busy .bo-ph__title-refresh {
  animation: bo-ph-spin 0.9s linear infinite;
}

@keyframes bo-ph-spin {
  to {
    transform: rotate(360deg);
  }
}

.bo-ph__tip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

/* Canlılık hapı: otomatik yenileme + son güncelleme. */
.bo-ph__live {
  --live: var(--ek-color-content-subtle);
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
  height: 32px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-sm);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

.bo-ph__live.is-auto {
  --live: var(--ek-color-success);
}

.bo-ph__live.is-stale {
  --live: var(--bo-warn-fill);
  border-color: color-mix(in srgb, var(--bo-warn-fill) 40%, var(--ek-color-border-subtle));
  background: var(--bo-warn-wash);
  color: var(--ek-color-content-default);
}

.bo-ph__live-dot {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--live);
}

.bo-ph__live.is-auto:not(.is-stale) .bo-ph__live-dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  animation: bo-ph-live 2.4s ease-out infinite;
}

@keyframes bo-ph-live {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--live) 45%, transparent);
  }
  70%,
  100% {
    box-shadow: 0 0 0 6px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bo-ph__live-dot::after,
  .bo-ph__title-btn.is-busy .bo-ph__title-refresh {
    animation: none !important;
  }
}

.bo-ph__live-auto {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-ph__live-sub {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.bo-ph__live-auto + .bo-ph__live-updated {
  padding-left: var(--ek-space-2);
  border-left: 1px solid var(--ek-color-border-subtle);
}

.bo-ph__lede {
  max-width: 80ch;
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
  margin-top: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-ph__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin-left: auto;
}

@media (max-width: 600px) {
  /* Dar ekranda dikey alan değerli: kimlik ikonu menüde zaten var. */
  .bo-ph__icon {
    display: none;
  }

  .bo-ph__actions {
    margin-left: 0;
  }

  .bo-ph__title {
    font-size: 22px;
    line-height: 28px;
  }
}

/* ================= BO-LOCAL-01 — sayfa başlığı: uygulamanın tasarım diliyle =================
   Kompakt başlık: ikon çerçeveli köşeli kutu (gölge yok), başlık bir kademe küçük; kırıntı mikro etiket + kısa eylem
   çizgisi (bölüm başlıklarıyla aynı). Canlılık göstergesi köşeli, gölgesiz, çerçeveli. */
.bo-ph__icon {
  width: 40px;
  height: 40px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  box-shadow: none;
}

.bo-ph__icon .v-icon {
  font-size: var(--ek-icon-md);
}

.bo-ph__crumbs ol {
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-ph__crumbs ol::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
  align-self: center;
  margin-right: var(--ek-space-1);
}

.bo-ph__title {
  font-size: var(--ek-type-title-size, 20px);
  line-height: 1.25;
  letter-spacing: -0.015em;
}

.bo-ph__title-refresh {
  font-size: var(--ek-icon-sm);
}

.bo-ph__lede {
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.bo-ph__live {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  box-shadow: none;
}

.bo-ph__live.is-stale {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
}
</style>
