declare module "robots-parser" {
    interface Robot {
        isAllowed(url: string, userAgent?: string): boolean | undefined;
        isDisallowed(url: string, userAgent?: string): boolean | undefined;
        getMatchingLineNumber(url: string, userAgent?: string): number | undefined;
        getCrawlDelay(userAgent?: string): number | undefined;
        getSitemaps(): string[];
        getPreferredHost(): string | null;
    }
    function robotsParser(url: string, robotsTxt: string): Robot;
    export default robotsParser;
}

declare module "treeindex" {
    export interface TreeIndexOptions {
        baseURL?: string;
        apiKey?: string;
        model?: string;
    }
    export class TreeIndex {
        constructor(options?: TreeIndexOptions);
        loadData(data: string): void;
        generateTree(): Promise<any>;
    }
}

declare module "mem0ai" {
    export interface MemoryClientOptions {
        apiKey?: string;
        host?: string;
    }
    export interface MemoryMessage {
        role: string;
        content: string;
    }
    export class MemoryClient {
        constructor(options?: MemoryClientOptions);
        search(query: string, options?: { user_id?: string; limit?: number }): Promise<any[]>;
        add(
            messages: MemoryMessage[],
            options?: { user_id?: string; custom_instructions?: string }
        ): Promise<any>;
    }
}
