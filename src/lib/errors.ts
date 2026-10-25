/** Application error type and server-action plumbing. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(message: string, options: { status?: number; code?: string; fields?: Record<string, string> } = {}) {
    super(message);
    this.name = "AppError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "bad_request";
    this.fields = options.fields;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, { status: 403, code: "forbidden" });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, { status: 404, code: "not_found" });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, { status: 401, code: "unauthorized" });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Please wait and try again.") {
    super(message, { status: 429, code: "rate_limited" });
  }
}

export function isNextControlFlowError(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}
