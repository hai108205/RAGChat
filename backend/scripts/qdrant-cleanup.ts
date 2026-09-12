import "dotenv/config";
import { cleanupQdrantCollections } from "../utils/qdrantCleanup.js";
import { config } from "../config/runtime.js";

async function main() {
    const args = process.argv.slice(2);
    const force = args.includes("--force");
    const minAgeArg = args.find((arg) => arg.startsWith("--min-age-days="));
    const parsedMinAge = minAgeArg
        ? Number.parseInt(minAgeArg.split("=")[1], 10)
        : config.qdrant.cleanupMinAgeDays;

    const minAgeDays = Number.isFinite(parsedMinAge) && parsedMinAge >= 0 ? parsedMinAge : 7;

    console.log("--------------------------------------------------");
    console.log("         Qdrant Orphan Collection Cleanup         ");
    console.log("--------------------------------------------------");
    console.log(`Execution Mode : ${force ? "LIVE (Permanent Deletion)" : "DRY RUN (Read Only)"}`);
    console.log(`Minimum Age    : ${minAgeDays} days`);
    console.log("--------------------------------------------------");

    try {
        const result = await cleanupQdrantCollections({ force, minAgeDays });
        console.log(JSON.stringify(result, null, 2));

        if (!force && result.orphanedCandidates > 0) {
            console.log("\nTo actually delete these collections, rerun with the `--force` flag.");
        }
    } catch (error) {
        console.error("Cleanup failed:", error);
        process.exit(1);
    }
}

main();
