"use client";
// Turns an on-screen report into a multi-page A4 PDF plus a JPEG (for apps that only take images).

/**
 * Renders in light mode (prints and shares better) at a laptop-like 820px layout, so a
 * phone's narrow column doesn't become 17 oversized pages. Charts don't re-measure in the
 * copy, so their SVGs are scaled to the new width. (The old export passed the dark theme's
 * raw "222 47% 11%" token as the background, which html2canvas can't parse, so every
 * dark-mode export failed.)
 */
export async function renderReport(el: HTMLElement, name: string): Promise<{ pdf: File; image: File }> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: 820,
    onclone: (doc, root) => {
      doc.documentElement.classList.remove('dark');
      doc.documentElement.classList.add('light');
      doc.documentElement.style.colorScheme = 'light';
      // Entrance animations can still be mid-way (opacity 0) when captured: show everything.
      [root, ...Array.from(root.querySelectorAll<HTMLElement>('[style]'))].forEach(n => {
        if (n.style.opacity) n.style.opacity = '1';
        if (n.style.transform) n.style.transform = 'none';
      });
      root.querySelectorAll<SVGSVGElement>('svg.recharts-surface').forEach(svg => {
        const w = svg.width.baseVal.value, h = svg.height.baseVal.value;
        if (!w || !h) return;
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('width', '100%');
      });
      root.querySelectorAll<HTMLElement>('.recharts-wrapper').forEach(w => { w.style.width = '100%'; });
    },
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 24;
  const scale = (W - 2 * M) / canvas.width;          // canvas px → PDF pt
  const sliceH = Math.floor((H - 2 * M) / scale);     // canvas px that fit on one page
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const h = Math.min(sliceH, canvas.height - y);
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = h;
    part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page > 0) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, canvas.width * scale, h * scale);
  }

  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not make the image'))), 'image/jpeg', 0.9));
  return {
    pdf: new File([pdf.output('blob')], `${name}.pdf`, { type: 'application/pdf' }),
    image: new File([jpeg], `${name}.jpg`, { type: 'image/jpeg' }),
  };
}
