/**
 * AlertModal — reusable modal dialog matching the AlertsCenterScreen UI pattern.
 * Replaces native Alert.alert() with a consistent styled modal.
 */
import { Modal, Pressable, Text, View } from 'react-native';

export type AlertModalButton = {
  text: string;
  onPress?: () => void;
  style?: 'primary' | 'cancel' | 'default' | 'destructive';
};

type Props = {
  visible: boolean;
  title: string;
  message: string;
  buttons?: AlertModalButton[];
  onDismiss?: () => void;
};

export default function AlertModal({
  visible,
  title,
  message,
  buttons = [],
  onDismiss,
}: Props) {
  const primaryButton = buttons.find((b) => b.style === 'primary');
  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const destructiveButton = buttons.find((b) => b.style === 'destructive');
  const otherButtons = buttons.filter(
    (b) => b.style !== 'primary' && b.style !== 'cancel' && b.style !== 'destructive'
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss}>
      <View className="flex-1 bg-black/60 items-center justify-center px-2">
        <View className="w-full bg-tics-bg2 rounded-4xl p-6 border border-[#96C7B3]/30">
          {/* Title */}
          <SafeText
            style={{ fontFamily: 'ShareTech_400Regular' }}
            className="text-tics-text text-[18px] mb-2 text-center"
          >
            {title}
          </SafeText>

          {/* Message */}
          <SafeText
            style={{ fontFamily: 'ShareTech_400Regular' }}
            className="text-tics-muted text-[13px] text-center leading-5 mb-6"
          >
            {message}
          </SafeText>

          {/* Primary action */}
          {primaryButton && (
            <Pressable
              onPress={() => {
                primaryButton.onPress?.();
                onDismiss?.();
              }}
              className="bg-tics-amber rounded-full py-6 mb-3"
            >
              <SafeText
                style={{ fontFamily: 'ShareTech_400Regular' }}
                className="text-center text-[#05210f] text-[14px]"
              >
                {primaryButton.text}
              </SafeText>
            </Pressable>
          )}

          {/* Destructive action */}
          {destructiveButton && (
            <Pressable
              onPress={() => {
                destructiveButton.onPress?.();
                onDismiss?.();
              }}
              className="py-6 bg-tics-red rounded-full border border-tics-red/20"
            >
              <SafeText
                style={{ fontFamily: 'ShareTech_400Regular' }}
                className="text-center text-black text-[14px]"
              >
                {destructiveButton.text}
              </SafeText>
            </Pressable>
          )}

          {/* Other action buttons */}
          {otherButtons.map((btn, i) => (
            <Pressable
              key={i}
              onPress={() => {
                btn.onPress?.();
                onDismiss?.();
              }}
              className="border border-[#96C7B3]/50 bg-white/[0.05] rounded-xl py-4 mb-3"
            >
              <SafeText
                style={{ fontFamily: 'ShareTech_400Regular' }}
                className="text-center text-tics-text text-[14px]"
              >
                {btn.text}
              </SafeText>
            </Pressable>
          ))}

          {/* Cancel action - only show if no destructive button */}
          {cancelButton && !destructiveButton && (
            <Pressable
              onPress={() => {
                cancelButton.onPress?.();
                onDismiss?.();
              }}
              className="py-4 rounded-xl border border-[#96C7B3]/50 bg-white/[0.05]"
            >
              <SafeText
                style={{ fontFamily: 'ShareTech_400Regular' }}
                className="text-center text-tics-text text-[14px]"
              >
                {cancelButton.text}
              </SafeText>
            </Pressable>
          )}

          {/* If only one default button, show it */}
          {buttons.length === 1 && buttons[0] && !primaryButton && !cancelButton && (
            <Pressable
              onPress={() => {
                buttons[0].onPress?.();
                onDismiss?.();
              }}
              className="bg-tics-amber rounded-xl py-4"
            >
              <SafeText
                style={{ fontFamily: 'ShareTech_400Regular' }}
                className="text-center text-[#05210f] text-[14px]"
              >
                {buttons[0].text}
              </SafeText>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Hook to manage AlertModal state easily.
 */
import { useCallback, useState } from 'react';
import { SafeText } from '@/src/components/responsive/SafeText';

export function useAlertModal() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<{
    title: string;
    message: string;
    buttons?: AlertModalButton[];
  }>({ title: '', message: '' });

  const showAlert = useCallback(
    (
      title: string,
      message: string,
      buttons?: AlertModalButton[]
    ) => {
      setConfig({ title, message, buttons });
      setVisible(true);
    },
    []
  );

  const hideAlert = useCallback(() => {
    setVisible(false);
  }, []);

  const modal = (
    <AlertModal
      visible={visible}
      title={config.title}
      message={config.message}
      buttons={config.buttons}
      onDismiss={hideAlert}
    />
  );

  return { modal, showAlert, hideAlert };
}
