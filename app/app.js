// 내가브랜드 — 단어 1개 → 선물할 사람·색 → 이름 → 로고 → 공유 카드
// 원천 기획: docs/strategy/02_내가브랜드_기획.md (R-034~R-038). 서버·유료 API 없음. 결과는 이 기기에만 저장.

import { namingIdeas } from "./naming-words.js";
import { COLORS, PERSONS, STYLES, latinOf, drawLogo, makeCard, shareCanvas, fileNameOf, fontsReady } from "./brand-render.js";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "naegabrand:v1";

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
function logoOpts() {
  return { name: state.name, color: COLORS[state.color][2], personEn: personEn(), style: state.style,
    word: state.word, personKo: personKo() };
}
async function renderStep4() {
  renderStyleTabs();
  await fontsReady();
  const url = drawLogo($("logoCanvas"), logoOpts());
  $("teeLogo").src = url;
  $("aiPrompt").value = aiPrompt();
}

// ---------- 05 공유 카드 ----------
async function renderStep5() {
  const c = await makeCard(logoOpts());
  const url = c.toDataURL("image/png");
  $("cardImg").src = url;
  $("downloadBtn").href = url;
  $("downloadBtn").download = fileNameOf(state.name);
  $("shareBtn").onclick = () => shareCanvas(c, state.name.trim(), toast);
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
