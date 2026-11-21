// 내가브랜드 — 로고·자랑 카드 그리기 (웹 화면 app.js 와 결과 페이지 b/ 가 함께 쓴다)

export const INK = "#13161B";
export const PAPER = "#F6F3ED";
export const SIGNAL = "#F85003";

export const COLORS = [
  ["하늘색", "SKY", "#8EC9F0"], ["빨강", "RED", "#E23B2E"], ["주황", "ORANGE", "#F85003"],
  ["노랑", "YELLOW", "#F5C518"], ["초록", "GREEN", "#2F9E5A"], ["민트", "MINT", "#7FD6C2"],
  ["파랑", "BLUE", "#2952D9"], ["보라", "PURPLE", "#7A4FD0"], ["분홍", "PINK", "#F29AC0"],
  ["갈색", "BROWN", "#8A5A3C"], ["회색", "GREY", "#9AA0A6"], ["검정", "BLACK", "#13161B"],
  ["흰색", "WHITE", "#FFFFFF"],
];

export const PERSONS = [
  { ko: "가족", en: "FAMILY" },
  { ko: "친구", en: "FRIEND" },
  { ko: "연인", en: "MY LOVE" },
  { ko: "나 자신", en: "MYSELF" },
  { ko: "직접 쓰기", en: "", custom: true },
];

export const STYLES = [
  { id: "bold", label: "굵게" },
  { id: "badge", label: "배지" },
  { id: "tag", label: "태그" },
];

// ---------- 한글 → 로마자 (간단한 국어의 로마자 표기) ----------
const CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const JUNG = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const JONG = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];
export function romanize(text) {
  let out = "";
  let prevFinal = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) { out += ch; prevFinal = ""; continue; }
    const cho = Math.floor(code / 588);
    const jung = Math.floor((code % 588) / 28);
    const jong = code % 28;
    let initial = CHO[cho];
    if (cho === 5 && out === "") initial = "r";
    if (cho === 5 && prevFinal === "l") initial = "l";
    out += initial + JUNG[jung] + JONG[jong];
    prevFinal = JONG[jong];
  }
  return out;
}
export const hasHangul = (s) => /[가-힣]/.test(s);
export const latinOf = (s) => (hasHangul(s) ? romanize(s) : s).toUpperCase().replace(/\s+/g, " ").trim();

// 선물할 사람 한국어 → 로고에 들어갈 영문
export function personEnOf(ko) {
  const t = (ko || "").trim();
  const p = PERSONS.find((x) => !x.custom && (x.ko === t || (t === "나" && x.ko === "나 자신")));
  return p ? p.en : latinOf(t);
}

// 색: 한국어 이름 · 영어 이름 · #hex 모두 받는다
export function colorHex(input) {
  const t = (input || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toUpperCase();
  const k = t.replace(/\s+/g, "").toLowerCase();
  const c = COLORS.find(([ko, en]) => ko === k || ko.replace("색", "") === k.replace("색", "") || en.toLowerCase() === k);
  return c ? c[2] : SIGNAL;
}

// ---------- 그리기 ----------
function fit(ctx, text, font, maxW, startPx, minPx = 40) {
  let px = startPx;
  while (px > minPx) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= maxW) break;
    px -= 4;
  }
  ctx.font = font(px);
  return px;
}
const fontFor = (text, weight = 900) => (px) =>
  hasHangul(text) ? `${weight} ${px}px Pretendard, sans-serif` : `${px}px Anton, Impact, sans-serif`;

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.35;
}
// 어두운 색이면 테두리를 밝게 — 종이 위에서도, 어두운 티셔츠 위에서도 보이게
const edgeFor = (color) => (isDark(color) ? PAPER : INK);

function strokeFill(ctx, text, x, y, color, lw) {
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;
  ctx.strokeStyle = edgeFor(color);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function arcText(ctx, text, cx, cy, r, centerAngle, inward) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + (chars.length - 1) * 8;
  let angle = centerAngle - (inward ? -1 : 1) * (total / r) / 2;
  chars.forEach((c, i) => {
    const step = (widths[i] + 8) / r;
    const a = angle + (inward ? -1 : 1) * step / 2;
    ctx.save();
    ctx.translate(cx + r * Math.cos(a), cy + r * Math.sin(a));
    ctx.rotate(a + (inward ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(c, 0, 0);
    ctx.restore();
    angle += (inward ? -1 : 1) * step;
  });
}

// opts: { name, color(#hex), personEn, style }
export function drawLogo(canvas, opts) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const name = (opts.name || "").trim();
  const color = opts.color;
  const pEn = opts.personEn || "";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const txt = hasHangul(name) ? name : name.toUpperCase();

  if (opts.style === "badge") {
    const cx = W / 2, cy = H / 2, R = W * 0.44;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    const inner = isDark(color) ? PAPER : INK;
    ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
    ctx.lineWidth = 8; ctx.strokeStyle = inner; ctx.stroke();
    const ring = pEn ? `MADE FOR ${pEn}` : "MADE BY ME";
    ctx.fillStyle = inner;
    ctx.font = hasHangul(ring) ? "900 64px Pretendard, sans-serif" : "64px Anton, Impact, sans-serif";
    arcText(ctx, ring, cx, cy, R * 0.86, -Math.PI / 2, false);
    ctx.font = "56px Anton, Impact, sans-serif";
    arcText(ctx, "EST. 2026", cx, cy, R * 0.86, Math.PI / 2, true);
    fit(ctx, txt, fontFor(txt), R * 1.25, 200);
    ctx.fillStyle = inner;
    ctx.fillText(txt, cx, cy + 6);
  } else if (opts.style === "tag") {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.transform(1, -0.12, -0.28, 1, 0, 0);
    const px = fit(ctx, txt, fontFor(txt), W * 0.8, 280);
    ctx.fillStyle = INK;
    ctx.fillText(txt, 18, 18);
    strokeFill(ctx, txt, 0, 0, color, Math.max(10, px * 0.09));
    ctx.fillStyle = SIGNAL;
    ctx.fillRect(-W * 0.32, px * 0.58, W * 0.64, 18);
    ctx.restore();
  } else {
    const px = fit(ctx, txt, fontFor(txt), W * 0.86, 300);
    strokeFill(ctx, txt, W / 2, H * 0.44, color, Math.max(10, px * 0.08));
    ctx.fillStyle = SIGNAL;
    ctx.fillRect(W * 0.2, H * 0.44 + px * 0.62, W * 0.6, 12);
    const cap = pEn ? `FOR ${pEn} · EST. 2026` : "EST. 2026";
    fit(ctx, cap, fontFor(cap), W * 0.7, 56, 24);
    strokeFill(ctx, cap, W / 2, H * 0.44 + px * 0.62 + 70, color, 6);
  }
  return canvas.toDataURL("image/png");
}

// opts: { name, word, personKo, color, personEn, style } → 1080×1350 canvas
export async function makeCard(opts) {
  await fontsReady();
  const logo = document.createElement("canvas");
  logo.width = logo.height = 1000;
  drawLogo(logo, opts);
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const ctx = c.getContext("2d");
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, 1080, 1350);
  ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.strokeRect(40, 40, 1000, 1270);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "900 64px Pretendard, sans-serif";
  ctx.fillText("내가브랜드", 84, 140);
  ctx.textAlign = "right";
  ctx.fillStyle = SIGNAL;
  ctx.font = "40px Anton, Impact, sans-serif";
  ctx.fillText("OWN STREET", 996, 136);
  ctx.fillStyle = "#fff";
  ctx.fillRect(84, 190, 912, 780);
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeRect(84, 190, 912, 780);
  ctx.drawImage(logo, 150, 200, 760, 760);
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  const nm = (opts.name || "").trim();
  fit(ctx, nm, fontFor(nm), 900, 84, 36);
  ctx.fillText(nm, 540, 1070);
  const word = (opts.word || "").trim();
  const who = (opts.personKo || "").trim();
  let line = "";
  if (word && who) line = `"${word}"에서 시작해, ${who}에게 선물하는 브랜드`;
  else if (word) line = `"${word}"에서 시작한 브랜드`;
  else if (who) line = `${who}에게 선물하는 브랜드`;
  if (line) {
    ctx.fillStyle = "#5B5F66";
    fit(ctx, line, (px) => `700 ${px}px Pretendard, sans-serif`, 900, 36, 22);
    ctx.fillText(line, 540, 1140);
  }
  ctx.fillStyle = INK;
  ctx.font = "30px Anton, Impact, sans-serif";
  ctx.fillText("OWNSTREET.TEAM · URBANBEYOND", 540, 1250);
  return c;
}

export async function shareCanvas(c, name, onFail) {
  try {
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = new File([blob], "naegabrand.png", { type: "image/png" });
    const data = { title: "내가브랜드", text: `내가 만든 브랜드 어때? — ${name}`, files: [file] };
    if (navigator.canShare && navigator.canShare(data)) { await navigator.share(data); return; }
    if (navigator.share) { await navigator.share({ title: data.title, text: data.text, url: location.href }); return; }
    onFail("이 기기는 바로 공유가 안 돼. 이미지를 저장해서 보내 줘");
  } catch (e) {
    if (e && e.name !== "AbortError") onFail("공유가 안 됐어. 이미지 저장으로 해 줘");
  }
}

export const fileNameOf = (name) => `${latinOf(name || "").replace(/[^A-Z0-9]+/g, "-") || "naegabrand"}.png`;

let fontsPromise = null;
export function fontsReady() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      document.fonts.load("64px Anton"),
      document.fonts.load("900 64px Pretendard"),
      document.fonts.load("700 36px Pretendard"),
    ]).catch(() => null);
  }
  return fontsPromise;
}
