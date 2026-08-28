import {access} from "node:fs/promises";
import {resolve} from "node:path";
import {SqliteRuntimeStore} from "../src/storage/sqlite-runtime-store.js";

const databaseArgument = process.argv.find(argument => argument.startsWith("--db="));
if (databaseArgument === undefined || databaseArgument.slice("--db=".length).trim() === "") {
  throw new Error("usage: npm run export:session -- --db=/absolute/path/to/session.sqlite");
}
const filename = resolve(databaseArgument.slice("--db=".length));
await access(filename);
const store = new SqliteRuntimeStore(filename);
try { process.stdout.write(store.exportJsonl()); }
finally { store.close(); }
