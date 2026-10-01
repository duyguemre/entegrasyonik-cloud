import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import { listViews, saveView, deleteView } from '../../../operations/backoffice/viewsAdmin'

/**
 * BE-05 (K51) -- `/admin-api` kayıtlı görünümler: yönetici başına, ekran başına adlandırılmış URL süzgeçleri (<=20). Yalnız çağıranın kayıtları (`principal.sub`).
 * Yazmalar (`saveView`/`deleteView`) RunOperation'da `backoffice.write` denetimi alır; step-up/gerekçe YOK (kişisel tercih). Sözleşme: docs/API_BACKOFFICE_ATTENTION.md (BE-05).
 */
export default class BackofficePrefsService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    private deps() { return { model: this.applicationDB.getBackofficeViewModel() } }
    private sub(): string | undefined { return this.request?.principal?.sub }

    async listViews(): Promise<any> { return listViews(this.deps(), this.sub(), this.request?.screen) }
    async saveView(): Promise<any> { const r = this.request || {}; return saveView(this.deps(), this.sub(), { screen: r.screen, name: String(r.name).trim(), query: r.query }) }
    async deleteView(): Promise<any> { return deleteView(this.deps(), this.sub(), this.request?.id) }
}
