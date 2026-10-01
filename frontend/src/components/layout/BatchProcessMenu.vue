<template>
  <v-slide-y-reverse-transition>
    <div v-if="modelValue.length > 0" class="batch-process-menu-wrapper">
      <v-card class="batch-process-menu px-4 py-3 d-flex align-center shadow-lg w-100">
        <!-- Selection Info -->
        <div class="selection-info d-flex align-center">
          <EkBadge variant="count" tone="action" class="mr-3">{{ modelValue.length }}</EkBadge>
          <span class="font-weight-bold text-uppercase text-caption selection-title">
            {{ title }}
          </span>
        </div>

        <v-divider vertical class="mx-6 batch-divider"></v-divider>

        <!-- Dynamic Actions -->
        <div class="d-flex align-center gap-2">
          <template v-for="action in actions" :key="action.id">
            <v-badge
              v-if="action.badgeCount !== undefined"
              :content="action.badgeCount"
              :color="action.color || 'success'"
              :model-value="action.badgeCount > 0"
              offset-x="10"
              offset-y="10"
            >
              <v-btn
                :class="['bulk-action-btn', action.color ? `${action.color}-btn` : '']"
                stacked
                variant="flat"
                :disabled="action.disabled"
                @click="$emit('action', action.id)"
              >
                <v-icon size="22">{{ action.icon }}</v-icon>
                <span class="btn-label mt-1">{{ action.label }}</span>
                <v-tooltip v-if="action.tooltip" activator="parent" location="top">
                  {{ action.tooltip }}
                </v-tooltip>
              </v-btn>
            </v-badge>

            <v-btn
              v-else
              :class="['bulk-action-btn', action.color ? `${action.color}-btn` : '']"
              stacked
              variant="flat"
              :disabled="action.disabled"
              @click="$emit('action', action.id)"
            >
              <v-icon size="22">{{ action.icon }}</v-icon>
              <span class="btn-label mt-1">{{ action.label }}</span>
              <v-tooltip v-if="action.tooltip" activator="parent" location="top">
                {{ action.tooltip }}
              </v-tooltip>
            </v-btn>
          </template>
        </div>

        <v-spacer></v-spacer>

        <!-- Close Button -->
        <v-btn
          icon="mdi-close"
          variant="text"
          color="action-contrast"
          size="small"
          class="opacity-70 hover-opacity-100"
          aria-label="Seçimi temizle"
          @click="$emit('clear')"
        ></v-btn>
      </v-card>
    </div>
  </v-slide-y-reverse-transition>
</template>

<script setup lang="ts">
import { EkBadge } from '@entegrasyonik/ui/components'
/**
 * BATCH PROCESS MENU
 * Standardized bulk action bar for all listing modules.
 */

interface BatchAction {
  id: string;
  label: string;
  icon: string;
  color?: 'success' | 'error' | 'info' | 'warning' | 'primary' | 'danger' | string;
  badgeCount?: number;
  disabled?: boolean;
  tooltip?: string;
}

defineProps<{
  modelValue: any[];
  title: string;
  actions: BatchAction[];
}>();

defineEmits(['action', 'clear']);
</script>

<style scoped lang="scss">
.batch-process-menu-wrapper {
  position: fixed;
  bottom: var(--ek-space-6);
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600px;
  z-index: var(--ek-z-header);
}

.batch-process-menu {
  background: var(--ek-color-surface-inverse) !important;
  border: 1px solid var(--ek-color-neutral-border) !important;
  border-radius: var(--ek-radius-dialog) !important;
  box-shadow: var(--ek-shadow-dialog) !important;
}

.selection-info {
  color: var(--ek-color-content-inverse);
}

.selection-title {
  letter-spacing: 0.08em;
}

.batch-divider {
  height: 30px;
  opacity: 0.2;
  border-color: var(--ek-color-content-inverse);
}

.bulk-action-btn {
  background: transparent !important;
  color: var(--ek-color-content-inverse) !important;
  transition: background-color var(--ek-motion-feedback), color var(--ek-motion-feedback);
  min-width: 80px !important;
  height: auto !important;
  padding: var(--ek-space-2) !important;

  &:hover {
    background: var(--ek-color-neutral-emphasis) !important;
  }

  .btn-label {
    font-size: var(--ek-type-micro-size);
    font-weight: var(--ek-font-weight-bold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
}

/* Hover Colors based on Action Type (koyu yüzey üstünde okunur açık ton) */
.success-btn:hover { color: var(--ek-color-success-border) !important; }
.error-btn:hover, .danger-btn:hover { color: var(--ek-color-error-border) !important; }
.info-btn:hover { color: var(--ek-color-info-border) !important; }
.warning-btn:hover { color: var(--ek-color-warning-border) !important; }
.primary-btn:hover { color: var(--ek-color-action-border) !important; }

.hover-opacity-100:hover {
  opacity: 1 !important;
}

.gap-2 {
  gap: var(--ek-space-2);
}
</style>
