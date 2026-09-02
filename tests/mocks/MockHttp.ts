import type {
    IHttp,
    IHttpRequest,
    IHttpResponse,
} from '@rocket.chat/apps-engine/definition/accessors';
import { RequestMethod } from '@rocket.chat/apps-engine/definition/accessors';

export type IHttpHeaders = { [key: string]: string };

export interface MockResponseRule {
    url: string | RegExp;
    method?: string | RequestMethod;
    statusCode?: number;
    headers?: IHttpHeaders;
    content?: string;
    data?: any;
}

export class MockHttp implements IHttp {
    private requests: Array<{ method: string; url: string; options?: IHttpRequest }> = [];
    private mockRules: MockResponseRule[] = [];

    public getRecordedRequests() {
        return this.requests;
    }

    public clearRecordedRequests() {
        this.requests = [];
    }

    public registerMockResponse(rule: MockResponseRule) {
        this.mockRules.push(rule);
    }

    public clearMockResponses() {
        this.mockRules = [];
    }

    public async get(url: string, options?: IHttpRequest): Promise<IHttpResponse> {
        return this.executeRequest('GET', url, options);
    }

    public async post(url: string, options?: IHttpRequest): Promise<IHttpResponse> {
        return this.executeRequest('POST', url, options);
    }

    public async put(url: string, options?: IHttpRequest): Promise<IHttpResponse> {
        return this.executeRequest('PUT', url, options);
    }

    public async del(url: string, options?: IHttpRequest): Promise<IHttpResponse> {
        return this.executeRequest('DELETE', url, options);
    }

    public async patch(url: string, options?: IHttpRequest): Promise<IHttpResponse> {
        return this.executeRequest('PATCH', url, options);
    }

    private mapRequestMethod(method: string): RequestMethod {
        switch (method.toUpperCase()) {
            case 'GET': return RequestMethod.GET;
            case 'POST': return RequestMethod.POST;
            case 'PUT': return RequestMethod.PUT;
            case 'DELETE': return RequestMethod.DELETE;
            case 'PATCH': return RequestMethod.PATCH;
            case 'HEAD': return RequestMethod.HEAD;
            case 'OPTIONS': return RequestMethod.OPTIONS;
            default: return RequestMethod.GET;
        }
    }

    private async executeRequest(
        method: string,
        url: string,
        options?: IHttpRequest,
    ): Promise<IHttpResponse> {
        this.requests.push({ method, url, options });
        const requestMethod = this.mapRequestMethod(method);

        // Check registered mock rules first
        const matchedRule = this.mockRules.find((rule) => {
            const methodMatches = !rule.method || String(rule.method).toUpperCase() === method.toUpperCase();
            if (typeof rule.url === 'string') {
                const cleanRuleUrl = rule.url.replace(/\?.*$/, '');
                const cleanReqUrl = url.replace(/\?.*$/, '');
                const urlMatches =
                    url === rule.url ||
                    url.startsWith(rule.url) ||
                    url.includes(rule.url) ||
                    cleanReqUrl === cleanRuleUrl ||
                    cleanReqUrl.startsWith(cleanRuleUrl) ||
                    cleanReqUrl.includes(cleanRuleUrl) ||
                    cleanRuleUrl.includes(cleanReqUrl);
                return methodMatches && urlMatches;
            }
            return methodMatches && rule.url.test(url);
        });

        if (matchedRule) {
            const statusCode = matchedRule.statusCode ?? 200;
            const headers = matchedRule.headers ?? {};
            const data = matchedRule.data;
            const content = matchedRule.content ?? (data !== undefined ? JSON.stringify(data) : '');

            let parsedData = data;
            if (parsedData === undefined && content) {
                try {
                    parsedData = JSON.parse(content);
                } catch {
                    parsedData = undefined;
                }
            }

            return {
                url,
                method: requestMethod,
                statusCode,
                headers,
                content,
                data: parsedData,
            };
        }

        const headers: Record<string, string> = {};
        if (options?.headers) {
            Object.entries(options.headers).forEach(([k, v]) => {
                if (v !== undefined) headers[k] = String(v);
            });
        }

        let body: any = undefined;
        if (options?.data) {
            body = JSON.stringify(options.data);
            if (!headers['Content-Type'] && !headers['content-type']) {
                headers['Content-Type'] = 'application/json';
            }
        } else if (options?.content) {
            body = options.content;
        }

        try {
            const controller = new AbortController();
            const timeoutMs = options?.timeout || 30000;
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            const res = await fetch(url, {
                method,
                headers,
                body,
                signal: controller.signal,
            });
            clearTimeout(timer);

            const content = await res.text();
            let data: any = undefined;
            try {
                data = JSON.parse(content);
            } catch {
                // not JSON
            }

            const responseHeaders: IHttpHeaders = {};
            res.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            return {
                url,
                method: requestMethod,
                statusCode: res.status,
                headers: responseHeaders,
                content,
                data,
            };
        } catch (err: any) {
            return {
                url,
                method: requestMethod,
                statusCode: 500,
                headers: {},
                content: JSON.stringify({ error: err.message }),
                data: { error: err.message },
            };
        }
    }
}
