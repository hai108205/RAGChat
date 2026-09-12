import crypto from "node:crypto";
import { config } from "../config/runtime.js";

export function decryptApiKey(
    encryptedApiKey: string,
    iv: string,
    authTag: Buffer | Uint8Array | string,
): string {
    const decipher = crypto.createDecipheriv(
        config.encryption.algorithm,
        config.encryption.key,
        Buffer.from(iv, "base64"),
    ) as crypto.DecipherGCM;

    const tagBuffer = Buffer.isBuffer(authTag)
        ? authTag
        : typeof authTag === "string"
          ? Buffer.from(authTag, "base64")
          : Buffer.from(authTag);

    decipher.setAuthTag(tagBuffer);

    let decipherText = decipher.update(encryptedApiKey, "base64", "utf-8");
    decipherText += decipher.final("utf-8");

    return decipherText;
}
