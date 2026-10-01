import { Connection, Model } from 'mongoose'
import { ClientIntegrationSchema } from './models/ClientIntegration';
import { ProductSchema } from './models/Product';
import { VariantSchema } from './models/Variant';
import { OrderSchema } from './models/Order';
import { CustomerSchema } from './models/Customer';
import { ClaimSchema } from './models/Claim';
import { ImageSchema } from './models/Image';
import { SettingSchema } from './models/Setting';
import { CategorySchema } from './models/Category';
import { BrandSchema } from './models/Brand';
import { ChoiceSchema } from './models/Choice';
import { HashtagSchema } from './models/Common';
import { FavoriteSchema } from './models/Common';
import { CounterSchema } from './models/Common';
import { StatisticsSchema } from './models/Statistics';
import { AttributeMappingSchema } from './models/AttributeMapping';
import { NotificationSchema } from './models/Notification';
import { ExportStagedProductSchema } from './models/Export';
import { ImportJobReportSchema, ImportStagedProductSchema, ImportStagedProductSummarySchema } from './models/Import';
import { InvoiceSchema } from './models/Invoice';
import { MessageSchema } from './models/Message';
import { IdempotencyKeySchema } from './models/IdempotencyKey';
import { StockMovementSchema } from './models/StockMovement';
import { CommissionOverrideSchema } from './models/CommissionOverride';
import { BuyboxSnapshotSchema } from './models/BuyboxSnapshot';
import { PriceRuleSchema } from './models/PriceRule';
import { PriceSuggestionSchema } from './models/PriceSuggestion';
import { PriceHistorySchema } from './models/PriceHistory';
import { PricingSettingsSchema } from './models/PricingSettings';
import { UserSchema } from './models/User';
import { FinancialTransactionSchema, CargoInvoiceSchema } from './models/Financial';

export default (mongooseConnection: Connection): Record<string, Model<any>> => {
    return {
        user: mongooseConnection.model('user', UserSchema),
        client_integration: mongooseConnection.model('client_integration', ClientIntegrationSchema),
        product: mongooseConnection.model('product', ProductSchema),
        variant: mongooseConnection.model('variant', VariantSchema),
        order: mongooseConnection.model('order', OrderSchema),
        customer: mongooseConnection.model('customer', CustomerSchema),
        claim: mongooseConnection.model('claim', ClaimSchema),
        image: mongooseConnection.model('image', ImageSchema),
        setting: mongooseConnection.model('setting', SettingSchema),
        category: mongooseConnection.model('category', CategorySchema),
        brand: mongooseConnection.model('brand', BrandSchema),
        choice: mongooseConnection.model('choice', ChoiceSchema),
        hashtag: mongooseConnection.model('hashtag', HashtagSchema),
        favorite: mongooseConnection.model('favorite', FavoriteSchema),
        invoice: mongooseConnection.model('invoice', InvoiceSchema),
        counter: mongooseConnection.model('counter', CounterSchema),
        statistics: mongooseConnection.model('statistics', StatisticsSchema),
        attribute_mapping: mongooseConnection.model('attribute_mapping', AttributeMappingSchema),
        notification: mongooseConnection.model('notification', NotificationSchema),
        export_staged_product: mongooseConnection.model('export_staged_product', ExportStagedProductSchema),
        import_staged_product: mongooseConnection.model('import_staged_product', ImportStagedProductSchema),
        import_staged_product_summary: mongooseConnection.model('import_staged_product_summary', ImportStagedProductSummarySchema),
        import_job_report: mongooseConnection.model('import_job_report', ImportJobReportSchema),
        message: mongooseConnection.model('message', MessageSchema),
        financial_transaction: mongooseConnection.model('financial_transaction', FinancialTransactionSchema),
        cargo_invoice: mongooseConnection.model('cargo_invoice', CargoInvoiceSchema),
        idempotency_key: mongooseConnection.model('idempotency_key', IdempotencyKeySchema),
        stock_movement: mongooseConnection.model('stock_movement', StockMovementSchema),
        commission_override: mongooseConnection.model('commission_override', CommissionOverrideSchema),
        buybox_snapshot: mongooseConnection.model('buybox_snapshot', BuyboxSnapshotSchema),
        price_rule: mongooseConnection.model('price_rule', PriceRuleSchema),
        price_suggestion: mongooseConnection.model('price_suggestion', PriceSuggestionSchema),
        price_history: mongooseConnection.model('price_history', PriceHistorySchema),
        pricing_settings: mongooseConnection.model('pricing_settings', PricingSettingsSchema)
    }
}