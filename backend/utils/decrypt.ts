import crypto from "node:crypto";

export function decryptApiKey(
    encryptedApiKey: string,
    iv: string,
    authTag: Buffer | Uint8Array | string,
): string {
    const algorithm = process.env.ENCRYPTION_ALGORITHM || "aes-256-gcm";
    const cipherKey = process.env.CIPHER_KEY || "";

    const decipher = crypto.createDecipheriv(
        algorithm,
        Buffer.from(cipherKey, "base64"),
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
