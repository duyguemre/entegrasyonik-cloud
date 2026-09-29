<template>
    <ActionDialogComponent v-model="show" title="Manuel Fatura Girişi"
        subtitle="E-Fatura entegrasyonu bulunmayan siparişler için belge kaydı" icon="mdi-file-document-edit-outline"
        color="primary" confirm-buttom-color="primary" confirm-text="Faturayı Kaydet" cancel-text="Vazgeç"
        hint="Girilen bilgiler sipariş detayına işlenecek ve pazar yerine iletilecektir." max-width="600px"
        :is-confirm-disabled="isFormInvalid" @confirm="handleSubmit" @close="handleClose" attach="orderListView">
        <v-form ref="formRef" @submit.prevent="handleSubmit">
            <EkFormGrid :columns="2">
                    <v-text-field class="ek-span-full" v-model="form.invoiceNumber" label="Fatura Numarası"
                        placeholder="Örn: GİB202600000012"
                        :rules="[v => !!v || 'Fatura numarası zorunludur']" autofocus></v-text-field>
                    <v-text-field class="ek-span-full" v-model="form.invoiceLink" label="Fatura PDF Linki"
                        placeholder="https://..."
                        prepend-inner-icon="mdi-link-variant"></v-text-field>
                    <v-select v-model="form.documentType" :items="['E_ARSIV', 'E_FATURA']"
                        label="Belge Türü"></v-select>
                    <v-menu v-model="invoiceDateMenuInline" :close-on-content-click="false">
                        <template v-slot:activator="{ props }">
                            <v-text-field :model-value="formatDisplayDate(form.issueDate)" label="Fatura Tarihi"
                                prepend-inner-icon="mdi-calendar" readonly v-bind="props"
                                append-inner-icon="mdi-close-circle"
                                @click:append-inner.stop="resetDateToToday"></v-text-field>
                        </template>
                        <v-card class="rounded-lg">
                            <v-date-picker v-model="form.issueDate" :max="new Date()" hide-header locale="tr"
                                color="primary" @update:model-value="onDateSelected"></v-date-picker>
                        </v-card>
                    </v-menu>
            </EkFormGrid>
        </v-form>
    </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import EkFormGrid from '@/components/ds/EkFormGrid.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';

// State yönetimi
const show = ref(false);
const invoiceDateMenuInline = ref(false)
const formRef = ref();
let resolvePromise: (value: any) => void;

const form = reactive({
    invoiceNumber: '',
    invoiceLink: '',
    documentType: 'E_ARSIV',
    // String yerine doğrudan Date objesi olarak başlatıyoruz
    issueDate: new Date(),
    invoiceMethod: 'MANUAL'
});

// Tarihi bugüne çeken fonksiyonu garantiye alalım
const resetDateToToday = (e?: Event) => {
    if (e) e.stopPropagation(); // Menünün açılmasını engelle
    form.issueDate = new Date();
};

// Tarihi ekranda güzel göstermek için (GG.AA.YYYY)
const formatDisplayDate = (date: any) => {
    if (!date) return ""; // Eğer tarih temizlendiyse boş string dön
    const d = new Date(date);
    // Geçersiz tarih kontrolü
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString('tr-TR');
};

const onDateSelected = (val: any) => {
    if (!val) return;
    const selectedDate = Array.isArray(val) ? val[0] : val;
    form.issueDate = new Date(selectedDate);
    invoiceDateMenuInline.value = false;
};

const open = () => {
    show.value = true;

    // Formu tamamen sıfırla ve Date objesi olarak başlat
    form.invoiceNumber = '';
    form.invoiceLink = '';
    form.documentType = 'E_ARSIV';
    form.issueDate = new Date(); // Reset anında bugünün tarihi

    return new Promise((resolve) => {
        resolvePromise = resolve;
    });
};

// Computed bir değer ekleyerek buton kontrolünü daha sağlam yapabilirsin
const isFormInvalid = computed(() => {
    return !form.invoiceNumber || form.invoiceLink.trim().length === 0;
});


const handleSubmit = async () => {
    const { valid } = await formRef.value.validate();
    if (!valid) return;

    show.value = false;
    if (resolvePromise) resolvePromise({ ...form });
};

const handleClose = () => {
    show.value = false;
    if (resolvePromise) resolvePromise(null);
};

// Fonksiyonu dışarı açıyoruz
defineExpose({ open });
</script>