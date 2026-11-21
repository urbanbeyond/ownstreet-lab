// 내가브랜드 결과 페이지 — 사용자 AI(커넥터)가 만든 링크를 열면 로고·티셔츠·자랑 카드를 보여 준다.
// 주소: /b/?n=이름&c=색(#hex 또는 이름)&t=선물할 사람&w=시작 단어&s=bold|badge|tag
import { STYLES, colorHex, personEnOf, drawLogo, makeCard, shareCanvas, fileNameOf, fontsReady } from "../brand-render.js";

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const clip = (v, n) => (v || "").trim().slice(0, n);

const opts = {
  name: clip(q.get("n"), 24),
  word: clip(q.get("w"), 20),
  personKo: clip(q.get("t"), 16),
  color: colorHex(q.get("c")),
  style: STYLES.some((s) => s.id === q.get("s")) ? q.get("s") : "bold",
};
opts.personEn = opts.personKo ? personEnOf(opts.personKo) : "";

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}

function renderTabs() {
  const box = $("styleTabs");
  box.textContent = "";
  STYLES.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(opts.style === s.id));
    b.textContent = s.label;
    b.addEventListener("click", () => {
      opts.style = s.id;
      q.set("s", s.id);
      history.replaceState(null, "", `?${q.toString()}`);
      render();
    });
    box.appendChild(b);
  });
}

async function render() {
  renderTabs();
  await fontsReady();
  $("teeLogo").src = drawLogo($("logoCanvas"), opts);
  $("cardStep").hidden = true;
}

async function showCard() {
  const c = await makeCard(opts);
  const url = c.toDataURL("image/png");
  $("cardImg").src = url;
  $("downloadBtn").href = url;
  $("downloadBtn").download = fileNameOf(opts.name);
  $("shareBtn").onclick = () => shareCanvas(c, opts.name, toast);
  $("cardStep").hidden = false;
  $("cardStep").scrollIntoView({ behavior: "smooth", block: "start" });
}

if (!opts.name) {
  $("empty").hidden = false;
} else {
  document.title = `${opts.name} — 내가브랜드`;
  $("brandName").textContent = opts.name;
  const line = [opts.word && `"${opts.word}"에서 시작해`, opts.personKo && `${opts.personKo}에게 선물하는 브랜드`]
    .filter(Boolean).join(", ");
  $("brandLine").textContent = line || "내가 만든 브랜드";
  $("logoStep").hidden = false;
  $("cardBtn").addEventListener("click", showCard);
  render();
}
