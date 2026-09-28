import { Agent } from "agents";
import { canonicalUrl, dedupe, SEARCH_POLICY, validateJob } from "./policy";
import type { AgentState, Env, Job } from "./types";

const QUERIES = [
  'remote India "AI Engineer" Python LLM 3 years',
  'remote India "Applied AI" FastAPI RAG',
  'remote India "AI Automation" Python agentic'
];
const INDIA_HOURS_CRON_UTC = "30 18,21,0,3,6,9,12,15 * * *";

type SearchResult = { title?: string; url?: string; content?: string; raw_content?: string };

export class JobScoutAgent extends Agent<Env, AgentState> {
  initialState: AgentState = { jobs: [] };

  async onStart(): Promise<void> {
    await this.schedule(INDIA_HOURS_CRON_UTC, "runScheduledSearch", {});
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/jobs") return Response.json(this.state.jobs);
    if (request.method === "GET" && url.pathname === "/api/status") return Response.json({
      nextScheduleUtc: INDIA_HOURS_CRON_UTC,
      lastRunAt: this.state.lastRunAt,
      lastRunMessage: this.state.lastRunMessage,
      trackedJobs: this.state.jobs.length,
      policy: "find-only; no applications, contact, uploads, or account creation"
    });
    if (request.method === "GET" && url.pathname === "/api/export.csv") return this.exportCsv();
    if (request.method === "POST" && url.pathname === "/api/run") return Response.json(await this.runSearch("manual"));
    if (request.method === "POST" && url.pathname === "/api/jobs") return this.addJob(request);
    return Response.json({ error: "not found" }, { status: 404 });
  }

  async runScheduledSearch(): Promise<void> {
    await this.runSearch("schedule");
  }

  private async runSearch(trigger: "manual" | "schedule"): Promise<{ added: number; reviewed: number; message: string }> {
    if (!this.env.TAVILY_API_KEY || !this.env.OPENAI_API_KEY) {
      const message = "Skipped: TAVILY_API_KEY and OPENAI_API_KEY are required for cloud discovery.";
      this.setState({ ...this.state, lastRunAt: new Date().toISOString(), lastRunMessage: message });
      return { added: 0, reviewed: 0, message };
    }
    const results = (await Promise.all(QUERIES.map((query) => this.search(query)))).flat();
    let added = 0;
    for (const result of results) {
      if (!result.url || dedupe(this.state.jobs, { ...this.placeholder(result), url: result.url })) continue;
      const job = await this.assess(result);
      if (!job || dedupe(this.state.jobs, job)) continue;
      validateJob(job);
      this.setState({ ...this.state, jobs: [...this.state.jobs, job] });
      added += 1;
    }
    const message = `${trigger} run reviewed ${results.length} search results and added ${added} non-duplicate records.`;
    this.setState({ ...this.state, lastRunAt: new Date().toISOString(), lastRunMessage: message });
    return { added, reviewed: results.length, message };
  }

  private async search(query: string): Promise<SearchResult[]> {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: this.env.TAVILY_API_KEY, query, search_depth: "advanced", max_results: 5, include_raw_content: true })
    });
    if (!response.ok) throw new Error(`Tavily search failed: ${response.status}`);
    const body = await response.json() as { results?: SearchResult[] };
    return body.results ?? [];
  }

  private async assess(result: SearchResult): Promise<Job | undefined> {
    const text = (result.raw_content || result.content || "").slice(0, 16000);
    if (!text || !result.url) return undefined;
    const schema = {
      type: "object", additionalProperties: false,
      required: ["company", "role", "remoteScope", "indiaEvidence", "hoursEvidence", "timeZone", "requiredExperience", "matchedSkills", "gaps", "score", "scoreRationale", "status", "notes"],
      properties: {
        company: { type: "string" }, role: { type: "string" }, remoteScope: { type: "string" }, indiaEvidence: { type: "string" }, hoursEvidence: { type: "string" },
        timeZone: { type: "string", enum: ["India compatible", "EU compatible", "Unknown", "Incompatible"] }, requiredExperience: { type: "string" },
        matchedSkills: { type: "array", items: { type: "string" } }, gaps: { type: "array", items: { type: "string" } }, score: { type: "number" }, scoreRationale: { type: "string" },
        status: { type: "string", enum: ["New", "Hold"] }, notes: { type: "string" }
      }
    };
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: this.env.OPENAI_MODEL || "gpt-4.1-mini", input: `${SEARCH_POLICY}\n\nAssess this listing. Use only text supplied. If India eligibility, compatible hours, open status, or an employer route is not explicit, return Hold.\nURL: ${result.url}\nTITLE: ${result.title || ""}\nLISTING TEXT:\n${text}`, text: { format: { type: "json_schema", name: "job_assessment", strict: true, schema } } })
    });
    if (!response.ok) throw new Error(`OpenAI assessment failed: ${response.status}`);
    const body = await response.json() as { output_text?: string };
    const assessed = JSON.parse(body.output_text || "{}") as Omit<Job, "id" | "url" | "source" | "discoveredAt" | "lastVerifiedAt">;
    const now = new Date().toISOString();
    return { ...assessed, id: crypto.randomUUID(), url: canonicalUrl(result.url), source: "Tavily discovery; LLM assessment requires human review", discoveredAt: now, lastVerifiedAt: now };
  }

  private placeholder(result: SearchResult): Job {
    return { id: "placeholder", company: result.title || "unknown", role: result.title || "unknown", url: result.url || "https://example.invalid", source: "discovery", discoveredAt: "", lastVerifiedAt: "", remoteScope: "", indiaEvidence: "Unknown", hoursEvidence: "", timeZone: "Unknown", requiredExperience: "", matchedSkills: [], gaps: [], score: 0, scoreRationale: "", status: "Hold", notes: "" };
  }

  private async addJob(request: Request): Promise<Response> {
    const candidate = await request.json() as Job;
    candidate.url = canonicalUrl(candidate.url);
    validateJob(candidate);
    if (dedupe(this.state.jobs, candidate)) return Response.json({ error: "duplicate" }, { status: 409 });
    this.setState({ ...this.state, jobs: [...this.state.jobs, candidate] });
    return Response.json(candidate, { status: 201 });
  }

  private exportCsv(): Response {
    const fields = ["company", "role", "url", "source", "status", "score", "timeZone", "indiaEvidence", "hoursEvidence", "lastVerifiedAt"] as const;
    const esc = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [fields.join(","), ...this.state.jobs.map((job) => fields.map((field) => esc(job[field])).join(","))].join("\n");
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=job-scout-export.csv" } });
  }
}
