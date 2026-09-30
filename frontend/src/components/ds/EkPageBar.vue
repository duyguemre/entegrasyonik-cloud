<!--
  frontend/src/components/ds/EkPageBar.vue

  DS-v2 Aşama 5 — TÜM sayfaların tek başlık deseni (kullanıcı geri bildirimi madde 1 + 6). Büyük "başlık + açıklama"
  bloğu kalktı; hiyerarşi: üst bar → sekme şeridi → BU SATIR → filtre → içerik.

    [Bölüm ›] H1 Sayfa adı (i) · meta ......................................... [#actions]
    ╰─ (i) → yumuşak açılan "Sayfa hakkında" paneli: Amaç (açıklama) · İpuçları · Kısayollar

  - Sayfada TEK H1 burasıdır (breadcrumb'ın son halkası = sayfa adı; bölüm tıklanabilir DEĞİL — Karar 2.3).
  - Panel varsayılan KAPALI; tercih tüm sayfalarda ortak ve hatırlanır (`usePageAbout`). Geçiş `EkCollapse`.
  - `meta`: açıklama değil DURUM metni (ör. "Son güncelleme 14:02") — başlık satırında küçük, her zaman görünür.
  - Kısayollar kabuk kaydından (`navigation/shortcuts.ts`); "Tüm kısayollar" `ek:shortcut-help` olayıyla diyaloğu açar.
-->
<template>
  <div class="ek-page-bar" :class="{ 'is-open': about.open.value }">
    <div class="ek-page-bar__row">
      <div class="ek-page-bar__titles">
        <nav v-if="section" class="ek-page-bar__crumbs" aria-label="Breadcrumb">
          <span class="ek-page-bar__section">{{ section }}</span>
          <v-icon class="ek-page-bar__sep" icon="mdi-chevron-right" aria-hidden="true" />
        </nav>
        <h1 class="ek-page-bar__title">{{ title }}</h1>
        <button
          type="button"
          class="ek-page-bar__info"
          :class="{ 'is-on': about.open.value }"
          :aria-expanded="about.open.value"
          :aria-controls="panelId"
          :aria-label="`Sayfa hakkında: ${title}`"
          :title="about.open.value ? 'Sayfa hakkında bilgiyi gizle' : 'Sayfa hakkında'"
          @click="about.toggle()"
        >
          <v-icon icon="mdi-information-outline" aria-hidden="true" />
        </button>
        <span v-if="meta" class="ek-page-bar__meta ek-page-header__description">{{ meta }}</span>
      </div>
      <div v-if="$slots.actions" class="ek-page-bar__actions"><slot name="actions" /></div>
      <!-- Aşama 6b (Standart 9): tek yenile düğmesi — satırın EN SAĞI, her sayfada aynı yer (dar ekranda başlık satırında). -->
      <span v-if="refreshable" class="ek-page-bar__refresh">
        <EkRefreshButton :loading="refreshing" :label="refreshLabel" :last-updated="lastUpdated" @refresh="emit('refresh')" />
      </span>
    </div>

    <EkCollapse :id="panelId" :open="about.open.value" role="region" :aria-label="`${title} sayfası hakkında`">
      <div class="ek-page-bar__about">
        <section class="ek-page-bar__block">
          <h2 class="ek-page-bar__label">Bu sayfa</h2>
          <p class="ek-page-bar__text">{{ description || `${title} ekranı.` }}</p>
        </section>
        <section v-if="tips?.length" class="ek-page-bar__block">
          <h2 class="ek-page-bar__label">İpuçları</h2>
          <ul class="ek-page-bar__tips">
            <li v-for="tip in tips" :key="tip">{{ tip }}</li>
          </ul>
        </section>
        <section class="ek-page-bar__block ek-page-bar__block--keys">
          <h2 class="ek-page-bar__label">Kısayollar</h2>
          <dl class="ek-page-bar__keys">
            <div v-for="k in keys" :key="k.id" class="ek-page-bar__key">
              <dt>{{ k.label }}</dt>
              <dd><EkKbd :keys="[...k.keys]" /></dd>
            </div>
          </dl>
          <button type="button" class="ek-page-bar__all" @click="openShortcutHelp">Tüm kısayollar</button>
        </section>
      </div>
    </EkCollapse>
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import EkCollapse from './EkCollapse.vue'
import EkKbd from './EkKbd.vue'
import EkRefreshButton from './EkRefreshButton.vue'
import { SHORTCUTS, type ShortcutId } from '@/navigation/shortcuts'
import { usePageAbout } from '@/composables/usePageAbout'

withDefaults(defineProps<{
  title: string
  /** Kayıt defterindeki bölüm adı (breadcrumb'ın ilk halkası; tıklanabilir değil). */
  section?: string
  /** Sayfanın amacı — "Sayfa hakkında" panelinde. */
  description?: string
  /** Kısa kullanım ipuçları (panelde madde listesi). */
  tips?: string[]
  /** Başlık satırında her zaman görünen kısa durum metni (açıklama DEĞİL). */
  meta?: string
  /** Aşama 6b: sayfanın yenile düğmesi (satırın en sağı; Alt+R). */
  refreshable?: boolean
  refreshing?: boolean
  refreshLabel?: string
  lastUpdated?: Date | string | number | null
}>(), { refreshLabel: 'Yenile' })
const emit = defineEmits<{ refresh: [] }>()

const PAGE_KEYS: Array<{ id: ShortcutId; label: string }> = [
  { id: 'search', label: 'Akıllı arama' },
  { id: 'tabClose', label: 'Sekmeyi kapat' },
  { id: 'headerToggle', label: 'Üst bölümü daralt' },
  { id: 'focusMode', label: 'Tam ekran' },
  { id: 'pageRefresh', label: 'Sayfayı yenile' },
]
const keys = PAGE_KEYS.map((k) => ({ ...k, keys: SHORTCUTS.find((s) => s.id === k.id)?.keys ?? [] }))

const about = usePageAbout()
const panelId = `ek-page-about-${useId()}`

function openShortcutHelp() {
  window.dispatchEvent(new CustomEvent('ek:shortcut-help'))
}
</script>

<style scoped>
.ek-page-bar {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* Izgara: [başlıklar] [eylemler] [yenile]. Dar ekranda eylemler alt satıra iner, yenile başlık satırında kalır. */
.ek-page-bar__row {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
  grid-template-areas: 'titles actions refresh';
  width: 100%;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  min-height: 40px;
}

.ek-page-bar__titles { grid-area: titles; }
.ek-page-bar__actions { grid-area: actions; }
.ek-page-bar__refresh { grid-area: refresh; display: inline-flex; justify-self: end; }

.ek-page-bar__titles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-2);
  min-width: 0;
}

.ek-page-bar__crumbs {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-type-label-weight);
}

.ek-page-bar__sep {
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-subtle);
}

.ek-page-bar__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: -0.005em;
}

.ek-page-bar__info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--ek-radius-chip);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-page-bar__info:hover {
  background: var(--ek-color-surface);
  border-color: var(--ek-color-border-default);
  color: var(--ek-color-action);
}

.ek-page-bar__info.is-on {
  background: var(--ek-color-action-subtle);
  border-color: var(--ek-color-action-border);
  color: var(--ek-color-action-emphasis);
}

.ek-page-bar__info:focus-visible,
.ek-page-bar__all:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-page-bar__meta {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-page-bar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  margin-left: auto;
}

/* Panel: başlık satırının hemen altında, sayfa zemininde ince çerçeveli bilgi yüzeyi (kart değil — içerikle yarışmaz). */
.ek-page-bar__about {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--ek-space-3) var(--ek-space-6);
  margin-top: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-action-subtle);
}

.ek-page-bar__block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-page-bar__label {
  margin: 0;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-page-bar__text,
.ek-page-bar__tips {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
}

.ek-page-bar__tips {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: var(--ek-space-4);
}

.ek-page-bar__keys {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  margin: 0;
}

.ek-page-bar__key {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-page-bar__key dd {
  margin: 0;
}

.ek-page-bar__all {
  align-self: flex-start;
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-action);
  font-family: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}

.ek-page-bar__all:hover {
  text-decoration: underline;
}

@media (max-width: 1023px) {
  .ek-page-bar__about {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .ek-page-bar__block--keys {
    grid-column: 1 / -1;
  }
}

@media (max-width: 599px) {
  .ek-page-bar__about {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .ek-page-bar__row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'titles refresh' 'actions actions';
  }

  .ek-page-bar__actions {
    width: 100%;
    justify-content: flex-start;
    margin-left: 0;
  }
}
</style>
