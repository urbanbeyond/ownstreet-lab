// 내가브랜드 — 단어 1개 → 선물할 사람·색 → 이름 → 로고 → 공유 카드
// 원천 기획: docs/strategy/02_내가브랜드_기획.md (R-034~R-038). 서버·유료 API 없음. 결과는 이 기기에만 저장.

import { namingIdeas } from "./naming-words.js";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "naegabrand:v1";

const INK = "#13161B";
const PAPER = "#F6F3ED";
const SIGNAL = "#F85003";

const WORD_EXAMPLES = ["다정", "하늘", "산책", "고양이", "새벽", "웃음", "바다", "커피"];

// 막힐 때 단서 질문 — 의장 답은 의장이 2026-11-20 직접 준 것 (docs/naegabrand/example-chair.md)
const CLUES = [
  ["오늘을 색 하나로 말하면?", "하늘색"],
  ["하루 중에 제일 좋아하는 시간은?", "잠들기 전"],
  ["요즘 제일 많이 쓰는 이모지는?", "스마일(웃는)"],
  ["오늘 먹은 것 중에 제일 기억나는 건?", "족발덮밥"],
  ["어릴 때 질리지도 않고 했던 놀이는?", "간지럼 태우기"],
  ["친구들이 너한테 자주 하는 말은?", "다정하다"],
  ["최근에 \"오, 이거 좋다\" 하고 저장해 둔 건?", "고양이 이야기"],
  ["주말에 아무 계획 없으면 제일 먼저 하는 건?", "전시회 보러 가기"],
];

const PERSONS = [
  { ko: "가족", en: "FAMILY", suffix: "HOUSE" },
  { ko: "친구", en: "FRIEND", suffix: "CLUB" },
  { ko: "연인", en: "MY LOVE", suffix: "& YOU" },
  { ko: "나 자신", en: "MYSELF", suffix: "SELF" },
  { ko: "직접 쓰기", en: "", suffix: "STUDIO", custom: true },
];

const COLORS = [
  ["하늘색", "SKY", "#8EC9F0"], ["빨강", "RED", "#E23B2E"], ["주황", "ORANGE", "#F85003"],
  ["노랑", "YELLOW", "#F5C518"], ["초록", "GREEN", "#2F9E5A"], ["민트", "MINT", "#7FD6C2"],
  ["파랑", "BLUE", "#2952D9"], ["보라", "PURPLE", "#7A4FD0"], ["분홍", "PINK", "#F29AC0"],
  ["갈색", "BROWN", "#8A5A3C"], ["회색", "GREY", "#9AA0A6"], ["검정", "BLACK", "#13161B"],
  ["흰색", "WHITE", "#FFFFFF"],
];

const STYLES = [
  { id: "bold", label: "굵게" },
  { id: "badge", label: "배지" },
  { id: "tag", label: "태그" },
];

const state = { word: "", person: null, personText: "", color: null, name: "", style: "bold" };

// ---------- 저장 (이 기기만) ----------
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* 저장 못 해도 진행 */ }
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (_) { /* 무시 */ }
}

// ---------- 한글 → 로마자 (간단한 국어의 로마자 표기) ----------
const CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const JUNG = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const JONG = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];
function romanize(text) {
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
const hasHangul = (s) => /[가-힣]/.test(s);
const latinOf = (s) => (hasHangul(s) ? romanize(s) : s).toUpperCase().replace(/\s+/g, " ").trim();

// ---------- 화면 조각 ----------
function chip(label, onClick, { checked = false, role = "button" } = {}) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = label;
  if (role === "radio") { b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(checked)); }
  b.addEventListener("click", onClick);
  return b;
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}
function show(step) {
  for (let i = 2; i <= 5; i++) $("step" + i).hidden = i > step;
  const el = $("step" + step);
  if (step > 1) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
}

// ---------- 01 단어 ----------
function setupStep1() {
  const input = $("wordInput");
  input.value = state.word || "";
  const box = $("wordChips");
  WORD_EXAMPLES.forEach((w) => box.appendChild(chip(w, () => { input.value = w; input.focus(); })));
  const go = () => {
    const w = input.value.trim();
    if (!w) { toast("단어 하나만 적어 줘"); input.focus(); return; }
    if (w !== state.word) { state.word = w; state.name = ""; }
    save();
    $("wordEcho").textContent = `"${w}"`;
    renderStep2();
    show(2);
  };
  $("wordNext").addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });

  let clueIdx = Math.floor(Math.random() * CLUES.length);
  const showClue = () => {
    const [q, a] = CLUES[clueIdx % CLUES.length];
    $("clueQ").textContent = q;
    $("clueA").textContent = `의장은 "${a}"라고 답했어. 너는? 떠오른 답이 곧 네 단어야.`;
    $("clueBox").hidden = false;
  };
  $("stuckBtn").addEventListener("click", showClue);
  $("clueNext").addEventListener("click", () => { clueIdx++; showClue(); });
}

// ---------- 02 선물 + 색 ----------
function renderStep2() {
  const pBox = $("personChips");
  pBox.textContent = "";
  PERSONS.forEach((p, i) => {
    pBox.appendChild(chip(p.ko, () => {
      state.person = i;
      $("personInput").hidden = !p.custom;
      if (p.custom) $("personInput").focus();
      save(); renderStep2(); checkGift();
    }, { checked: state.person === i, role: "radio" }));
  });
  const pi = $("personInput");
  pi.hidden = !(state.person !== null && PERSONS[state.person].custom);
  pi.value = state.personText || "";

  const cBox = $("colorChips");
  cBox.textContent = "";
  COLORS.forEach(([ko, , hex], i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(state.color === i));
    b.innerHTML = `<span class="swatch-dot" style="background:${hex}"></span>${ko}`;
    b.addEventListener("click", () => { state.color = i; save(); renderStep2(); checkGift(); });
    cBox.appendChild(b);
  });
  checkGift();
}
function personReady() {
  if (state.person === null) return false;
  return !PERSONS[state.person].custom || state.personText.trim().length > 0;
}
function checkGift() { $("giftNext").disabled = !(personReady() && state.color !== null); }
function personKo() { const p = PERSONS[state.person]; return p.custom ? state.personText.trim() : p.ko; }
function personEn() { const p = PERSONS[state.person]; return p.custom ? latinOf(state.personText) : p.en; }

// ---------- 03 이름 ----------
// R-041: 단어를 그대로 쓰지 않고, 같은 결의 격 있는 다른 말로 이름 예시를 보여 준다 (app/naming-words.js).
// 사전에 없는 단어면 내 AI 에게 물어볼 글을 준비한다. 흔한 꼬리말·숫자 붙이기는 하지 않는다(R-040).
function candidates() {
  return namingIdeas(state.word).map(([n, lang, gloss]) => [n, `${lang} · ${gloss}`]);
}
function namePrompt() {
  const w = state.word.trim();
  return [
    `"${w}"라는 단어에서 출발해서 티셔츠·맨투맨 로고에 들어갈 브랜드 이름을 5개 지어 줘.`,
    `- "${w}"를 그대로 쓰지 말고, 뜻이나 느낌이 통하는 격 있는 다른 단어(영어·라틴어·프랑스어·이탈리아어·한자어 등)로.`,
    "- 이름마다 어느 나라 말인지와 뜻을 한 줄로 알려 줘.",
    "- CLUB, STUDIO 같은 꼬리말이나 숫자는 붙이지 마.",
    `- ${personKo()}에게 선물할 로고야.`,
  ].join("\n");
}
function renderStep3() {
  const w = state.word.trim();
  $("nameWord").textContent = `"${w}"`;
  const box = $("nameList");
  box.textContent = "";
  const list = candidates();
  $("nameMissing").hidden = list.length > 0;
  $("nameHelp").hidden = list.length === 0;
  $("namePrompt").value = namePrompt();
  list.forEach(([n, why]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "name-opt";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(state.name === n));
    b.innerHTML = `<b></b><small></small>`;
    b.querySelector("b").textContent = n;
    b.querySelector("small").textContent = why;
    b.addEventListener("click", () => { state.name = n; $("nameInput").value = n; save(); renderStep3(); });
    box.appendChild(b);
  });
  $("nameInput").value = state.name;
  $("nameNext").disabled = !state.name.trim();
}

// ---------- 04 로고 ----------
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

function drawLogo(canvas) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const name = state.name.trim();
  const color = COLORS[state.color][2];
  const pEn = personEn();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (state.style === "bold") {
    const txt = hasHangul(name) ? name : name.toUpperCase();
    const px = fit(ctx, txt, fontFor(txt), W * 0.86, 300);
    strokeFill(ctx, txt, W / 2, H * 0.44, color, Math.max(10, px * 0.08));
    ctx.fillStyle = SIGNAL;
    ctx.fillRect(W * 0.2, H * 0.44 + px * 0.62, W * 0.6, 12);
    const cap = `FOR ${pEn} · EST. 2026`;
    fit(ctx, cap, fontFor(cap), W * 0.7, 56, 24);
    strokeFill(ctx, cap, W / 2, H * 0.44 + px * 0.62 + 70, color, 6);
  } else if (state.style === "badge") {
    const cx = W / 2, cy = H / 2, R = W * 0.44;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    const inner = isDark(color) ? PAPER : INK;
    ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
    ctx.lineWidth = 8; ctx.strokeStyle = inner; ctx.stroke();
    const ring = `MADE FOR ${pEn}`;
    ctx.fillStyle = inner;
    ctx.font = hasHangul(ring) ? "900 64px Pretendard, sans-serif" : "64px Anton, Impact, sans-serif";
    arcText(ctx, ring, cx, cy, R * 0.86, -Math.PI / 2, false);
    ctx.font = "56px Anton, Impact, sans-serif";
    arcText(ctx, "EST. 2026", cx, cy, R * 0.86, Math.PI / 2, true);
    const txt = hasHangul(name) ? name : name.toUpperCase();
    fit(ctx, txt, fontFor(txt), R * 1.25, 200);
    ctx.fillStyle = inner;
    ctx.fillText(txt, cx, cy + 6);
  } else {
    const txt = hasHangul(name) ? name : name.toUpperCase();
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
  }
  return canvas.toDataURL("image/png");
}

function renderStyleTabs() {
  const box = $("styleTabs");
  box.textContent = "";
  STYLES.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(state.style === s.id));
    b.textContent = s.label;
    b.addEventListener("click", () => { state.style = s.id; save(); renderStep4(); });
    box.appendChild(b);
  });
}
function aiPrompt() {
  const [ko, , hex] = COLORS[state.color];
  return [
    "티셔츠·맨투맨에 프린트할 로고 이미지를 만들어 줘.",
    `- 브랜드 이름: ${state.name.trim()} (이 철자 그대로 정확하게)`,
    `- 시작한 단어: ${state.word.trim()}`,
    `- ${personKo()}에게 선물하려고 만드는 로고야.`,
    `- 메인 색: ${ko} (${hex})`,
    "- 스트릿 무드, 단순하고 굵은 그래픽, 흰 배경, 정사각형",
  ].join("\n");
}
async function renderStep4() {
  renderStyleTabs();
  await fontsReady();
  const url = drawLogo($("logoCanvas"));
  $("teeLogo").src = url;
  $("aiPrompt").value = aiPrompt();
}

// ---------- 05 공유 카드 ----------
async function makeCard() {
  await fontsReady();
  const logo = document.createElement("canvas");
  logo.width = logo.height = 1000;
  drawLogo(logo);
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
  const nm = state.name.trim();
  fit(ctx, nm, fontFor(nm), 900, 84, 36);
  ctx.fillText(nm, 540, 1070);
  ctx.font = "700 36px Pretendard, sans-serif";
  ctx.fillStyle = "#5B5F66";
  const line = `"${state.word.trim()}"에서 시작해, ${personKo()}에게 선물하는 브랜드`;
  fit(ctx, line, (px) => `700 ${px}px Pretendard, sans-serif`, 900, 36, 22);
  ctx.fillText(line, 540, 1140);
  ctx.fillStyle = INK;
  ctx.font = "30px Anton, Impact, sans-serif";
  ctx.fillText("OWNSTREET.TEAM · URBANBEYOND", 540, 1250);
  return c;
}
async function renderStep5() {
  const c = await makeCard();
  const url = c.toDataURL("image/png");
  $("cardImg").src = url;
  $("downloadBtn").href = url;
  $("downloadBtn").download = `${latinOf(state.name).replace(/[^A-Z0-9]+/g, "-") || "naegabrand"}.png`;
  $("shareBtn").onclick = async () => {
    try {
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      const file = new File([blob], "naegabrand.png", { type: "image/png" });
      const data = { title: "내가브랜드", text: `내가 만든 브랜드 어때? — ${state.name.trim()}`, files: [file] };
      if (navigator.canShare && navigator.canShare(data)) { await navigator.share(data); return; }
      if (navigator.share) { await navigator.share({ title: data.title, text: data.text, url: location.href }); return; }
      toast("이 기기는 바로 공유가 안 돼. 이미지를 저장해서 보내 줘");
    } catch (e) {
      if (e && e.name !== "AbortError") toast("공유가 안 됐어. 이미지 저장으로 해 줘");
    }
  };
}

// ---------- 글꼴 ----------
let fontsPromise = null;
function fontsReady() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      document.fonts.load("64px Anton"),
      document.fonts.load("900 64px Pretendard"),
      document.fonts.load("700 36px Pretendard"),
    ]).catch(() => null);
  }
  return fontsPromise;
}

// ---------- 시작 ----------
function init() {
  load();
  setupStep1();
  $("personInput").addEventListener("input", (e) => { state.personText = e.target.value; save(); checkGift(); });
  $("giftNext").addEventListener("click", () => { renderStep3(); show(3); });
  $("nameInput").addEventListener("input", (e) => {
    state.name = e.target.value;
    save();
    $("nameNext").disabled = !state.name.trim();
    document.querySelectorAll(".name-opt").forEach((b) => b.setAttribute("aria-checked", String(b.querySelector("b").textContent === state.name)));
  });
  $("nameNext").addEventListener("click", async () => { show(4); await renderStep4(); });
  $("logoNext").addEventListener("click", async () => { show(5); await renderStep5(); });
  $("useWord").addEventListener("click", () => {
    state.name = state.word.trim(); save(); renderStep3(); $("nameInput").focus();
  });
  $("copyNamePrompt").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("namePrompt").value); toast("복사했어. 내 AI에 붙여넣어 봐"); }
    catch (_) { $("namePrompt").select(); toast("글을 길게 눌러 복사해 줘"); }
  });
  $("copyPrompt").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("aiPrompt").value); toast("복사했어. 내 AI에 붙여넣어 봐"); }
    catch (_) { $("aiPrompt").select(); toast("글을 길게 눌러 복사해 줘"); }
  });
  $("restartBtn").addEventListener("click", () => {
    Object.assign(state, { word: "", person: null, personText: "", color: null, name: "", style: "bold" });
    save();
    $("wordInput").value = "";
    show(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("wordInput").focus();
  });
  fontsReady();
}
init();
