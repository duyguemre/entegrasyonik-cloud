import { ref, reactive, computed } from 'vue';
import { text, emphasis, note, lineBreak } from '@/components/layout/messageParts';

export function useClaimActions(executeClaimAction: Function, snackbarStore: any, getClaims: Function) {

    // --- STATE ---
    const actionDialog = ref({
        show: false,
        type: 'REJECT' as 'REJECT' | 'APPROVE',
        claim: null as any,
        reasons: [
            { id: '1', title: 'Ürün Kırık Ulaştı (Lojistik)' },
            { id: '2', title: 'Belirtilen Kusur Bulunamadı' },
            { id: '3', title: 'İade Süresi Geçti' },
            { id: '99', title: 'Diğer' }
        ],
        selectedReason: null as any,
        loading: false
    });

    const isBulk = ref(false);

    /**
     * TALEP REDDİ EKRANINI AÇMA
     */
    const openRejectAction = (item: any) => {
        isBulk.value = false;
        actionDialog.value.type = 'REJECT';
        actionDialog.value.claim = item;
        actionDialog.value.selectedReason = null;
        actionDialog.value.show = true;
    };

    /**
     * RED FORMU GEÇERLİLİK KONTROLÜ
     */
    const isRejectFormValid = computed(() => {
        return actionDialog.value.selectedReason !== null;
    });

    /**
     * İADE TALEBİ RED ONAYI VE SÜREÇ TETİKLEME
     */
    const handleRejectConfirm = async (confirmDialogObj: any) => {
        if (!isRejectFormValid.value) return;

        // 1. Confirm Diyaloğunu Yapılandır
        confirmDialogObj.title = 'İADE TALEBİNİ REDDET';
        confirmDialogObj.message = `"${actionDialog.value.selectedReason.title}" sebebiyle bu iade talebini reddetmek istediğinize emin misiniz? Bu işlem pazar yerine (Trendyol vb.) anında bildirilecektir.`;
        confirmDialogObj.confirmText = 'Evet, Talebi Reddet';
        confirmDialogObj.icon = 'mdi-package-variant-remove';
        confirmDialogObj.color = 'error';
        confirmDialogObj.show = true;

        // 2. Kullanıcı Onayladığında Çalışacak Callback
        confirmDialogObj.onConfirm = async () => {
            confirmDialogObj.show = false;
            actionDialog.value.loading = true;

            try {
                // YENİ YAPI: Backend'deki ClaimService.rejectClaim artik rejectData wrapper'ı bekliyor
                const payload = {
                    claimId: actionDialog.value.claim._id,
                    rejectData: {
                        reasonId: actionDialog.value.selectedReason.id,
                        reason: actionDialog.value.selectedReason.title,
                        // Not: Backend, claim.items ve claim.meta verilerini 
                        // zaten claimId üzerinden DB'den çekip Connector'a paslıyor.
                    }
                };

                const res = await executeClaimAction('ClaimService/rejectClaim', payload);

                if (res.success) {
                    snackbarStore.addSnackbar({
                        text: res.message || 'İade başarıyla reddedildi.',
                        color: 'success'
                    });
                    getClaims(); // Listeyi tazele
                    actionDialog.value.show = false; // Dialogu kapat
                } else {
                    snackbarStore.addSnackbar({
                        text: res.message || 'İşlem pazar yeri tarafından reddedildi.',
                        color: 'error'
                    });
                }
            } catch (error: any) {
                snackbarStore.addSnackbar({
                    text: error.message || 'Bir hata oluştu.',
                    color: 'error'
                });
            } finally {
                actionDialog.value.loading = false;
            }
        };
    };

    /**
     * TEKİL ONAYLAMA (Approve)
     */
    const handleApproveRequest = async (item: any, confirmDialogObj: any) => {
        confirmDialogObj.title = 'İADE TALEBİNİ ONAYLA';
        confirmDialogObj.message = `${item.externalClaimId} nolu iade talebini onaylıyor musunuz? Bu işlem sonucunda müşteriye ücret iadesi süreci başlayacaktır.`;
        confirmDialogObj.confirmText = 'Evet, Onayla';
        confirmDialogObj.icon = 'mdi-check-decagram';
        confirmDialogObj.color = 'success';
        confirmDialogObj.show = true;

        confirmDialogObj.onConfirm = async () => {
            confirmDialogObj.show = false;
            try {
                // Backend approveClaim artik tekil claimId bekliyor
                const res = await executeClaimAction('ClaimService/approveClaim', { claimId: item._id });

                if (res.success) {
                    snackbarStore.addSnackbar({ text: res.message, color: 'success' });
                    getClaims();
                }
            } catch (error: any) {
                snackbarStore.addSnackbar({ text: error.message, color: 'error' });
            }
        };
    };

    /**
     * TOPLU ONAYLAMA İŞLEMİ (Bulk Approve)
     */
    const processBulkApprove = async (claimIds: string[]) => {
        try {
            // Backend'deki bulkApproveClaim imzasina uygun payload
            const payload = { claimIds };
            const res = await executeClaimAction('ClaimService/bulkApproveClaim', payload);

            if (res.success && res.data) {
                const { successful = [], failed = [] } = res.data;

                if (failed.length > 0) {
                    const errorDetails = failed.map((f: any) => `İade No: ${f.externalClaimId}: ${f.errorMessage}`).join(' | ');
                    snackbarStore.addSnackbar({
                        text: `${successful.length} başarılı, ${failed.length} başarısız. Hatalar: ${errorDetails}`,
                        color: 'warning',
                        timeout: 8000
                    });
                } else {
                    snackbarStore.addSnackbar({
                        text: res.message || `Tüm iadeler başarıyla onaylandı.`,
                        color: 'success'
                    });
                }
                getClaims();
            } else {
                snackbarStore.addSnackbar({ text: res.message || 'Toplu işlem başarısız.', color: 'error' });
            }

        } catch (error: any) {
            snackbarStore.addSnackbar({ text: error.message || 'Toplu işlem başarısız.', color: 'error' });
        }
    };

    /**
     * TOPLU SİLME İŞLEMİ (Bulk Delete)
     */
    const handleBulkDelete = async (claimIds: string[], confirmDialogObj: any) => {
        if (!claimIds || claimIds.length === 0) return;

        confirmDialogObj.title = 'TOPLU İADE SİL';
        confirmDialogObj.subtitle = 'Seçilen iade talepleri kalıcı olarak silinecektir.';
        confirmDialogObj.message = [
            text('Seçili olan '),
            emphasis(claimIds.length),
            text(' iade talebini sistemden silmek istediğinize emin misiniz? '),
            lineBreak(), lineBreak(),
            text(' '),
            note('Bu işlem geri alınamaz.'),
        ];
        confirmDialogObj.confirmText = 'EVET, TOPLU SİL';
        confirmDialogObj.confirmIcon = 'mdi-trash-can-outline';
        confirmDialogObj.icon = 'mdi-alert-decagram';
        confirmDialogObj.color = 'error';
        confirmDialogObj.show = true;

        confirmDialogObj.onConfirm = async () => {
            confirmDialogObj.show = false;
            try {
                const res = await executeClaimAction('ClaimService/bulkDeleteClaims', { claimIds });

                if (res.success) {
                    snackbarStore.addSnackbar({ text: res.message || 'İadeler başarıyla silindi.', color: 'success' });
                    getClaims(true);
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
        isBulk,
        isRejectFormValid,
        openRejectAction,
        handleRejectConfirm,
        handleApproveRequest,
        processBulkApprove
    };
}