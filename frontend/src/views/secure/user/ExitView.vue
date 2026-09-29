<template>
  <div>
    EXIT
  </div>
</template>

<script setup lang="ts">
import { onBeforeMount } from 'vue';
import useRestApi from '@/composables/restapi';
import { useRouter } from 'vue-router'
const router = useRouter()

const restApi = useRestApi()

onBeforeMount(() => {
})

</script>

<style></style>