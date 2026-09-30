<!--
  frontend/src/components/ds/templates/EkSettingsTemplate.vue

  ADR-0015 Karar 3.9/6.1 — "Form sayfası / ayar" TEK KAYNAK şablonu (960px
  içerik). Bölümler "sol: başlık+açıklama (1/3) · sağ: alanlar (2/3)"
  (mobilde üst üste). Yapışkan eylem çubuğu SAĞDA: Vazgeç (ikincil) ·
  Kaydet (birincil); yalnızca `dirty` iken görünür (kaydedilmemiş değişiklik
  uyarısı — ADR-0012 Karar 4 `beforeClose` notuyla birlikte, o kablolama
  ekran tarafının işidir).

  Kullanım (bölümler, `sections` slot yerine düz slot — esneklik için):
    <EkSettingsTemplate title="Mağaza Ayarları" :dirty="isDirty" :saving="saving" @save="save" @discard="discard">
      <EkSettingsSection title="Genel" description="Mağaza adı ve iletişim bilgileri.">
        <v-text-field v-model="form.name" label="Mağaza adı" />
      </EkSettingsSection>
    </EkSettingsTemplate>
-->
<template>
  <div class="ek-settings-template">
    <EkPageHeader :section="section" :title="title" :description="description" />

    <div class="ek-settings-template__content">
      <slot />
    </div>

    <div v-if="dirty" class="ek-settings-template__save-bar">
      <span v-if="unsavedHint" class="ek-settings-template__hint">{{ unsavedHint }}</span>
      <v-spacer />
      <v-btn variant="outlined" :disabled="saving" @click="emit('discard')">Vazgeç</v-btn>
      <v-btn color="primary" :loading="saving" @click="emit('save')">Kaydet</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import EkPageHeader from '../EkPageHeader.vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    /** Bölüm yolu (breadcrumb) — diğer ekranlarla aynı başlık ritmi. */
    section?: string
    dirty?: boolean
    saving?: boolean
    unsavedHint?: string
  }>(),
  {
    dirty: false,
    saving: false,
    unsavedHint: 'Kaydedilmemiş değişiklikleriniz var.',
  },
)

const emit = defineEmits<{ save: []; discard: [] }>()
</script>

<style scoped>
/* Aşama 4: içerik sayfa ızgarasına SOLA hizalı (liste/pano ekranlarıyla aynı sol kenar); okuma genişliği 960px. */
.ek-settings-template {
  max-width: 960px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-8);
  padding-bottom: var(--ek-space-16);
}

.ek-settings-template__content {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-8);
}

.ek-settings-template__save-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  background: var(--ek-color-surface);
  border-top: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  box-shadow: var(--ek-shadow-md);
}

.ek-settings-template__hint {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}
</style>
