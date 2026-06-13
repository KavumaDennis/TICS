import React, { useEffect, useRef, useState } from "react";
import { View, Animated, Dimensions } from "react-native";
import { Image } from "expo-image";

const { width } = Dimensions.get("window");

const images = [
  require("../../assets/images/slide1.jpg"),
  require("../../assets/images/slide2.jpg"),
  require("../../assets/images/slide3.jpg"),
  require("../../assets/images/slide4.jpg"),
  require("../../assets/images/slide5.jpg"),
  require("../../assets/images/slide6.jpg"),
  require("../../assets/images/slide7.jpg"),
  require("../../assets/images/slide8.jpg"),
  require("../../assets/images/slide9.jpg"),
];

export default function ImageSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);

  // controls fade of next image
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      const upcoming = (currentIndex + 1) % images.length;

      setNextIndex(upcoming);

      // IMPORTANT: reset BEFORE animation starts (prevents flicker)
      fadeAnim.setValue(0);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 2200, // slower + smoother
        useNativeDriver: true,
      }).start(() => {
        // after fade completes, commit next image as current
        setCurrentIndex(upcoming);
      });
    }, 6000); // longer display time = smoother feel

    return () => clearInterval(interval);
  }, [currentIndex]);

  return (
    <View
      style={{
        height: 170,
        marginVertical: 25,
        borderRadius: 12,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Base image (always visible) */}
      <Image
        source={images[currentIndex]}
        contentFit="cover"
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
        }}
      />

      {/* Overlay image (fades in smoothly) */}
      <Animated.View
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          opacity: fadeAnim,
        }}
      >
        <Image
          source={images[nextIndex]}
          contentFit="cover"
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      </Animated.View>
    </View>
  );
}