/**
 * Server-side Basiq client. Uses BASIQ_API_KEY (never exposed to the browser).
 * Only imported by server route handlers under /api/basiq.
 * Docs: https://api.basiq.io/reference
 */
const BASE = "https://au-api.basiq.io";
const VERSION = "3.0";

export function basiqConfigured() {
  return Boolean(process.env.BASIQ_API_KEY);
}

function apiKey(): string {
  const key = process.env.BASIQ_API_KEY;
  if (!key) throw new Error("BASIQ_API_KEY is not configured");
  return key;
}

type TokenScope = "SERVER_ACCESS" | "CLIENT_ACCESS";

/** Exchange the API key for a bearer token. CLIENT_ACCESS is scoped to a userId. */
async function getToken(scope: TokenScope, userId?: string): Promise<string> {
  const body = new URLSearchParams({ scope });
  if (userId) body.set("userId", userId);

  const res = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${apiKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "basiq-version": VERSION,
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Basiq token (${scope}) failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken("SERVER_ACCESS");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "basiq-version": VERSION,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Basiq ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** Create a Basiq user. Basiq requires at least an email or mobile. */
export async function createBasiqUser(input: {
  email: string;
  mobile?: string;
}): Promise<string> {
  const body: Record<string, string> = { email: input.email };
  if (input.mobile) body.mobile = input.mobile;
  const json = await serverFetch<{ id: string }>("/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return json.id;
}

/** Returns true if the Basiq user still exists under the current app key. */
export async function basiqUserExists(basiqUserId: string): Promise<boolean> {
  const token = await getToken("SERVER_ACCESS");
  const res = await fetch(`${BASE}/users/${basiqUserId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "basiq-version": VERSION,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  return res.ok;
}

/** A short-lived CLIENT_ACCESS token used by the hosted consent UI. */
export async function getClientToken(basiqUserId: string): Promise<string> {
  return getToken("CLIENT_ACCESS", basiqUserId);
}

/** The hosted consent URL the user is sent to in order to link a bank. */
export function consentUrl(clientToken: string): string {
  const u = new URL("https://consent.basiq.io/home");
  u.searchParams.set("token", clientToken);
  u.searchParams.set("action", "connect");
  return u.toString();
}

export type BasiqAccount = {
  id: string;
  name: string;
  accountNo?: string;
  class?: { type?: string; product?: string };
  institution?: string;
  balance?: string;
  currency?: string;
};

export type BasiqTransaction = {
  id: string;
  account: string; // basiq account id
  amount: string; // signed string, e.g. "-25.00"
  description?: string;
  postDate?: string; // ISO
  transactionDate?: string; // ISO
  direction?: "debit" | "credit";
  status?: string;
};

export async function fetchAccounts(basiqUserId: string): Promise<BasiqAccount[]> {
  const json = await serverFetch<{ data: BasiqAccount[] }>(
    `/users/${basiqUserId}/accounts`,
  );
  return json.data ?? [];
}

/** Fetches transactions, following pagination via the `next` link. */
export async function fetchTransactions(
  basiqUserId: string,
  limit = 500,
): Promise<BasiqTransaction[]> {
  const out: BasiqTransaction[] = [];
  let path: string | null = `/users/${basiqUserId}/transactions?limit=${limit}`;
  let guard = 0;
  while (path && guard < 50) {
    const json: { data: BasiqTransaction[]; links?: { next?: string } } =
      await serverFetch(path);
    out.push(...(json.data ?? []));
    const next = json.links?.next;
    path = next ? next.replace(BASE, "") : null;
    guard += 1;
  }
  return out;
}
