/**
 * Chat API Route with Streaming Support
 *
 * Handles user questions about the Quran:
 * 1. Embeds the question
 * 2. Retrieves relevant verses (English + Arabic)
 * 3. Streams the answer with citations
 */

import { NextRequest, NextResponse } from "next/server";
import { retrievePairedContext } from "@/lib/retrieval";
import { createStreamingResponse } from "@/lib/streaming";
import type { ChatAPIResponse, ChatRequest } from "@/lib/types";

// Rate limiting placeholder
const RATE_LIMIT = {
  windowMs: 60 * 1000,
  maxRequests: 10,
};

const requestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    requestCounts.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT.windowMs,
    });
    return true;
  }

  if (record.count >= RATE_LIMIT.maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

function validateRequest(
  body: unknown
): { valid: boolean; error?: string; data?: ChatRequest } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request body" };
  }

  const { message } = body as Record<string, unknown>;

  if (!message || typeof message !== "string") {
    return { valid: false, error: "Message is required and must be a string" };
  }

  if (message.length < 3) {
    return { valid: false, error: "Message must be at least 3 characters" };
  }

  if (message.length > 1000) {
    return { valid: false, error: "Message must be less than 1000 characters" };
  }

  return {
    valid: true,
    data: {
      message: message.trim(),
      conversationId: (body as Record<string, unknown>).conversationId as
        | string
        | undefined,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limiting
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "anonymous";

    if (!checkRateLimit(ip)) {
      return NextResponse.json<ChatAPIResponse>(
        {
          success: false,
          error: "Rate limit exceeded. Please wait a moment and try again.",
        },
        { status: 429 }
      );
    }

    // 2. Parse and validate request
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ChatAPIResponse>(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validation = validateRequest(body);
    if (!validation.valid || !validation.data) {
      return NextResponse.json<ChatAPIResponse>(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { message } = validation.data;

    // 3. Check if streaming is requested
    const acceptsStream = request.headers.get("accept")?.includes("text/event-stream");

    // 4. Retrieve relevant verses
    console.log(`[Chat] Processing question: "${message.substring(0, 50)}..."`);
    const context = await retrievePairedContext(message, 10);
    console.log(`[Chat] Retrieved ${context.length} paired verses`);

    // 5. Handle empty context
    if (context.length === 0) {
      return NextResponse.json<ChatAPIResponse>({
        success: true,
        data: {
          answer_markdown:
            "I could not find relevant Quran verses to answer your question. Could you please rephrase or provide more context?",
          citations: [],
          uncertainty: "No relevant verses found.",
        },
        context: [],
      });
    }

    // 6. Stream or return full response
    if (acceptsStream) {
      // Return streaming response
      const stream = createStreamingResponse(message, context);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      // Non-streaming fallback (for testing)
      const { generateVerifiedAnswer } = await import("@/lib/generation");
      const response = await generateVerifiedAnswer(message, context);

      return NextResponse.json<ChatAPIResponse>({
        success: true,
        data: response,
        context: context,
      });
    }
  } catch (error) {
    console.error("[Chat] Error processing request:", error);

    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";

    if (errorMessage.includes("OPENAI_API_KEY")) {
      return NextResponse.json<ChatAPIResponse>(
        { success: false, error: "Service configuration error" },
        { status: 500 }
      );
    }

    if (errorMessage.includes("SUPABASE")) {
      return NextResponse.json<ChatAPIResponse>(
        { success: false, error: "Database connection error" },
        { status: 500 }
      );
    }

    return NextResponse.json<ChatAPIResponse>(
      {
        success: false,
        error: "Failed to process your question. Please try again.",
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "hidayah-chat",
    timestamp: new Date().toISOString(),
  });
}
