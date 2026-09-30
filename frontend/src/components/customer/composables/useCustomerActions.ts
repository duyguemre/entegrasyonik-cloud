import { ref } from 'vue';
import { text, emphasis, note, lineBreak } from '@/components/layout/messageParts';

/**
 * useCustomerActions
 * Müşteri yönetimi (Güncelleme ve Silme) süreçlerini kontrol eden ana iş mantığı katmanı.
 */
export function useCustomerActions(executeAction: Function, snackbarStore: any, getCustomers: Function) {

    // 1. DÜZENLEME DİYALOĞU STATE (Local State)
    const actionDialog = ref({
        show: false,
        customer: null as any,
        updateData: {
            firstName: '',
            lastName: '',
            phone: '',
            email: '',
            status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'BLOCKED' // Backend Şeması ile uyumlu
        },
        loading: false
    });

    /**
     * openEditDialog
     * Seçilen müşteri verilerini formun içine doldurur ve diyaloğu açar.
     */
    const openEditDialog = (customer: any) => {
        actionDialog.value.customer = customer;
        actionDialog.value.updateData = {
            firstName: customer.firstName || '',
            lastName: customer.lastName || '',
            phone: customer.phone || '',
            email: customer.email || '',
            status: customer.status || 'ACTIVE'
        };
        actionDialog.value.show = true;
    };

    /**
     * handleSaveConfirm
     * Müşteri bilgilerini CustomerService/updateCustomer endpoint'ine gönderir.
     */
    const handleSaveConfirm = async (customPayload?: any) => {
        actionDialog.value.loading = true;
        try {
            // Eğer dışarıdan (örn: CustomerDetailComponent) payload gelirse onu kullan, 
            // yoksa bu composable'ın içindeki local state'i kullan.
            const payload = customPayload || {
                customerId: actionDialog.value.customer?._id,
                updateData: { ...actionDialog.value.updateData }
            };

            const res = await executeAction('CustomerService/updateCustomer', payload);

            if (res.success) {
                snackbarStore.addSnackbar({ text: 'Müşteri profili başarıyla güncellendi.', color: 'success' });
                actionDialog.value.show = false;
                getCustomers(); // Listeyi yenile
            } else {
                snackbarStore.addSnackbar({ text: res.message || 'Güncelleme yapılamadı.', color: 'error' });
            }
        } catch (error: any) {
            snackbarStore.addSnackbar({ text: error.message || 'Güncelleme sırasında bir hata oluştu.', color: 'error' });
        } finally {
            actionDialog.value.loading = false;
        }
    };

    /**
     * handleDelete
     * ConfirmationDialogComponent ile etkileşime girerek silme işlemini yönetir.
     */
    const handleDelete = async (customer: any, confirmDialogObj: any) => {
        // R7 (confirmation-dialog.spec.ts) karakterizasyonu KORUNUR — bu akış ADR-0015 B1
        // kapsamındaki spec dosyalarının (customers/messages*.spec.ts) DIŞINDaki, bu göreve
        // AÇIKÇA verilmemiş bir davranış sözleşmesine bağlı (bkz. B1 teslim raporu); EkConfirmDialog'a
        // geçiş burada YAPILMADI, ConfirmationDialogComponent + messageParts.ts (G-01/BR-32 güvenli
        // biçimlendirme) AYNEN korunuyor.
        confirmDialogObj.title = 'MÜŞTERİYİ SİL';
        confirmDialogObj.subtitle = 'Bu işlem CRM ve Analiz verilerini etkileyecektir.';
        // G-01/BR-32: müşteri adı dış kaynaklı -> HTML'e değil güvenli parçalara girer (metin olarak basılır).
        confirmDialogObj.message = [
            emphasis(`${customer.firstName} ${customer.lastName}`),
            text(' isimli müşteriyi silmek istediğinize emin misiniz? '),
            lineBreak(), lineBreak(),
            text(' '),
            note('Not: Sipariş geçmişi veritabanında anonim olarak kalmaya devam edecektir.'),
        ];
        confirmDialogObj.confirmText = 'EVET, SİL';
        confirmDialogObj.confirmIcon = 'mdi-trash-can-outline';
        confirmDialogObj.icon = 'mdi-alert-octagon-outline';
        confirmDialogObj.color = 'error';
        confirmDialogObj.show = true;

        // Onay butonuna basıldığında çalışacak callback
        confirmDialogObj.onConfirm = async () => {
            confirmDialogObj.show = false;
            try {
                const res = await executeAction('CustomerService/deleteCustomer', { customerId: customer._id });

                if (res.success) {
                    snackbarStore.addSnackbar({ text: 'Müşteri başarıyla silindi.', color: 'success' });
                    getCustomers(true); // Sayfa 1'e dönerek listeyi yenile
                } else {
                    snackbarStore.addSnackbar({ text: res.message || 'Silme işlemi başarısız oldu.', color: 'error' });
                }
            } catch (error: any) {
                snackbarStore.addSnackbar({ text: error.message || 'Silme sırasında teknik bir hata oluştu.', color: 'error' });
            }
        };
    };

    /**
     * handleBulkDelete
     * Birden fazla seçili müşteriyi toplu siler.
     */
    const handleBulkDelete = async (customerIds: string[], confirmDialogObj: any) => {
        if (!customerIds || customerIds.length === 0) return;

        confirmDialogObj.title = 'TOPLU MÜŞTERİ SİL';
        confirmDialogObj.subtitle = 'CRM sisteminden seçilen kayıtlar kalıcı olarak temizlenecektir.';
        confirmDialogObj.message = [
            text('Seçili olan '),
            emphasis(customerIds.length),
            text(' müşteriyi sistemden silmek istediğinize emin misiniz? '),
            lineBreak(), lineBreak(),
            text(' '),
            note('Bu işlem geri alınamaz.'),
        ];
        confirmDialogObj.confirmText = 'EVET, TOPLU SİL';
        confirmDialogObj.confirmIcon = 'mdi-trash-can-outline';
        confirmDialogObj.icon = 'mdi-alert-decagram-outline';
        confirmDialogObj.color = 'error';
        confirmDialogObj.show = true;

        confirmDialogObj.onConfirm = async () => {
            confirmDialogObj.show = false;
            try {
                const res = await executeAction('CustomerService/bulkDeleteCustomers', { customerIds });

                if (res.success) {
                    snackbarStore.addSnackbar({ text: res.message || 'Müşteriler başarıyla silindi.', color: 'success' });
                    getCustomers(true);
                } else {
                    snackbarStore.addSnackbar({ text: res.message || 'Toplu silme yapılamadı.', color: 'error' });
                }
            } catch (error: any) {
                snackbarStore.addSnackbar({ text: error.message || 'Toplu silme sırasında bir hata oluştu.', color: 'error' });
            }
        };
    };

    return {
        actionDialog,
        openEditDialog,
        handleSaveConfirm,
        handleDelete,
        handleBulkDelete
    };
}