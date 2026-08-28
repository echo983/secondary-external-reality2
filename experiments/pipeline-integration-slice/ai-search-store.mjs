// Real Cloudflare AI Search-backed replacement for world.mjs's in-memory store, same
// interface (nextHeight/currentHeight/retrieve/append/all) so pipeline.mjs doesn't
// need structural changes -- only retrieve()'s signature grows an optional query-text
// argument, since real semantic search needs a query string, not just entity names.
//
// Design decisions carried over from validated experiments, not re-litigated here:
// - One file per write (matches semantic-intent-spike... no, matches
//   ai-search-retrieval-spike's Mode A convention) is used for COLLAPSE/attempt-outcome
//   writes in THIS slice, because pipeline.mjs already assigns a fresh Height to every
//   single store.append() call -- batching multiple writes into one Height/file (Mode
//   B, confirmed equivalent in ai-search-retrieval-spike round 2) would require
//   read-modify-write on an existing item, which is a separate, later refinement to
//   how the real system batches commits into Heights, not something this integration
//   test needs to solve to validate the AI Search wiring itself.
// - Genesis is uploaded and awaited (indexed) before the pipeline starts processing
//   Attempts, since it must be available from turn 1. Mid-session COLLAPSE/attempt-
//   outcome writes are deliberately NOT awaited before the next retrieve -- that
//   latency gap is exactly the thing this integration test exists to observe, not
//   something to paper over.

import {uploadItem, deleteAllItems, waitUntilIndexed, search} from "../ai-search-retrieval-spike/client.mjs";

const HEIGHT_TAG = /\/h(\d+)-/;

function parseHeightFromKey(key) {
  const match = HEIGHT_TAG.exec(key ?? "");
  return match ? Number(match[1]) : null;
}

export async function createAiSearchStore() {
  await deleteAllItems();
  let height = -1; // first nextHeight() call returns 0, matching world.mjs
  const mirror = []; // local record of what we wrote, for reporting only -- not the source of truth

  return {
    nextHeight() { height += 1; return height; },
    currentHeight() { return height; },

    async retrieve(entityNames, queryText) {
      const query = queryText && queryText.trim() !== "" ? queryText : `关于 ${entityNames.join("、")} 的已知信息`;
      const chunks = await search(query);
      return chunks.map(c => ({
        text: c.text, height: parseHeightFromKey(c.item?.key), score: c.score, key: c.item?.key
      })).filter(p => p.height !== null)
        .sort((a, b) => a.height - b.height); // present in Height order, matching world.mjs's array order
    },

    async append(text, entities, atHeight, source) {
      const primaryEntity = entities[0] ?? "misc";
      const key = `props/${primaryEntity}/h${atHeight}-${source}-${Date.now()}.txt`;
      await uploadItem(key, text);
      const record = {text, entities, height: atHeight, status: "active", source, key};
      mirror.push(record);
      return record;
    },

    async seedGenesis(propositions) {
      for (const p of propositions) {
        const primaryEntity = p.entities[0] ?? "misc";
        const key = `props/${primaryEntity}/h${p.height}-genesis-${mirror.length}.txt`;
        await uploadItem(key, p.text);
        mirror.push({text: p.text, entities: p.entities, height: p.height, status: "active", source: "genesis", key});
        if (p.height > height) height = p.height;
      }
      await waitUntilIndexed(propositions.length, {timeoutMs: 180_000});
    },

    all() { return mirror.slice(); }
  };
}
