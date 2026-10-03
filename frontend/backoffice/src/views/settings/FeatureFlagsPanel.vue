<template>
  <BoSection id="bo-flags" flush title="Özellik bayrakları" description="Bayrak, varsayılanı kapalı bir ayardır. Yüzde/kademeli açılım yoktur; tenant listesi boşsa herkes için geçerlidir.">
      <div v-if="!flags.length" class="bo-flags__empty" data-testid="flags-empty">
        <EkEmptyState variant="no-data" title="Henüz özellik bayrağı yok" message="Kod kataloğunda (FEATURE_FLAGS) bayrak yok; ilk bayrak eklendiğinde burada görünür. Katalogda olmayan bayrak yazılamaz." />
      </div>
      <ul v-else class="bo-flags" aria-label="Özellik bayrakları">
        <li v-for="f in flags" :key="f.item.key" class="bo-flag" :class="{ 'is-changed': cfg.isChanged(f.item.key) || (f.tenants && cfg.isChanged(f.tenants.key)) }">
          <div class="bo-flag__main">
            <div class="bo-flag__head">
              <strong class="bo-flag__name">{{ f.item.label.tr }}</strong>
              <code class="bo-code">{{ f.item.key }}</code>
              <EkStatusChip :tone="f.item.exposure === 'public' ? 'info' : 'neutral'" :label="f.item.exposure === 'public' ? 'Herkese açık (müşteri uygulaması okur)' : 'Yalnız yönetici'" />
            </div>
            <p class="bo-panel__hint">{{ f.item.help.tr }}</p>
            <p v-if="f.tenants" class="bo-flag__tenants">
              <span class="bo-panel__hint">Tenant listesi:</span>
              <template v-if="tenantList(f.tenants.key).length">
                <EkStatusChip v-for="t in tenantList(f.tenants.key)" :key="t" tone="neutral" :label="`#${t}`" />
              </template>
              <span v-else class="bo-muted">boş (herkes)</span>
            </p>
          </div>
          <v-switch
            :model-value="cfg.form[f.item.key] === true"
            :label="cfg.form[f.item.key] === true ? 'Açık' : 'Kapalı'"
            :aria-label="`${f.item.label.tr} bayrağı`"
            color="primary"
            density="compact"
            hide-details
            inset
            class="bo-flag__switch"
            @update:model-value="(v) => (cfg.form[f.item.key] = Boolean(v))"
          />
        </li>
      </ul>
    <template v-if="flags.length" #footer>
      <BoAction kind="save" label="Taslak kaydet ve önizle" :loading="cfg.saving" :disabled="!cfg.changedKeys.length && !cfg.hasDraft" @click="cfg.saveAndPreview()" />
    </template>
  </BoSection>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkEmptyState, EkStatusChip } from '@entegrasyonik/ui/components'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import type { PlatformConfig } from './usePlatformConfig'
import '@bo/styles/kit.css'

const props = defineProps<{ cfg: PlatformConfig }>()
const flags = computed(() => {
  const items = props.cfg.catalogOf('platform.features')
  return items
    .filter((i) => i.type === 'bool')
    .map((item) => ({ item, tenants: items.find((t) => t.key === `${item.key}.tenants`) }))
})
const tenantList = (key: string): string[] => {
  const v = props.cfg.form[key]
  return Array.isArray(v) ? (v as string[]) : []
}
</script>

<style scoped>
.bo-flags {
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-flag {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}
.bo-flag.is-changed {
  background: var(--ek-color-info-subtle);
}
.bo-flag__main {
  display: flex;
  flex: 1 1 320px;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}
.bo-flag__head,
.bo-flag__tenants {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
}
.bo-flag__name {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-flags__empty {
  padding: var(--ek-space-4);
}

/* BO-LOCAL-01 — değişen bayrak satırı: tek vurgu eylem rengi (bilgi mavisi değil); son satırda alt çizgi yok. */
.bo-flag.is-changed {
  background: var(--ek-color-action-subtle);
}

.bo-flag:last-child {
  border-bottom: 0;
}
</style>
