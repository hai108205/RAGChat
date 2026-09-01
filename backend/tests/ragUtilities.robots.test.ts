import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    parseRobotsTxt,
    isUrlAllowedByRobots,
    getCrawlConfig,
    scheduleCrawl,
    resetCrawlStateForTests,
} from "../utils/ragUtilities.js";

const ROBOTS_FIXTURE = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Crawl-delay: 2

User-agent: BadBot
Disallow: /
`;

describe("ragUtilities robots.txt parsing and crawl policy", () => {
    beforeEach(() => {
        resetCrawlStateForTests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.CRAWL_RESPECT_ROBOTS_TXT;
        delete process.env.CRAWL_USER_AGENT;
        delete process.env.CRAWL_DELAY_MS;
        delete process.env.CRAWL_ALLOW_ON_ROBOTS_ERROR;
    });

    it("parses robots.txt rules and evaluates URL permissions", () => {
        const parser = parseRobotsTxt(ROBOTS_FIXTURE, "https://example.com/robots.txt");

        expect(isUrlAllowedByRobots("https://example.com/docs/intro", parser, "DocChatBot/1.0")).toBe(
            true,
        );
        expect(isUrlAllowedByRobots("https://example.com/admin/settings", parser, "DocChatBot/1.0")).toBe(
            false,
        );
        expect(isUrlAllowedByRobots("https://example.com/docs/intro", parser, "BadBot")).toBe(false);
    });

    it("extracts crawl delay from robots.txt", () => {
        const parser = parseRobotsTxt(ROBOTS_FIXTURE, "https://example.com/robots.txt");
        expect(parser.getCrawlDelay("DocChatBot/1.0")).toBe(2);
    });

    it("blocks crawling when robots.txt disallows the target URL", async () => {
        process.env.CRAWL_USER_AGENT = "DocChatBot/1.0";
        process.env.CRAWL_RESPECT_ROBOTS_TXT = "true";

        vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
            if (String(url).endsWith("/robots.txt")) {
                return new Response(ROBOTS_FIXTURE, { status: 200 });
            }
            return new Response("OK", { status: 200 });
        });

        await expect(
            scheduleCrawl("https://example.com/admin/dashboard", async () => "result"),
        ).rejects.toThrow(/robots\.txt/);
    });

    it("allows crawling allowed URLs according to robots policy", async () => {
        process.env.CRAWL_USER_AGENT = "DocChatBot/1.0";
        process.env.CRAWL_RESPECT_ROBOTS_TXT = "true";

        vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
            if (String(url).endsWith("/robots.txt")) {
                return new Response(ROBOTS_FIXTURE, { status: 200 });
            }
            return new Response("OK", { status: 200 });
        });

        const result = await scheduleCrawl("https://example.com/docs/quickstart", async () => "success");
        expect(result).toBe("success");
    });

    it("blocks crawling when robots.txt fails and fail-closed is active", async () => {
        process.env.CRAWL_USER_AGENT = "DocChatBot/1.0";
        process.env.CRAWL_RESPECT_ROBOTS_TXT = "true";
        process.env.CRAWL_ALLOW_ON_ROBOTS_ERROR = "false";

        vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
            if (String(url).endsWith("/robots.txt")) {
                return new Response("Server error", { status: 500 });
            }
            return new Response("OK", { status: 200 });
        });

        await expect(
            scheduleCrawl("https://example.com/docs/quickstart", async () => "success"),
        ).rejects.toThrow(/robots\.txt returned HTTP 500/);
    });

    it("reads default crawl configuration flags from environment", () => {
        process.env.CRAWL_USER_AGENT = "CustomAgent/2.0";
        process.env.CRAWL_RESPECT_ROBOTS_TXT = "false";
        process.env.CRAWL_DELAY_MS = "2500";

        const config = getCrawlConfig();
        expect(config.userAgent).toBe("CustomAgent/2.0");
        expect(config.respectRobotsTxt).toBe(false);
        expect(config.defaultDelayMs).toBe(2500);
    });
});
