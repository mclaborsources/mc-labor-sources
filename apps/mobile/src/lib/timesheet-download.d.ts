import type { RefObject } from 'react';
import type { View } from 'react-native';

export function downloadTimesheetImage(
  ref: RefObject<View | null>,
  filename: string,
): Promise<void>;
