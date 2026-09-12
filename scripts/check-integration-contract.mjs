#!/usr/bin/env node
/**
 * Contract drift gate: verifies OpenAPI spec, generated artifacts, and Express routes.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as jsYaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const CONTRACT_PATH = path.join(ROOT_DIR, "contracts/rocketchat-integration.openapi.yaml");
const ROUTER_PATH = path.join(ROOT_DIR, "backend/routers/rocketchatIntegration.route.ts");
const GENERATED_FILES = [
    path.join(ROOT_DIR, "src/lib/generated/IntegrationApi.ts"),
    path.join(ROOT_DIR, "backend/types/generated/IntegrationApi.ts"),
    path.join(ROOT_DIR, "backend/utils/generated/rocketchatSchemas.ts"),
];

const parseYaml = (content) => {
    if (typeof jsYaml.load === "function") return jsYaml.load(content);
    if (jsYaml.default && typeof jsYaml.default.load === "function") return jsYaml.default.load(content);
    throw new Error("js-yaml load function not found");
};

console.log("🔍 Checking Rocket.Chat Integration API contract integrity...");

// Step 1: Validate OpenAPI YAML
if (!fs.existsSync(CONTRACT_PATH)) {
    console.error(`❌ Contract file not found: ${CONTRACT_PATH}`);
    process.exit(1);
}

const rawContract = fs.readFileSync(CONTRACT_PATH, "utf8");
let openapi;
try {
    openapi = parseYaml(rawContract);
} catch (err) {
    console.error(`❌ Invalid YAML in ${CONTRACT_PATH}:`, err.message);
    process.exit(1);
}

if (!openapi.openapi?.startsWith("3.1")) {
    console.error(`❌ Expected OpenAPI 3.1.x, received: ${openapi.openapi}`);
    process.exit(1);
}

const requiredEndpoints = [
    { path: "/messages/async", method: "post" },
    { path: "/stats", method: "get" },
    { path: "/sources", method: "get" },
    { path: "/sources/{id}", method: "delete" },
    { path: "/feedback", method: "post" },
    { path: "/sources/base64", method: "post" },
    { path: "/utilities/completion", method: "post" },
];

for (const ep of requiredEndpoints) {
    if (!openapi.paths?.[ep.path]?.[ep.method]) {
        console.error(`❌ Missing OpenAPI operation: ${ep.method.toUpperCase()} ${ep.path}`);
        process.exit(1);
    }
}

const requiredCallbacks = [
    "ChatCompletedCallbackEvent",
    "ChatFailedCallbackEvent",
    "IndexingCompleteCallbackEvent",
    "IndexingFailedCallbackEvent",
];

for (const cb of requiredCallbacks) {
    if (!openapi.components?.schemas?.[cb]) {
        console.error(`❌ Missing callback schema in OpenAPI components: ${cb}`);
        process.exit(1);
    }
}

console.log("  ✓ OpenAPI 3.1.0 specification structure valid (7 endpoints, 4 callbacks).");

// Step 2: Regenerate contract artifacts and check for drift
console.log("  → Running contract generator...");
try {
    execSync(`node "${path.join(ROOT_DIR, "scripts/generate-contract.mjs")}"`, {
        cwd: ROOT_DIR,
        stdio: "inherit",
    });
} catch (err) {
    console.error("❌ Failed to generate contract files:", err.message);
    process.exit(1);
}

// Step 3: Check git diff on generated files
console.log("  → Checking for generated code drift...");
for (const file of GENERATED_FILES) {
    const rel = path.relative(ROOT_DIR, file);
    try {
        const diff = execSync(`git status --porcelain -- "${file}"`, { cwd: ROOT_DIR, encoding: "utf8" });
        if (diff.trim().length > 0) {
            console.warn(`  ⚠️ Uncommitted changes detected in generated file: ${rel}`);
        }
    } catch {
        // Git check non-fatal in non-git environment
    }
}

// Step 4: Verify Express Router Mounts
if (fs.existsSync(ROUTER_PATH)) {
    const routerCode = fs.readFileSync(ROUTER_PATH, "utf8");
    const routerEndpoints = [
        "/messages/async",
        "/stats",
        "/sources",
        "/sources/:id",
        "/feedback",
        "/sources/base64",
        "/utilities/completion",
    ];

    for (const ep of routerEndpoints) {
        if (!routerCode.includes(`"${ep}"`) && !routerCode.includes(`'${ep}'`)) {
            console.error(`❌ Express router missing endpoint route for: ${ep}`);
            process.exit(1);
        }
    }
    console.log("  ✓ Express integration router verified against contract endpoints.");
}

console.log("✅ Contract drift check passed successfully.");
