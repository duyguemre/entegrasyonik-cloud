import { ref } from 'vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';

export function useTicketActions(getTickets: Function) {
    const restApi = useRestApi();
    const snackbarStore = useSnackbarStore();
    const loading = ref(false);

    /**
     * Yeni bilet oluşturur
     */
    const createTicket = async (ticketData: any) => {
        loading.value = true;
        try {
            const response = await restApi.post('TicketService/openTicket', { ticket: ticketData });
            if (response?._id) {
                snackbarStore.addSnackbar({
                    text: 'Destek talebiniz başarıyla oluşturuldu.',
                    color: 'success'
                });
                getTickets(true);
                return response;
            }
        } catch (error) {
            console.error('Bilet oluşturma hatası:', error);
            snackbarStore.addSnackbar({
                text: 'Bilet oluşturulurken bir hata oluştu.',
                color: 'error'
            });
        } finally {
            loading.value = false;
        }
    };

    /**
     * Bilete mesaj gönderir
     */
    const sendMessage = async (ticketId: string, content: string) => {
        try {
            const response = await restApi.post('TicketService/sendTicketMessage', {
                ticketId,
                content,
                senderType: 'CLIENT'
            });
            if (response?._id) {
                return response;
            }
        } catch (error) {
            console.error('Mesaj gönderme hatası:', error);
            snackbarStore.addSnackbar({
                text: 'Mesaj gönderilirken bir hata oluştu.',
                color: 'error'
            });
        }
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
