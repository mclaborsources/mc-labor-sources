import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { jobOrderHtml } from './job-order-pdf';

export async function viewJobOrder(snapshot: Record<string, unknown>, orderNumber: string): Promise<string | null> {
  const asset = Asset.fromModule(require('../../assets/notices/job-directions-notice.png'));
  await asset.downloadAsync();
  const image = await FileSystem.readAsStringAsync(asset.localUri ?? asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const html = jobOrderHtml(snapshot, orderNumber, `data:image/png;base64,${image}`);
  const result = await Print.printToFileAsync({ html, width: 612, height: 792 });
  const name = orderNumber.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'document';
  const uri = `${FileSystem.cacheDirectory}Job-Order-${name}.pdf`;
  await FileSystem.copyAsync({ from: result.uri, to: uri });
  if (Platform.OS === 'android') {
    const contentUri = await FileSystem.getContentUriAsync(uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contentUri, flags: 1, type: 'application/pdf' });
    return null;
  }
  return uri;
}
