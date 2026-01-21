/**
 * LLM generation and verification for Quran AI responses
 */

import OpenAI from "openai";
import type { ChatResponse, PairedVerse } from "./types";
import { formatContextForPrompt } from "./retrieval";
import {
  parseCitations,
  splitIntoParagraphs,
  paragraphHasCitation,
  validateCitationsAgainstContext,
} from "./citations";

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

// System prompt for the initial generation
const GENERATION_SYSTEM_PROMPT = `You are Hidayah, an Islamic AI assistant that answers questions using ONLY the Quran.

CRITICAL RULES:
1. You MUST base your answer ONLY on the provided Quran verses below.
2. Every claim or statement MUST have a citation in the format (surah:ayah), e.g., (2:153).
3. Every paragraph of your answer MUST contain at least one citation.
4. If the provided verses are insufficient to answer the question, say "I cannot fully answer this question based on the verses provided" and suggest what additional context might help.
5. Do NOT use hadith, tafsir, scholarly opinions, or any external sources.
6. Be respectful, humble, and focused on what Allah says in the Quran.

RESPONSE FORMAT:
Provide your response as valid JSON with this exact structure:
{
  "answer_markdown": "Your answer in markdown with citations like (2:153)",
  "citations": [{"surah": 2, "ayah": 153}, ...],
  "uncertainty": null or "explanation of what's missing"
}

Only output the JSON object, nothing else.`;

// System prompt for the verification pass
const VERIFICATION_SYSTEM_PROMPT = `You are a verification system for Quran-based AI responses.

Your job is to review a draft answer and ensure:
1. Every claim is supported by the provided Quran verses.
2. Every paragraph contains at least one citation in (surah:ayah) format.
3. No information from outside the provided context is included.
4. Citations are accurate and match the verse content.

If you find unsupported claims:
- Remove them or rewrite to only include what's supported.
- Add citations where missing.
- If the answer becomes insufficient, set uncertainty to explain.

RESPONSE FORMAT:
Provide your verified response as valid JSON with this exact structure:
{
  "answer_markdown": "Verified answer with proper citations",
  "citations": [{"surah": 2, "ayah": 153}, ...],
  "uncertainty": null or "explanation of limitations"
}

Only output the JSON object, nothing else.`;

/**
 * Generate initial answer from the LLM
 */
export async function generateAnswer(
  question: string,
  context: PairedVerse[]
): Promise<ChatResponse> {
  const client = getOpenAIClient();
  const formattedContext = formatContextForPrompt(context);

  const userMessage = `QUESTION: ${question}

RELEVANT QURAN VERSES:
${formattedContext}

Based ONLY on these verses, provide a helpful answer with proper citations.`;

  const response = await client.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: GENERATION_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    max_completion_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "";
  return parseJsonResponse(content, context);
}

/**
 * Verify and refine the answer
 */
export async function verifyAnswer(
  draftAnswer: ChatResponse,
  context: PairedVerse[]
): Promise<ChatResponse> {
  const client = getOpenAIClient();
  const formattedContext = formatContextForPrompt(context);

  const userMessage = `DRAFT ANSWER TO VERIFY:
${draftAnswer.answer_markdown}

CITATIONS CLAIMED: ${JSON.stringify(draftAnswer.citations)}

AVAILABLE QURAN VERSES (ONLY use these):
${formattedContext}

Verify this answer. Remove any unsupported claims. Ensure every paragraph has citations.`;

  const response = await client.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: VERIFICATION_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.1,
    max_completion_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "";
  return parseJsonResponse(content, context);
}

/**
 * Parse JSON response from LLM, with fallback handling
 */
function parseJsonResponse(
  content: string,
  context: PairedVerse[]
): ChatResponse {
  // Try to extract JSON from the response
  let jsonStr = content.trim();

  // Handle markdown code blocks
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate structure
    const answer: ChatResponse = {
      answer_markdown: String(parsed.answer_markdown || ""),
      citations: Array.isArray(parsed.citations)
        ? parsed.citations.map((c: { surah: number; ayah: number }) => ({
            surah: Number(c.surah),
            ayah: Number(c.ayah),
          }))
        : [],
      uncertainty: parsed.uncertainty || null,
    };

    // Post-process: extract any additional citations from the text
    const textCitations = parseCitations(answer.answer_markdown);
    const allCitations = [...answer.citations];

    for (const tc of textCitations) {
      const exists = allCitations.some(
        (c) => c.surah === tc.surah && c.ayah === tc.ayah
      );
      if (!exists) {
        allCitations.push(tc);
      }
    }
    answer.citations = allCitations;

    // Validate citations against context
    const contextRefs = context.map((c) => ({ surah: c.surah, ayah: c.ayah }));
    const validation = validateCitationsAgainstContext(
      answer.answer_markdown,
      contextRefs
    );

    if (!validation.valid && !answer.uncertainty) {
      answer.uncertainty =
        "Some citations may reference verses not in the current context.";
    }

    return answer;
  } catch {
    // Fallback: return the raw content as the answer
    console.error("Failed to parse LLM response as JSON:", content);

    return {
      answer_markdown: content,
      citations: parseCitations(content),
      uncertainty:
        "Response parsing issue - please verify the citations manually.",
    };
  }
}

/**
 * Full generation pipeline: generate + verify
 */
export async function generateVerifiedAnswer(
  question: string,
  context: PairedVerse[]
): Promise<ChatResponse> {
  // Handle empty context
  if (context.length === 0) {
    return {
      answer_markdown:
        "I could not find relevant Quran verses to answer your question. Could you please rephrase or provide more context about what you're looking for?",
      citations: [],
      uncertainty: "No relevant verses found in the database.",
    };
  }

  // Step 1: Generate initial answer
  const draftAnswer = await generateAnswer(question, context);

  // Step 2: Check if all paragraphs have citations
  const paragraphs = splitIntoParagraphs(draftAnswer.answer_markdown);
  const allParagraphsHaveCitations = paragraphs.every(paragraphHasCitation);

  // Step 3: If citations are missing or there's uncertainty, run verification
  if (!allParagraphsHaveCitations || draftAnswer.citations.length === 0) {
    return await verifyAnswer(draftAnswer, context);
  }

  // Otherwise, the draft is good
  return draftAnswer;
}
