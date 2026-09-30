<!--
  Küçük satır içi "çalışıyor" göstergesi (araç durumu, onay "uygulanıyor", panel yükleniyor). Paketteki TEK döner öğe;
  reduced-motion'da yerine sabit kum saati ikonu çizilir. İskelet/örtü gerektirmeyen 14–20 px durum simgesidir.
-->
<template>
  <span class="ek-chat-spinner" aria-hidden="true">
    <v-progress-circular class="ek-chat-spinner__ring" indeterminate :size="size" :width="2" /><!-- ek-pattern-exception: rawSpinner — satır içi durum simgesi (EkSkeleton/EkLoadingOverlay alan kaplar), reduced-motion yedeği aşağıda -->
    <v-icon class="ek-chat-spinner__static" icon="mdi-timer-sand" size="small" />
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 14 })
</script>
