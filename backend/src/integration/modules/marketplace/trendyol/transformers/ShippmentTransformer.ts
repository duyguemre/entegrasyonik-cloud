import { IInternalAddress, IInternalShipment } from "@interfaces/index";

// transformers/ShipmentMapper.ts
export class ShipmentMapper {
    /**
     * Ham sevkiyat verilerini dükkanın standart yapısına çevirir
     */
    public toInternalShipments(rawShipments: any[]): IInternalShipment[] {
        if (!Array.isArray(rawShipments)) return [];

        return rawShipments.map(s => ({
            id: String(s.id),
            name: s.name,
            code: s.code || s.name.toLowerCase().replace(/\s/g, '')
        }));
    }

    public toInternalAddresses(rawAddresses: any[]): IInternalAddress[] {
        // Eğer veri array değilse boş dizi dön (Select bileşenleri çökmesin)
        if (!Array.isArray(rawAddresses)) return [];

        return rawAddresses.map(addr => {
            // Tip belirleme (Trendyol'dan gelen addressType'ı Türkçeleştirelim)
            const typeLabel = addr.addressType === 'Shipment' ? 'Sevkiyat' :
                addr.addressType === 'Returning' ? 'İade' : addr.addressType === 'Invoice' ? 'Fatura' : 'Genel';

            return {
                // Backend ve UI eşleşmesi için id her zaman string olmalı
                id: String(addr.id),

                // v-select item-title olarak bunu kullanabilirsin
                title: `${typeLabel} Adresi (${addr.city})`,

                // v-select'te slot kullanarak alt bilgi olarak basabilirsin
                subtitle: `${addr.district} / ${addr.city} - ${addr.address}`,

                // Operasyonel veriler
                type: addr.addressType, // 'Shipment' veya 'Returning'
                city: addr.city,
                district: addr.district,
                fullAddress: addr.address,

                // İleride lazım olursa orijinal veriye erişmek için
                rawId: addr.id
            };
        });
    }
}