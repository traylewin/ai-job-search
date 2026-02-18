export const maxDuration = 30;

export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return Response.json({ error: "Missing x-user-id" }, { status: 401 });
  }

  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return Response.json({ error: "Missing or invalid url" }, { status: 400 });
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return Response.json(
      { error: "Invalid URL format. Please provide a valid http/https URL." },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; JobHuntAgent/1.0; +https://github.com/job-hunt-agent)",
        Accept: "text/html,application/xhtml+xml,text/plain,*/*",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return Response.json(
        {
          error: `Failed to fetch URL: HTTP ${res.status} ${res.statusText}`,
        },
        { status: 422 }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    if (text.length === 0) {
      return Response.json(
        { error: "URL returned empty content" },
        { status: 422 }
      );
    }

    // Strip HTML tags for a simple text extraction
    let extractedText = text;
    if (contentType.includes("html")) {
      extractedText = stripHtml(text);
    }

    // Trim to reasonable length
    extractedText = extractedText.slice(0, 15000);

    return Response.json({
      success: true,
      content: extractedText,
      url: parsedUrl.toString(),
      contentType,
    });
  } catch (e) {
    const message =
      e instanceof Error && e.name === "AbortError"
        ? "Request timed out after 15 seconds"
        : `Failed to fetch: ${e}`;
    return Response.json({ error: message }, { status: 422 });
  }
}

function stripHtml(html: string): string {
  // Remove script and style blocks entirely
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

  // Convert block elements to newlines
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|li|tr|td|th|blockquote|section|article)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|tbody|thead)[^>]*>/gi, "\n");

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");

  // Clean up whitespace
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();

  return text;
}
