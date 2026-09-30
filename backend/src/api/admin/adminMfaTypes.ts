export interface AdminMfaRecord {
    sub: string;
    secret?: string;          // enc:v1:...
    pendingSecret?: string;   // enc:v1:...
    enabledAt?: Date;
    lastStep?: number;
    failedAttempts?: number;
    lockUntil?: Date;
    recoveryHashes?: Array<{ hash: string; usedAt?: Date | null }>;
}
