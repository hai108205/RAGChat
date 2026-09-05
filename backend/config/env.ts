import { z } from "zod";

type Environment = Record<string, string | undefined>;

const optionalText = z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).optional(),
);
const url = z.string().trim().url();

function requiredText(name: string): z.ZodString {
    return z.string({ error: `${name} is required` }).trim().min(1, `${name} is required`);
}

function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || value.trim() === "") return fallback;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`${name} must be either true or false`);
}

function parseInteger(
    name: string,
    value: string | undefined,
    fallback: number,
    minimum: number,
    maximum = Number.MAX_SAFE_INTEGER,
): number {
    if (value === undefined || value.trim() === "") return fallback;
    if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
    const parsed = Number(value);
    if (parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be between ${minimum} and ${maximum}`);
    }
    return parsed;
}

function parseCsvUrls(name: string, value: string | undefined, required = false): string[] {
    const values = (value || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (required && values.length === 0) throw new Error(`${name} is required`);

    return values.map((item) => {
        const parsed = url.safeParse(item);
        if (!parsed.success || !["http:", "https:"].includes(new URL(item).protocol)) {
            throw new Error(`${name} must contain only http(s) URLs`);
        }
        return new URL(item).origin;
    });
}

function parseCipherKey(value: string): Buffer {
    const normalized = value.trim();
    const key = Buffer.from(normalized, "base64");
    if (key.length !== 32 || key.toString("base64") !== normalized) {
        throw new Error("CIPHER_KEY must be canonical base64 for exactly 32 bytes");
    }
    return key;
}

export interface AppConfig {
    environment: "development" | "test" | "production";
    server: {
        port: number;
        corsOrigins: string[];
        corsMethods: string[];
        jsonBodyLimit: string;
        enableWebRoutes: boolean;
    };
    database: { url: string };
    redis: { host: string; port: number };
    qdrant: { url: string; apiKey?: string; cleanupMinAgeDays: number };
    auth: {
        accessTokenSecret: string;
        accessTokenExpiry: string;
        refreshTokenSecret: string;
        refreshTokenExpiry: string;
        adminUsername?: string;
    };
    encryption: { algorithm: "aes-256-gcm"; key: Buffer };
    llm: {
        openAiApiKey?: string;
        openAiBaseUrl?: string;
        openRouterLlmApiKey?: string;
        openRouterEmbeddingApiKey?: string;
        openRouterBaseUrl: string;
        defaultModel: string;
        embeddingModel: string;
        treeIndexApiKey?: string;
        treeIndexModel?: string;
    };
    rocketchat: {
        integrationToken?: string;
        trustedCallbackOrigins: string[];
        allowUnauthenticatedDev: boolean;
        allowGlobalMode: boolean;
        workerConcurrency: number;
    };
    crawler: {
        userAgent: string;
        respectRobotsTxt: boolean;
        delayMs: number;
        maxConcurrencyPerDomain: number;
        robotsTimeoutMs: number;
        robotsCacheTtlMs: number;
        allowOnRobotsError: boolean;
    };
    rag: {
        v1Enabled: boolean;
        dualWriteEnabled: boolean;
        dualReadEnabled: boolean;
        allowLegacyAvailabilityFallback: boolean;
        indexVersion: string;
        chunkSizeTokens: number;
        chunkOverlapTokens: number;
        retrievalCandidateLimit: number;
        contextTokenBudget: number;
    };
    observability: { logLevel: string; metricsToken?: string };
    integrations: { resendApiKey?: string; mem0ApiKey?: string; dailyTokenBudget: number | null };
}

export function parseEnvironment(environment: Environment, validatePolicies = true): AppConfig {
    const nodeEnv = z.enum(["development", "test", "production"], {
        error: "NODE_ENV must be development, test, or production",
    }).parse(environment.NODE_ENV || "development");
    const isProduction = nodeEnv === "production";

    const integrationToken = optionalText.parse(environment.ROCKETCHAT_INTEGRATION_TOKEN);
    const allowUnauthenticatedDev = parseBoolean(
        "ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV",
        environment.ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV,
        false,
    );
    if (validatePolicies && isProduction && !integrationToken) {
        throw new Error("ROCKETCHAT_INTEGRATION_TOKEN is required in production");
    }
    if (validatePolicies && !isProduction && !integrationToken && !allowUnauthenticatedDev) {
        throw new Error("ROCKETCHAT_INTEGRATION_TOKEN is required unless ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV=true");
    }
    if (isProduction && integrationToken === "ragchat-integration-token-secret") {
        throw new Error("ROCKETCHAT_INTEGRATION_TOKEN must not use the Docker fallback secret in production");
    }

    const callbackOrigins = parseCsvUrls(
        "ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS",
        environment.ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS,
    );
    const callbackBaseUrl = optionalText.parse(environment.ROCKETCHAT_CALLBACK_BASE_URL);
    const callbackBaseOrigin = callbackBaseUrl ? parseCsvUrls("ROCKETCHAT_CALLBACK_BASE_URL", callbackBaseUrl, true) : [];
    const trustedCallbackOrigins = [...new Set([...callbackOrigins, ...callbackBaseOrigin])];
    if (validatePolicies && isProduction && trustedCallbackOrigins.length === 0) {
        throw new Error("ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS or ROCKETCHAT_CALLBACK_BASE_URL is required in production");
    }

    const openAiApiKey = optionalText.parse(environment.OPENAI_API_KEY);
    const openRouterLlmApiKey = optionalText.parse(environment.OPENROUTER_LLM_API_KEY);
    const openRouterEmbeddingApiKey = optionalText.parse(environment.OPENROUTER_EMBEDDING_API_KEY);
    if (validatePolicies && nodeEnv !== "test" && !openAiApiKey && (!openRouterLlmApiKey || !openRouterEmbeddingApiKey)) {
        throw new Error("OPENAI_API_KEY or both OPENROUTER_LLM_API_KEY and OPENROUTER_EMBEDDING_API_KEY are required");
    }

    const ragChunkSizeTokens = parseInteger("RAG_CHUNK_SIZE_TOKENS", environment.RAG_CHUNK_SIZE_TOKENS, 640, 64, 4096);
    const ragChunkOverlapTokens = parseInteger("RAG_CHUNK_OVERLAP_TOKENS", environment.RAG_CHUNK_OVERLAP_TOKENS, 80, 0, 2048);
    if (ragChunkOverlapTokens >= ragChunkSizeTokens) {
        throw new Error("RAG_CHUNK_OVERLAP_TOKENS must be smaller than RAG_CHUNK_SIZE_TOKENS");
    }

    const config: AppConfig = {
        environment: nodeEnv,
        server: {
            port: parseInteger("PORT", environment.PORT, 8000, 1, 65535),
            corsOrigins: parseCsvUrls("CORS_ORIGIN", environment.CORS_ORIGIN, isProduction),
            corsMethods: (environment.CORS_METHODS || "GET,POST,PUT,DELETE").split(",").map((item) => item.trim()).filter(Boolean),
            jsonBodyLimit: environment.JSON_BODY_LIMIT || "20mb",
            enableWebRoutes: parseBoolean("ENABLE_WEB_ROUTES", environment.ENABLE_WEB_ROUTES, false),
        },
        database: { url: url.parse(requiredText("DATABASE_URL").parse(environment.DATABASE_URL)) },
        redis: {
            host: requiredText("REDIS_HOST").parse(environment.REDIS_HOST || "localhost"),
            port: parseInteger("REDIS_PORT", environment.REDIS_PORT, 6379, 1, 65535),
        },
        qdrant: {
            url: url.parse(requiredText("QDRANT_URL").parse(environment.QDRANT_URL)),
            apiKey: optionalText.parse(environment.QDRANT_API_KEY),
            cleanupMinAgeDays: parseInteger("QDRANT_CLEANUP_MIN_AGE_DAYS", environment.QDRANT_CLEANUP_MIN_AGE_DAYS, 7, 0),
        },
        auth: {
            accessTokenSecret: requiredText("ACCESS_TOKEN_SECRET").parse(environment.ACCESS_TOKEN_SECRET),
            accessTokenExpiry: requiredText("ACCESS_TOKEN_EXPIRY").parse(environment.ACCESS_TOKEN_EXPIRY),
            refreshTokenSecret: requiredText("REFRESH_TOKEN_SECRET").parse(environment.REFRESH_TOKEN_SECRET),
            refreshTokenExpiry: requiredText("REFRESH_TOKEN_EXPIRY").parse(environment.REFRESH_TOKEN_EXPIRY),
            adminUsername: optionalText.parse(environment.ADMIN_USERNAME),
        },
        encryption: {
            algorithm: z.literal("aes-256-gcm").parse(environment.ENCRYPTION_ALGORITHM || "aes-256-gcm"),
            key: parseCipherKey(requiredText("CIPHER_KEY").parse(environment.CIPHER_KEY)),
        },
        llm: {
            openAiApiKey,
            openAiBaseUrl: optionalText.parse(environment.OPENAI_BASE_URL),
            openRouterLlmApiKey,
            openRouterEmbeddingApiKey,
            openRouterBaseUrl: url.parse(environment.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"),
            defaultModel: environment.DEFAULT_LLM_MODEL || "openai/gpt-4o-mini",
            embeddingModel: environment.EMBEDDING_MODEL || "openai/text-embedding-3-small",
            treeIndexApiKey: optionalText.parse(environment.TREEINDEX_API_KEY),
            treeIndexModel: optionalText.parse(environment.MODEL),
        },
        rocketchat: {
            integrationToken,
            trustedCallbackOrigins,
            allowUnauthenticatedDev,
            allowGlobalMode: parseBoolean("ALLOW_ROCKETCHAT_GLOBAL_MODE", environment.ALLOW_ROCKETCHAT_GLOBAL_MODE, false),
            workerConcurrency: parseInteger("ROCKETCHAT_WORKER_CONCURRENCY", environment.ROCKETCHAT_WORKER_CONCURRENCY, 5, 1, 100),
        },
        crawler: {
            userAgent: environment.CRAWL_USER_AGENT || "DocChatBot/1.0",
            respectRobotsTxt: parseBoolean("CRAWL_RESPECT_ROBOTS_TXT", environment.CRAWL_RESPECT_ROBOTS_TXT, true),
            delayMs: parseInteger("CRAWL_DELAY_MS", environment.CRAWL_DELAY_MS, 1000, 0),
            maxConcurrencyPerDomain: parseInteger("CRAWL_MAX_CONCURRENCY_PER_DOMAIN", environment.CRAWL_MAX_CONCURRENCY_PER_DOMAIN, 3, 1, 100),
            robotsTimeoutMs: parseInteger("CRAWL_ROBOTS_TIMEOUT_MS", environment.CRAWL_ROBOTS_TIMEOUT_MS, 5000, 1),
            robotsCacheTtlMs: parseInteger("CRAWL_ROBOTS_CACHE_TTL_MS", environment.CRAWL_ROBOTS_CACHE_TTL_MS, 600000, 1),
            allowOnRobotsError: parseBoolean("CRAWL_ALLOW_ON_ROBOTS_ERROR", environment.CRAWL_ALLOW_ON_ROBOTS_ERROR, false),
        },
        rag: {
            v1Enabled: parseBoolean("RAG_V1_ENABLED", environment.RAG_V1_ENABLED, false),
            dualWriteEnabled: parseBoolean("RAG_V1_DUAL_WRITE_ENABLED", environment.RAG_V1_DUAL_WRITE_ENABLED, false),
            dualReadEnabled: parseBoolean("RAG_V1_DUAL_READ_ENABLED", environment.RAG_V1_DUAL_READ_ENABLED, false),
            allowLegacyAvailabilityFallback: parseBoolean(
                "RAG_ALLOW_LEGACY_AVAILABILITY_FALLBACK",
                environment.RAG_ALLOW_LEGACY_AVAILABILITY_FALLBACK,
                false,
            ),
            indexVersion: environment.RAG_INDEX_VERSION?.trim() || "v1",
            chunkSizeTokens: ragChunkSizeTokens,
            chunkOverlapTokens: ragChunkOverlapTokens,
            retrievalCandidateLimit: parseInteger(
                "RAG_RETRIEVAL_CANDIDATE_LIMIT",
                environment.RAG_RETRIEVAL_CANDIDATE_LIMIT,
                24,
                3,
                100,
            ),
            contextTokenBudget: parseInteger(
                "RAG_CONTEXT_TOKEN_BUDGET",
                environment.RAG_CONTEXT_TOKEN_BUDGET,
                6000,
                256,
                100000,
            ),
        },
        observability: {
            logLevel: environment.LOG_LEVEL || "info",
            metricsToken: optionalText.parse(environment.METRICS_TOKEN),
        },
        integrations: {
            resendApiKey: optionalText.parse(environment.RESEND_API_KEY),
            mem0ApiKey: optionalText.parse(environment.MEM0_API_KEY),
            dailyTokenBudget: environment.DAILY_TOKEN_BUDGET
                ? parseInteger("DAILY_TOKEN_BUDGET", environment.DAILY_TOKEN_BUDGET, 0, 1)
                : null,
        },
    };

    return Object.freeze(config);
}
