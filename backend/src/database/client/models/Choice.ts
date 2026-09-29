import mongoose from "mongoose";

export const ChoiceSchema = new mongoose.Schema({
    title: { type: String, required: true },
    // Seçeneğin genel özellikleri
    isSlicer: { type: Boolean, default: false }, // Filtreleme için kullanılabilir mi?
    isVarianter: { type: Boolean, default: false }, // Varyant oluşturmak için kullanılır mı?

    values: {
        type: [{
            title: { type: String, required: true },
            allowCustom: { type: Boolean, default: false },
            // Eğer her değer bazında da kontrol gerekiyorsa buraya da eklenebilir
            // isSlicer: { type: Boolean, default: false }, 
            // isVarianter: { type: Boolean, default: false }
        }],
        required: true
    },
}, {
    collection: 'Choices',
    strict: false,
    timestamps: true
});
