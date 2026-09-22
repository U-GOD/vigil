import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitUp, WAD, MAX_CAP } from "../dist/closureMath.js";

const COUNT = 1024;
const cases = [];

function pick(seed, mod) {
  return seed % mod;
}

for (let i = 0; i < COUNT; i++) {
  const pClose = 1n + BigInt(i + 1) * 10n ** 16n;
  const pOpen = pick(BigInt(i) * 17n, 3n) === 0n ? 0n : pClose + BigInt((i % 21) - 10) * 10n ** 16n;
  const adjChoices = [WAD / 2n, WAD, (3n * WAD) / 2n, 2n * WAD];
  const adj = adjChoices[i % adjChoices.length];
  const kUp = i % 11 === 0 ? MAX_CAP : 10n ** 17n + BigInt(i % 9) * 10n ** 16n;
  const kDn = i % 13 === 0 ? 1n : 10n ** 17n + BigInt(i % 7) * 10n ** 16n;
  const sUp = splitUp(pClose, pOpen < 0n ? 0n : pOpen, adj, kUp, kDn);
  cases.push({
    pClose: pClose.toString(),
    pOpen: (pOpen < 0n ? 0n : pOpen).toString(),
    adj: adj.toString(),
    kUp: kUp.toString(),
    kDn: kDn.toString(),
    sUp: sUp.toString(),
  });
}

const out = join(dirname(fileURLToPath(import.meta.url)), "../test/vectors/splitUp.generated.json");
writeFileSync(out, `${JSON.stringify({ count: String(COUNT), cases }, null, 2)}\n`);
console.log(`wrote ${COUNT} vectors to ${out}`);
