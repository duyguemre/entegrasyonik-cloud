// ADR-0026 WP-LOG L1: `platform/runtime/logs` tek dış yüzey.
export { LogWriter } from './LogWriter';
export type { LogInsertModel, LogWriterOptions, LogWriterStats, PersistLevel } from './LogWriter';
export { toLogEventDoc, levelRank, LOG_TTL_DAYS, LOG_TTL_DAYS_LOW, CTX_MAX_BYTES } from './logRecord';
export type { LogEventDoc } from './logRecord';
export { installLogPersistence, closeLogPersistence, getLogWriter } from './install';
export { productionLogEventModel } from './prodDeps';
export { listLogs, getIssueGroups, getIssueTrend, getTrace, getVolumeByCategory, QUERY_MAX_TIME_MS, MAX_PAGE_SIZE, MAX_GROUPS, MAX_TRACE_ENTRIES, LogQueryError, buildLogMatch } from './logQuery';
export type { LogFilters, LogPage, IssueGroup, IssueGroupFilters, TrendPoint, TraceEntry, CategoryVolume, TimeRange, LogQueryDeps, IssueSort } from './logQuery';
