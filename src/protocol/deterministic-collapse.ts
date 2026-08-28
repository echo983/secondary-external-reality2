import type {CanonicalConstraint, CollapseRecord, TruthCell, TruthCellChange, WorldBasis} from "../domain/types.js";
import {sha256Canonical} from "./canonical-json.js";
import {authorizeCollapse, type CollapseRegistration, type CollapseRequest} from "./collapse-policy.js";
import {ProtocolError} from "./errors.js";

export interface CollapseResolution {
  constraint: CanonicalConstraint;
  change: TruthCellChange;
  record: CollapseRecord;
}

export function resolveCollapse(worldBasis: WorldBasis, cell: TruthCell, rawRequest: CollapseRequest,
  registrations: readonly CollapseRegistration[], height: number, resolverVersion = "det-v1"): CollapseResolution {
  const request = authorizeCollapse(rawRequest, registrations);
  if (request.address !== cell.address || !Array.isArray(cell.domain) || cell.resolvedValue !== undefined ||
      JSON.stringify(request.allowedDomain) !== JSON.stringify(cell.domain)) {
    throw new ProtocolError("COLLAPSE_NOT_AUTHORIZED", "truth cell does not match the authorized unresolved domain");
  }
  const digest = sha256Canonical({worldBasis, address: cell.address, revision: cell.revision, resolverVersion});
  const value = cell.domain[Number.parseInt(digest.slice(0, 8), 16) % cell.domain.length];
  if (value === undefined) throw new ProtocolError("INTERNAL_INVARIANT", "authorized collapse domain is unexpectedly empty");
  const constraint: CanonicalConstraint = {constraintId: `collapse:${height}:${cell.address}`, kind: "eq",
    operands: [value], canonicalHeight: height, sourceRef: `collapse:${height}`};
  const next: TruthCell = {...cell, constraints: [...cell.constraints, constraint], resolvedValue: value,
    revision: cell.revision + 1};
  return {constraint, change: {address: cell.address, expectedRevision: cell.revision, next},
    record: {address: cell.address, priorRevision: cell.revision, resultingRevision: next.revision,
      constraintId: constraint.constraintId, resolverVersion, blockingReason: request.blockingReason, radius: "local"}};
}
