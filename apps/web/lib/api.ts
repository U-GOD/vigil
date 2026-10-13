const UNREACHABLE = "The Vigil API is not reachable. Start it with `pnpm --filter @vigil/api start`.";

export async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/vigil-api${path}`);
  } catch {
    throw new Error(UNREACHABLE);
  }
  // A dead API comes back from the rewrite proxy as a plain-text 500, not JSON.
  let body: T & { error?: string };
  try {
    body = (await response.json()) as T & { error?: string };
  } catch {
    throw new Error(response.status >= 500 ? UNREACHABLE : `The API returned ${response.status}.`);
  }
  if (!response.ok) {
    throw new Error(body.error ?? `${response.status}`);
  }
  return body;
}
