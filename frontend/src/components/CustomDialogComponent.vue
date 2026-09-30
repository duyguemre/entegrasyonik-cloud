<template>
    <span ref="customDialogSlot" @mousedown="doIt">
        <slot />
    </span>

    <div v-if="show" class="custom-dialog popup-element" :class="[activeClass]"
        :style="{ 'top': firstPosition.top + 'px', 'left': firstPosition.left + 'px', 'bottom': firstPosition.bottom + 'px', 'right': firstPosition.right + 'px' }">
        <div class="custom-dialog-overlay" @click="close">
        </div>

        <v-card class="d-flex ma-4 custom-dialog-workplace" variant="outlined" elevated=2>
            <div class="mt-0 mr-0 close-button" v-if="showComponent">
                <v-btn size="30" class="mb-0" block flat color="neutral" aria-label="Kapat" @click="close"><v-icon
                        size="25">mdi-window-close</v-icon></v-btn>
            </div>
            <div class="pa-2 pt-0 pr-5 popup-scroll flex-1-0" variant="flat">
                <v-card variant="text">
                    <v-card-title v-if="showComponent">
                        {{ title }}
                    </v-card-title>
                    <v-card-text>
                            <component :is="component" @close="close" v-if="showComponent"/>
                    </v-card-text>
                </v-card>
            </div>            
            <ScrollComponent  v-if="showComponent" id=".popup-element .popup-scroll" :isExpandable="false" class="mt-2"/>
        </v-card>

    </div>
</template>
  
<script lang="ts" setup>
export interface Props {
    component?: any,
    title: string,
}
import { ref, watch, onMounted, onActivated,onBeforeUnmount, inject } from 'vue'
import useCommunication from '@/composables/site/communication';
const eventBus: any = inject('eventBus');
var communication: any = useCommunication(eventBus)

/* var show = defineModel({ default: false }) */
var show = ref(false)
var props = withDefaults(defineProps<Props>(), {
    component: undefined,
})
var customDialogSlot: any = ref(null)
var activeClass: any = ref()
var firstPosition:any = ref({
    left: 0,
    right: 0,
    bottom: 0,
    top: 0
})

onBeforeUnmount(()=> {
/*     show.value = null */
    activeClass.value = null
    customDialogSlot.value = null
    firstPosition.value = null
/*     showComponent.value = null */

})

var doIt = (event: any) => {
    let pos = customDialogSlot.value?.getBoundingClientRect()
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    firstPosition.value = {
        left: event.clientX,
        top: event.clientY,
        right: pos?.right,
        bottom: pos?.bottom - 100
    }
    open()
}

onMounted(() => {
    const computedStyle = window.getComputedStyle(customDialogSlot.value);
    const marginTop = computedStyle.getPropertyValue('top');
    let pos = customDialogSlot.value?.getBoundingClientRect()
    if (pos) {
        firstPosition.value = {
            left: pos?.left + (pos?.right - pos?.left) / 2,
            top: pos?.top + (pos?.top - pos?.bottom) / 2 - 100,
            right: pos?.right,
            bottom: pos?.bottom - 100
        }
    }
    communication.onKeydown(close)
})

var showComponent = ref(true)
var open = () => {
    show.value = true
    showComponent.value=true 
    setTimeout(() => {
        activeClass.value = 'active'
    }, 1)
}
var close = () => {
    showComponent.value = false
    if (show.value == false) return false
    activeClass.value = ''
    setTimeout(() => {
        show.value = false
    }, 400)
    communication.broadcastPageResize()
    return true
}
</script>
  
<style scoped>
.hide-component {
    display:none
}

.scroll-position {
    position: relative;
    margin-top: 60px !important;
    margin-bottom: 50px !important
}

.close-button {
    position: absolute;
    top: 0px;
    right: 0 !important;
    left: 0;
    width: 0;
    z-index: 1;

}

.active .close-button {
    width: 100%;
}

.custom-dialog {
    position: fixed;
    z-index: 1006;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    background-color: transparent;
    opacity: 1;
    transition:
        all var(--ek-duration-base) var(--ek-easing-standard),
        opacity var(--ek-duration-base) var(--ek-easing-standard);
}

.custom-dialog .custom-dialog-workplace {
    opacity: .06;
    transition: all var(--ek-duration-base) var(--ek-easing-standard), opacity var(--ek-duration-base) var(--ek-easing-standard);
    visibility: hidden !important;
    border-radius: var(--ek-radius-card);
    border-color: var(--ek-color-border-strong);
    position: absolute;
    bottom: 0;
    top: 0;
    left: 0;
    right: 0;
    height: auto;
    width: auto;
    background-color: var(--ek-color-surface-sunken);
    z-index: 1;
    padding-top: 0;
}

.active .custom-dialog-workplace {
    transition: opacity var(--ek-duration-fast) var(--ek-easing-standard);
    padding-top: 24px !important;
    border: none;
}

.custom-dialog.active .custom-dialog-workplace {
    opacity: 1;
    visibility: visible !important
}


.custom-dialog .custom-dialog-overlay {
    opacity: 0;
    transition: all var(--ek-duration-base) var(--ek-easing-standard), opacity var(--ek-duration-fast) var(--ek-easing-standard);
    visibility: hidden !important;
    border-top: 1px solid var(--ek-color-border-strong);
    background-color: var(--ek-color-scrim);
    position: absolute;
    top: 1px;
    bottom: 0;
    left: 0;
    right: 0;
    width: auto;
    height: auto;
}

.custom-dialog.active .custom-dialog-overlay {
    opacity: .2;
    transition: all var(--ek-duration-base) var(--ek-easing-standard), opacity var(--ek-duration-base) var(--ek-easing-standard);
    visibility: visible !important;
}

.custom-dialog.active {
    opacity: 1;
    top: 104px !important;
    right: 0 !important;
    left: 0 !important;
    bottom: 0 !important;
    width: 100%;
    height: calc(100% - 104px);
}

.popup-scroll {
    overflow: auto;
}

.popup-scroll::-webkit-scrollbar {
    display: none
}
</style>  