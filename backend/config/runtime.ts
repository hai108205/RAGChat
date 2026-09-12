import { parseEnvironment, type AppConfig } from "./env.js";
import { loadEnvironmentFile } from "./loadEnv.js";

loadEnvironmentFile(import.meta.url);

const startupConfig = parseEnvironment(process.env);

// Production configuration is immutable for the lifetime of the process.  The
// proxy preserves isolated env-mutation tests while they are migrated to pass
// explicit configuration fixtures.
export const config: AppConfig = process.env.VITEST
    ? new Proxy({} as AppConfig, {
          get: (_target, property) => parseEnvironment(process.env, false)[property as keyof AppConfig],
      })
    : startupConfig;

// Compatibility view for modules migrated incrementally from process.env.  It is
// derived exclusively from the validated config above; application code must not
// read process.env directly.
export const runtimeEnv = Object.freeze({
    ACCESS_TOKEN_EXPIRY: config.auth.accessTokenExpiry,
    ACCESS_TOKEN_SECRET: config.auth.accessTokenSecret,
    ADMIN_USERNAME: config.auth.adminUsername,
    ALLOW_ROCKETCHAT_GLOBAL_MODE: String(config.rocketchat.allowGlobalMode),
    ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV: String(config.rocketchat.allowUnauthenticatedDev),
    CIPHER_KEY: config.encryption.key.toString("base64"),
    CORS_METHODS: config.server.corsMethods.join(","),
    CORS_ORIGIN: config.server.corsOrigins.join(","),
    CRAWL_ALLOW_ON_ROBOTS_ERROR: String(config.crawler.allowOnRobotsError),
    CRAWL_DELAY_MS: String(config.crawler.delayMs),
    CRAWL_MAX_CONCURRENCY_PER_DOMAIN: String(config.crawler.maxConcurrencyPerDomain),
    CRAWL_RESPECT_ROBOTS_TXT: String(config.crawler.respectRobotsTxt),
    CRAWL_ROBOTS_CACHE_TTL_MS: String(config.crawler.robotsCacheTtlMs),
    CRAWL_ROBOTS_TIMEOUT_MS: String(config.crawler.robotsTimeoutMs),
    CRAWL_USER_AGENT: config.crawler.userAgent,
    DAILY_TOKEN_BUDGET: config.integrations.dailyTokenBudget?.toString(),
    DATABASE_URL: config.database.url,
    DEFAULT_LLM_MODEL: config.llm.defaultModel,
    EMBEDDING_MODEL: config.llm.embeddingModel,
    ENABLE_WEB_ROUTES: String(config.server.enableWebRoutes),
    ENCRYPTION_ALGORITHM: config.encryption.algorithm,
    JSON_BODY_LIMIT: config.server.jsonBodyLimit,
    LOG_LEVEL: config.observability.logLevel,
    MEM0_API_KEY: config.integrations.mem0ApiKey,
    METRICS_TOKEN: config.observability.metricsToken,
    MODEL: config.llm.treeIndexModel,
    NODE_ENV: config.environment,
    OPENAI_API_KEY: config.llm.openAiApiKey,
    OPENAI_BASE_URL: config.llm.openAiBaseUrl,
    OPENROUTER_BASE_URL: config.llm.openRouterBaseUrl,
    OPENROUTER_EMBEDDING_API_KEY: config.llm.openRouterEmbeddingApiKey,
    OPENROUTER_LLM_API_KEY: config.llm.openRouterLlmApiKey,
    PORT: String(config.server.port),
    QDRANT_API_KEY: config.qdrant.apiKey,
    QDRANT_CLEANUP_MIN_AGE_DAYS: String(config.qdrant.cleanupMinAgeDays),
    QDRANT_URL: config.qdrant.url,
    RAG_ALLOW_LEGACY_AVAILABILITY_FALLBACK: String(config.rag.allowLegacyAvailabilityFallback),
    RAG_CHUNK_OVERLAP_TOKENS: String(config.rag.chunkOverlapTokens),
    RAG_CHUNK_SIZE_TOKENS: String(config.rag.chunkSizeTokens),
    RAG_CONTEXT_TOKEN_BUDGET: String(config.rag.contextTokenBudget),
    RAG_INDEX_VERSION: config.rag.indexVersion,
    RAG_RETRIEVAL_CANDIDATE_LIMIT: String(config.rag.retrievalCandidateLimit),
    RAG_V1_DUAL_READ_ENABLED: String(config.rag.dualReadEnabled),
    RAG_V1_DUAL_WRITE_ENABLED: String(config.rag.dualWriteEnabled),
    RAG_V1_ENABLED: String(config.rag.v1Enabled),
    REDIS_HOST: config.redis.host,
    REDIS_PORT: String(config.redis.port),
    REFRESH_TOKEN_EXPIRY: config.auth.refreshTokenExpiry,
    REFRESH_TOKEN_SECRET: config.auth.refreshTokenSecret,
    RESEND_API_KEY: config.integrations.resendApiKey,
    ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS: config.rocketchat.trustedCallbackOrigins.join(","),
    ROCKETCHAT_CALLBACK_BASE_URL: config.rocketchat.trustedCallbackOrigins[0],
    ROCKETCHAT_INTEGRATION_TOKEN: config.rocketchat.integrationToken,
    ROCKETCHAT_WORKER_CONCURRENCY: String(config.rocketchat.workerConcurrency),
    TREEINDEX_API_KEY: config.llm.treeIndexApiKey,
});
