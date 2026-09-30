import { ref } from 'vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import { isRequestError } from '@/components/ds/listStandard';
import { classifyFailure, type FailureKind, type buildOpenTicketPayload } from './ticketRules';

export type TicketActionResult = { ok: true; ticket: any } | { ok: false; failure: FailureKind };

export function useTicketActions(getTickets: Function) {
    const restApi = useRestApi();
    const snackbarStore = useSnackbarStore();
    const loading = ref(false);

    /**
     * Yeni bilet oluşturur. Sonuç DİYALOGDA satır içi gösterilir (snackbar YOK); hata durumunda
     * girilen içerik diyalogda korunur. Gövde AYNEN `{ ticket: { subject, type, priority, message } }`.
     */
    const createTicket = async (ticketData: ReturnType<typeof buildOpenTicketPayload>): Promise<TicketActionResult> => {
        loading.value = true;
        try {
            const response = await restApi.post('TicketService/openTicket', { ticket: ticketData });
            if (response?._id && !isRequestError(response)) {
                getTickets(true);
                return { ok: true, ticket: response };
            }
            return { ok: false, failure: classifyFailure(response) };
        } finally {
            loading.value = false;
        }
    };

    /**
     * Bilete mesaj gönderir. Gövde AYNEN `{ ticketId, content, senderType: 'CLIENT' }`.
     */
    const sendMessage = async (ticketId: string, content: string): Promise<TicketActionResult> => {
        const response = await restApi.post('TicketService/sendTicketMessage', {
            ticketId,
            content,
            senderType: 'CLIENT'
        });
        if (response?._id && !isRequestError(response)) {
            return { ok: true, ticket: response };
        }
        return { ok: false, failure: classifyFailure(response) };
    };

    /**
     * Bileti kapatır
     */
    const closeTicket = async (ticketId: string) => {
        try {
            const response = await restApi.post('TicketService/closeTicket', { ticketId });
            if (response?._id) {
                snackbarStore.addSnackbar({
                    text: 'Destek talebi kapatıldı.',
                    color: 'success'
                });
                getTickets();
                return true;
            }
        } catch (error) {
            console.error('Bilet kapatma hatası:', error);
            snackbarStore.addSnackbar({
                text: 'Bilet kapatılırken bir hata oluştu.',
                color: 'error'
            });
        }
    };

    return {
        loading,
        createTicket,
        sendMessage,
        closeTicket
    };
}
