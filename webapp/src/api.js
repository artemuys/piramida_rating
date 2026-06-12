import { getInitData } from "./telegram.js";

export class ApiError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const TIMEOUT_MS = 12000;

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  const initData = getInitData();
  if (initData) headers["x-telegram-init-data"] = initData;
  else if (import.meta.env.DEV) headers["x-dev-tg-id"] = localStorage.getItem("devTgId") || "1";
  if (body !== undefined) headers["content-type"] = "application/json";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError("network", 0);
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* пустое тело */
  }

  if (!res.ok) {
    throw new ApiError(data?.error || (res.status >= 500 ? "internal" : "validation"), res.status);
  }
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body = {}) => request(p, { method: "POST", body }),
  patch: (p, body) => request(p, { method: "PATCH", body }),
  del: (p) => request(p, { method: "DELETE" }),
};
