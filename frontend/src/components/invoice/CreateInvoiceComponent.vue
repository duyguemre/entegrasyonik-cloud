<template>
  <ActionDialogComponent :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)"
    @cancel="close" @close="close" title="Yeni Fatura Ekle" subtitle="Manuel fatura veya dış evrak girişi"
    icon="mdi-receipt-text-plus" color="success" confirmText="Faturayı Kaydet" cancelText="Vazgeç"
    attach=".invoiceListView" maxWidth="700px" @confirm="promptConfirmation" :isConfirmDisabled="!isFormValid || loading">

    <div class="pa-2 pa-sm-4">
      <v-form ref="formRef" v-model="isFormValid" class="d-flex flex-column gap-4">

        <v-alert type="info" variant="tonal" density="compact" class="mb-2 text-caption">
          Bu ekrandan eklediğiniz faturalar <strong class="uppercase">MANUAL</strong> statüsünde kaydedilir. Eğer bir
          Pazar Yeri sipariş numarasını girerseniz, o sipariş ile otomatik olarak eşleştirilecektir.
        </v-alert>

        <v-row dense>
          <v-col cols="12" md="6">
            <v-text-field v-model="formData.invoiceNumber" label="Fatura Numarası (Seri ve Sıra No)" variant="outlined"
              density="comfortable" prepend-inner-icon="mdi-numeric" bg-color="white" class="customTextField"
              :rules="[v => !!v || 'Zorunlu alan']" />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field v-model="formData.ettn" label="ETTN (İsteğe Bağlı)" variant="outlined" density="comfortable"
              prepend-inner-icon="mdi-identifier" bg-color="white" class="customTextField"
              placeholder="Sistem otomatik üretebilir" />
          </v-col>
        </v-row>

        <v-row dense>
          <v-col cols="12" md="6">
            <v-select v-model="formData.type" :items="invoiceTypes" item-title="title" item-value="value"
              label="Fatura Tipi" variant="outlined" density="comfortable"
              prepend-inner-icon="mdi-format-list-bulleted-type" bg-color="white" class="customTextField" />
          </v-col>
          <v-col cols="12" md="6">
            <v-select v-model="formData.documentType" :items="documentTypes" item-title="title" item-value="value"
              label="Belge Türü" variant="outlined" density="comfortable" prepend-inner-icon="mdi-file-document-outline"
              bg-color="white" class="customTextField" />
          </v-col>
        </v-row>

        <v-row dense>
          <v-col cols="12" md="6">
            <v-text-field v-model="formData.externalOrderId" label="Sipariş / Paket Numarası (Opsiyonel)"
              variant="outlined" density="comfortable" prepend-inner-icon="mdi-pound" bg-color="white"
              class="customTextField" placeholder="Siparişle bağlamak için girin" />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field v-model="formData.totalAmount" label="Toplam Tutar (₺)" variant="outlined"
              density="comfortable" prepend-inner-icon="mdi-currency-try" bg-color="white"
              class="customTextField text-success font-weight-black" type="number" step="0.01"
              :rules="[v => v >= 0 || 'Geçerli bir tutar girin']" />
          </v-col>
        </v-row>

        <v-row dense>
          <v-col cols="12">
            <v-text-field v-model="formData.pdfUrl" label="PDF / Arşiv URL" variant="outlined" density="comfortable"
              prepend-inner-icon="mdi-link-variant" bg-color="white" class="customTextField"
              placeholder="https://sunucu.com/fatura.pdf" />
          </v-col>
        </v-row>
      </v-form>
    </div>
  </ActionDialogComponent>

  <ConfirmationDialogComponent 
    v-model="confirmationDialog.show" 
    title="İşlemi Onaylayın"
    subtitle="Fatura Kaydedilecek" 
    message="Girdiğiniz bilgilerin doğruluğundan eminseniz, fatura manuel olarak sisteme işlenecektir. Onaylıyor musunuz?"
    icon="mdi-help-circle-outline" 
    color="success" 
    confirm-text="Evet, Onaylıyorum" 
    confirm-icon="mdi-check-circle-outline"
    @confirm="executeSaveInvoice" 
    @cancel="confirmationDialog.show = false" 
    maxWidth="400px" 
    attach=".invoiceListView" 
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import { INVOICE_TYPE_LABELS, InvoiceTypeEnum } from '@/types/InvoiceTypes';

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();

const props = defineProps({
  modelValue: { type: Boolean, required: true }
});

const emit = defineEmits(['update:modelValue', 'saved']);

const isFormValid = ref(false);
const formRef = ref<any>(null);
const loading = ref(false);

const invoiceTypes = Object.keys(INVOICE_TYPE_LABELS).map((k: any) => ({
  title: INVOICE_TYPE_LABELS[k as InvoiceTypeEnum],
  value: k
}));

const documentTypes = [
  { title: 'e-Arşiv Fatura', value: 'E_ARSIV' },
  { title: 'e-Fatura', value: 'E_FATURA' }
];

const defaultForm = () => ({
  invoiceNumber: '',
  ettn: '',
  type: 'SALES',
  documentType: 'E_ARSIV',
  externalOrderId: '',
  totalAmount: 0,
  pdfUrl: '',
});

const formData = ref({ ...defaultForm() });
const confirmationDialog = ref({ show: false });

watch(() => props.modelValue, (val) => {
  if (val) {
    formData.value = { ...defaultForm() };
    if (formRef.value) formRef.value.resetValidation();
  }
});

function close() {
  emit('update:modelValue', false);
}

async function promptConfirmation() {
  const { valid } = await formRef.value.validate();
  if (valid) {
    confirmationDialog.value.show = true;
  }
}

async function executeSaveInvoice() {
  confirmationDialog.value.show = false;
  loading.value = true;
  try {
    const res = await restApi.post('InvoiceService/createManualInvoice', {
      data: formData.value
    });

    if (res.success) {
      snackbarStore.addSnackbar({ text: res.message, color: 'success' });
      emit('saved');
      close();
    } else {
      snackbarStore.addSnackbar({ text: res.message || 'Kayıt başarısız.', color: 'error' });
    }
  } catch (error: any) {
    snackbarStore.addSnackbar({ text: 'Sunucuyla iletişim hatası.', color: 'error' });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.gap-4 {
  gap: 16px;
}

.lowercase {
  text-transform: lowercase;
}

.uppercase {
  text-transform: uppercase;
}
</style>
