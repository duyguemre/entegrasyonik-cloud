<!--
  frontend/src/components/help/HelpSupportCta.vue — "Aradığınızı bulamadınız mı?" destek çağrısı (yardım merkezi ana
  sayfası ve makale sonu). "Destek talebi aç" MEVCUT destek diyaloğunu açar (`TicketCreateDialog`, çağıran tutar);
  "Destek kayıtlarım" mevcut destek ekranına gider (menüde varsa); "Klavye kısayolları" kabuğun `?` diyaloğunu açar.
-->
<template>
  <section class="ek-help-cta" :class="{ 'is-compact': compact }" aria-labelledby="help-cta-title">
    <EkIconTile icon="mdi-lifebuoy" tone="action" :size="compact ? 'md' : 'lg'" />
    <div class="ek-help-cta__text">
      <h3 :id="`help-cta-title`" class="ek-help-cta__title">{{ compact ? 'Hâlâ yardıma mı ihtiyacınız var?' : 'Aradığınızı bulamadınız mı?' }}</h3>
      <p class="ek-help-cta__sub">Destek talebi açın; yanıtları "Destek kayıtları" ekranından izleyin.</p>
    </div>
    <div class="ek-help-cta__actions">
      <EkButton v-if="!compact" tone="ghost" icon="mdi-keyboard-outline" @click="openShortcuts">Klavye kısayolları</EkButton>
      <EkButton v-if="nav.canOpenScreen(TICKETS)" tone="secondary" icon="mdi-format-list-bulleted" @click="nav.openScreen(TICKETS)">Destek kayıtlarım</EkButton>
      <EkButton icon="mdi-message-plus-outline" data-help-ticket @click="emit('ticket')">Destek talebi aç</EkButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import { useHelpNavigation } from '@/help/useHelpNavigation'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const emit = defineEmits<{ ticket: [] }>()
const nav = useHelpNavigation()
const TICKETS = 'supports/TicketListView'

function openShortcuts() {
  window.dispatchEvent(new CustomEvent('ek:shortcut-help'))
}
</script>

<style scoped>
.ek-help-cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3) var(--ek-space-4);
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.ek-help-cta.is-compact {
  padding: var(--ek-space-4);
}

.ek-help-cta__text {
  display: flex;
  flex: 1 1 260px;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ek-help-cta__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-cta__sub {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-table-size);
}

.ek-help-cta__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}
</style>
