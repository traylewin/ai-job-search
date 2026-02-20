import { Pinecone } from "@pinecone-database/pinecone";
import { JobPosting, Email, Contact } from "@/types";

let pineconeClient: Pinecone | null = null;

function getPinecone(): Pinecone {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY || "",
    });
  }
  return pineconeClient;
}

function getIndex() {
  const indexName = process.env.PINECONE_INDEX || "jobhunt";
  return getPinecone().index(indexName);
}

// ─── Embedding via Pinecone Inference ───

const EMBED_MODEL = "llama-text-embed-v2";
const EMBED_BATCH_SIZE = 96; // Pinecone inference max batch

/**
 * Generate embeddings for a batch of texts using Pinecone's inference API.
 * Uses inputType "passage" for documents, "query" for search queries.
 */
async function embedTexts(
  texts: string[],
  inputType: "passage" | "query" = "passage"
): Promise<number[][]> {
  const pc = getPinecone();
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const result = await pc.inference.embed({
      model: EMBED_MODEL,
      inputs: batch,
      parameters: { inputType, truncate: "END" },
    });
    for (const item of result.data) {
      // Dense embeddings have values as number[]
      if ("values" in item && Array.isArray(item.values)) {
        allEmbeddings.push(item.values);
      }
    }
  }

  return allEmbeddings;
}

/**
 * Generate a single query embedding using Pinecone's inference API.
 */
async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text], "query");
  return embedding;
}

// ─── Upsert Functions ───

export async function upsertJobPostings(postings: JobPosting[]) {
  const index = getIndex();
  const ns = index.namespace("job-postings");

  const texts = postings.map((p) => {
    if (p.parseConfidence === "text-only") return p.rawText.slice(0, 4000);
    const parts = [p.title, p.company, p.location, p.description, p.rawText.slice(0, 2000)]
      .filter(Boolean)
      .join(" | ");
    return parts;
  });

  const embeddings = await embedTexts(texts, "passage");

  const vectors = postings.map((p, i) => ({
    id: p.id,
    values: embeddings[i],
    metadata: {
      filename: p.filename,
      company: p.company || "Unknown",
      title: p.title || "Unknown",
      location: p.location || "",
      salaryRange: p.salaryRange || "",
      parseConfidence: p.parseConfidence,
      type: "job_posting",
    },
  }));

  for (let i = 0; i < vectors.length; i += 100) {
    await ns.upsert({ records: vectors.slice(i, i + 100) });
  }

  return vectors.length;
}

export async function upsertEmails(emails: Email[]) {
  const index = getIndex();
  const ns = index.namespace("emails");

  const texts = emails.map(
    (e) => `${e.subject} | From: ${e.from.name} | ${e.body.slice(0, 2000)}`
  );

  const embeddings = await embedTexts(texts, "passage");

  const vectors = emails.map((e, i) => ({
    id: e.id,
    values: embeddings[i],
    metadata: {
      threadId: e.threadId,
      subject: e.subject,
      from: e.from.email,
      fromName: e.from.name,
      date: e.date,
      type: e.type,
      emailType: "email",
    },
  }));

  for (let i = 0; i < vectors.length; i += 100) {
    await ns.upsert({ records: vectors.slice(i, i + 100) });
  }

  return vectors.length;
}

export async function upsertResumeSections(
  sections: { id: string; title: string; content: string }[]
) {
  const index = getIndex();
  const ns = index.namespace("resume");

  const texts = sections.map((s) => `${s.title}: ${s.content}`);
  const embeddings = await embedTexts(texts, "passage");

  const vectors = sections.map((s, i) => ({
    id: s.id,
    values: embeddings[i],
    metadata: {
      section: s.title,
      type: "resume",
    },
  }));

  await ns.upsert({ records: vectors });
  return vectors.length;
}

export async function upsertContacts(contacts: Contact[]) {
  if (contacts.length === 0) return 0;
  const index = getIndex();
  const ns = index.namespace("contacts");

  const texts = contacts.map(
    (c) => `${c.name} | ${c.company || ""} | ${c.position || ""} | ${c.email || ""}`
  );

  const embeddings = await embedTexts(texts, "passage");

  const vectors = contacts.map((c, i) => ({
    id: c.id,
    values: embeddings[i],
    metadata: {
      name: c.name,
      company: c.company || "",
      position: c.position || "",
      email: c.email || "",
      location: c.location || "",
      type: "contact",
    },
  }));

  for (let i = 0; i < vectors.length; i += 100) {
    await ns.upsert({ records: vectors.slice(i, i + 100) });
  }

  return vectors.length;
}

// ─── Delete Functions ───

export async function deleteJobPostingVectors(ids: string[]) {
  if (ids.length === 0) return;
  const index = getIndex();
  const ns = index.namespace("job-postings");
  await ns.deleteMany(ids);
}

export async function deleteEmailVectors(ids: string[]) {
  if (ids.length === 0) return;
  const index = getIndex();
  const ns = index.namespace("emails");
  await ns.deleteMany(ids);
}

export async function deleteContactVectors(ids: string[]) {
  if (ids.length === 0) return;
  const index = getIndex();
  const ns = index.namespace("contacts");
  await ns.deleteMany(ids);
}

// ─── Query Functions ───

export async function searchJobs(
  query: string,
  topK: number = 10,
  filters?: Record<string, string>
) {
  const index = getIndex();
  const ns = index.namespace("job-postings");

  const queryEmbedding = await embedQuery(query);

  const filter: Record<string, unknown> = { type: "job_posting" };
  if (filters?.location) filter.location = { $eq: filters.location };

  const results = await ns.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
    filter: Object.keys(filter).length > 1 ? filter : undefined,
  });

  return results.matches || [];
}

export async function searchEmails(query: string, topK: number = 10) {
  const index = getIndex();
  const ns = index.namespace("emails");

  const queryEmbedding = await embedQuery(query);

  const results = await ns.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  return results.matches || [];
}

export async function searchContacts(query: string, topK: number = 10) {
  const index = getIndex();
  const ns = index.namespace("contacts");

  const queryEmbedding = await embedQuery(query);

  const results = await ns.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  return results.matches || [];
}

export async function searchResume(query: string, topK: number = 5) {
  const index = getIndex();
  const ns = index.namespace("resume");

  const queryEmbedding = await embedQuery(query);

  const results = await ns.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
  });

  return results.matches || [];
}
