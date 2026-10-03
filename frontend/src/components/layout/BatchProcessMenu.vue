<template>
  <v-slide-y-reverse-transition>
    <div v-if="modelValue.length > 0" class="batch-process-menu-wrapper">
      <v-card class="batch-process-menu px-4 py-3 d-flex align-center shadow-lg w-100">
        <!-- Selection Info -->
        <div class="selection-info d-flex align-center text-white">
          <v-chip color="white" text-color="primary" class="font-weight-black mr-3">
            {{ modelValue.length }}
          </v-chip>
          <span class="font-weight-bold text-uppercase text-caption" style="letter-spacing: 1px;">
            {{ title }}
          </span>
        </div>

        <v-divider vertical class="mx-6 bg-white opacity-20" style="height: 30px;"></v-divider>

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
          color="white"
          size="small"
          class="opacity-70 hover-opacity-100"
          @click="$emit('clear')"
        ></v-btn>
      </v-card>
    </div>
  </v-slide-y-reverse-transition>
</template>

<script setup lang="ts">
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
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600px;
  z-index: 1000;
}

.batch-process-menu {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 16px !important;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3) !important;
}

.bulk-action-btn {
  background: transparent !important;
  color: white !important;
  transition: all 0.3s ease;
  min-width: 80px !important;
  height: auto !important;
  padding: 8px !important;

  &:hover {
    background: rgba(255, 255, 255, 0.1) !important;
    transform: translateY(-2px);
  }

  .btn-label {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

/* Hover Colors based on Action Type */
.success-btn:hover { color: #10b981 !important; }
.error-btn:hover, .danger-btn:hover { color: #fb7185 !important; }
.info-btn:hover { color: #3b82f6 !important; }
.warning-btn:hover { color: #f59e0b !important; }
.primary-btn:hover { color: #6366f1 !important; }

.hover-opacity-100:hover {
  opacity: 1 !important;
}

.gap-2 {
  gap: 8px;
}
</style>
