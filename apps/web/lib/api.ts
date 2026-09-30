export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/vigil-api${path}`);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `${response.status}`);
  }
  return body;
}
