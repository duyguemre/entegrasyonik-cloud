<template>
    <v-snackbar v-for="(snackbar, index) in snackbarStore.snackbars" :key="snackbar.id" v-model="snackbar.show"
        :color="snackbar.color" :timeout="snackbar.timeout" class="custom-snackbar" :style="{
            bottom: `${(index * 98) + 20}px`,
            zIndex: 9999 + index
        }">
        <div class="d-flex align-center w-100">
            <div class="mr-3 flex-shrink-0">
                <v-icon size="24" color="action-contrast">{{ getIconByColor(snackbar.color) }}</v-icon>
            </div>

            <div class="font-weight-bold text-body-2 snackbar-text">
                {{ snackbar.text }}
            </div>
        </div>

        <v-progress-linear height="6" color="action-contrast" absolute bottom class="snackbar-progress"
            :style="{ animationDuration: snackbar.timeout + 'ms' }" />

        <template #actions>
            <v-btn icon variant="text" size="small" aria-label="Bildirimi kapat" @click="snackbarStore.removeSnackbar(snackbar.id)">
                <v-icon size="18">mdi-close</v-icon>
            </v-btn>
        </template>
    </v-snackbar>
</template>

<script setup lang="ts">
import { useSnackbarStore } from '@/stores/snackbarStore';
const snackbarStore = useSnackbarStore();

const getIconByColor = (color: string) => {
    switch (color) {
        case 'success': return 'mdi-check-circle'
        case 'error': return 'mdi-alert-octagon'
        case 'warning': return 'mdi-alert'
        case 'info': return 'mdi-information'
        default: return 'mdi-bell'
    }
}
</script>

<style scoped>
.custom-snackbar {
    transition: bottom var(--ek-duration-base) var(--ek-easing-standard) !important;
    /* TAŞMA ÇÖZÜMÜ: Kapsayıcıyı sağa sabitliyoruz */
    position: fixed !important;
    left: auto !important;
    right: 20px !important;
    width: 450px !important;
}

/* Vuetify'ın iç overlay katmanının taşmasını engelliyoruz */
:deep(.v-overlay__content) {
    right: 0 !important;
    left: auto !important;
    margin: 0 !important;
    width: 450px !important;
    transform: none !important;
    /* Sağa iten translate etkisini sıfırlar */
}

:deep(.v-snackbar__wrapper) {
    margin: 0 !important;
    min-width: 450px !important;
    max-width: 450px !important;
    height: 88px !important;
    min-height: 88px !important;
    border: 1px solid color-mix(in srgb, var(--ek-color-action-contrast) 10%, transparent) !important;
    box-shadow: var(--ek-shadow-popover) !important;
    display: flex !important;
    align-items: center !important;
    border-radius: var(--ek-radius-control) !important;
}

:deep(.v-snackbar__content) {
    padding: 12px 16px !important;
    padding-right: 48px !important;
    width: 100%;
}

.snackbar-text {
    line-height: var(--ek-line-height-tight);
    overflow: hidden;
}


.snackbar-progress {
    width: 100%;
    background-color: color-mix(in srgb, var(--ek-color-action-contrast) 20%, transparent) !important;
    animation-name: shrink-progress;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
    opacity: 1 !important;
}

@keyframes shrink-progress {
    from {
        width: 100%;
    }

    to {
        width: 0%;
    }
}
</style>