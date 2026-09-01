import { TreeIndex } from "treeindex";
import { QdrantClient } from "@qdrant/js-client-rest";
import { trackApiError, resetApiErrors } from "./apiErrorTracker.js";

function createWrappedQdrant(): QdrantClient {
    const client = new QdrantClient({
        url: process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY,
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
        apiKey: process.env.TREEINDEX_API_KEY || "dummy_treeindex_api_key",
        model: process.env.MODEL,
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
