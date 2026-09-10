"use strict";
import React, { useState, useEffect } from "react";
import { View, Image, TouchableOpacity } from "react-native";
import {
  formatRating,
  getDestinationPrimaryImage,
  DESTINATION_FALLBACK_IMAGE
} from "@/src/modules/explore/utils";
import { Ionicons } from "@expo/vector-icons";
import { SafeText } from "@/src/components/responsive/SafeText";
function CardImage({ destination, className }) {
  const initialUrl = getDestinationPrimaryImage(destination);
  const [uri, setUri] = useState(initialUrl);
  const [failed, setFailed] = useState(false);
  console.log(
    `[IMAGE CARD DEBUG]
destinationId: ${destination.id}
imageSource: ${uri}
isRemote: ${typeof uri === "string" && /^https?:\/\//i.test(uri)}
isFallback: ${uri === DESTINATION_FALLBACK_IMAGE}`
  );
  useEffect(() => {
    setUri(initialUrl);
    setFailed(false);
  }, [initialUrl]);
  const handleError = (e) => {
    console.log(
      `[IMAGE CARD DEBUG]
destinationId: ${destination.id}
onError: fired
failedUrl: ${uri}
isFallback: ${uri === DESTINATION_FALLBACK_IMAGE}
error: ${e instanceof Error ? e.message : String(e?.["nativeEvent"] ?? e ?? "unknown")}`
    );
    if (failed) return;
    console.log(
      `[DestinationImage] load failed
destinationId: ${destination.id}
url: ${uri}
fallbackUsed: true`
    );
    setFailed(true);
    setUri(DESTINATION_FALLBACK_IMAGE);
  };
  return /* @__PURE__ */ React.createElement(
    Image,
    {
      source: { uri },
      className,
      onError: handleError,
      defaultSource: { uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==" }
    }
  );
}
export function DestinationCard({
  destination,
  onPress,
  onCoordinatePress,
  onSavePress,
  isSaved = false,
  compact = false
}) {
  if (compact) {
    return /* @__PURE__ */ React.createElement(
      TouchableOpacity,
      {
        className: "w-[140] h-[180] rounded-[17px] overflow-hidden mr-2.5",
        onPress: () => onPress(destination),
        activeOpacity: 0.8
      },
      /* @__PURE__ */ React.createElement(CardImage, { destination, className: "w-full h-full" }),
      onSavePress && /* @__PURE__ */ React.createElement(
        TouchableOpacity,
        {
          className: "absolute top-8 right-1.5 w-8 h-8 rounded-full bg-tics-amber/55 border border-tics-amber/60 items-center justify-center",
          onPress: () => onSavePress(destination),
          hitSlop: { top: 8, bottom: 8, left: 8, right: 8 }
        },
        /* @__PURE__ */ React.createElement(Ionicons, { name: isSaved ? "bookmark" : "bookmark-outline", size: 16, color: isSaved ? "#F59E0B" : "#FFF" })
      ),
      /* @__PURE__ */ React.createElement(View, { className: "absolute bottom-1 left-1 right-1 p-2.5 bg-tics-amber/40 border border-tics-amber/60 rounded-2xl" }, /* @__PURE__ */ React.createElement(SafeText, { className: "text-tics-text text-sm font-sharetech", numberOfLines: 1 }, destination.name), /* @__PURE__ */ React.createElement(SafeText, { className: "text-tics-text text-[11px] font-sharetech mt-0.5", numberOfLines: 1 }, destination.name, ", ", destination.country))
    );
  }
  return /* @__PURE__ */ React.createElement(
    TouchableOpacity,
    {
      className: "mx-1 p-2 mb-4 rounded-4xl overflow-hidden bg-tics-amber/25 border border-tics-amber/10",
      onPress: () => onPress(destination),
      activeOpacity: 0.9
    },
    /* @__PURE__ */ React.createElement(CardImage, { destination, className: "w-full h-[180] rounded-[28px]" }),
    /* @__PURE__ */ React.createElement(View, { className: "absolute top-5 right-5 bg-black/60 rounded-full px-2 py-1" }, /* @__PURE__ */ React.createElement(SafeText, { className: "text-yellow-400 text-xs font-sharetech" }, "\u2B50 ", formatRating(destination.rating))),
    onSavePress && /* @__PURE__ */ React.createElement(
      TouchableOpacity,
      {
        className: "absolute top-5 left-5 w-10 h-10 rounded-full bg-black/70 items-center justify-center",
        onPress: () => onSavePress(destination),
        hitSlop: { top: 8, bottom: 8, left: 8, right: 8 }
      },
      /* @__PURE__ */ React.createElement(Ionicons, { name: isSaved ? "bookmark" : "bookmark-outline", size: 20, color: isSaved ? "#F59E0B" : "#FFF" })
    ),
    /* @__PURE__ */ React.createElement(View, { className: "" }, /* @__PURE__ */ React.createElement(View, { className: "mt-1 px-1 flex-row items-center" }, /* @__PURE__ */ React.createElement(Ionicons, { name: "location-outline", size: 15, color: "#FFF" }), /* @__PURE__ */ React.createElement(SafeText, { className: "ml-1 text-tics-text text-lg font-sharetech mt-1 px-1" }, destination.name, ", ", destination.country)), /* @__PURE__ */ React.createElement(SafeText, { className: "text-tics-muted px-1 text-[13px] font-sharetech mt-2 leading-[18px]", numberOfLines: 2 }, destination.description), onCoordinatePress && /* @__PURE__ */ React.createElement(
      TouchableOpacity,
      {
        className: "bg-tics-amber/35 border border-tics-amber/20 py-6 rounded-full items-center mt-3",
        onPress: () => onCoordinatePress(destination)
      },
      /* @__PURE__ */ React.createElement(SafeText, { className: "text-white font-sharetech" }, "Coordinate My Journey")
    ))
  );
}
