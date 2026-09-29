import { Schema } from 'mongoose';
import { ICustomerAddress, ICustomerDocument, IExternalIdentity } from 'src/interfaces/customer';

/**
 * Alt Şema: Farklı Kanallardaki Kimlikler
 * Müşteriyi Trendyol'da 'X', Hepsiburada'da 'Y' ID'si ile tanımamızı sağlar.
 */
const ExternalIdentitySchema = new Schema<IExternalIdentity>({
    integrationCode: { type: String, required: true }, // 'trendyol', 'hepsiburada', 'ideasoft'
    externalCustomerId: { type: String, required: true }, // Platformun verdiği tekil ID
}, { _id: false });

/**
 * Alt Şema: Adres Havuzu
 * _id: true bırakıldı, siparişlerde 'shippingAddressId' olarak referanslanabilir.
 */
const CustomerAddressSchema = new Schema<ICustomerAddress>({
    title: { type: String, default: 'Ev/İş' },
    addressLine: { type: String, required: true },
    city: { type: String, required: true, index: true },
    state: { type: String, required: true },
    postalCode: { type: String },
    isDefaultShipping: { type: Boolean, default: false },
    isDefaultBilling: { type: Boolean, default: false },
}, { _id: true });

/**
 * Ana Şema: Customer (Müşteri Komuta Merkezi)
 */
export const CustomerSchema = new Schema<ICustomerDocument>({
    // 1. KİMLİK BİLGİLERİ
    firstName: { type: String, required: true, index: true },
    lastName: { type: String, index: true },
    companyName: { type: String },
    isCorporate: { type: Boolean, default: false },
    taxNumber: { type: String, index: true }, // TCKN veya VKN (En güvenilir eşleşme anahtarı)
    taxOffice: { type: String },

    // 2. İLETİŞİM (Normalizasyon reposu burayı besler)
    email: { type: String, index: true },
    phone: { type: String, index: true },
    isEmailMasked: { type: Boolean, default: false },
    isPhoneMasked: { type: Boolean, default: false },

    // 3. KİMLİK ÇÖZÜMLEME & ADRES
    externalIdentities: { type: [ExternalIdentitySchema], default: [] },
    addresses: { type: [CustomerAddressSchema], default: [] },

    // 4. CRM & INSIGHT METRİKLERİ (İş Geliştirme İçin Kritik)
    metrics: {
        totalOrderCount: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },         // Lifetime Value (LTV)
        totalClaimCount: { type: Number, default: 0 },    // Toplam İade Adedi
        totalReturnAmount: { type: Number, default: 0 },  // Toplam İade Tutarı
        averageOrderValue: { type: Number, default: 0 },  // Ortalama Sepet
        lastOrderDate: { type: Date },
        firstOrderDate: { type: Date },
        preferredPlatform: { type: String }               // En çok alışveriş yaptığı kanal
    },

    // 5. SEGMENTASYON VE ETİKETLER
    tags: [{ type: String, index: true }], // 'VIP', 'HIGH_RETURN_RISK', 'B2B'
    status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'],
        default: 'ACTIVE',
        index: true
    },

    // 6. ESNEKLİK (Pazaryerinden gelen ekstra veriler için)
    meta: { type: Map, of: Schema.Types.Mixed }

}, {
    collection: 'Customers',
    timestamps: true,
    strict: false // Gelecekteki sürpriz pazaryeri verileri için esnek bırakıldı
});

// --- PERFORMANS İNDEKSLERİ ---

// Identity Resolution Sorguları İçin (Örn: Trendyol + ID sorgusu)
CustomerSchema.index({
    "externalIdentities.integrationCode": 1,
    "externalIdentities.externalCustomerId": 1
}, { unique: false });

// Hızlı Arama (Search Section) İçin Karma İndeks
CustomerSchema.index({ firstName: "text", lastName: "text", email: "text", phone: "text" });

// Metrik Bazlı Listeleme (En çok harcayanlar, en çok iade edenler)
CustomerSchema.index({ "metrics.totalSpent": -1 });
CustomerSchema.index({ "metrics.totalClaimCount": -1 });