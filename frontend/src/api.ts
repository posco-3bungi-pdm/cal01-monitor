let csrfToken = "";

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function refreshCsrf(): Promise<void> {
  const response = await fetch("/api/csrf", { credentials: "same-origin" });
  if (!response.ok) throw new ApiError(response.status, "로그인 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  const data = await response.json();
  csrfToken = data.csrfToken;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const write = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (write && !csrfToken) await refreshCsrf();
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(write ? { "X-CSRFToken": csrfToken } : {}),
      ...options.headers,
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("json") ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 403 && path !== "/api/me") {
      const session = await fetch("/api/me", { credentials: "same-origin" });
      if (session.status === 401) throw new ApiError(401, "로그인이 만료됐습니다. 다시 로그인해 주세요.");
    }
    const firstField = payload && typeof payload === "object" ? Object.values(payload).find(value =>
      typeof value === "string" || (Array.isArray(value) && typeof value[0] === "string")) : undefined;
    const message = payload?.detail ?? payload?.error ?? payload?.message ?? (Array.isArray(firstField) ? firstField[0] : firstField);
    throw new ApiError(
      response.status,
      typeof message === "string" ? message : response.status === 401
        ? "로그인이 만료됐습니다. 다시 로그인해 주세요."
        : response.status === 409
          ? "다른 팀원이 위치를 먼저 수정했습니다. 최신 위치를 불러온 뒤 다시 수정해 주세요."
          : `요청을 처리하지 못했습니다. (${response.status})`,
      payload,
    );
  }
  return payload as T;
}

export function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return params.toString();
}
