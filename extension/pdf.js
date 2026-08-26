function wrapText(ctx, text, maxWidth) {
  const tokens = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  const takeChars = (word) => {
    let rest = word;
    while (rest && ctx.measureText(rest).width > maxWidth && rest.length > 1) {
      let cut = rest.length;
      while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut--;
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    return rest;
  };
  for (const raw of tokens) {
    const w = takeChars(raw);
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

function isNumericText(value) {
  const v = String(value ?? "").trim();
  return v === "" || /^-?[\d\s]+([.,]\d+)?$/.test(v);
}

function columnLayout(ctx, headers, rows) {
  ctx.font = "12px sans-serif";
  return headers.map((h, i) => {
    const numeric = rows.length ? rows.every((r) => isNumericText(r[i])) : /Количество|продолжительность|мс/i.test(h);
    const sample = [h, ...rows.slice(0, 40).map((r) => String(r[i] ?? ""))];
    const max = sample.reduce((m, s) => Math.max(m, ctx.measureText(s).width), 0);
    if (numeric) return { width: Math.min(150, Math.max(92, max + 20)), numeric: true };
    return { width: Math.min(380, Math.max(160, max + 24)), numeric: false };
  });
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  return Object.assign(document.createElement("canvas"), { width, height });
}

async function canvasToJpeg(canvas) {
  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 })
    : await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  return new Uint8Array(await blob.arrayBuffer());
}

async function renderTablePage(title, headers, rows, pageNo, pageCount) {
  const probe = createCanvas(8, 8).getContext("2d");
  const cols = columnLayout(probe, headers, rows);
  const width = cols.reduce((s, c) => s + c.width, 0) + 32;
  const rowH = 32;
  const headerH = 58;
  const titleH = 40;
  const height = titleH + headerH + Math.max(rows.length, 1) * rowH + 28;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#313e4f";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 16px sans-serif";
  ctx.fillText(title, 16, 26);
  ctx.fillStyle = "#9aa8b8";
  ctx.font = "11px sans-serif";
  ctx.fillText(`${pageNo} / ${pageCount}`, width - 52, 26);

  const xs = [16];
  for (let i = 0; i < cols.length - 1; i++) xs.push(xs[i] + cols[i].width);

  ctx.fillStyle = "#26303c";
  ctx.fillRect(8, titleH, width - 16, headerH);
  ctx.fillStyle = "#c5d0db";
  ctx.font = "600 11px sans-serif";
  headers.forEach((h, i) => {
    wrapText(ctx, h, cols[i].width - 10).slice(0, 4).forEach((ln, li) => {
      ctx.fillText(ln, xs[i], titleH + 16 + li * 12);
    });
  });

  ctx.font = "12px sans-serif";
  rows.forEach((row, r) => {
    const y = titleH + headerH + r * rowH;
    ctx.fillStyle = r % 2 ? "#354456" : "#313e4f";
    ctx.fillRect(8, y, width - 16, rowH);
    ctx.fillStyle = "#e8edf2";
    row.forEach((cell, i) => {
      const text = wrapText(ctx, String(cell ?? ""), cols[i].width - 10)[0];
      if (cols[i].numeric) {
        const tw = ctx.measureText(text).width;
        ctx.fillText(text, xs[i] + cols[i].width - 14 - tw, y + 20);
      } else {
        ctx.fillText(text, xs[i], y + 20);
      }
    });
  });

  return { jpeg: await canvasToJpeg(canvas), width, height };
}

export async function tableToPdfBlob(title, headers, rows) {
  const perPage = 28;
  const chunks = [];
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  for (let i = 0; i < pages; i++) {
    const slice = rows.slice(i * perPage, (i + 1) * perPage);
    chunks.push(await renderTablePage(title, headers, slice, i + 1, pages));
  }
  return imagesToPdf(chunks);
}

export function imagesToPdf(pages) {
  const encoder = new TextEncoder();
  const objects = [];
  const pageW = 842;
  const kids = [];
  pages.forEach((p, i) => {
    const pageH = Math.round((p.height / p.width) * pageW);
    const pageObj = 3 + i * 3;
    const imgObj = pageObj + 1;
    const contentObj = pageObj + 2;
    kids.push(`${pageObj} 0 R`);
    objects[pageObj - 1] = {
      type: "text",
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>`
    };
    objects[imgObj - 1] = { type: "image", jpeg: p.jpeg, w: p.width, h: p.height };
    const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
    objects[contentObj - 1] = {
      type: "stream",
      body: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    };
  });
  objects[0] = { type: "text", body: "<< /Type /Catalog /Pages 2 0 R >>" };
  objects[1] = { type: "text", body: `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>` };

  const chunks = [encoder.encode("%PDF-1.4\n")];
  const offsets = [0];
  let pos = chunks[0].length;
  for (let i = 0; i < objects.length; i++) {
    if (!objects[i]) continue;
    offsets[i + 1] = pos;
    const header = encoder.encode(`${i + 1} 0 obj\n`);
    chunks.push(header);
    pos += header.length;
    const obj = objects[i];
    if (obj.type === "image") {
      const dict = encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width ${obj.w} /Height ${obj.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${obj.jpeg.length} >>\nstream\n`
      );
      chunks.push(dict, obj.jpeg, encoder.encode("\nendstream\nendobj\n"));
      pos += dict.length + obj.jpeg.length + "\nendstream\nendobj\n".length;
    } else {
      const body = encoder.encode(obj.body + "\nendobj\n");
      chunks.push(body);
      pos += body.length;
    }
  }
  const xrefPos = pos;
  const maxObj = objects.length;
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxObj; i++) {
    xref += `${String(offsets[i] || 0).padStart(10, "0")} 00000 n \n`;
  }
  chunks.push(encoder.encode(`${xref}trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`));
  return new Blob(chunks, { type: "application/pdf" });
}
