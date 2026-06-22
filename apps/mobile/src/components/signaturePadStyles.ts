import { StyleSheet } from 'react-native';
import { FF, fonts } from '@/theme/brand';

export const signaturePadStyles = StyleSheet.create({
  wrap: {
    gap: 10,
    marginBottom: 0,
  },
  canvas: {
    borderWidth: 1,
    borderColor: FF.border,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    minHeight: 160,
  },
  webview: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    opacity: 0.99,
  },
  canvasHost: {
    width: '100%',
    height: '100%',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  clearBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FF.border,
  },
  clearText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: FF.textSecondary,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: FF.primary,
    alignItems: 'center',
  },
  saveText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: '#fff',
  },
});
