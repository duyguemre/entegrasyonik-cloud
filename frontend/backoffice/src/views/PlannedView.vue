<template>
  <div class="bo-page">
    <BoPageHeader />
    <template v-if="screen?.plan">
      <BoSection :title="`${screen.label} ekranı hazırlanıyor`" :icon="screen.icon" tone="info" data-testid="planned-hero">
        <p class="bo-soon__text">
          Arka uç uçları tamamlandığında bu ekran aynı adreste açılacak. Adresi şimdiden yer imlerine ekleyebilir ya da
          <EkKbd :keys="['Ctrl', 'K']" /> ile her an ulaşabilirsiniz.
        </p>
      </BoSection>

      <BoTileGrid :cols="2">
        <BoSection title="Planlanan kapsam" description="Ekran açıldığında burada olacaklar" :heading-level="3" fill>
          <ul class="bo-soon__list">
            <li v-for="item in screen.plan.items" :key="item">
              <v-icon icon="mdi-check-circle-outline" aria-hidden="true" /><span>{{ item }}</span>
            </li>
          </ul>
        </BoSection>
        <BoSection title="Bu sırada" description="Hazır ekranlardan devam edin" :heading-level="3" fill>
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
          <template #footer>
            <BoCollapsible label="Teknik ayrıntı">
              <p class="bo-soon__tech">Uçlar: <code>{{ screen.plan.endpoints }}</code> · kaynak: BACKOFFICE_PLAN §1.2 / §2</p>
            </BoCollapsible>
          </template>
        </BoSection>
      </BoTileGrid>
    </template>
    <EkEmptyState v-else variant="no-data" title="Ekran bulunamadı" message="Menüden ya da Ctrl+K ile bir ekran seçin." />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { EkEmptyState, EkKbd } from '@entegrasyonik/ui/components'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoCollapsible from '@bo/components/r2/BoCollapsible.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
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
.bo-soon__text {
  max-width: 70ch;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
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
  min-height: 44px;
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
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-soon__tech code {
  font-family: var(--ek-font-mono);
}
</style>
