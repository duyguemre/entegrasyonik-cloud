// Protokol 13 karakterizasyon: Pazarama `ShipmentMapper` (kargo/adres listesi normalizasyonu).
// ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { ShipmentMapper } from '@integration/modules/marketplace/pazarama/transformers/ShipmentTransformer';

describe('Pazarama ShipmentMapper — karakterizasyon', () => {
    const m = new ShipmentMapper();

    // ŞÜPHELİ DAVRANIŞ (BACKLOG'a eklendi): `id` alanı `String(...)` ile normalize edilir ama `code` alanı
    // (`s.code || s.id || ""`) DEĞİL — code, s.id'ye düştüğünde (code alanı yoksa) HAM (sayısal) tip olarak kalır.
    // Aynı obje içinde id string, code number karışık tip taşıyabilir; tüketen kodun `code` üzerinde string
    // metodu (örn. .trim()) çağırması durumunda kırılabilir.
    it('[BACKLOG-adayı] toInternalShipments: id/name eşler; code yoksa id\'ye düşer AMA (id\'nin aksine) String() İLE SARILMAZ — ham (sayısal) tip sızar', () => {
        const res = m.toInternalShipments([
            { id: 1, name: 'Yurtiçi Kargo', code: 'YK' },
            { id: 2, title: 'Aras (title)' },
            { id: 3 },
        ]);
        expect(res).toEqual([
            { id: '1', name: 'Yurtiçi Kargo', code: 'YK' },
            { id: '2', name: 'Aras (title)', code: 2 }, // code yoksa id'ye düşer — ANCAK ham sayı olarak kalır
            { id: '3', name: '', code: 3 },
        ]);
        expect(typeof res[1].code).toBe('number');
    });

    it('toInternalShipments: boş dizi -> boş dizi', () => {
        expect(m.toInternalShipments([])).toEqual([]);
    });

    it('toInternalAddresses: id/addressId, addressName/title, addressLine/fullAddress alanlarını eşler; type varsayılanı "Shipment"', () => {
        const res = m.toInternalAddresses([
            { id: 1, addressName: 'Depo 1', addressLine: 'Adres satırı', city: 'İstanbul', district: 'Kadıköy', fullAddress: 'Tam adres 1' },
            { addressId: 2, title: 'Depo 2 (title)', fullAddress: 'Tam adres 2' },
            { id: 3 },
        ]);
        expect(res[0]).toEqual({ id: '1', title: 'Depo 1', subtitle: 'Adres satırı', type: 'Shipment', city: 'İstanbul', district: 'Kadıköy', fullAddress: 'Tam adres 1' });
        expect(res[1]).toMatchObject({ id: '2', title: 'Depo 2 (title)', subtitle: 'Tam adres 2', fullAddress: 'Tam adres 2' });
        expect(res[2]).toEqual({ id: '3', title: '', subtitle: '', type: 'Shipment', city: '', district: '', fullAddress: '' });
    });

    it('toInternalAddresses: addressType varsa "Shipment" yerine onu kullanır', () => {
        const [addr] = m.toInternalAddresses([{ id: 1, addressType: 'Return' }]);
        expect(addr.type).toBe('Return');
    });
});
