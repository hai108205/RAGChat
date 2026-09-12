import { defineConfig } from "prisma/config";
import { prismaDatabaseUrl } from "./config/prisma.js";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        url: prismaDatabaseUrl,
    },
});
