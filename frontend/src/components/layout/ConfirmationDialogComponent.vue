<template>
    <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)"
        :persistent="persistent" :scrim="true" :retain-focus="false" :close-on-content-click="false"
        :contained="!!attach"
        :attach="attach ? (typeof attach === 'string' && !attach.startsWith('.') ? '.' + attach : attach) : false"
        location="center" origin="center" no-click-animation class="premium-confirmation-dialog">
        <div class="dialog-content-wrapper" :style="{ maxWidth: maxWidth }">
            <v-card class="confirmation-card rounded-xl overflow-hidden elevation-24"
                :style="{ borderTop: `6px solid rgb(var(--v-theme-${color}))` }">

                <div class="tonal-overlay" :style="{ backgroundColor: `rgb(var(--v-theme-${color}))` }"></div>

                <v-card-item class="pa-5 relative-content">
                    <template v-slot:prepend>
                        <v-avatar :color="color" size="48" class="mr-3 elevation-2">
                            <v-icon color="white" size="28">{{ icon }}</v-icon>
                        </v-avatar>
                    </template>

                    <v-card-title class="text-h6 font-weight-black text-uppercase tracking-wide"
                        :style="{ color: `rgb(var(--v-theme-${color}))` }">
                        {{ title }}
                    </v-card-title>

                    <v-card-subtitle class="mt-n1 text-wrap font-weight-bold">
                        {{ subtitle }}
                    </v-card-subtitle>
                </v-card-item>

                <v-card-text class="px-6 py-2 text-body-2 text-grey-darken-4 relative-content">
                    <slot>
                        <div class="d-flex align-center justify-center py-2 font-weight-medium">
                            <!-- G-01: v-html KALDIRILDI. `message` düz metin ya da güvenli `MessagePart[]`
                                 (bkz. messageParts.ts); içerik her zaman metin düğümü olarak basılır. -->
                            <div>
                                <template v-if="Array.isArray(message)">
                                    <template v-for="(part, index) in message" :key="index">
                                        <br v-if="part.type === 'break'" />
                                        <b v-else-if="part.type === 'emphasis'">{{ part.text }}</b>
                                        <small v-else-if="part.type === 'note'">{{ part.text }}</small>
                                        <template v-else>{{ part.text }}</template>
                                    </template>
                                </template>
                                <template v-else>{{ message }}</template>
                            </div>
                        </div>
                    </slot>
                </v-card-text>

                <v-card-actions class="pa-5 pt-2 relative-content">

                    <v-btn variant="outlined" color="passiveColor"
                        class="bg-white premium-save-btn flex-grow-1 flex-sm-grow-0" @click="onCancel">
                        <v-icon start size="18">mdi-undo-variant</v-icon>
                        {{ cancelText || $t('common.cancel') }}
                    </v-btn>

                    <v-spacer></v-spacer>

                    <v-btn block :color="color" elevation="2" variant="flat"
                        class="text-none font-weight-bold premium-save-btn flex-grow-1 flex-sm-grow-0"
                        @click="onConfirm" :loading="loading">
                        <v-icon start class="mr-1" v-if="icon">{{ icon }}</v-icon>
                        {{ confirmText || $t('common.confirm') }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </div>
    </v-dialog>
</template>

<script setup lang="ts">
/**
 * Unibox Premium Confirmation Layout - V2.1 (Fixed Positioning)
 */
import type { MessagePart } from './messageParts'

interface Props {
    modelValue: boolean;
    title?: string;
    subtitle?: string;
    /** Düz metin (her zaman metin olarak basılır) veya güvenli parça dizisi (kalın/satır sonu/not). HTML KABUL ETMEZ. */
    message?: string | MessagePart[];
    icon?: string;
    confirmIcon?: string;
    color?: string;        // 'danger', 'error', 'warning', 'info', 'success'
    confirmText?: string;
    cancelText?: string;
    cancelColor?: string;
    maxWidth?: string | number;
    persistent?: boolean;
    loading?: boolean;
    attach?: string | boolean | Element;
}

const props = withDefaults(defineProps<Props>(), {
    icon: 'mdi-alert-octagon',
    color: 'danger',
    maxWidth: '420px',
    persistent: true,
    cancelColor: 'white',
    loading: false,
    attach: false,
    title: ''
});

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel']);

const onConfirm = () => { emit('confirm'); };
const onCancel = () => { emit('update:modelValue', false); emit('cancel'); };
</script>

<style scoped>
/* Vuetify'ın overlay içeriğini dikeyde ortalaması ve 
   full-height olmasını engellemek için derinlemesine müdahale 
*/
:deep(.v-overlay__content) {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    min-height: 100% !important;
    width: 100% !important;
    pointer-events: none;
    /* Tıklamaların arkaya geçmemesi için kartta override edilecek */
}

.dialog-content-wrapper {
    width: 100%;
    pointer-events: auto;
    /* Tıklamaları tekrar aktif et */
    display: flex;
    justify-content: center;
}

.confirmation-card {
    width: 100%;
    position: relative;
    border: 1px solid rgba(var(--v-theme-borderColor), 0.2);
    background: #ffffff;
    /* Kendi boyutundan fazla büyümesini engelle */
    height: auto !important;
}

.tonal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0.05;
    pointer-events: none;
}

.relative-content {
    position: relative;
    z-index: 1;
}

.tracking-wide {
    letter-spacing: 1px !important;
}

.border-light {
    border: 1px solid rgba(255, 255, 255, 0.3) !important;
}

.elevation-24 {
    box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.2) !important;
}
</style>