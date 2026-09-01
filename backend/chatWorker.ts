import { Worker, type Job } from "bullmq";
import {
    scrapeWebpage,
    generateVectorEmbeddings,
    splitDocumentationContent,
    normalizeUrl,
    isValidDocUrl,
} from "./utils/ragUtilities.js";
import { qdrant, treeindex } from "./utils/ragClients.js";
import prisma from "./utils/prismaClient.js";
import redis, { updateChatProgress } from "./utils/redis.js";
import Bottleneck from "bottleneck";
import { recordIngestionJobDuration } from "./utils/metrics.js";
import { dispatchAlert } from "./utils/notificationDispatcher.js";

const normalizeDocsUrl = (docsUrl: string): string => normalizeUrl(docsUrl);

const MAX_CRAWL_PAGES = 300;

interface JobData {
    chatId: string;
    docsUrl: string;
    collectionName?: string | null;
    chatSourceId?: string | null;
    isVectorLess?: boolean;
}

const processVectorLessJob = async (job: Job<JobData>, ingestionRunId?: string): Promise<void> => {
    const { chatId, docsUrl, chatSourceId } = job.data;
    const normalizedDocsUrl = normalizeDocsUrl(docsUrl);

    await updateChatProgress(chatId, {
        status: "PROCESSING",
        total: 100,
        current: 0,
        progress: 0,
    });

    const rootPage = await scrapeWebpage(normalizedDocsUrl, normalizedDocsUrl);
    const pagesToScrape = [
        normalizedDocsUrl,
        ...rootPage.internalLinks.filter((url) => url !== normalizedDocsUrl),
    ].slice(0, MAX_CRAWL_PAGES);

    const totalPages = pagesToScrape.length;
    let indexedPages = 0;
    let scrapedData = "";

    await updateChatProgress(chatId, {
        status: "PROCESSING",
        total: totalPages,
        current: 0,
        progress: 0,
    });

    for (const url of pagesToScrape) {
        const { body } = await scrapeWebpage(url, normalizedDocsUrl);
        if (body) {
            scrapedData += `\n\n--- Page: ${url} ---\n${body}`;
        }
        indexedPages++;
        await updateChatProgress(chatId, {
            status: "PROCESSING",
            total: totalPages,
            current: indexedPages,
            progress: Math.round((indexedPages / totalPages) * 70), // Scrape takes up to 70%
        });
    }

    // Step 2: Generate Tree using treeindex
    await updateChatProgress(chatId, {
        status: "PROCESSING",
        total: 100,
        current: 75,
        progress: 75,
        stage: "Generating document tree structure...",
    });

    treeindex.loadData(scrapedData);
    const generatedTree = await treeindex.generateTree();

    const documentTree = await prisma.documentTree.create({
        data: {
            treeData: generatedTree as any,
            sourceData: scrapedData,
            chatSourceId: chatSourceId!,
        },
    });

    // Update Chat and ChatSource
    await prisma.chatSource.update({
        where: { id: chatSourceId! },
        data: {
            lastIndexedAt: new Date(),
            totalPages,
        },
    });

    await prisma.chat.update({
        where: { id: chatId },
        data: {
            status: "READY",
            collectionName: documentTree.id,
        },
    });

    if (ingestionRunId) {
        await prisma.ingestionRun.update({
            where: { id: ingestionRunId },
            data: {
                status: "SUCCESS",
                finishedAt: new Date(),
                pagesCrawled: indexedPages,
                pagesFailed: totalPages - indexedPages,
            },
        });
    }

    await updateChatProgress(chatId, {
        status: "READY",
        total: totalPages,
        current: totalPages,
        progress: 100,
    });
};

const processVectorJob = async (job: Job<JobData>, ingestionRunId?: string): Promise<void> => {
    const { chatId, docsUrl, collectionName, chatSourceId } = job.data;
    const normalizedDocsUrl = normalizeDocsUrl(docsUrl);

    if (!collectionName) {
        throw new Error("Missing collectionName for vector ingestion job");
    }

    // Create the Qdrant collection
    await qdrant.createCollection(collectionName, {
        vectors: {
            size: 1536,
            distance: "Cosine",
        },
    });

    const pagesToScrape: string[] = [];
    const scrapedPages = new Set<string>();

    const rootPage = await scrapeWebpage(normalizedDocsUrl, normalizedDocsUrl);
    pagesToScrape.push(normalizedDocsUrl);
    scrapedPages.add(normalizedDocsUrl);

    for (const link of rootPage.internalLinks) {
        if (!scrapedPages.has(link) && isValidDocUrl(link, normalizedDocsUrl)) {
            pagesToScrape.push(link);
            scrapedPages.add(link);
        }
    }

    const pagesToProcess = pagesToScrape.slice(0, MAX_CRAWL_PAGES);
    const totalPages = pagesToProcess.length;

    await updateChatProgress(chatId, {
        status: "PROCESSING",
        total: totalPages,
        current: 0,
        progress: 0,
    });

    const limiter = new Bottleneck({
        maxConcurrent: 5,
        minTime: 200,
    });

    let indexedPages = 0;
    let failedPages = 0;

    const scrapeAndIndexPage = limiter.wrap(async (url: string) => {
        try {
            const { body, title } = await scrapeWebpage(url, normalizedDocsUrl);
            if (!body) return;

            const chunks = splitDocumentationContent(body, {
                chunkSize: 1000,
                chunkOverlap: 150,
            });

            if (chunks.length === 0) return;

            const embeddings = (await generateVectorEmbeddings(
                chunks.map((c) => c.content),
            )) as number[][];

            const points = chunks.map((chunk, index) => ({
                id: crypto.randomUUID(),
                vector: embeddings[index],
                payload: {
                    url,
                    title,
                    heading: chunk.heading,
                    body: chunk.content,
                    chatSourceId,
                    hasCodeBlock: chunk.hasCodeBlock,
                    chunkType: chunk.chunkType,
                },
            }));

            await qdrant.upsert(collectionName, {
                wait: true,
                points,
            });

            await prisma.documentPage.create({
                data: {
                    pageUrl: url,
                    heading: title || "Untitled Page",
                    chatSourceId: chatSourceId!,
                },
            });

            indexedPages++;
            const progress = Math.round((indexedPages / totalPages) * 100);

            await updateChatProgress(chatId, {
                status: "PROCESSING",
                total: totalPages,
                current: indexedPages,
                progress,
            });
        } catch (err) {
            console.error(`Failed to process page: ${url}`, err);
            failedPages++;
        }
    });

    await Promise.all(pagesToProcess.map((url) => scrapeAndIndexPage(url)));

    if (indexedPages === 0) {
        throw new Error("No pages could be indexed from the provided documentation URL.");
    }

    await prisma.chatSource.update({
        where: { id: chatSourceId! },
        data: {
            totalPages: indexedPages,
            lastIndexedAt: new Date(),
        },
    });

    await prisma.chat.update({
        where: { id: chatId },
        data: {
            status: "READY",
            failedAt: null,
            failureReason: null,
        },
    });

    if (ingestionRunId) {
        await prisma.ingestionRun.update({
            where: { id: ingestionRunId },
            data: {
                status: "SUCCESS",
                finishedAt: new Date(),
                pagesCrawled: indexedPages,
                pagesFailed: failedPages,
            },
        });
    }

    await updateChatProgress(chatId, {
        status: "READY",
        total: totalPages,
        current: indexedPages,
        progress: 100,
    });
};

const worker = new Worker(
    "chatCreation",
    async (job: Job<JobData>) => {
        const { chatId, chatSourceId } = job.data;
        const isVectorLess = Boolean(job.data.isVectorLess);
        const jobStartTime = Date.now();

        await prisma.chat.update({
            where: { id: chatId },
            data: { status: "PROCESSING" },
        });

        const ingestionRun = await prisma.ingestionRun.create({
            data: {
                chatId,
                chatSourceId: chatSourceId!,
                status: "STARTED",
                startedAt: new Date(),
            },
        });

        try {
            if (isVectorLess) {
                await processVectorLessJob(job, ingestionRun.id);
            } else {
                await processVectorJob(job, ingestionRun.id);
            }

            const durationSeconds = (Date.now() - jobStartTime) / 1000;
            await recordIngestionJobDuration(durationSeconds);
        } catch (error: any) {
            await prisma.chat.update({
                where: { id: chatId },
                data: {
                    status: "FAILED",
                    failedAt: new Date(),
                    failureReason: error.message || "Unknown error during ingestion",
                },
            });

            await prisma.ingestionRun.update({
                where: { id: ingestionRun.id },
                data: {
                    status: "FAILED",
                    finishedAt: new Date(),
                    errorCode: error.code || "INGESTION_ERROR",
                    errorMessage: error.message || "Unknown error",
                },
            });

            await updateChatProgress(chatId, {
                status: "FAILED",
                progress: 0,
                failureReason: error.message || "Unknown error during ingestion",
            });

            throw error;
        }
    },
    {
        connection: redis as any,
        concurrency: 5,
    },
);

worker.on("completed", (job: Job) => {
    console.log(`Job completed: ${job.id}`);
});

worker.on("failed", async (job: Job | undefined, err: Error) => {
    console.error(`Job failed: ${job?.id}`, err);

    if (job?.attemptsMade && job.opts?.attempts && job.attemptsMade >= job.opts.attempts) {
        await dispatchAlert({
            type: "ingestion_failure",
            title: `Ingestion Job Failed Permanently: ${job.id}`,
            message: `Job ${job.id} failed after ${job.attemptsMade} attempts. Error: ${err.message}`,
            severity: "critical",
            source: "worker",
        });
    }
});

worker.on("stalled", (jobId: string) => {
    console.warn(`Job stalled: ${jobId}`);
});

async function shutdownWorker() {
    console.log("Shutting down worker...");
    await worker.close();
    process.exit(0);
}

process.on("SIGINT", shutdownWorker);
process.on("SIGTERM", shutdownWorker);
