import { IInternalAddress, IInternalShipment } from '@interfaces/index';

export class ShipmentMapper {
    public toInternalShipments(raw: any[]): IInternalShipment[] {
        return raw.map(s => ({
            id: String(s.id),
            name: s.name || s.title || "",
            code: s.code || s.id || ""
        }));
    }

    public toInternalAddresses(raw: any[]): IInternalAddress[] {
        return raw.map(a => ({
            id: String(a.id || a.addressId),
            title: a.addressName || a.title || "",
            subtitle: a.addressLine || a.fullAddress || "",
            type: a.addressType || 'Shipment',
            city: a.city || "",
            district: a.district || "",
            fullAddress: a.fullAddress || a.addressLine || ""
        }));
    }
}
