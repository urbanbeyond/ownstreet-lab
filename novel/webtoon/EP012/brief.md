# EP012 웹툰 콘티
- 회차: EP012 — 화면 전체와 보이는 화면은 다르다
- 날짜: 2026-10-24
- 컷 수 계산: 비트 6개 → 6컷. ①시작(사흘 만에 디자이너 차례, 윤 개발자의 두 번 반복된 부탁) ②1차 확인(전체 캡처로는 깨끗해 보임) ③전환(뷰포트 캡처로 다시 보니 로그인 버튼에 안내 문구가 가려짐) ④원인 추적(윤 개발자와 함께 chat.active 누락을 찾음) ⑤해소(한 줄 수정, 모바일·데스크톱 재확인) ⑥여운(메모를 남기고, "로그인부터 접수번호까지 아직 없다"는 숙제를 다시 보는 마케터). 각 비트가 없으면 "왜 전체 캡처로는 못 봤는지, 왜 이게 중요한지"가 이어지지 않는다.
- 그림체: 실사체 (만화체 아님)

## 컷 1 — 시작: 사흘 만의 차례
- 분위기 프리셋: 새벽 몰입
- 장소: 화이트보드 앞. "오늘은 누가" 칸에 "designer"라고 막 적힌 참.
- 인물: 진 디자이너 — slim woman in early 30s, 168cm, sleek black chin-length bob with straight bangs, small mole under right eye, all-black tailored jacket with a cobalt blue stitch line along the left shoulder, black turtleneck, wide black trousers. 평소 모습: 재킷을 입은 채 목을 가볍게 돌리는 동작.
- 구도: 화이트보드와 인물을 같이 담는 미디엄 와이드, 약간 측면.
- 표정·동작: 목을 한 번 돌리며 화이트보드의 글자를 바라본다. 가벼운 긴장.
- 빛: 해 뜨기 전 푸른 창빛, 화이트보드 쪽 스탠드 조명.
- 설명 박스: "사흘 넘게 쉬었던 자리였다."
- 말풍선: 없음
- 영문 프롬프트: Photo-realistic webtoon illustration, semi-realistic, vertical 4:5. Pre-dawn blue light inside a streetwear print studio. A slim woman in her early 30s with a sleek black chin-length bob, straight bangs and a small mole under her right eye, wearing an all-black tailored jacket with a cobalt blue stitch along the left shoulder, stands in front of a whiteboard, gently stretching her neck while looking at freshly written text on the board (board text illegible/blurred). Medium-wide shot, slight side angle. Add the Korean caption box text exactly as written above.

## 컷 2 — 1차 확인: 깨끗해 보이는 화면
- 분위기 프리셋: 새벽 몰입
- 장소: 진 디자이너 자리, 모니터 두 대(하나는 세로)와 폰 거치대.
- 인물: 진 디자이너 — 일할 때 모습: 몸을 숙여 폰 거치대를 들여다본다. 시그니처: 금속 자를 손에 쥔 채.
- 구도: 어깨 너머로 모니터 화면을 보는 각도, 모니터는 밝은 빛으로만.
- 표정·동작: 담담한 표정으로 화면을 확인.
- 빛: 모니터의 차가운 빛.
- 설명 박스: "콘솔에는 에러가 하나도 없었다."
- 말풍선: 배 마케터 [생각] — "깔끔하게 끝나는 날이겠구나."
- 영문 프롬프트: Photo-realistic webtoon illustration, semi-realistic, vertical 4:5. At a designer's desk with two monitors (one vertical) and several phone stands, a slim woman in her early 30s with a sleek black bob and a mole under her right eye, in an all-black tailored jacket with cobalt shoulder stitch, leans forward inspecting a glowing phone-stand screen (no readable text), a thin metal ruler in her hand. Over-the-shoulder angle, cool monitor light. Add the Korean caption box and thought bubble text exactly as written above.

## 컷 3 — 전환: 가려진 문구
- 분위기 프리셋: 막힘·실패
- 장소: 같은 자리, 폰 거치대를 더 가까이.
- 인물: 진 디자이너 — 일할 때 모습: 두 손가락으로 화면 위 간격을 재는 시그니처 동작.
- 구도: 폰 화면 클로즈업. 화면 아래쪽 입력창 영역과 그 위 문구가 겹치는 지점을 손가락으로 짚는다.
- 표정·동작: 눈을 가늘게 뜨고 집중, 손가락이 화면 위 한 지점에 멈춘다.
- 빛: 조명이 살짝 식는다, 모니터 빛만 남음.
- 설명 박스: "다 뜬 것과, 보이는 것은 다른 거예요."
- 말풍선: 진 디자이너 — "떴어요. 그런데 안 보여요."
- 영문 프롬프트: Photo-realistic webtoon illustration, semi-realistic, vertical 4:5. Extreme close-up on a phone-stand screen held by a slim woman's hand, her two fingers pausing mid-air as if measuring a gap near the bottom of the screen (screen shows only soft glowing shapes, no readable text), her sleek black bob and cobalt-stitched black sleeve visible at the frame edge. Cooler, dimmer lighting than before. Add the Korean caption box and speech bubble text exactly as written above.

## 컷 4 — 원인 추적: 함께 짚어보는 두 사람
- 분위기 프리셋: 막힘·실패 → 해결로 넘어가는 결
- 장소: 진 디자이너 자리, 윤 개발자가 지나가다 멈춰 선 모습.
- 인물:
  - 진 디자이너 — 일할 때 모습, 자를 책상에 내려놓고 모니터를 가리킴.
  - 윤 개발자 — solidly built man in late 30s, 182cm, short tight curly black hair, light stubble, forest green field jacket with asymmetric chest pockets, gray hoodie. 일할 때 모습: 걸음을 멈추고 몸을 기울여 화면을 들여다봄.
- 구도: 둘을 같이 담는 미디엄 투샷, 모니터를 사이에 두고.
- 표정·동작: 진 디자이너가 화면의 한 줄을 가리키고, 윤 개발자가 몸을 기울여 들여다보며 설명.
- 빛: 모니터 빛과 스탠드 빛이 섞임.
- 설명 박스: "이 표시가 꺼져 있으면, 화면을 내려주는 기능이 멈춰요."
- 말풍선: 윤 개발자 — "숨은 지뢰보다 더 조용한 거였네요."
- 영문 프롬프트: Photo-realistic webtoon illustration, semi-realistic, vertical 4:5. At a desk with two monitors, a slim woman with a sleek black bob and cobalt-stitched jacket points at a line on the screen (no readable text); beside her, a solidly built man in his late 30s with short curly black hair and light stubble, in a forest green field jacket over a gray hoodie, leans in to look, mid-explanation. Medium two-shot, mixed warm lamp and cool monitor light. Add the Korean caption box and speech bubble text exactly as written above.

## 컷 5 — 해소: 다시 찍어 비교하기
- 분위기 프리셋: 해결·안도
- 장소: 같은 자리, 모바일·데스크톱 화면을 나란히 띄운 모니터.
- 인물: 진 디자이너 — 일할 때 모습, 두 화면을 나란히 비교.
- 구도: 모니터 두 대를 같이 담는 와이드, 약간 높은 각도.
- 표정·동작: 두 화면을 번갈아 보며 고개를 끄덕인다. 표정이 풀린다.
- 빛: 아침에 가까운 밝은 빛이 섞여 들어옴.
- 설명 박스: "겹침이 사라지고, 평소와 같은 간격이 됐다."
- 말풍선: 진 디자이너 — "그래서 전체 캡처만 보면 안 돼요."
- 영문 프롬프트: Photo-realistic webtoon illustration, semi-realistic, vertical 4:5. A slim woman with a sleek black bob and cobalt-stitched black jacket sits before two monitors showing soft glowing mobile and desktop layouts side by side (no readable text), nodding with a relieved, softened expression. Wide shot, slightly elevated angle, warmer morning light mixing in. Add the Korean caption box and speech bubble text exactly as written above.

## 컷 6 — 여운: 메모와 남은 숙제
- 분위기 프리셋: 기다림
- 장소: 화이트보드 옆, 다음 숙제를 적는 자리. 배 마케터가 그 앞에 서 있음.
- 인물: 배 마케터 — slim young man in early 20s, 178cm, soft wavy brown-black hair, small mole under left eye, oversized black zip jacket with a small mustard patch on left chest, thin black crossbody strap. 일할 때 모습: 노란 캡션 노트를 손에 들고 화이트보드를 바라봄.
- 구도: 뒷모습에 가까운 3/4 각도, 화이트보드의 한 줄과 인물을 같이 담는 미디엄.
- 표정·동작: 생각하며 바라보는 얼굴, 노트를 가슴께에.
- 빛: 아침 햇빛이 화이트보드 쪽으로 번짐.
- 설명 박스: "오늘은 전체를 본 줄 알았는데, 조각만 보고 있었다."
- 말풍선: 없음
- 영문 프롬프트: Photo-realistic webtoon illustration, semi-realistic, vertical 4:5. Near a whiteboard with a softly blurred handwritten line (illegible), a slim young man in his early 20s with soft wavy hair and a small mole under his left eye, wearing an oversized black zip jacket with a mustard patch on the left chest and a thin black crossbody strap, stands in a three-quarter back angle, holding a small yellow notebook to his chest, looking thoughtfully at the board. Morning light spreading warmly across the frame. Add the Korean caption box text exactly as written above.

## 지킬 것
- 실사체 / 컷마다 4:5 세로 1080×1350 / 텍스트는 말풍선·설명 박스에만, 콘티 문장 그대로 / 로고 없음 / 의장 얼굴 없음 (의장 결정 전, 이 회차는 의장 미등장)
