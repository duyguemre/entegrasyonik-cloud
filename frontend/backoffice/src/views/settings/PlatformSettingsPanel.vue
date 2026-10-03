<!--
  Platform ayarları — AYAR LİSTESİ düzeni: her grup solda başlık + tek cümle açıklama, sağda tek kart içinde ayraçlı
  satırlar (ad · yardım · kaynak ← → denetim). Değişen satır sol çizgi + "Değişti" ile işaretlenir.
-->
<template>
  <BoSection id="bo-plat" title="Platform ayarları" description="Destek iletişimi, duyuru şeridi ve arayüz varsayılanları. Değişiklikler yayınlanana kadar yürürlüğe girmez." icon="mdi-tune-variant">
    <div class="bo-plat">
      <section v-for="g in groups" :key="g.group" class="bo-plat__group" :aria-labelledby="`grp-${g.group}`">
        <header class="bo-plat__head">
          <span class="bo-plat__icon" aria-hidden="true"><v-icon :icon="g.icon" /></span>
          <div>
            <h3 :id="`grp-${g.group}`" class="bo-plat__title">{{ g.title }}</h3>
            <p class="bo-plat__desc">{{ g.desc }}</p>
            <p v-if="g.changed" class="bo-plat__changed">{{ g.changed }} değişiklik</p>
          </div>
        </header>
        <div class="bo-plat__rows">
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
      </section>
    </div>
    <template #footer>
      <div class="bo-plat__actions">
        <span class="bo-plat__pending" :class="{ 'is-on': cfg.changedKeys.length }">
          <i aria-hidden="true"></i>{{ cfg.changedKeys.length ? `${cfg.changedKeys.length} değişiklik kaydedilmeyi bekliyor` : 'Kaydedilmemiş değişiklik yok' }}
        </span>
        <BoAction kind="save" label="Taslak kaydet ve önizle" :loading="cfg.saving" :disabled="!cfg.changedKeys.length && !cfg.hasDraft" data-testid="settings-save" @click="cfg.saveAndPreview()" />
      </div>
    </template>
  </BoSection>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import SettingField from './SettingField.vue'
import type { PlatformConfig } from './usePlatformConfig'
import '@bo/styles/kit.css'

const props = defineProps<{ cfg: PlatformConfig }>()
const GROUPS = [
  { group: 'platform.support', title: 'Destek', icon: 'mdi-lifebuoy', desc: 'Müşterilerin uygulamada gördüğü destek iletişim bilgileri.' },
  { group: 'platform.announcement', title: 'Duyuru şeridi', icon: 'mdi-bullhorn-outline', desc: 'Tüm müşterilere üstte gösterilen kısa duyuru.' },
  { group: 'platform.ui', title: 'Arayüz', icon: 'mdi-monitor-dashboard', desc: 'Uygulama genelinde varsayılan görünüm ve liste ayarları.' },
]
const groups = computed(() =>
  GROUPS.map((g) => {
    const items = props.cfg.catalogOf(g.group)
    return { ...g, items, changed: items.filter((i) => props.cfg.isChanged(i.key)).length }
  }).filter((g) => g.items.length),
)
</script>

<style scoped>
.bo-plat {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6, 24px);
}

/* Grup: solda başlık sütunu, sağda satır kartı. */
.bo-plat__group {
  display: grid;
  grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  gap: var(--ek-space-5);
  align-items: start;
}

.bo-plat__group + .bo-plat__group {
  padding-top: var(--ek-space-6, 24px);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-plat__head {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding-top: var(--ek-space-2);
}

.bo-plat__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
}

.bo-plat__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-plat__desc {
  margin: 2px 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-plat__changed {
  display: inline-block;
  margin: var(--ek-space-2) 0 0;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 20px;
}

.bo-plat__rows {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
}

/* Alt şerit: solda bekleyen değişiklik, sağda birincil eylem. */
.bo-plat__actions {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
}

.bo-plat__pending {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

.bo-plat__pending i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ek-color-border-strong);
}

.bo-plat__pending.is-on {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.bo-plat__pending.is-on i {
  background: var(--ek-color-action);
}

@media (max-width: 900px) {
  .bo-plat__group {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-3);
  }

  .bo-plat__head {
    padding-top: 0;
  }
}

/* ================= BO-LOCAL-01 — platform ayarları: uygulamanın tasarım diliyle =================
   Her ayar grubu başlık bantlı TEK kart (müşteri uygulamasındaki "Detay bilgiler" düzeni): bantta çerçeveli ikon
   kutusu + ad + açıklama, altında ince çizgili ayar satırları. Sol başlık sütunu ve gruplar arası ayraç çizgisi kalktı;
   rozet ve bekleyen-değişiklik işareti köşeli. */
.bo-plat {
  gap: var(--ek-space-5);
}

.bo-plat__group,
.bo-plat__group + .bo-plat__group {
  display: block;
  overflow: hidden;
  padding-top: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.bo-plat__head {
  align-items: center;
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.bo-plat__icon {
  width: 36px;
  height: 36px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  color: var(--ek-color-action-emphasis);
}

.bo-plat__title {
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
}

.bo-plat__changed {
  margin-top: var(--ek-space-1);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-md);
}

.bo-plat__rows {
  border: 0;
  border-radius: 0;
}

.bo-plat__pending i {
  border-radius: 2px;
}

@media (max-width: 900px) {
  .bo-plat__head {
    padding-top: var(--ek-space-3);
  }
}
</style>
