export function readFileAsTextWithProgress(
  file: File,
  opts?: { onProgress?: (pct: number) => void },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
    reader.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = (event.loaded / Math.max(1, event.total)) * 100;
      opts?.onProgress?.(pct);
    };
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });
}

export function readFileAsDataUrlWithProgress(
  file: File,
  opts?: { onProgress?: (pct: number) => void },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
    reader.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = (event.loaded / Math.max(1, event.total)) * 100;
      opts?.onProgress?.(pct);
    };
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

export async function uploadFormDataWithProgress<T = unknown>({
  url,
  formData,
  method = 'POST',
  onProgress,
}: {
  url: string;
  formData: FormData;
  method?: 'POST' | 'PUT' | 'PATCH';
  onProgress?: (pct: number) => void;
}): Promise<{ ok: boolean; status: number; json: T | null; text: string }> {
  const result = await new Promise<{ ok: boolean; status: number; text: string }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.responseType = 'text';

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = (event.loaded / Math.max(1, event.total)) * 100;
      onProgress?.(pct);
    };

    xhr.onload = () => {
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText ?? '' });
    };
    xhr.onerror = () => {
      resolve({ ok: false, status: xhr.status || 0, text: xhr.responseText ?? '' });
    };

    xhr.send(formData);
  });

  let json: T | null = null;
  try {
    json = (result.text ? (JSON.parse(result.text) as T) : null);
  } catch {
    json = null;
  }

  return { ...result, json };
}
