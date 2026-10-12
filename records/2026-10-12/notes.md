# 2026-10-12 기록 (저장소 밖 일, 의장 전달)

## 발행 경로 점검 (의장 요청, 2026-10-12 오후)
- 증상: GitHub "Morning Publish" 워크플로가 10-11(#13)·10-12(#14) 연속 실패.
- 로그 원인: 토큰 만료가 아니라 `IG_USER_ID`·`FB_PAGE_ID` 두 값이 비어 있어서. 인스타 "Object with ID 'media' does not exist", 페이스북 "(#100) 0 does not resolve to a valid user ID".
- 확인: 누락됐던 10-11 포스트를 Metricool 로 수동 발행 → 페이스북·인스타그램 모두 PUBLISHED. 브랜드 Meta 연결 자체는 정상.
  - FB: facebook.com/1428462956051823/posts/1458062596425192 / IG: instagram.com/p/DeYh4p2CenK
- 결론: 문제는 GitHub Secrets 두 개(IG_USER_ID, FB_PAGE_ID)가 비어 있는 것. Metricool 경로(소설과 동일)는 멀쩡함.
- 주의: Metricool 과 GitHub 워크플로는 서로 다른 자격 증명을 쓴다. 이번 성공은 Meta 쪽 목적지가 살아 있음을 증명할 뿐, GitHub 에 넣을 토큰의 유효성까지 증명하지는 않는다.
- 미결정(의장): ① GitHub Secrets 에 번호 두 개를 채워 기존 경로를 살릴지, ② 일일 포스트도 Metricool 경로로 옮길지.
