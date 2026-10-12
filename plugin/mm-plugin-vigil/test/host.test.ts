import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hostPluginEntry } from "../src/lib/host.js";

function fakeCli(): string {
  const root = mkdtempSync(path.join(tmpdir(), "vigil-host-"));
  const pkg = path.join(root, "node_modules", "@metamask", "agent-wallet");
  mkdirSync(path.join(pkg, "dist"), { recursive: true });
  writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "@metamask/agent-wallet",
      exports: { "./plugin": { import: "./dist/plugin.js" } },
    }),
  );
  writeFileSync(path.join(pkg, "dist", "index.js"), "");
  return pkg;
}

describe("hostPluginEntry", () => {
  it("resolves the plugin SDK of the CLI that is running", () => {
    const pkg = fakeCli();
    expect(hostPluginEntry(path.join(pkg, "dist", "index.js"))).toBe(
      path.join(pkg, "dist", "plugin.js"),
    );
  });

  it("finds the CLI package from a sibling bin path", () => {
    const pkg = fakeCli();
    const bin = path.join(pkg, "..", "..", "..", "mm.js");
    writeFileSync(bin, "");
    expect(hostPluginEntry(bin)).toBe(path.join(pkg, "dist", "plugin.js"));
  });

  it("returns null outside the CLI", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vigil-none-"));
    const file = path.join(dir, "run.js");
    writeFileSync(file, "");
    expect(hostPluginEntry(file)).toBeNull();
    expect(hostPluginEntry(path.join(dir, "missing.js"))).toBeNull();
  });
});
