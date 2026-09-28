import type { Job } from "./types";

export const SEARCH_POLICY = `
Find-only job research for an India-resident candidate with a four-year resume claim.
Target AI Engineer, Applied AI, AI Automation, LLM/RAG, Python/FastAPI and AI Product/Full-stack roles around 3-6 years.
Resume evidence available for scoring: Python, FastAPI/Flask, OpenAI/Anthropic APIs, LangChain/LangGraph, RAG, FAISS/Qdrant, React/Next.js/TypeScript, PostgreSQL, Docker, CI/CD, Cloudflare, WhatsApp/CRM automation, support/document search, voice AI, and an agentic freight project with synthetic evaluation. Do not claim Draft AI or Legal Firm experience, add overlapping freelance tenure, or portray synthetic evaluations as real-customer results.
Never apply, email, create accounts, upload a resume, or answer employer questions.
Only New means India eligibility and India/EU-compatible working hours are both evidenced by the job description.
Unknown eligibility/hours, US/North American coverage, closed roles, or no employer route must be Hold.
Scores are evidence-based fit scores, not hiring probabilities.
`;

export function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_|^(source|ref|trackingId)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString().replace(/\/$/, "");
}

export function validateJob(job: Job): void {
  if (!job.company || !job.role || !job.source) throw new Error("company, role, and source are required");
  canonicalUrl(job.url);
  if (job.score < 0 || job.score > 100) throw new Error("score must be 0-100");
  if (["Unknown", "Incompatible"].includes(job.timeZone) && job.status !== "Hold") {
    throw new Error("unknown or incompatible hours must remain Hold");
  }
  if (/^unknown/i.test(job.indiaEvidence) && job.status !== "Hold") {
    throw new Error("unknown India eligibility must remain Hold");
  }
}

export function dedupe(existing: Job[], incoming: Job): boolean {
  const url = canonicalUrl(incoming.url);
  return existing.some((job) => canonicalUrl(job.url) === url ||
    `${job.company}|${job.role}`.toLowerCase() === `${incoming.company}|${incoming.role}`.toLowerCase());
}
