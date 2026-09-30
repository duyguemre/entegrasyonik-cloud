/**
 * frontend/src/composables/useTeamApi.ts
 *
 * Faz 3 / C2a — ekip yönetimi RPC'leri (docs/cloud-contracts/API_ACCOUNT_LIFECYCLE.md §6-9). Hepsi `restApi.post`
 * üzerinden: hata DEĞER olarak döner (axios hata nesnesi; `apiErrors.isApiError`), ileti `errorCodes.errorMessageKey`.
 * Idempotency-Key: `inviteUser`, `resendInvitation`, `initiateOwnershipTransfer` sözleşme listesinde → `restapi.ts`
 * her çağrıda üretir; aynı kullanıcı eyleminin yeniden denemesi için çağıran `idempotencyKey` verir.
 * REAUTH_REQUIRED (ör. `initiateOwnershipTransfer`) merkezi yakalayıcıda çözülür — burada özel iş yok.
 */
import { reactive } from 'vue'
import useRestApi from '@/composables/restapi'
import { isApiError } from '@/composables/apiErrors'
import { registerStoreReset } from '@/stores/resetRegistry'
import type { InvitableRole } from '@/components/user/team/teamModel'

export interface PendingTransfer {
  transferId: string
  expiresAt?: string
  targetName: string
}

// Sunucu bekleyen devri listelemez (bkz. rapor "backend eksikleri") → yalnız bu oturumda başlatılan devir bilinir.
const transferState = reactive<{ pending: PendingTransfer | null }>({ pending: null })
// Oturuma bağlı: giriş ekranında (çıkış / oturum düşmesi) başka bir hesaba sızmasın.
registerStoreReset('teamTransfer', () => {
  transferState.pending = null
})

export function useTeamApi() {
  const restApi = useRestApi()
  const post = (rpc: string, body: Record<string, unknown>, idempotencyKey?: string) =>
    restApi.post(rpc, body, true, undefined, idempotencyKey ? { idempotencyKey } : undefined) as Promise<any>

  return {
    transferState,

    listInvitations: (status: 'pending' | 'accepted' | 'revoked' = 'pending') => post('UserService/listInvitations', { status }),
    inviteUser: (body: { email: string; role: InvitableRole }, idempotencyKey?: string) => post('UserService/inviteUser', body, idempotencyKey),
    resendInvitation: (invitationId: string, idempotencyKey?: string) => post('UserService/resendInvitation', { invitationId }, idempotencyKey),
    revokeInvitation: (invitationId: string) => post('UserService/revokeInvitation', { invitationId }),

    suspendUser: (userId: string, reason?: string) => post('UserService/suspendUser', reason ? { userId, reason } : { userId }),
    reactivateUser: (userId: string) => post('UserService/reactivateUser', { userId }),

    async initiateOwnershipTransfer(targetUserId: string, targetName: string, idempotencyKey?: string) {
      const resp = await post('UserService/initiateOwnershipTransfer', { targetUserId }, idempotencyKey)
      if (!isApiError(resp) && resp?.success) {
        transferState.pending = { transferId: String(resp.transferId ?? ''), expiresAt: resp.expiresAt, targetName }
      }
      return resp
    },
    async cancelOwnershipTransfer() {
      const resp = await post('UserService/cancelOwnershipTransfer', {})
      if (!isApiError(resp)) transferState.pending = null
      return resp
    },
    acceptOwnershipTransfer: (token: string) => post('UserService/acceptOwnershipTransfer', { token }),

    // AÇIK uçlar (kimliksiz; `accountTokenLimiter`).
    getInvitation: (token: string) => post('AccountService/getInvitation', { token }),
    acceptInvitation: (body: { token: string; name: string; surname: string; password: string }) => post('AccountService/acceptInvitation', body),
  }
}
