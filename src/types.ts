export type Eligibility = "New" | "Hold";

export type Job = {
  id: string;
  company: string;
  role: string;
  url: string;
  source: string;
  discoveredAt: string;
  lastVerifiedAt: string;
  remoteScope: string;
  indiaEvidence: string;
  hoursEvidence: string;
  timeZone: "India compatible" | "EU compatible" | "Unknown" | "Incompatible";
  requiredExperience: string;
  matchedSkills: string[];
  gaps: string[];
  score: number;
  scoreRationale: string;
  status: Eligibility;
  notes: string;
};

export type AgentState = {
  jobs: Job[];
  lastRunAt?: string;
  lastRunMessage?: string;
};

export type Env = {
  JOB_SCOUT: DurableObjectNamespace;
  CRON_SECRET: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  TAVILY_API_KEY?: string;
};
