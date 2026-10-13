import { dispatch } from "@vigil/api/routes";
import { loadDeployments } from "@vigil/sdk";
import { getAddress, isAddress } from "viem";
import { chainEvents } from "@/lib/chainEvents";

// Serves the services/api routes from contract reads when no VIGIL_API_URL is set.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const deployments = loadDeployments(10143);

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const url = new URL(request.url);
  const account = path[0] === "positions" && path[1] && isAddress(path[1]) ? getAddress(path[1]) : undefined;
  try {
    const events = await chainEvents(account);
    const result = dispatch(`/${path.join("/")}${url.search}`, events, deployments);
    return Response.json(result.body, {
      status: result.status,
      headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=30" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "chain read failed";
    return Response.json({ error: `Monad testnet read failed: ${message}` }, { status: 502 });
  }
}
