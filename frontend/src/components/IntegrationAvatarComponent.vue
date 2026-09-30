<template>
    <v-avatar v-if="platform && platform.type"
        class="integration-avatar mt-0 mr-0 mb-0 ml-0 mr-0 pa-3 text-center d-flex justify-center elevation-0"
        :style="{ width: width, height: height, 'background-color': platform.color }">
        <span v-if="mode == 'text'" class="integration-avatar__title text-caption">{{ platform.title }}</span>
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

<style scoped>
/* platform.color VERİdir (dinamik :style ile); sabit kısımlar token'lıdır. */
.integration-avatar {
    border-radius: var(--ek-radius-none) !important;
    border: 0;
    color: var(--ek-color-content-inverse);
}

.integration-avatar__title {
    user-select: none;
    letter-spacing: -0.4px !important;
    color: var(--ek-color-content-inverse);
}
</style>