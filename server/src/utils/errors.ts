export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function assertNoMongoOperators(value: unknown, path = "input"): void {
  if (Array.isArray(value)) {
    for (const v of value) assertNoMongoOperators(v, path);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith("$")) {
        throw new HttpError(400, "BAD_INPUT", `Disallowed operator in ${path}`);
      }
      assertNoMongoOperators(v, `${path}.${k}`);
    }
  }
}
