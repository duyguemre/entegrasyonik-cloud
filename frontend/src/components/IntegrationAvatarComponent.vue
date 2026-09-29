<template>
    <v-avatar v-if="platform && platform.type"
        style="border-radius:5px!important;border:0px solid white;border-radius:0"
        class="mt-0 mr-0 mb-0 ml-0 mr-0 pa-3 text-center d-flex justify-center elevation-0"
        :style="{ width: width, height: height, 'background-color': platform.color }">
        <span v-if="mode == 'text'" class="text-white text-caption"
            style=" user-select: none;letter-spacing:-.4px!important">{{ platform.title }}</span>
        <v-img v-else :width="platform.width" :src="integrationStore.getIntegrationImagePath(platform)"></v-img>
    </v-avatar>
</template>

<script lang="ts" setup>
import { useIntegrationStore } from '@/stores/integrationStore';
const integrationStore: any = useIntegrationStore()
withDefaults(defineProps<{
    platform: any,
    width?: any,
    height?: any,
    mode?: string
}>(), {
    width: '70px',
    height: '70px',
    mode: 'image'
})
</script>

<style></style>