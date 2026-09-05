import { readFile } from "node:fs/promises";
import { evaluateQualityCorpus, type LabelledQualityCorpus } from "../rag/qualityCorpus.js";

async function main(): Promise<void> {
    const corpusPath = process.env.RAG_QUALITY_CORPUS_PATH;
    if (!corpusPath) throw new Error("RAG_QUALITY_CORPUS_PATH must point to a human-labelled RAG quality JSON corpus");

    const corpus = JSON.parse(await readFile(corpusPath, "utf8")) as LabelledQualityCorpus;
    const report = evaluateQualityCorpus(corpus);
    console.log(JSON.stringify(report));
    if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
