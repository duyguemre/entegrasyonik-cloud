<template>
  <v-card class="signature-card pa-0 ma-0" variant="flat" :class="{ 'is-hoverable': isHovered }">
    <div class="card-accent-line"></div>
    <div class="card-accent-line-bottom"></div>

    <div class="signature-card-header" v-if="title || subtitle || $slots.header">
      <div class="d-flex align-center w-100">

        <div v-if="icon" class="signature-icon-box mr-4">
          <v-icon :icon="icon" size="small" class="signature-icon"></v-icon>
        </div>

        <div class="header-text-group d-flex flex-column justify-center">
          <div v-if="title" class="signature-title">
            {{ title }}
          </div>
          <div v-if="subtitle" class="signature-subtitle">
            {{ subtitle }}
          </div>
        </div>

        <v-spacer />

        <slot name="header"></slot>
      </div>
    </div>
    <div class="signature-card-content"
      :style="{ backgroundColor: contentBackgroundColor || 'rgba(var(--v-theme-lightColor))' }">
      <slot></slot>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
import { useSlots } from 'vue'

const props = withDefaults(defineProps<{
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
/* Genel Yapı */
.signature-card {
  background: rgba(var(--v-theme-lightColor));
  border: 1px solid rgb(var(--v-theme-borderColorLight));
  border-radius: 12px;
  position: relative;
  transition: all 0.3s ease;
  overflow: hidden;
}

/* Üst Vurgu Çizgisi */
.card-accent-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: rgba(var(--v-theme-borderColorLight), 0.5);
  opacity: 0.6;
  z-index: 10;
  transition: all 0.6s ease;
}


.card-accent-line-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: rgba(var(--v-theme-borderColorLight), 0.5);
  opacity: 0.6;
  z-index: 10;
  transition: all 0.6s ease;
}

/* Hover Efektleri */
.signature-card.is-hoverable:hover {
  border-color: rgba(var(--v-theme-borderColor), 0.4);
}

.signature-card.is-hoverable:hover .card-accent-line,
.signature-card.is-hoverable:hover .card-accent-line-bottom {
  opacity: 1;
  background: rgba(var(--v-theme-borderColor), 0.4);
}

/* Header */
.signature-card-header {
  padding: 18px 24px 16px 24px;
  background-color: transparent;
  border-bottom: 1px dashed rgba(var(--v-theme-borderColor), 0.6);
  position: relative;
}

/* İkon Kutusu */
.signature-icon-box {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgb(var(--v-theme-workplaceColor));
  border: 1px solid rgb(var(--v-theme-borderColorLight));
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.signature-icon {
  color: rgb(var(--v-theme-passiveColor));
}

/* Başlık Grubu: Gap ile dikey aralık yönetimi */
.header-text-group {
  gap: 2px;
}

/* Tipografi: Ana Başlık */
.signature-title {
  color: rgb(var(--v-theme-passiveColor));
  font-size: 1.01rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.2;
  text-rendering: optimizeLegibility;
}

/* Tipografi: Alt Başlık */
.signature-subtitle {
  color: rgb(var(--v-theme-passiveColor));
  font-size: 0.75rem;
  font-weight: 500;
  opacity: 0.65;
  letter-spacing: 0.01em;
  line-height: 1.1;
}

/* İçerik */
.signature-card-content {
  display: block;
  padding: 16px 24px 24px 24px;
  position: relative;
}
</style>