/** Safely parse JSON from fetch responses (Safari throws on empty bodies). */
// Default mirrors `response.json()` so existing call sites keep working without generics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional Response.json() parity
export async function readResponseJson<T = any>(response: Response): Promise<T> {
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
