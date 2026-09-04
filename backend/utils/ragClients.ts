import { TreeIndex } from "treeindex";
import { QdrantClient } from "@qdrant/js-client-rest";
import { trackApiError, resetApiErrors } from "./apiErrorTracker.js";
import { config } from "../config/runtime.js";

function createWrappedQdrant(): QdrantClient {
    const client = new QdrantClient({
        url: config.qdrant.url,
        apiKey: config.qdrant.apiKey,
        checkCompatibility: false,
    });

    return new Proxy(client, {
        get(target: any, prop: string | symbol) {
            const original = target[prop];
            if (typeof original !== "function") return original;
            return async function (...args: any[]) {
                try {
                    const result = await original.apply(target, args);
                    resetApiErrors("qdrant");
                    return result;
                } catch (error) {
                    trackApiError("qdrant", error);
                    throw error;
                }
            };
        },
    });
}

function createWrappedTreeIndex(): TreeIndex {
    const client = new TreeIndex({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: config.llm.treeIndexApiKey || "dummy_treeindex_api_key",
        model: config.llm.treeIndexModel,
    });

    return new Proxy(client, {
        get(target: any, prop: string | symbol) {
            const original = target[prop];
            if (typeof original !== "function") return original;
            return async function (...args: any[]) {
                try {
                    const result = await original.apply(target, args);
                    resetApiErrors("treeindex");
                    return result;
                } catch (error) {
                    trackApiError("treeindex", error);
                    throw error;
                }
            };
        },
    });
}

const qdrant = createWrappedQdrant() as any;
const treeindex = createWrappedTreeIndex() as any;

export { qdrant, treeindex };
