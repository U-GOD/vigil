import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type * as PluginSdk from "@metamask/agent-wallet/plugin";

const PACKAGE = "@metamask/agent-wallet";

// The CLI checks `instanceof PluginCommand` against its own module instance.
// A linked plugin resolves imports from the repo path, which finds a second
// copy, so the class and the check never match. Load the SDK from the package
// that is running this process instead.
export function hostPluginEntry(entry: string | undefined = process.argv[1]): string | null {
  if (!entry) return null;
  let dir: string;
  try {
    dir = path.dirname(realpathSync(entry));
  } catch {
    return null;
  }
  for (;;) {
    for (const root of [dir, path.join(dir, "node_modules", ...PACKAGE.split("/"))]) {
      const target = pluginTarget(root);
      if (target) return target;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function pluginTarget(root: string): string | null {
  const file = path.join(root, "package.json");
  if (!existsSync(file)) return null;
  let manifest: { name?: string; exports?: Record<string, { import?: string }> };
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (manifest.name !== PACKAGE) return null;
  const target = manifest.exports?.["./plugin"]?.import;
  if (!target) return null;
  return path.join(root, target);
}

const entry = hostPluginEntry();
const sdk: typeof PluginSdk = entry
  ? await import(pathToFileURL(entry).href)
  : await import("@metamask/agent-wallet/plugin");

export const PluginCommand: typeof PluginSdk.PluginCommand = sdk.PluginCommand;
export const schemaToArgs: typeof PluginSdk.schemaToArgs = sdk.schemaToArgs;
export const schemaToFlags: typeof PluginSdk.schemaToFlags = sdk.schemaToFlags;
export const InputFieldType: typeof PluginSdk.InputFieldType = sdk.InputFieldType;
