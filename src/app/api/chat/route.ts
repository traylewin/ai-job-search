import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createTools } from "@/lib/agent/tools";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { generateAlerts } from "@/lib/agent/proactive-alerts";
import { ProactiveAlert } from "@/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return new Response("Missing x-user-id header", { status: 401 });
  }

  // Client can override API key and model via headers (stored in localStorage)
  const clientApiKey = req.headers.get("x-anthropic-key");
  const clientModel = req.headers.get("x-anthropic-model");

  const { messages } = await req.json();

  // Generate proactive alerts for context on first message
  let alerts: ProactiveAlert[] = [];
  try {
    alerts = await generateAlerts(userId);
  } catch (e) {
    console.error("[Chat] Failed to generate alerts:", e);
    alerts = [];
  }

  const systemPrompt = buildSystemPrompt(alerts);
  const tools = createTools(userId);

  // Convert UIMessages from the client into ModelMessages for streamText
  const modelMessages = await convertToModelMessages(messages, { tools });

  // Use client-provided key if available, otherwise fall back to env
  const apiKey = clientApiKey || process.env.ANTHROPIC_API_KEY || "";
  const modelId =
    clientModel || process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";

  const anthropic = createAnthropic({ apiKey });

  const result = streamText({
    model: anthropic(modelId),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(10),
    onStepFinish: ({ toolCalls, toolResults }) => {
      if (toolCalls && toolCalls.length > 0) {
        console.log(
          "[Agent Step]",
          toolCalls.map((tc) => `${tc.toolName}(${JSON.stringify("input" in tc ? tc.input : "").slice(0, 100)})`).join(", ")
        );
      }
      if (toolResults && toolResults.length > 0) {
        for (const tr of toolResults) {
          const resultStr = JSON.stringify("output" in tr ? tr.output : tr);
          console.log(
            `[Tool Result] ${tr.toolName}:`,
            resultStr.slice(0, 200) + (resultStr.length > 200 ? "..." : "")
          );
        }
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
