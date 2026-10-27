const STOP_WORDS = new Set([
  "a", "an", "and", "at", "call", "discussion", "for", "in", "meeting",
  "of", "on", "the", "to", "with",
]);

function normalizeText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value) {
  return new Set(
    normalizeText(value)
      .split(/\s+/)
      .filter((token) => token && !STOP_WORDS.has(token)),
  );
}

function parseCrmDate(value) {
  if (typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const malformedDate = value.match(/^(\d{1,2})-(\d{1,2})\/(\d{4})$/);
  if (!malformedDate) return null;

  const [, month, day, year] = malformedDate;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function calendarDate(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T/);
  return match?.[1] ?? null;
}

function minutesOfDay(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/T?(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function calendarPartyMatches(crm, calendar) {
  if (!crm.client_name) return false;
  const crmName = normalizeText(crm.client_name).replaceAll(" ", "");
  return (calendar.attendees ?? []).some((attendee) => {
    if (typeof attendee !== "string" || !attendee.includes("@")) return false;
    const localPart = normalizeText(attendee.split("@")[0]).replaceAll(" ", "");
    return localPart === crmName;
  });
}

function topicSimilarity(crm, calendar) {
  const crmTokens = tokens(`${crm.subject ?? ""} ${crm.client_company ?? ""} ${crm.notes ?? ""}`);
  const calendarTokens = tokens(`${calendar.title ?? ""} ${calendar.description ?? ""}`);
  if (!crmTokens.size || !calendarTokens.size) return 0;
  const shared = [...crmTokens].filter((token) => calendarTokens.has(token)).length;
  return shared / Math.min(crmTokens.size, calendarTokens.size);
}

function scorePair(crm, calendar) {
  const crmDay = parseCrmDate(crm.meeting_date);
  const calendarDay = calendarDate(calendar.start_time);
  if (!crmDay || crmDay !== calendarDay) return null;

  const partyMatch = calendarPartyMatches(crm, calendar);
  const similarity = topicSimilarity(crm, calendar);
  const crmTime = minutesOfDay(crm.meeting_time);
  const calendarTime = minutesOfDay(calendar.start_time);
  const timeDifference = crmTime === null || calendarTime === null
    ? null
    : Math.abs(crmTime - calendarTime);

  let timeScore = 0;
  if (timeDifference === 0) timeScore = 3;
  else if (timeDifference !== null && timeDifference <= 15) timeScore = 2;
  else if (timeDifference !== null && timeDifference <= 60) timeScore = 1;

  const topicMatch = similarity >= 0.3;
  const credibleMatch = partyMatch
    ? topicMatch || timeScore > 0
    : topicMatch && timeDifference === 0;

  if (!credibleMatch) return null;

  return {
    score: (partyMatch ? 4 : 0) + (topicMatch ? 2 : 0) + timeScore,
    reasons: [
      ...(partyMatch ? ["client attendee matches CRM client"] : []),
      ...(topicMatch ? ["subject and calendar details are similar"] : []),
      ...(timeDifference !== null && timeDifference <= 60 ? ["start times are within 60 minutes"] : []),
    ],
    timeDifference,
  };
}

function sourceFieldValues(crm, calendar) {
  return {
    subject: { crm: crm.subject ?? null, calendar: calendar.title ?? null },
    date: { crm: parseCrmDate(crm.meeting_date), calendar: calendarDate(calendar.start_time) },
    time: { crm: crm.meeting_time ?? null, calendar: calendar.start_time ?? null },
    location: { crm: crm.location ?? null, calendar: calendar.location ?? null },
    status: { crm: crm.status ?? null, calendar: calendar.status ?? null },
  };
}

function comparableLocation(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (/\bzoom\b/.test(normalized)) return "virtual-zoom";
  if (/\bteams\b/.test(normalized)) return "virtual-teams";
  if (/\bvirtual\b/.test(normalized)) return "virtual";
  return normalized
    .split(" ")
    .filter((token) => !new Set(["hq", "office", "room", "conference", "main", "floor", "the", "restaurant"]).has(token))
    .filter((token) => !/^\d+(st|nd|rd|th)?$/.test(token))
    .join(" ");
}

function comparableValue(field, value) {
  if (field === "time") {
    const match = String(value ?? "").match(/(?:T)?(\d{2}:\d{2})/);
    return match?.[1] ?? normalizeText(value);
  }
  if (field === "location") return comparableLocation(value);
  if (field === "status") {
    const normalized = normalizeText(value);
    return normalized === "completed" ? "confirmed" : normalized;
  }
  return normalizeText(value);
}

function differingValues(field, values) {
  if (values.crm == null || values.calendar == null) return false;
  if (field === "subject") return false;
  if (field === "location") {
    const crmTokens = comparableLocation(values.crm).split(" ").filter(Boolean);
    const calendarTokens = comparableLocation(values.calendar).split(" ").filter(Boolean);
    return !crmTokens.every((token) => calendarTokens.includes(token))
      && !calendarTokens.every((token) => crmTokens.includes(token));
  }
  return comparableValue(field, values.crm) !== comparableValue(field, values.calendar);
}

function meetingRecord(crm, calendar, match = null) {
  const sources = {
    ...(crm ? { crm: { id: crm.crm_id, record: crm } } : {}),
    ...(calendar ? { calendar: { id: calendar.event_id, record: calendar } } : {}),
  };
  const fields = crm && calendar ? sourceFieldValues(crm, calendar) : null;
  const conflicts = fields
    ? Object.fromEntries(
        Object.entries(fields)
          .filter(([field, values]) => differingValues(field, values))
          .map(([field, values]) => [field, values]),
      )
    : {};

  const warnings = [];
  if (crm && !crm._normalizedDate) warnings.push("CRM meeting date is missing or malformed");
  if (crm && crm.meeting_date && crm.meeting_date !== crm._normalizedDate) {
    warnings.push("CRM meeting date used a non-ISO format and was normalized");
  }
  if (crm && crm.meeting_type !== "Internal" && !crm.client_name && !crm.client_company) {
    warnings.push("Client identity is missing");
  }
  if (calendar && !calendarDate(calendar.start_time)) warnings.push("Calendar start time is missing or malformed");
  if (calendar && (calendar.attendees ?? []).some((attendee) => attendee.includes("[at]"))) {
    warnings.push("Calendar attendee contains a malformed email address");
  }

  return {
    id: crm && calendar ? `${crm.crm_id}::${calendar.event_id}` : (crm?.crm_id ?? calendar?.event_id),
    matchStatus: crm && calendar ? "matched" : "source-only",
    sources,
    match: match ? { confidence: "rule-based", reasons: match.reasons } : null,
    conflicts,
    warnings,
  };
}

function detectCalendarDuplicateCandidates(calendarEvents) {
  const candidates = [];
  for (let leftIndex = 0; leftIndex < calendarEvents.length; leftIndex += 1) {
    const left = calendarEvents[leftIndex];
    const leftDay = calendarDate(left.start_time);
    const leftTime = minutesOfDay(left.start_time);
    if (!leftDay || leftTime === null) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < calendarEvents.length; rightIndex += 1) {
      const right = calendarEvents[rightIndex];
      const rightTime = minutesOfDay(right.start_time);
      if (calendarDate(right.start_time) !== leftDay || rightTime === null) continue;
      if (Math.abs(leftTime - rightTime) > 60) continue;

      const sharedAttendee = (left.attendees ?? []).some(
        (attendee) => attendee.includes("@") && (right.attendees ?? []).includes(attendee),
      );
      if (!sharedAttendee) continue;
      if (topicSimilarity(
        { subject: left.title, notes: left.description },
        { title: right.title, description: right.description },
      ) < 0.3) continue;

      candidates.push({
        source: "calendar",
        eventIds: [left.event_id, right.event_id],
        reason: "same date, shared attendee, similar details, and starts within 60 minutes",
      });
    }
  }
  return candidates;
}

export function reconcileEvents(crmEvents, calendarEvents) {
  const normalizedCrm = crmEvents.map((event) => ({
    ...event,
    _normalizedDate: parseCrmDate(event.meeting_date),
  }));
  const candidates = [];

  for (const crm of normalizedCrm) {
    for (const calendar of calendarEvents) {
      const match = scorePair(crm, calendar);
      if (match) candidates.push({ crm, calendar, match });
    }
  }

  candidates.sort((left, right) => right.match.score - left.match.score);
  const matchedCrmIds = new Set();
  const matchedCalendarIds = new Set();
  const meetings = [];

  for (const candidate of candidates) {
    if (matchedCrmIds.has(candidate.crm.crm_id) || matchedCalendarIds.has(candidate.calendar.event_id)) continue;
    matchedCrmIds.add(candidate.crm.crm_id);
    matchedCalendarIds.add(candidate.calendar.event_id);
    meetings.push(meetingRecord(candidate.crm, candidate.calendar, candidate.match));
  }

  for (const crm of normalizedCrm) {
    if (matchedCrmIds.has(crm.crm_id)) continue;
    meetings.push(meetingRecord(crm, null));
  }

  for (const calendar of calendarEvents) {
    if (matchedCalendarIds.has(calendar.event_id)) continue;
    meetings.push(meetingRecord(null, calendar));
  }

  return {
    meetings,
    duplicateCandidates: detectCalendarDuplicateCandidates(calendarEvents),
    summary: {
      crmRecords: crmEvents.length,
      calendarRecords: calendarEvents.length,
      matched: meetings.filter((meeting) => meeting.matchStatus === "matched").length,
      sourceOnly: meetings.filter((meeting) => meeting.matchStatus === "source-only").length,
    },
  };
}