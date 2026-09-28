import { getAgentByName } from "agents";
import { JobScoutAgent } from "./job-scout-agent";
import type { Env } from "./types";

export { JobScoutAgent };

function authorized(request: Request, env: Env): boolean {
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "job-scout-agent" });
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!authorized(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
    const agent = await getAgentByName<Env, JobScoutAgent>(env.JOB_SCOUT as unknown as DurableObjectNamespace<JobScoutAgent>, "primary");
    return agent.fetch(request);
  }
};
