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

            <div class="d-flex align-center ma-2">
                <v-avatar :size="Number(height) * 0.6" class="platform-avatar">
                    <span class="font-weight-black text-h6 platform-avatar__letter"
                        :style="{ fontSize: 'calc(' + height + 'px / 2.5)!important' }">{{
                            integrationCode?.charAt(0) }}</span>
                </v-avatar> <span class="platform-name">{{
                        integrationCode?.charAt(0).toUpperCase() + integrationCode?.slice(1)
                    }}</span>
            </div>
        </div>
    </div>

</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import { channelClass } from '@/design/channels'

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
    transition: border-color var(--ek-duration-base) var(--ek-easing-standard), background-color var(--ek-duration-base) var(--ek-easing-standard);
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
    transition: opacity var(--ek-duration-base) var(--ek-easing-standard), filter var(--ek-duration-base) var(--ek-easing-standard);
}

.platform-logo {
    opacity: 0.9;
    filter: saturate(1.1);
}

/* --- AKTİF DURUM --- */
.premium-platform-card.is-active {
    border-color: var(--ek-ch-brand);
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
    background: var(--ek-ch-brand);
    border-radius: var(--ek-radius-md) var(--ek-radius-md) 0 0;
}

.is-active .logo-box {
    opacity: 1;
    filter: grayscale(0);
}

.platform-avatar {
    margin-right: var(--ek-space-1);
    background: var(--ek-ch-brand);
    box-shadow: inset 0 0 0 1px var(--ek-channel-ring);
}

.platform-avatar__letter {
    color: var(--ek-ch-on-brand);
    line-height: 1;
    text-transform: capitalize;
}

.platform-name {
    color: var(--ek-color-content-default);
    font-weight: var(--ek-font-weight-semibold);
    letter-spacing: -0.03em;
}
</style>