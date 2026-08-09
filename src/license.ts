import { requestUrl } from "obsidian";

export interface LicensePayload {
  product: string;
  licenseId: string;
  userName: string;
  expiresAt: string;
  maxDevices?: number;
  features: string[];
  issuedAt?: string;
}

export interface LicenseVerifyResult {
  valid: boolean;
  reason?: string;
  payload?: LicensePayload;
  message?: string;
}

const WORKER_VERIFY_URL = "https://crisp-license.helloherve-xsn.workers.dev/api/verify-device";

export const CRISP_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAiz41HIDpD59SH3DjKnovUO+EEhTJXjvmiug/ev9t4ZQ=
-----END PUBLIC KEY-----`;

export const CRISP_LICENSE_PRODUCTS = [
  "Crisp Suite",
  "Crisp Organize",
  "Crisp ASR",
  "Crisp Annotations",
  "Crisp File Explorer",
  "Crisp Focus",
  "Crisp Reading Rail",
  "Crisp Base",
] as const;


export function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const raw = atob(padded);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    buffer[i] = raw.charCodeAt(i);
  }
  return buffer;
}

export async function importEd25519PublicKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  const der = base64UrlToUint8Array(pemContents);
  const derArrayBuffer = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
  return await window.crypto.subtle.importKey(
    "spki",
    derArrayBuffer,
    { name: "Ed25519" },
    true,
    ["verify"]
  );
}

function getDeviceId(): string {
  const app = (window as unknown as { app?: { appId?: string; vault?: { getName(): string } } }).app;
  if (app?.appId) return app.appId;
  if (app?.vault?.getName) return `vault-${encodeURIComponent(app.vault.getName())}`;
  return "device-default";
}

/**
 * 本地 Ed25519 解密验签 + Obsidian requestUrl 在线设备数限制校验
 */
export async function verifyLicenseCode(
  licenseCode: string,
  targetPluginId: string = "crisp-annotations"
): Promise<LicenseVerifyResult> {
  const trimmed = licenseCode.trim();
  if (!trimmed) {
    return { valid: false, reason: "授权码为空" };
  }

  const parts = trimmed.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "授权码格式无效（必须包含 payload 与签名）" };
  }

  const [payloadBase64, signatureBase64] = parts;

  try {
    const payloadJson = new TextDecoder().decode(base64UrlToUint8Array(payloadBase64));
    const payload = JSON.parse(payloadJson) as LicensePayload;

    if (!(CRISP_LICENSE_PRODUCTS as readonly string[]).includes(payload.product)) {
      return { valid: false, reason: "授权码不属于 Crisp 系列插件" };
    }

    const features = Array.isArray(payload.features) ? payload.features : [];
    const hasFeaturePermission = features.includes("all") || features.includes(targetPluginId);
    if (!hasFeaturePermission) {
      return { valid: false, reason: `该授权码未包含 ${targetPluginId} 权限` };
    }

    if (payload.expiresAt) {
      const expireTime = new Date(payload.expiresAt).getTime();
      if (Number.isFinite(expireTime) && Date.now() > expireTime) {
        const formattedDate = payload.expiresAt.split("T")[0];
        return { valid: false, reason: `授权已于 ${formattedDate} 到期` };
      }
    }

    const signature = base64UrlToUint8Array(signatureBase64);
    const signatureArrayBuffer = signature.buffer.slice(signature.byteOffset, signature.byteOffset + signature.byteLength) as ArrayBuffer;
    const dataBytes = new TextEncoder().encode(payloadBase64);
    const dataArrayBuffer = dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength) as ArrayBuffer;

    const publicKey = await importEd25519PublicKey(CRISP_PUBLIC_KEY_PEM);
    const isSignatureValid = await window.crypto.subtle.verify(
      "Ed25519",
      publicKey,
      signatureArrayBuffer,
      dataArrayBuffer
    );

    if (!isSignatureValid) {
      return { valid: false, reason: "授权签名无效或伪造" };
    }

    try {
      const deviceId = getDeviceId();
      const res = await requestUrl({
        url: WORKER_VERIFY_URL,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseCode: trimmed,
          deviceId: deviceId,
          action: "activate",
          pluginId: targetPluginId
        })
      });

      const cloudResult = res.json as { valid?: boolean; reason?: string; message?: string };
      if (cloudResult && typeof cloudResult.valid === "boolean") {
        if (cloudResult.valid === false) {
          return { valid: false, reason: cloudResult.reason || "设备数已达上限" };
        }
        return {
          valid: true,
          payload,
          message: cloudResult.message
        };
      }
    } catch (netErr) {
      console.debug("Crisp Annotations license online check offline fallback", netErr);
    }

    return { valid: true, payload };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { valid: false, reason: `解析授权码失败: ${msg}` };
  }
}
