# Event Sync Service

A small full-stack meeting reconciliation service. It reads CRM and calendar records from JSON files, links likely records for the same meeting, exposes the results through a REST API, and provides a browser dashboard for reviewing matches, source data, conflicts, and data-quality warnings.

## Requirements

- Node.js 20 or newer
- npm (included with Node.js)

The service uses Node.js built-in modules and has no third-party package dependencies.

## Run

From the project directory:

```sh
npm start
```

Open [http://localhost:3000](http://localhost:3000). To use a different port, set the `PORT` environment variable before starting the service.

The input files are read once when the server starts. Restart the server after changing either JSON file. The dashboard's Refresh button requests the current server data again; it does not reload the files from disk.

## Test

```sh
npm test
```

The tests cover clear cross-source matches, source-only records, malformed values, substantive conflicts, and the possible Pinnacle calendar duplicate.

## API

All API responses use JSON.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns service health. |
| `GET` | `/api/meetings` | Returns summary counts, reconciled meetings, and duplicate candidates. |
| `GET` | `/api/meetings?status=matched` | Returns only meetings matched across both sources. |
| `GET` | `/api/meetings?status=source-only` | Returns records present in only one source. |
| `GET` | `/api/meetings/:id` | Returns one meeting, including its original source records. |

A meeting contains a stable ID, match status, the original CRM and/or calendar records, match reasons, conflicts, and warnings. For a cross-source match, the ID combines both source IDs, for example `CRM-1001::CAL-A1`.

## Reconciliation approach

The source files do not share IDs, so the service uses explicit rules rather than assuming records with a similar name are the same event.

1. CRM dates in ISO `YYYY-MM-DD` form are accepted. The observed `MM-DD/YYYY` form is also parsed when it represents a valid date. The original source record is preserved and a warning notes that normalization occurred.
2. A CRM record and calendar record must have the same parsed calendar date to be considered a match.
3. Party evidence is checked by comparing the CRM client's name to a calendar attendee's email local part. Topic similarity is calculated from normalized words in the subject, company, notes, title, and description; common filler words are ignored.
4. With a matching client attendee, a candidate is accepted if either its topic similarity reaches `0.3` or its start time is within 60 minutes. Without a matching attendee, both topic similarity of at least `0.3` and an exact start-time match are required.
5. Candidate pairs are ranked by attendee, topic, and time signals. A greedy one-to-one assignment accepts the highest scoring pairs first; all remaining records stay in the output as source-only rather than being discarded.
6. Calendar records that share a date, an attendee, similar topic details, and start within 60 minutes are reported as possible duplicate candidates. They are not merged automatically. This keeps the two Pinnacle entries separate for review.
7. Conflict detection compares equivalent values, not raw strings. For example, a time-only CRM value is compared with the clock portion of the calendar timestamp, `Completed` is treated like `confirmed`, and room/floor details may be ignored when the underlying venue matches. Subject wording is preserved in source details but not treated as a conflict by itself.
8. Original source values remain available even when a normalized value is used for matching. Non-ISO dates, malformed attendee emails, substantive field differences, and missing non-internal client identity are surfaced as review information.

These are deterministic heuristics intended for the supplied assessment data, not a universal event identity algorithm. Low-confidence candidates are kept separate rather than silently combined.

## Dashboard

The dashboard at `/` provides:

- Summary counts for total, reconciled, source-only, and needs-review meetings.
- Search across meeting titles and source data, plus filters for reconciliation and review state.
- Sorting by date or meeting name.
- Expandable CRM and calendar source records, including IDs and original field values.
- Side-by-side conflict values, data-quality warnings, match signals, and possible duplicate notes.
- A refresh action that fetches the latest in-memory API result.

## Limitations and assumptions

- The calendar timestamps have inconsistent timezone information. Matching currently compares the date and clock text in the supplied values; it does not convert between timezones. In particular, a timestamp ending in `Z` is not converted to CRM's local time. Timezone-aware reconciliation would require a known timezone for CRM values and a defined conversion policy.
- The date parser intentionally supports only ISO dates and the specific malformed date format found in the input. Other invalid or ambiguous formats remain unmatched and are reported.
- Candidate ranking is greedy and deterministic, but it does not solve a global maximum-weight assignment problem. If future data contains many competing candidates, the matching strategy should be revisited.
- Data is loaded into memory at process startup. There is no database, scheduled polling, write endpoint, authentication, or manual conflict-resolution workflow.
- The API is intended for local assessment use and is not hardened for public deployment.

## Project layout

```text
data/                 Provided CRM and calendar JSON inputs
public/               Browser dashboard HTML, CSS, and JavaScript
src/reconcile.js      Normalization, matching, conflicts, and warnings
src/server.js         HTTP API and static-file server
test/                 Node.js built-in test suite
problem_statement.md  Original assessment brief
AI_ASSISTANCE.md      AI collaboration and decision notes
```

## AI collaboration

AI assistance was used to interpret the open-ended requirements, map edge cases in the supplied data, implement and refine the reconciliation rules and dashboard, and draft the project documentation. The decisions and known limitations are summarized in [AI_ASSISTANCE.md](AI_ASSISTANCE.md). Review the code and documentation before submission and make sure the final account reflects your own understanding.

## Time spent

Inspect the data and decide matching rules: 1 hours ( check both files and understand layout used AI to find descripancies )
Build ingestion, reconciliation, and API: 2 hours ( Create Node server , read file and send to reconsile event used some datacamp and w3schools help and some AI) 
Build the dashboard: 2 hours ( used some datacamp and w3schools help and some AI)
Test, document decisions, and polish the README: 1 hours  ( used some AI help )