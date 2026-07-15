import type { ForwardRefExoticComponent, RefAttributes } from 'react';

export type SignaturePadProps = {
  onSignature: (dataUrl: string) => void;
  onError?: (message: string) => void;
  height?: number;
  showActions?: boolean;
};

export type SignaturePadRef = {
  clear: () => void;
  capture: () => void;
};

export const SignaturePad: ForwardRefExoticComponent<
  SignaturePadProps & RefAttributes<SignaturePadRef>
>;
