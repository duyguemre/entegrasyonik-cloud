import { ref, reactive, computed } from 'vue';
import { 
    TicketStatusEnum, TICKET_STATUS_LABELS, TICKET_STATUS_COLORS,
    TicketTypeEnum, TICKET_TYPE_LABELS,
    TicketPriorityEnum, TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS
} from '@/types/TicketTypes';
import { defaultListPageSize } from '@/stores/publicConfig'

export function useTicketFilters(getTickets: Function) {
    // --- 1. SEARCH FORM STATE ---
    const searchTicketForm = ref({
        data: {
            globalSearch: '',
            startDate: null as string | null,
            endDate: null as string | null,
            statuses: [] as TicketStatusEnum[],
            types: [] as TicketTypeEnum[],
            priorities: [] as TicketPriorityEnum[]
        },
        form: { menu: false }
    });

    // --- 2. PAGINATION & SORT STATE ---
    const pagination = reactive({
        limit: defaultListPageSize(),
        page: 1,
        totalNumberOfPages: 1,
        totalNumberOfRecords: 0
    });

    const sortBy = ref<any[]>([{ key: 'lastMessageAt', order: 'desc' }]);

    // --- 3. OPTIONS & CONSTANTS ---
    const statusOptions = Object.values(TicketStatusEnum).map(s => ({
        id: s,
        title: TICKET_STATUS_LABELS[s],
        color: TICKET_STATUS_COLORS[s]
    }));

    const typeOptions = Object.values(TicketTypeEnum).map(t => ({
        id: t,
        title: TICKET_TYPE_LABELS[t]
    }));

    const priorityOptions = Object.values(TicketPriorityEnum).map(p => ({
        id: p,
        title: TICKET_PRIORITY_LABELS[p],
        color: TICKET_PRIORITY_COLORS[p]
    }));

    // --- 4. COMPUTED FORMATTERS ---
    const formattedStartDate = computed(() => {
        if (!searchTicketForm.value.data.startDate) return '';
        return new Date(searchTicketForm.value.data.startDate).toLocaleDateString('tr-TR');
    });

    const formattedEndDate = computed(() => {
        if (!searchTicketForm.value.data.endDate) return '';
        return new Date(searchTicketForm.value.data.endDate).toLocaleDateString('tr-TR');
    });

    // --- 5. ACTIONS ---
    const resetFilters = () => {
        searchTicketForm.value.data = {
            globalSearch: '',
            startDate: null,
            endDate: null,
            statuses: [],
            types: [],
            priorities: []
        };
        getTickets(true);
    };

    const onSortUpdate = (newSortBy: any) => {
        sortBy.value = newSortBy;
        getTickets(true);
    };

    const handlePageChange = () => {
        getTickets();
    };

    return {
        searchTicketForm,
        pagination,
        sortBy,
        statusOptions,
        typeOptions,
        priorityOptions,
        formattedStartDate,
        formattedEndDate,
        resetFilters,
        onSortUpdate,
        handlePageChange
    };
}
