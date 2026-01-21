/**
 * Streaming utilities for OpenAI responses
 */

import OpenAI from "openai";
import type { PairedVerse, Citation } from "./types";
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
4. If the provided verses are insufficient to answer the question, say "I cannot fully answer this question based on the verses provided" and suggest what additional context might help.
5. Do NOT use hadith, tafsir, scholarly opinions, or any external sources.
6. Be respectful, humble, and focused on what Allah says in the Quran.

Write your response in markdown. Include citations inline like (2:153).`;

/**
 * Stream a chat response from OpenAI
 * Returns an async generator that yields text chunks
 */
export async function* streamChatResponse(
  question: string,
  context: PairedVerse[]
): AsyncGenerator<string, void, unknown> {
  const client = getOpenAIClient();
  const formattedContext = formatContextForPrompt(context);

  const userMessage = `QUESTION: ${question}

RELEVANT QURAN VERSES:
${formattedContext}

Based ONLY on these verses, provide a helpful answer with proper citations.`;

  const stream = await client.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: STREAMING_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
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
  context: PairedVerse[]
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

        // Stream the answer
        const generator = streamChatResponse(question, context);

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
