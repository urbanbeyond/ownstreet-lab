// 내가브랜드 MCP 커넥터 (R-042) — https://ownstreet.team/mcp
// 사용자가 자기 ChatGPT·Claude 의 커스텀 커넥터에 이 주소를 넣으면, 대화는 사용자 AI(사용자 사용량)가 하고
// 이 서버는 진행 안내·이름 사전·로고 링크만 준다. 로그인 없음, 저장 없음, 유료 API 없음.
// 전송: MCP Streamable HTTP (POST JSON-RPC, JSON 응답만 — 스트림 없음)
import { namingIdeas } from "../../app/naming-words.js";

export const config = { path: "/mcp" };

const SITE = "https://ownstreet.team";
const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "naegabrand", title: "내가브랜드", version: "1.0.0" };

const GUIDE = `너는 urbanbeyond 의 "내가브랜드" 진행자야. 사용자가 단어 하나로 시작해서 티셔츠·맨투맨 로고용 브랜드를 만들도록, 가볍게 대화로 돕는다.

말투: 친근한 반말(수평어). 짧게. 한 번에 질문 하나만. 정답을 가르치지 않는다.

진행 순서
1. "지금 떠오른 단어 1개는?" 을 묻는다. 사람·물건·기분·장소 뭐든 괜찮다고 말해 준다.
   막히면 아래 단서 질문 중 하나만 던진다 (떠오른 답이 곧 단어):
   - 오늘을 색 하나로 말하면? / 하루 중에 제일 좋아하는 시간은? / 요즘 제일 많이 쓰는 이모지는?
   - 오늘 먹은 것 중에 제일 기억나는 건? / 친구들이 너한테 자주 하는 말은? / 주말에 계획 없으면 제일 먼저 하는 건?
2. "티셔츠나 맨투맨에 들어갈 로고를 만든다고 생각해 봐. 소중한 사람에게 선물한다면, 누구야?" (가족 · 친구 · 연인 · 나 자신 · 직접 말하기)
3. "떠오른 색 하나는?" (아무 색이나. 하늘색·빨강·주황·노랑·초록·민트·파랑·보라·분홍·갈색·회색·검정·흰색 중에 고르면 로고에 바로 쓰인다)
4. 이름 예시 — 먼저 naegabrand_name_words 를 불러 사전 예시를 받는다. 사전에 없거나 부족하면 직접 짓는다.
   규칙:
   - 사용자의 단어를 그대로 쓰지 않는다. 그 단어를 기준으로 뜻이나 느낌이 통하는 격 있는 다른 말(영어·라틴어·프랑스어·이탈리아어·한자어 등)로 짓는다.
   - 4~5개. 이름마다 어느 나라 말인지와 뜻을 한 줄로.
   - CLUB·STUDIO·HOUSE 같은 꼬리말, 숫자, 색 이름을 붙이지 않는다. 뜻이 확실하지 않은 외국어는 쓰지 않는다.
   - 마지막 선택은 사용자. 고르거나 마음대로 고쳐 쓰게 한다.
5. 로고 스타일을 묻는다: 굵게(bold) · 배지(badge) · 태그(tag). 고르면 naegabrand_make_logo 를 불러 링크를 받는다.
   링크를 그대로 보여 주고 "눌러서 티셔츠에 올려 보고, 자랑 카드로 저장해" 라고 안내한다.
6. 끝나면 다른 단어로 하나 더 할지 가볍게 묻는다.

하지 않는 것: 티셔츠 주문·결제 안내(아직 없음), 성격 유형 분석이나 진단, 긴 설명, 한 번에 여러 질문.`;

const TOOLS = [
  {
    name: "naegabrand_start",
    title: "내가브랜드 시작",
    description: "사용자가 '내가브랜드'를 하고 싶어 하거나, 단어 하나로 자기 브랜드·로고를 만들고 싶어 할 때 가장 먼저 부른다. 대화 진행 순서와 규칙을 돌려준다. 받은 순서대로 사용자와 한 번에 질문 하나씩 대화한다.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, title: "내가브랜드 시작" },
  },
  {
    name: "naegabrand_name_words",
    title: "이름 사전 찾기",
    description: "사용자의 단어와 같은 결의 격 있는 다른 말(영어·라틴어·프랑스어·이탈리아어·한자어 등)과 뜻을 이름 사전에서 찾는다. 이름 예시를 보여 주기 전에 부른다. 사전에 없으면 규칙에 맞게 직접 지어야 한다고 알려 준다.",
    inputSchema: {
      type: "object",
      properties: { word: { type: "string", description: "사용자가 떠올린 단어 (예: 다정, 하늘, 고양이)" } },
      required: ["word"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, title: "이름 사전 찾기" },
  },
  {
    name: "naegabrand_make_logo",
    title: "로고 만들기",
    description: "사용자가 이름과 로고 스타일을 고르면 부른다. 로고·티셔츠 미리보기·자랑 카드를 볼 수 있는 링크를 돌려준다. 링크를 사용자에게 그대로 보여 준다.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "사용자가 고른 브랜드 이름 (그대로, 24자 이내)" },
        color: { type: "string", description: "색 — 한국어 이름(하늘색·빨강·주황·노랑·초록·민트·파랑·보라·분홍·갈색·회색·검정·흰색) 또는 #RRGGBB" },
        gift_to: { type: "string", description: "선물할 사람 (가족·친구·연인·나 자신, 또는 사용자가 말한 사람)" },
        word: { type: "string", description: "처음 떠올린 단어" },
        style: { type: "string", enum: ["bold", "badge", "tag"], description: "굵게=bold, 배지=badge, 태그=tag" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, title: "로고 만들기" },
  },
];

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

function callTool(name, args = {}) {
  if (name === "naegabrand_start") {
    return { content: [{ type: "text", text: GUIDE }] };
  }
  if (name === "naegabrand_name_words") {
    const word = clip(args.word, 30);
    if (!word) return { content: [{ type: "text", text: "word 가 비어 있어. 사용자의 단어를 넣어서 다시 불러." }], isError: true };
    const ideas = namingIdeas(word);
    if (!ideas.length) {
      return {
        content: [{ type: "text", text: `"${word}" 는 아직 이름 사전에 없어. 규칙대로 직접 4~5개 지어 줘: "${word}"를 그대로 쓰지 말고, 뜻이나 느낌이 통하는 격 있는 다른 말(영어·라틴어·프랑스어·이탈리아어·한자어 등)로. 이름마다 언어와 뜻 한 줄. 꼬리말·숫자·색 이름 붙이기 금지. 뜻이 확실한 말만.` }],
        structuredContent: { word, found: false, ideas: [] },
      };
    }
    const list = ideas.map(([n, lang, gloss]) => ({ name: n, language: lang, meaning: gloss }));
    const lines = list.map((x) => `- ${x.name} (${x.language}) — ${x.meaning}`).join("\n");
    return {
      content: [{ type: "text", text: `"${word}" 이름 사전 예시:\n${lines}\n\n이 중에서 보여 주거나, 같은 규칙으로 더 다듬어도 돼. 고르고 고치는 건 사용자.` }],
      structuredContent: { word, found: true, ideas: list },
    };
  }
  if (name === "naegabrand_make_logo") {
    const n = clip(args.name, 24);
    if (!n) return { content: [{ type: "text", text: "name 이 비어 있어. 사용자가 고른 이름을 넣어서 다시 불러." }], isError: true };
    const style = ["bold", "badge", "tag"].includes(args.style) ? args.style : "bold";
    const q = new URLSearchParams({ n });
    const c = clip(args.color, 20); if (c) q.set("c", c);
    const t = clip(args.gift_to, 16); if (t) q.set("t", t);
    const w = clip(args.word, 20); if (w) q.set("w", w);
    q.set("s", style);
    const url = `${SITE}/b/?${q.toString()}`;
    return {
      content: [{ type: "text", text: `로고 링크: ${url}\n\n이 링크를 사용자에게 그대로 보여 줘. 열면 로고(스타일 바꾸기 가능)·티셔츠 미리보기·자랑 카드 저장/공유가 있어.` }],
      structuredContent: { url, name: n, style },
    };
  }
  return null;
}

function handle(msg) {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined || id === null;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

  if (!msg || msg.jsonrpc !== "2.0" || typeof method !== "string") return isNotification ? null : err(-32600, "Invalid Request");
  if (method.startsWith("notifications/")) return null;

  switch (method) {
    case "initialize": {
      const asked = params && params.protocolVersion;
      return ok({
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: "내가브랜드: 사용자가 단어 하나로 티셔츠 로고용 브랜드를 만들고 싶어 하면 naegabrand_start 를 먼저 부르고, 받은 순서대로 한 번에 질문 하나씩 대화한다.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = params && params.name;
      console.log(JSON.stringify({ evt: "tool", name }));
      const res = callTool(name, (params && params.arguments) || {});
      return res ? ok(res) : err(-32602, `Unknown tool: ${name}`);
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return isNotification ? null : err(-32601, `Method not found: ${method}`);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method Not Allowed — POST JSON-RPC only (내가브랜드 MCP: https://ownstreet.team/connect/)" } }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }
  let body;
  try { body = await req.json(); } catch (_) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const out = Array.isArray(body) ? body.map(handle).filter(Boolean) : handle(body);
  if (!out || (Array.isArray(out) && out.length === 0)) return new Response(null, { status: 202, headers: CORS });
  return new Response(JSON.stringify(out), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
};
