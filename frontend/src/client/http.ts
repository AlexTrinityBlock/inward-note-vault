/**
 * The fetcher behind every generated hook.
 *
 * Orval's stock fetch client returns an error body as if it were successful
 * data, which leaves React Query's `isError` permanently false and pushes
 * `{"detail": ...}` objects into components that expect lists. This one throws
 * instead, so failures look like failures.
 */

/** A non-2xx API response, carrying the server's `detail` message. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function detailFrom(body: unknown): string | null {
  if (typeof body === "string" && body.trim() !== "") {
    return body;
  }
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      // FastAPI validation errors arrive as a list of {loc, msg, type}.
      const messages = detail
        .map((entry) => (entry as { msg?: string }).msg)
        .filter((message): message is string => Boolean(message));
      if (messages.length > 0) {
        return messages.join("; ");
      }
    }
  }
  return null;
}

export const apiFetch = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const text = [204, 205, 304].includes(response.status) ? "" : await response.text();

  let body: unknown = null;
  if (text !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      detailFrom(body) ?? `Request failed with status ${response.status}`,
    );
  }

  return body as T;
};
