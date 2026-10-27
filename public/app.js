const state = {
  meetings: [],
  summary: {},
  duplicateCandidates: [],
  filter: "all",
  search: "",
  sort: "date-asc",
  openId: null,
};

const elements = {
  rows: document.querySelector("#meeting-rows"),
  empty: document.querySelector("#empty-state"),
  search: document.querySelector("#search-input"),
  sort: document.querySelector("#sort-select"),
  resultCount: document.querySelector("#results-count"),
  toast: document.querySelector("#toast"),
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function preferredRecord(meeting) {
  return meeting.sources.crm?.record ?? meeting.sources.calendar?.record ?? {};
}

function displayTitle(meeting) {
  const record = preferredRecord(meeting);
  return record.subject ?? record.title ?? "Untitled meeting";
}

function displayClient(meeting) {
  const crm = meeting.sources.crm?.record;
  if (crm?.client_name && crm?.client_company) return `${crm.client_name} · ${crm.client_company}`;
  if (crm?.client_name) return crm.client_name;
  if (crm?.client_company) return crm.client_company;
  if (crm?.meeting_type === "Internal") return "Internal meeting";
  const calendar = meeting.sources.calendar?.record;
  const externalAttendee = calendar?.attendees?.find((attendee) => attendee.includes("@") && !attendee.endsWith("@firma.com"));
  return externalAttendee?.split("@")[0].replace(/[._]/g, " ") ?? "No client linked";
}

function normalizedDate(meeting) {
  const crm = meeting.sources.crm?.record;
  const calendar = meeting.sources.calendar?.record;
  return crm?.meeting_date?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0]
    ?? (crm?.meeting_date?.match(/^(\d{1,2})-(\d{1,2})\/(\d{4})$/)
      ? (() => {
          const [, month, day, year] = crm.meeting_date.match(/^(\d{1,2})-(\d{1,2})\/(\d{4})$/);
          return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        })()
      : null)
    ?? calendar?.start_time?.slice(0, 10)
    ?? "9999-99-99";
}

function formatDate(value) {
  if (!value || value.startsWith("9999")) return "Date unavailable";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTime(meeting) {
  const crmTime = meeting.sources.crm?.record?.meeting_time;
  const calendarTime = meeting.sources.calendar?.record?.start_time;
  if (crmTime && calendarTime) {
    const calendarClock = calendarTime.slice(11, 16);
    if (crmTime !== calendarClock) return `CRM ${crmTime} · Cal ${calendarClock}${calendarTime.endsWith("Z") ? " UTC" : ""}`;
    return crmTime;
  }
  if (crmTime) return `${crmTime} · CRM`;
  if (calendarTime) return `${calendarTime.slice(11, 16)}${calendarTime.endsWith("Z") ? " UTC" : ""} · Calendar`;
  return "Time unavailable";
}

function needsReview(meeting) {
  return Object.keys(meeting.conflicts).length > 0 || meeting.warnings.length > 0;
}

function searchText(meeting) {
  const records = Object.values(meeting.sources).map((source) => JSON.stringify(source.record));
  return `${displayTitle(meeting)} ${displayClient(meeting)} ${records.join(" ")}`.toLowerCase();
}

function visibleMeetings() {
  return state.meetings
    .filter((meeting) => {
      if (state.filter === "matched" && meeting.matchStatus !== "matched") return false;
      if (state.filter === "source-only" && meeting.matchStatus !== "source-only") return false;
      if (state.filter === "review" && !needsReview(meeting)) return false;
      return !state.search || searchText(meeting).includes(state.search);
    })
    .sort((left, right) => {
      if (state.sort === "title") return displayTitle(left).localeCompare(displayTitle(right));
      const direction = state.sort === "date-desc" ? -1 : 1;
      return normalizedDate(left).localeCompare(normalizedDate(right)) * direction;
    });
}

function statusMarkup(meeting) {
  if (needsReview(meeting)) {
    const count = Object.keys(meeting.conflicts).length + meeting.warnings.length;
    return `<span class="state-badge needs-review">Review ${count}</span>`;
  }
  if (meeting.matchStatus === "source-only") return '<span class="state-badge source-only">Source only</span>';
  return '<span class="state-badge">Reconciled</span>';
}

function sourceMarkup(meeting) {
  const pills = [];
  if (meeting.sources.crm) pills.push('<span class="source-pill">CRM</span>');
  if (meeting.sources.calendar) pills.push('<span class="source-pill calendar">CAL</span>');
  return `<div class="source-pills">${pills.join("")}</div>`;
}

function sourceFields(meeting) {
  return Object.entries(meeting.sources).map(([name, source]) => {
    const record = source.record;
    const pairs = name === "crm"
      ? [
          ["Subject", record.subject], ["Client", record.client_name], ["Company", record.client_company],
          ["Owner", record.relationship_owner], ["Date", record.meeting_date], ["Time", record.meeting_time],
          ["Type", record.meeting_type], ["Location", record.location], ["Status", record.status], ["Notes", record.notes],
        ]
      : [
          ["Title", record.title], ["Organizer", record.organizer], ["Attendees", record.attendees?.join(", ")],
          ["Start", record.start_time], ["End", record.end_time], ["Location", record.location],
          ["Status", record.status], ["Description", record.description], ["Recurring", record.is_recurring ? "Yes" : "No"],
        ];
    return `<section class="source-detail">
      <div class="source-detail-head"><strong>${name === "crm" ? "CRM SOURCE" : "CALENDAR SOURCE"}</strong><span class="source-record-id">${escapeHtml(source.id)}</span></div>
      ${pairs.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => `<div class="source-field"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join("")}
    </section>`;
  }).join("");
}

function detailMarkup(meeting) {
  const conflictRows = Object.entries(meeting.conflicts).map(([field, values]) =>
    `<div>${escapeHtml(field)}: CRM “${escapeHtml(values.crm)}” · Calendar “${escapeHtml(values.calendar)}”</div>`,
  ).join("");
  const duplicate = state.duplicateCandidates.find((candidate) => candidate.eventIds.some((id) => Object.values(meeting.sources).some((source) => source.id === id)));
  const matchReasons = meeting.match?.reasons?.length
    ? `<div class="notice">Match signals: ${meeting.match.reasons.map(escapeHtml).join(" · ")}</div>`
    : "";
  return `<tr class="detail-row"><td colspan="6"><div class="detail-panel">
    <div class="detail-topline"><strong>Source records &amp; reconciliation</strong><span class="detail-id">${escapeHtml(meeting.id)}</span></div>
    <div class="detail-grid">${sourceFields(meeting)}</div>
    ${conflictRows ? `<div class="conflict-list"><strong>Conflicting values</strong>${conflictRows}</div>` : ""}
    ${meeting.warnings.length ? `<div class="warning-list"><strong>Data quality</strong>${meeting.warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`).join("")}</div>` : ""}
    ${duplicate ? `<div class="notice">Possible calendar duplicate with ${escapeHtml(duplicate.eventIds.filter((id) => !Object.values(meeting.sources).some((source) => source.id === id)).join(", "))}. Records are kept separate.</div>` : ""}
    ${matchReasons}
  </div></td></tr>`;
}

function render() {
  const meetings = visibleMeetings();
  elements.resultCount.textContent = `${meetings.length} of ${state.meetings.length} meetings`;
  elements.empty.hidden = meetings.length > 0;
  document.querySelector(".table-wrap").hidden = meetings.length === 0;

  elements.rows.innerHTML = meetings.map((meeting) => {
    const isOpen = state.openId === meeting.id;
    const crm = meeting.sources.crm?.record;
    const sourceCount = Number(Boolean(meeting.sources.crm)) + Number(Boolean(meeting.sources.calendar));
    return `<tr class="meeting-row">
      <td class="meeting-cell"><span class="meeting-title" title="${escapeHtml(displayTitle(meeting))}">${escapeHtml(displayTitle(meeting))}</span><span class="meeting-subtitle">${escapeHtml(meeting.id)}</span></td>
      <td class="date-cell"><span class="date-main">${escapeHtml(formatDate(normalizedDate(meeting)))}</span><span class="date-time">${escapeHtml(formatTime(meeting))}</span></td>
      <td class="relationship-cell"><span class="relationship-name">${escapeHtml(crm?.client_name ?? displayClient(meeting))}</span><span class="relationship-company">${escapeHtml(crm?.client_company ?? crm?.relationship_owner ?? (meeting.sources.calendar ? "Calendar attendees" : "No client linked"))}</span></td>
      <td class="source-cell">${sourceMarkup(meeting)}</td>
      <td class="state-cell">${statusMarkup(meeting)}</td>
      <td class="detail-cell"><button class="detail-button" type="button" data-open="${escapeHtml(meeting.id)}" aria-expanded="${isOpen}" aria-label="${isOpen ? "Hide" : "View"} source details for ${escapeHtml(displayTitle(meeting))}">${isOpen ? "Close" : "Details"}</button></td>
    </tr>${isOpen ? detailMarkup(meeting) : ""}`;
  }).join("");

  elements.rows.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      state.openId = state.openId === button.dataset.open ? null : button.dataset.open;
      render();
    });
  });
}

function updateSummary(data) {
  const meetings = data.meetings;
  const matched = meetings.filter((meeting) => meeting.matchStatus === "matched").length;
  const sourceOnly = meetings.length - matched;
  const review = meetings.filter(needsReview).length;
  document.querySelector("#metric-total").textContent = meetings.length;
  document.querySelector("#metric-matched").textContent = matched;
  document.querySelector("#metric-source-only").textContent = sourceOnly;
  document.querySelector("#metric-review").textContent = review;
  document.querySelector("#nav-count").textContent = meetings.length;
  document.querySelector("#count-all").textContent = meetings.length;
  document.querySelector("#count-matched").textContent = matched;
  document.querySelector("#count-source-only").textContent = sourceOnly;
  document.querySelector("#count-review").textContent = review;
  document.querySelector("#source-counts").textContent = `CRM ${data.summary.crmRecords}  ·  Calendar ${data.summary.calendarRecords}`;
  document.querySelector("#updated-at").textContent = `· UPDATED ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date()).toUpperCase()}`;
}

let toastTimer;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

async function loadMeetings(showMessage = false) {
  const refresh = document.querySelector("#refresh-button");
  refresh.disabled = true;
  try {
    const response = await fetch("/api/meetings");
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const data = await response.json();
    state.meetings = data.meetings;
    state.summary = data.summary;
    state.duplicateCandidates = data.duplicateCandidates;
    updateSummary(data);
    render();
    if (showMessage) showToast("Meeting data refreshed");
  } catch (error) {
    elements.rows.innerHTML = `<tr><td class="loading-cell" colspan="6">Unable to load meetings. ${escapeHtml(error.message)}</td></tr>`;
    showToast("Could not load meeting data");
  } finally {
    refresh.disabled = false;
  }
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    state.openId = null;
    document.querySelectorAll("[data-filter]").forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("is-selected", selected);
      tab.setAttribute("aria-pressed", String(selected));
    });
    render();
  });
});

elements.search.addEventListener("input", () => {
  state.search = elements.search.value.trim().toLowerCase();
  state.openId = null;
  render();
});
elements.sort.addEventListener("change", () => {
  state.sort = elements.sort.value;
  render();
});
document.querySelector("#refresh-button").addEventListener("click", () => loadMeetings(true));
document.querySelector("#clear-filters").addEventListener("click", () => {
  state.filter = "all";
  state.search = "";
  elements.search.value = "";
  document.querySelector('[data-filter="all"]').click();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    elements.search.focus();
  }
  if (event.key === "Escape" && document.activeElement === elements.search) {
    elements.search.value = "";
    state.search = "";
    render();
  }
});

loadMeetings();