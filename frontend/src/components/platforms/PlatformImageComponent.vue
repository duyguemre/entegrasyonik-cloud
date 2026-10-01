<template>
    <div @click="handleButtonClick" class="premium-platform-card" :class="[channelClass(integrationCode), {
        'is-active': !isSelectable || isActive,
        'is-selectable': isSelectable
    }]" :style="{
        'width': safeWidth ? (typeof safeWidth === 'number' ? safeWidth + 12 + 'px' : `calc(${safeWidth} + 12px)`) : 'auto'
    }">
        <div class="logo-box" :style="{ 'width': safeWidth + 'px', 'height': height + 'px' }">
            <!--             <v-img contain :src="src" :width="width" :height="height" :max-width="maxWidth" :max-height="maxHeight"
                class="platform-logo"></v-img>
 -->

            <!-- K13: kanal kimliği = kanal rozetinin kısa formu (koyu kenarlık + açık zemin) + uzun ad (tek kayıt). -->
            <div class="d-flex align-center ma-2 platform-mark">
                <EkChannelBadge :code="integrationCode" form="short" size="md" aria-hidden="true" />
                <span class="platform-name">{{ channelName(integrationCode) }}</span>
            </div>
        </div>
    </div>

</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import { channelClass, channelName } from '@entegrasyonik/ui/tokens'
import { EkChannelBadge } from '@entegrasyonik/ui/components'

const integrationStore = useIntegrationStore()
const src = ref('')
// C1: kanal rengi backend kaydının `color` alanından DEĞİL, tek kaynaktan (`channelClass` → `--ek-ch-brand`).

const emit = defineEmits(['select', 'click'])

const props = defineProps({
    integrationCode: { type: String, required: true },
    isSelectable: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false },
    width: { type: [String, Number], default: 80 },
    height: { type: [String, Number], default: 40 },
    maxWidth: { type: [String, Number] },
    maxHeight: { type: [String, Number] }
})

const safeWidth = computed(() => {
    // props.width varsa onu kullan (ve sayıya zorla), 
    // ama her halükarda 80'den küçük olmasına izin verme.
    return Math.max(Number(props.width) || 0, 110);
});

const loadIntegrationData = () => {
    const integration = integrationStore.getIntegration(props.integrationCode)
    if (integration) {
        src.value = integrationStore.getIntegrationImagePathByCode(props.integrationCode) ?? ''
    }
}

const handleButtonClick = () => {
    if (props.isSelectable) {
        emit('select', props.integrationCode)
    }
    emit('click', props.integrationCode)
}

onMounted(loadIntegrationData)
watch(() => props.integrationCode, loadIntegrationData)
</script>

<style scoped>
.premium-platform-card {
    position: relative;
    background: var(--ek-color-surface);
    border: 1px solid var(--ek-color-border-subtle);
    border-radius: var(--ek-radius-lg);
    padding: 0px;
    min-height: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    transition: border-color var(--ek-motion-reveal), background-color var(--ek-motion-reveal);
    vertical-align: middle;
    /* td içinde dikey hizalama garantisi */
}

/* Seçilebilir modda imleç değişsin */
.premium-platform-card.is-selectable {
    cursor: pointer;
}

.logo-box {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--ek-radius-sm);
    padding: 4px;
    padding-right: 12px;
    padding-left: 12px;
    filter: grayscale(0.8);
    opacity: 0.9;
    transition: opacity var(--ek-motion-reveal), filter var(--ek-motion-reveal);
}

.platform-logo {
    opacity: 0.9;
    filter: saturate(1.1);
}

/* --- AKTİF DURUM --- */
.premium-platform-card.is-active {
    border-color: var(--ek-ch-badge-border);
}

/* Seçili durum: kenarlık + alt vurgu çizgisi (zıplama/kayma yok — premium görsel dil). */


.premium-platform-card.is-active:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 30%;
    height: 3px;
    background: var(--ek-ch-badge-border);
    border-radius: var(--ek-radius-md) var(--ek-radius-md) 0 0;
}

.is-active .logo-box {
    opacity: 1;
    filter: grayscale(0);
}

.platform-mark {
    gap: var(--ek-space-2);
}

.platform-name {
    color: var(--ek-color-content-default);
    font-weight: var(--ek-font-weight-semibold);
    letter-spacing: -0.03em;
}
</style>