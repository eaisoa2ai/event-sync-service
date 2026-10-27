# Full Stack Engineer — Take-Home Assessment

*AI assistance and transparency in its usage is encouraged.*

## The Problem

You are building an **Event Sync Service** for a small internal platform. The platform helps a sales team track client meetings by pulling data from two upstream systems and serving a unified view.

### Data Sources

**Source A — CRM API** (`/data/crm_events.json`)
Contains meeting records with client info, meeting dates, and relationship owners.

**Source B — Calendar API** (`/data/calendar_events.json`)
Contains calendar entries with attendees, times, locations, and recurrence info.

### What You Need to Build

A service that:

1. **Ingests** data from both sources
2. **Reconciles** records that refer to the same real-world meeting
3. **Serves** a unified meeting list through a simple web interface with an API backend

The frontend should display the reconciled meetings and allow a user to see which source each piece of data came from.

---

## The Data

Both data files are provided in `/data/`. You'll notice:

- Records across sources don't share a common ID
- Some meetings appear in both sources, some in only one
- Timestamps don't always match exactly
- Some fields conflict between sources (e.g., a meeting location in the calendar says "Zoom" but the CRM says "In-Person")
- One source has a record that looks like a duplicate of another record in the same source
- There are some records with missing or malformed fields

We have intentionally not told you how to handle any of these cases.

---

## Requirements

**Functional:**

- Ingest both data files and produce a reconciled meeting list
- Expose the reconciled data through a REST API
- Build a simple frontend that displays the meetings
- The user should be able to see where data conflicts exist between sources

**Non-Functional:**

- Use any language/framework you're comfortable with
- The service should start with a single command (document it)
- Include a detailed README walking through the setup guide.
- Include any AI-collaborated documentation (brainstorming, planning, etc.) that helped you with the development process.

**That's it.** There is no further specification.

---

## What We're Evaluating

We are **not** evaluating visual design, CSS polish, performance optimization, or test coverage percentage.

Beyond that, the quality of your `README` matters as much as the quality of your code.

---

## Submission

- A Git repository (or zip) with your code
- A README covering: how to run it, your approach, and your key decisions
- Time spent (be honest — we calibrate to this)

Please take all the time you need to complete the assessment before the deadline.