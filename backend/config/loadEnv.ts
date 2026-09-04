import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveEnvironmentFilePath(moduleUrl: string): string {
    const configDirectory = path.dirname(fileURLToPath(moduleUrl));
    const projectDirectory = path.basename(path.dirname(configDirectory)) === "dist"
        ? path.resolve(configDirectory, "../..")
        : path.resolve(configDirectory, "..");

    return path.join(projectDirectory, ".env");
}

export function loadEnvironmentFile(moduleUrl: string): void {
    dotenv.config({ path: resolveEnvironmentFilePath(moduleUrl) });
}
