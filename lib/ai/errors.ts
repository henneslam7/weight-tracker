export type AiErrorCode = "config" | "rate" | "blocked" | "upstream" | "parse" | "image";

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}
