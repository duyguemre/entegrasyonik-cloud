<template>
    <div style="position:relative;height:48px;">
        <v-slider v-model="sliderValue" track-size="10" min="0" :thumb-size="32" class="ma-0 mt-3 mr-8 ml-8 mb-0"
            style="position:absolute;z-index:2;width:auto;left:0;right:0px" hide-details density="compact"
            color="processButtonColor" :max="sliderMax" @update:focused="updateSliderFocused"></v-slider>
    </div>
</template>
  
<script lang="ts" setup>
import { onActivated, onMounted, inject, onBeforeUnmount, onDeactivated } from 'vue';
import { ref, watch } from 'vue'
const eventBus: any = inject('eventBus');

var props = defineProps<{
    id: string,
}>()


var scrollElements: any = undefined
var sliderMax = ref(0)
var sliderValue = ref(0)

var pageResizeHandler = (data: boolean) => {
    init()
}

onMounted(() => {
    init()
    eventBus.on('pageResize', pageResizeHandler);

})
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
    scrollElements = document.querySelectorAll('.content-scroll-container');
    build()
/*     setTimeout(() => {
    }, 500)
 */}
var build = () => {
    if (scrollElements) {
        scrollAddListeners()
        calculateAndSetSliderMax()
    }
}

var calculateAndSetSliderMax = () => {
    const scrollElement = scrollElements[0];
    if (scrollElement?.scrollWidth)
        sliderMax.value = scrollElement.scrollWidth - scrollElement.clientWidth
}
var scrollAddListeners = () => {
    if (!scrollElements) return
    for (let scrollElement of scrollElements) {
        scrollElement.addEventListener('scroll', handleElementScroll);
    }
}
var scrollRemoveListeners = () => {
    if (!scrollElements) return
    for (let scrollElement of scrollElements) {
        scrollElement.removeEventListener('scroll', handleElementScroll);
    }
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
    if (sliderFocus == false)
        sliderValue.value = event.target.scrollLeft
    for (let scrollElement of scrollElements) {
        scrollElement.scrollLeft = sliderValue.value;
    }
    setTimeout(() => {
        scrollAddListeners()
    }, 1)
}

watch(sliderValue, (newValue, oldValue) => {
    scrollRemoveListeners()
    if (sliderFocus && scrollElements)
        scrollElements.forEach((scrollElement: any) => {
            scrollElement.scrollLeft = sliderValue.value;
        })
    setTimeout(() => {
        scrollAddListeners()
    }, 1)

});

</script>

<style scoped>
.v-slider--focused :deep(.v-slider-thumb__surface::before) {
    transform: scale(1) !important;
    background-color: blue;
}

.v-slider--focused :deep(.v-slider-thumb__ripple) {
    display: none;
}
</style>