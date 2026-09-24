/** Convert a positive USD price into a WAD integer. Eight decimal digits are kept. */
export function usdToWad(usd: number): bigint {
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error("invalid price");
  }
  const text = usd.toFixed(8);
  const [whole, frac = ""] = text.split(".");
  const digits = `${whole}${frac.slice(0, 8).padEnd(8, "0")}`;
  return BigInt(digits) * 10n ** 10n;
}

export function sessionDate(sessionId: number): string {
  const text = String(sessionId);
  if (!/^\d{8}$/.test(text)) throw new Error(`bad session id ${sessionId}`);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

export async function readJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }
  return response.json() as Promise<unknown>;
}
