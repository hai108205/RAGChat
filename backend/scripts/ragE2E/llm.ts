import OpenAI from "openai";
import { config } from "../../config/runtime.js";
import type { GeneratedQuestion, JudgeScore, PersistedCitation } from "./types.js";

const CATEGORIES = new Set<GeneratedQuestion["category"]>(["fact", "date", "responsibility", "multi_hop", "negative"]);
const SCORE_FIELDS = ["correctness", "groundedness", "citationSupport", "refusal"] as const;

function parseJsonValue(raw: string): any {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        const start = trimmed.indexOf("{");
        const end = trimmed.lastIndexOf("}");
        if (start < 0 || end <= start) throw new Error("LLM response does not contain a JSON object");
        return JSON.parse(trimmed.slice(start, end + 1));
    }
}

function requiredText(value: unknown, field: string, allowEmpty = false): string {
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(`${field} must be a non-empty string`);
    return value.trim();
}

export function normalizeGeneratedQuestions(raw: string, expectedCount: number): GeneratedQuestion[] {
    const parsed = parseJsonValue(raw);
    const questions = Array.isArray(parsed) ? parsed : parsed?.questions;
    if (!Array.isArray(questions) || questions.length !== expectedCount) {
        throw new Error(`Question generator must return exactly ${expectedCount} questions`);
    }
    const seenIds = new Set<string>();
    const seenQuestions = new Set<string>();
    return questions.map((item: any, index: number) => {
        const question: GeneratedQuestion = {
            caseId: requiredText(item?.caseId, `questions[${index}].caseId`),
            question: requiredText(item?.question, `questions[${index}].question`),
            referenceAnswer: requiredText(item?.referenceAnswer, `questions[${index}].referenceAnswer`, true),
            evidence: requiredText(item?.evidence, `questions[${index}].evidence`, true),
            category: item?.category,
            answerable: item?.answerable,
        };
        if (!CATEGORIES.has(question.category)) throw new Error(`questions[${index}].category is invalid`);
        if (typeof question.answerable !== "boolean") throw new Error(`questions[${index}].answerable must be boolean`);
        if (question.answerable && (!question.referenceAnswer || !question.evidence)) {
            throw new Error(`questions[${index}] answerable cases require referenceAnswer and evidence`);
        }
        const normalizedQuestion = question.question.toLocaleLowerCase("vi");
        if (seenIds.has(question.caseId) || seenQuestions.has(normalizedQuestion)) throw new Error("Generated questions must have distinct IDs and questions");
        seenIds.add(question.caseId);
        seenQuestions.add(normalizedQuestion);
        return question;
    });
}

export function normalizeJudgeResponse(raw: string): JudgeScore {
    const parsed = parseJsonValue(raw);
    const score = {} as JudgeScore;
    for (const field of SCORE_FIELDS) {
        const value = parsed?.[field];
        if (!Number.isInteger(value) || value < 0 || value > 2) throw new Error(`${field} score must be an integer from 0 to 2`);
        score[field] = value;
    }
    score.rationale = requiredText(parsed?.rationale, "rationale");
    return score;
}

export interface JudgeInput {
    question: GeneratedQuestion;
    answer: string;
    citations: readonly PersistedCitation[];
}

function responseText(response: any): string {
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("LLM returned an empty response");
    return content;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt < attempts - 1) await sleep(500 * 2 ** attempt);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function createEvaluatorLlmClient(baseUrlOverride?: string): { client: OpenAI; model: string; provider: string; baseUrl: string } {
    const openRouterKey = config.llm.openRouterLlmApiKey;
    const openAiKey = config.llm.openAiApiKey;
    const useOpenRouter = Boolean(openRouterKey);
    const apiKey = useOpenRouter ? openRouterKey : openAiKey;
    if (!apiKey) throw new Error("Question generation/judging requires OPENROUTER_LLM_API_KEY or OPENAI_API_KEY");
    const baseUrl = baseUrlOverride || (useOpenRouter ? config.llm.openRouterBaseUrl : config.llm.openAiBaseUrl || "https://api.openai.com/v1");
    return {
        client: new OpenAI({ apiKey, baseURL: baseUrl }),
        model: process.env.RAG_E2E_JUDGE_MODEL || process.env.RAG_E2E_MODEL || config.llm.defaultModel,
        provider: useOpenRouter ? "OPENROUTER" : "OPENAI",
        baseUrl,
    };
}

export async function generateQuestions(
    client: OpenAI,
    model: string,
    document: string,
    count: number,
): Promise<GeneratedQuestion[]> {
    const response = await withRetries(() => client.chat.completions.create({
        model,
        temperature: 0,
        messages: [
            { role: "system", content: "Bạn là chuyên gia tạo bộ kiểm thử RAG. Chỉ trả về JSON hợp lệ, không Markdown." },
            { role: "user", content: `Tạo đúng ${count} câu hỏi tiếng Việt từ tài liệu dưới đây. Phân bổ các category fact, date, responsibility, multi_hop, negative; mỗi category phải xuất hiện. Câu negative phải không có đáp án trong tài liệu. Trả về {\"questions\":[{\"caseId\":\"q-1\",\"question\":\"...\",\"referenceAnswer\":\"...\",\"evidence\":\"...\",\"category\":\"fact|date|responsibility|multi_hop|negative\",\"answerable\":true}]} và không lặp câu hỏi.\n\nTÀI LIỆU:\n${document}` },
        ],
    }), 3);
    return normalizeGeneratedQuestions(responseText(response), count);
}

export async function judgeAnswer(client: OpenAI, model: string, input: JudgeInput): Promise<JudgeScore> {
    const citations = input.citations.map((citation) => `[${citation.label}] ${citation.title || "Document"}: ${citation.snippet || ""}`).join("\n");
    const prompt = `Chấm câu trả lời RAG theo JSON đúng schema. Mỗi điểm là số nguyên 0, 1 hoặc 2. correctness: đúng reference answer; groundedness: mọi khẳng định có bằng chứng trong snippets; citationSupport: citation [n] có trỏ đúng snippets theo label; refusal: với answerable=true, 2 nếu trả lời thay vì từ chối, với answerable=false, 2 nếu từ chối rõ ràng dựa trên tài liệu.\nQUESTION: ${input.question.question}\nANSWERABLE: ${input.question.answerable}\nREFERENCE ANSWER: ${input.question.referenceAnswer}\nREFERENCE EVIDENCE: ${input.question.evidence}\nANSWER: ${input.answer}\nPERSISTED CITATIONS:\n${citations}\nTrả về duy nhất {\"correctness\":0,\"groundedness\":0,\"citationSupport\":0,\"refusal\":0,\"rationale\":\"...\"}.`;
    const response = await withRetries(() => client.chat.completions.create({
        model,
        temperature: 0,
        messages: [
            { role: "system", content: "Bạn là giám khảo RAG nghiêm ngặt. Chỉ trả về JSON." },
            { role: "user", content: prompt },
        ],
    }), 3);
    try {
        return normalizeJudgeResponse(responseText(response));
    } catch (error) {
        const repair = await withRetries(() => client.chat.completions.create({
            model,
            temperature: 0,
            messages: [
                { role: "system", content: "Chuyển kết quả sau thành đúng JSON schema judge, không thêm prose." },
                { role: "user", content: `${responseText(response)}\nSchema bắt buộc: correctness, groundedness, citationSupport, refusal là integer 0..2; rationale là string.` },
            ],
        }), 1);
        try {
            return normalizeJudgeResponse(responseText(repair));
        } catch {
            throw new Error(`Judge returned invalid JSON after repair: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
