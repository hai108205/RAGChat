import http from "http";
import crypto from "crypto";

const PORT = parseInt(process.env.PORT || "8080", 10);
const capturedCallbacks = [];

function makeVector(text, dims = 1536) {
    const vec = new Array(dims).fill(0.01);
    let hash = 0;
    const str = String(text || "");
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    vec[0] = Math.sin(hash) * 0.1;
    vec[1] = Math.cos(hash) * 0.1;
    return vec;
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
        });
        req.on("end", () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(new Error("Invalid JSON: " + err.message));
            }
        });
        req.on("error", reject);
    });
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "*",
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    // Handle CORS preflight
    if (method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "*",
        });
        return res.end();
    }

    try {
        // Health check
        if ((method === "GET" || method === "HEAD") && (pathname === "/healthz" || pathname === "/")) {
            return sendJson(res, 200, {
                status: "ok",
                service: "ragchat-openai-mock",
                uptime: process.uptime(),
                capturedCallbacksCount: capturedCallbacks.length,
            });
        }

        // OpenAI Models endpoint
        if (method === "GET" && (pathname === "/v1/models" || pathname === "/models")) {
            return sendJson(res, 200, {
                object: "list",
                data: [
                    { id: "openai/gpt-4o-mini", object: "model", owned_by: "system" },
                    { id: "openai/gpt-4o", object: "model", owned_by: "system" },
                    { id: "gpt-4o-mini", object: "model", owned_by: "system" },
                    { id: "gpt-4o", object: "model", owned_by: "system" },
                    { id: "openai/text-embedding-3-small", object: "model", owned_by: "system" },
                    { id: "text-embedding-3-small", object: "model", owned_by: "system" },
                ],
            });
        }

        // OpenAI Chat Completions endpoint
        if (method === "POST" && (pathname === "/v1/chat/completions" || pathname === "/chat/completions")) {
            const body = await parseJsonBody(req);
            const messages = Array.isArray(body.messages) ? body.messages : [];
            const lastUserMsg = messages
                .slice()
                .reverse()
                .find((m) => m.role === "user")?.content || "query";

            const completionContent = `AI completion response for: ${lastUserMsg}`;
            const responseData = {
                id: `chatcmpl-${crypto.randomUUID()}`,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: body.model || "openai/gpt-4o-mini",
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: completionContent,
                        },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 20,
                    completion_tokens: 30,
                    total_tokens: 50,
                },
            };

            return sendJson(res, 200, responseData);
        }

        // OpenAI Embeddings endpoint
        if (method === "POST" && (pathname === "/v1/embeddings" || pathname === "/embeddings")) {
            const body = await parseJsonBody(req);
            const input = body.input;
            const dims = parseInt(body.dimensions || "1536", 10);

            const inputItems = Array.isArray(input) ? input : [input || ""];
            const embeddingItems = inputItems.map((item, idx) => ({
                object: "embedding",
                index: idx,
                embedding: makeVector(item, dims),
            }));

            const responseData = {
                object: "list",
                data: embeddingItems,
                model: body.model || "openai/text-embedding-3-small",
                usage: {
                    prompt_tokens: inputItems.length * 8,
                    total_tokens: inputItems.length * 8,
                },
            };

            return sendJson(res, 200, responseData);
        }

        // Webhook callback endpoint (captures Rocket.Chat callback deliveries)
        if (method === "POST" && (pathname === "/callback" || pathname.startsWith("/api/apps/public/"))) {
            const body = await parseJsonBody(req);
            const entry = {
                id: crypto.randomUUID(),
                receivedAt: new Date().toISOString(),
                path: pathname,
                headers: req.headers,
                body,
            };
            capturedCallbacks.push(entry);

            console.log(`[MockServer] Webhook callback captured: event=${body.event}, request_id=${body.request_id || body.requestId || "n/a"}`);
            return sendJson(res, 200, {
                statusCode: 200,
                success: true,
                message: "Webhook callback received successfully",
                capturedId: entry.id,
            });
        }

        // Query captured callbacks
        if (method === "GET" && pathname === "/callbacks") {
            return sendJson(res, 200, {
                count: capturedCallbacks.length,
                callbacks: capturedCallbacks,
            });
        }

        // Query latest captured callback
        if (method === "GET" && pathname === "/callbacks/last") {
            if (capturedCallbacks.length === 0) {
                return sendJson(res, 404, {
                    message: "No callbacks recorded yet",
                });
            }
            return sendJson(res, 200, capturedCallbacks[capturedCallbacks.length - 1]);
        }

        // Clear captured callbacks
        if ((method === "POST" || method === "DELETE") && pathname === "/callbacks/clear") {
            const previousCount = capturedCallbacks.length;
            capturedCallbacks.length = 0;
            return sendJson(res, 200, {
                success: true,
                message: `Cleared ${previousCount} callbacks`,
            });
        }

        // Not Found
        sendJson(res, 404, { error: `Endpoint '${method} ${pathname}' not found` });
    } catch (err) {
        console.error(`[MockServer] Error handling ${method} ${pathname}:`, err);
        sendJson(res, 500, { error: err.message || "Internal server error" });
    }
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`[MockOpenAI] Deterministic mock server listening on http://0.0.0.0:${PORT}`);
    console.log(` - Chat completions: POST /v1/chat/completions`);
    console.log(` - Embeddings:       POST /v1/embeddings`);
    console.log(` - Webhook callback: POST /callback`);
    console.log(` - Callbacks audit:  GET  /callbacks`);
});
