import prisma from "./prismaClient.js";

const WEBHOOK_CONFIG_KEY = "webhook_config";

export interface WebhookConfig {
    slackUrl?: string | null;
    discordUrl?: string | null;
    customUrl?: string | null;
    enabledAlerts?: string[];
}

export interface AlertPayload {
    type: string;
    title: string;
    message: string;
    severity: "critical" | "warning" | "info" | string;
    source: string;
}

export async function getWebhookConfig(): Promise<WebhookConfig | null> {
    try {
        const setting = await prisma.systemSetting.findUnique({
            where: { key: WEBHOOK_CONFIG_KEY },
        });
        if (!setting) return null;
        return JSON.parse(setting.value) as WebhookConfig;
    } catch {
        return null;
    }
}

export async function saveWebhookConfig(config: WebhookConfig): Promise<void> {
    await prisma.systemSetting.upsert({
        where: { key: WEBHOOK_CONFIG_KEY },
        update: { value: JSON.stringify(config) },
        create: { key: WEBHOOK_CONFIG_KEY, value: JSON.stringify(config) },
    });
}

function buildSlackPayload(alert: AlertPayload) {
    return {
        blocks: [
            {
                type: "header",
                text: { type: "plain_text", text: `⚠️  ${alert.title}`, emoji: true },
            },
            {
                type: "section",
                text: { type: "mrkdwn", text: alert.message },
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `*Severity:* ${alert.severity}  |  *Source:* ${alert.source}  |  *Time:* ${new Date().toISOString()}`,
                    },
                ],
            },
        ],
    };
}

function buildDiscordPayload(alert: AlertPayload) {
    const colors: Record<string, number> = { critical: 15548997, warning: 16705372, info: 5793266 };
    return {
        embeds: [
            {
                title: alert.title,
                description: alert.message,
                color: colors[alert.severity] || colors.info,
                fields: [
                    { name: "Severity", value: alert.severity, inline: true },
                    { name: "Source", value: alert.source, inline: true },
                ],
                timestamp: new Date().toISOString(),
            },
        ],
    };
}

async function sendWebhook(url: string, payload: any): Promise<boolean> {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            console.error(`Webhook ${url} returned ${response.status}: ${await response.text()}`);
        }
        return response.ok;
    } catch (error: any) {
        console.error(`Failed to send webhook to ${url}:`, error?.message || error);
        return false;
    }
}

export async function dispatchAlert(alert: AlertPayload): Promise<void> {
    const config = await getWebhookConfig();
    if (!config) return;

    const enabled = config.enabledAlerts || [];
    if (!enabled.includes(alert.type)) return;

    const promises: Promise<boolean>[] = [];

    if (config.slackUrl) {
        promises.push(sendWebhook(config.slackUrl, buildSlackPayload(alert)));
    }

    if (config.discordUrl) {
        promises.push(sendWebhook(config.discordUrl, buildDiscordPayload(alert)));
    }

    if (config.customUrl) {
        promises.push(sendWebhook(config.customUrl, alert));
    }

    await Promise.allSettled(promises);
}
