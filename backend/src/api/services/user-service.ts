import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import Security, { ApplicationError } from '../Security'
import { IService } from '@interfaces/index'
import { AuditLogger } from '@services/audit/AuditLogger'

// ADR-0003 D.15: kullanıcı listesi yanıtı BEYAZ LİSTE projeksiyonudur (password, tokenVersion, failedLoginAttempts, lockUntil,
// __v ve belgede kalmış diğer alanlar ASLA dönmez). FE listesi yalnızca bu alanları kullanır (AuthorizationListView.vue).
export const USER_LIST_PROJECTION = {
    _id: 1, email: 1, name: 1, surname: 1, roleCode: 1, owner: 1, isGlobalAdmin: 1, isActive: 1,
    resources: 1, order: 1, clientId: 1, createdAt: 1, updatedAt: 1,
} as const;

const isDuplicateKeyError = (e: any) => !!e && (e.code === 11000 || e.code === 11001);
const EMAIL_TAKEN = 'Bu e-posta adresi kullanılamıyor.';

export default class UserService extends BaseApi implements IService {
    currentClientId!: any
    constructor(clientId: number, protected request: any) {
        super(clientId, request)
        this.currentClientId = clientId
    }

    async get(): Promise<any> {
    }


    async getUsers(): Promise<any> {
        try {
            var direction = 1
            const sortBy: any = {}
            if (this.request.sortBy != undefined && this.request.sortBy.key) {
                direction = this.request.sortBy.order == 'asc' ? 1 : -1
                sortBy[this.request.sortBy.key] = direction
            } else {
                sortBy._id = 1
            }

            const response: any = {};
            const skipCount = (this.request.pagination.page - 1) * this.request.pagination.limit;
            const limitCount = this.request.pagination.limit;

            // Müşterinin kendi veritabanından (ClientDB) çek
            const result = await this.clientDB.getUserModel().aggregate([
                { $match: {} }, // ClientDB izoledir, ek bir filtera gerek yok (ama istenirse eklenebilir)
                {
                    $facet: {
                        totalNumberOfRecords: [{ $count: 'count' }],
                        users: [
                            { $skip: skipCount },
                            { $limit: limitCount },
                            { $project: USER_LIST_PROJECTION }
                        ]
                    }
                },
            ]);

            const aggregationResult = result[0] || {};
            response.totalNumberOfRecords = aggregationResult.totalNumberOfRecords?.[0]?.count || 0;
            response.users = aggregationResult.users || [];

            if (response.users.length > 0) {
                response.fromTo = {
                    from: skipCount + 1,
                    to: skipCount + response.users.length
                };
            }
            return response;
        } catch (error) {
            throw error
        }
    }

    async getRoles(): Promise<any> {
        try {
            // Merkezi veritabanındaki sabit rolleri getir
            return await this.applicationDB.getGlobalRoleModel().find().lean();
        } catch (error) {
            throw error;
        }
    }

    async getResources(): Promise<any> {
        try {
            // Geriye dönük uyumluluk için, yetkileri merkezi listeden getir
            const resp = await this.applicationDB.getResourceModel().find().lean();
            return resp?.[0]?.resources || [];
        } catch (error) {
            throw error;
        }
    }



    async createUser(): Promise<any> {
        try {
            const user = this.request.user;
            const security = Security.getInstance();

            // 1. Şifreyi Hash'le!
            const hashedPassword = await security.hashPassword(user.password);
            user.password = hashedPassword;

            // 2. ClientDB'ye kaydet (Tam Profil)
            let clientUser: any;
            try {
                clientUser = await this.clientDB.getUserModel().create(user);
            } catch (e: any) {
                // Tenant içi e-posta tekil indeksi (E11000): ham Mongo mesajı istemciye sızmaz
                if (isDuplicateKeyError(e)) throw new ApplicationError(EMAIL_TAKEN, 409);
                throw e;
            }

            // 3. ApplicationDB'ye (Registry) kaydet (Login için)
            const centralUser = {
                email: user.email,
                name: user.name,
                surname: user.surname,
                password: hashedPassword,
                clientId: this.currentClientId,
                order: this.currentClientId, // Legacy support
                roleCode: user.roleCode,
                owner: false // UserService üzerinden eklenenler staff'tir
            };
            try {
                await this.applicationDB.getUserModel().create(centralUser);
            } catch (e: any) {
                // ADR-0003 A.2: merkezi Users.email tekil (küçük harfe normalize) — başka tenant'ta kayıtlı e-posta
                if (isDuplicateKeyError(e)) {
                    // Yarım kalan tenant içi kaydı geri al (best-effort)
                    try { await this.clientDB.getUserModel().deleteOne({ _id: clientUser?._id }); } catch { /* yut */ }
                    throw new ApplicationError(EMAIL_TAKEN, 409);
                }
                throw e;
            }

            // ADR-0001 Karar 11: kullanıcı ekleme audit log'a yazılır (e-posta/parola YAZILMAZ; best-effort)
            void AuditLogger.fromRequest(this.request, 'user.create', 'ok', { roleCode: typeof user.roleCode === 'string' ? user.roleCode : undefined })

            return true;
        } catch (error) {
            throw error;
        }
    }

    async updateUser(): Promise<any> {
        try {
            const user = this.request.user;
            const security = Security.getInstance();
            
            const clientUserFilter = { _id: new ObjectId(user._id) };
            
            // Eğer şifre değişmişse (plain gelmişse) hash'le
            if (user.password && user.password.length < 50) { // Basit bir hash kontrolü
                user.password = await security.hashPassword(user.password);
            }

            const updateFields: any = { 
                name: user.name, 
                surname: user.surname, 
                email: user.email, 
                roleCode: user.roleCode 
            };
            if (user.password) updateFields.password = user.password;

            // ADR-0001 Karar 4: rol değişimi tespiti için mevcut (ClientDB) kayıt okunur; okunamazsa/yoksa temkinli davranılıp
            // oturumlar iptal edilir (fazla iptal güvenli taraftır)
            const existing: any = await this.clientDB.getUserModel().findOne(clientUserFilter);
            const passwordChanged = !!updateFields.password;
            const roleChanged = !existing || existing.roleCode !== user.roleCode;

            // 1. ClientDB Güncelle
            await this.clientDB.getUserModel().updateOne(clientUserFilter, { $set: updateFields });

            // 2. ApplicationDB (Registry) Güncelle
            // ADR-0001 Karar 4: parola veya rol değişimi merkezi Users.tokenVersion'ı artırır (eski oturumlar 401 olur)
            const centralUserFilter = { email: user.email, clientId: this.currentClientId };
            const centralUpdate: any = { $set: updateFields };
            if (passwordChanged || roleChanged) centralUpdate.$inc = { tokenVersion: 1 };
            await this.applicationDB.getUserModel().updateOne(centralUserFilter, centralUpdate);

            if (passwordChanged) void AuditLogger.fromRequest(this.request, 'user.password_change', 'ok');
            if (roleChanged) void AuditLogger.fromRequest(this.request, 'user.role_change', 'ok', { roleCode: typeof user.roleCode === 'string' ? user.roleCode : undefined });

            return true;
        } catch (error) {
            throw error;
        }
    }

    async deleteUser(): Promise<any> {
        try {
            const userId = this.request.userId;
            const user = await this.clientDB.getUserModel().findOne({ _id: new ObjectId(userId) });
            
            if (user) {
                // 1. ClientDB'den sil
                await this.clientDB.getUserModel().deleteOne({ _id: user._id });
                // 2. ApplicationDB'den sil
                // ADR-0001 Karar 4: silmeden ÖNCE tokenVersion artırılır (silme yarım kalsa bile oturumlar düşer)
                await this.applicationDB.getUserModel().updateOne({ email: user.email, clientId: this.currentClientId }, { $inc: { tokenVersion: 1 } });
                await this.applicationDB.getUserModel().deleteOne({ email: user.email, clientId: this.currentClientId });
                void AuditLogger.fromRequest(this.request, 'user.delete', 'ok');
            }
            
            return true;
        } catch (error) {
            throw error;
        }
    }

}
