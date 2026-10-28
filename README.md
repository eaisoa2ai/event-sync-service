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

1. **Date Format:** CRM dates in `YYYY-MM-DD` format are accepted. Dates in `MM-DD/YYYY` format are also accepted if valid.
          The original date is kept, and a warning is added when the format is changed.

3. **Date Matching:** A CRM record and a calendar record are considered a match only when they have the same date.

4. **Client and Topic Matching:** The system checks whether the client's name matches an attendee's email name.
       It also compares meeting subjects, company names, notes, titles, and descriptions to see how closely the topics match. Common words are ignored.

5. **Meeting Match Rules:**
   - If the client matches an attendee, the meeting is accepted when the topic similarity is at least `0.3` (30%) or the start times are within 60 minutes.
   - If the client does not match an attendee, the topic similarity must be at least `0.3` and the start times must match exactly.

6. **Best Match Selection:** The system ranks meetings based on client, topic, and time similarities.
        It selects the strongest matches first, making sure each record is matched only once. Unmatched records are kept separately instead of being deleted.

7. **Duplicate Meeting Check:** Calendar meetings with the same date, attendee, similar topic, and start times within 60 minutes are flagged as possible duplicates.
     They are not automatically combined. For example, the two Pinnacle meetings remain separate for review.

8. **Conflict Detection:** The system compares the actual meaning of values rather than just their text. For example:
   - `Completed` and `Confirmed` are treated as the same status.
   - CRM meeting times are compared with the time portion of calendar entries.
   - Different room or floor details are ignored if the main meeting location is the same.
   - Different subject wording alone is not considered a conflict.

9. **Original Data and Warnings:** All original CRM and calendar values are preserved, even when the system standardizes them for matching.
         Issues such as unusual date formats, invalid attendee emails, important data differences, or missing client information are flagged for review.
   
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

AI assistance was used to interpret the open-ended requirements, map edge cases in the supplied data, implement and refine the reconciliation rules and dashboard, and draft the project documentation. 

## Time spent

- Inspect the data and decide matching rules: 1 hours ( check both files and understand layout used AI to find descripancies )
- Build ingestion, reconciliation, and API: 2 hours ( Create Node server , read file and send to reconsile event used some datacamp and w3schools help and some AI) 
- Build the dashboard: 2 hours ( used some datacamp and w3schools help and some AI)
- Test, document decisions, and polish the README: 1 hours  ( used some AI help )
