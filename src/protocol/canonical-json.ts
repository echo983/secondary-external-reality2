import {createHash} from "node:crypto";
import {ProtocolError} from "./errors.js";

type CanonicalValue = null | boolean | number | string | readonly CanonicalValue[] |
  {[key: string]: CanonicalValue};

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, character => character.codePointAt(0) as number);
  const b = Array.from(right, character => character.codePointAt(0) as number);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return (a[index] as number) - (b[index] as number);
  }
  return a.length - b.length;
}

function encode(value: unknown, path: string): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ProtocolError("INTERNAL_INVARIANT", `${path} contains a non-finite number`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map((item, index) => encode(item, `${path}[${index}]`)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareCodePoints);
    return `{${keys.map(key => {
      if (record[key] === undefined) throw new ProtocolError("INTERNAL_INVARIANT", `${path}.${key} is undefined`);
      return `${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`)}`;
    }).join(",")}}`;
  }
  throw new ProtocolError("INTERNAL_INVARIANT", `${path} is not canonical JSON`);
}

export function canonicalJson(value: CanonicalValue | unknown): string {
  return encode(value, "$root");
}

export function sha256Canonical(value: CanonicalValue | unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
