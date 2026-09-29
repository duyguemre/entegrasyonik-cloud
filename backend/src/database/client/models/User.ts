import mongoose from "mongoose";

export const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    surname: { type: String, required: true },
    password: { type: String, required: true },
    roleCode: { type: String, required: true },         // Merkezi GlobalRole tablosundaki kod
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    collection: 'Users',
    strict: false
});

// [ADR-0021 D6] Varsayılan bağlantıya `mongoose.model('Users', ...)` kaydı kaldırıldı (hiçbir yerde import edilmiyordu;
// model ClientMongooseSchemas.ts içinde tenant bağlantısına kaydedilir).
