/**
 * GeminiService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Service for communicating with Google Gemini API for travel recommendations.
 * Gemini should NEVER retrieve data - it should only rank, explain, and personalize
 * using data provided from Firestore and Google Places.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { AIRecommendation, AIDiscoveryResponse, TravelIntent, ExtractedEntities } from './types';

/* ── Types ───────────────────────────────────────────────────────────────────── */

interface GeminiResponse {
  recommendations: Array<{
    destinationName: string;
    country: string;
    explanation: string;
    confidence: number;
    estimatedBudget: { min: number; max: number; currency: string };
    recommendedDuration: string;
    bestTimeToVisit: string;
    travelStyle: string;
    matchReasons: string[];
    travelTips: string[];
  }>;
  followUpSuggestions: string[];
}

/* ── GeminiService ──────────────────────────────────────────────────────────── */

export const GeminiService = {
  /**
   * Call Gemini API with a complete prompt.
   * Uses the Firebase callable function if available, otherwise direct API.
   */
  async callGemini(prompt: string): Promise<GeminiResponse> {
    const startTime = Date.now();

    try {
      // Try Firebase callable first
      const response = await this.callFirebaseFunction(prompt);
      console.log('[GeminiService] Firebase function responded in', Date.now() - startTime, 'ms');
      return response;
    } catch (firebaseErr) {
      console.warn('[GeminiService] Firebase function failed, trying direct API:', firebaseErr);
      
      // Fallback to direct Gemini API
      try {
        const response = await this.callDirectGemini(prompt);
        console.log('[GeminiService] Direct Gemini API responded in', Date.now() - startTime, 'ms');
        return response;
      } catch (directErr) {
        console.error('[GeminiService] Direct Gemini API also failed:', directErr);
        throw directErr;
      }
    }
  },

  /**
   * Call Gemini via Firebase callable function.
   */
  async callFirebaseFunction(prompt: string): Promise<GeminiResponse> {
    // Dynamically import to avoid circular deps
    const { assistantChat } = await import('@/src/firebase/callables');

    const result = await assistantChat({
      message: prompt,
      instruction: 'You are a travel recommendation AI. Return ONLY valid JSON. No markdown, no code blocks, no explanation outside the JSON. Parse the user request and generate structured travel recommendations.',
    });

    if (!result?.answer) {
      throw new Error('Empty response from Gemini function');
    }

    return this.parseGeminiResponse(result.answer);
  },

  /**
   * Call Gemini directly via REST API.
   */
  async callDirectGemini(prompt: string): Promise<GeminiResponse> {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          topP: 0.95,
          topK: 40,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        throw new Error('QUOTA_EXCEEDED');
      } else if (response.status === 500 || response.status === 503) {
        throw new Error('GEMINI_UNAVAILABLE');
      }
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('INVALID_RESPONSE');
    }

    return this.parseGeminiResponse(data.candidates[0].content.parts[0].text);
  },

  /**
   * Parse Gemini's response text into structured JSON.
   */
  parseGeminiResponse(text: string): GeminiResponse {
    // Try direct JSON parse first
    try {
      return JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          // Continue to next attempt
        }
      }

      // Try to find JSON object in the text
      const objectMatch = text.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          // Continue to next attempt
        }
      }

      // If all parsing fails, throw
      throw new Error('INVALID_RESPONSE');
    }
  },

  /**
   * Parse AI discovery from Gemini response.
   */
  async parseAIDiscovery(
    response: GeminiResponse,
    query: string,
    intent: TravelIntent,
    entities: ExtractedEntities,
    destinations: Array<{ name: string; country: string; [key: string]: any }>,
    conversationId: string
  ): Promise<AIDiscoveryResponse> {
    const startTime = Date.now();

    // Map Gemini recommendations to full AIRecommendation objects
    const recommendations: AIRecommendation[] = [];

    for (const rec of response.recommendations || []) {
      // Find matching destination from Firestore data
      const matchingDest = destinations.find(
        (d) => d.name.toLowerCase() === rec.destinationName.toLowerCase()
      );

      if (!matchingDest) {
        console.warn(`[GeminiService] Destination not found in dataset: ${rec.destinationName}`);
        continue; // Skip hallucinated destinations
      }

      recommendations.push({
        destination: matchingDest as any,
        confidence: rec.confidence || 70,
        explanation: rec.explanation || `Recommended based on your preferences`,
        estimatedBudget: rec.estimatedBudget || { min: 0, max: 0, currency: 'USD' },
        weather: undefined, // Filled later by enrichment
        nearbyAttractions: [], // Filled later by enrichment
        events: [], // Filled later by enrichment
        recommendedDuration: rec.recommendedDuration || '3-5 days',
        travelTips: rec.travelTips || [],
        bestTimeToVisit: rec.bestTimeToVisit || 'Year-round',
        travelStyle: rec.travelStyle || 'General',
        matchReasons: rec.matchReasons || [],
      });
    }

    return {
      recommendations,
      intent,
      entities,
      query,
      totalResults: recommendations.length,
      processingTime: Date.now() - startTime,
      source: 'ai',
      conversationId,
      followUpSuggestions: response.followUpSuggestions || [],
    };
  },
};