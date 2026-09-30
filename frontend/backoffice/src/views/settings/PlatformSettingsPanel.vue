<template>
  <section class="bo-panel" aria-labelledby="bo-plat-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-plat-title" class="bo-panel__title">Platform ayarları</h2>
        <p class="bo-panel__hint">Destek iletişimi, duyuru şeridi ve arayüz varsayılanları. Değişiklikler yayınlanana kadar yürürlüğe girmez.</p>
      </div>
    </header>
    <EkCard flush>
      <div class="bo-plat">
        <fieldset v-for="g in groups" :key="g.group" class="bo-plat__group">
          <legend class="bo-plat__legend">{{ g.title }}</legend>
          <div class="bo-plat__fields">
            <SettingField
              v-for="item in g.items"
              :key="item.key"
              :item="item"
              :model-value="cfg.form[item.key]"
              :effective="cfg.data?.values[item.key]"
              :changed="cfg.isChanged(item.key)"
              :error="cfg.fieldErrors[item.key]"
              :counter="item.type === 'text' && item.key !== 'support.phone'"
              @update:model-value="(v) => (cfg.form[item.key] = v)"
            />
          </div>
        </fieldset>
        <EkAlert v-if="cfg.saveError" tone="error" live dense :text="cfg.saveError.message" data-testid="save-error" />
        <div class="bo-plat__actions">
          <EkButton tone="primary" icon="mdi-file-eye-outline" :loading="cfg.saving" :disabled="!cfg.changedKeys.length && !cfg.hasDraft" data-testid="settings-save" @click="cfg.saveAndPreview()">Taslak kaydet ve önizle</EkButton>
          <span class="bo-panel__hint">{{ cfg.changedKeys.length ? `${cfg.changedKeys.length} değişiklik bekliyor` : 'Değişiklik yok' }}</span>
        </div>
      </div>
    </EkCard>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkAlert, EkButton, EkCard } from '@entegrasyonik/ui/components'
import SettingField from './SettingField.vue'
import type { PlatformConfig } from './usePlatformConfig'
import '@bo/styles/kit.css'

const props = defineProps<{ cfg: PlatformConfig }>()
const GROUPS = [
  { group: 'platform.support', title: 'Destek' },
  { group: 'platform.announcement', title: 'Duyuru şeridi' },
  { group: 'platform.ui', title: 'Arayüz' },
]
const groups = computed(() => GROUPS.map((g) => ({ ...g, items: props.cfg.catalogOf(g.group) })).filter((g) => g.items.length))
</script>

<style scoped>
.bo-plat {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  padding: var(--ek-space-5);
}
.bo-plat__group {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.bo-plat__legend {
  padding: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-plat__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--ek-space-2) var(--ek-space-4);
}
.bo-plat__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}
</style>
