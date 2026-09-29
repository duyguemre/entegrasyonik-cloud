<template>
    <v-list v-if="actionMenu" density="compact" class="pt-0"
        style="background-color:rgb(var(--v-theme-cardComponentHoverColor))">
        <v-list-subheader
            class="mt-0 d-flex align-center justify-start bg-primaryLightenMore text-white font-weight-bold">
            <v-tooltip location="top" :open-delay="700">
                <template #activator="{ props }">
                    <div v-bind="props">Toplu Ürün İşlemleri</div>
                </template>
                <span>İşlem, sadece bu ürün ve varyantları için bütün platformlara uygulanacaktır.</span>
            </v-tooltip>
        </v-list-subheader>

        <v-list-item @click="executeBatch(PLATFORM_PROCESS.TRANSFER)" class="font-weight-medium">
            <template #prepend><v-icon color="saveButtonColor" size="25"
                    style="opacity: 1;">mdi-cloud-upload</v-icon></template>Platformlara
            Yükle
        </v-list-item>
        <v-divider color="passiveColor" class="mx-5" />
        <v-list-item @click="executeBatch(PLATFORM_PROCESS.UPDATE)" class="font-weight-medium">
            <template #prepend><v-icon color="success" size="25"
                    style="opacity: 1;">mdi-sync</v-icon></template>Platformlarda
            Güncelle
        </v-list-item>
        <v-divider color="passiveColor" class="mx-5" />
        <v-list-item @click="executeBatch(PLATFORM_PROCESS.UPDATE_PRICE)" class="font-weight-medium">
            <template #prepend><v-icon color="success" size="25"
                    style="opacity: 1;">mdi-currency-try</v-icon></template>Platform
            Fiyatlarını Güncelle
        </v-list-item>
        <v-divider color="passiveColor" class="mx-5" />
        <v-list-item @click="executeBatch(PLATFORM_PROCESS.UPDATE_STOCK)" class="font-weight-medium">
            <template #prepend><v-icon color="success" size="25"
                    style="opacity: 1;">mdi-counter</v-icon></template>Platform
            Stoklarını Güncelle
        </v-list-item>
        <v-divider color="passiveColor" class="mx-5" />
        <v-list-item @click="executeBatch('FETCH_PRODUCT')" class="font-weight-medium">
            <template #prepend><v-icon color="primary" size="25"
                    style="opacity: 1;">mdi-cloud-download</v-icon></template>Platformdan
            Ürün Yükle
        </v-list-item>

        <v-divider color="passiveColor" class="my-2" style="border-width: 1px" />

        <v-list-item @click="executeBatch('EXPORT_EXCEL')" class="font-weight-medium">
            <template #prepend><v-icon color="success" size="25"
                    style="opacity: 1;">mdi-microsoft-excel</v-icon></template>Excel'e
            Aktar
        </v-list-item>
        <v-divider color="passiveColor" class="mx-5" />
        <v-list-item @click="executeBatch('IMPORT_EXCEL')" class="font-weight-medium">
            <template #prepend><v-icon color="primary" size="25"
                    style="opacity: 1;">mdi-file-excel-box</v-icon></template>Excel'den
            Güncelle
        </v-list-item>
        <v-divider color="passiveColor" class="mx-5" />
        <v-list-item @click="executeBatch('CHANGE_STATUS')" class="font-weight-medium">
            <template #prepend><v-icon color="warning" size="25"
                    style="opacity: 1;">mdi-toggle-switch</v-icon></template>Satış
            Durum Değiştir
        </v-list-item>
        <v-divider color="passiveColor" class="mx-5" />
        <v-list-item @click="executeBatch('SET_CATEGORY')" class="font-weight-medium">
            <template #prepend><v-icon color="info" size="25" style="opacity: 1;">mdi-shape</v-icon></template>Kategori
            Ata /
            Değiştir
        </v-list-item>
        <v-divider color="passiveColor" class="mx-5" />
        <v-list-item @click="executeBatch('SET_BRAND')" class="font-weight-medium">
            <template #prepend><v-icon color="info" size="25" style="opacity: 1;">mdi-watermark</v-icon></template>Marka
            Ata /
            Değiştir
        </v-list-item>
        <v-divider color="passiveColor" class="mx-5" />
        <v-list-item @click="executeBatch('SET_TAGS')" class="font-weight-medium">
            <template #prepend><v-icon color="info" size="25"
                    style="opacity: 1;">mdi-tag-multiple</v-icon></template>Etiket
            (Tag) Ata / Değiştir
        </v-list-item>
        <v-divider color="passiveColor" class="mx-5" />
        <v-list-item @click="executeBatch('DELETE')" class="font-weight-medium">
            <template #prepend><v-icon color="error" size="25" style="opacity: 1;">mdi-delete</v-icon></template>Toplu
            Sil
        </v-list-item>
    </v-list>
</template>

<script setup lang="ts">
import { PLATFORM_PROCESS } from '@/types/PlatformProcess';
defineProps<{ actionMenu: boolean }>()
const emit = defineEmits(['executeBatch'])

const executeBatch = (mode: string) => {
    emit('executeBatch', mode)
}
</script>