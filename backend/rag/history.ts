import { AIMessage, HumanMessage, trimMessages, type BaseMessage } from "@langchain/core/messages";

export interface ConversationHistoryMessage {
    role?: string;
    content?: string;
}

function countApproximateTokens(messages: BaseMessage[]): number {
    return messages.reduce((total, message) => {
        const content = typeof message.content === "string" ? message.content : "";
        return total + (content.trim() ? content.trim().split(/\s+/u).length : 0);
    }, 0);
}

/** Preserves complete recent turns without passing raw unbounded history to the model. */
export async function trimHistoryForGeneration(
    history: readonly ConversationHistoryMessage[],
    maxTokens: number,
): Promise<BaseMessage[]> {
    const messages: BaseMessage[] = [];
    for (const message of history) {
        const content = message.content?.trim();
        if (!content) continue;
        if (message.role === "user") messages.push(new HumanMessage(content));
        if (message.role === "assistant") messages.push(new AIMessage(content));
    }
    return trimMessages(messages, {
        maxTokens,
        tokenCounter: countApproximateTokens,
        strategy: "last",
        startOn: "human",
    });
}
