/**
 * Streaming utilities for OpenAI responses
 */

import OpenAI from "openai";
import type { PairedVerse, Citation, ConversationMessage } from "./types";
import { formatContextForPrompt } from "./retrieval";
import { parseCitations } from "./citations";

// Lazy initialization
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// System prompt for streaming generation
const STREAMING_SYSTEM_PROMPT = `You are Hidayah, an Islamic AI assistant that answers questions using ONLY the Quran.

CRITICAL RULES:
1. You MUST base your answer ONLY on the provided Quran verses below.
2. Every claim or statement MUST have a citation in the format (surah:ayah), e.g., (2:153).
3. Every paragraph of your answer MUST contain at least one citation.
4. If the provided verses don't fully cover a topic, do your best with what's available. You may briefly note "The provided verses focus on [X aspect]" but do NOT ask the user to provide more verses or context - they cannot do so.
5. Do NOT use hadith, tafsir, scholarly opinions, or any external sources.
6. Be respectful, humble, and focused on what Allah says in the Quran.
7. NEVER ask the user to "share more verses" or "provide additional context" - the system retrieves verses automatically.

CONVERSATION CONTEXT:
- You may have previous conversation messages for context.
- When answering follow-up questions, maintain consistency with your previous responses.
- If the user refers to something from earlier in the conversation, use that context appropriately.
- Always ground your current answer in the newly provided Quran verses.

FORMATTING RULES:
- Start with a brief descriptive header using ## (e.g., "## What the Quran says about patience")
- Write in flowing paragraphs, NOT numbered lists
- Use **bold** to highlight key Quranic terms and important phrases (e.g., **lower their gaze**, **righteousness (taqwā)**)
- Keep paragraphs focused - each paragraph should cover one main point with its citation(s)
- End with a brief summary paragraph tying the main points together
- Citations go inline at the end of the relevant sentence like (24:30)
- Do NOT use numbered lists (1), 2), etc.) - use paragraphs instead`;

/**
 * Stream a chat response from OpenAI
 * Returns an async generator that yields text chunks
 */
export async function* streamChatResponse(
  question: string,
  context: PairedVerse[],
  history: ConversationMessage[] = []
): AsyncGenerator<string, void, unknown> {
  const client = getOpenAIClient();
  const formattedContext = formatContextForPrompt(context);

  const userMessage = `QUESTION: ${question}

RELEVANT QURAN VERSES:
${formattedContext}

Based ONLY on these verses, provide a helpful answer with proper citations.`;

  // Build messages array: system -> history -> current question with context
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: STREAMING_SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: userMessage },
  ];

  const stream = await client.chat.completions.create({
    model: "gpt-5.2",
    messages,
    temperature: 0.3,
    max_completion_tokens: 2000,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

/**
 * Create a ReadableStream for the HTTP response
 */
export function createStreamingResponse(
  question: string,
  context: PairedVerse[],
  history: ConversationMessage[] = []
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let fullContent = "";

  return new ReadableStream({
    async start(controller) {
      try {
        // First, send the context as a JSON event
        const contextEvent = {
          type: "context",
          data: context,
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(contextEvent)}\n\n`)
        );

        // Stream the answer with conversation history
        const generator = streamChatResponse(question, context, history);

        for await (const chunk of generator) {
          fullContent += chunk;
          const textEvent = {
            type: "text",
            data: chunk,
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(textEvent)}\n\n`)
          );
        }

        // After streaming completes, extract citations and send final event
        const citations: Citation[] = parseCitations(fullContent);
        const doneEvent = {
          type: "done",
          data: {
            citations,
            fullContent,
          },
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`)
        );

        controller.close();
      } catch (error) {
        const errorEvent = {
          type: "error",
          data: error instanceof Error ? error.message : "Unknown error",
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
        );
        controller.close();
      }
    },
  });
}
