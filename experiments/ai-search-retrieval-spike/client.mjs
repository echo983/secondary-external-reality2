import {readFile} from "node:fs/promises";

const ACCOUNT_ID = "00f6c85f82f6297c8c0bef9460e013d9";
const INSTANCE = "sr2-truth-store";
const token = (await readFile(new URL("../../secret/cftoken.txt", import.meta.url), "utf8")).trim();

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-search/instances/${INSTANCE}`;
const headers = {Authorization: `Bearer ${token}`};

export async function uploadItem(key, text) {
  const form = new FormData();
  form.append("file", new Blob([text], {type: "text/plain"}), key);
  const res = await fetch(`${BASE}/items`, {method: "POST", headers, body: form});
  const body = await res.json();
  if (!body.success) throw new Error(`upload ${key} failed: ${JSON.stringify(body.errors)}`);
  return body.result;
}

export async function listItems() {
  const res = await fetch(`${BASE}/items?per_page=50`, {headers});
  const body = await res.json();
  if (!body.success) throw new Error(`list failed: ${JSON.stringify(body.errors)}`);
  return body.result;
}

export async function deleteItem(id) {
  const res = await fetch(`${BASE}/items/${id}`, {method: "DELETE", headers});
  const body = await res.json();
  if (!body.success) throw new Error(`delete ${id} failed: ${JSON.stringify(body.errors)}`);
  return body.result;
}

export async function deleteAllItems() {
  const items = await listItems();
  for (const item of items) await deleteItem(item.id);
  return items.length;
}

export async function waitUntilIndexed(expectedCount, {timeoutMs = 300_000, pollMs = 5_000} = {}) {
  const started = Date.now();
  for (;;) {
    const items = await listItems();
    const done = items.filter(i => i.status === "completed" || i.status === "error").length;
    if (items.length >= expectedCount && done >= expectedCount) return items;
    if (Date.now() - started > timeoutMs) return items; // give up waiting, report whatever state we have
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}

export async function search(query) {
  const res = await fetch(`${BASE}/search`, {
    method: "POST", headers: {...headers, "Content-Type": "application/json"},
    body: JSON.stringify({query})
  });
  const body = await res.json();
  if (!body.success) throw new Error(`search "${query}" failed: ${JSON.stringify(body.errors)}`);
  return body.result.chunks;
}
