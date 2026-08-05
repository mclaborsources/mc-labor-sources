import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';

export async function downloadTimesheetImage(
  ref: RefObject<View | null>,
  _filename: string,
) {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo access is required to save the timesheet image.');
  }
  const uri = await captureRef(ref, {
    format: 'png',
    quality: 1,
    width: 792,
    result: 'tmpfile',
  });
  await MediaLibrary.saveToLibraryAsync(uri);
}
