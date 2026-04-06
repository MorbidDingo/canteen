import Razorpay from "razorpay";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationPaymentConfig } from "@/lib/db/schema";

// Singleton Razorpay instance for server-side use only
let razorpayInstance: Razorpay | null = null;
const organizationScopedRazorpayCache = new Map<string, Razorpay>();

type ResolvedRazorpayCredentials = {
  keyId: string;
  keySecret: string;
  source: "ORG" | "ENV";
};

function getEncryptionKeyBuffer() {
  const key = process.env.ORG_PAYMENT_CONFIG_ENCRYPTION_KEY?.trim();
  if (!key) return null;
  return crypto.createHash("sha256").update(key).digest();
}

function decryptKeySecret(value: string): string {
  if (!value.startsWith("enc:v1:")) {
    return value;
  }

  const key = getEncryptionKeyBuffer();
  if (!key) {
    throw new Error("ORG_PAYMENT_CONFIG_ENCRYPTION_KEY is required to decrypt organization payment keys.");
  }

  const payload = value.slice("enc:v1:".length);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted organization payment key payload.");
  }

  const iv = Buffer.from(parts[0], "base64");
  const cipherText = Buffer.from(parts[1], "base64");
  const authTag = Buffer.from(parts[2], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptKeySecretForStorage(plainSecret: string): string {
  const key = getEncryptionKeyBuffer();
  if (!key) {
    throw new Error("ORG_PAYMENT_CONFIG_ENCRYPTION_KEY is required to store organization payment keys.");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

export async function resolveRazorpayCredentialsForOrganization(
  organizationId?: string | null,
): Promise<ResolvedRazorpayCredentials> {
  if (organizationId) {
    const [orgConfig] = await db
      .select({ keyId: organizationPaymentConfig.keyId, keySecretEncrypted: organizationPaymentConfig.keySecretEncrypted })
      .from(organizationPaymentConfig)
      .where(
        and(
          eq(organizationPaymentConfig.organizationId, organizationId),
          eq(organizationPaymentConfig.provider, "RAZORPAY"),
          eq(organizationPaymentConfig.mode, "ORG_MANAGED"),
          eq(organizationPaymentConfig.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (orgConfig?.keyId && orgConfig.keySecretEncrypted) {
      const decryptedSecret = decryptKeySecret(orgConfig.keySecretEncrypted);
      if (decryptedSecret) {
        return {
          keyId: orgConfig.keyId,
          keySecret: decryptedSecret,
          source: "ORG",
        };
      }
    }
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment.",
    );
  }

  return {
    keyId,
    keySecret,
    source: "ENV",
  };
}

export async function getRazorpayForOrganization(organizationId?: string | null): Promise<Razorpay> {
  const creds = await resolveRazorpayCredentialsForOrganization(organizationId);
  const cacheKey = `${creds.keyId}:${creds.keySecret}`;
  const cached = organizationScopedRazorpayCache.get(cacheKey);
  if (cached) return cached;

  const instance = new Razorpay({
    key_id: creds.keyId,
    key_secret: creds.keySecret,
  });
  organizationScopedRazorpayCache.set(cacheKey, instance);
  return instance;
}

export async function getRazorpayPublicKeyForOrganization(organizationId?: string | null): Promise<string> {
  const creds = await resolveRazorpayCredentialsForOrganization(organizationId);
  return creds.keyId;
}

export async function getRazorpaySecretForOrganization(organizationId?: string | null): Promise<string> {
  const creds = await resolveRazorpayCredentialsForOrganization(organizationId);
  return creds.keySecret;
}

export function getRazorpay(): Razorpay {
  if (!razorpayInstance) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
      throw new Error(
        "Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file."
      );
    }

    razorpayInstance = new Razorpay({
      key_id,
      key_secret,
    });
  }

  return razorpayInstance;
}
