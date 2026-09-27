import { createServer, type Server } from "node:http";
import { loadDeployments } from "@vigil/sdk";
import { dispatch, loadEventLog } from "./routes.js";
import type { LogEvent } from "@vigil/indexer";

export function createApiServer(events?: readonly LogEvent[]): Server {
  const deployments = loadDeployments(10143);
  const log = events ?? loadEventLog();
  return createServer((req, res) => {
    const result = dispatch(req.url ?? "/", log, deployments);
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
  });
}
