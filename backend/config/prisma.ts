import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(configDirectory, "../.env") });

export const prismaDatabaseUrl = z.string().url("DATABASE_URL must be a valid URL").parse(process.env.DATABASE_URL);
