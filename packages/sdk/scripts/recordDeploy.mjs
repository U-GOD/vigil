import { readFileSync, writeFileSync } from "node:fs";
import { applyBroadcast, loadDeployments } from "../dist/index.js";

const file = process.argv[2];
if (!file) {
  process.stderr.write("pass the forge broadcast json\n");
  process.exit(1);
}
const broadcast = JSON.parse(readFileSync(file, "utf8"));
const next = applyBroadcast(loadDeployments(10143), broadcast);
const target = new URL("../src/deployments/10143.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`);
process.stdout.write(`recorded start block ${next.startBlock}\n`);
