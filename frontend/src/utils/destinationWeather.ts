/** Placeholder destination weather for V1 UI when no live weather API is wired. */
export function placeholderDestinationWeather(destinationCode?: string | null): string {
  const code = (destinationCode ?? '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const map: Record<string, string> = {
    DXB: '28°C · Clear sky',
    JFK: '18°C · Partly cloudy',
    LHR: '15°C · Light rain',
    CDG: '17°C · Broken clouds',
    NBO: '24°C · Sunny',
    LOS: '31°C · Humid',
    ADD: '21°C · Mostly clear',
  };
  return map[code] ?? '—';
}
