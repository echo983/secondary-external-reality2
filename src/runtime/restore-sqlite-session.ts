import type {ProposalModel} from "../ai/model-adapter.js";
import {SqliteRuntimeStore} from "../storage/sqlite-runtime-store.js";
import type {DemoFixture} from "../world/demo-fixture.js";
import {materializeDoorExperience} from "../world/open-door.js";
import {replayStrict} from "../world/replay.js";
import {materializeWaitExperience} from "../world/wait-kettle.js";
import {ProtocolError} from "../protocol/errors.js";
import {RuntimeSession} from "./runtime-session.js";
import {materializeActivePerceptionExperience} from "../world/active-perception.js";
import {materializePrimitiveExperience} from "../world/primitive-world.js";

export async function restoreSqliteSession(options: {
  filename: string;
  sessionId: string;
  actorId: string;
  fixture: DemoFixture;
  model: ProposalModel;
  now?: () => Date;
}): Promise<{session: RuntimeSession; store: SqliteRuntimeStore}> {
  const store = new SqliteRuntimeStore(options.filename);
  try {
    const commits = store.readWorld(1);
    const snapshot = replayStrict(options.fixture.genesis, commits);
    const experiencePort = store.experiencePort();
    for (const commit of store.pending(options.actorId)) {
      if (commit.delta.events.some(event => event.kind === "door_opened")) {
        await materializeDoorExperience(commit, experiencePort, options.now?.().toISOString());
      } else if (commit.delta.events.some(event => event.kind === "active_perception")) {
        await materializeActivePerceptionExperience(commit, experiencePort, options.now?.().toISOString());
      } else if (commit.delta.events.some(event => ["object_held", "object_released", "object_placed", "actor_moved", "actor_oriented", "speech"].includes(event.kind))) {
        await materializePrimitiveExperience(commit, experiencePort, options.now?.().toISOString());
      } else if (commit.delta.events.some(event => ["kettle_whistle", "danger_interrupt", "wait_elapsed"].includes(event.kind))) {
        await materializeWaitExperience(commit, experiencePort, options.now?.().toISOString());
      } else {
        throw new ProtocolError("REPLAY_INVALID", `no deterministic experience projector for height ${commit.height}`);
      }
    }
    const session = new RuntimeSession({sessionId: options.sessionId, actorId: options.actorId,
      fixture: options.fixture, model: options.model, worldStore: store.worldPort(), experienceStore: experiencePort,
      auditStore: store.auditPort(), initialSnapshot: snapshot, ...(options.now === undefined ? {} : {now: options.now})});
    return {session, store};
  } catch (error) {
    store.close();
    throw error;
  }
}
