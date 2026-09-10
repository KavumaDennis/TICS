/**
 * PriorityEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Determines the priority of alerts and recommendations based on trip context.
 *
 * Not all alerts have the same importance. This engine assigns priority
 * based on content type, trip type, stage, and transport mode.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { AlertPriority, TripStage, type TripIntelligenceContext } from './TripIntelligenceContext';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PRIORITY DEFINITIONS                                                      */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface PriorityDefinition {
  priority: AlertPriority;
  label: string;
  color: string;
  icon: string;
  ttl: number; // Time-to-live in minutes before priority decays
  requiresImmediateAction: boolean;
}

const PRIORITY_DEFS: Record<AlertPriority, PriorityDefinition> = {
  [AlertPriority.CRITICAL]: {
    priority: AlertPriority.CRITICAL,
    label: 'CRITICAL',
    color: '#EF4444',
    icon: 'alert-circle',
    ttl: 15, // 15 minutes
    requiresImmediateAction: true,
  },
  [AlertPriority.HIGH]: {
    priority: AlertPriority.HIGH,
    label: 'HIGH',
    color: '#F59E0B',
    icon: 'warning',
    ttl: 60, // 1 hour
    requiresImmediateAction: false,
  },
  [AlertPriority.MEDIUM]: {
    priority: AlertPriority.MEDIUM,
    label: 'MEDIUM',
    color: '#3B82F6',
    icon: 'information-circle',
    ttl: 240, // 4 hours
    requiresImmediateAction: false,
  },
  [AlertPriority.LOW]: {
    priority: AlertPriority.LOW,
    label: 'LOW',
    color: '#22C55E',
    icon: 'checkmark-circle',
    ttl: 1440, // 24 hours
    requiresImmediateAction: false,
  },
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  CRITICAL ALERT PATTERNS                                                   */
/*  These patterns always result in CRITICAL priority regardless of context.   */
/* ════════════════════════════════════════════════════════════════════════════ */

const CRITICAL_PATTERNS = [
  'flight cancellation',
  'flight cancelled',
  'road closure',
  'road closed',
  'accident',
  'severe weather',
  'border closure',
  'border closed',
  'emergency',
  'evacuation',
  'natural disaster',
  'terrorist',
  'security threat',
  'medical emergency',
  'hospital',
];

/* ════════════════════════════════════════════════════════════════════════════ */
/*  HIGH PRIORITY PATTERNS                                                    */
/* ════════════════════════════════════════════════════════════════════════════ */

const HIGH_PATTERNS = [
  'heavy traffic',
  'gate change',
  'gate changed',
  'rain warning',
  'heavy rain',
  'hotel check-in',
  'fuel shortage',
  'border delay',
  'flight delay',
  'flight delayed',
  'check-in',
  'boarding',
  'passport',
  'visa',
  'immigration',
  'time zone',
  'timezone',
];

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PRIORITY ENGINE                                                           */
/* ════════════════════════════════════════════════════════════════════════════ */

export class PriorityEngine {
  /**
   * Get the priority definition for a given priority level.
   */
  getPriorityDef(priority: AlertPriority): PriorityDefinition {
    return PRIORITY_DEFS[priority] || PRIORITY_DEFS[AlertPriority.LOW];
  }

  /**
   * Determine the priority of an alert based on its content and context.
   */
  determineAlertPriority(
    title: string,
    message: string,
    context: TripIntelligenceContext,
  ): AlertPriority {
    const combined = `${title} ${message}`.toLowerCase();

    // Check critical patterns first
    for (const pattern of CRITICAL_PATTERNS) {
      if (combined.includes(pattern)) {
        return AlertPriority.CRITICAL;
      }
    }

    // Check high patterns
    for (const pattern of HIGH_PATTERNS) {
      if (combined.includes(pattern)) {
        return AlertPriority.HIGH;
      }
    }

    // Context-based priority adjustments
    // During travelling/returning stages, raise priority
    if (
      context.currentStage === TripStage.TRAVELLING ||
      context.currentStage === TripStage.RETURNING
    ) {
      // Weather-related content becomes HIGH during travel
      if (combined.includes('weather') || combined.includes('rain') || combined.includes('storm')) {
        return AlertPriority.HIGH;
      }
      // Navigation content becomes HIGH during travel
      if (combined.includes('traffic') || combined.includes('route') || combined.includes('road')) {
        return AlertPriority.HIGH;
      }
    }

    // During exploring stage, most alerts are MEDIUM or LOW
    if (context.currentStage === TripStage.EXPLORING) {
      if (combined.includes('event') || combined.includes('festival') || combined.includes('market')) {
        return AlertPriority.MEDIUM;
      }
      return AlertPriority.LOW;
    }

    // During planning stage, most alerts are LOW
    if (context.currentStage === TripStage.PLANNING) {
      return AlertPriority.LOW;
    }

    // Default to MEDIUM
    return AlertPriority.MEDIUM;
  }

  /**
   * Determine the priority of a recommendation based on its category and context.
   */
  determineRecommendationPriority(
    category: string,
    context: TripIntelligenceContext,
  ): AlertPriority {
    const cat = category.toLowerCase();

    // Emergency recommendations are always CRITICAL
    if (cat.includes('emergency') || cat.includes('health') || cat.includes('safety')) {
      return AlertPriority.CRITICAL;
    }

    // Navigation and transport are HIGH during travel
    if (
      (cat.includes('navigation') || cat.includes('transport')) &&
      (context.currentStage === TripStage.TRAVELLING || context.currentStage === TripStage.RETURNING)
    ) {
      return AlertPriority.HIGH;
    }

    // Weather is HIGH during travel/preparing
    if (
      cat.includes('weather') &&
      (context.currentStage === TripStage.TRAVELLING || context.currentStage === TripStage.PREPARING)
    ) {
      return AlertPriority.HIGH;
    }

    // Documents are HIGH during preparing
    if (cat.includes('document') && context.currentStage === TripStage.PREPARING) {
      return AlertPriority.HIGH;
    }

    // Food, accommodation, events are MEDIUM
    if (cat.includes('food') || cat.includes('accommodation') || cat.includes('events')) {
      return AlertPriority.MEDIUM;
    }

    // Shopping, photography, entertainment are LOW
    if (cat.includes('shopping') || cat.includes('photography') || cat.includes('entertainment')) {
      return AlertPriority.LOW;
    }

    // Default based on stage
    switch (context.currentStage) {
      case TripStage.TRAVELLING:
      case TripStage.RETURNING:
        return AlertPriority.HIGH;
      case TripStage.ARRIVING:
      case TripStage.PREPARING:
        return AlertPriority.MEDIUM;
      case TripStage.EXPLORING:
        return AlertPriority.MEDIUM;
      default:
        return AlertPriority.LOW;
    }
  }

  /**
   * Get the TTL (time-to-live) for a given priority.
   * After TTL expires, the alert/recommendation should be re-evaluated.
   */
  getTTL(priority: AlertPriority): number {
    return PRIORITY_DEFS[priority]?.ttl || PRIORITY_DEFS[AlertPriority.LOW].ttl;
  }

  /**
   * Check if a priority requires immediate user action.
   */
  requiresImmediateAction(priority: AlertPriority): boolean {
    return PRIORITY_DEFS[priority]?.requiresImmediateAction || false;
  }

  /**
   * Get all priority definitions.
   */
  getAllPriorities(): PriorityDefinition[] {
    return Object.values(PRIORITY_DEFS);
  }
}

export const priorityEngine = new PriorityEngine();
export default priorityEngine;