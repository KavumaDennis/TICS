/**
 * AIHubTab — draggable side-mounted handle that opens the AI Hub bottom sheet.
 *
 * - Tap to toggle the AI Hub bottom sheet
 * - Drag/swipe vertically along the right edge of the screen
 * - Swipe up to open, swipe down to close
 * - Movable anywhere along the right side, constrained within screen bounds
 */
import React, { useRef } from 'react';
import { Pressable, View, PanResponder, Dimensions, Animated as RNAnimated } from 'react-native';

import { useAIHubStore } from '@/src/store/aiHubStore';

const HANDLE_HEIGHT = 52;
const HANDLE_WIDTH = 34;
const VISIBLE_STRIP_WIDTH = 16;
const MARGIN_TOP = 80;
const MARGIN_BOTTOM = 120;

export default function AIHubTab() {
  const toggle = useAIHubStore((s) => s.toggle);
  const open = useAIHubStore((s) => s.open);
  const setOpen = useAIHubStore((s) => s.setOpen);

  const screenHeight = Dimensions.get('window').height;

  // The absolute top position (0 = top edge of screen, max = bottom safe limit)
  const absoluteTop = useRef(new RNAnimated.Value(screenHeight * 0.4)).current;
  const currentOffset = useRef(0);

  const minTop = MARGIN_TOP;
  const maxTop = screenHeight - HANDLE_HEIGHT - MARGIN_BOTTOM;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) < 10 && Math.abs(gesture.dy) > 5,
      onPanResponderGrant: () => {
        currentOffset.current = (absoluteTop as any)._value || screenHeight * 0.4;
      },
      onPanResponderMove: (_, gesture) => {
        const newY = Math.min(maxTop, Math.max(minTop, currentOffset.current + gesture.dy));
        absoluteTop.setValue(newY);
      },
      onPanResponderRelease: (_, gesture) => {
        const velocity = gesture.vy;
        const distance = gesture.dy;

        // Detect swipe
        if (distance < -60 || velocity < -0.4) {
          // Swipe up = open
          if (!open) setOpen(true);
        } else if (distance > 60 || velocity > 0.4) {
          // Swipe down = close
          if (open) setOpen(false);
        }

        // Clamp to valid range
        const currentY = (absoluteTop as any)._value || screenHeight * 0.4;
        const clampedY = Math.min(maxTop, Math.max(minTop, currentY));
        RNAnimated.spring(absoluteTop, {
          toValue: clampedY,
          useNativeDriver: false,
          friction: 8,
          tension: 40,
        }).start();
      },
    })
  ).current;

  return (
    <RNAnimated.View
      style={{
        position: 'absolute',
        right: 0,
        top: absoluteTop,
        width: HANDLE_WIDTH,
        height: HANDLE_HEIGHT,
        zIndex: 999,
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      {...panResponder.panHandlers}
    >
      {/* Visible slim strip — tap also toggles */}
      <Pressable
        onPress={toggle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 0 }}
        style={{
          width: VISIBLE_STRIP_WIDTH,
          height: HANDLE_HEIGHT,
          borderTopLeftRadius: 12,
          borderBottomLeftRadius: 12,
          backgroundColor: '#3B82F6',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 6,
        }}
      >
        {/* Small white indicator dot */}
        <View
          style={{
            width: 3,
            height: 15,
            borderRadius: 1.5,
            backgroundColor: 'rgba(255,255,255,0.8)',
          }}
        />
      </Pressable>
    </RNAnimated.View>
  );
}