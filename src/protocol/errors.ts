export const protocolErrorCodes = [
  "INPUT_INVALID",
  "INPUT_AMBIGUOUS",
  "TARGET_UNGROUNDED",
  "TARGET_NOT_PERCEIVABLE",
  "CAPABILITY_UNSUPPORTED",
  "WORLD_BOUNDARY",
  "PRECONDITION_FAILED",
  "COLLAPSE_NOT_AUTHORIZED",
  "COLLAPSE_AMBIGUOUS",
  "MODEL_TIMEOUT",
  "MODEL_NO_CONTENT",
  "MODEL_INVALID_SCHEMA",
  "MODEL_CAPACITY",
  "REVISION_CONFLICT",
  "REPLAY_INVALID",
  "INTERNAL_INVARIANT"
] as const;

export type ProtocolErrorCode = (typeof protocolErrorCodes)[number];

export class ProtocolError extends Error {
  constructor(
    readonly code: ProtocolErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ProtocolError";
  }
}
