<!-- Vitrin §5 — düğmeler: 4 ton × tüm durumlar, boyutlar, yalnız-ikon. -->
<template>
  <DsSpecimen title="Tonlar × durumlar" note="Ekran başına TEK birincil. Sıra (sağa yaslı): ⋯ → ikincil → birincil. Tehlike dolgusu yalnızca onay adımında.">
    <div class="ds-btn-matrix" role="table" aria-label="Düğme durum matrisi">
      <div class="ds-btn-matrix__row ds-btn-matrix__row--head" role="row">
        <span role="columnheader">Ton</span>
        <span v-for="s in states" :key="s.key" role="columnheader">{{ s.label }}</span>
      </div>
      <div v-for="t in tones" :key="t.tone" class="ds-btn-matrix__row" role="row">
        <span class="ds-btn-matrix__tone" role="rowheader">
          <code>{{ t.tone }}</code>
          <small>{{ t.use }}</small>
        </span>
        <span v-for="s in states" :key="s.key" role="cell">
          <EkButton
            :tone="t.tone"
            :icon="t.icon"
            :force-state="s.force"
            :disabled="s.key === 'disabled'"
            :loading="s.key === 'loading'"
          >
            {{ t.label }}
          </EkButton>
        </span>
      </div>
    </div>
  </DsSpecimen>

  <DsSpecimen title="Boyut ve yalnız-ikon" note="md 36 px (varsayılan) · sm 32 px (tablo/araç çubuğu). Yalnız-ikon düğmede aria-label + tooltip zorunlu.">
    <div class="ds-row">
      <EkButton tone="primary" icon="mdi-magnify">Sorgula</EkButton>
      <EkButton tone="primary" size="sm" icon="mdi-magnify">Sorgula</EkButton>
      <EkButton tone="secondary" trailing-icon="mdi-chevron-down">Toplu işlem</EkButton>
      <EkButton tone="secondary" size="sm" icon="mdi-download-outline">Dışa aktar</EkButton>
      <EkTooltip text="Diğer işlemler" :shortcut="['Shift', 'F10']">
        <EkButton tone="ghost" icon="mdi-dots-horizontal" icon-only aria-label="Diğer işlemler" />
      </EkTooltip>
      <EkTooltip text="Yenile" shortcut="F5">
        <EkButton tone="secondary" size="sm" icon="mdi-refresh" icon-only aria-label="Yenile" />
      </EkTooltip>
    </div>
    <div class="ds-actionbar">
      <span class="ds-actionbar__hint">Eylem çubuğu örneği</span>
      <EkButton tone="ghost" icon="mdi-dots-horizontal" icon-only aria-label="Diğer işlemler" />
      <EkButton tone="secondary">Vazgeç</EkButton>
      <EkButton tone="primary" icon="mdi-content-save-outline">Kaydet</EkButton>
    </div>
  </DsSpecimen>
</template>

<script setup lang="ts">
import DsSpecimen from './DsSpecimen.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkTooltip from '@/components/ds/EkTooltip.vue'

const states = [
  { key: 'default', label: 'Varsayılan', force: undefined },
  { key: 'hover', label: 'Hover', force: 'hover' as const },
  { key: 'active', label: 'Basılı', force: 'active' as const },
  { key: 'focus', label: 'Odak', force: 'focus' as const },
  { key: 'disabled', label: 'Devre dışı', force: undefined },
  { key: 'loading', label: 'Yükleniyor', force: undefined },
]

const tones = [
  { tone: 'primary' as const, label: 'Sorgula', icon: 'mdi-magnify', use: 'ana iş' },
  { tone: 'secondary' as const, label: 'Temizle', icon: 'mdi-filter-remove-outline', use: 'ikincil' },
  { tone: 'ghost' as const, label: 'Önizle', icon: 'mdi-eye-outline', use: 'üçüncül' },
  { tone: 'danger' as const, label: 'Sil', icon: 'mdi-delete-outline', use: 'yıkıcı' },
]
</script>

<style scoped>
.ds-btn-matrix {
  display: flex;
  flex-direction: column;
  min-width: 860px;
}

.ds-btn-matrix__row {
  display: grid;
  grid-template-columns: 120px repeat(6, minmax(0, 1fr));
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ds-btn-matrix__row:last-child {
  border-bottom: 0;
}

.ds-btn-matrix__row--head {
  padding-top: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ds-btn-matrix__tone {
  display: flex;
  flex-direction: column;
}

.ds-btn-matrix__tone code {
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-bold);
}

.ds-btn-matrix__tone small {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.ds-actionbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-5);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}

.ds-actionbar__hint {
  flex: 1;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
</style>
