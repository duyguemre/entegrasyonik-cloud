<!--
  frontend/src/components/help/HelpStartLink.vue — boş durumlarda "Nasıl başlanır?" yönlendirmesi (ilk kullanım).
  Mevcut boş durum bileşenlerinin eylem yuvasına konur (`EkListScreen #empty-action`); ilgili yardım makalesini açar.
-->
<template>
  <EkButton tone="ghost" size="sm" icon="mdi-lightbulb-on-outline" class="ek-help-start" data-help-start :data-article="article" @click="nav.openHelp(article)">
    {{ label }}
  </EkButton>
</template>

<script setup lang="ts">
import EkButton from '@/components/ds/EkButton.vue'
import { useHelpNavigation } from '@/help/useHelpNavigation'

withDefaults(defineProps<{ article: string; label?: string }>(), { label: 'Nasıl başlanır?' })
const nav = useHelpNavigation()
</script>
