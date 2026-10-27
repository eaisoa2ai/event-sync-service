import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reconcileEvents } from "../src/reconcile.js";

const crmEvents = JSON.parse(await readFile(new URL("../data/crm_events.json", import.meta.url), "utf8"));
const calendarEvents = JSON.parse(await readFile(new URL("../data/calendar_events.json", import.meta.url), "utf8"));

test("matches clear cross-source meetings and keeps source-only records", () => {
  const result = reconcileEvents(crmEvents, calendarEvents);
  const matchIds = new Set(result.meetings.filter((meeting) => meeting.matchStatus === "matched").map((meeting) => meeting.id));

  assert.ok(matchIds.has("CRM-1001::CAL-A1"));
  assert.ok(matchIds.has("CRM-1005::CAL-A5"));
  assert.ok(matchIds.has("CRM-1008::CAL-A9"));
  assert.ok(result.meetings.some((meeting) => meeting.id === "CAL-A6" && meeting.matchStatus === "source-only"));
  assert.ok(result.meetings.some((meeting) => meeting.id === "CAL-A3" && meeting.matchStatus === "source-only"));
});

test("retains conflicting source values and reports malformed input", () => {
  const result = reconcileEvents(crmEvents, calendarEvents);
  const locationConflict = result.meetings.find((meeting) => meeting.id === "CRM-1002::CAL-A2");
  const malformedDate = result.meetings.find((meeting) => meeting.id === "CRM-1008::CAL-A9");
  const malformedAttendee = result.meetings.find((meeting) => meeting.id === "CRM-1015::CAL-A16");

  assert.equal(locationConflict.conflicts.location.crm, "NYC Office - 30th Floor");
  assert.equal(locationConflict.conflicts.location.calendar, "Zoom - https://zoom.us/j/98765432100");
  assert.equal(malformedDate.sources.crm.record.meeting_date, "03-15/2025");
  assert.ok(malformedDate.warnings.some((warning) => warning.includes("non-ISO format")));
  assert.ok(malformedAttendee.warnings.some((warning) => warning.includes("malformed email")));
  assert.ok(malformedAttendee.sources.calendar.record.attendees.includes("raj.patel[at]atlasvc.com"));
});

test("only flags substantive differences between comparable fields", () => {
  const result = reconcileEvents(crmEvents, calendarEvents);
  const portfolioReview = result.meetings.find((meeting) => meeting.id === "CRM-1001::CAL-A1");
  const summitMeeting = result.meetings.find((meeting) => meeting.id === "CRM-1002::CAL-A2");
  const esgMeeting = result.meetings.find((meeting) => meeting.id === "CRM-1016::CAL-A17");
  const investorUpdate = result.meetings.find((meeting) => meeting.id === "CRM-1005::CAL-A5");
  const annualReview = result.meetings.find((meeting) => meeting.id === "CRM-1011::CAL-A12");
  const internalReview = result.meetings.find((meeting) => meeting.id === "CRM-1006::CAL-A7");

  assert.deepEqual(Object.keys(portfolioReview.conflicts), []);
  assert.deepEqual(Object.keys(summitMeeting.conflicts), ["location"]);
  assert.deepEqual(Object.keys(esgMeeting.conflicts), ["time"]);
  assert.deepEqual(Object.keys(investorUpdate.conflicts), []);
  assert.deepEqual(Object.keys(annualReview.conflicts), []);
  assert.deepEqual(internalReview.warnings, []);
});

test("reports the Pinnacle calendar entries as a duplicate candidate without merging them", () => {
  const result = reconcileEvents(crmEvents, calendarEvents);
  assert.ok(result.duplicateCandidates.some((candidate) => candidate.eventIds.join() === "CAL-A5,CAL-A6"));
  assert.ok(result.meetings.some((meeting) => meeting.id === "CAL-A6"));
});