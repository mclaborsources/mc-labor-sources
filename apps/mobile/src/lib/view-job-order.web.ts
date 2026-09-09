import { Asset } from 'expo-asset';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { jobOrderHtml } from './job-order-pdf';

export async function viewJobOrder(snapshot: Record<string, unknown>, orderNumber: string): Promise<string | null> {
  const viewer = window.open('', '_blank');
  if (!viewer) throw new Error('Allow popups to view the job order PDF.');
  viewer.document.title = 'Preparing job order PDF';
  viewer.document.body.textContent = 'Preparing PDF…';
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:742px;height:1000px;border:0;';
  document.body.appendChild(frame);
  try {
    const asset = Asset.fromModule(require('../../assets/notices/job-directions-notice.png'));
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(jobOrderHtml(snapshot, orderNumber, new URL(asset.uri, window.location.href).href));
    doc.close();
    await Promise.all(Array.from(doc.images).map(image => image.decode()));
    await doc.fonts.ready;
    const content = doc.createElement('div');
    while (doc.body.firstChild) content.appendChild(doc.body.firstChild);
    doc.body.appendChild(content);
    // Capture inside the styled iframe. jsPDF.html clones into the app document,
    // losing the iframe's stylesheet and the notice image's size constraints.
    const canvas = await html2canvas(content, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 742 });
    const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
    pdf.setProperties({ title: `Job Order ${orderNumber}` });
    const pointsPerPixel = 556 / canvas.width;
    const pagePixels = Math.floor(736 / pointsPerPixel);
    const contentTop = content.getBoundingClientRect().top;
    const scale = canvas.width / content.getBoundingClientRect().width;
    const blocks = Array.from(content.querySelectorAll('tr, .employee, .protective, .instructions, .footer')).map(element => {
      const rect = element.getBoundingClientRect();
      return { top: Math.floor((rect.top - contentTop) * scale), bottom: Math.ceil((rect.bottom - contentTop) * scale) };
    });
    for (let start = 0; start < canvas.height;) {
      let end = Math.min(start + pagePixels, canvas.height);
      // Keep ordinary rows and notice blocks together when a long order needs another page.
      const crossing = blocks.filter(block => block.top > start && block.top < end && block.bottom > end);
      if (end < canvas.height && crossing.length) end = Math.min(...crossing.map(block => block.top));
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = end - start;
      slice.getContext('2d')!.drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (start > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', 28, 28, 556, slice.height * pointsPerPixel, undefined, 'FAST');
      start = end;
    }
    const url = URL.createObjectURL(pdf.output('blob'));
    if (viewer.closed) { URL.revokeObjectURL(url); return null; }
    viewer.location.replace(url);
    // Retain the bytes while the viewer is open, including for its Download action.
    const cleanup = window.setInterval(() => {
      if (viewer.closed) { URL.revokeObjectURL(url); window.clearInterval(cleanup); }
    }, 5000);
    return null;
  } catch (error) {
    viewer.close();
    throw error;
  } finally {
    frame.remove();
  }
}
