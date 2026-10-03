<!--
  frontend/src/components/ds/EkFormSection.vue

  DS-v2 Aşama 2 — form bölümü: `fieldset` + başlık (legend, isteğe bağlı ikon) +
  yardım metni + `EkFormGrid`. Uzun formlar (entegrasyon ayarları, ürün/tanım
  formları) bu blokla bölümlenir; bölümler arası 24px, başlık–alan 12px.
  Alanlar içeride `EkFormGrid` kurallarıyla dizilir (eşit kolon, 16px boşluk,
  tablette ≤2, mobilde 1 kolon — alanlar ASLA üst üste binmez).
  Tam satır alan: alan köküne `class="ek-span-full"` (2 kolon: `ek-span-2`).

  Kullanım:
    <EkFormSection title="Bağlantı bilgileri" icon="mdi-key-outline"
      description="Pazaryeri satıcı panelinden alınır." :columns="2">
      <v-text-field label="Satıcı ID" />
      <v-text-field label="API anahtarı" />
    </EkFormSection>
-->
<template>
  <fieldset class="ek-form-section">
    <legend v-if="title" class="ek-form-section__legend">
      <v-icon v-if="icon" :icon="icon" class="ek-form-section__icon" aria-hidden="true" />
      <span>{{ title }}</span>
      <!-- Bağlamsal yardım (faz3-fe-help): başlığın yanında (?) — `EkHelpHint`. -->
      <slot name="legend-extra" />
    </legend>
    <p v-if="description" class="ek-form-section__help">{{ description }}</p>
    <EkFormGrid :columns="columns" class="ek-form-section__grid">
      <slot />
    </EkFormGrid>
  </fieldset>
</template>

<script setup lang="ts">
import EkFormGrid from './EkFormGrid.vue'

withDefaults(
  defineProps<{
    title?: string
    description?: string
    icon?: string
    columns?: 1 | 2 | 3 | 4
  }>(),
  { columns: 2 },
)
</script>

<style scoped>
.ek-form-section {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.ek-form-section + .ek-form-section {
  margin-top: var(--ek-space-6);
  padding-top: var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-form-section__legend {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  float: left;
  width: 100%;
  margin: 0 0 var(--ek-space-1);
  padding: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-form-section__icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-subheading-icon);
}

.ek-form-section__help {
  clear: both;
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-form-section__grid {
  clear: both;
  padding-top: var(--ek-space-3);
}

.ek-form-section__help + .ek-form-section__grid {
  padding-top: 0;
}

/* ================= FE-LOCAL-1054 — form bölüm başlığı: uygulamanın tasarım diliyle =================
   İkon + yarı kalın başlık yerine kısa eylem çizgili BÜYÜK HARF mikro etiket (kart dışı bölüm başlıklarıyla aynı). */
.ek-form-section__legend {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-form-section__legend::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.ek-form-section__icon {
  display: none;
}

.ek-form-section__help {
  margin-top: var(--ek-space-1);
}
</style>
