/** Safely parse JSON from fetch responses (Safari throws on empty bodies). */
export async function readResponseJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Ogiltigt JSON-svar från servern");
  }
}
