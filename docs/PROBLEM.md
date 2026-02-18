# 🎯 The Job Hunt Agent

**Take-Home Engineering Assignment**

> Build an AI agent that tames the chaos of a real job search.

| | |
|---|---|
| **Time Limit** | 8 – 12 hours |
| **Stack** | Any language · Any LLM provider |
| **Deliverable** | Working agent + README |

---

## Overview

You are a job seeker drowning in data. You have a folder full of job posting HTMLs scraped from various boards, a pile of recruiter emails (some genuine, some spam), your own resume, a spreadsheet of companies you're tracking, and a handful of notes you've jotted down about your preferences. It's a mess.

**Your task:** build an AI-powered agent that can make sense of this chaos and act as your personal job search assistant. The agent should be able to answer questions, perform multi-step tasks, and proactively surface insights across all of these data sources.

> **What we're really evaluating**
>
> This isn't a "call an LLM API" assignment. We want to see how you design an agentic system: how you structure the loop, select tools, handle messy real-world data, recover from errors, and make the agent feel genuinely useful. Think of it as building a product, not a demo.

---

## The Scenario

We provide you with a synthetic but realistic dataset representing a job seeker's digital footprint. The data is intentionally messy — just like real life.

### Provided Data

#### 1. Job Postings (HTML files)

A folder of ~40 scraped job posting pages from various sources (company career pages, LinkedIn, Indeed, etc.). Each file is raw HTML with different structures, some with broken tags, inline scripts, cookie banners, and other noise. Job details are buried in different DOM structures per source.

#### 2. Email Archive (JSON)

A JSON file containing ~40 emails including:

- Recruiter outreach (some legitimate, some clearly mass-blasted spam)
- Application confirmation emails
- Interview scheduling threads (with back-and-forth replies)
- Rejection emails
- Offer letters and negotiation threads
- Newsletters and noise from job boards

Emails include threading info (`in_reply_to`, `references`), timestamps, and sometimes attachments referenced by filename.

#### 3. Resume (plain text)

The candidate's resume with work history, skills, education, and project descriptions.

#### 4. Company Tracker (CSV)

A messy spreadsheet the candidate has been maintaining with columns like: company name, role, status, salary range, notes, date applied, recruiter contact. Some rows are incomplete, some have inconsistent status values (`"applied"` vs `"Applied"` vs `"sent app"`), and some have free-text notes in random columns.

#### 5. Preferences & Notes (Markdown)

A personal notes file where the candidate has jotted down things like: preferred locations, salary expectations, deal-breakers, companies they're excited about, questions to ask in interviews, and random thoughts. It's informal and unstructured.

---

## What to Build

Build a conversational agent with an agentic loop that can:

### Core Capabilities

1. **Answer questions across data sources.** The agent should be able to handle questions that require combining information from multiple files. For example: *"Which jobs match my preferred location and salary range?"* requires reading the postings, the preferences file, and possibly the tracker.

2. **Perform multi-step tasks.** Go beyond single-turn Q&A. The agent should handle requests like: *"Prepare me for my interview at Acme Corp"* — which requires finding the job posting, checking email threads for interview details, reading your resume to identify relevant experience, and synthesizing a prep brief.

3. **Handle messy data gracefully.** The HTML is ugly, the CSV is inconsistent, the emails have threading artifacts. Your agent should handle this without crashing or giving garbage answers. We care as much about how you handle the mess as the final answer.

4. **Use tools appropriately.** Your agent must have access to tools (file reading, search/filtering, structured data queries, computation, etc.) and should decide which tools to call and in what order based on the user's request. We want to see thoughtful tool design.

5. **Know what it doesn't know.** If information is missing or ambiguous, the agent should say so rather than hallucinate. If the tracker says `"status: ???"` the agent shouldn't guess.

---

## Example Interactions

Your agent should be able to handle prompts like these (these are examples, not an exhaustive test suite):

> **"What's the status of my application at Meridian Tech?"**
>
> → Agent checks the tracker CSV, finds relevant emails, and gives a synthesized status update.

> **"Which of my open applications have I not heard back from in over 2 weeks?"**
>
> → Agent cross-references tracker dates with email timestamps to find stale applications.

> **"Compare the Stripe and Datadog offers side by side based on what matters to me."**
>
> → Agent reads offer emails, cross-references with preferences/notes, and builds a comparison.

> **"Help me prep for my Notion interview on Thursday."**
>
> → Agent finds the calendar/email details, reads the job posting, reviews resume, and creates a focused prep doc.

> **"Draft a follow-up email to the Figma recruiter. It's been 10 days since my onsite."**
>
> → Agent finds the recruiter's name/email from threads, references interview details, and drafts a contextual follow-up.

> **"Are any of these recruiter emails actually worth responding to?"**
>
> → Agent classifies recruiter outreach by relevance to resume and preferences, filters spam, and ranks.

---

## Technical Requirements

### Must Have

- **Agentic loop:** A clear observe → think → act loop (or equivalent architecture). The agent should be able to take multiple steps to answer a question, not just make a single LLM call.
- **Tool use:** At least 4 distinct tools the agent can invoke (e.g., `read_file`, `search_emails`, `query_csv`, `parse_html`, `compute_date_diff`). Tools should have clear interfaces.
- **Multi-source reasoning:** The agent must be able to combine information from 2+ data sources in a single response.
- **Error handling:** The agent should recover gracefully from tool errors, malformed data, and ambiguous queries.
- **Conversation interface:** A working CLI or simple web UI where we can type queries and see the agent's responses and reasoning.

### Should Have

- **Visible reasoning:** Show the agent's chain of thought or tool-calling plan (even if behind a `--verbose` flag).
- **Context management:** Smart handling of what context to include in the LLM's window — you can't dump 40 HTML files into every prompt.
- **Conversation memory:** Multi-turn conversations where the agent remembers prior context.

### Nice to Have (Bonus Points)

We love seeing candidates go beyond the basics. These are organized into tiers — pick what excites you. **A single well-executed bonus feature beats five half-baked ones.** You don't need to fully ship everything; even a partial implementation with a clear writeup of your vision counts.

#### 🥉 Solid Extras

- Semantic search or embedding-based indexing over the data corpus
- Caching / memoization of expensive operations (parsed HTML, LLM calls, etc.)
- Streaming responses as the agent works
- A lightweight evaluation harness with a few test cases
- Ability to write/update the tracker CSV (not just read it)

#### 🥈 UX & Polish

- **Rich CLI experience** — colored output, spinners during tool calls, collapsible reasoning traces, markdown-formatted responses in the terminal (e.g., with `rich` or `ink`)
- **Exportable outputs** — agent generates a markdown or HTML brief you could actually send to someone (e.g., interview prep doc, offer comparison table)
- **Interactive mode** — agent suggests follow-up questions or surfaces things you didn't ask about ("By the way, your Stripe offer deadline is in 3 days")
- **Web UI** — even a simple one (Streamlit, Gradio, or a custom React frontend) that makes the experience feel like a real product
- **Conversation history** — persist chat across sessions so the agent remembers your previous questions

#### 🥇 Intelligence & Vision

- **Proactive alerts** — on startup, the agent scans your data and surfaces time-sensitive items without being asked ("You have 2 stale applications with no response in 3+ weeks. Your Notion onsite is in 4 days — want me to prep you?")
- **Smart prioritization** — agent ranks your pipeline by a composite score (excitement × offer likelihood × comp fit) using signals from across all data sources
- **Action plans** — agent generates a daily/weekly action plan ("This week: prep for Notion onsite, follow up with Figma recruiter, decide on Stripe negotiation strategy")
- **Recruiter spam classifier** — a real classifier (not just vibes) that scores inbound recruiter emails against your resume and preferences, with explanations
- **Plugin / tool extensibility** — a clean abstraction for adding new tools or data sources so someone could plug in a Google Calendar feed, a LinkedIn export, or a Glassdoor scraper without modifying core agent logic
- **Diff-aware updates** — if the data changes (new email arrives, tracker updated), the agent can detect what's new and update its understanding incrementally instead of re-processing everything
- **Multi-agent or planner architecture** — a planning layer that decomposes complex requests into subtasks, delegates to specialized sub-agents, and synthesizes results

> **Note:** For 🥇 features, we value the architecture and design thinking as much as the implementation. If you build the abstraction but only wire up one example, that's great — just explain your vision in the README.
---

## Evaluation Criteria

We will evaluate your submission on the following dimensions, roughly in order of importance:

| Dimension | Weight | What We're Looking For |
|---|:---:|---|
| **Agent Architecture** | 30% | Quality of the agentic loop, tool design, planning/reasoning strategy, and how the agent decides what to do next. |
| **Data Handling** | 25% | How well the agent handles messy, inconsistent, multi-format data. Parsing robustness, normalization, and graceful degradation. |
| **Usefulness** | 20% | Does the agent actually produce helpful, accurate, and well-synthesized answers to the example queries? |
| **Code Quality** | 15% | Clean, readable, well-structured code. Good abstractions. Meaningful comments where needed. A README that helps us run and understand your work. |
| **Bonus Features** | 10% | Search indexing, streaming, eval harness, UI polish, creative tool design, or other thoughtful additions. |

---

## Submission Guidelines

- **Time limit:** You have 12 hours from receiving the dataset. We don't expect you to use all of it — 8–10 hours of focused work is typical.
- **Repository:** Submit a private GitHub repo (invite us as collaborators) or a zip file.
- **README:** Include setup instructions, architecture overview, design decisions and tradeoffs you made, and what you'd improve with more time.
- **Demo:** Include a short screen recording (3–5 min) walking through 2–3 example interactions. This helps us see the agent in action without environment setup issues.
- **Commit history:** We value seeing your thought process. Frequent commits > one giant commit.

> **💡 Tip**
>
> Don't try to boil the ocean. A well-designed agent that handles 5 query types really well is far more impressive than one that half-handles 20. Depth over breadth.

---

## Rules & Constraints

- **LLM provider:** Use any LLM provider you like (OpenAI, Anthropic, open-source, etc.). We'll provide a $20 API credit code if needed.
- **Frameworks:** You may use agent frameworks (LangChain, LlamaIndex, CrewAI, etc.) or build from scratch. Building from scratch is not required but will give us more signal on your understanding of the fundamentals.
- **Language:** Python or TypeScript preferred, but any language is acceptable.
- **No fine-tuning:** This is a systems/engineering challenge, not an ML challenge. Prompt engineering and tool design are in scope; model training is not.
- **AI assistance:** You should use AI coding assistants (Copilot, Claude, etc.) — we do in our daily work. Be prepared to explain every design decision in a follow-up conversation.

---

## What Happens Next

After you submit, we'll review your code and demo within 2 business days. If we're impressed, you'll join us for a 45-minute technical deep-dive where we'll:

- Walk through your architecture decisions together
- Discuss tradeoffs you considered
- Explore how you'd extend the agent for production use

This is meant to be a fun, realistic challenge that mirrors the kind of work you'd actually do on the team. We're building agents that help people wrangle complex, messy information — and we want to see how you think about that problem.

**Good luck, and have fun with it. 🚀**
