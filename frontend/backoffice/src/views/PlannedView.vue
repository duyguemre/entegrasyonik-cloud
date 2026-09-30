<template>
  <div class="bo-page">
    <BoPageHeader />
    <section v-if="screen?.plan" class="bo-soon" aria-labelledby="bo-soon-title">
      <div class="bo-soon__hero">
        <div class="bo-soon__mark" aria-hidden="true">
          <v-icon :icon="screen.icon" />
        </div>
        <div class="bo-soon__intro">
          <p class="bo-soon__eyebrow">Yakında</p>
          <h2 id="bo-soon-title" class="bo-soon__title">{{ screen.label }} ekranı hazırlanıyor</h2>
          <p class="bo-soon__text">
            Arka uç uçları tamamlandığında bu ekran aynı adreste açılacak. Adresi şimdiden yer imlerine ekleyebilir ya da
            <EkKbd :keys="['Ctrl', 'K']" /> ile her an ulaşabilirsiniz.
          </p>
        </div>
      </div>

      <div class="bo-soon__grid">
        <div class="bo-soon__block">
          <h3 class="bo-soon__label">Planlanan kapsam</h3>
          <ul class="bo-soon__list">
            <li v-for="item in screen.plan.items" :key="item">
              <v-icon icon="mdi-check-circle-outline" aria-hidden="true" /><span>{{ item }}</span>
            </li>
          </ul>
        </div>
        <div class="bo-soon__block">
          <h3 class="bo-soon__label">Bu sırada</h3>
          <ul class="bo-soon__links">
            <li v-for="link in related" :key="link.key">
              <RouterLink :to="link.path" class="bo-soon__link">
                <v-icon :icon="link.icon" aria-hidden="true" />
                <span>
                  <strong>{{ link.label }}</strong>
                  <small>{{ link.lede }}</small>
                </span>
                <v-icon class="bo-soon__arrow" icon="mdi-arrow-right" aria-hidden="true" />
              </RouterLink>
            </li>
          </ul>
          <details class="bo-soon__tech">
            <summary>Teknik ayrıntı</summary>
            <p>Uçlar: <code>{{ screen.plan.endpoints }}</code> · kaynak: BACKOFFICE_PLAN §1.2 / §2</p>
          </details>
        </div>
      </div>
    </section>
    <EkEmptyState v-else variant="no-data" title="Ekran bulunamadı" message="Menüden ya da Ctrl+K ile bir ekran seçin." />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { EkEmptyState, EkKbd } from '@entegrasyonik/ui/components'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import { SCREENS, screenByKey } from '@bo/navigation/screens'

const route = useRoute()
const screen = computed(() => {
  const s = screenByKey(String(route.meta.screen ?? ''))
  return s?.status === 'planned' ? s : undefined
})
// Aynı gruptaki hazır ekranlar önce, ardından her zaman işe yarayan iki ekran (genel bakış, loglar).
const related = computed(() => {
  const s = screen.value
  if (!s) return []
  const same = SCREENS.filter((x) => x.group === s.group && x.status !== 'planned')
  const always = SCREENS.filter((x) => x.key === 'overview' || x.key === 'logs')
  return [...new Map([...same, ...always].map((x) => [x.key, x])).values()].slice(0, 3)
})
</script>

<style scoped>
.bo-soon {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.bo-soon__hero {
  display: flex;
  align-items: center;
  gap: var(--ek-space-6);
  padding: var(--ek-space-8);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background:
    radial-gradient(60% 120% at 0% 0%, color-mix(in srgb, var(--ek-color-action) 7%, transparent), transparent 70%),
    var(--ek-color-surface);
}

.bo-soon__mark {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border: 1px dashed var(--ek-color-action-border);
  border-radius: var(--ek-radius-xl);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: 32px;
}

.bo-soon__intro {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.bo-soon__eyebrow {
  margin: 0;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-soon__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-soon__text {
  max-width: 70ch;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.bo-soon__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.bo-soon__block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-6) var(--ek-space-8);
}

.bo-soon__block + .bo-soon__block {
  border-left: 1px solid var(--ek-color-border-subtle);
}

.bo-soon__label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-soon__list,
.bo-soon__links {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-soon__list li {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.bo-soon__list .v-icon {
  margin-top: 2px;
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-md);
}

.bo-soon__link {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-lg);
  color: var(--ek-color-content-default);
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.bo-soon__link:hover {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}

.bo-soon__link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-soon__link > .v-icon:first-child {
  color: var(--ek-color-content-muted);
}

.bo-soon__link span {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.bo-soon__link strong {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-soon__link small {
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-soon__arrow {
  color: var(--ek-color-content-subtle);
}

.bo-soon__tech {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-soon__tech summary {
  cursor: pointer;
}

.bo-soon__tech p {
  margin: var(--ek-space-2) 0 0;
}

.bo-soon__tech code {
  font-family: var(--ek-font-mono);
}

@media (max-width: 899px) {
  .bo-soon__hero {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ek-space-4);
    padding: var(--ek-space-6) var(--ek-space-5);
  }

  .bo-soon__grid {
    grid-template-columns: 1fr;
  }

  .bo-soon__block {
    padding: var(--ek-space-5);
  }

  .bo-soon__block + .bo-soon__block {
    border-top: 1px solid var(--ek-color-border-subtle);
    border-left: 0;
  }
}
</style>
