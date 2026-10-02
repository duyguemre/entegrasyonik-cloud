<template>
  <BoSection id="bo-maint" title="Bakım modu" description="Açıkken müşteri uygulamasında bakım şeridi görünür ve veri yazan istekler reddedilir." :tone="isOn ? 'warning' : undefined" data-testid="maintenance-card">
    <template #actions>
      <span class="bo-maint__status">
        <EkStatusChip :tone="isOn ? 'warning' : 'success'" :label="isOn ? 'Bakım modu açık' : 'Bakım modu kapalı'" dot data-testid="maintenance-status" />
        <span class="bo-panel__hint ek-num">Yayın sürümü: {{ cfg.data?.published ? cfg.data.published : 'yok (varsayılanlar)' }}</span>
      </span>
    </template>
    <div class="bo-maint">

        <div class="bo-maint__form">
          <SettingField v-if="enabledItem" :item="enabledItem" :model-value="cfg.form['maintenance.enabled']" :effective="cfg.data?.values['maintenance.enabled']" :changed="cfg.isChanged('maintenance.enabled')" :error="cfg.fieldErrors['maintenance.enabled']" @update:model-value="(v) => (cfg.form['maintenance.enabled'] = v)" />
          <SettingField v-if="messageItem" :item="messageItem" :model-value="cfg.form['maintenance.message']" :effective="cfg.data?.values['maintenance.message']" :changed="cfg.isChanged('maintenance.message')" :error="cfg.fieldErrors['maintenance.message']" counter @update:model-value="(v) => (cfg.form['maintenance.message'] = v)" />
        </div>

        <div class="bo-maint__impact" role="group" aria-labelledby="bo-maint-impact">
          <h3 id="bo-maint-impact" class="bo-maint__impact-title">Etki özeti</h3>
          <p class="bo-maint__tenants" data-testid="maintenance-impact">
            <template v-if="cfg.preview">Etkilenecek aktif müşteri: <strong class="ek-num">{{ cfg.preview.impact.approximate ? 'yaklaşık ' : '' }}{{ cfg.preview.impact.activeTenants }}</strong></template>
            <template v-else>Etkilenecek müşteri sayısı, taslak önizlemesinde hesaplanır.</template>
          </p>
          <p v-if="enabledItem?.impact" class="bo-maint__line">{{ enabledItem.impact.tr }}</p>
          <dl class="bo-maint__lists">
            <div>
              <dt><v-icon icon="mdi-cancel" size="16" aria-hidden="true" /> Engellenen</dt>
              <dd>Müşteri (tenant) yazma istekleri 503 MAINTENANCE ile reddedilir.</dd>
            </div>
            <div>
              <dt><v-icon icon="mdi-check-circle-outline" size="16" aria-hidden="true" /> Serbest</dt>
              <dd>Okuma istekleri, giriş/çıkış, yönetim uygulaması, webhook'lar ve public-config.</dd>
            </div>
          </dl>
          <p class="bo-panel__hint">Yayından sonra değer ~15 sn içinde tüm sunucularda etkinleşir; müşteri uygulaması ek olarak en çok 30 sn önbellekten okuyabilir.</p>
        </div>

    </div>
    <template #footer>
      <div class="bo-maint__actions">
        <BoAction kind="save" label="Taslak kaydet ve önizle" :loading="cfg.saving" :disabled="!cfg.changedKeys.length && !cfg.hasDraft" data-testid="maintenance-save" @click="cfg.saveAndPreview()" />
        <span v-if="cfg.changedKeys.length" class="bo-panel__hint">{{ cfg.changedKeys.length }} değişiklik bekliyor (bakım ve diğer ayarlar aynı taslağı paylaşır).</span>
      </div>
    </template>
  </BoSection>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkStatusChip } from '@entegrasyonik/ui/components'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import SettingField from './SettingField.vue'
import type { PlatformConfig } from './usePlatformConfig'
import '@bo/styles/kit.css'

const props = defineProps<{ cfg: PlatformConfig }>()
const enabledItem = computed(() => props.cfg.data?.catalog.find((c) => c.key === 'maintenance.enabled'))
const messageItem = computed(() => props.cfg.data?.catalog.find((c) => c.key === 'maintenance.message'))
const isOn = computed(() => props.cfg.data?.values['maintenance.enabled']?.value === true)
</script>

<style scoped>
.bo-maint {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.bo-maint__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}
.bo-maint__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ek-space-2);
  max-width: 720px;
}
.bo-maint__impact {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-muted);
}
.bo-maint__impact-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-maint__tenants,
.bo-maint__line {
  margin: 0;
  font-size: var(--ek-type-body-size);
  color: var(--ek-color-content-default);
}
.bo-maint__lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--ek-space-3);
  margin: 0;
}
.bo-maint__lists dt {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-maint__lists dd {
  margin: 2px 0 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}
.bo-maint__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}
</style>
