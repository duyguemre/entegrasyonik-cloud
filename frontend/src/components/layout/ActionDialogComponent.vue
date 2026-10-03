<template>
    <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" scrim persistent
        :retain-focus="false" no-click-animation :close-on-content-click="false" :attach="attach" :contained="!!attach"
        location="center" origin="center" width="100%" class="premium-universal-dialog">
        <div class="premium-dialog-wrapper elevation-24" :style="{ maxWidth: maxWidth, margin: '0 auto' }">
            <div class="dialog-header pa-4 d-flex align-center">
                <div class="header-icon-box mr-4" :style="iconBoxStyle">
                    <v-icon :icon="icon" :color="color" size="28"></v-icon>
                </div>
                <div class="header-titles">
                    <div class="text-h6 font-weight-bold leading-tight color-dark">
                        {{ title }}
                    </div>
                    <div v-if="subtitle" class="text-caption opacity-60 font-weight-medium">
                        {{ subtitle }}
                    </div>
                </div>
                <v-spacer />
                <v-btn icon="mdi-close" variant="tonal" color="passiveColor" size="small" @click="handleClose"
                    class="close-btn"></v-btn>
            </div>

            <div class="dialog-body">

                <div class="info-banner pa-2 mt-1 mb-2" v-if="hint">
                    <div class="d-flex align-start">
                        <v-icon icon="mdi-information-outline" size="small" class="mr-2"></v-icon>
                        <div class="text-caption font-italic opacity-80">{{ hint }}</div>
                    </div>
                </div>


                <div class="pa-4 pt-2">
                    <slot></slot>
                </div>
            </div>

            <div v-if="showFooter" class="dialog-footer pa-4 d-flex">

                <v-btn variant="outlined" :color="color" class="bg-white premium-save-btn flex-grow-1 flex-sm-grow-0"
                    @click="$emit('cancel')">
                    <v-icon start size="18">mdi-undo-variant</v-icon>
                    {{ cancelText }}
                </v-btn>

                <v-spacer />


                <v-btn block :color="confirmButtomColor" elevation="2" icon="mdi-start"
                    class="text-none font-weight-bold premium-save-btn flex-grow-1 flex-sm-grow-0" style="width:auto"
                    @click="$emit('confirm')" :disabled="isConfirmDisabled">
                    <v-icon start size="18">mdi-timer-play-outline</v-icon>

                    {{ confirmText }}
                </v-btn>


            </div>
        </div>
    </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
    modelValue: { type: Boolean, required: true },
    title: { type: String, required: true },
    subtitle: { type: String, default: 'Toplu İşlem Merkezi' },
    icon: { type: String, default: 'mdi-view-dashboard-outline' },
    color: { type: String, default: 'primary' },
    confirmButtomColor: { type: String, default: 'passiveColor' },
    hint: { type: String, default: '' },
    maxWidth: { type: [String, Number], default: 580 },
    attach: { type: String, default: '' },
    showFooter: { type: Boolean, default: true },
    cancelText: { type: String, default: 'Temizle' },
    confirmText: { type: String, default: 'İşlemi Başlat' },
    isConfirmDisabled: { type: Boolean, default: false },
    isLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel', 'close', 'change'])

const handleClose = () => {
    emit('close')
    emit('update:modelValue', false)
}

const iconBoxStyle = computed(() => {
    // Vuetify tema renkleri için güvenli bir opacity (0.15) uygulaması
    return {
        backgroundColor: `rgba(var(--v-theme-${props.color}), 0.12)`,
        border: `1px solid rgba(var(--v-theme-${props.color}), 0.1)`
    }
})
</script>

<style scoped>
/* =========================================
   1. GENEL DIALOG TASARIMI
   ========================================= */
.premium-dialog-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: 90vh;
    border-radius: 20px;
    /* Modern oval köşeler */
    background: #ffffff;
    overflow: hidden;
    margin: 0 auto;
}

/* Header: Hafif gri arka plan (ilk örnekteki gibi) */
.dialog-header {
    flex-shrink: 0;
    background: rgb(var(--v-theme-cardComponentColor), 0.5);
    border-bottom: 1px solid #e2e8f0;
}

.header-icon-box {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.color-dark {
    color: rgb(var(--v-theme-passiveColor), 1) !important;
    /* Slate 900 */
}

/* =========================================
   2. BODY & BANNER (Slate UI)
   ========================================= */
.dialog-body {
    flex-grow: 1;
    overflow-y: auto;
    background: #ffffff;
}

.info-banner {
    background: #f1f5f9;
    color: #475569;
    border-bottom: 1px dashed #cbd5e1;
}


.info-icon {
    color: #64748b;
}

/* =========================================
   3. FOOTER & BUTONLAR
   ========================================= */
.dialog-footer {
    flex-shrink: 0;
    background: rgb(var(--v-theme-cardComponentColor), 0.5);
    border-top: 1px solid #e2e8f0;
}

.action-btn {
    border-radius: 12px !important;
    letter-spacing: 0.5px;
    transition: all 0.2s ease;
}

.cancel-btn {
    border-radius: 12px !important;
    border: 1px solid #cbd5e1 !important;
}


/* =========================================
   4. SCROLLBAR ÖZELLEŞTİRME
   ========================================= */
.dialog-body::-webkit-scrollbar {
    width: 5px;
}

.dialog-body::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 10px;
}

/* =========================================
   5. MOBİL UYUMLULUK
   ========================================= */
@media (max-width: 600px) {
    .premium-dialog-wrapper {
        max-height: 100vh;
        border-radius: 12px;
        margin: 8px;
    }
}
</style>