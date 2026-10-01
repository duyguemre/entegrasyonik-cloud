import { InvalidatesTenantCache } from '@utils/decorator/cache'
import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { detachChoiceFromMappings, pullValueFromMappings } from '@operations/catalog/mapping/mappingCleanup'
import { ChoiceRepository } from '@database/repositories/tenant/ChoiceRepository'
import { AttributeMappingRepository } from '@database/repositories/tenant/AttributeMappingRepository'

export default class ChoiceService extends BaseApi implements IService {
    // Getter: test, servisi kurduktan SONRA `svc.clientDB` atar (BrandService deseni).
    private get choices() { return new ChoiceRepository(this.clientDB) }
    private get mappings() { return new AttributeMappingRepository(this.clientDB) }

    async get(): Promise<any> {
        // Opsiyonel sayfalama (yanıt şekli aynı: dizi). Verilmezse tümü döner (FE sözleşmesi).
        const choices = await this.choices.list({ skip: this.request?.skip, limit: this.request?.limit })
        for (const choice of choices) {
            choice.values.sort((a: any, b: any) => {
                const aNum = Number(a.title);
                const bNum = Number(b.title);
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return aNum - bNum;
                }
                return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
            })
        }
        return choices
    }

    @InvalidatesTenantCache('PlatformMappingProvider')

    @InvalidatesTenantCache('PlatformMappingProvider')
    async addChoice(): Promise<any> {
        const document = {
            title: this.request.title,
            isVarianter: this.request.isVarianter || false, // Eklendi
            isSlicer: this.request.isSlicer || false        // Eklendi
        }
        const resp = await this.choices.create(document)
        return { result: resp }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async addPreparedChoice(): Promise<any> {
        const resp = await this.choices.create(this.request.choice)
        return { result: resp }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async updateChoice(): Promise<any> {
        const resp = await this.choices.updateFlags(this.request._id as string, this.request.title, this.request.isVarianter, this.request.isSlicer)
        return { result: resp }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async removeChoice(): Promise<any> {
        const resp = await this.choices.remove(this.request._id as string)
        // Yetim referans temizliği (P1-5): silme sonucundan BAĞIMSIZ çalışır (idempotent; yarım kalan silme tekrarında iyileşir).
        const detachedMappings = await detachChoiceFromMappings(this.mappings, String(this.request._id))
        return { result: resp, detachedMappings }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async addChoiceValue(): Promise<any> {
        if (await this.choices.hasValueTitle(this.request._id as string, this.request.title)) {
            throw new Error(`"${this.request.title}" başlığı zaten mevcut`);
        }

        // Schema'da allowCustom olduğu için eklendi
        await this.choices.pushValue(this.request._id as string, this.request.title, this.request.allowCustom || false);

        return true;
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async updateChoiceValue(): Promise<any> {
        const choiceId = new ObjectId(this.request._id as string);
        const valueId = new ObjectId(this.request.id as string);
        const newTitle = this.request.title;

        if (await this.choices.hasDuplicateValueTitle(choiceId, valueId, newTitle)) {
            throw new Error(`"${newTitle}" başlığı başka bir öğede zaten mevcut`);
        }

        const resp = await this.choices.updateValue(choiceId, valueId, newTitle, this.request.allowCustom);

        return { result: resp };
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async removeChoiceValue(): Promise<any> {
        const resp = await this.choices.pullValue(this.request._id as string, this.request.id as string)
        const cleanedMappings = await pullValueFromMappings(this.mappings, String(this.request.id))
        return { result: resp, cleanedMappings }
    }
}
