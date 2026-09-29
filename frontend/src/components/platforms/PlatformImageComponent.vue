<template>
    <div @click="handleButtonClick" class="premium-platform-card" :class="{
        'is-active': !isSelectable || isActive,
        'is-selectable': isSelectable
    }" :style="{
        '--brand-color': brandColor,
        'width': safeWidth ? (typeof safeWidth === 'number' ? safeWidth + 12 + 'px' : `calc(${safeWidth} + 12px)`) : 'auto'
    }">
        <div class="logo-box" :style="{ 'width': safeWidth + 'px', 'height': height + 'px' }">
            <!--             <v-img contain :src="src" :width="width" :height="height" :max-width="maxWidth" :max-height="maxHeight"
                class="platform-logo"></v-img>
 -->

            <div class="d-flex align-center ma-2">
                <v-avatar :color="brandColor" :size="Number(height) * 0.6" class="" style="margin-right:6px">
                    <span class="text-white font-weight-black text-h6" style="text-transform: capitalize!important;"
                        :style="{
                            fontSize: 'calc(' + height + 'px / 2.5)!important',
                            lineHeight: 1,
                            textTransform: 'capitalize!important'
                        }">{{
                            integrationCode?.charAt(0) }}</span>
                </v-avatar> <span class="" :style="{ color: brandColor }"
                    style="font-weight:600;letter-spacing: -0.03em;">{{
                        integrationCode?.charAt(0).toUpperCase() + integrationCode?.slice(1)
                    }}</span>
            </div>
        </div>
    </div>

</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore'

const integrationStore = useIntegrationStore()
const src = ref('')
const brandColor = ref('#eee')

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
        brandColor.value = integration.color || '#eee'
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
    background: #ffffff;
    border: 1px solid rgb(var(--v-theme-borderColorLight));
    border-radius: 12px;
    padding: 0px;
    min-height: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    transition: all 0.25s ease-out;
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
    border-radius: 4px;
    padding: 4px;
    padding-right: 12px;
    padding-left: 12px;
    filter: grayscale(0.8);
    opacity: 0.9;
    transition: all 0.3s ease;
}

.platform-logo {
    opacity: 0.9;
    filter: saturate(1.1);
}

/* --- AKTİF DURUM --- */
.premium-platform-card.is-active {
    border-color: var(--brand-color);
    background: rgb(from var(--brand-color) r g b / 0.08);
}

/* --- KAYDIRMA EFEKTİ: SADECE SEÇİLEBİLİRSE --- */
.premium-platform-card.is-selectable.is-active {
    transform: translateY(-6px);
    /* Sadece selectable olduğunda yukarı kayar */
}


.premium-platform-card.is-active:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 30%;
    height: 3px;
    background: var(--brand-color);
    border-radius: 10px 10px 0 0;
}

.is-active .logo-box {
    opacity: 1;
    filter: grayscale(0);
}
</style>