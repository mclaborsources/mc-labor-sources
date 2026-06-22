import { type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, FF } from '@/theme/brand';
import { Button } from './Button';

type ModalSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** When false, body is a plain View (better for signature pads / WebViews). */
  scrollable?: boolean;
  footer?: ReactNode;
  dismissOnBackdrop?: boolean;
};

export function ModalSheet({
  visible,
  title,
  onClose,
  children,
  scrollable = true,
  footer,
  dismissOnBackdrop = true,
}: ModalSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTap}
          onPress={dismissOnBackdrop ? onClose : undefined}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={2}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={FF.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.sheetContent}>
            {scrollable ? (
              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetBodyContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              <View style={styles.sheetBodyStatic}>{children}</View>
            )}
          </View>

          {footer ? (
            <View style={styles.footer}>{footer}</View>
          ) : (
            <Button label="Close" onPress={onClose} variant="ghost" style={styles.closeButton} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: FF.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 12,
  },
  sheetTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 18,
    color: FF.text,
    lineHeight: 24,
  },
  closeBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    padding: 8,
  },
  sheetContent: {
    flexShrink: 1,
    minHeight: 0,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetBodyContent: {
    paddingBottom: 4,
  },
  sheetBodyStatic: {
    flexShrink: 1,
  },
  footer: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: FF.border,
    marginTop: 12,
    paddingTop: 12,
    backgroundColor: FF.card,
  },
  closeButton: { marginTop: 12 },
});
