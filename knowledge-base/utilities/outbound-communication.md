# Outbound Communication Provider

## Purpose

Outbound communication providers enable Rocket.Chat apps to send messages via external channels -- phone (WhatsApp/SMS templates) and email. Apps register a provider implementation that Rocket.Chat calls when it needs to deliver a message to an external recipient.

---

## Overview

The outbound communication system supports phone-based messaging (WhatsApp templates via provider phone numbers). Email providers are defined in the interface but not yet implemented on the Rocket.Chat side (marked `@ignore`). A phone provider implements `sendOutboundMessage` and `getProviderMetadata`. Messages use template-based structures with typed parameters (text, currency, date, media).

---

## When To Use

- Sending WhatsApp template messages from Rocket.Chat conversations
- Integrating with a third-party messaging API (Twilio, MessageBird, etc.)
- Sending transactional notifications via phone channels

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IOutboundPhoneMessageProvider` | Phone message provider | `type: 'phone'`, `sendOutboundMessage`, `getProviderMetadata` |
| `IOutboundEmailMessageProvider` | Email provider (not yet implemented) | `type: 'email'` |
| `IOutboundMessageProviderBase` | Base provider contract | `appId`, `name`, `documentationUrl?`, `supportsTemplates?`, `sendOutboundMessage` |
| `IOutboundMessage` | Message payload | `to`, `type`, `templateProviderPhoneNumber`, `agentId?`, `departmentId?`, `template` |
| `IOutboundProviderTemplate` | Template descriptor | `id`, `name`, `language`, `type`, `category`, `status`, `components`, phone info |
| `IOutboundCommunicationProviderExtend` | Registration accessor | `registerPhoneProvider`, `registerEmailProvider` |
| `ProviderMetadata` | Provider metadata response | `providerId`, `providerName`, `providerType`, `supportsTemplates`, `templates` |

---

## IOutboundMessageProviderBase

```typescript
interface IOutboundMessageProviderBase {
    appId: string;
    name: string;
    documentationUrl?: string;
    supportsTemplates?: boolean;
    sendOutboundMessage(
        message: IOutboundMessage,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void>;
}
```

---

## IOutboundPhoneMessageProvider

```typescript
export interface IOutboundPhoneMessageProvider extends IOutboundMessageProviderBase {
    type: 'phone';
    getProviderMetadata(
        read: IRead, modify: IModify, http: IHttp, persistence: IPersistence,
    ): Promise<ProviderMetadata>;
}
```

### getProviderMetadata

Returns the provider's identity, supported phone numbers, and available message templates. Templates are organized by phone number:

```typescript
export type ProviderMetadata = {
    providerId: string;
    providerName: string;
    providerType: 'phone' | 'email';
    supportsTemplates: boolean;
    templates: Record<string, IOutboundProviderTemplate[]>; // { '+1121221212': [{ template }] }
};
```

---

## IOutboundMessage

```typescript
export interface IOutboundMessage {
    to: string;                         // Recipient phone number
    type: 'template';                   // Message type (currently only 'template')
    templateProviderPhoneNumber: string; // Provider phone number sending the message
    agentId?: string;                   // Livechat agent ID (if applicable)
    departmentId?: string;              // Livechat department ID (if applicable)
    template: {
        name: string;                   // Template name
        language: {
            code: string;               // Language code (e.g., 'en', 'pt_BR')
            policy?: 'deterministic' | 'fallback';
        };
        components?: TemplateComponent[]; // Replaceable template components
        namespace?: string;
    };
}
```

---

## Template Components

Components replace dynamic content in templates. Each component has a `type` (header/body/footer/button) and `parameters`:

```typescript
export type TemplateComponent = {
    type: 'header' | 'body' | 'footer' | 'button';
    parameters: TemplateParameter[];
};
```

### TemplateParameter Variants

| Type | Use Case | Key Fields |
|------|----------|------------|
| `text` | Plain text substitution | `text: string` |
| `currency` | Monetary values | `currency: { fallbackValue, code, amount1000 }` |
| `date_time` | Dates/times | `dateTime: { fallbackValue, timestamp?, dayOfWeek?, ... }` |
| `media` | Images, documents, videos | `link, format: 'image'\|'document'\|'video'` |
| `document` | Document with filename | `document: { link, filename }` |
| `video` | Video link | `video: { link }` |
| `image` | Image link | `image: { link }` |

---

## IOutboundProviderTemplate

```typescript
export interface IOutboundProviderTemplate {
    id: string;
    name: string;
    language: string;
    type: 'whatsapp' | 'email' | string;
    category: 'authentication' | 'utility' | 'marketing' | string;
    status: 'approved' | 'rejected' | 'pending' | string;
    qualityScore: { score: 'green' | 'yellow' | 'red' | 'unknown' | string; reasons: string[] | null };
    components: Component[];
    createdAt: string;
    createdBy: string;
    modifiedAt: string;
    modifiedBy: string;
    namespace: string;
    wabaAccountId: string;
    phoneNumber: string;
    partnerId: string;
    externalId: string;
    updatedExternal: string;
    rejectedReason: string | undefined;
}
```

Templates are WhatsApp Business Account (WABA) templates. By default, the platform filters templates to only show those with `status: 'approved'`.

---

## Registration

Register providers in `extendConfiguration`:

```typescript
import { IConfigurationExtend } from '@rocket.chat/apps-engine/definition/accessors';
import { IOutboundPhoneMessageProvider } from '@rocket.chat/apps-engine/definition/outboundCommunication';

export async function extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
    await configuration.outboundCommunication.registerPhoneProvider(new MyWhatsAppProvider());
}
```

The `IOutboundCommunicationProviderExtend` accessor is available via `configuration.outboundCommunication`.

---

## Complete Example: WhatsApp Provider

```typescript
import {
    IOutboundPhoneMessageProvider,
    IOutboundMessage,
    ProviderMetadata,
} from '@rocket.chat/apps-engine/definition/outboundCommunication';
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';

class TwilioWhatsAppProvider implements IOutboundPhoneMessageProvider {
    public type = 'phone' as const;
    public appId = 'my-whatsapp-app';
    public name = 'Twilio WhatsApp';
    public documentationUrl = 'https://docs.example.com/whatsapp-provider';
    public supportsTemplates = true;

    public async getProviderMetadata(
        read: IRead, modify: IModify, http: IHttp, persistence: IPersistence,
    ): Promise<ProviderMetadata> {
        // Fetch available phone numbers and templates from Twilio API
        const response = await http.get('https://api.twilio.com/...');

        return {
            providerId: 'twilio-123',
            providerName: 'Twilio WhatsApp Business',
            providerType: 'phone',
            supportsTemplates: true,
            templates: {
                '+15551234567': [
                    {
                        id: 'tpl_001',
                        name: 'welcome_message',
                        language: 'en',
                        type: 'whatsapp',
                        category: 'utility',
                        status: 'approved',
                        qualityScore: { score: 'green', reasons: null },
                        components: [],
                        createdAt: '2024-01-01T00:00:00Z',
                        createdBy: 'admin',
                        modifiedAt: '2024-01-01T00:00:00Z',
                        modifiedBy: 'admin',
                        namespace: 'abcd1234',
                        wabaAccountId: 'waba_001',
                        phoneNumber: '+15551234567',
                        partnerId: 'partner_001',
                        externalId: 'ext_001',
                        updatedExternal: '2024-01-01T00:00:00Z',
                        rejectedReason: undefined,
                    },
                ],
            },
        };
    }

    public async sendOutboundMessage(
        message: IOutboundMessage,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        // Call Twilio API to send the WhatsApp template message
        await http.post('https://api.twilio.com/...', {
            data: {
                To: `whatsapp:${message.to}`,
                From: `whatsapp:${message.templateProviderPhoneNumber}`,
                ContentSid: message.template.name,
                // Map template components to Twilio format...
            },
        });
    }
}
```

---

## Email Provider (Future)

The `IOutboundEmailMessageProvider` interface is defined but marked `@ignore - not implemented yet`. It extends `IOutboundMessageProviderBase` with `type: 'email'`. Registration uses the same pattern via `configuration.outboundCommunication.registerEmailProvider(...)` once the platform supports it.
