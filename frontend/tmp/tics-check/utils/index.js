"use strict";
export function haversineDistance(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
export function formatDistance(km) {
  if (km == null) return "";
  if (km < 1) return `${Math.round(km * 1e3)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}
export function formatPriceLevel(level) {
  if (level == null) return "";
  return "$".repeat(Math.max(1, Math.min(level, 4)));
}
export function formatRating(rating) {
  if (rating == null) return "N/A";
  return rating.toFixed(1);
}
export function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "...";
}
export const DESTINATION_FALLBACK_IMAGE = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400";
const INVALID_URL_VALUES = /* @__PURE__ */ new Set(["", "undefined", "null", "none", "n/a"]);
export function isValidImageUrl(url) {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (INVALID_URL_VALUES.has(trimmed.toLowerCase())) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  if (/^gs:\/\//i.test(trimmed)) return true;
  return false;
}
function firebaseStorageToHttps(gsUrl) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/i.exec(gsUrl.trim());
  if (!match) return null;
  const [, bucket, path] = match;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}
export function resolveDestinationImage(destination) {
  if (!destination || typeof destination !== "object") return null;
  const d = destination;
  const debugId = String(d.id ?? "unknown");
  const debugName = String(d.name ?? "unknown");
  const fields = {
    images: d.images,
    photos: d.photos,
    imageUrl: d.imageUrl,
    image: d.image,
    photoUrl: d.photoUrl,
    coverImage: d.coverImage,
    heroImage: d.heroImage,
    thumbnail: d.thumbnail
  };
  const stringify = (v) => {
    try {
      return JSON.stringify(v) ?? "undefined";
    } catch {
      return "[unserializable]";
    }
  };
  const candidates = [
    d.images?.[0]?.url,
    d.images?.[0]?.uri,
    d.images?.find?.((im) => im?.url)?.url,
    Array.isArray(d.photos) ? d.photos[0]?.url : void 0,
    Array.isArray(d.photos) ? d.photos[0] : void 0,
    typeof d.photos === "string" ? d.photos : void 0,
    d.imageUrl,
    d.image,
    d.photoUrl,
    d.photo,
    d.coverImage,
    d.heroImage,
    d.thumbnail
  ];
  for (const raw of candidates) {
    if (!isValidImageUrl(raw)) continue;
    let url = raw.trim();
    if (/^gs:\/\//i.test(url)) {
      const https = firebaseStorageToHttps(url);
      if (!https) continue;
      url = https;
    }
    console.log(
      `[IMAGE DEBUG]
destinationId: ${debugId}
destinationName: ${debugName}
Firestore image fields: ${stringify(fields)}
resolvedImage: ${url}
resolvedImageType: ${typeof url}
fallbackUsed: false
fallbackReason: n/a`
    );
    return url;
  }
  console.log(
    `[IMAGE DEBUG]
destinationId: ${debugId}
destinationName: ${debugName}
Firestore image fields: ${stringify(fields)}
resolvedImage: null
resolvedImageType: null
fallbackUsed: true
fallbackReason: no candidate image field passed isValidImageUrl (missing/empty/invalid URL)`
  );
  return null;
}
export function getDestinationPrimaryImage(destination) {
  const resolved = resolveDestinationImage(destination);
  if (resolved) return resolved;
  console.log(
    `[DestinationImage] no usable image for destination=${destination?.id ?? "unknown"} name=${destination?.name ?? "unknown"} fallbackUsed=true`
  );
  return DESTINATION_FALLBACK_IMAGE;
}
export function getEventPrimaryImage(event) {
  if (event.images?.length > 0 && event.images[0].url) {
    const url = event.images[0].url;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    console.log(`[getEventPrimaryImage] Invalid image URL for ${event.title}: ${url}`);
  }
  return "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400";
}
export function getCategoryIcon(slug) {
  const iconMap = {
    sports: "football",
    concerts: "musical-notes",
    festivals: "calendar",
    national_parks: "leaf",
    museums: "business",
    food: "restaurant",
    weekend_escapes: "sunny",
    historical_sites: "business",
    beaches: "water",
    business: "briefcase",
    family: "people",
    adventure: "compass",
    religious_tourism: "church",
    wildlife: "paw",
    nightlife: "moon",
    shopping: "cart"
  };
  return iconMap[slug] || "location";
}
export function getCategoryColor(slug) {
  const colorMap = {
    sports: "#FF6B6B",
    concerts: "#6C5CE7",
    festivals: "#FDCB6E",
    national_parks: "#00B894",
    museums: "#0984E3",
    food: "#E17055",
    weekend_escapes: "#FAB1A0",
    historical_sites: "#636E72",
    beaches: "#00CEC9",
    business: "#2D3436",
    family: "#FD79A8",
    adventure: "#E84393",
    religious_tourism: "#A29BFE",
    wildlife: "#55EFC4",
    nightlife: "#2C3E50",
    shopping: "#FF7675"
  };
  return colorMap[slug] || "#0984E3";
}
export function generateSessionToken() {
  return `tics_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
export function formatDateRange(start, end) {
  const options = {
    month: "short",
    day: "numeric",
    year: "numeric"
  };
  const formatDate = (value) => {
    if (value == null) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", options);
  };
  const startStr = formatDate(start);
  const endStr = formatDate(end);
  if (startStr && endStr) return `${startStr} - ${endStr}`;
  if (startStr) return startStr;
  if (endStr) return endStr;
  return "Date TBA";
}
export function isEventHappening(event) {
  if (!event.startDate || !event.endDate) return false;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  const now = /* @__PURE__ */ new Date();
  return now >= start && now <= end;
}
export function isEventUpcoming(event) {
  if (!event.startDate) return false;
  const start = new Date(event.startDate);
  if (isNaN(start.getTime())) return false;
  return start > /* @__PURE__ */ new Date();
}
export function sortNearbyByDistance(items) {
  return [...items].sort((a, b) => a.distance - b.distance);
}
export function sortNearbyByRating(items) {
  return [...items].sort((a, b) => b.rating - a.rating);
}
export function sortNearbyByPopularity(items) {
  return [...items].sort((a, b) => b.reviewCount - a.reviewCount);
}
export function getSeason() {
  const month = (/* @__PURE__ */ new Date()).getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}
export { withTimeout, withTimeoutFallback, PROVIDER_TIMEOUTS } from "./withTimeout";
export { queryClient } from "./queryClient";
export {
  markStart,
  markEnd,
  logTiming,
  getTimings,
  logPerformanceSummary,
  resetTimings
} from "./performance";
