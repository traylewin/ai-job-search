# Job Hunt Agent - UX Specification

Replaces and expands Phase 5 of `PLAN.md`. Implements a Google NotebookLM-inspired layout with an Excalidraw-style floating toolbar.

---

## Layout Overview

Three-zone layout: **Sources Sidebar** (left) | **Chat** (center) | **Overlay Panels** (tracker, source viewer, add form).

```
+------------------+-----------------------------------------------+
|                  |  [Job Hunt Agent]  Context: [Stripe x] [Clear]|
|  SOURCES         |-----------------------------------------------|
|                  |                                               |
|  > Profile       |  [Proactive alert cards on first load]        |
|    - Resume      |                                               |
|                  |  User: What's the status at Stripe?           |
|  > Job Postings  |                                               |
|    - Stripe      |  AI: [reasoning trace, collapsible]           |
|    - Notion      |      Based on your tracker and emails...      |
|    - Figma       |      [source citations]                       |
|    - ...         |                                               |
|                  |                                               |
|  > Emails        |                                               |
|    - Re: Stripe  |                                               |
|    - ...         |                                               |
|                  |-----------------------------------------------|
|  > Notes         |  [  Ask anything...                   ] [Send]|
|    - Job Search  |                                               |
|                  +-----------------------------------------------+
|  [+ Add Source]  |
+------------------+
                  [ Chat | Tracker | Add ]   <-- floating toolbar
```

---

## Color System

Consistent color-coding by source type. Used across sidebar icons, pills, citations, and badges.

- **Profile/Resume**: Purple (`purple-500` / `purple-50`)
- **Job Postings**: Blue (`blue-500` / `blue-50`)
- **Emails**: Emerald/Green (`emerald-500` / `emerald-50`)
- **Notes**: Amber/Yellow (`amber-500` / `amber-50`)
- **Tracker**: Slate/Gray (`slate-600` / `slate-50`)
- **Alerts**: Red for urgent (`red-500`), Amber for warning (`amber-500`), Blue for info (`blue-500`)

Base palette: White background, `gray-50` secondary bg, `gray-800` primary text, `blue-600` as brand accent.

---

## 1. Sources Sidebar (Left Panel)

Fixed-width left sidebar (`w-80`, collapsible on mobile). Sticky header + scrollable source list.

### Header

- Title: "Sources" in `font-semibold`
- Right-aligned "+ Add Source" button (opens Add Source form)

### Source Groups

Four collapsible sections, each with a colored icon and section header. Items within each group are sorted **most recent first** (by last-modified or date received).

**Profile** (purple person icon)
- Resume file: `alex_chen_resume.txt`
- Clicking opens the Source Viewer overlay with the resume content rendered as readable text

**Job Postings** (blue briefcase icon)
- Lists all 40 parsed job postings
- Each item shows: **Role title** (bold, truncated), Company name + parse confidence badge (`full` = green dot, `partial` = yellow dot, `text-only` = gray dot) on second line
- Clicking a job posting: opens Source Viewer with parsed content (structured fields on top, raw text below if partial)
- **Checkbox on hover**: Checking a job adds it as a **Job Selection Pill** in the chat header (see Section 4)

**Emails** (emerald envelope icon)
- Lists email threads (grouped by `thread_id`), not individual messages
- Each item shows: **Subject** (bold, truncated), "From: Name" + relative time on second line
- Thread badge showing message count (e.g., "3 msgs")
- Clicking opens Source Viewer showing the full thread chronologically

**Notes** (amber pencil icon)
- `job_search_notes.md` and any user-added notes
- Each item shows: **Title** (first heading or first line), relative date on second line
- Clicking opens Source Viewer with markdown rendered

### Source Item States

- **Default**: White background, hover reveals light tinted background (per type color)
- **Active/Selected**: Left border accent (2px, type color), light tint background
- **Checked (for job pills)**: Checkbox filled with blue, item has subtle blue-50 bg

---

## 2. Chat Panel (Center)

Takes remaining horizontal space. Vertical layout: header bar, message stream, input area.

### 2a. Chat Header Bar

Height: `h-14`. Sticky at top. Contains:

- **Left**: App title "Job Hunt Agent" in `font-semibold text-lg`
- **Divider**: Thin vertical line
- **Job Selection Pills area**: 
  - Label: "Context:" in small gray uppercase
  - Removable pills for each selected job (see Section 4 for full spec)
  - "Clear all" link when pills are present
- **Right**: Conversation history dropdown (see Section 2d)

### 2b. Message Stream

Scrollable area with `max-w-3xl mx-auto` content width. Auto-scrolls to bottom on new messages.

**User messages**: Right-aligned, `bg-gray-100` rounded bubble, `rounded-tr-sm` for chat tail effect.

**Assistant messages**: Left-aligned with avatar. Structure:

1. **Avatar**: `w-8 h-8` indigo circle with "AI" text
2. **Reasoning Trace** (collapsible): `bg-gray-50` bordered box. Default collapsed, shows "Thinking... 3 tool calls" summary. Expanded shows:
   - Each tool call as a monospace line: `-> readJobPosting("Stripe")`
   - Tool results as truncated snippets
   - Timing info: "2.3s"
3. **Response body**: Rendered markdown via `react-markdown`. Supports headings, lists, bold, code blocks, tables.
4. **Source Citations**: Row of small colored badges at bottom. Each badge names the source (e.g., "Stripe Job Posting", "Email Thread #001"). Clicking a citation opens the Source Viewer to that specific source. Badge color matches source type color.

**Streaming state**: While the agent is generating:
- Reasoning trace shows a pulsing dot with "Thinking..."
- Tool calls appear one by one as they execute
- Response text streams in token by token
- A subtle gradient fade at the bottom of the latest message

### 2c. Chat Input Area

Pinned to bottom. Full width with `max-w-4xl mx-auto`.

- **Textarea**: Auto-resizing (1-4 rows), placeholder "Ask anything about your job search..."
- **Contextual hint**: When job pills are active, show a subtle line above the input: "Scoped to: Stripe, Notion" in small gray text -- reminds the user their query is filtered
- **Send button**: Blue circle with arrow icon, bottom-right of textarea
- **Suggested prompts**: On empty chat, show 3-4 clickable suggestion chips below the input:
  - "What are my most urgent action items?"
  - "Compare my current offers"
  - "Help me prep for my next interview"
  - "Which recruiter emails are worth responding to?"

### 2d. Conversation History

Dropdown or slide-out from the header. Lists past conversations stored in InstantDB.

- Each entry shows: first user message (truncated), timestamp, message count
- Click to load a past conversation
- "New Chat" button at top to start fresh
- Current conversation highlighted with blue accent

---

## 3. Floating Toolbar

Positioned: `fixed bottom-6 left-1/2 -translate-x-1/2`. Excalidraw-style pill shape.

`bg-white border border-gray-200 shadow-lg rounded-full px-4 py-2`

### Buttons (left to right):

1. **Chat** (speech bubble icon) - Blue when active. Returns to main chat view. Always visible.
2. **Divider** - Thin vertical line
3. **Tracker** (bar chart icon) - Opens Tracker panel as an overlay/slide-up. Gray default, slate when active.
4. **Add** (plus icon) - Opens Add Source form as a modal. Gray default.
5. **Divider** - Thin vertical line
6. **Alerts** (bell icon) - Shows alert count badge (red dot with number). Opens proactive alerts panel. Hidden if no alerts.

Each button: icon on top (`w-5 h-5`), tiny label below (`text-[10px]`). Hover state: light background circle behind icon.

### Toolbar Behavior

- Toolbar floats above all content, centered horizontally
- Semi-transparent backdrop when overlays are open
- Active state: the current view's button gets its accent color background
- On mobile: toolbar spans full width at the bottom, icons only (no labels)

---

## 4. Job Selection Pills (Context Filtering)

### How Pills Are Created

Three ways to add a job as a context filter:

1. **From Sources sidebar**: Hover over a job posting -> checkbox appears -> check to add pill
2. **From Tracker view**: Click a row action button "Focus" to add that job as a pill
3. **From chat**: Agent mentions a job -> user can click the company name in a citation badge -> "Add to context?" tooltip

### Pill Appearance

Displayed in the Chat Header Bar after "Context:" label.

```
[  Stripe  x  ]  [  Notion  x  ]  Clear all
```

- `bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-3 py-0.5 text-xs font-medium`
- "x" dismiss button on each pill: removes that single filter
- "Clear all" text link: removes all pills at once
- Max visible: 4 pills, then "+N more" overflow that expands on click

### How Pills Affect the Chat

Pills are passed to the `/api/chat` route as a `jobContext` parameter. The system prompt and tools are modified:

**Single job selected** (e.g., only "Stripe"):
- System prompt is augmented: "The user has focused on Stripe. When they ask about 'the interview', 'the status', 'the offer', etc., assume they mean Stripe unless they specify otherwise."
- Agent responses should explicitly name the company: "For your **Stripe** application..."
- Tools like `searchEmails`, `queryTracker`, `readJobPosting` are pre-filtered to that company

**Multiple jobs selected** (e.g., "Stripe" + "Datadog"):
- System prompt: "The user is comparing Stripe and Datadog. Prompts like 'compare offers' should include only these companies."
- Agent produces side-by-side comparisons scoped to the selected jobs
- Search results are filtered to only return data about the selected companies

**No pills selected** (default):
- Agent has full access to all data, no pre-filtering
- This is the default state on a new chat

### Visual Feedback

- When pills are active, the input area shows a subtle scoping indicator: faint blue top-border and small text "Scoped to Stripe" above the textarea
- Clearing all pills: short fade-out animation, scoping indicator disappears

---

## 5. Tracker Panel

Opened via the Tracker button in the floating toolbar. Renders as a **slide-up overlay** that covers the bottom 70% of the chat area (like a bottom sheet on mobile, or a tall modal on desktop).

### Header

- Title: "Application Tracker"
- Search bar: `w-full` text input with magnifying glass icon. Filters rows in real-time (searches across company, role, status, notes fields)
- Close button (X) top-right

### Table

Responsive table with the following columns:

| Column | Description | Width |
|--------|-------------|-------|
| Company | Company name, bold | `w-40` |
| Role | Job title | `w-48` |
| Status | Status pill with color coding (see below) | `w-32` |
| Date Applied | Formatted date, with `dateRaw` shown in tooltip on hover | `w-28` |
| Salary Range | As-is from data | `w-32` |
| Location | Location string | `w-32` |
| Recruiter | Name + email if available | `w-40` |
| Last Updated | Timestamp of last data change (from emails or manual updates) | `w-28` |
| Actions | "Focus" button to add job pill | `w-20` |

### Status Pill Colors

Status pills display `statusRaw` but are colored by `statusNormalized`:

- `applied` / `applied`: Blue pill
- `interviewing` / `phone screen` / `onsite scheduled`: Amber pill
- `offer` / `offer received`: Green pill
- `rejected`: Red pill
- `waiting` / `post-onsite`: Gray pill
- `unknown` / `???`: Dashed-border gray pill with "?" icon

### Row Interactions

- **Hover**: Light gray background highlight
- **Click row**: Expands an inline detail panel below the row showing:
  - Recruiter notes (from `notes` field, verbatim)
  - Last email activity (subject + date of most recent email mentioning this company)
  - Quick actions: "Focus in Chat" (adds pill), "View Job Posting" (opens Source Viewer), "View Emails" (opens Source Viewer filtered to company)
- **"Focus" action button**: Adds the job as a selection pill in the chat header

### Table Features

- Sortable columns (click header to toggle asc/desc)
- Sticky header row
- Alternating row backgrounds for readability (`bg-white` / `bg-gray-50`)
- Row count shown at bottom: "Showing 12 of 16 entries"

---

## 6. Source Viewer (Overlay)

Triggered by clicking any source in the sidebar, clicking a citation badge in a chat message, or clicking "View" actions in the tracker.

### Appearance

Slide-in panel from the right side, `w-[600px]` (or full-width on mobile). Semi-transparent backdrop on the rest of the page. Close button (X) top-right, or click backdrop to close.

### Header

- Source type icon (colored per type) + source name
- Type badge: "Job Posting" / "Email Thread" / "Resume" / "Notes"
- For job postings: parse confidence indicator (green/yellow/gray dot with label)

### Content Rendering

**Job Posting viewer**:
- Structured fields displayed as a clean card: Title, Company, Location, Salary, Remote status
- Below: Responsibilities and Requirements as bullet lists
- If `parseConfidence` is `partial` or `text-only`: show a muted banner: "Some fields could not be extracted from this posting. Raw text shown below."
- Raw text section at bottom in a `bg-gray-50` code-like block (always available)

**Email Thread viewer**:
- Chronological list of messages in the thread
- Each message: sender avatar/initial, name, date, body
- Email type badge on each message (offer, scheduling, etc.)
- Thread lines connecting messages visually

**Resume viewer**:
- Sections rendered with clear headings
- Skills highlighted as inline tags/pills
- Experience entries as timeline-style cards

**Notes viewer**:
- Markdown rendered to rich HTML
- Headings, lists, bold, links all styled

### Actions in Source Viewer

- "Add to Context" button (for job postings): adds as a job selection pill
- "Copy" button: copies the source content to clipboard
- "Ask about this" button: closes the viewer and pre-fills the chat input with "Tell me about [source name]"

---

## 7. Add Source Form (Modal)

Triggered by "+ Add Source" in the sidebar header or the "Add" button in the floating toolbar.

### Modal Appearance

Centered modal, `max-w-lg`, with backdrop. Clean white card with rounded corners and shadow.

### Form Structure

**Step 1: Choose type**
- Two large selectable cards:
  - **Email** (emerald icon): "Paste an email from your inbox"
  - **Note** (amber icon): "Add a personal note or preference"

**Step 2: Paste content**

- **Title field**: Short text input, optional. Auto-detected from content if left blank.
- **Content area**: Large textarea (`min-h-[200px]`), accepts:
  - Raw plain text
  - Markdown-formatted text
  - Structured pasted content from Gmail (the form detects and preserves email headers like From/To/Date/Subject)
  - Structured pasted content from Google Docs (preserves headings and formatting)
- **Format hint**: Small text below textarea: "Supports plain text, Markdown, or pasted email/document content. We'll auto-detect the format."
- **Auto-detection indicator**: As the user pastes, a small badge appears: "Detected: Email" or "Detected: Markdown" or "Detected: Plain text"

**Step 3: Confirm**

- Preview of how the content will look (rendered)
- "Add Source" primary button (blue)
- "Cancel" secondary button

### After Adding

- Source appears at the top of its group in the sidebar (most recent first)
- Source gets embedded and indexed in Pinecone
- Source is stored in InstantDB
- Brief toast notification: "Source added - Email: Re: Interview Update"

---

## 8. Proactive Alerts

Displayed as cards at the top of the chat message stream on first load, before any user messages.

### Alert Card Design

Each alert is a horizontal card with:
- Left: colored icon (red bell for urgent, amber clock for warning, blue info for informational)
- Center: alert message in bold, with supporting detail below
- Right: action button ("Prep Now", "Draft Follow-up", "Review")

### Alert Types

- **Offer Deadline** (red): "Your Stripe offer expires in 4 days (Feb 21)"
  - Action: "Review Offer"
- **Upcoming Interview** (amber): "Notion onsite is in 3 days (Feb 20)"
  - Action: "Prep Now"
- **Stale Application** (blue): "No response from Figma in 10 days since onsite"
  - Action: "Draft Follow-up"
- **Actionable Recruiter Email** (blue): "2 recruiter emails worth reviewing"
  - Action: "Review"

### Alert Interactions

- Clicking the action button:
  1. Adds the relevant job as a context pill
  2. Sends a pre-filled prompt to the agent (e.g., "Help me prep for my Notion interview on Feb 20")
  3. Alerts collapse into a minimized bar: "3 alerts" that can be re-expanded

- Dismiss individual alerts with an X button
- "Dismiss all" link

---

## 9. Component File Structure

Updated from PLAN.md to match this UX spec:

```
src/components/
├── layout/
│   ├── AppShell.tsx              # Three-zone layout container
│   ├── FloatingToolbar.tsx       # Excalidraw-style bottom toolbar
│   └── Header.tsx                # Chat header with pills
├── sources/
│   ├── SourcesSidebar.tsx        # Left sidebar container
│   ├── SourceGroup.tsx           # Collapsible section (Jobs, Emails, etc.)
│   ├── SourceItem.tsx            # Individual source row
│   └── SourceViewer.tsx          # Right slide-in overlay for viewing sources
├── chat/
│   ├── ChatPanel.tsx             # Center chat container
│   ├── MessageStream.tsx         # Scrollable message list
│   ├── UserMessage.tsx           # Right-aligned user bubble
│   ├── AssistantMessage.tsx      # Left-aligned AI response with trace + citations
│   ├── ReasoningTrace.tsx        # Collapsible tool call accordion
│   ├── SourceCitation.tsx        # Colored citation badge
│   ├── ChatInput.tsx             # Auto-resize textarea with send button
│   ├── SuggestedPrompts.tsx      # Starter prompt chips
│   └── ScopingIndicator.tsx      # "Scoped to Stripe" hint above input
├── tracker/
│   ├── TrackerPanel.tsx          # Slide-up overlay container
│   ├── TrackerTable.tsx          # Sortable, filterable table
│   ├── TrackerRow.tsx            # Single row with expand
│   ├── TrackerRowDetail.tsx      # Expanded detail panel
│   ├── StatusPill.tsx            # Color-coded status badge
│   └── TrackerSearch.tsx         # Search bar
├── pills/
│   ├── JobPillBar.tsx            # Container for pills in header
│   └── JobPill.tsx               # Individual removable pill
├── alerts/
│   ├── ProactiveAlerts.tsx       # Alert cards container at top of chat
│   └── AlertCard.tsx             # Individual alert card
├── forms/
│   ├── AddSourceModal.tsx        # Modal container
│   ├── SourceTypeSelector.tsx    # Email vs Note cards
│   ├── ContentPasteArea.tsx      # Smart-detect textarea
│   └── ContentPreview.tsx        # Preview before saving
├── shared/
│   ├── MarkdownRenderer.tsx      # react-markdown wrapper
│   ├── ConversationHistory.tsx   # Dropdown for past chats
│   └── Toast.tsx                 # Notification toasts
└── icons/
    └── index.tsx                 # SVG icon components per source type
```

---

## 10. State Management

Key client-side state (managed via React hooks + InstantDB for persistence):

- **`selectedJobs: string[]`** - Array of company names currently active as pills. Passed to `/api/chat` on every request. Stored in URL search params for shareability.
- **`activeView: "chat" | "tracker"`** - Which floating toolbar button is active. Controls overlay visibility.
- **`sourceViewerOpen: { type, id } | null`** - Which source is being viewed in the right overlay.
- **`addSourceOpen: boolean`** - Whether the Add Source modal is shown.
- **`conversationId: string`** - Current conversation ID in InstantDB.
- **`alertsDismissed: string[]`** - Which alerts the user has dismissed (stored in localStorage).

---

## 11. Responsive Behavior

**Desktop (> 1024px)**: Full three-zone layout as described.

**Tablet (768-1024px)**: Sources sidebar collapses to icon-only mode (click to expand as overlay). Tracker panel covers full width.

**Mobile (< 768px)**: Sources sidebar hidden (accessible via a hamburger menu or swipe). Floating toolbar spans full width at bottom, icons only. Tracker is full-screen. Source Viewer is full-screen.
