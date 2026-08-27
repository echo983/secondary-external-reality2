import type {JsonScalar, SemanticAddress} from "../domain/types.js";
import {ProtocolError} from "./errors.js";

export interface CollapseRequest {
  address: SemanticAddress;
  blockingReason: string;
  requestedConstraintKind: "eq" | "neq" | "in" | "exists" | "range" | "relation";
  allowedDomain: readonly JsonScalar[];
  dependencySource: "world-rule" | "operation-contract" | "process";
  radius: "local" | "persistent" | "structural";
}

export interface CollapseRegistration {
  address: SemanticAddress;
  allowedDomain: readonly JsonScalar[];
  radius: "local";
}

export function authorizeCollapse(
  value: unknown,
  registrations: readonly CollapseRegistration[]
): CollapseRequest {
  if (typeof value !== "object" || value === null) throw new ProtocolError("COLLAPSE_NOT_AUTHORIZED", "invalid collapse request");
  const request = value as Record<string, unknown>;
  const allowedKeys = ["address", "blockingReason", "requestedConstraintKind", "allowedDomain", "dependencySource", "radius"];
  if (Object.keys(request).length !== allowedKeys.length || Object.keys(request).some(key => !allowedKeys.includes(key))) {
    throw new ProtocolError("COLLAPSE_NOT_AUTHORIZED", "Collapse request has unknown or missing fields");
  }
  if (!(["world-rule", "operation-contract", "process"] as const).includes(request.dependencySource as never)) {
    throw new ProtocolError("COLLAPSE_NOT_AUTHORIZED", "player claims cannot authorize Collapse");
  }
  if (request.radius !== "local" || typeof request.address !== "string" || !Array.isArray(request.allowedDomain) ||
      request.allowedDomain.length === 0 || request.allowedDomain.some(item => item !== null && !["string", "number", "boolean"].includes(typeof item)) ||
      typeof request.blockingReason !== "string" || !(["eq", "neq", "in", "exists", "range", "relation"] as const)
        .includes(request.requestedConstraintKind as never)) {
    throw new ProtocolError("COLLAPSE_NOT_AUTHORIZED", "Collapse is outside the local finite-domain policy");
  }
  const registration = registrations.find(item => item.address === request.address);
  if (registration === undefined || JSON.stringify(registration.allowedDomain) !== JSON.stringify(request.allowedDomain)) {
    throw new ProtocolError("COLLAPSE_NOT_AUTHORIZED", "address or domain is not registered");
  }
  return request as unknown as CollapseRequest;
}

export function collapseNeeded(blockingDependency: boolean): boolean {
  return blockingDependency;
}
