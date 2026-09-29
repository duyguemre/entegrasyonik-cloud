import mongoose from "mongoose";

export const GlobalRoleSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true }, // Örn: ROLE_ADMIN, ROLE_OPERATOR
    name: { type: String, required: true },               // Örn: Yönetici, Operatör
    description: { type: String, required: false },       // Rol açıklaması
    permissions: [
        { type: String, required: true }                 // Yetki kodları dizisi (örn: ['order.view', 'product.edit'])
    ]
}, {
    collection: 'GlobalRoles',
    strict: false
});

// [ADR-0021 D6] Varsayılan bağlantıya `mongoose.model('GlobalRoles', ...)` kaydı kaldırıldı (hiçbir yerde import edilmiyordu;
// model ApplicationMongooseSchemas.ts içinde uygulama bağlantısına kaydedilir).
