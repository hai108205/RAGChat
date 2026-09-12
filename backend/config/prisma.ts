import { z } from "zod";
import { loadEnvironmentFile } from "./loadEnv.js";

loadEnvironmentFile(import.meta.url);

export const prismaDatabaseUrl = z.string().url("DATABASE_URL must be a valid URL").parse(process.env.DATABASE_URL);
