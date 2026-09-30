<template>
    <div class="scroll-component text-center">
        <ExpandComponent class="mb-1 ml-2" v-if="isExpandable != false" />
        <v-slider direction="vertical"
            :class="isExpandable ? 'scroll-component__slider--expandable' : 'scroll-component__slider--compact'"
            density="default" track-size="8" reverse v-model="sliderValue" min="0"
            class="scroll-component__slider v-slider--focused" hide-details :thumb-size="32" color="content-muted" :max="sliderMax"
            @update:focused="updateSliderFocused"></v-slider>
    </div>
</template>

<script lang="ts" setup>
import { onActivated, onDeactivated, onMounted, onBeforeUnmount, inject } from 'vue';
import { ref, watch } from 'vue'
import ExpandComponent from '@/components/utility/ExpandComponent.vue';
const eventBus: any = inject('eventBus');

var props = defineProps<{
    id: string,
    isExpandable: boolean
}>()

var scrollElement: any = undefined
var sliderMax = ref(0)
var sliderValue = ref(0)


onMounted(() => {
    init()
    eventBus.on('pageResize', pageResizeHandler);
})
var pageResizeHandler = (data: boolean) => {
    init()
}
onBeforeUnmount(() => {
    scrollRemoveListeners()
    eventBus.off('pageResize', pageResizeHandler)
})
onDeactivated(() => {
    scrollRemoveListeners()
    eventBus.off('pageResize', pageResizeHandler)
})

onActivated(() => {
    init()
})

var init = () => {
    sliderMax.value = 0
    setTimeout(() => {
        scrollElement = document.querySelector(props.id)
        build()
    }, 500)
}
var build = () => {
    if (scrollElement) {
        calculateAndSetSliderMax()
        scrollAddListeners()
    }
}

var calculateAndSetSliderMax = () => {
    if (scrollElement && scrollElement.scrollHeight)
        sliderMax.value = scrollElement?.scrollHeight - scrollElement?.clientHeight
}

var scrollAddListeners = () => {
    scrollRemoveListeners()
    if (scrollElement)
        scrollElement.addEventListener('scroll', handleElementScroll);
}
var scrollRemoveListeners = () => {
    if (scrollElement)
        scrollElement.removeEventListener('scroll', handleElementScroll);
}

var sliderFocus = false
var updateSliderFocused = (value: any) => {
    sliderFocus = value
    if (sliderFocus == true) {
        scrollRemoveListeners()
    } else {
        scrollAddListeners()
    }
}

var handleElementScroll = (event: any) => {
    scrollRemoveListeners()
/*     if (sliderFocus == false)
 */        sliderValue.value = event.target.scrollTop
    scrollElement.scrollTop = sliderValue.value;
    setTimeout(() => {
        scrollAddListeners()
    }, 1)
}

watch(sliderValue, (newValue, oldValue) => {
    scrollRemoveListeners()
    if (sliderFocus && scrollElement)
        scrollElement.scrollTop = sliderValue.value;
    setTimeout(() => {
        scrollAddListeners()
    }, 1)

});

</script>

<style scoped>
.scroll-component {
    width: 50px;
    background-color: transparent;
    padding-top: var(--ek-space-1);
    padding-bottom: var(--ek-space-8);
}

.scroll-component__slider {
    height: 100% !important;
}

.scroll-component__slider--expandable {
    padding-top: 0;
    padding-bottom: var(--ek-space-8);
}

.scroll-component__slider--compact {
    padding-top: var(--ek-space-1);
    padding-bottom: var(--ek-space-1);
}

.v-slider--focused :deep(.v-slider-thumb__surface::before) {
    transform: scale(1) !important;
    background-color: var(--ek-color-info);
}

.v-slider--focused :deep(.v-slider-thumb__surface) {
    border: 1px solid var(--ek-color-surface) !important
}

.v-slider--focused :deep(.v-slider-thumb__ripple) {
    display: none;
}
</style>