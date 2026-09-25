import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export async function downloadEmailEvidencePdf(reportHtml: string, filename: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:940px;height:1000px;border:0;pointer-events:none;';
  document.body.appendChild(frame);

  try {
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error('Could not prepare the PDF document.');
    frameDocument.open();
    frameDocument.write(reportHtml);
    frameDocument.close();
    await frameDocument.fonts.ready;

    const report = frameDocument.querySelector<HTMLElement>('.page');
    if (!report) throw new Error('The email record could not be rendered.');
    const bounds = report.getBoundingClientRect();
    const canvas = await html2canvas(report, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 940,
    });

    const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
    pdf.setProperties({ title: frameDocument.title, subject: 'Customer timesheet email record' });
    const margin = 30;
    const contentWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const contentHeight = pdf.internal.pageSize.getHeight() - margin * 2 - 18;
    const pointsPerPixel = contentWidth / canvas.width;
    const pagePixels = Math.floor(contentHeight / pointsPerPixel);
    const pixelsPerCssPixel = canvas.width / bounds.width;
    const blocks = Array.from(report.querySelectorAll('.summary, .notice, .email, .timesheet, .import, h2, .footer'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: Math.floor((rect.top - bounds.top) * pixelsPerCssPixel),
          bottom: Math.ceil((rect.bottom - bounds.top) * pixelsPerCssPixel),
        };
      });

    let pageNumber = 0;
    for (let start = 0; start < canvas.height;) {
      let end = Math.min(start + pagePixels, canvas.height);
      if (end < canvas.height) {
        const crossing = blocks
          .filter((block) => {
            const blockHeight = block.bottom - block.top;
            return blockHeight <= pagePixels
              && block.top > start + 2
              && block.top < end
              && block.bottom > end;
          })
          .map((block) => block.top);
        if (crossing.length) end = Math.min(...crossing);
      }
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = end - start;
      const context = slice.getContext('2d');
      if (!context) throw new Error('Could not draw a PDF page.');
      context.drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (pageNumber > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, slice.height * pointsPerPixel, undefined, 'FAST');
      pageNumber += 1;
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Page ${pageNumber}`, pdf.internal.pageSize.getWidth() - margin, pdf.internal.pageSize.getHeight() - 20, { align: 'right' });
      start = end;
    }

    pdf.save(filename);
  } finally {
    frame.remove();
  }
}
