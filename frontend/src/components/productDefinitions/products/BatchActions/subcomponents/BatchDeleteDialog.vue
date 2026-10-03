<template>
    <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" scrim persistent
        :retain-focus="false" no-click-animation :close-on-content-click="false"
        :attach="'.productBatchMenuActionPanel'" :contained="true" location="center" origin="center" max-width="400"
        width="100%">

        <v-card color="danger" class="pa-4 w-100 rounded-lg">
            <template v-slot:title>
                <div class="d-flex align-center justify-center text-wrap text-center">
                    <v-icon color="error" class="mr-2">mdi-alert-circle-outline</v-icon>
                    <span class="text-h6 font-weight-bold text-error">{{ hint }}</span>
                </div>
            </template>
            <template v-slot:text>
                <div class="d-flex justify-center text-body-1 mt-2">Bu işlemi onaylıyor musunuz?</div>

                <div class="mt-6 d-flex justify-center gap-4 flex-wrap">
                    <v-btn color="grey-darken-1" variant="outlined" @click="$emit('update:modelValue', false)"
                        class="flex-grow-1 bdd-s1">
                        Hayır
                    </v-btn>
                    <v-btn color="error" variant="flat" @click="$emit('deleteProducts')" class="flex-grow-1 bdd-s1">
                        Evet, Sil
                    </v-btn>
                </div>
            </template>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean, hint: string }>()
defineEmits(['update:modelValue', 'deleteProducts'])
</script>

<style scoped>
.gap-4 {
    gap: 16px;
}
</style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.bdd-s1 {
  max-width: 150px !important;
}
</style>
