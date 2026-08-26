function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function tableToPdfBlob(title, headers, rows) {
  const colCount = headers.length;
  const methodW = 280;
  const numW = 110;
  const width = methodW + numW * (colCount - 1) + 32;
  const rowH = 28;
  const headerH = 44;
  const titleH = 36;
  const height = titleH + headerH + Math.max(rows.length, 1) * rowH + 24;

  const canvas = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#313e4f";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 16px sans-serif";
  ctx.fillText(title, 16, 24);

  const xs = [16];
  xs.push(16 + methodW);
  for (let i = 2; i < colCount; i++) xs.push(xs[i - 1] + numW);
  const widths = [methodW, ...Array(colCount - 1).fill(numW)];

  ctx.fillStyle = "#26303c";
  ctx.fillRect(8, titleH, width - 16, headerH);
  ctx.fillStyle = "#c5d0db";
  ctx.font = "600 11px sans-serif";
  headers.forEach((h, i) => {
    const lines = wrapText(ctx, h, widths[i] - 8);
    lines.forEach((ln, li) => {
      ctx.fillText(ln, xs[i], titleH + 18 + li * 12);
    });
  });

  ctx.font = "12px sans-serif";
  rows.forEach((row, r) => {
    const y = titleH + headerH + r * rowH;
    ctx.fillStyle = r % 2 ? "#354456" : "#313e4f";
    ctx.fillRect(8, y, width - 16, rowH);
    ctx.fillStyle = "#e8edf2";
    row.forEach((cell, i) => {
      const text = String(cell ?? "");
      if (i === 0) {
        const lines = wrapText(ctx, text, widths[i] - 8);
        ctx.fillText(lines[0], xs[i], y + 18);
      } else {
        const tw = ctx.measureText(text).width;
        ctx.fillText(text, xs[i] + widths[i] - 12 - tw, y + 18);
      }
    });
  });

  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 })
    : await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  return jpegToPdf(jpeg, width, height);
}

function jpegToPdf(jpeg, w, h) {
  const pageW = 842;
  const pageH = Math.round((h / w) * pageW);
  const objects = [];
  const add = (s) => {
    objects.push(s);
    return objects.length;
  };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  add(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`);
  add(`<< /Length ${`q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`.length} >>\nstream\nq ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q\nendstream`);

  const encoder = new TextEncoder();
  const chunks = [encoder.encode("%PDF-1.4\n")];
  const offsets = [0];
  let pos = chunks[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pos);
    const header = encoder.encode(`${i + 1} 0 obj\n`);
    chunks.push(header);
    pos += header.length;
    if (i === 3) {
      const body = encoder.encode(objects[i] + "\nstream\n");
      chunks.push(body);
      pos += body.length;
      chunks.push(jpeg);
      pos += jpeg.length;
      const end = encoder.encode("\nendstream\nendobj\n");
      chunks.push(end);
      pos += end.length;
    } else {
      const body = encoder.encode(objects[i] + "\nendobj\n");
      chunks.push(body);
      pos += body.length;
    }
  }
  const xrefPos = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  chunks.push(encoder.encode(xref + trailer));
  return new Blob(chunks, { type: "application/pdf" });
}
