const requiredEnvVars = [
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
    "ROCKETCHAT_INTEGRATION_TOKEN",
] as const;

const validateEnv = (): void => {
    const missing = requiredEnvVars.filter((key) => {
        const value = process.env[key];
        return value === undefined || value === "";
    });

    if (missing.length > 0) {
        console.error("Missing required environment variables:");
        missing.forEach((key) => console.error(`   - ${key}`));
        console.error("\nPlease check your .env file and add the missing variables.");
        process.exit(1);
    }

    console.log("All environment variables validated successfully.");
};

export default validateEnv;
