import { Platform } from 'react-native';

export function normalizePhoneForMessaging(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone.trim().startsWith('+') ? `+${digits}` : digits;
}

export function createSmsUrl(phone: string, message: string): string {
  const normalized = normalizePhoneForMessaging(phone);
  const separator = Platform.OS === 'ios' ? '&' : '?';
  return `sms:${normalized}${separator}body=${encodeURIComponent(message)}`;
}

export function createWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizePhoneForMessaging(phone).replace(/^\+/, '');
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
