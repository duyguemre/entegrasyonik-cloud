import { IService, TICKET_STATUS, TICKET_TYPE, TICKET_PRIORITY } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { nextSequence } from '@utils/sequence'
import { containsRegex, normalizePagination, pickSortField } from '@utils/search'
import { TICKET_SORT_FIELDS } from '../listSortFields';

export default class TicketService extends BaseApi implements IService {


    async get(): Promise<any> {
    }

    /**
     * Tüm biletleri filtreli ve sayfalı olarak getirir
     */
    async getTickets(): Promise<any> {
        try {
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

            const result = await this.applicationDB.getTicketModel().aggregate([
                { $match: filterQuery },
                { $sort: sort }, // [DB-02] $facet dışında: indeks kullanılabilir
                {
                    $facet: {
                        totalRecords: [{ $count: 'count' }],
                        tickets: [
                            { $skip: skip },
                            { $limit: pagination.limit }
                        ]
                    }
                }
            ]);

            const aggregation = result[0] || {};
            return {
                tickets: aggregation.tickets || [],
                totalNumberOfRecords: aggregation.totalRecords?.[0]?.count || 0
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Yeni destek talebi açar
     */
    async openTicket(): Promise<any> {
        try {
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

            return await this.applicationDB.getTicketModel().create(newTicket);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Bilete mesaj ekler
     */
    async sendTicketMessage(): Promise<any> {
        try {
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

            return await this.applicationDB.getTicketModel().findOneAndUpdate(
                { _id: ticketId, clientId: this.currentClientId },
                {
                    $push: { messages: message },
                    $set: {
                        updatedDate: now,
                        lastMessageAt: now,
                        lastMessageSnippet: content.substring(0, 100),
                        status: newStatus
                    }
                },
                { new: true }
            );
        } catch (error) {
            throw error;
        }
    }

    /**
     * Bileti kapatır
     */
    async closeTicket(): Promise<any> {
        try {
            const { ticketId } = this.request;
            return await this.applicationDB.getTicketModel().findOneAndUpdate(
                { _id: ticketId, clientId: this.currentClientId },
                { $set: { status: TICKET_STATUS.CLOSED, updatedDate: Date.now() } },
                { new: true }
            );
        } catch (error) {
            throw error;
        }
    }

    async getNextSequenceValue(sequenceName: string): Promise<number> {
        // [ADR-0021 D5] ortak atomik sayaç yardımcısı (admin-service de kullanır)
        return nextSequence(this.applicationDB.getCounterModel(), sequenceName);
    }
}
