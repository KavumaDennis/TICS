/**
 * airlineDisplay.ts — safely extract a displayable airline name
 * from a trip's airline field, which may be a plain string or
 * an AirlineEntry object (from earlier versions of the app).
 */

/**
 * Safely extract the airline name string for display.
 * Handles both:
 *   - Plain string: "Emirates"
 *   - AirlineEntry object: { name: "Emirates", iata: "EK", ... }
 *   - null / undefined
 */
export function airlineName(airline: unknown): string {
  if (!airline) return '';
  if (typeof airline === 'string') return airline;
  if (typeof airline === 'object' && airline !== null) {
    const obj = airline as Record<string, unknown>;
    if (typeof obj.name === 'string' && obj.name) return obj.name;
    if (typeof obj.n === 'string' && obj.n) return obj.n;
  }
  return String(airline);
}