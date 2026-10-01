# CAPABILITIES_CHANGELOG.md

**ÜRETİLMİŞ BELGE — ELLE DÜZENLENMEZ.** `npm run capabilities:docs` her manifest özeti değiştiğinde
buraya tarihli bir blok ekler (ADR-0019 §4.1). Kademe değişiklikleri HER ZAMAN buraya yazılır.

## 2026-09-28 — sha256 ff960a0cc0a2…
- İLK ÜRETİM (Aşama A): 174 RPC operasyonu → 149 yetenek içe aktarıldı; tamamı `mcp.notExposed`.
- Eklenen: `account.email_verification.resend`, `account.password.change`, `account.tenant.data.export`, `account.tenant.deletion.request`, `audit.logs.list`, `billing.checkout.start`, `billing.plans.list`, `billing.subscription.get`, `brands.create`, `brands.delete`, `brands.integration_mapping.save`, `brands.list`, `brands.update`, `categories.create`, `categories.delete`, `categories.list`, `categories.move`, `categories.update`, `choices.create`, `choices.delete`, `choices.list`, `choices.update`, `choices.values.add`, `choices.values.remove`, `choices.values.update`, `claims.approve`, `claims.get`, `claims.list`, `claims.reject`, `config.get`, `customers.anonymize`, `customers.get`, `customers.list`, `customers.update`, `finance.cargo_invoices.list`, `finance.payouts.detail`, `finance.summary`, `finance.transactions.list`, `hashtags.create`, `hashtags.delete`, `hashtags.list`, `hashtags.update`, `hashtags.values.add`, `hashtags.values.remove`, `hashtags.values.update`, `images.assign`, `images.delete`, `images.list`, `images.sort`, `images.upload`, `integrations.batch.dispatch`, `integrations.catalog.list`, `integrations.client.list`, `integrations.ecommerce.settings.get`, `integrations.ecommerce.settings.save`, `integrations.ecommerce.token.exchange`, `integrations.erp.settings.get`, `integrations.erp.settings.save`, `integrations.export.jobs.detail`, `integrations.export.jobs.list`, `integrations.health.get`, `integrations.import.jobs.detail`, `integrations.import.jobs.list`, `integrations.marketplace.settings.get`, `integrations.marketplace.settings.save`, `integrations.marketplace.sort`, `integrations.platform_info.get`, `integrations.shipment.settings.get`, `integrations.shipment.settings.save`, `integrations.webhook_token.generate`, `invoices.create`, `invoices.create_manual`, `invoices.delete`, `invoices.list`, `invoices.reissue`, `mappings.attribute.get`, `mappings.attribute.save`, `mappings.category.auto_match`, `mappings.category.get`, `mappings.category.save`, `mappings.delete`, `mappings.list`, `menu.favorites.add`, `menu.favorites.list`, `menu.favorites.remove`, `menu.favorites.sort`, `menu.get`, `messages.delete`, `messages.list`, `messages.mark_read`, `messages.reply`, `notifications.delete`, `notifications.list`, `notifications.mark_read`, `notifications.unread_count`, `orders.approve`, `orders.cancel`, `orders.list`, `orders.mark_printed`, `orders.rejection_reasons.list`, `platform.admin.get`, `platform.clients.create`, `platform.clients.delete`, `platform.clients.integrations.list`, `platform.clients.list`, `platform.clients.stats`, `platform.clients.update`, `platform.exports.detail`, `platform.metrics.global`, `platform.store.select`, `platform.system.health`, `platform.tenant.deletion.cancel`, `platform.tickets.create`, `platform.tickets.delete`, `platform.tickets.list`, `platform.tickets.reply`, `products.create`, `products.delete`, `products.export`, `products.get`, `products.onsale.set`, `products.platform_ready.set`, `products.search`, `products.statistics`, `products.update`, `reports.sales.summary`, `resources.list`, `roles.list`, `search.unified`, `settings.get`, `settings.logo.upload`, `settings.update`, `shipments.create`, `shipments.list`, `stock.overview`, `stock.policy.get`, `stock.policy.save`, `tickets.close`, `tickets.list`, `tickets.message.send`, `tickets.open`, `users.create`, `users.delete`, `users.list`, `users.update`, `variants.add`, `variants.delete`, `variants.list`, `variants.update`

## 2026-09-28 — sha256 af966e289f7c…

- Eklenen: `integrations.catalog.manifest.get`

## 2026-09-29 — sha256 76061891e411…

- Eklenen: `platform.integration_config.discard_draft`, `platform.integration_config.get`, `platform.integration_config.history`, `platform.integration_config.preview_publish`, `platform.integration_config.publish`, `platform.integration_config.rollback`, `platform.integration_config.save_draft`, `platform.integration_config.take_over_lock`, `platform.integration_config.test_endpoint`, `platform.integrations.list`

## 2026-09-30 — sha256 f4ec3ff7b2b8…

- Eklenen: `account.reauthenticate`, `notifications.archive`, `notifications.catalog`, `notifications.preferences.get`, `notifications.preferences.update`, `notifications.tenant_defaults.get`, `notifications.tenant_defaults.update`, `platform.audit.list`, `platform.integration_compliance.get_detail`, `platform.integration_compliance.list`, `platform.integration_compliance.summary`, `platform.integration_compliance.transition`, `platform.integration_config.propose_from_finding`, `platform.integrations.set_intake`, `platform.logs.issue_groups`, `platform.logs.issue_set_status`, `platform.logs.issue_trend`, `platform.logs.list`, `platform.logs.trace`, `platform.logs.volume`, `users.invitation.list`, `users.invitation.resend`, `users.invitation.revoke`, `users.invite`, `users.ownership.transfer.accept`, `users.ownership.transfer.cancel`, `users.ownership.transfer.initiate`, `users.reactivate`, `users.suspend`

## 2026-09-30 — sha256 1aeec2d6a745…

- Eklenen: `finance.commission.by_barcode`, `finance.commission.order_summary`, `finance.commission.realized_by_category`, `platform.admins.disable`, `platform.admins.enable`, `platform.admins.invite`, `platform.admins.list`, `platform.admins.reset_mfa`

## 2026-09-30 — sha256 2092a9961337…

## 2026-09-30 — sha256 f741d9d9da2e…

- Eklenen: `finance.commission.overrides.delete`, `finance.commission.overrides.list`, `finance.commission.overrides.set`, `finance.net_revenue.preview`, `integrations.connection.test`, `stock.low_list`, `stock.movements.list`, `stock.publish_lag.summary`

## 2026-09-30 — sha256 da60a7c1e306…

- Eklenen: `agent.confirm`, `agent.info`, `agent.more`, `agent.reset`, `agent.turn`, `notifications.announcements.active`, `platform.alerts.list`, `platform.alerts.mute`, `platform.announcements.cancel`, `platform.announcements.list`, `platform.announcements.save`, `platform.announcements.schedule`, `platform.engine.discard_job`, `platform.engine.failed_jobs`, `platform.engine.job_runs`, `platform.engine.queues`, `platform.engine.release_stuck_lease`, `platform.engine.retry_job`, `platform.engine.state_machine_jobs`, `platform.infra.cache_metrics`, `platform.infra.flush_cache_family`, `platform.infra.mongo_collections`, `platform.infra.mongo_status`, `platform.infra.redis_status`, `platform.infra.slow_queries`, `platform.integration_config.catalog`, `platform.integrations.api_health`, `platform.integrations.resilience`, `platform.notifications.catalog`, `platform.notifications.deliveries.discard`, `platform.notifications.deliveries.read`, `platform.notifications.deliveries.retry`, `platform.notifications.tenant_history`, `platform.notifications.test_email`, `platform.overview.health`, `platform.revenue.metrics`, `platform.subscriptions.cancel`, `platform.subscriptions.change_plan`, `platform.subscriptions.extend_trial`, `platform.subscriptions.get`, `platform.subscriptions.list`, `platform.tenant.deletion.cancel_backoffice`, `platform.tenant.lifecycle`

## 2026-10-01 — sha256 5df75dc86089…

- Eklenen: `agent.provider.consent`, `agent.provider.get`, `agent.provider.remove`, `agent.provider.save`, `agent.provider.test`, `oauth.consent.decide`, `oauth.consent.view`

## 2026-10-01 — sha256 3a4f19ed2322…

## 2026-10-01 — sha256 7f61470cf82a…

- Eklenen: `mcp.approvals.list`, `mcp.connections.list`, `mcp.connections.revoke`, `mcp.connections.revoke_all`, `mcp.settings.get`, `mcp.settings.save`

## 2026-10-01 — sha256 de5bce31df2b…

- Eklenen: `mcp.approvals.decide`, `mcp.approvals.view`

## 2026-10-01 — sha256 770359f43874…

- Eklenen: `platform.agent.confirm`, `platform.agent.info`, `platform.agent.more`, `platform.agent.provider.get`, `platform.agent.provider.remove`, `platform.agent.provider.save`, `platform.agent.provider.test`, `platform.agent.reset`, `platform.agent.turn`

## 2026-10-01 — sha256 f76048ff6f47…

## 2026-10-01 — sha256 e8ab45c62866…

- Eklenen: `platform.engine.retry_jobs`, `platform.overview.attention`, `platform.overview.pulse`, `platform.prefs.delete_view`, `platform.prefs.list_views`, `platform.prefs.save_view`, `platform.tenants.health_summary`, `platform.tenants.list`

## 2026-10-01 — sha256 3bfd6aab5406…

- Eklenen: `notifications.push.config`, `notifications.push.subscribe`, `notifications.push.unsubscribe`

## 2026-10-01 — sha256 110d6cf1a3bf…

- Eklenen: `platform.prefs.push_config`, `platform.prefs.push_subscribe`, `platform.prefs.push_unsubscribe`

## 2026-10-01 — sha256 5208c53c4350…

- Eklenen: `platform.tenants.usage`

## 2026-10-01 — sha256 1d7f89e86bbb…

- Eklenen: `platform.competition.override.set`, `platform.competition.settings`, `pricing.buybox.list`, `pricing.cost.list`, `pricing.cost.set`, `pricing.margin.preview`

## 2026-10-01 — sha256 059b0a852c7f…

- Eklenen: `platform.pricing_rules.overview`, `pricing.rules.list`, `pricing.rules.save`, `pricing.rules.settings`, `pricing.suggestions.apply`, `pricing.suggestions.list`

## 2026-10-01 — sha256 ebd1470f6254…

- Eklenen: `platform.prefs.push_config`, `platform.prefs.push_subscribe`, `platform.prefs.push_unsubscribe`, `platform.tenants.usage`

