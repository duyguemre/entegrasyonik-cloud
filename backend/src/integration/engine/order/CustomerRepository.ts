import { DatabaseManagerInstance } from '@database/index';
import { ICustomer, ICustomerDocument } from '@interfaces/customer';
import { getLogPrefix, LoggerType } from '@utils/Logger';
import { Types } from 'mongoose';
import { escapeRegex } from '@utils/search';
import { eventLog } from '@platform/core/logger';

const log = eventLog('worker', 'CustomerRepository');

export class CustomerRepository {
    private workerName: LoggerType = "Customer Repository"
    private logPrefix!: string;

    /**
     * Telefon numarasını normalleştirir (Son 10 hane üzerinden eşleşme güvenliği).
     */
    private normalizePhone(phone?: string): string | undefined {
        if (!phone) return undefined;
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
    }

    /**
     * E-postayı normalleştirir (Maskelenmiş pazar yeri maillerini eşleştirmeden korur).
     */
    private normalizeEmail(email?: string): string | undefined {
        if (!email || email.includes('*')) return undefined;
        return email.trim().toLowerCase();
    }

    /**
     * String temizleme (Adres karşılaştırması için).
     */
    private normalizeString(str?: string): string {
        return (str || '').replace(/\s+/g, '').toLowerCase();
    }

    /**
     * Adresi normalleştirir (Karşılaştırma güvenliği için).
     */
    private normalizeAddress(address?: string): string {
        if (!address) return "";
        return (address || '')
            .toLowerCase()
            .replace(/mah\.|mahallesi|sok\.|sokak|cad\.|caddesi|no:|daire:|kat:/g, '') // Yaygın kısaltmaları temizle
            .replace(/[^a-z0-9]/g, '') // Sadece harf ve rakam kalsın
            .trim();
    }

    /**
     * Identity Resolution & Deduplication (Müşteriyi Tekilleştirme ve Kaydetme)
     *
     * [DB-01 / DBR-01] Deterministik eşleme anahtarı (öncelik sırası kayıt eşleşmesinde $or ile birlikte aranır):
     *   dış kimlik (kanal + dış müşteri kimliği), vergi no, telefon, normalize e-posta, ad+adres.
     * Hiçbir anahtar yoksa müşteri OLUŞTURULMAZ ve `null` döner (sipariş, ad/soyad anlık görüntüsünü
     * kendi üzerinde taşır). Sahte dış kimlik (`AUTO_FIX_*`) üretilmez. Yeni kayıt koşullu upsert ile
     * açılır (aynı anahtarla eşzamanlı iki çağrı tek belge üretir).
     */
    public async saveCustomer(clientId: number, customer: ICustomer, integrationCode: string): Promise<Types.ObjectId | null> {
        try {
            this.logPrefix = getLogPrefix(this.workerName, clientId, "global");
            const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
            if (!clientDb) throw new Error(`${this.logPrefix} Client DB bulunamadı.`);

            const CustomerModel = clientDb.getCustomerModel();

            // 1. VERİ TEMİZLİĞİ VE VALIDASYON KORUMASI
            const normPhone = this.normalizePhone(customer.phone);
            const normEmail = this.normalizeEmail(customer.email);
            const taxNumber = customer.taxNumber?.trim();
            const firstAddr = customer.addresses?.[0];
            const normAddress = this.normalizeAddress(firstAddr?.addressLine);

            // 1.1 ADRES VALIDASYON KORUMASI (Required: state)
            if (customer.addresses) {
                for (const addr of customer.addresses) {
                    if (!addr.state || addr.state.trim() === "") {
                        addr.state = (addr as any).district || addr.city || "Belirtilmedi";
                    }
                    if (!addr.city || addr.city.trim() === "") {
                        addr.city = "Belirtilmedi";
                    }
                }
            }

            // Boş dış müşteri kimliği ELENİR (sahte kimlik üretilmez; Mongoose 'required' ihlali de oluşmaz).
            const externalIdentities = (customer.externalIdentities || [])
                .map(i => ({ integrationCode: i.integrationCode || integrationCode, externalCustomerId: (i.externalCustomerId ?? '').toString().trim() }))
                .filter(i => i.externalCustomerId !== '');
            customer.externalIdentities = externalIdentities;

            // 2. KİMLİK ÇÖZÜMLEME SORGUSU (Deduplication)
            // Not: eşitlikler `$in` ile yazılır; upsert'te tek dallı $or'dan alan çıkarımı ($setOnInsert çakışması) olmaz.
            const queryOr: any[] = [];
            if (taxNumber && taxNumber.length > 5) queryOr.push({ taxNumber: { $in: [taxNumber] } });
            if (normPhone) queryOr.push({ phone: { $regex: `${escapeRegex(normPhone)}$` } }); // [GV-01] kaçışlı
            if (normEmail) queryOr.push({ email: { $in: [normEmail] } });

            // Pazar yeri bazlı tekil ID ile sorgu (aynı dizi elemanında eşleşmeli: $elemMatch)
            for (const ext of externalIdentities) {
                queryOr.push({
                    externalIdentities: { $elemMatch: { integrationCode: ext.integrationCode, externalCustomerId: ext.externalCustomerId } }
                });
            }

            // FALLBACK: Adres Bazlı Eşleşme (Maskelenmiş veriler için en güvenilir yol)
            if (normAddress && customer.firstName && firstAddr) {
                queryOr.push({
                    firstName: { $in: [customer.firstName] },
                    lastName: { $in: [customer.lastName] },
                    "addresses.city": { $in: [firstAddr.city] },
                    "addresses.state": { $in: [(firstAddr as any).state || (firstAddr as any).district] },
                    "addresses.addressLine": { $regex: escapeRegex(normAddress.substring(0, 30)), $options: 'i' } // [GV-01] kaçışlı; ilk 30 karakterlik temizlenmiş adres
                });
            }

            // Hiçbir eşleme anahtarı yok: müşteri kaydı AÇILMAZ (her çağrıda yeni kayıt = DBR-01 mükerreri).
            if (queryOr.length === 0) {
                return null;
            }
            const query = { $or: queryOr };

            // 3. BUL VE GÜNCELLE (HYBRID UPSERT)
            const existingCustomer = (await CustomerModel.findOne(query)) as ICustomerDocument | null;

            if (existingCustomer) {
                // ADRES MERGE (Aynı adresi tekrar ekleme)
                const currentAddresses = existingCustomer.addresses || [];
                const incomingAddresses = Array.isArray(customer.addresses) ? customer.addresses : (customer.addresses ? [customer.addresses] : []);

                for (const addr of incomingAddresses) {
                    // Adres validasyonu (Existing customer güncellenirken de korumalıyız)
                    if (!addr.state || addr.state.trim() === "") {
                        addr.state = (addr as any).district || addr.city || "Belirtilmedi";
                    }
                    if (!addr.city || addr.city.trim() === "") {
                        addr.city = "Belirtilmedi";
                    }

                    const isDuplicate = currentAddresses.some((a: any) =>
                        this.normalizeString(a.addressLine) === this.normalizeString(addr.addressLine)
                    );
                    if (!isDuplicate) currentAddresses.push(addr);
                }

                // IDENTITY MERGE (Müşteri farklı pazar yerlerinden geldiyse ID'leri birleştir)
                const currentIdentities = existingCustomer.externalIdentities || [];
                const incomingIdentities = customer.externalIdentities || [];

                for (const identity of incomingIdentities) {
                    const isDuplicate = currentIdentities.some((i: any) =>
                        i.integrationCode === identity.integrationCode &&
                        i.externalCustomerId === identity.externalCustomerId
                    );
                    if (!isDuplicate) currentIdentities.push(identity);
                }

                // Mevcut veriyi güncelle (Zorunlu alanların doluluğunu koru)
                existingCustomer.firstName = (customer.firstName || existingCustomer.firstName || "").trim();
                existingCustomer.lastName = (customer.lastName || existingCustomer.lastName || "").trim();
                existingCustomer.companyName = customer.companyName || existingCustomer.companyName;
                existingCustomer.email = normEmail || existingCustomer.email;
                existingCustomer.phone = normPhone || customer.phone || existingCustomer.phone;
                existingCustomer.addresses = currentAddresses;
                existingCustomer.externalIdentities = currentIdentities;
                existingCustomer.status = 'ACTIVE';

                await existingCustomer.save();
                return existingCustomer._id as Types.ObjectId;

            } else {
                // YENİ CRM KAYDI: koşullu upsert (eşleşen varsa mevcut belge döner, yoksa tek belge eklenir)
                const doc = {
                    ...customer,
                    firstName: (customer.firstName || '').trim(),
                    lastName: (customer.lastName || "").trim(),
                    phone: normPhone || customer.phone,
                    email: normEmail,
                    status: 'ACTIVE',
                    metrics: {
                        totalOrderCount: 0,
                        totalSpent: 0,
                        totalClaimCount: 0,
                        totalReturnAmount: 0,
                        averageOrderValue: 0
                    }
                };
                const upserted = await CustomerModel.findOneAndUpdate(
                    query,
                    { $setOnInsert: doc },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
                return (upserted as any)._id as Types.ObjectId;
            }

        } catch (error: any) {
            log.error('CUSTOMERREPOSITORY_MUSTERI_SYNC_HATASI', 'Müşteri Sync Hatası (ad/soyad KVKK gereği loga yazılmaz)', { err: error });
            throw error;
        }
    }

    /**
     * SİPARİŞ METRİKLERİ: Sipariş başarıyla kaydedildiğinde LTV verisini günceller.
     */
    public async updateOrderMetrics(clientId: number, customerId: Types.ObjectId, orderAmount: number, count: number = 1): Promise<void> {
        try {
            const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
            if (!clientDb) return;
            const CustomerModel = clientDb.getCustomerModel();

            await CustomerModel.updateOne(
                { _id: customerId },
                {
                    $inc: {
                        "metrics.totalOrderCount": count,
                        "metrics.totalSpent": orderAmount
                    },
                    $set: { "metrics.lastOrderDate": new Date() }
                }
            );
        } catch (error) {
            log.error('CUSTOMERREPOSITORY_SIPARIS_METRIK_GUNCELLEME_HATASI', 'Sipariş metrik güncelleme hatası:', { err: error });
        }
    }

    /**
     * İADE METRİKLERİ: Claim (iade) kaydedildiğinde iade rasyosunu günceller.
     */
    public async updateClaimMetrics(clientId: number, customerId: Types.ObjectId, refundAmount: number, count: number = 1): Promise<void> {
        try {
            const clientDb = await DatabaseManagerInstance.getClientDB(clientId);
            if (!clientDb) return;
            const CustomerModel = clientDb.getCustomerModel();

            await CustomerModel.updateOne(
                { _id: customerId },
                {
                    $inc: {
                        "metrics.totalClaimCount": count,
                        "metrics.totalReturnAmount": refundAmount
                    }
                }
            );
        } catch (error) {
            log.error('CUSTOMERREPOSITORY_IADE_METRIK_GUNCELLEME_HATASI', 'İade metrik güncelleme hatası:', { err: error });
        }
    }
}