# UI Kit Error Handling

## Purpose

UI Kit error handling allows Apps to return **field-level validation errors** to modal and contextual bar forms. When a user submits an invalid form, the App responds with `viewErrorResponse()` specifying which fields have errors and the error messages.

---

## Overview

Form submissions go through `UIKIT_VIEW_SUBMIT`. If validation fails, instead of `successResponse()`, return `viewErrorResponse()` with a map of field names to error messages. The Rocket.Chat client displays these errors inline next to each form field.

The error response uses `UIKitInteractionType.ERRORS` and follows the `IUIKitErrorResponse` shape:
- `success: false`
- `type: 'errors'`
- `viewId`: the ID of the view with errors
- `errors`: `{ [fieldName: string]: string }` -- a map of field names to error messages

---

## When To Use

| Scenario | Method |
|----------|--------|
| Required field is empty | `viewErrorResponse({ viewId, errors: { field: 'This field is required' } })` |
| Invalid format (email, number, etc.) | `viewErrorResponse({ viewId, errors: { email: 'Invalid email format' } })` |
| Business rule violation | `viewErrorResponse({ viewId, errors: { amount: 'Amount must be greater than 0' } })` |
| Server-side validation failure | `viewErrorResponse({ viewId, errors: { username: 'Username already taken' } })` |
| Multiple field errors | `viewErrorResponse({ viewId, errors: { field1: '...', field2: '...' } })` |

---

## Important Interfaces

### IUIKitErrorInteraction

```typescript
interface IUIKitErrorInteraction extends IUIKitInteraction {
    type: UIKitInteractionType.ERRORS;
    viewId: string;
    errors: { [field: string]: string };
}
```

### IUIKitErrorResponse

```typescript
interface IUIKitErrorResponse extends IUIKitErrorInteraction, IUIKitResponse {}
// { success: false, type: 'errors', viewId, errors, triggerId, appId }
```

### viewErrorResponse Method

```typescript
// On UIKitInteractionResponder:
viewErrorResponse(errorInteraction: IUIKitErrorInteractionParam): IUIKitErrorResponse

// IUIKitErrorInteractionParam:
type IUIKitErrorInteractionParam = Omit<IUIKitErrorInteraction, 'type' | 'appId' | 'triggerId'>;
// i.e., just { viewId, errors }
```

The responder automatically fills in `appId`, `triggerId`, `type: 'errors'`, and `success: false`.

### UIKitInteractionType Enum

```typescript
enum UIKitInteractionType {
    MODAL_OPEN = 'modal.open',
    MODAL_CLOSE = 'modal.close',
    MODAL_UPDATE = 'modal.update',
    CONTEXTUAL_BAR_OPEN = 'contextual_bar.open',
    CONTEXTUAL_BAR_CLOSE = 'contextual_bar.close',
    CONTEXTUAL_BAR_UPDATE = 'contextual_bar.update',
    ERRORS = 'errors',
}
```

---

## How to Access

```typescript
// In a UIKIT_VIEW_SUBMIT handler:
const responder = context.getInteractionResponder();

// Return errors:
return responder.viewErrorResponse({
    viewId: view.id,
    errors: {
        email: 'Please enter a valid email address',
        password: 'Password must be at least 8 characters',
    },
});
```

---

## Typical Workflows

### Basic Form Validation

```typescript
public async [AppMethod.UIKIT_VIEW_SUBMIT](
    context: UIKitViewSubmitInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<IUIKitResponse> {
    const { view } = context.getInteractionData();
    const state = view.state as Record<string, string>;
    const errors: Record<string, string> = {};

    // Validate required fields
    if (!state?.name || state.name.trim() === '') {
        errors.name = 'Name is required';
    }

    if (!state?.email) {
        errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) {
        errors.email = 'Please enter a valid email address';
    }

    // Return errors if any
    if (Object.keys(errors).length > 0) {
        return context.getInteractionResponder().viewErrorResponse({
            viewId: view.id,
            errors,
        });
    }

    // Validation passed -- proceed
    return context.getInteractionResponder().successResponse();
}
```

### Business Rule Validation

```typescript
public async [AppMethod.UIKIT_VIEW_SUBMIT](
    context: UIKitViewSubmitInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<IUIKitResponse> {
    const { view } = context.getInteractionData();
    const state = view.state as Record<string, unknown>;
    const errors: Record<string, string> = {};

    // Validate number range
    const quantity = Number(state?.quantity);
    if (isNaN(quantity) || quantity <= 0) {
        errors.quantity = 'Quantity must be a positive number';
    } else if (quantity > 100) {
        errors.quantity = 'Maximum quantity is 100';
    }

    // Validate date
    const dateStr = state?.date as string;
    if (dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        if (date < today) {
            errors.date = 'Date must be in the future';
        }
    }

    // Validate against server data
    const username = state?.username as string;
    if (username) {
        const userReader = read.getUserReader();
        const existingUser = await userReader.getByUsername(username);
        if (existingUser) {
            errors.username = 'Username is already taken';
        }
    }

    if (Object.keys(errors).length > 0) {
        return context.getInteractionResponder().viewErrorResponse({
            viewId: view.id,
            errors,
        });
    }

    // Save data
    return context.getInteractionResponder().successResponse();
}
```

### Validating with Dynamic Field Names

```typescript
public async [AppMethod.UIKIT_VIEW_SUBMIT](
    context: UIKitViewSubmitInteractionContext,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
): Promise<IUIKitResponse> {
    const { view } = context.getInteractionData();
    const state = view.state as Record<string, unknown>;
    const errors: Record<string, string> = {};

    // Field names in state match the actionId of input blocks
    // e.g., a plain-text input with actionId "customer_name" becomes state.customer_name

    const requiredFields = ['customer_name', 'subject', 'priority'];

    for (const field of requiredFields) {
        const value = state?.[field];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            errors[field] = `${field.replace(/_/g, ' ')} is required`;
        }
    }

    if (Object.keys(errors).length > 0) {
        return context.getInteractionResponder().viewErrorResponse({
            viewId: view.id,
            errors,
        });
    }

    return context.getInteractionResponder().successResponse();
}
```

### Error Handling in IUIController (Programmatic)

```typescript
// For programmatic error display (outside VIEW_SUBMIT):
const uiController = modify.getUiController();

await uiController.setViewError(
    { viewId: 'modal-id', errors: { field: 'Invalid value' } },
    { triggerId: 'trigger-id' },
    user,
);
```

---

## Error Field Naming

The `errors` object keys must match the `actionId` (or `blockId`) of the input block they correspond to. For example:

```typescript
// Block definition:
blockBuilder.createInputBlock({
    label: blockBuilder.createPlainTextObject('Email'),
    element: blockBuilder.createPlainTextInputElement({
        actionId: 'email_input',   // ← this becomes the error key
    }),
});

// Error response:
errors: {
    email_input: 'Invalid email address',
}
```

---

## Anti-Patterns

- **Do not return `successResponse` for validation failures** -- use `viewErrorResponse` so errors display inline.
- **Do not include `appId`, `triggerId`, or `type` in the param** -- the responder fills these automatically.
- **Do not forget `viewId`** -- it is required to identify which view has errors.
- **Do not use generic error messages** -- reference specific fields so users know what to fix.
- **Error keys must match input actionIds** -- mismatched keys will not display on the UI.
- **`errors` is `{ [field: string]: string }`** -- values are always strings displayed to the user. Do not use objects, arrays, or numbers as error values.
