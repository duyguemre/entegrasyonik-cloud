<!--
  frontend/src/components/CardComponent.vue

  Eski ortak kart API'si (icon/title/subtitle/#header/isHovered/contentBackgroundColor).
  DS-v2 Aşama 2: görünüm `EkCard` / diyalog kartı diline taşındı — `surface` +
  `border-default` + `shadow-card`, başlık bandı: ikon kapsülü (`EkIconTile`) +
  başlık/alt başlık + sağda `#header` eylemleri; bant ile gövde arasında ince ayraç.
  Diyalog/panel barındırıcısında (`EkDialogHost`) köşe ve gölge diyalog rolünü alır.
  API ve slotlar DEĞİŞMEDİ.
-->
<template>
  <section class="ek-legacy-card" :class="{ 'is-hoverable': isHovered }">
    <header v-if="title || subtitle || $slots.header" class="ek-legacy-card__header">
      <EkIconTile v-if="icon" :icon="icon" tone="action" size="md" />
      <div class="ek-legacy-card__titles">
        <div v-if="title" class="ek-legacy-card__title">{{ title }}</div>
        <div v-if="subtitle" class="ek-legacy-card__subtitle">{{ subtitle }}</div>
      </div>
      <div class="ek-legacy-card__actions">
        <slot name="header"></slot>
      </div>
    </header>
    <div class="ek-legacy-card__content" :style="contentBackgroundColor ? { backgroundColor: contentBackgroundColor } : undefined">
      <slot></slot>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { useSlots } from 'vue'
import { EkIconTile } from '@entegrasyonik/ui/components'

withDefaults(defineProps<{
  icon?: string,
  title?: string,
  subtitle?: string,
  isHovered?: boolean,
  contentBackgroundColor?: string
}>(), {
  icon: '',
  title: '',
  subtitle: '',
  isHovered: true,
  contentBackgroundColor: ''
})

const $slots = useSlots()
</script>

<style scoped>
.ek-legacy-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
  transition: var(--ek-transition-colors);
}

.ek-legacy-card.is-hoverable:hover {
  border-color: var(--ek-color-border-strong);
}

.ek-legacy-card__header {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-legacy-card__titles {
  flex: 1;
  min-width: 0;
}

.ek-legacy-card__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.ek-legacy-card__subtitle {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-legacy-card__actions {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ek-legacy-card__content {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-5);
}
</style>
