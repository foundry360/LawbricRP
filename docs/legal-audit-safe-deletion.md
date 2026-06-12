# Legal/Audit-Safe Deletion Policy

Lawbric is a law firm CRM, case management system, and operating system. User-facing delete actions must preserve legal and audit integrity by default.

## Policy

Normal delete actions should be soft deletes, not permanent database deletes. A deleted record should be hidden from day-to-day views while remaining available for audit, recovery, retention, and legal hold workflows.

Core records should include:

- `deleted_at`: when the user deleted the record.
- `deleted_by`: which user deleted the record.
- `delete_reason`: optional user/system reason for deletion.

Normal queries should exclude records where `deleted_at is not null` unless an explicit recovery, audit, or admin workflow requests them.

## Records Covered

Soft delete should apply to Lawbric-owned business records, including:

- Matters
- Matter parties and assignments
- Tasks
- Notes
- Documents and document metadata
- Communications
- Events and timeline data
- Financial records
- Contact notes and local contact metadata

## Documents And Files

Deleting a document in Lawbric should not immediately remove the storage object. The document record should be marked deleted and hidden. Permanent storage purge should be a separate restricted workflow because documents may be evidence, client records, or subject to retention requirements.

## External Systems

Lawbric delete actions should avoid destructive deletion in connected systems by default. External systems such as GHL may need separate archive/status updates or manual purge workflows. Any external destructive deletion should be deliberate, permissioned, and auditable.

## Permanent Purge

Permanent purge should be rare and separate from normal delete actions. It should require:

- Admin or compliance-level permission.
- Confirmation and reason.
- Audit log entry.
- Legal-hold/retention checks.

## Initial Implementation Scope

The first implementation pass soft-deletes core matter, lead, and contact metadata:

- `cases`
- `tasks`
- `notes`
- `documents`
- `case_communications`
- `case_events`
- `financials`
- `case_parties`
- `case_assignments`
- `lead_opportunities`
- `contact_notes`
- `contact_assignments`
- `contact_relationships`

Delete Edge Functions should update deletion metadata instead of removing rows. Normal list/detail queries should hide soft-deleted records.
