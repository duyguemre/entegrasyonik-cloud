import mongoose from "mongoose";

export const TicketSchema = new mongoose.Schema({
    ticketNumber: { type: String, required: true, unique: true }, // TKT-1001
    clientId: { type: Number, required: true, index: true },
    subject: { type: String, required: true },
    type: { type: String, required: true, index: true },
    status: { type: String, required: true, index: true },
    priority: { type: String, required: true, default: 'MEDIUM' },
    
    // Aktivite Takibi
    createdDate: { type: Number, required: true },
    updatedDate: { type: Number, required: true },
    lastMessageAt: { type: Number, required: true },
    lastMessageSnippet: { type: String },

    messages: [{
        senderType: { type: String, enum: ['CLIENT', 'SUPPORT'], required: true },
        senderId: { type: String, required: true },
        senderName: { type: String, required: true },
        content: { type: String, required: true },
        date: { type: Number, required: true },
        attachments: [{
            name: { type: String },
            url: { type: String }
        }]
    }],

    metadata: {
        browser: { type: String },
        os: { type: String },
        ip: { type: String }
    }
}, {
    collection: 'Tickets',
    timestamps: false, // Manuel Number tabanlı date yönetimi mevcut projede standart olduğu için false kalsın (createdDate/updatedDate kullanıyoruz)
    strict: true
});



