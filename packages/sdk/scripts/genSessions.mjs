import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSessions } from "./sessions.mjs";

const sessions = buildSessions();
const out = join(dirname(fileURLToPath(import.meta.url)), "../../../contracts/script/data/xnys-sessions.json");
writeFileSync(out, `${JSON.stringify({ count: sessions.length, sessions }, null, 2)}\n`);
console.log(`wrote ${sessions.length} sessions to ${out}`);
