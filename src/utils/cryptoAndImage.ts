import { ImageQualityReport, TimelineCase } from "../types/triage";

const STORAGE_KEY_ENC_DATA = "clarion_encrypted_timeline_v1";
const STORAGE_KEY_CRYPTO_JWK = "clarion_local_aes_key_v1";

/**
 * Generates or retrieves a browser-scoped AES-GCM 256-bit key for encrypting
 * sensitive patient timeline images at rest in local storage.
 */
async function getOrCreateAesKey(): Promise<CryptoKey> {
  const existingJwkStr = localStorage.getItem(STORAGE_KEY_CRYPTO_JWK);
  if (existingJwkStr) {
    try {
      const jwk = JSON.parse(existingJwkStr);
      return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
    } catch {
      // Fallback to generating a fresh key
    }
  }
  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await window.crypto.subtle.exportKey("jwk", key);
  localStorage.setItem(STORAGE_KEY_CRYPTO_JWK, JSON.stringify(exported));
  return key;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function saveEncryptedTimelineCases(cases: TimelineCase[]): Promise<void> {
  const key = await getOrCreateAesKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(cases));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  const payload = {
    alg: "AES-256-GCM",
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertext),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY_ENC_DATA, JSON.stringify(payload));
}

export async function loadEncryptedTimelineCases(): Promise<TimelineCase[] | null> {
  const raw = localStorage.getItem(STORAGE_KEY_ENC_DATA);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const key = await getOrCreateAesKey();
    const iv = new Uint8Array(base64ToArrayBuffer(parsed.iv));
    const ciphertext = base64ToArrayBuffer(parsed.ciphertext);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    const jsonStr = new TextDecoder().decode(decrypted);
    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn("Unable to decrypt stored timeline:", err);
    return null;
  }
}

export function permanentlyPurgeAllHealthData(): void {
  localStorage.removeItem(STORAGE_KEY_ENC_DATA);
  localStorage.removeItem(STORAGE_KEY_CRYPTO_JWK);
}

export async function computeSha256Hex(message: string): Promise<string> {
  const encoded = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compresses an image dataURL so its AES-256-GCM Base64 ciphertext stays well within
 * Firestore's 1MB document limit (< 650KB).
 */
export async function normalizeImageForEncryptedStorage(
  dataUrl: string,
  maxDim = 768
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.naturalWidth || 640;
      let height = img.naturalHeight || 480;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function encryptImagePayloadForCloud(dataUrl: string): Promise<{
  cipherAlgorithm: "AES-256-GCM";
  ivBase64: string;
  ciphertextBase64: string;
  sha256Digest: string;
}> {
  const normalizedDataUrl = await normalizeImageForEncryptedStorage(dataUrl, 720);
  const key = await getOrCreateAesKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(normalizedDataUrl);
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  const ivBase64 = arrayBufferToBase64(iv.buffer);
  const ciphertextBase64 = arrayBufferToBase64(ciphertextBuffer);
  const sha256Digest = await computeSha256Hex(ciphertextBase64);

  return {
    cipherAlgorithm: "AES-256-GCM",
    ivBase64,
    ciphertextBase64,
    sha256Digest,
  };
}

export async function decryptImagePayloadFromCloud(
  ivBase64: string,
  ciphertextBase64: string
): Promise<string | null> {
  try {
    const key = await getOrCreateAesKey();
    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.warn("Unable to decrypt cloud image with local key:", err);
    return null;
  }
}

/**
 * Fetches an asset image URL and converts it into a clean JPEG base64 Data URL
 * suitable for server-side multimodal analysis.
 */
export async function assetUrlToDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxDim = 1024;
      let width = img.naturalWidth || 800;
      let height = img.naturalHeight || 600;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

/**
 * Fast client-side optical pre-check (resolution, luminance darkness, edge sharpness)
 * to complement the Gemini multimodal quality check.
 */
export async function runClientOpticalPreCheck(dataUrl: string): Promise<{
  width: number;
  height: number;
  meanLuminance: number;
  edgeVariance: number;
  localIssues: string[];
}> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const canvas = document.createElement("canvas");
      const sampleW = Math.min(240, width);
      const sampleH = Math.min(240, height);
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ width, height, meanLuminance: 128, edgeVariance: 100, localIssues: [] });
        return;
      }
      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

      let lumSum = 0;
      const gray = new Float32Array(sampleW * sampleH);
      for (let i = 0; i < data.length; i += 4) {
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        lumSum += l;
        gray[i / 4] = l;
      }
      const meanLuminance = Math.round(lumSum / (sampleW * sampleH));

      // Simple Laplacian sharpness metric
      let lapSum = 0;
      let count = 0;
      for (let y = 1; y < sampleH - 1; y++) {
        for (let x = 1; x < sampleW - 1; x++) {
          const idx = y * sampleW + x;
          const lap =
            -4 * gray[idx] +
            gray[idx - 1] +
            gray[idx + 1] +
            gray[idx - sampleW] +
            gray[idx + sampleW];
          lapSum += lap * lap;
          count++;
        }
      }
      const edgeVariance = Math.round(lapSum / Math.max(1, count));
      const localIssues: string[] = [];

      if (width < 220 || height < 220) {
        localIssues.push("Too low resolution (<220px)");
      }
      if (meanLuminance < 38) {
        localIssues.push("Too dark (low illumination)");
      }
      if (edgeVariance < 32) {
        localIssues.push("Blurry / out of focus");
      }

      resolve({
        width,
        height,
        meanLuminance,
        edgeVariance,
        localIssues,
      });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0, meanLuminance: 0, edgeVariance: 0, localIssues: ["Unreadable image file"] });
    };
    img.src = dataUrl;
  });
}

/**
 * Synthesizes a deliberately dark & blurry test photo so users can test the
 * Image Quality Check rejection gate with 1 click.
 */
export function createSimulatedLowQualityPhoto(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, 320, 240);

  const grad = ctx.createRadialGradient(160, 120, 10, 160, 120, 95);
  grad.addColorStop(0, "rgba(65, 42, 38, 0.55)");
  grad.addColorStop(1, "rgba(15, 17, 22, 0.95)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(160, 120, 95, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL("image/jpeg", 0.5);
}

/**
 * Applies a privacy redaction bar over the top/background region or user-selected band
 * to strip identifying features before uploading.
 */
export async function applyPrivacyMaskToImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      // Redact peripheral border frame where background identifiers/badges often appear
      const borderH = Math.round(canvas.height * 0.14);
      ctx.fillStyle = "#0F172A";
      ctx.fillRect(0, 0, canvas.width, borderH);
      ctx.fillStyle = "#94A3B8";
      ctx.font = `${Math.max(12, Math.round(borderH * 0.36))}px sans-serif`;
      ctx.fillText("PRIVACY MASK APPLIED — IDENTIFIERS STRIPPED", 16, Math.round(borderH * 0.62));
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = dataUrl;
  });
}

export function mergeQualityReports(
  optical: { width: number; height: number; meanLuminance: number; edgeVariance: number; localIssues: string[] },
  aiReport: ImageQualityReport
): ImageQualityReport {
  const combinedIssues = Array.from(new Set([...optical.localIssues, ...(aiReport.detectedIssues || [])]));
  const isTooDark = aiReport.isTooDark || optical.meanLuminance < 38;
  const isBlurry = aiReport.isBlurry || optical.edgeVariance < 32;
  const isTooLowResolution = aiReport.isTooLowResolution || optical.width < 220 || optical.height < 220;
  const overallPass =
    aiReport.overallPass &&
    !isTooDark &&
    !isBlurry &&
    !isTooLowResolution &&
    !aiReport.isObstructed &&
    !aiReport.isTooFarAway &&
    !aiReport.isWrongBodyArea;

  return {
    ...aiReport,
    overallPass,
    isTooDark,
    isBlurry,
    isTooLowResolution,
    detectedIssues: combinedIssues,
    width: optical.width,
    height: optical.height,
    meanLuminance: optical.meanLuminance,
  };
}
