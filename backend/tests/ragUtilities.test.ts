import { describe, expect, it } from "vitest";
import { extractWebpageContent } from "../utils/ragUtilities.js";

describe("Webpage Content Extraction", () => {
    it("retains the full normalized title without truncating to 4 words", () => {
        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>  Rocket.Chat   Enterprise Administrator Guide and   Manual  </title>
                </head>
                <body>
                    <p>Some content</p>
                </body>
            </html>
        `;
        const result = extractWebpageContent(html, "https://example.com/docs", "https://example.com");
        expect(result.title).toBe("Rocket.Chat Enterprise Administrator Guide and Manual");
    });

    it("removes structural chrome (header, footer, nav, aside) and scripts/styles", () => {
        const html = `
            <!DOCTYPE html>
            <html>
                <head><title>Title</title></head>
                <body>
                    <header>Site Header Navigation</header>
                    <nav><a href="/home">Home</a></nav>
                    <aside>Related Ads and Links</aside>
                    <article>
                        <h1>Main Header</h1>
                        <p>Genuine article text.</p>
                    </article>
                    <footer>Copyright 2026 Acme Corp</footer>
                    <script>console.log("secret");</script>
                    <style>.hidden { display: none; }</style>
                </body>
            </html>
        `;
        const result = extractWebpageContent(html, "https://example.com/docs", "https://example.com");
        expect(result.body).toContain("Main Header");
        expect(result.body).toContain("Genuine article text.");
        expect(result.body).not.toContain("Site Header Navigation");
        expect(result.body).not.toContain("Related Ads and Links");
        expect(result.body).not.toContain("Copyright 2026 Acme Corp");
        expect(result.body).not.toContain("console.log");
    });

    it("prefers article element when present to avoid duplicate text with body", () => {
        const html = `
            <!DOCTYPE html>
            <html>
                <head><title>Title</title></head>
                <body>
                    <div class="sidebar">Sidebar info</div>
                    <article>
                        <p>Only article body should be extracted.</p>
                    </article>
                </body>
            </html>
        `;
        const result = extractWebpageContent(html, "https://example.com/docs", "https://example.com");
        expect(result.body).toBe("Only article body should be extracted.");
    });
});
