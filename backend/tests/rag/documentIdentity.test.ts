import { describe, expect, it } from "vitest";
import { createChunkId, createDocumentVersion } from "../../rag/documentIdentity.js";

const document = { sourceId: "source-1", content: "  Hello\r\nworld  ", documentType: "md" };

describe("document identity", () => {
    it("normalizes equivalent content into one deterministic document version", () => {
        expect(createDocumentVersion(document)).toEqual(createDocumentVersion({ ...document, content: "Hello\nworld" }));
    });

    it("changes chunk identity when its structural locator changes", () => {
        const version = createDocumentVersion(document);
        expect(createChunkId({ sourceId: document.sourceId, version, locator: "page:1", chunkIndex: 0, content: "Hello" }))
            .not.toBe(createChunkId({ sourceId: document.sourceId, version, locator: "page:1", chunkIndex: 1, content: "Hello" }));
    });
});
