import { IService, TICKET_STATUS, TICKET_TYPE, TICKET_PRIORITY } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { TicketRepository } from '@database/repositories/app/TicketRepository'
import { CounterRepository } from '@database/repositories/app/CounterRepository'
import { containsRegex, normalizePagination, pickSortField } from '@utils/search'
import { TICKET_SORT_FIELDS } from '../listSortFields';

export default class TicketService extends BaseApi implements IService {

    private get tickets() { return new TicketRepository(this.applicationDB) }
    private get counters() { return new CounterRepository(this.applicationDB) }

    async get(): Promise<any> {
    }

    /**
     * Tüm biletleri filtreli ve sayfalı olarak getirir
     */
    async getTickets(): Promise<any> {
        const { pagination: rawPagination, searchTicketForm, sortBy } = this.request;
        const pagination = normalizePagination(rawPagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
        
        const filterQuery: any = { clientId: this.currentClientId };

        // Gelişmiş Filtreleme
        if (searchTicketForm?.data) {
            const { globalSearch, statuses, types, priorities, startDate, endDate } = searchTicketForm.data;

            if (globalSearch) {
                filterQuery.$or = [
                    { ticketNumber: containsRegex(globalSearch) }, // [GV-01]
                    { subject: containsRegex(globalSearch) },
                    { lastMessageSnippet: containsRegex(globalSearch) }
                ];
            }

            if (statuses?.length > 0) filterQuery.status = { $in: statuses };
            if (types?.length > 0) filterQuery.type = { $in: types };
            if (priorities?.length > 0) filterQuery.priority = { $in: priorities };

            if (startDate || endDate) {
                filterQuery.createdDate = {};
                if (startDate) filterQuery.createdDate.$gte = new Date(startDate).getTime();
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    filterQuery.createdDate.$lte = end.getTime();
                }
            }
        }

        // Sıralama
        const sort: any = {};
        const picked = pickSortField(sortBy?.key, TICKET_SORT_FIELDS, 'lastMessageAt');
        if (!picked.usedFallback) {
            sort[picked.field] = sortBy.order === 'desc' ? -1 : 1;
        } else {
            sort.lastMessageAt = -1; // Varsayılan: Son aktiviteye göre
        }

        const skip = (pagination.page - 1) * pagination.limit;

        const result = await this.tickets.aggregatePage(filterQuery, sort, skip, pagination.limit);

        const aggregation = result[0] || {};
        return {
            tickets: aggregation.tickets || [],
            totalNumberOfRecords: aggregation.totalRecords?.[0]?.count || 0
        };

    }

    /**
     * Yeni destek talebi açar
     */
    async openTicket(): Promise<any> {
        const { subject, type, priority, message, metadata } = this.request.ticket;
        
        // Sıralı Ticket Numarası Üretimi (TKT-XXXX)
        const sequence = await this.getNextSequenceValue('ticket_number');
        const ticketNumber = `TKT-${1000 + sequence}`;

        const now = Date.now();
        const newTicket = {
            ticketNumber,
            clientId: this.currentClientId,
            subject,
            type: type || TICKET_TYPE.GENERAL,
            status: TICKET_STATUS.OPEN,
            priority: priority || TICKET_PRIORITY.MEDIUM,
            createdDate: now,
            updatedDate: now,
            lastMessageAt: now,
            lastMessageSnippet: message.substring(0, 100),
            messages: [{
                senderType: 'CLIENT',
                senderId: this.currentClientId.toString(),
                senderName: 'Müşteri', // Gelecekte kullanıcı adı eklenebilir
                content: message,
                date: now,
                attachments: []
            }],
            metadata: metadata || {}
        };

        return await this.tickets.create(newTicket);
    }

    /**
     * Bilete mesaj ekler
     */
    async sendTicketMessage(): Promise<any> {
        const { ticketId, content, senderType, senderName, senderId } = this.request;
        const now = Date.now();

        const message = {
            senderType: senderType || 'CLIENT',
            senderId: senderId || this.currentClientId.toString(),
            senderName: senderName || 'Müşteri',
            content,
            date: now,
            attachments: []
        };

        // Statü güncelleme mantığı: Müşteri yazarsa "SUPPORT_NEEDED / OPEN", Destek yazarsa "WAITING_CLIENT"
        const newStatus = senderType === 'SUPPORT' ? TICKET_STATUS.WAITING_CLIENT : TICKET_STATUS.IN_PROGRESS;

        return await this.tickets.updateOwned(ticketId, this.currentClientId,
            {
                $push: { messages: message },
                $set: {
                    updatedDate: now,
                    lastMessageAt: now,
                    lastMessageSnippet: content.substring(0, 100),
                    status: newStatus
                }
            }
        );
    }

    /**
     * Bileti kapatır
     */
    async closeTicket(): Promise<any> {
        const { ticketId } = this.request;
        return await this.tickets.updateOwned(ticketId, this.currentClientId,
            { $set: { status: TICKET_STATUS.CLOSED, updatedDate: Date.now() } }
        );
    }

    async getNextSequenceValue(sequenceName: string): Promise<number> {
        // [ADR-0021 D5] ortak atomik sayaç yardımcısı (admin-service de kullanır)
        return this.counters.next(sequenceName);
    }
}
