// Client-side helpers for talking to our API routes and to Supabase Storage.

export class RequestError extends Error {
  constructor(
    message: string,
    // True when the failure is likely caused by connectivity (worth retrying as-is).
    readonly network: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const NETWORK_MESSAGE = "Koneksi terputus atau sinyal lemah. Periksa sinyal, lalu tekan Coba Lagi.";

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RequestError(NETWORK_MESSAGE, true);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data.error === "string" ? data.error : "Terjadi kesalahan di server. Coba lagi.";
    throw new RequestError(message, res.status >= 500, res.status);
  }
  return data as T;
}

// Uses XHR instead of fetch because fetch has no upload progress events.
export function uploadToSignedUrl(
  signedUrl: string,
  blob: Blob,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", blob.type || "image/jpeg");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.timeout = 5 * 60 * 1000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else if (xhr.status === 413) {
        reject(new RequestError("Ukuran foto melebihi batas 5 MB.", false));
      } else if (xhr.status === 415) {
        reject(new RequestError("Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.", false));
      } else {
        reject(new RequestError("Gagal mengunggah foto. Tekan Coba Lagi.", true));
      }
    };
    xhr.onerror = () => reject(new RequestError(NETWORK_MESSAGE, true));
    xhr.ontimeout = () => reject(new RequestError(NETWORK_MESSAGE, true));

    xhr.send(blob);
  });
}
