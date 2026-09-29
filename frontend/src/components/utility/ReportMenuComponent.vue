<template>
        <v-menu>
            <template v-slot:activator="{ props }">
                <v-btn v-bind="props" style="width:190px;" elevation=2 class="text-capitalize" color="processButtonColor">
                    <v-icon class="mr-1" >mdi-finance</v-icon> {{ reportsMenu.title }}<v-icon class="ml-1"
              size="20">mdi-menu-down</v-icon>
                </v-btn>
            </template>
            <v-card width="300">
                <div class="ma-4 mb-1 text-caption font-weight-tiny text-center"><v-icon color="grey"
                        class="mr-1 font-weigth-small">mdi-lightbulb-outline</v-icon>{{ reportsMenu.desc }}</div>
                <v-divider />
                <v-list density="compact" nav>
                    <v-list-item :prepend-icon="link.icon" :title="link.title" v-for="link of reportsMenu.list"
                        :value="link.path" :to="link.path"></v-list-item>
                </v-list>
            </v-card>
        </v-menu>
</template>
  
<script lang="ts" setup>
import { ref, inject, onMounted,onActivated,onDeactivated } from 'vue'
onMounted(() => {
})


defineProps<{
    reportsMenu: any
}>()

</script>
  
<style></style>
  