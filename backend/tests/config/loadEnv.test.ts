import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveEnvironmentFilePath } from "../../config/loadEnv.js";

describe("resolveEnvironmentFilePath", () => {
    it("loads backend/.env when invoked from TypeScript source", () => {
        const sourceModule = pathToFileURL(
            path.join(process.cwd(), "config", "runtime.ts"),
        ).href;

        expect(resolveEnvironmentFilePath(sourceModule)).toBe(path.join(process.cwd(), ".env"));
    });

    it("loads the application .env when invoked from dist/config", () => {
        const compiledModule = pathToFileURL(
            path.join(process.cwd(), "dist", "config", "runtime.js"),
        ).href;

        expect(resolveEnvironmentFilePath(compiledModule)).toBe(path.join(process.cwd(), ".env"));
    });
});
