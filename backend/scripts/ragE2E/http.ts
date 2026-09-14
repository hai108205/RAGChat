export interface ApiEnvelope<T> {
    success?: boolean;
    data?: T;
    message?: string;
}

function safeErrorText(value: unknown, token?: string): string {
    let text = String(value ?? "request failed");
    if (token) text = text.split(token).join("[REDACTED]");
    text = text.replace(/Bearer\s+[^\s,}]+/gi, "Bearer [REDACTED]");
    return text.slice(0, 2000);
}

export function parseApiEnvelope<T>(status: number, body: ApiEnvelope<T>, requestId?: string): { data: T; message: string } {
    if (status >= 400 || body.success === false || body.data === undefined) {
        const message = typeof body.message === "string" && body.message.trim() ? safeErrorText(body.message.trim()) : `HTTP ${status}`;
        throw new Error(`${message}${requestId ? ` (request ${requestId})` : ""}`);
    }
    return { data: body.data, message: body.message || "" };
}

export function isSourceReady(data: any, filename: string): any | undefined {
    if (!Array.isArray(data?.sources)) return undefined;
    return data.sources.find((source: any) =>
        source?.filename === filename && source?.status === "ACTIVE" && Number(source?.chunksCount) > 0,
    );
}

export function isJobTerminal(job: { status?: string; attempts?: number }, workerAttempts: number): boolean {
    if (job.status === "COMPLETED") return true;
    return job.status === "FAILED" && Number(job.attempts || 0) >= workerAttempts;
}

export function getNextPollDelay(initialMs: number, maxMs: number, attempt: number): number {
    return Math.min(maxMs, initialMs * 2 ** Math.max(0, attempt));
}

export interface RequestJsonOptions {
    baseUrl: string;
    token: string;
    path: string;
    method: "GET" | "POST" | "DELETE";
    requestId?: string;
    body?: unknown;
    timeoutMs: number;
    retries?: number;
    fetchImpl?: typeof fetch;
}

export async function requestJson<T>({
    baseUrl,
    token,
    path,
    method,
    requestId,
    body,
    timeoutMs,
    retries = 3,
    fetchImpl = fetch,
}: RequestJsonOptions): Promise<{ data: T; requestId?: string; message: string }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(new URL(path, baseUrl).toString(), {
                method,
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${token}`,
                    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                    ...(requestId ? { "X-Request-Id": requestId } : {}),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: controller.signal,
            });
            const responseRequestId = response.headers.get("x-request-id") || undefined;
            const raw = await response.text();
            let parsed: ApiEnvelope<T>;
            try {
                parsed = JSON.parse(raw) as ApiEnvelope<T>;
            } catch {
                throw new Error(`Backend returned invalid JSON (HTTP ${response.status})`);
            }
            if (requestId && responseRequestId !== requestId) {
                throw new Error(`Backend request ID mismatch: expected ${requestId}, received ${responseRequestId || "missing"}`);
            }
            if (response.status >= 500 || response.status === 429) {
                throw new Error(`Backend HTTP ${response.status}: ${safeErrorText(parsed.message, token)}`);
            }
            const envelope = parseApiEnvelope(response.status, parsed, requestId);
            return { ...envelope, requestId: responseRequestId || requestId };
        } catch (error) {
            lastError = error;
            const retryable = error instanceof TypeError || (error instanceof Error && /aborted|HTTP 5\d\d|HTTP 429/i.test(error.message));
            if (!retryable || attempt === retries - 1) throw error;
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export type PollResult<T> = { value: T; attempts: number };

export async function pollUntil<T>(
    read: () => Promise<T>,
    done: (value: T) => boolean,
    options: { timeoutMs: number; initialMs: number; maxMs: number; sleep?: (ms: number) => Promise<void> },
): Promise<PollResult<T>> {
    const startedAt = Date.now();
    const sleep = options.sleep || ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    let attempt = 0;
    while (Date.now() - startedAt <= options.timeoutMs) {
        const value = await read();
        if (done(value)) return { value, attempts: attempt + 1 };
        const remaining = options.timeoutMs - (Date.now() - startedAt);
        if (remaining <= 0) break;
        await sleep(Math.min(getNextPollDelay(options.initialMs, options.maxMs, attempt), remaining));
        attempt++;
    }
    throw new Error(`Polling timed out after ${options.timeoutMs}ms`);
}
