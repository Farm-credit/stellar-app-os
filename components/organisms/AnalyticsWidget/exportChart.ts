function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

export function exportChart(
  containerRef: React.RefObject<HTMLDivElement | null>,
  format: 'png' | 'svg'
): void {
  const container = containerRef.current;
  if (!container) return;

  const svgEl = container.querySelector('svg');
  if (!svgEl) return;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgEl);

  if (format === 'svg') {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'analytics-chart.svg');
    return;
  }

  // PNG export via canvas
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    const w = svgEl.clientWidth || 800;
    const h = svgEl.clientHeight || 400;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    triggerDownload(canvas.toDataURL('image/png'), 'analytics-chart.png');
  };
  img.src = url;
}
