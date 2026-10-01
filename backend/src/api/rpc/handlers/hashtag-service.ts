import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { HashtagRepository } from '@database/repositories/tenant/HashtagRepository'

export default class HashtagService extends BaseApi implements IService {
    // Getter: test, servisi kurduktan SONRA `svc.clientDB` atar (BrandService deseni).
    private get hashtags() { return new HashtagRepository(this.clientDB) }

    async get(): Promise<any> {
        const hashtags = await this.hashtags.listByTitle()
        for (const hashtag of hashtags) {
            if (hashtag.values) {
                hashtag.values.sort((a: any, b: any) => {
                    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
                })
            }
        }
        return hashtags
    }

    async addHashtag(): Promise<any> {
        const document = {
            title: this.request.title,
            color: this.request.color || '#455a64',
            values: []
        }
        const resp = await this.hashtags.create(document)
        return { result: resp }
    }

    async updateHashtag(): Promise<any> {
        const resp = await this.hashtags.updateTitleColor(this.request._id as string, this.request.title, this.request.color)
        return { result: resp }
    }

    async removeHashtag(): Promise<any> {
        const resp = await this.hashtags.remove(this.request._id as string)
        return { result: resp }
    }

    async addHashtagValue(): Promise<any> {
        const hashtagId = new ObjectId(this.request._id as string);
        const title = this.request.title;
        const color = this.request.color || '#455a64';

        if (await this.hashtags.hasValueTitle(hashtagId, title)) {
            throw new Error(`"${title}" etiketi zaten mevcut`);
        }

        await this.hashtags.pushValue(hashtagId, title, color);

        return true;
    }

    async updateHashtagValue(): Promise<any> {
        const hashtagId = new ObjectId(this.request._id as string);
        const valueId = new ObjectId(this.request.id as string);

        const resp = await this.hashtags.updateValue(hashtagId, valueId, this.request.title, this.request.color);
        return { result: resp };
    }

    async removeHashtagValue(): Promise<any> {
        const hashtagId = new ObjectId(this.request._id as string);
        const valueId = new ObjectId(this.request.id as string);

        const resp = await this.hashtags.pullValue(hashtagId, valueId);
        return { result: resp };
    }
}
