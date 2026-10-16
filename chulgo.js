"use strict";

let grid = [];
let sourceName = "";
let fileLabel = "";
let workbook = null;
let sort = [];
let printedBox = null;
let customers = [];
let pages = [];
let pageMiss = 0;
let suspectsOnly = false;
let brandSum = false;
let hideNum = false;
let hideEa = true;
let hideNote = true;
let fontSize = "md";
const COL_ML = 1000;
const COL_PACK = 1001;
const COL_BRAND = 1002;

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

function isVirtualCol(col) {
  return col === COL_ML || col === COL_PACK || col === COL_BRAND;
}

function specParts(spec) {
  const s = String(spec || "").replace(/\s+/g, "");
  const out = { ml: "", pack: "" };
  const vol = s.match(/^(\d+(?:\.\d+)?)(ml|㎖|ℓ|l)(?=\/|$)/i);
  if (vol) {
    const n = Number(vol[1]);
    const unit = vol[2].toLowerCase();
    out.ml = unit === "ℓ" || unit === "l" ? String(Math.round(n * 1000)) : String(n);
  }
  const slash = s.match(/\/(.+)$/);
  if (slash) out.pack = slash[1];
  return out;
}

function brandOf(row, heads) {
  const at = heads.findIndex((name) => /품명|품목/.test(normHead(name)));
  const token = (at >= 0 ? String(row[at] || "").trim() : "").split(/\s+/)[0] || "";
  return token.replace(/[0-9].*$/, "") || token;
}

function sortValue(row, heads, col) {
  if (col === COL_ML || col === COL_PACK) {
    const at = heads.findIndex((name) => normHead(name).includes("규격"));
    const parts = specParts(at >= 0 ? row[at] : "");
    return col === COL_ML ? parts.ml : parts.pack;
  }
  if (col === COL_BRAND) return brandOf(row, heads);
  return String(row[col] ?? "");
}

function colName(heads, col) {
  if (col === COL_ML) return "용량";
  if (col === COL_PACK) return "포장";
  if (col === COL_BRAND) return "브랜드";
  return heads[col] || colLabel(col);
}

function sortedBody() {
  const start = headerIndex() + 1;
  const heads = headers();
  const rows = [];
  for (let index = start; index < grid.length; index += 1) {
    const row = grid[index];
    if (!row.some((cell) => String(cell).trim() !== "")) continue;
    rows.push({ row, index });
  }
  const keys = sort.filter((item) => isVirtualCol(item.col) || (item.col >= 0 && item.col < columnCount()));
  if (!keys.length && !brandSum) return rows;
  rows.sort((a, b) => {
    if (brandSum) {
      const diff = compare(sortValue(a.row, heads, COL_BRAND), sortValue(b.row, heads, COL_BRAND), 1);
      if (diff) return diff;
    }
    for (let i = 0; i < keys.length; i += 1) {
      const diff = compare(sortValue(a.row, heads, keys[i].col), sortValue(b.row, heads, keys[i].col), keys[i].dir);
      if (diff) return diff;
    }
    return a.index - b.index;
  });
  return rows;
}

function sortLabel(heads) {
  if (!sort.length) return "원래 순서";
  if (sort.length === 1) {
    return colName(heads, sort[0].col) + (sort[0].dir === 1 ? " 오름차순" : " 내림차순");
  }
  return sort.map((item) => colName(heads, item.col) + (item.dir === 1 ? "↑" : "↓")).join(" · ");
}

function pageWarn() {
  const nums = Array.from(new Set(pages.filter((n) => n > 0))).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < nums.length; i += 1) {
    for (let n = nums[i - 1] + 1; n < nums[i]; n += 1) gaps.push(n);
  }
  const bits = [];
  if (gaps.length) bits.push(gaps.map((n) => n + "쪽").join(", ") + "이 없습니다");
  if (pageMiss) bits.push("쪽 번호를 못 읽은 사진 " + pageMiss);
  return bits.join(" · ");
}

function fileStem() {
  const match = subtitleText().match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!match) return "출고";
  return match[1] + String(match[2]).padStart(2, "0") + String(match[3]).padStart(2, "0") + "-출고";
}

function printHide(head, isNum) {
  if (isNum) return hideNum;
  const key = normHead(head);
  if (key.includes("ea")) return hideEa;
  if (key.includes("비고")) return hideNote;
  return false;
}

function colLabel(index) {
  return index + 1 + "열";
}

function applyAutoSort() {
  const idx = headers().findIndex((name) => name.includes("규격"));
  sort = idx >= 0 ? [{ col: idx, dir: 1 }] : [];
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

function paintActions() {
  const idle = !grid.length;
  document.querySelector(".file-btn").classList.toggle("primary", idle);
  document.getElementById("print").classList.toggle("primary", !idle);
  const empty = document.getElementById("empty");
  empty.hidden = !idle;
  if (!idle) return;
  empty.textContent = document.body.classList.contains("is-busy")
    ? "읽고 있습니다."
    : sourceName
      ? "읽은 줄이 없습니다. 다른 사진을 놓아 주세요."
      : "사진을 여기에 놓으면 규격순으로 모읍니다.";
}

function addFact(parent, text, kind) {
  if (!text) return;
  const span = document.createElement("span");
  if (kind) span.className = kind;
  span.textContent = text;
  parent.append(span);
}

function cellIssue(head, value, row, heads, dupes, boxGap) {
  const key = normHead(head);
  const text = String(value ?? "").trim();
  if (key.includes("코드")) {
    if (dupes.has(text) || !/^\d{6}$/.test(text)) return "코드를 확인해 주세요";
    return "";
  }
  if (key.includes("box")) {
    if (text && !/^\d+$/.test(text)) return "BOX를 확인해 주세요";
    if (!text && boxGap) return "BOX가 비어 합계가 다릅니다";
    return "";
  }
  if (/입수|수량/.test(key)) {
    const specAt = heads.findIndex((name) => normHead(name).includes("규격"));
    const spec = specAt >= 0 ? String(row[specAt] ?? "").trim() : "";
    const pack = spec.match(/\/(\d+)$/);
    if (pack && /^\d+$/.test(text) && text !== pack[1]) return "입수 " + pack[1] + "인지 확인해 주세요";
  }
  return "";
}

function paintView() {
  const button = document.getElementById("suspects");
  if (!button) return;
  button.setAttribute("aria-pressed", suspectsOnly ? "true" : "false");
  button.textContent = suspectsOnly ? "전체 줄" : "확인할 칸만";
  document.getElementById("brand-sum").checked = brandSum;
  document.getElementById("hide-num").checked = hideNum;
  document.getElementById("hide-ea").checked = hideEa;
  document.getElementById("hide-note").checked = hideNote;
  document.getElementById("font").value = fontSize;
  document.getElementById("grid").classList.toggle("font-sm", fontSize === "sm");
  document.getElementById("grid").classList.toggle("font-lg", fontSize === "lg");
}

function render() {
  persist();
  const table = document.getElementById("grid");
  const status = document.getElementById("status");
  const subtitle = document.getElementById("subtitle");
  table.replaceChildren();
  status.replaceChildren();
  paintActions();
  paintView();
  const start = headerIndex();
  const customerLine = document.getElementById("customers");
  if (!grid.length) {
    if (sourceName) addFact(status, sourceName + " · 읽은 줄 없음");
    subtitle.hidden = true;
    customerLine.hidden = true;
    return;
  }
  if (start >= grid.length) {
    showError("제목 줄이 표의 줄 수보다 큽니다.");
    if (sourceName) addFact(status, sourceName);
    subtitle.hidden = true;
    customerLine.hidden = true;
    return;
  }
  showError("");
  const heads = headers();
  const rows = sortedBody();
  const nums = numericCols(rows.map((item) => item.row), heads.length);
  const sub = subtitleText();
  subtitle.hidden = !sub;
  subtitle.textContent = sub;
  customerLine.hidden = !customers.length;
  customerLine.textContent = customers.length ? "거래처 " + customers.join(" · ") : "";
  const codeAt = heads.findIndex((name) => normHead(name).includes("코드"));
  const counts = new Map();
  if (codeAt >= 0) {
    rows.forEach((item) => {
      const code = String(item.row[codeAt] ?? "").trim();
      if (code) counts.set(code, (counts.get(code) || 0) + 1);
    });
  }
  const dupes = new Set();
  counts.forEach((count, code) => {
    if (count > 1) dupes.add(code);
  });
  const boxAt = heads.findIndex((name) => normHead(name).includes("box"));
  let boxSum = null;
  if (boxAt >= 0) {
    let sum = 0;
    let any = false;
    rows.forEach((item) => {
      const text = String(item.row[boxAt] ?? "").replace(/,/g, "").trim();
      if (!/^\d+(?:\.\d+)?$/.test(text)) return;
      sum += Number(text);
      any = true;
    });
    if (any) boxSum = sum;
  }
  const boxGap = printedBox != null && boxSum != null && printedBox !== boxSum;
  let issues = 0;
  rows.forEach((item) => {
    heads.forEach((head, index) => {
      if (cellIssue(head, item.row[index], item.row, heads, dupes, boxGap)) issues += 1;
    });
  });
  const shown = suspectsOnly
    ? rows.filter((item) => heads.some((head, index) => cellIssue(head, item.row[index], item.row, heads, dupes, boxGap)))
    : rows;
  addFact(status, (suspectsOnly ? shown.length + "/" : "") + rows.length + "줄", "fact");
  addFact(status, sortLabel(heads));
  if (boxSum != null) {
    addFact(status, boxGap ? "BOX 합 " + boxSum + " · 지시서 " + printedBox : "BOX 합 " + boxSum, boxGap ? "warn" : "fact");
  }
  if (issues) addFact(status, "확인할 칸 " + issues, "warn");
  if (dupes.size) addFact(status, "같은 코드 " + Array.from(dupes).join(" "), "warn");
  addFact(status, pageWarn(), "warn");
  if (sourceName) addFact(status, sourceName);

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const numTh = document.createElement("th");
  numTh.scope = "col";
  numTh.textContent = "번호";
  numTh.className = "num" + (hideNum ? " print-hide" : "");
  headRow.append(numTh);
  const derived = heads.some((name) => /규격|품명|품목/.test(name));
  const addSortTh = (label, col, className) => {
    const th = document.createElement("th");
    th.scope = "col";
    if (className) th.className = className;
    const rank = sort.findIndex((item) => item.col === col);
    th.setAttribute("aria-sort", rank < 0 ? "none" : sort[rank].dir === 1 ? "ascending" : "descending");
    const button = document.createElement("button");
    button.type = "button";
    button.append(document.createTextNode(label));
    if (rank >= 0) {
      const mark = document.createElement("span");
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = (sort[rank].dir === 1 ? " ↑" : " ↓") + (sort.length > 1 ? rank + 1 : "");
      button.append(mark);
    }
    button.addEventListener("click", () => toggleSort(col));
    th.append(button);
    headRow.append(th);
  };
  heads.forEach((name, index) => {
    const bits = [];
    if (nums.has(index)) bits.push("num");
    if (/품명|품목/.test(name)) bits.push("name");
    if (name.includes("규격")) bits.push("spec");
    if (printHide(name, false)) bits.push("print-hide");
    addSortTh(name || colLabel(index), index, bits.join(" "));
  });
  if (derived) {
    addSortTh("용량", COL_ML, "num derived");
    addSortTh("포장", COL_PACK, "derived");
    addSortTh("브랜드", COL_BRAND, "derived");
  }
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  const bandCol = brandSum
    ? COL_BRAND
    : sort.length && (isVirtualCol(sort[0].col) || sort[0].col < heads.length) ? sort[0].col : -1;
  const brandFirst = bandCol === COL_BRAND;
  const specAt = heads.findIndex((name) => normHead(name).includes("규격"));
  let prevBand = null;
  let group = null;
  let groupBox = 0;
  let groupN = 0;
  const pushSubtotal = () => {
    if (!brandFirst || group == null || !groupN) return;
    const tr = document.createElement("tr");
    tr.className = "subtotal";
    const td = document.createElement("td");
    td.colSpan = headRow.children.length;
    td.textContent = (group || "이름 없음") + " · " + groupN + "줄" + (boxAt >= 0 ? " · BOX " + groupBox : "");
    tr.append(td);
    tbody.append(tr);
    groupBox = 0;
    groupN = 0;
  };
  shown.forEach((item, order) => {
    const key = bandCol >= 0 ? sortValue(item.row, heads, bandCol) : "";
    if (brandFirst && group != null && key !== group) pushSubtotal();
    const tr = document.createElement("tr");
    if (bandCol >= 0 && prevBand != null && key !== prevBand) tr.className = "band";
    if (bandCol >= 0) prevBand = key;
    group = brandFirst ? key : group;
    const num = document.createElement("td");
    num.className = "num" + (hideNum ? " print-hide" : "");
    num.textContent = String(order + 1);
    tr.append(num);
    heads.forEach((head, index) => {
      const td = document.createElement("td");
      if (nums.has(index)) td.classList.add("num");
      if (/품명|품목/.test(head)) td.classList.add("name");
      if (head.includes("규격")) td.classList.add("spec");
      if (printHide(head, false)) td.classList.add("print-hide");
      const issue = cellIssue(head, item.row[index], item.row, heads, dupes, boxGap);
      if (issue) {
        td.classList.add("suspect");
        td.title = issue;
      }
      td.textContent = String(item.row[index] ?? "");
      td.contentEditable = "true";
      td.spellcheck = false;
      td.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          td.blur();
        }
      });
      td.addEventListener("blur", () => {
        const next = td.textContent.replace(/\s+/g, " ").trim();
        if (next === String(item.row[index] ?? "")) return;
        const map = readEdits();
        const oldKey = rowKey(item.row, heads);
        item.row[index] = next;
        const patch = Object.assign({}, map[oldKey] || {});
        patch[head || String(index)] = next;
        map[oldKey] = patch;
        const newKey = rowKey(item.row, heads);
        if (newKey !== oldKey) map[newKey] = Object.assign({}, map[newKey] || {}, patch);
        writeEdits(map);
        render();
      });
      tr.append(td);
    });
    if (derived) {
      const parts = specParts(specAt >= 0 ? item.row[specAt] : "");
      [["num derived", parts.ml], ["derived", parts.pack], ["derived", brandOf(item.row, heads)]].forEach((pair) => {
        const td = document.createElement("td");
        td.className = pair[0];
        td.textContent = pair[1];
        tr.append(td);
      });
    }
    if (boxAt >= 0) {
      const text = String(item.row[boxAt] ?? "").replace(/,/g, "").trim();
      if (/^\d+(?:\.\d+)?$/.test(text)) groupBox += Number(text);
    }
    if (brandFirst) groupN += 1;
    tbody.append(tr);
  });
  pushSubtotal();
  table.append(thead, tbody);
}

function toggleSort(index) {
  const at = sort.findIndex((item) => item.col === index);
  if (at >= 0) sort[at].dir = -sort[at].dir;
  else sort.push({ col: index, dir: 1 });
  render();
}

// ponytail: this form's ㎖ is read as 00/08/01 and ℓ as 2 or 8. A real spec like 18/12 or code 109xxx would be rewritten; edit the cell if that day has one.
function cleanSpec(value) {
  let s = String(value || "").trim();
  if (!s) return s;
  s = s.replace(/7(24|20|12|6|4|2)$/, "/$1");
  s = s.replace(/P-B0x/gi, "P-BOX");
  s = s.replace(/(\d)\s*me(?=\s*\/)/gi, "$1ml");
  s = s.replace(/(\d)\s*m\s*\|/gi, "$1ml");
  s = s.replace(/(\d{2,4})0[018](?=\s*\/)/g, "$1ml");
  s = s.replace(/(\d\.\d)[28](\s*\/?\s*)(24|20|12|6\+4|6|4|2)\b/g, "$1ℓ/$3");
  s = s.replace(/^(\d)[28](\s*\/\s*)(24|20|12|6|4|2)$/, "$1ℓ$2$3");
  s = s.replace(/(\d+(?:\.\d+)?)[Ll](\s+)(24|20|12|6|4|2)$/, "$1ℓ/$3");
  s = s.replace(/\/\s*5\+4\b/g, "/6+4");
  s = s.replace(/\s*\/\s*/g, "/");
  // ponytail: 6 is read as 8 and 355 as 356 on this form. A real 380ml or 356ml day needs a cell edit.
  s = s.replace(/^380(?=ml)/, "360");
  s = s.replace(/^356(?=ml)/, "355");
  return s;
}

function cleanCode(value) {
  let s = String(value || "").trim().replace(/\.$/, "");
  if (/^109\d{3}$/.test(s)) s = "100" + s.slice(3);
  else if (/^108\d{3}$/.test(s)) s = "103" + s.slice(3);
  else if (/^(\d{3})9(\d{3})$/.test(s)) s = s.slice(0, 3) + s.slice(4);
  else if (/^100\d{2}$/.test(s)) s = "1000" + s.slice(3);
  return s;
}

function cleanName(value) {
  return String(value || "")
    .replace(/카?스라미트/g, "카스라이트")
    .replace(/카카스라이트/g, "카스라이트")
    .replace(/참미슬/g, "참이슬")
    .replace(/미즈백/g, "이즈백")
    .replace(/라미트/g, "라이트")
    .replace(/하미네켄/g, "하이네켄")
    .replace(/클라무드/g, "클라우드")
    .replace(/마사히드라미/g, "아사히드라이")
    .replace(/첨하/g, "청하")
    .replace(/데라/g, "테라")
    .replace(/하미트/g, "하이트")
    .replace(/필라이트\s*클리머/g, "필라이트 클리어")
    .replace(/필라이트후레쉬/g, "필라이트 후레쉬")
    .replace(/(^|[^가-힣])미슬/g, "$1참이슬")
    .replace(/미슬/g, "이슬")
    .replace(/좋은데미/g, "좋은데이")
    .replace(/명진북경/g, "영진북경")
    .replace(/참이슬담금(?!30)/g, "참이슬담금30%")
    .replace(/미림(?!14)/g, "미림14%")
    .replace(/(?<!골)드제로/g, "골드제로")
    .replace(/(?<!골)드25/g, "골드25")
    .replace(/카스\s*제로/g, "카스몰제로")
    .replace(/(^|\s)MS(?=\s*살구)/g, "$1새로")
    .replace(/(^|\s)선(?=\d)/g, "$1선양")
    .replace(/6\s*본\s*\(\s*644\s*\)/g, "6본(6*4)")
    .replace(/6\s*본\s*\(\s*6\s*[*+xX]\s*4\s*\)/g, "6본(6*4)")
    .replace(/(\d\.\d)2(?=\s|$)/g, "$1ℓ")
    .replace(/(^|\s)Se(?=\s|$)/g, (all, lead) => lead + "5ℓ")
    .replace(/50개[LＬℓl]/g, "500ML")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)/g, ")")
    .replace(/『/g, "P")
    .replace(/\s+/g, " ")
    .trim();
}

// ponytail: trust the 품명 size only when the 규격 digit is the usual misread (8 for 6, 9 for 0/3/7).
function nameWins(specNum, nameNum) {
  if (specNum.length !== nameNum.length || specNum === nameNum) return false;
  let diff = 0;
  for (let i = 0; i < specNum.length; i += 1) {
    if (specNum[i] === nameNum[i]) continue;
    diff += 1;
    const bad = specNum[i];
    const good = nameNum[i];
    const ok = (bad === "8" && good === "6") || (bad === "9" && "073".includes(good)) || (bad === "6" && good === "5") || (bad === "5" && good === "6");
    if (!ok) return false;
  }
  return diff === 1;
}

function alignSpec(name, spec, qty) {
  let s = cleanSpec(spec);
  const sizes = String(name || "").match(/\d+(?:\.\d+)?/g) || [];
  const bare = s.match(/^\/(24|20|12|6|4|2)$/);
  if (bare) {
    const n = sizes.find((v) => /^\d{3,4}$/.test(v));
    if (n) s = n + "ml" + s;
  }
  const vol = s.match(/^(\d+(?:\.\d+)?)(?=ml|ℓ|\/)/);
  if (vol) {
    const better = sizes.find((v) => nameWins(vol[1], v));
    if (better) s = better + s.slice(vol[1].length);
  }
  if (/ℓ\/4$/.test(s) && String(qty || "").trim() === "6") s = s.replace(/\/4$/, "/6");
  return s;
}

// ponytail: fill a dropped size from 규격. Beer + /24 becomes 캔; 처음처럼 같은 소주에는 캔을 붙이지 않는다.
function alignName(name, spec, qty) {
  let s = String(name || "");
  const vol = String(spec || "").match(/^(\d+(?:\.\d+)?)(?=ml|ℓ|\/)/);
  const v = vol ? vol[1] : "";
  const pack = String(qty || "").trim();
  if (v) {
    s = s.replace(/\d+(?:\.\d+)?/g, (n) => (v === n + "0" || nameWins(n, v) ? v : n));
    if (pack === "12" && s.endsWith(v + "7")) s = s.slice(0, -1) + "큐팩";
    if (/ml/.test(spec) && s.endsWith(v + "8")) s = s.slice(0, -1) + "병";
    if (/[캔병]$/.test(s) && !s.includes(v)) s = s.replace(/([캔병])$/, v + "$1");
    if (/%/.test(s) && !s.includes(v)) s += " " + v;
    s = s.replace(/(\d{3})24$/, (all, n) => (n === v && /\/24$/.test(spec) ? n + "캔" : all));
    const bare = !/\d|[캔병본팩ℓ]/.test(s);
    const beer = /^(카스|테라|스텔라|필|켈리|하이트|하이네켄|아사히|버드|1664)/.test(s);
    if (bare && beer && /^\d{3}$/.test(v) && /ml\/24$/.test(spec) && pack === "24") s += " " + v + "캔";
    else if (bare && beer && spec.startsWith("500ml/12")) s += " 500병";
    else if (bare && /ml\/12$/.test(spec) && v !== "500" && v !== "1000") s += " " + v + "병";
    else if (bare && beer && /^1\.6ℓ/.test(spec)) s += " 1.6큐팩";
    else if (bare && beer && /^1\.9ℓ/.test(spec)) s += " 1.9큐팩";
    else if (bare && beer && /^2ℓ/.test(spec)) s += " 2000큐팩";
    else if (bare && beer && /^1ℓ/.test(spec)) s += " 1000큐팩";
    else if (bare && /ℓ/.test(spec)) s += " " + v + "ℓ";
  }
  return s.replace(/\s+/g, " ").trim();
}

function cleanSheet(rows, headerAt) {
  const heads = rows[headerAt] || [];
  const find = (re) => heads.findIndex((head) => re.test(normHead(head)));
  const specAt = find(/규격/);
  const codeAt = find(/코드/);
  const nameAt = find(/품명|품목/);
  const qtyAt = find(/입수|수량/);
  heads.forEach((head, col) => {
    const key = normHead(head);
    if (key === "box" || key === "bok") heads[col] = "BOX";
  });
  for (let i = headerAt + 1; i < rows.length; i += 1) {
    const row = rows[i];
    for (let col = 0; col < row.length; col += 1) row[col] = String(row[col] || "").replace(/[?？]+$/g, "").trim();
    if (nameAt >= 0) row[nameAt] = cleanName(row[nameAt]);
    if (codeAt >= 0) row[codeAt] = cleanCode(row[codeAt]);
    if (specAt >= 0) row[specAt] = alignSpec(row[nameAt] || "", row[specAt], qtyAt >= 0 ? row[qtyAt] : "");
    if (nameAt >= 0) row[nameAt] = alignName(row[nameAt], specAt >= 0 ? row[specAt] : "", qtyAt >= 0 ? row[qtyAt] : "");
  }
}

function rowKey(row, heads) {
  const codeAt = heads.findIndex((head) => normHead(head).includes("코드"));
  const nameAt = heads.findIndex((head) => /품명|품목/.test(normHead(head)));
  return (codeAt >= 0 ? row[codeAt] : "") + "\t" + (nameAt >= 0 ? row[nameAt] : "");
}

function readEdits() {
  try {
    return JSON.parse(localStorage.getItem("chulgo-edits") || "{}");
  } catch (err) {
    return {};
  }
}

function writeEdits(map) {
  try {
    localStorage.setItem("chulgo-edits", JSON.stringify(map));
  } catch (err) {
    /* full */
  }
}

function applyEdits(rows, headerAt) {
  const heads = rows[headerAt] || [];
  const map = readEdits();
  for (let i = headerAt + 1; i < rows.length; i += 1) {
    const patch = map[rowKey(rows[i], heads)];
    if (!patch) continue;
    heads.forEach((head, col) => {
      if (patch[head] != null) rows[i][col] = patch[head];
    });
  }
}

function persist() {
  try {
    localStorage.setItem("chulgo-sheet", JSON.stringify({
      rows: grid,
      name: sourceName,
      sort,
      headerAt: headerIndex(),
      printedBox,
      customers,
      pages,
      pageMiss,
      suspectsOnly,
      brandSum,
      hideNum,
      hideEa,
      hideNote,
      fontSize,
    }));
  } catch (err) {
    /* full */
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem("chulgo-sheet") || "null");
    if (!saved || !Array.isArray(saved.rows) || !saved.rows.length) return false;
    grid = saved.rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []));
    sourceName = saved.name || "";
    sort = asSort(saved.sort);
    printedBox = Number.isFinite(saved.printedBox) ? saved.printedBox : null;
    customers = Array.isArray(saved.customers) ? saved.customers.map((line) => String(line)) : [];
    pages = Array.isArray(saved.pages) ? saved.pages.filter((n) => Number.isFinite(n)) : [];
    pageMiss = Number.isFinite(saved.pageMiss) ? saved.pageMiss : 0;
    suspectsOnly = !!saved.suspectsOnly;
    brandSum = !!saved.brandSum;
    hideNum = !!saved.hideNum;
    hideEa = saved.hideEa == null ? true : !!saved.hideEa;
    hideNote = saved.hideNote == null ? true : !!saved.hideNote;
    fontSize = saved.fontSize === "sm" || saved.fontSize === "lg" ? saved.fontSize : "md";
    document.getElementById("header-row").value = String((saved.headerAt || 0) + 1);
    restoreShots();
    render();
    return true;
  } catch (err) {
    return false;
  }
}

function asSort(saved) {
  const list = Array.isArray(saved) ? saved : saved && Number.isInteger(saved.col) ? [saved] : [];
  return list
    .filter((item) => item && Number.isInteger(item.col))
    .map((item) => ({ col: item.col, dir: item.dir === -1 ? -1 : 1 }));
}

function loadGrid(rows, name, printed, extra) {
  grid = rows.map((row) => (Array.isArray(row) ? row.map((cell) => (cell == null ? "" : String(cell))) : []));
  printedBox = Number.isFinite(printed) ? printed : null;
  const meta = extra || {};
  customers = Array.isArray(meta.customers) ? meta.customers : [];
  pages = Array.isArray(meta.pages) ? meta.pages : [];
  pageMiss = meta.pageMiss || 0;
  const at = headerIndex();
  if (grid[at]) {
    cleanSheet(grid, at);
    applyEdits(grid, at);
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
  try {
    localStorage.removeItem("chulgo-shots");
  } catch (err) {
    /* full */
  }
}

function showShotImages(urls, names) {
  const box = document.getElementById("shots");
  box.replaceChildren();
  urls.forEach((url, index) => {
    const img = document.createElement("img");
    img.src = url;
    img.alt = (names && names[index]) || (index + 1) + "쪽 사진";
    box.append(img);
  });
  box.hidden = urls.length === 0;
}

function shrinkShot(file) {
  return decodeImage(file).then((img) => {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const scale = Math.min(1, 900 / (width || 900));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }).catch(() => "");
}

function showShots(files) {
  hideShots();
  const urls = files.map((file) => {
    const url = URL.createObjectURL(file);
    shotUrls.push(url);
    return url;
  });
  showShotImages(urls, files.map((file, index) => (file.name || (index + 1) + "쪽") + " 사진"));
  if (!files.length) return;
  Promise.all(files.map(shrinkShot)).then((stored) => {
    const keep = stored.filter(Boolean);
    try {
      localStorage.setItem("chulgo-shots", JSON.stringify(keep));
    } catch (err) {
      try {
        localStorage.removeItem("chulgo-shots");
      } catch (ignore) {
        /* full */
      }
    }
  });
}

function restoreShots() {
  try {
    const urls = JSON.parse(localStorage.getItem("chulgo-shots") || "[]");
    if (!Array.isArray(urls) || !urls.length) return;
    showShotImages(urls);
  } catch (err) {
    /* ignore */
  }
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

function fitSource(source) {
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const long = Math.max(width, height);
  if (long <= 2400 && source.tagName === "IMG") return source;
  const scale = long > 2400 ? 2400 / long : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function decodeImageTag(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(fitSource(img));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

function decodeImage(file) {
  const heic = /\.heic$|\.heif$/i.test(file.name || "") || /heic|heif/i.test(file.type || "");
  if (typeof createImageBitmap !== "function") {
    return heic ? Promise.reject(new Error("heic")) : decodeImageTag(file);
  }
  return createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => {
    const fitted = fitSource(bitmap);
    if (bitmap.close) bitmap.close();
    return fitted;
  }).catch(() => {
    if (heic) throw new Error("heic");
    return decodeImageTag(file);
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
  document.body.classList.toggle("is-busy", busy);
  document.getElementById("drop").setAttribute("aria-busy", busy ? "true" : "false");
  document.querySelectorAll(".toolbar button, .toolbar input, .toolbar select").forEach((el) => {
    el.disabled = busy;
  });
  paintActions();
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

function printedBoxFrom(row, heads) {
  const at = heads.findIndex((name) => normHead(name).includes("box"));
  if (at >= 0) {
    const raw = String(row[at] ?? "").replace(/,/g, "").trim();
    if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  }
  const text = row.map((cell) => String(cell ?? "")).join(" ");
  const match = text.match(/box\s*합\s*[:：]?\s*(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function readPages(before) {
  const text = (before || []).map((row) => (Array.isArray(row) ? row.join(" ") : String(row || ""))).join(" ");
  const nums = [];
  const re = /page\s*no\s*[:.]?\s*(\d+)/gi;
  let match;
  while ((match = re.exec(text))) nums.push(Number(match[1]));
  return { nums, labeled: /page\s*no|페이지/i.test(text) && !nums.length };
}

function collectMeta(parts) {
  const info = parts.map((part) => readPages(part.before));
  const any = info.some((item) => item.nums.length);
  const pages = [];
  let pageMiss = 0;
  info.forEach((item) => {
    pages.push(...item.nums);
    if (!item.nums.length && (item.labeled || any)) pageMiss += 1;
  });
  return { pages, pageMiss };
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
  const customers = [];
  let printedBox = null;
  let after = false;
  for (let i = headAt + 1; i < clean.length; i += 1) {
    const row = clean[i].slice(0, heads.length);
    if (isNoiseRow(row)) continue;
    if (!after && isTotalRow(row)) {
      printedBox = printedBoxFrom(row, heads);
      after = true;
      continue;
    }
    if (isHeaderRepeat(heads, row)) continue;
    if (after) {
      const text = row.map((cell) => String(cell).trim()).filter(Boolean).join(" ");
      if (text) customers.push(text);
      continue;
    }
    body.push(row);
  }
  return {
    heads,
    body,
    before: clean.slice(0, headAt).filter((row) => !isNoiseRow(row)),
    printedBox,
    customers,
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
  let sheetBox = null;
  const bodies = [];
  const pad = () => {
    bodies.forEach((row) => {
      while (row.length < canon.length) row.push("");
    });
  };
  parts.forEach((part, index) => {
    if (part.printedBox != null) sheetBox = part.printedBox;
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
  const customers = [];
  parts.forEach((part) => {
    (part.customers || []).forEach((line) => {
      if (line && !customers.includes(line)) customers.push(line);
    });
  });
  const meta = collectMeta(parts);
  return {
    rows: before.concat([canon], bodies),
    headerAt: before.length,
    printedBox: sheetBox,
    customers,
    pages: meta.pages,
    pageMiss: meta.pageMiss,
  };
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
    if (text.includes("출고") || text.includes("작업") || /page\s*no|페이지/i.test(text)) before.push([text]);
  }
  const body = [];
  const customers = [];
  let sheetBox = null;
  let after = false;
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
    if (!after && isTotalRow(dest)) {
      sheetBox = printedBoxFrom(dest, heads);
      after = true;
      continue;
    }
    if (isHeaderRepeat(heads, dest)) continue;
    if (after) {
      const text = dest.map((cell) => String(cell).trim()).filter(Boolean).join(" ");
      if (text) customers.push(text);
      continue;
    }
    body.push(dest);
  }
  if (!body.length) return null;
  return { heads, body, before, printedBox: sheetBox, customers };
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
      if (err && err.message === "heic") return { error: "이 휴대폰 사진(HEIC)은 여기서 열리지 않습니다. JPG로 바꿔 주세요." };
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
    loadGrid(merged.rows, label, merged.printedBox, merged);
    if (problems.length) showError(problems.join(" "));
  } finally {
    batchNote = "";
    setBusy(false);
  }
}

function exportAoa() {
  const heads = headers();
  const specAt = heads.findIndex((name) => normHead(name).includes("규격"));
  const derived = heads.some((name) => /규격|품명|품목/.test(name));
  const top = ["번호"].concat(heads);
  if (derived) top.push("용량", "포장", "브랜드");
  const lines = sortedBody().map((item, order) => {
    const line = [String(order + 1)].concat(heads.map((_, col) => String(item.row[col] ?? "")));
    if (!derived) return line;
    const parts = specParts(specAt >= 0 ? item.row[specAt] : "");
    line.push(parts.ml, parts.pack, brandOf(item.row, heads));
    return line;
  });
  return [top].concat(lines);
}

function downloadBlob(name, blob) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  if (!grid.length) return;
  const csv = exportAoa().map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  downloadBlob(fileStem() + ".csv", new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
}

function exportXlsx() {
  if (!grid.length || typeof XLSX === "undefined") {
    if (grid.length) showError("Excel로 저장하지 못했습니다.");
    return;
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(exportAoa()), "출고");
  XLSX.writeFile(book, fileStem() + ".xlsx");
}

document.getElementById("suspects").addEventListener("click", () => {
  suspectsOnly = !suspectsOnly;
  render();
});
document.getElementById("brand-sum").addEventListener("change", (event) => {
  brandSum = event.target.checked;
  render();
});
document.getElementById("hide-num").addEventListener("change", (event) => {
  hideNum = event.target.checked;
  render();
});
document.getElementById("hide-ea").addEventListener("change", (event) => {
  hideEa = event.target.checked;
  render();
});
document.getElementById("hide-note").addEventListener("change", (event) => {
  hideNote = event.target.checked;
  render();
});
document.getElementById("font").addEventListener("change", (event) => {
  fontSize = event.target.value === "sm" || event.target.value === "lg" ? event.target.value : "md";
  render();
});
document.getElementById("csv").addEventListener("click", exportCsv);
document.getElementById("xlsx").addEventListener("click", exportXlsx);
document.getElementById("orig").addEventListener("click", () => {
  sort = [];
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
document.getElementById("clear").addEventListener("click", () => {
  if (grid.length && !window.confirm("이 표를 비울까요? 고친 칸은 남습니다.")) return;
  grid = [];
  sourceName = "";
  sort = [];
  printedBox = null;
  customers = [];
  pages = [];
  pageMiss = 0;
  suspectsOnly = false;
  brandSum = false;
  hideNum = false;
  hideEa = true;
  hideNote = true;
  fontSize = "md";
  workbook = null;
  fileLabel = "";
  setSheets([], "");
  showError("");
  hideShots();
  try {
    localStorage.removeItem("chulgo-sheet");
  } catch (err) {
    /* full */
  }
  render();
});

const drop = document.getElementById("drop");
document.getElementById("empty").addEventListener("click", () => {
  if (!document.body.classList.contains("is-busy")) document.getElementById("file").click();
});
document.addEventListener("dragover", (event) => {
  if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes("Files")) return;
  event.preventDefault();
  drop.classList.add("drag");
});
document.addEventListener("dragleave", (event) => {
  if (event.relatedTarget) return;
  drop.classList.remove("drag");
});
document.addEventListener("drop", (event) => {
  if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes("Files")) return;
  event.preventDefault();
  drop.classList.remove("drag");
  readFiles(event.dataTransfer.files);
});

if (!restore()) render();
