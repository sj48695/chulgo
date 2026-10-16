"use strict";

const EXAMPLES = {
  pipe: {
    name: "배관 예시",
    rows: [
      ["품목", "수량", "규격", "BOX", "EA"],
      ["300연", "24", "300mm/24", "2", "48"],
      ["500연", "12", "500mm/12", "1", "12"],
      ["엘보 20", "30", "20mm", "1", "30"],
      ["엘보 100", "10", "100mm", "1", "10"],
      ["1.6규격", "6", "1.6A", "3", "18"],
      ["1000규격", "12", "1A", "3", "36"],
      ["이경티 400", "20", "40mm", "1", "20"],
      ["900연", "24", "270mm/24", "1", "24"],
    ],
  },
  other: {
    name: "다른 칸 예시",
    rows: [
      ["품명", "규격", "발주", "단위", "비고"],
      ["엘보", "100A", "8", "개", ""],
      ["엘보", "15A", "40", "개", "급행"],
      ["레듀서", "50A", "12", "개", ""],
      ["레듀서", "20A", "24", "개", ""],
      ["니플", "1.6A", "6", "개", ""],
      ["니플", "2A", "6", "개", "재고"],
    ],
  },
};

let grid = [];
let sourceName = "";
let fileLabel = "";
let workbook = null;
let sort = { col: null, dir: 1 };

function tokens(value) {
  const out = [];
  const re = /(\d+(?:\.\d+)?)/g;
  let last = 0;
  let match;
  while ((match = re.exec(value))) {
    if (match.index > last) out.push({ n: false, v: value.slice(last, match.index) });
    out.push({ n: true, v: Number(match[1]) });
    last = match.index + match[1].length;
  }
  if (last < value.length) out.push({ n: false, v: value.slice(last) });
  return out;
}

function compare(a, b, dir) {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const lt = tokens(left);
  const rt = tokens(right);
  const len = Math.max(lt.length, rt.length);
  for (let i = 0; i < len; i += 1) {
    const x = lt[i];
    const y = rt[i];
    if (!x) return -dir;
    if (!y) return dir;
    if (x.n && y.n) {
      if (x.v !== y.v) return dir * (x.v - y.v);
    } else {
      const c = String(x.v).localeCompare(String(y.v), "ko", { sensitivity: "base" });
      if (c) return dir * c;
    }
  }
  return 0;
}

function headerIndex() {
  const raw = document.getElementById("header-row").value.trim();
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1) return 0;
  return n - 1;
}

function showError(message) {
  const el = document.getElementById("error");
  el.hidden = !message;
  el.textContent = message || "";
}

function setSheets(names, current) {
  const label = document.getElementById("sheet-label");
  const select = document.getElementById("sheet");
  select.replaceChildren();
  if (!names || names.length < 2) {
    label.hidden = true;
    return;
  }
  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  });
  select.value = current;
  label.hidden = false;
}

function columnCount() {
  const start = headerIndex();
  let width = 0;
  for (let i = start; i < grid.length; i += 1) width = Math.max(width, grid[i].length);
  return width;
}

function headers() {
  const start = headerIndex();
  const row = grid[start] || [];
  const width = columnCount();
  const out = [];
  for (let i = 0; i < width; i += 1) out.push(String(row[i] ?? "").trim());
  return out;
}

function bodyRows() {
  const start = headerIndex() + 1;
  return grid.slice(start).filter((row) => row.some((cell) => String(cell).trim() !== ""));
}

function numericCols(rows, width) {
  const cols = new Set();
  for (let i = 0; i < width; i += 1) {
    let seen = 0;
    let numeric = 0;
    rows.forEach((row) => {
      const value = String(row[i] ?? "").trim();
      if (!value) return;
      seen += 1;
      if (/^-?\d+(?:\.\d+)?$/.test(value)) numeric += 1;
    });
    if (seen > 0 && numeric === seen) cols.add(i);
  }
  return cols;
}

function sortedBody() {
  const rows = bodyRows().map((row, index) => ({ row, index }));
  if (sort.col == null) return rows;
  const col = sort.col;
  const dir = sort.dir;
  rows.sort((a, b) => compare(a.row[col], b.row[col], dir) || a.index - b.index);
  return rows;
}

function sortLabel(heads) {
  if (sort.col == null) return "원래 순서";
  const name = heads[sort.col] || colLabel(sort.col);
  return name + (sort.dir === 1 ? " 오름차순" : " 내림차순");
}

function colLabel(index) {
  return index + 1 + "열";
}

function applyAutoSort() {
  const idx = headers().findIndex((name) => name.includes("규격"));
  sort = idx >= 0 ? { col: idx, dir: 1 } : { col: null, dir: 1 };
}

function subtitleText() {
  const lines = [];
  const end = headerIndex();
  for (let i = 0; i < end && i < grid.length; i += 1) {
    const text = grid[i].map((cell) => String(cell).trim()).filter(Boolean).join(" ");
    if (text) lines.push(text);
  }
  return lines.join(" · ");
}

function render() {
  const table = document.getElementById("grid");
  const status = document.getElementById("status");
  const subtitle = document.getElementById("subtitle");
  table.replaceChildren();
  const start = headerIndex();
  if (!grid.length) {
    status.textContent = sourceName ? sourceName + " · 읽은 줄 없음" : "열어 둔 파일이 없습니다.";
    subtitle.hidden = true;
    return;
  }
  if (start >= grid.length) {
    showError("제목 줄이 표의 줄 수보다 큽니다.");
    status.textContent = sourceName;
    subtitle.hidden = true;
    return;
  }
  showError("");
  const heads = headers();
  const rows = sortedBody();
  const nums = numericCols(rows.map((item) => item.row), heads.length);
  const sub = subtitleText();
  subtitle.hidden = !sub;
  subtitle.textContent = sub;
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  status.textContent = [today, sourceName, sortLabel(heads), rows.length + "줄"].join(" · ");

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const numTh = document.createElement("th");
  numTh.scope = "col";
  numTh.textContent = "번호";
  numTh.className = "num";
  headRow.append(numTh);
  heads.forEach((name, index) => {
    const th = document.createElement("th");
    th.scope = "col";
    if (nums.has(index)) th.classList.add("num");
    if (sort.col === index) th.setAttribute("aria-sort", sort.dir === 1 ? "ascending" : "descending");
    else th.setAttribute("aria-sort", "none");
    const button = document.createElement("button");
    button.type = "button";
    button.append(document.createTextNode(name || colLabel(index)));
    if (sort.col === index) {
      const mark = document.createElement("span");
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = sort.dir === 1 ? " ↑" : " ↓";
      button.append(mark);
    }
    button.addEventListener("click", () => toggleSort(index));
    th.append(button);
    headRow.append(th);
  });
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  rows.forEach((item, order) => {
    const tr = document.createElement("tr");
    const num = document.createElement("td");
    num.className = "num";
    num.textContent = String(order + 1);
    tr.append(num);
    heads.forEach((_, index) => {
      const td = document.createElement("td");
      if (nums.has(index)) td.classList.add("num");
      td.textContent = String(item.row[index] ?? "");
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(thead, tbody);
}

function toggleSort(index) {
  if (sort.col === index) sort.dir = -sort.dir;
  else sort = { col: index, dir: 1 };
  render();
}

function loadGrid(rows, name) {
  grid = rows.map((row) => (Array.isArray(row) ? row.map((cell) => (cell == null ? "" : String(cell))) : []));
  const at = headerIndex();
  const specAt = (grid[at] || []).findIndex((head) => normHead(head).includes("규격"));
  if (specAt >= 0) {
    for (let i = at + 1; i < grid.length; i += 1) {
      // ponytail: this sheet's "/" is often read as 7, so 724 means /24
      if (grid[i][specAt]) grid[i][specAt] = grid[i][specAt].replace(/7(24|20|12|6|4|2)$/, "/$1");
    }
  }
  sourceName = name;
  applyAutoSort();
  render();
}

let shotUrls = [];
let workerPromise = null;
let batchNote = "";

function hideShots() {
  shotUrls.forEach((url) => URL.revokeObjectURL(url));
  shotUrls = [];
  const box = document.getElementById("shots");
  box.replaceChildren();
  box.hidden = true;
}

function showShots(files) {
  hideShots();
  const box = document.getElementById("shots");
  files.forEach((file, index) => {
    const img = document.createElement("img");
    const url = URL.createObjectURL(file);
    shotUrls.push(url);
    img.src = url;
    img.alt = (file.name || (index + 1) + "쪽") + " 사진";
    box.append(img);
  });
  box.hidden = files.length === 0;
}

function loadExample(key) {
  workbook = null;
  fileLabel = "";
  document.getElementById("file").value = "";
  document.getElementById("header-row").value = "1";
  setSheets([], "");
  showError("");
  hideShots();
  loadGrid(EXAMPLES[key].rows, EXAMPLES[key].name);
}

function assetUrl(path) {
  const root = document.documentElement.getAttribute("data-root") || "/";
  return new URL(path.replace(/^\//, ""), new URL(root, window.location.href)).href;
}

function ocrStatus(message) {
  const known = {
    "loading tesseract core": "읽기 도구를 준비하는 중입니다.",
    "initializing tesseract": "읽기 도구를 준비하는 중입니다.",
    "loading language traineddata": "한글을 준비하는 중입니다.",
    "initializing api": "한글을 준비하는 중입니다.",
    "recognizing text": "사진을 읽는 중입니다.",
  };
  const label = known[message.status] || "사진을 읽는 중입니다.";
  const progress = typeof message.progress === "number" ? " " + Math.round(message.progress * 100) + "%" : "";
  document.getElementById("status").textContent = (batchNote ? batchNote + " · " : "") + label + progress;
}

function getWorker() {
  if (typeof Tesseract === "undefined") return Promise.reject(new Error("ocr"));
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("kor+eng", 1, {
      workerPath: assetUrl("/vendor/ocr/worker.min.js"),
      corePath: assetUrl("/vendor/ocr/tesseract-core-simd-lstm.wasm.js"),
      langPath: assetUrl("/vendor/ocr"),
      cacheMethod: "none",
      gzip: false,
      workerBlobURL: false,
      logger: ocrStatus,
    }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

function decodeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

function prepCanvas(img) {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const long = Math.max(width, height);
  const scale = long < 1800 ? Math.min(3, 1800 / long) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function wordsFromResult(data) {
  const out = [];
  const push = (word) => {
    if (!word) return;
    const bbox = word.bbox || { x0: word.x0, y0: word.y0, x1: word.x1, y1: word.y1 };
    if (!bbox || bbox.x0 == null) return;
    out.push({ text: word.text || "", confidence: word.confidence, bbox });
  };
  (data.words || []).forEach(push);
  if (out.length) return out;
  (data.blocks || []).forEach((block) => {
    (block.paragraphs || []).forEach((paragraph) => {
      (paragraph.lines || []).forEach((line) => {
        (line.words || []).forEach(push);
      });
    });
  });
  return out;
}

function clusterWords(words) {
  const heights = words.map((word) => Math.max(1, word.bbox.y1 - word.bbox.y0)).sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)] || 12;
  const rowTol = medH * 0.65;
  const sorted = words.slice().sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const rows = [];
  sorted.forEach((word) => {
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    let row = null;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 4; i -= 1) {
      if (Math.abs(rows[i].cy - cy) <= rowTol) {
        row = rows[i];
        break;
      }
    }
    if (!row) {
      row = { cy, words: [] };
      rows.push(row);
    } else {
      row.cy = (row.cy * row.words.length + cy) / (row.words.length + 1);
    }
    row.words.push(word);
  });
  const cells = [];
  rows.forEach((row, ri) => {
    const line = row.words.slice().sort((a, b) => a.bbox.x0 - b.bbox.x0);
    let cur = null;
    line.forEach((word) => {
      const text = String(word.text || "").trim();
      if (!text) return;
      if (!cur || word.bbox.x0 - cur.x1 > medH * 0.9) {
        cur = { ri, x0: word.bbox.x0, x1: word.bbox.x1, text };
        cells.push(cur);
      } else {
        const gap = word.bbox.x0 - cur.x1;
        const hangul = /[가-힣]$/.test(cur.text) && /^[가-힣]/.test(text);
        const space = !hangul && gap > medH * 0.28 ? " " : "";
        cur.text += space + text;
        cur.x1 = Math.max(cur.x1, word.bbox.x1);
      }
    });
  });
  if (!cells.length) return { rows: [], cols: [] };
  const colTol = medH * 1.5;
  const cols = [];
  cells.slice().sort((a, b) => a.x0 - b.x0).forEach((cell) => {
    const col = cols.find((item) => Math.abs(item.x - cell.x0) <= colTol);
    if (!col) cols.push({ x: cell.x0, n: 1 });
    else {
      col.x = (col.x * col.n + cell.x0) / (col.n + 1);
      col.n += 1;
    }
  });
  cols.sort((a, b) => a.x - b.x);
  const gridRows = rows.map(() => cols.map(() => ""));
  cells.forEach((cell) => {
    let best = 0;
    let dist = Infinity;
    cols.forEach((col, index) => {
      const gap = Math.abs(col.x - cell.x0);
      if (gap < dist) {
        dist = gap;
        best = index;
      }
    });
    gridRows[cell.ri][best] = gridRows[cell.ri][best] ? gridRows[cell.ri][best] + " " + cell.text : cell.text;
  });
  return {
    rows: gridRows.filter((row) => row.some((cell) => cell.trim())),
    cols,
  };
}

function tableFromWords(words, width) {
  const usable = words.filter((word) => String(word.text || "").trim() && (word.confidence == null || word.confidence >= 35));
  if (usable.length < 3) return { rows: [], split: false };
  const whole = clusterWords(usable);
  const xs = (whole.cols || []).map((col) => col.x);
  const gaps = [];
  for (let i = 1; i < xs.length; i += 1) {
    gaps.push({ gap: xs[i] - xs[i - 1], mid: (xs[i] + xs[i - 1]) / 2 });
  }
  const sizes = gaps.map((item) => item.gap).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 1;
  const candidate = gaps
    .filter((item) => item.mid > width * 0.3 && item.mid < width * 0.7 && item.gap > median * 2.4 && item.gap > width * 0.05)
    .sort((a, b) => b.gap - a.gap)[0];
  if (!candidate) return { rows: whole.rows, split: false };
  const left = clusterWords(usable.filter((word) => (word.bbox.x0 + word.bbox.x1) / 2 < candidate.mid));
  const right = clusterWords(usable.filter((word) => (word.bbox.x0 + word.bbox.x1) / 2 >= candidate.mid));
  if (left.rows.length < 2 || right.rows.length < 2 || left.cols.length < 2 || right.cols.length < 2) {
    return { rows: whole.rows, split: false };
  }
  const colCount = Math.max(...left.rows.concat(right.rows).map((row) => row.length));
  const pad = (rows) => rows.map((row) => {
    const copy = row.slice();
    while (copy.length < colCount) copy.push("");
    return copy;
  });
  return { rows: pad(left.rows).concat(pad(right.rows)), split: true };
}

function setBusy(busy) {
  document.querySelectorAll(".toolbar button, #file, #header-row, #sheet").forEach((el) => {
    el.disabled = busy;
  });
}

function normHead(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function isNoiseRow(row) {
  const text = row.map((cell) => String(cell ?? "").trim()).join("");
  return !text || /^[.\-_=·•…~\s]+$/.test(text);
}

function isHeaderRepeat(heads, row) {
  const keys = new Set(heads.map(normHead).filter(Boolean));
  if (keys.size < 2) return false;
  let hit = 0;
  row.forEach((cell) => {
    if (keys.has(normHead(cell))) hit += 1;
  });
  return hit >= Math.min(3, keys.size);
}

function isTotalRow(row) {
  return row.some((cell) => {
    const name = normHead(cell);
    return name === "합계" || name.startsWith("합계");
  });
}

function findHeader(rows) {
  let best = -1;
  let score = 0;
  rows.forEach((row, index) => {
    const names = row.map((cell) => normHead(cell));
    let s = 0;
    ["규격", "품명", "품목", "코드", "입수", "수량", "비고"].forEach((key) => {
      if (names.some((name) => name.includes(key))) s += 2;
    });
    const filled = names.filter(Boolean).length;
    if (filled >= 3 && filled <= 12) s += 1;
    if (s > score) {
      score = s;
      best = index;
    }
  });
  if (score >= 2) return best;
  const fallback = headerIndex();
  return fallback < rows.length ? fallback : 0;
}

function extractPart(rows) {
  const clean = rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : []));
  const headAt = findHeader(clean);
  const heads = (clean[headAt] || []).map((cell) => cell.trim());
  while (heads.length && !normHead(heads[heads.length - 1])) heads.pop();
  const body = [];
  for (let i = headAt + 1; i < clean.length; i += 1) {
    const row = clean[i].slice(0, heads.length);
    if (isNoiseRow(row)) continue;
    if (isTotalRow(row)) break;
    if (isHeaderRepeat(heads, row)) continue;
    body.push(row);
  }
  return {
    heads,
    body,
    before: clean.slice(0, headAt).filter((row) => !isNoiseRow(row)),
  };
}

function headScore(name) {
  const text = normHead(name);
  let score = 0;
  ["규격", "품명", "품목", "코드", "입수", "수량", "비고", "단위", "box", "ea"].forEach((key) => {
    if (text.includes(key)) score += 3;
  });
  if (/[가-힣]/.test(String(name ?? ""))) score += 1;
  return score;
}

function sameShape(left, right) {
  if (!left.length || left.length !== right.length) return false;
  let matches = 0;
  let named = 0;
  left.forEach((name, index) => {
    const a = normHead(name);
    const b = normHead(right[index]);
    if (a) named += 1;
    if (a && a === b) matches += 1;
  });
  return matches >= Math.max(1, Math.ceil((named || 1) * 0.5));
}

function adoptHead(canon, index, name) {
  const next = String(name || "").trim();
  const current = canon[index] || "";
  if (!normHead(current) && normHead(next)) canon[index] = next;
  else if (headScore(current) === 0 && headScore(next) > 0) canon[index] = next;
}

function combine(parts) {
  const canon = parts[0].heads.map((name) => String(name || "").trim());
  const bodies = [];
  const pad = () => {
    bodies.forEach((row) => {
      while (row.length < canon.length) row.push("");
    });
  };
  parts.forEach((part, index) => {
    const specCanon = canon.findIndex((name) => normHead(name).includes("규격"));
    const specPart = part.heads.findIndex((name) => normHead(name).includes("규격"));
    if (index > 0 && specCanon >= 0 && specPart >= 0) {
      const mapped = part.heads.map((_, col) => col - specPart + specCanon);
      const shift = -Math.min(0, ...mapped);
      if (shift) {
        for (let i = 0; i < shift; i += 1) canon.unshift("");
        bodies.forEach((row) => {
          for (let i = 0; i < shift; i += 1) row.unshift("");
        });
      }
      const max = Math.max(canon.length - 1, ...mapped.map((col) => col + shift));
      while (canon.length <= max) canon.push("");
      mapped.forEach((col, headIndex) => adoptHead(canon, col + shift, part.heads[headIndex]));
      part.body.forEach((row) => {
        const dest = canon.map(() => "");
        row.forEach((cell, col) => {
          const at = mapped[col] + shift;
          const text = String(cell ?? "").trim();
          if (!text || at < 0 || at >= dest.length) return;
          dest[at] = dest[at] ? dest[at] + " " + text : text;
        });
        bodies.push(dest);
      });
      pad();
      return;
    }
    const aligned = index === 0 || sameShape(canon, part.heads);
    if (!aligned) {
      const map = new Map();
      canon.forEach((name, col) => {
        const key = normHead(name);
        if (key && !map.has(key)) map.set(key, col);
      });
      const colOf = part.heads.map((name) => {
        const key = normHead(name);
        if (key && map.has(key)) return map.get(key);
        if (!key) return -1;
        const at = canon.length;
        canon.push(String(name).trim());
        map.set(key, at);
        return at;
      });
      part.body.forEach((row) => {
        const dest = canon.map(() => "");
        row.forEach((cell, col) => {
          const destCol = colOf[col];
          const text = String(cell ?? "").trim();
          if (destCol == null || destCol < 0 || !text) return;
          dest[destCol] = dest[destCol] ? dest[destCol] + " " + text : text;
        });
        bodies.push(dest);
      });
      pad();
      return;
    }
    if (index > 0) part.heads.forEach((name, col) => adoptHead(canon, col, name));
    part.body.forEach((row) => {
      bodies.push(canon.map((_, col) => String(row[col] ?? "").trim()));
    });
    pad();
  });
  const keep = canon.map((_, col) => bodies.some((row) => String(row[col] ?? "").trim()));
  if (keep.some(Boolean) && keep.some((used) => !used)) {
    const nextHeads = [];
    const usedCols = [];
    canon.forEach((name, col) => {
      if (!keep[col]) return;
      nextHeads.push(name);
      usedCols.push(col);
    });
    canon.splice(0, canon.length, ...nextHeads);
    bodies.forEach((row, index) => {
      bodies[index] = usedCols.map((col) => row[col] || "");
    });
  }
  const before = (parts[0].before || []).filter((row) => !isNoiseRow(Array.isArray(row) ? row : [row]));
  return { rows: before.concat([canon], bodies), headerAt: before.length };
}

function cellsByLine(words) {
  const heights = words.map((word) => Math.max(1, word.bbox.y1 - word.bbox.y0)).sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)] || 12;
  const rowTol = medH * 0.65;
  const sorted = words.slice().sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const rows = [];
  sorted.forEach((word) => {
    const text = String(word.text || "").trim();
    if (!text) return;
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    let row = null;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 4; i -= 1) {
      if (Math.abs(rows[i].cy - cy) <= rowTol) {
        row = rows[i];
        break;
      }
    }
    if (!row) {
      row = { cy, words: [] };
      rows.push(row);
    } else {
      row.cy = (row.cy * row.words.length + cy) / (row.words.length + 1);
    }
    row.words.push(word);
  });
  return rows.map((row) => {
    const line = row.words.slice().sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const cells = [];
    line.forEach((word) => {
      const text = String(word.text || "").trim();
      const cur = cells[cells.length - 1];
      if (!cur || word.bbox.x0 - cur.x1 > medH * 0.9) {
        cells.push({ x0: word.bbox.x0, x1: word.bbox.x1, text });
        return;
      }
      const gap = word.bbox.x0 - cur.x1;
      const hangul = /[가-힣]$/.test(cur.text) && /^[가-힣]/.test(text);
      const space = !hangul && gap > medH * 0.28 ? " " : "";
      cur.text += space + text;
      cur.x1 = Math.max(cur.x1, word.bbox.x1);
    });
    return { cy: row.cy, cells, medH };
  }).filter((row) => row.cells.length);
}

function anchorTable(lines) {
  let best = -1;
  let score = 0;
  lines.forEach((line, index) => {
    const text = line.cells.map((cell) => normHead(cell.text)).join("");
    let s = 0;
    ["규격", "품명", "품목", "코드", "입수", "수량"].forEach((key) => {
      if (text.includes(key)) s += 2;
    });
    if (line.cells.length >= 3 && line.cells.length <= 12) s += 1;
    if (s > score) {
      score = s;
      best = index;
    }
  });
  if (score < 2 || best < 0) return null;
  const medH = lines[best].medH || 16;
  const anchors = [];
  lines[best].cells.forEach((cell) => {
    const prev = anchors[anchors.length - 1];
    if (prev && cell.text.length <= 2 && prev.text.length <= 2 && cell.x0 - prev.x1 < medH * 1.6) {
      prev.text += cell.text;
      prev.x1 = Math.max(prev.x1, cell.x1);
      return;
    }
    anchors.push({ x0: cell.x0, x1: cell.x1, text: cell.text.trim() });
  });
  if (anchors.length < 2 || anchors.length > 16) return null;
  const heads = anchors.map((cell) => cell.text);
  const edges = anchors.map((cell, index) => (index === 0 ? -Infinity : (anchors[index - 1].x0 + cell.x0) / 2));
  const before = [];
  for (let index = 0; index < best; index += 1) {
    const text = lines[index].cells.map((cell) => cell.text).join(" ").trim();
    if (text.includes("출고") || text.includes("작업")) before.push([text]);
  }
  const body = [];
  for (let index = best + 1; index < lines.length; index += 1) {
    const dest = heads.map(() => "");
    lines[index].cells.forEach((cell) => {
      let col = anchors.length - 1;
      for (let i = 1; i < edges.length; i += 1) {
        if (cell.x0 < edges[i]) {
          col = i - 1;
          break;
        }
      }
      const text = cell.text.trim();
      if (!text) return;
      dest[col] = dest[col] ? dest[col] + " " + text : text;
    });
    if (isNoiseRow(dest)) continue;
    if (isTotalRow(dest)) break;
    if (isHeaderRepeat(heads, dest)) continue;
    body.push(dest);
  }
  if (!body.length) return null;
  return { heads, body, before };
}

function usefulWords(data) {
  return wordsFromResult(data).filter((word) => {
    const text = String(word.text || "").trim();
    if (!text || /^[.\-_=·•…~]+$/.test(text)) return false;
    if (word.confidence != null && word.confidence >= 0 && word.confidence < 35) return false;
    return true;
  });
}

// ponytail: low-confidence 5–8 digit words stay only if they sit in the 코드 column. A code read as 4 digits stays blank.
function rescueCodes(raw, kept) {
  let limit = 0;
  cellsByLine(kept).forEach((line) => {
    const code = line.cells.find((cell) => normHead(cell.text).includes("코드"));
    if (!code) return;
    const next = line.cells.find((cell) => cell.x0 > code.x1);
    limit = next ? (code.x0 + next.x0) / 2 : code.x1 + (line.medH || 16) * 4;
  });
  if (!limit) return kept;
  const extra = raw.filter((word) => {
    const text = String(word.text || "").trim();
    if (!/^\d{5,8}\.?$/.test(text) || word.bbox.x0 > limit) return false;
    return word.confidence != null && word.confidence >= 0 && word.confidence < 35;
  });
  return extra.length ? kept.concat(extra) : kept;
}

function prepareCanvas(img) {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const base = document.createElement("canvas");
  base.width = Math.max(1, width);
  base.height = Math.max(1, height);
  const ctx = base.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, base.width, base.height);
  ctx.drawImage(img, 0, 0, base.width, base.height);
  const image = ctx.getImageData(0, 0, base.width, base.height);
  const pixels = image.data;
  const dark = new Uint16Array(base.height);
  for (let y = 0; y < base.height; y += 1) {
    let count = 0;
    for (let x = 0; x < base.width; x += 1) {
      const i = (y * base.width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const low = Math.min(r, g, b);
      const high = Math.max(r, g, b);
      if (low > 70 && high - low < 45) {
        pixels[i] = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
      } else if (x % 2 === 0 && r + g + b < 280) count += 1;
    }
    dark[y] = count;
  }
  ctx.putImageData(image, 0, 0);
  const bands = [];
  let start = -1;
  for (let y = 0; y < base.height; y += 1) {
    const on = dark[y] > 4;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      if (y - start >= 3) bands.push([start, y - 1]);
      start = -1;
    }
  }
  if (start >= 0 && base.height - start >= 3) bands.push([start, base.height - 1]);
  if (bands.length < 5 || bands.length > 80) return prepCanvas(img);
  const scale = 2;
  const gap = 8;
  let total = gap;
  bands.forEach(([top, bottom]) => {
    const srcY = Math.max(0, top - 1);
    const srcH = Math.min(base.height - srcY, bottom + 2 - srcY);
    total += srcH * scale + gap;
  });
  const canvas = document.createElement("canvas");
  canvas.width = base.width * scale;
  canvas.height = Math.max(1, total);
  const out = canvas.getContext("2d");
  out.fillStyle = "#ffffff";
  out.fillRect(0, 0, canvas.width, canvas.height);
  let y = gap;
  bands.forEach(([top, bottom]) => {
    const srcY = Math.max(0, top - 1);
    const srcH = Math.min(base.height - srcY, bottom + 2 - srcY);
    const destH = srcH * scale;
    out.drawImage(base, 0, srcY, base.width, srcH, 0, y, canvas.width, destH);
    y += destH + gap;
  });
  return canvas;
}

async function readImageTable(file) {
  const img = await decodeImage(file);
  const canvas = prepareCanvas(img);
  const worker = await getWorker();
  const result = await worker.recognize(canvas, { tessedit_pageseg_mode: "6" });
  const data = result.data || {};
  const words = rescueCodes(wordsFromResult(data), usefulWords(data));
  const anchored = anchorTable(cellsByLine(words));
  if (anchored) return anchored;
  const built = tableFromWords(words, canvas.width);
  const colCount = built.rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (!built.rows.length || colCount > 16) {
    return { error: "글자가 작거나 흐려서 칸을 나누지 못했습니다. 지시서 한 장이 크게 나오게 다시 찍어 주세요." };
  }
  const part = extractPart(built.rows);
  if (!part.body.length) return { error: "글자가 작거나 흐려서 칸을 나누지 못했습니다. 지시서 한 장이 크게 나오게 다시 찍어 주세요." };
  return part;
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => String(value).trim() !== ""));
}

function detectDelimiter(text) {
  const sample = String(text).replace(/^\uFEFF/, "").slice(0, 2000);
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return tabs > commas ? "\t" : ",";
}

function sheetToRows(book, name) {
  const sheet = book.Sheets[name];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
}

function openWorkbook(book, sheetName) {
  const names = book.SheetNames || [];
  if (!names.length) {
    showError("이 파일에서 시트를 찾지 못했습니다.");
    return;
  }
  workbook = book;
  const current = names.includes(sheetName) ? sheetName : names[0];
  setSheets(names, current);
  const label = names.length > 1 ? fileLabel + " · " + current : fileLabel;
  loadGrid(sheetToRows(book, current), label);
}

function fileExt(file) {
  return (file.name.split(".").pop() || "").toLowerCase();
}

function isImageFile(file) {
  const ext = fileExt(file);
  return file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif", "tif", "tiff"].includes(ext);
}

function isWorkbook(file) {
  const ext = fileExt(file);
  return ext === "xlsx" || ext === "xls";
}

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
}

function readWorkbookFile(file) {
  fileLabel = file.name;
  document.getElementById("header-row").value = "1";
  hideShots();
  showError("");
  if (typeof XLSX === "undefined") {
    showError("Excel을 읽지 못했습니다. 같은 위키의 읽기 파일이 함께 있어야 합니다.");
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showError("파일을 읽지 못했습니다.");
  reader.onload = () => {
    try {
      const book = XLSX.read(reader.result, { type: "array" });
      openWorkbook(book, book.SheetNames[0]);
    } catch (err) {
      showError("이 Excel 파일에서 표를 읽지 못했습니다.");
    }
  };
  reader.readAsArrayBuffer(file);
}

async function readAny(file) {
  const ext = fileExt(file);
  if (isImageFile(file)) {
    try {
      return await readImageTable(file);
    } catch (err) {
      return { error: "이 사진을 읽지 못했습니다. JPG나 PNG로 저장했는지 확인해 주세요." };
    }
  }
  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    const text = await readText(file);
    const delimiter = ext === "tsv" ? "\t" : ext === "csv" ? "," : detectDelimiter(text);
    const part = extractPart(parseDelimited(text, delimiter));
    if (!part.body.length) return { error: "줄을 찾지 못했습니다." };
    return part;
  }
  if (isWorkbook(file)) {
    if (typeof XLSX === "undefined") return { error: "Excel을 읽지 못했습니다. 같은 위키의 읽기 파일이 함께 있어야 합니다." };
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const name = (book.SheetNames || [])[0];
      if (!name) return { error: "시트를 찾지 못했습니다." };
      const part = extractPart(sheetToRows(book, name));
      if (!part.body.length) return { error: "줄을 찾지 못했습니다." };
      return part;
    } catch (err) {
      return { error: "이 Excel 파일에서 표를 읽지 못했습니다." };
    }
  }
  return { error: "사진, CSV, Excel 파일만 열 수 있습니다." };
}

async function readFiles(fileList) {
  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length) return;
  document.getElementById("header-row").value = "1";
  workbook = null;
  fileLabel = "";
  setSheets([], "");
  showError("");
  if (files.length === 1 && isWorkbook(files[0])) {
    readWorkbookFile(files[0]);
    return;
  }
  showShots(files.filter(isImageFile));
  setBusy(true);
  const parts = [];
  const problems = [];
  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      batchNote = files.length > 1 ? (i + 1) + "/" + files.length : "";
      document.getElementById("status").textContent = (batchNote ? batchNote + " · " : "") + "읽는 중입니다.";
      try {
        const part = await readAny(file);
        if (part.error || !part.body || !part.body.length) problems.push(file.name + " — " + (part.error || "줄을 찾지 못했습니다."));
        else parts.push(part);
      } catch (err) {
        problems.push(file.name + " — 파일을 읽지 못했습니다.");
      }
    }
    if (!parts.length) {
      showError(problems[0] || "파일을 읽지 못했습니다.");
      loadGrid([], files.length > 1 ? "파일 " + files.length + "개" : files[0].name);
      return;
    }
    const merged = combine(parts);
    document.getElementById("header-row").value = String(merged.headerAt + 1);
    const label = files.length === 1 ? files[0].name : "파일 " + parts.length + "개";
    loadGrid(merged.rows, label);
    if (problems.length) showError(problems.join(" "));
  } finally {
    batchNote = "";
    setBusy(false);
  }
}

document.getElementById("ex-pipe").addEventListener("click", () => loadExample("pipe"));
document.getElementById("ex-other").addEventListener("click", () => loadExample("other"));
document.getElementById("orig").addEventListener("click", () => {
  sort = { col: null, dir: 1 };
  render();
});
document.getElementById("header-row").addEventListener("change", () => {
  applyAutoSort();
  render();
});
document.getElementById("file").addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  readFiles(files);
});
document.getElementById("sheet").addEventListener("change", (event) => {
  if (!workbook) return;
  openWorkbook(workbook, event.target.value);
});
document.getElementById("print").addEventListener("click", () => window.print());
document.getElementById("print-look").addEventListener("click", () => {
  document.body.classList.add("as-print");
});
document.getElementById("screen-look").addEventListener("click", () => {
  document.body.classList.remove("as-print");
});

const drop = document.getElementById("drop");
drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("drag");
});
drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("drag");
  readFiles(event.dataTransfer && event.dataTransfer.files);
});

loadExample("pipe");
