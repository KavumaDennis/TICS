/**
 * EntityExtractor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracts structured information (entities) from natural language travel prompts.
 * Parses budget, dates, locations, travel styles, group sizes, and more.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ExtractedEntities } from './types';

/* ── EntityExtractor ─────────────────────────────────────────────────────────── */

export const EntityExtractor = {
  /**
   * Extract structured entities from a free-text travel prompt.
   */
  extract(prompt: string): ExtractedEntities {
    const entities: ExtractedEntities = {};
    const lowerPrompt = prompt.toLowerCase();

    // 1. Budget extraction
    const budgetResult = this.extractBudget(prompt);
    if (budgetResult) {
      entities.budget = budgetResult.amount;
      entities.currency = budgetResult.currency;
    }

    // 2. Duration extraction
    const duration = this.extractDuration(lowerPrompt);
    if (duration) entities.duration = duration;

    // 3. Travel style extraction
    const travelStyle = this.extractTravelStyle(lowerPrompt);
    if (travelStyle) entities.travelStyle = travelStyle;

    // 4. Season/month extraction
    const seasonInfo = this.extractSeason(lowerPrompt);
    if (seasonInfo) {
      entities.season = seasonInfo.season;
      entities.month = seasonInfo.month;
    }

    // 5. Location extraction
    const locationInfo = this.extractLocation(prompt);
    if (locationInfo) {
      if (locationInfo.currentLocation) entities.currentLocation = locationInfo.currentLocation;
      if (locationInfo.destination) entities.destination = locationInfo.destination;
      if (locationInfo.radius) entities.radius = locationInfo.radius;
      if (locationInfo.preference) entities.preference = locationInfo.preference;
    }

    // 6. Group size extraction
    const groupSize = this.extractGroupSize(lowerPrompt);
    if (groupSize) entities.groupSize = groupSize;

    // 7. Interest extraction
    const interests = this.extractInterests(lowerPrompt);
    if (interests.length > 0) entities.interests = interests;

    // 8. Date extraction
    const dates = this.extractDates(prompt);
    if (dates) entities.dates = dates;

    return entities;
  },

  /**
   * Extract budget amount and currency from text.
   */
  extractBudget(prompt: string): { amount: number; currency: string } | null {
    // Patterns: $800, 800 USD, 500 euros, $500 budget, under $1000
    const patterns = [
      /\$(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i,
      /(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(usd|dollars?)/i,
      /(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(eur|euros?)/i,
      /(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(ugx|shillings?)/i,
      /(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(kes|ksh)/i,
      /(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(tzs|tsh)/i,
      /(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(rws|rwf)/i,
      /budget\s*(?:of\s*)?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i,
      /under\s*\$?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i,
      /(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:dollar|euro)/i,
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (isNaN(amount)) continue;

        // Determine currency
        const context = (match[0] || '').toLowerCase();
        if (context.includes('eur') || context.includes('euro')) {
          return { amount, currency: 'EUR' };
        } else if (context.includes('ugx') || context.includes('shilling')) {
          return { amount, currency: 'UGX' };
        } else if (context.includes('kes') || context.includes('ksh')) {
          return { amount, currency: 'KES' };
        } else if (context.includes('tzs') || context.includes('tsh')) {
          return { amount, currency: 'TZS' };
        } else if (context.includes('rwf') || context.includes('rws')) {
          return { amount, currency: 'RWF' };
        } else {
          return { amount, currency: 'USD' };
        }
      }
    }

    return null;
  },

  /**
   * Extract duration from text.
   */
  extractDuration(prompt: string): string | undefined {
    const patterns = [
      /(\d+)\s*days?/i,
      /(\d+)\s*weeks?/i,
      /(\d+)\s*months?/i,
      /(\d+)-(\d+)\s*days?/i,
      /a\s*(week|month|day|fortnight)/i,
      /one\s*(week|month|day)/i,
      /weekend/i,
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match) {
        if (match[1] && match[2]) {
          return `${match[1]}-${match[2]} days`;
        }
        if (match[1] && !isNaN(parseInt(match[1]))) {
          const num = parseInt(match[1]);
          const unit = match[0].toLowerCase().includes('week') ? 'weeks' : match[0].toLowerCase().includes('month') ? 'months' : 'days';
          return `${num} ${unit}`;
        }
        if (match[0].toLowerCase() === 'weekend') return '2-3 days';
        if (match[1] === 'week' || match[1] === 'month' || match[1] === 'day') {
          return `1 ${match[1]}`;
        }
      }
    }

    return undefined;
  },

  /**
   * Extract travel style from text.
   */
  extractTravelStyle(prompt: string): string | undefined {
    const stylePatterns: Record<string, string[]> = {
      'Beach': ['beach', 'coastal', 'seaside', 'ocean', 'island'],
      'Adventure': ['adventure', 'hiking', 'trekking', 'climbing', 'rafting'],
      'Luxury': ['luxury', '5-star', 'premium', 'exclusive', 'vip'],
      'Budget': ['budget', 'cheap', 'affordable', 'inexpensive'],
      'Cultural': ['culture', 'cultural', 'history', 'heritage', 'museum'],
      'Wildlife': ['wildlife', 'safari', 'animals', 'nature'],
      'Romantic': ['romantic', 'honeymoon', 'couple'],
      'Family': ['family', 'kids', 'children'],
      'Solo': ['solo', 'alone', 'by myself'],
      'Business': ['business', 'work', 'corporate'],
      'Food': ['food', 'cuisine', 'culinary', 'cooking'],
      'Nightlife': ['nightlife', 'party', 'club', 'bar'],
      'Wellness': ['wellness', 'spa', 'yoga', 'retreat', 'relaxation'],
      'Photography': ['photography', 'photo', 'photogenic', 'scenic'],
    };

    for (const [style, keywords] of Object.entries(stylePatterns)) {
      if (keywords.some((k) => prompt.includes(k))) {
        return style;
      }
    }

    return undefined;
  },

  /**
   * Extract season and month from text.
   */
  extractSeason(prompt: string): { season?: string; month?: string } | null {
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];

    const shortMonths = [
      'jan', 'feb', 'mar', 'apr', 'may', 'jun',
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    ];

    // Check for month names
    for (let i = 0; i < monthNames.length; i++) {
      if (prompt.includes(monthNames[i]) || prompt.includes(shortMonths[i])) {
        const month = monthNames[i];
        // Determine season
        let season: string;
        if (i >= 2 && i <= 4) season = 'spring';
        else if (i >= 5 && i <= 7) season = 'summer';
        else if (i >= 8 && i <= 10) season = 'fall';
        else season = 'winter';

        return { season, month };
      }
    }

    // Check for season names
    const seasonPatterns: Record<string, string[]> = {
      'winter': ['winter', 'december', 'january', 'february'],
      'spring': ['spring', 'march', 'april', 'may'],
      'summer': ['summer', 'june', 'july', 'august'],
      'fall': ['fall', 'autumn', 'september', 'october', 'november'],
    };

    for (const [season, keywords] of Object.entries(seasonPatterns)) {
      if (keywords.some((k) => prompt.includes(k))) {
        return { season };
      }
    }

    // Check for "this month" or "next month"
    if (prompt.includes('this month')) {
      const now = new Date();
      return { month: monthNames[now.getMonth()] };
    }

    return null;
  },

  /**
   * Extract location information from text.
   */
  extractLocation(prompt: string): {
    currentLocation?: string;
    destination?: string;
    radius?: number;
    preference?: string;
  } | null {
    const result: {
      currentLocation?: string;
      destination?: string;
      radius?: number;
      preference?: string;
    } = {};

    // "near [location]"
    let match = prompt.match(/near\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$|for|and|this|the|with)/i);
    if (match) {
      result.currentLocation = match[1].trim();
      result.preference = 'Nearby';
      result.radius = 100;
    }

    // "around [location]"
    match = prompt.match(/around\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$|for|and|this|the|with)/i);
    if (match) {
      result.currentLocation = match[1].trim();
      result.preference = 'Nearby';
      result.radius = result.radius || 100;
    }

    // "in [location]" or "to [location]"
    match = prompt.match(/(?:in|to)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$|for|and|this|the|with)/i);
    if (match && !result.currentLocation) {
      result.destination = match[1].trim();
    }

    // "from [location]"
    match = prompt.match(/from\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$|for|and|this|to|the|with)/i);
    if (match) {
      result.currentLocation = match[1].trim();
    }

    // Radius extraction
    match = prompt.match(/(\d+)\s*(km|kilometers?|miles?)\s*(?:radius|around|away)?/i);
    if (match) {
      const value = parseInt(match[1]);
      if (match[2].toLowerCase().startsWith('mi')) {
        result.radius = Math.round(value * 1.609); // Convert miles to km
      } else {
        result.radius = value;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  },

  /**
   * Extract group size from text.
   */
  extractGroupSize(prompt: string): number | undefined {
    const patterns = [
      /(?:group|party|for)\s*(?:of\s*)?(\d+)/i,
      /(\d+)\s*(?:people|persons|pax|travelers|travellers|friends|adults?)/i,
      /just\s*(?:me|myself)/i,
      /solo/i,
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match) {
        if (match[0].toLowerCase().includes('solo') || match[0].toLowerCase().includes('just me')) {
          return 1;
        }
        if (match[1] && !isNaN(parseInt(match[1]))) {
          return parseInt(match[1]);
        }
      }
    }

    return undefined;
  },

  /**
   * Extract interests from text.
   */
  extractInterests(prompt: string): string[] {
    const interestMap: Record<string, string[]> = {
      'Beach & Water': ['beach', 'swimming', 'snorkeling', 'diving', 'surf', 'sailing', 'boating'],
      'Nature': ['nature', 'garden', 'botanical', 'forest', 'mountain', 'lake', 'waterfall'],
      'Wildlife': ['wildlife', 'safari', 'animals', 'birds', 'game drive', 'safari'],
      'Adventure': ['adventure', 'hiking', 'trekking', 'climbing', 'zip line', 'rafting', 'bungee'],
      'Culture': ['culture', 'museum', 'history', 'heritage', 'temple', 'art', 'village'],
      'Food': ['food', 'cooking', 'cuisine', 'restaurant', 'street food', 'wine'],
      'Shopping': ['shopping', 'market', 'mall', 'souvenir'],
      'Nightlife': ['nightlife', 'party', 'club', 'bar', 'entertainment'],
      'Relaxation': ['relax', 'spa', 'wellness', 'massage', 'yoga', 'retreat'],
      'Photography': ['photography', 'photo', 'photogenic', 'scenic', 'sunset'],
      'Sports': ['sports', 'golf', 'tennis', 'cycling', 'running'],
      'Festival': ['festival', 'carnival', 'concert', 'music', 'celebration'],
    };

    const foundInterests: string[] = [];
    for (const [interest, keywords] of Object.entries(interestMap)) {
      if (keywords.some((k) => prompt.toLowerCase().includes(k))) {
        foundInterests.push(interest);
      }
    }

    return foundInterests;
  },

  /**
   * Extract date range from text.
   */
  extractDates(prompt: string): { start?: string; end?: string } | null {
    // Simple date extraction for common patterns
    const datePatterns = [
      /(?:this|next|coming)\s+(?:month|week|weekend|summer|winter|spring|fall)/i,
      /in\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i,
      /(?:during|for)\s+(?:the\s+)?(?:month\s+of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)/i,
    ];

    for (const pattern of datePatterns) {
      const match = prompt.match(pattern);
      if (match) {
        return { start: match[0] };
      }
    }

    return null;
  },
};