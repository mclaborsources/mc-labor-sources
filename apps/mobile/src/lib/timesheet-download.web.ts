import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export async function downloadTimesheetImage(
  ref: RefObject<View | null>,
  filename: string,
) {
  const dataUrl = await captureRef(ref, {
    format: 'png',
    quality: 1,
    width: 792,
    result: 'data-uri',
  });
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
