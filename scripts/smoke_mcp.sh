#!/usr/bin/env bash
# 배포된 내가브랜드 커넥터(/mcp)와 결과·연결 페이지가 실제로 응답하는지 확인한다. 사용: scripts/smoke_mcp.sh https://주소
set -u
BASE="${1%/}"; FAIL=0
post() { curl -s -m 20 -X POST "$BASE/mcp" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "$1"; }
check() { if echo "$2" | grep -q "$3"; then echo "OK   $1"; else echo "FAIL $1 — $(echo "$2" | head -c 200)"; FAIL=1; fi; }
check "initialize"  "$(post '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}')" '"naegabrand"'
check "tools/list"  "$(post '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')" 'naegabrand_make_logo'
check "name_words"  "$(post '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"naegabrand_name_words","arguments":{"word":"다정"}}}')" '"found":true'
check "make_logo"   "$(post '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"naegabrand_make_logo","arguments":{"name":"TENDRE","color":"하늘색","style":"badge"}}}')" "/b/?n=TENDRE"
for p in / /b/ /connect/; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "$BASE$p")
  if [ "$code" = "200" ]; then echo "OK   GET $p"; else echo "FAIL GET $p — HTTP $code"; FAIL=1; fi
done
exit $FAIL
