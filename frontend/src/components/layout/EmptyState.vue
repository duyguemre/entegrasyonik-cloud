<template>
  <div class="d-flex flex-column align-center justify-center px-4 text-center w-100 h-100 fill-height flex-grow-1" style="min-height: 300px;">
    <v-icon :icon="icon" :size="iconSize" color="content-subtle" class="mb-4"></v-icon>
    <div class="text-h6 text-grey-darken-1 font-weight-bold mb-1">{{ title }}</div>
    <div class="text-body-2 text-grey-lighten-1 mb-6 max-width-400">
      {{ message }}
    </div>
    <v-btn v-if="showAction" :color="actionColor" :variant="actionVariant" @click="$emit('action')"
      :prepend-icon="actionIcon" class="rounded-lg text-none px-6">
      {{ actionText }}
    </v-btn>
    <slot name="extra"></slot>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

/** Vuetify `VBtn` `variant` birleşimi (davranış değişmez; yalnızca tip daraltması — vue-tsc TS2322). */
type BtnVariant = 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'

defineProps({
  icon: {
    type: String,
    default: 'mdi-layers-off-outline'
  },
  iconSize: {
    type: [Number, String],
    default: 80
  },
  title: {
    type: String,
    default: 'Kayıt Bulunamadı'
  },
  message: {
    type: String,
    default: 'Arama kriterlerinize uygun herhangi bir kayıt bulunamadı.'
  },
  showAction: {
    type: Boolean,
    default: false
  },
  actionText: {
    type: String,
    default: 'Yeni Ekle'
  },
  actionIcon: {
    type: String,
    default: 'mdi-plus'
  },
  actionColor: {
    type: String,
    default: 'primary'
  },
  actionVariant: {
    type: String as PropType<BtnVariant>,
    default: 'tonal'
  }
})

defineEmits(['action'])
</script>

<style scoped>
.max-width-400 {
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
}

.opacity-60 {
  opacity: 0.6;
}
</style>
