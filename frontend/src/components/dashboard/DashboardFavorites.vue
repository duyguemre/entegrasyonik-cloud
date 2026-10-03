<!--
  frontend/src/components/dashboard/DashboardFavorites.vue

  Genel bakış — "Bugün sırada"nın yanındaki FAVORİLER kartı (kullanıcı kararı 2026-10-03). Favoriler artık sol menüde ayrı
  bölüm olarak gösterilmez; tek yeri bu kart (+ akıllı arama). Kaynak `useShellMenu().model.favorites` (sıra, etiket, ikon);
  açma sol menüyle aynı (`openKey` → eventBus `openTab`); çıkarma sol menü yıldızıyla aynı (`menuStore.deleteFavorite`,
  iyimser). Ekleme sol menüde öğenin yanındaki yıldızla.
  Görünüm: "Bugün sırada" ile aynı kart dili (başlık bandı + mikro etiket), iki sütunlu kısayol ızgarası; en çok 8 öğe.
-->
<template>
  <section class="dfav" aria-labelledby="dfav-title">
    <header class="dfav__head">
      <p id="dfav-title" class="dfav__eyebrow">Favoriler</p>
      <span v-if="items.length" class="dfav__count ek-num">{{ items.length }}</span>
    </header>

    <div v-if="items.length" class="dfav__body">
      <ul class="dfav__grid">
        <li v-for="it in shown" :key="it.key">
          <div class="dfav-item" :data-favorite="it.key">
            <button type="button" class="dfav-item__open" @click="openKey(it.key)">
              <span class="dfav-item__icon" aria-hidden="true"><v-icon :icon="it.icon || 'mdi-star-outline'" /></span>
              <span class="dfav-item__text">
                <span class="dfav-item__label">{{ it.label }}</span>
                <span v-if="it.parent" class="dfav-item__parent">{{ it.parent }}</span>
              </span>
            </button>
            <button type="button" class="dfav-item__remove" :aria-label="`${it.label} favorilerden çıkar`" :title="'Favorilerden çıkar'"
              @click.stop="remove(it)">
              <v-icon class="dfav-item__star" icon="mdi-star" aria-hidden="true" />
              <v-icon class="dfav-item__star-off" icon="mdi-star-off-outline" aria-hidden="true" />
            </button>
          </div>
        </li>
      </ul>
      <p v-if="hidden > 0" class="dfav__more">
        <span class="ek-num">+{{ hidden }}</span> favori daha · tümü akıllı aramada (Ctrl+K)
      </p>
    </div>

    <div v-else class="dfav__empty">
      <span class="dfav__empty-icon" aria-hidden="true"><v-icon icon="mdi-star-outline" /></span>
      <div>
        <p class="dfav__empty-title">Henüz favori yok</p>
        <p class="dfav__empty-text">Sol menüde bir sayfanın yanındaki yıldıza tıklayarak buraya ekleyin.</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { useShellMenu } from '@/components/layout/useShellMenu'

const MAX = 8

const { model, openKey, linkFor, menuStore } = useShellMenu()
const { showToast } = useToast()

/** Sol menü yıldızıyla aynı çıkarma (iyimser; sunucu reddederse depo geri alır). */
async function remove(it: { key: string; label: string }) {
  const link = linkFor(it.key)
  if (!link?.code) return
  await menuStore.deleteFavorite(link.code)
  showToast({ tone: 'success', message: `${it.label} favorilerden çıkarıldı` })
}

const items = computed(() => {
  const entries = model.value.entries
  return model.value.favorites.map((it: any) => {
    const entry = entries.find((e) => e.key === it.key)
    return {
      key: it.key as string,
      label: it.label as string,
      icon: it.icon as string | undefined,
      parent: entry?.parentTitle || entry?.sectionLabel || '',
    }
  })
})

const shown = computed(() => items.value.slice(0, MAX))
const hidden = computed(() => Math.max(0, items.value.length - MAX))
</script>

<style scoped>
/* "Bugün sırada" (DashboardNextActions) ile aynı kart dili: düz yüzey, ince çerçeve, başlık bandı. */
.dfav {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.dfav__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.dfav__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-action);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dfav__eyebrow::before {
  content: '';
  width: 14px;
  height: 1.5px;
  border-radius: 1px;
  background: currentColor;
}

.dfav__count {
  min-width: 22px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size, 0.75rem);
  line-height: 20px;
  text-align: center;
}

.dfav__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-4);
}

.dfav__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.dfav-item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: 52px;
  padding-right: var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  transition: background-color var(--ek-duration-base) var(--ek-easing-standard),
    border-color var(--ek-duration-base) var(--ek-easing-standard);
}

.dfav-item:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.dfav-item__open {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
  align-self: stretch;
  padding: var(--ek-space-2) var(--ek-space-1) var(--ek-space-2) var(--ek-space-3);
  border: 0;
  border-radius: var(--ek-radius-tile);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.dfav-item__open:focus-visible,
.dfav-item__remove:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

/* Favoriden çıkar: küçük kare ikon düğmesi — dolu yıldız; üzerine gelince "yıldızı kaldır" ikonu. */
.dfav-item__remove {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-action);
  cursor: pointer;
}

.dfav-item__remove .v-icon {
  grid-area: 1 / 1;
  font-size: 16px;
}

.dfav-item__star-off {
  opacity: 0;
}

.dfav-item__remove:hover,
.dfav-item__remove:focus-visible {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
}

.dfav-item__remove:hover .dfav-item__star,
.dfav-item__remove:focus-visible .dfav-item__star {
  opacity: 0;
}

.dfav-item__remove:hover .dfav-item__star-off,
.dfav-item__remove:focus-visible .dfav-item__star-off {
  opacity: 1;
}

.dfav-item__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
}

.dfav-item__icon .v-icon {
  font-size: 18px;
}

.dfav-item:hover .dfav-item__icon {
  background: var(--ek-color-surface);
}

.dfav-item__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.dfav-item__label,
.dfav-item__parent {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dfav-item__label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size, 0.875rem);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1.3;
}

.dfav-item__parent {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size, 0.75rem);
  line-height: 1.3;
}


.dfav__more {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size, 0.75rem);
}

.dfav__empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-6) var(--ek-space-5);
}

.dfav__empty-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
}

.dfav__empty-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.dfav__empty-text {
  margin: 2px 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size, 0.875rem);
}

@container ek-dash (max-width: 560px) {
  .dfav__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 599px) {
  .dfav__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
