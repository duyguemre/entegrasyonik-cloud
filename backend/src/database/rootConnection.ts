import { config } from "@config";
import ApplicationDB from "./application/ApplicationDB";
import Database from "./Database";

/** Uygulama (kök) bağlantı yapılandırması: env'deki DB_URL/DB_USER/DB_PASSWORD/DB_NAME; havuz boyutu TEK yerde (DB_POOL_SIZE, ADR-0024 D2). */
export function getAppDbConfig() {
    return {
        url: config.db.url ?? "",
        user: config.db.user ?? "",
        password: config.db.password ?? "",
        dbname: config.db.name ?? "",
        poolsize: config.db.poolSize
    };
}

/** Süreç başına TEK kök bağlantı (ApplicationDB'nin bağlantısı). Tenant tutamakları bundan `useDb` ile türetilir. */
export async function getRootDatabase(): Promise<Database> {
    const app = await ApplicationDB.getInstance(getAppDbConfig());
    return app.getRootDatabase();
}
