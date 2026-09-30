// [ADR-0023] Kimlik/hesap/yönetim/faturalama yazma operasyonlarının gövde şemaları (ilk dalga).
import { z } from 'zod';
import { allowList, email, idStr, reqText, safeSettings, secret, strictBody, tenantNo, text } from './common';
import type { RpcRef } from '../types';

// Kullanıcı yazımı: allow-list (name/surname/email/password/roleCode/isActive). `owner`, `isGlobalAdmin`, `clientId`, `lockUntil`,
// `failedLoginAttempts`… gövdeden ALINAMAZ (tenant Users şeması `strict:false` olduğundan eskiden ham `create(user)` ile yazılıyordu).
const userCore = {
    name: reqText(100),
    surname: reqText(100),
    email,
    roleCode: reqText(64),
    isActive: z.boolean().optional(),
};

const looseObject = z.record(z.string(), z.unknown());

export const IDENTITY_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'UserService/createUser': strictBody({ user: allowList({ ...userCore, password: secret }) }),
    'UserService/updateUser': strictBody({ user: allowList({ _id: idStr, ...userCore, password: secret.optional() }) }),
    'UserService/deleteUser': strictBody({ userId: idStr }),

    // [ADR-0028 WP-A4] davet / askıya alma / sahiplik devri. Rol serbest metin DEĞİL: sistem rolü kod listesi servis içinde de doğrulanır (owner reddedilir).
    'UserService/inviteUser': strictBody({ email, role: reqText(32) }),
    'UserService/resendInvitation': strictBody({ invitationId: idStr }),
    'UserService/revokeInvitation': strictBody({ invitationId: idStr }),
    'UserService/listInvitations': strictBody({ status: z.enum(['pending', 'accepted', 'revoked']).optional() }),
    'UserService/suspendUser': strictBody({ userId: idStr, reason: text(200).optional() }),
    'UserService/reactivateUser': strictBody({ userId: idStr }),
    'UserService/initiateOwnershipTransfer': strictBody({ targetUserId: idStr }),
    'UserService/cancelOwnershipTransfer': strictBody({}),
    'UserService/acceptOwnershipTransfer': strictBody({ token: reqText(128) }),
    'AccountService/reauthenticate': strictBody({ password: secret }),

    // Tenant ayar belgesi: FE sunucudan aldığı belgeyi geri gönderir (`_id`/`__v` no-op; atılır). `docId` sunucuda 1'e sabitlenir.
    'SettingService/updateSettings': strictBody({
        settings: safeSettings.transform((s) => { const { _id, __v, docId, ...rest } = s as Record<string, unknown>; return rest; }),
    }),

    // NOT: AccountService/changePassword BİLİNÇLİ şemasız: özel rota + yaşam döngüsü servisi kendi kodlu doğrulamasını yapar
    // (INVALID_REQUEST/WEAK_PASSWORD; tests/unit/account/account-endpoints.test.ts) — VALIDATION ile eşlemesi FE sözleşmesini değiştirir.
    'AccountService/resendVerificationEmail': strictBody({}),

    'BillingService/startCheckout': strictBody({ planCode: reqText(64), billingInterval: z.enum(['month', 'year']).optional() }),

    'TenantDataService/requestDeletion': strictBody({ password: z.string().max(1024).optional(), confirmTenantName: text(200).optional() }),
    'TenantDataService/exportTenantData': strictBody({}),

    // Platform yöneticisi (ga) yüzeyi
    'AdminService/createClient': strictBody({
        clientData: allowList({ title: text(200).optional(), name: text(200).optional() }),
        userData: allowList({ name: text(100).optional(), surname: text(100).optional(), fullName: text(200).optional(), email, password: secret }),
    }),
    'AdminService/updateClient': strictBody({
        targetClientId: tenantNo,
        // Servis yalnız title/status/integrations okur (dbConfig/order/clientId ATILIR)
        clientData: allowList({ title: text(200).optional(), status: z.enum(['ACTIVE', 'PASSIVE']).optional(), integrations: looseObject.or(z.array(z.unknown())).optional() }),
    }),
    'AdminService/deleteClient': strictBody({ targetClientId: tenantNo }),
    'AdminService/createTicket': strictBody({
        targetClientId: tenantNo, subject: reqText(200), content: reqText(5000), priority: text(30).optional(), type: text(50).optional(),
    }),
    'AdminService/replyToTicket': strictBody({ ticketId: idStr, content: reqText(5000) }),
    'AdminService/deleteTicket': strictBody({ ticketId: idStr }),

    // Süper yönetici mağaza seçimi: hedef tenant işlem parametresidir (tenant kimliği kaynağı DEĞİL)
    'SecurityService/selectStore': strictBody({ clientId: tenantNo }),

    'IntegrationComplianceService/transition': strictBody({
        id: reqText(300), action: reqText(50), reason: text(2000).optional(), fixRef: text(300).optional(), fixedInAdapterVersion: text(100).optional(),
    }),

    // Entegrasyon yapılandırma (platform ayarı): yalnız tip/şekil kapısı; anlamsal doğrulama servisin kendi `validatePatch`i.
    'IntegrationConfigService/saveDraft': strictBody({
        target: reqText(100), patch: looseObject.optional(), unset: z.array(reqText(200)).max(200).optional(), expectedDraftRev: z.number().int().optional(),
    }),
    'IntegrationConfigService/discardDraft': strictBody({ target: reqText(100), expectedDraftRev: z.number().int().optional() }),
    'IntegrationConfigService/publish': strictBody({ target: reqText(100), reason: text(2000).optional(), typedConfirmation: text(200).optional(), approvedBy: text(200).optional() }),
    'IntegrationConfigService/rollback': strictBody({
        target: reqText(100), toVersion: z.union([z.number().int().min(1), z.string().regex(/^\d{1,9}$/)]),
        reason: text(2000).optional(), typedConfirmation: text(200).optional(), approvedBy: text(200).optional(),
    }),
    'IntegrationConfigService/setIntake': strictBody({
        target: reqText(100), intake: z.enum(['on', 'drain', 'off']), reason: text(2000).optional(), typedConfirmation: text(200).optional(),
        maintenance: looseObject.nullable().optional(), approvedBy: text(200).optional(),
    }),
};
