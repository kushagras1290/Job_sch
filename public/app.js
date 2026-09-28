const state = { secret: "", jobs: [], filter: "all" };
const $ = (selector) => document.querySelector(selector);
const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { ...(options.headers || {}), authorization: `Bearer ${state.secret}` } });
  if (!response.ok) throw new Error(response.status === 401 ? "The API secret was not accepted." : `Request failed (${response.status}).`);
  return response;
};

function date(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not run yet"; }
function setMessage(message, connected = false) {
  $("#connection-state").textContent = message;
  $(".pulse").classList.toggle("connected", connected);
}
function render() {
  const jobs = state.filter === "all" ? state.jobs : state.jobs.filter((job) => job.status === state.filter);
  $("#tracked-count").textContent = state.jobs.length;
  $("#new-count").textContent = state.jobs.filter((job) => job.status === "New").length;
  $("#hold-count").textContent = state.jobs.filter((job) => job.status === "Hold").length;
  const root = $("#jobs"); root.replaceChildren();
  $("#empty-message").hidden = jobs.length > 0;
  $("#empty-message").textContent = state.jobs.length ? "No records match this filter." : "No roles have been stored yet. Run the scout when the provider keys are configured.";
  for (const job of jobs) {
    const card = $("#job-template").content.cloneNode(true);
    card.querySelector(".status").textContent = job.status === "New" ? "Actionable" : "Hold";
    card.querySelector(".status").classList.add(job.status.toLowerCase());
    card.querySelector(".score").textContent = `${job.score}/100 fit`;
    card.querySelector("h3").textContent = job.role;
    card.querySelector(".company").textContent = job.company;
    card.querySelector(".evidence").textContent = job.status === "New" ? job.indiaEvidence : job.gaps.join(" · ");
    for (const tag of [job.timeZone, ...job.matchedSkills.slice(0, 2)]) { const el = document.createElement("span"); el.textContent = tag; card.querySelector(".tags").append(el); }
    const link = card.querySelector("a"); link.href = job.url;
    card.querySelector("time").textContent = `Verified ${date(job.lastVerifiedAt)}`;
    root.append(card);
  }
}
async function load() {
  const [statusResponse, jobsResponse] = await Promise.all([api("/api/status"), api("/api/jobs")]);
  const status = await statusResponse.json(); state.jobs = await jobsResponse.json();
  $("#last-run").textContent = status.lastRunAt ? date(status.lastRunAt) : "Not run";
  $("#schedule-text").textContent = `Durable schedule: 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 IST. ${status.lastRunMessage || "Ready for its first run."}`;
  $("#run-now").disabled = false; $("#export").disabled = false;
  setMessage("Private tracker connected", true); render();
}
$("#auth-form").addEventListener("submit", async (event) => { event.preventDefault(); state.secret = $("#secret").value; setMessage("Connecting…"); try { await load(); } catch (error) { setMessage(error.message); } });
$("#run-now").addEventListener("click", async () => { const button = $("#run-now"); button.disabled = true; button.textContent = "Researching…"; try { const result = await (await api("/api/run", { method: "POST" })).json(); setMessage(result.message, true); await load(); } catch (error) { setMessage(error.message); } finally { button.disabled = false; button.innerHTML = 'Run search now <span aria-hidden="true">→</span>'; } });
$("#export").addEventListener("click", async () => { try { const response = await api("/api/export.csv"); const blob = await response.blob(); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "job-scout-export.csv"; anchor.click(); URL.revokeObjectURL(anchor.href); } catch (error) { setMessage(error.message); } });
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button)); render(); }));
