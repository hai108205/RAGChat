const baseRequiredEnvVars = [
    "PORT",
    "CORS_ORIGIN",
    "CORS_METHODS",
    "DATABASE_URL",
    "REFRESH_TOKEN_SECRET",
    "REFRESH_TOKEN_EXPIRY",
    "ACCESS_TOKEN_SECRET",
    "ACCESS_TOKEN_EXPIRY",
    "NODE_ENV",
    "CIPHER_KEY",
    "ENCRYPTION_ALGORITHM",
    "OPENROUTER_LLM_API_KEY",
    "OPENROUTER_EMBEDDING_API_KEY",
    "QDRANT_URL",
] as const;

const validateEnv = (): void => {
    const missing: string[] = [];

    // Check base required variables
    for (const key of baseRequiredEnvVars) {
        if (key === "OPENROUTER_LLM_API_KEY" || key === "OPENROUTER_EMBEDDING_API_KEY") {
            const hasOpenRouter = (process.env[key] !== undefined && process.env[key]!.trim() !== "");
            const hasOpenAI = (process.env.OPENAI_API_KEY !== undefined && process.env.OPENAI_API_KEY.trim() !== "");
            if (!hasOpenRouter && !hasOpenAI) {
                missing.push(`${key} (or OPENAI_API_KEY)`);
            }
            continue;
        }
        const value = process.env[key];
        if (value === undefined || value.trim() === "") {
            missing.push(key);
        }
    }

    const nodeEnv = process.env.NODE_ENV || "development";
    const isProduction = nodeEnv === "production";
    const allowDev = process.env.ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV === "true";

    // Integration token validation
    const integrationToken = process.env.ROCKETCHAT_INTEGRATION_TOKEN;
    if (isProduction) {
        if (!integrationToken || integrationToken.trim() === "") {
            missing.push("ROCKETCHAT_INTEGRATION_TOKEN");
        }
    } else if (!allowDev) {
        if (!integrationToken || integrationToken.trim() === "") {
            missing.push("ROCKETCHAT_INTEGRATION_TOKEN (or set ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV=true in dev)");
        }
    }

    // Trusted callback configuration validation in production
    if (isProduction) {
        const callbackOrigins = process.env.ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS;
        const callbackBaseUrl = process.env.ROCKETCHAT_CALLBACK_BASE_URL;
        const hasTrustedCallbackConfig =
            (typeof callbackOrigins === "string" && callbackOrigins.trim().length > 0) ||
            (typeof callbackBaseUrl === "string" && callbackBaseUrl.trim().length > 0);

        if (!hasTrustedCallbackConfig) {
            missing.push("ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS or ROCKETCHAT_CALLBACK_BASE_URL (required in production for trusted callback dispatch)");
        }
    }

    if (missing.length > 0) {
        const errorMsg = `Missing required environment variables:\n${missing.map((key) => `   - ${key}`).join("\n")}\nPlease check your environment configuration.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    console.log("Environment variables validated successfully.");
    console.log(` - NODE_ENV: ${nodeEnv}`);
    console.log(` - PORT: ${process.env.PORT}`);
    console.log(" - DATABASE_URL: [configured]");
    console.log(` - ROCKETCHAT_INTEGRATION_TOKEN: ${integrationToken ? "[configured]" : "[disabled in dev]"}`);
    console.log(` - ROCKETCHAT_CALLBACK_CONFIG: ${process.env.ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS || process.env.ROCKETCHAT_CALLBACK_BASE_URL ? "[configured]" : "[unconfigured in dev]"}`);
};

export default validateEnv;

