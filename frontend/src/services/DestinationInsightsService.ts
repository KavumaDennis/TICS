/**
 * DestinationInsightsService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches dynamic destination information using public APIs.
 * Uses REST Countries API for country data and OpenWeatherMap for weather.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const OPENWEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY || 'YOUR_OPENWEATHER_API_KEY';
const RESTCOUNTRIES_API_KEY = process.env.EXPO_PUBLIC_RESTCOUNTRIES_API_KEY || '';

export interface DestinationInsight {
  countryName: string;
  capital: string;
  flagUrl: string;
  flagEmoji: string;
  population: number;
  region: string;
  languages: string[];
  currency: string;
  timezone: string;
  weather: {
    tempC: number;
    description: string;
    icon: string;
    humidity: number;
    windSpeed: number;
  } | null;
  topAttractions: string[];
  funFact: string;
}

export async function fetchDestinationInsights(
  query: string
): Promise<DestinationInsight | null> {
  try {
    // Step 1: Get country data from REST Countries API v5
    const countryResponse = await fetch(
      `https://api.restcountries.com/countries/v5/names.common/${encodeURIComponent(query)}?fields=name,capital,flags,population,region,languages,currencies,timezones`,
      {
        headers: {
          'Authorization': `Bearer ${RESTCOUNTRIES_API_KEY}`,
        },
      }
    );

    console.log("Status:", countryResponse.status);
    console.log("OK:", countryResponse.ok);
    console.log("URL:", countryResponse.url);

    if (!countryResponse.ok) {
      // Try searching by capital instead
      const capitalResponse = await fetch(
        `https://api.restcountries.com/countries/v5/capitals/${encodeURIComponent(query)}?fields=name,capital,flags,population,region,languages,currencies,timezones`,
        {
          headers: {
            'Authorization': `Bearer ${RESTCOUNTRIES_API_KEY}`,
          },
        }
      );
      if (!capitalResponse.ok) return null;
      const capitalResponseData = await capitalResponse.json();
      const capitalCountries = capitalResponseData.data?.objects || [];
      if (!capitalCountries.length) return null;
      return await buildInsight(capitalCountries[0]);
    }

    const responseData = await countryResponse.json();
    const countries = responseData.data?.objects || [];
    if (!countries.length) return null;
    return await buildInsight(countries[0]);
  } catch (error) {
    console.warn('[DestinationInsights] fetch error:', error);
    return null;
  }
}

async function buildInsight(country: any): Promise<DestinationInsight> {
  // API v5 returns nested structure: names.common, capitals[0].name, etc.
  const countryName = country.names?.common || country.name?.common || 'Unknown';
  const capital = country.capitals?.[0]?.name || country.capital?.[0] || 'N/A';
  const flagUrl = country.flags?.png || country.flag?.url_png || '';
  const flagEmoji = country.flags?.emoji || country.flag?.emoji || '';
  const population = country.population || 0;
  const region = country.region || 'N/A';
  
  // Languages is an array of objects in v5: [{name: "English", ...}, ...]
  const languages = country.languages
    ? country.languages.map((lang: any) => lang.name || lang)
    : [];
  
  // Currencies is an array of objects in v5: [{code: "UGX", name: "Ugandan shilling", symbol: "Sh"}, ...]
  const currency = country.currencies
    ? country.currencies.map((c: any) => `${c.name} (${c.code}${c.symbol ? ' ' + c.symbol : ''})`).join(', ')
    : 'N/A';
  
  const timezone = country.timezones?.[0] || 'UTC';

  // Step 2: Get weather for the capital city
  let weather: DestinationInsight['weather'] = null;
  if (capital !== 'N/A') {
    try {
      const weatherResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(capital)}&units=metric&appid=${OPENWEATHER_API_KEY}`
      );
      if (weatherResponse.ok) {
        const weatherData = await weatherResponse.json();
        weather = {
          tempC: Math.round(weatherData.main?.temp || 0),
          description: weatherData.weather?.[0]?.description || 'Clear',
          icon: `https://openweathermap.org/img/wn/${weatherData.weather?.[0]?.icon}@2x.png`,
          humidity: weatherData.main?.humidity || 0,
          windSpeed: weatherData.wind?.speed || 0,
        };
      } else {
        console.warn(`Weather API returned ${weatherResponse.status} for ${capital}`);
      }
    } catch (error) {
      console.warn(`Weather fetch error for ${capital}:`, error);
      // Weather is optional, continue without it
    }
  }

  // Step 3: Generate top attractions based on country
  const topAttractions = getTopAttractions(countryName, capital, region);

  // Step 4: Generate fun fact
  const funFact = getFunFact(countryName, population, region);

  return {
    countryName,
    capital,
    flagUrl,
    flagEmoji,
    population,
    region,
    languages,
    currency,
    timezone,
    weather,
    topAttractions,
    funFact,
  };
}

function getTopAttractions(country: string, capital: string, region: string): string[] {
  // Generate dynamic attractions based on country/region context
  // These are contextual suggestions, not hardcoded per-country
  const genericAttractions: string[] = [
    capital !== 'N/A' ? `${capital} City Center & Landmarks` : `National Parks & Nature Reserves`,
    `Local Cuisine & Food Markets`,
  ];

  if (region === 'Africa') {
    genericAttractions.push('Safari & Wildlife Experiences');
    genericAttractions.push('Cultural Heritage Museums');
  } else if (region === 'Europe') {
    genericAttractions.push('Historic Castles & Cathedrals');
    genericAttractions.push('Art Galleries & Museums');
  } else if (region === 'Asia') {
    genericAttractions.push('Ancient Temples & Palaces');
    genericAttractions.push('Street Food Tours');
  } else if (region === 'Americas') {
    genericAttractions.push('National Parks & Hiking Trails');
    genericAttractions.push('Cultural Festivals & Events');
  } else if (region === 'Oceania') {
    genericAttractions.push('Beaches & Coastal Walks');
    genericAttractions.push('Indigenous Cultural Experiences');
  } else {
    genericAttractions.push('Historical Landmarks');
    genericAttractions.push('Local Cultural Experiences');
  }

  return genericAttractions.slice(0, 5);
}

function getFunFact(country: string, population: number, region: string): string {
  const facts = [
    `${country} has a population of ${formatPopulation(population)} people.`,
    population > 100_000_000
      ? `${country} is one of the most populous countries in ${region}.`
      : population < 1_000_000
        ? `${country} is one of the smaller nations, offering an intimate travel experience.`
        : `${country} offers a wonderful blend of culture and nature in ${region}.`,
    `${country} is located in ${region}, with diverse landscapes waiting to be explored.`,
  ];
  return facts[Math.floor(Math.random() * facts.length)];
}

function formatPopulation(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)} billion`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)} million`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)} thousand`;
  return num.toString();
}