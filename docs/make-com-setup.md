# Make.com Email Forwarding Setup

This guide explains how to configure Make.com to forward emails from a shared Gmail inbox to the Job Hunt Agent webhook.

## Overview

Users forward job-search-related emails to a shared Gmail address (e.g. `jobagent@gmail.com`). A Make.com scenario watches that inbox and sends each new email to the app's webhook for processing.

```
User inbox  -->  Forward to jobagent@gmail.com
                          |
                    Make.com watches inbox
                          |
                    POST /api/webhook/email
                          |
                    AI parses + saves to DB
```

## Prerequisites

- A Gmail account dedicated to receiving forwarded emails (e.g. `jobagent@gmail.com`)
- A Make.com account (free tier works)
- Your deployed Vercel app URL
- Two env vars set on the Vercel app:
  - `WEBHOOK_SECRET` -- a random string you generate (shared between Make.com and the app)
  - `INSTANT_APP_ADMIN_TOKEN` -- from the InstantDB dashboard (Settings > Admin Tokens)

## Make.com Scenario Setup

### Module 1: Gmail -- Watch Emails

1. Create a new scenario in Make.com
2. Add the **Gmail > Watch Emails** module as the trigger
3. Connect your `jobagent@gmail.com` account
4. Configure:
   - **Folder**: INBOX
   - **Filter**: From -- leave empty to accept all senders (user matching happens in the webhook)
   - **Maximum number of results**: 10
5. Set the scheduling interval (e.g. every 5 minutes, or "Immediately" if on a paid plan)

This module outputs for each email:
- `Message ID` -- Gmail's unique message identifier
- `Thread ID` -- Gmail's thread grouper (all replies share the same thread ID)
- `Subject`
- `From: Name` and `From: Email`
- `To` (array)
- `Date`
- `Text content` (plain text body)
- `Labels` (array of Gmail label names)
- `Headers` (includes In-Reply-To, References)

### Module 2: HTTP -- Make a Request

1. Add an **HTTP > Make a Request** module after the Gmail trigger
2. Configure:
   - **URL**: `https://your-app.vercel.app/api/webhook/email`
   - **Method**: POST
   - **Headers**:
     - `Content-Type`: `application/json`
   - **Body type**: Raw
   - **Content type**: JSON
   - **Request content** (map Gmail fields):

```json
{
  "secret": "YOUR_WEBHOOK_SECRET_VALUE",
  "from": "{{1.from.email}}",
  "fromName": "{{1.from.name}}",
  "to": [{"name": "{{1.to[0].name}}", "email": "{{1.to[0].email}}"}],
  "subject": "{{1.subject}}",
  "bodyText": "{{1.textContent}}",
  "date": "{{1.date}}",
  "gmailThreadId": "{{1.threadId}}",
  "gmailMessageId": "{{1.messageId}}",
  "labels": {{1.labels}},
  "inReplyTo": "{{1.headers.In-Reply-To}}",
  "references": "{{1.headers.References}}"
}
```

> Note: The exact field mapping syntax depends on Make.com's output structure for the Gmail module. Use Make.com's mapper to select the correct fields from the Gmail trigger output. The field names above (e.g. `1.from.email`, `1.threadId`) are representative -- check the actual output panel in Make.com after running the Gmail module once.

### Module 3 (Optional): Router + Error Handler

Add a Router after the HTTP module to handle errors:
- **Route 1**: If HTTP status = 200, do nothing (success)
- **Route 2**: If HTTP status != 200, send a notification (e.g. email or Slack) with the error details

## Webhook Payload Reference

The webhook at `POST /api/webhook/email` expects:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `secret` | string | Yes | Must match `WEBHOOK_SECRET` env var |
| `from` | string | Yes | Sender's email address (used for user lookup) |
| `fromName` | string | No | Sender's display name |
| `to` | array | No | Recipients `[{name, email}]` |
| `subject` | string | Yes | Email subject line |
| `bodyText` | string | Yes | Plain text email body |
| `date` | string | No | ISO 8601 date (defaults to now) |
| `gmailThreadId` | string | No | Gmail's thread ID for grouping |
| `gmailMessageId` | string | No | Gmail's message ID |
| `labels` | string[] | No | Gmail labels (INBOX, IMPORTANT, etc.) |
| `inReplyTo` | string | No | In-Reply-To header value |
| `references` | string | No | References header value |

## How User Matching Works

The webhook matches the `from` email to a registered user:

1. The `from` field is the email address of the person who forwarded the email
2. The webhook queries InstantDB's `$users` table for a user with that email
3. If found, the email is processed and saved under that user's account
4. If not found, the webhook returns 404 -- the user must have logged into the app at least once via Google OAuth before forwarding emails

## How Thread Matching Works

1. If `gmailThreadId` is provided, the webhook checks for an existing thread with that ID in the user's data
2. If no direct match, it uses Pinecone vector search to find similar emails and asks AI to determine if it belongs to an existing thread
3. If a match is found, the email is added to the existing thread (incrementing message count)
4. If no match, a new thread is created

## Testing

You can test the webhook directly with curl:

```bash
curl -X POST https://your-app.vercel.app/api/webhook/email \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "your-webhook-secret",
    "from": "your-google-login@gmail.com",
    "fromName": "Your Name",
    "subject": "Re: Interview at Acme Corp",
    "bodyText": "Thanks for scheduling the interview. I look forward to meeting with the team on Thursday.",
    "date": "2026-02-17T10:30:00Z",
    "gmailThreadId": "test_thread_123",
    "labels": ["INBOX"]
  }'
```

Expected response:

```json
{
  "success": true,
  "emailId": "...",
  "threadId": "test_thread_123",
  "isNewThread": true,
  "userId": "...",
  "parsed": {
    "subject": "Re: Interview at Acme Corp",
    "fromName": "Your Name",
    "company": "Acme Corp",
    "emailType": "interview_scheduling"
  }
}
```
