# 다낭 여행 대시보드 사용 방법

## 폴더 구조
```
index.html          ← 메인화면 (Bootstrap 기반)
style.css
app.js
manifest.json
sw.js
icons/
  icon-192.png
  icon-512.png
pages/
  florence.html      ← 숙소 1
  belmarina.html     ← 숙소 2
  hyatt.html         ← 숙소 3
  altara.html        ← 숙소 4
```

## 1. GitHub Pages로 배포하기 (Codespaces 사용)
1. GitHub에서 새 저장소(Repository)를 만듭니다. (예: `danang-trip`)
2. 저장소 페이지에서 **Code → Codespaces → Create codespace on main**을 눌러 Codespaces를 엽니다.
3. Codespaces 화면 왼쪽 파일 탐색기에 이 폴더 안의 모든 파일
   (`index.html`, `stay1~4.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`, `icons` 폴더)을
   그대로 끌어다 놓거나 업로드합니다.
4. 왼쪽 아래 터미널에 아래 명령어를 순서대로 입력합니다.
   ```
   git add .
   git commit -m "다낭 여행 대시보드 추가"
   git push
   ```
5. GitHub 저장소 페이지 상단 **Settings → Pages** 메뉴로 이동합니다.
6. **Branch**를 `main`, 폴더를 `/ (root)`로 선택하고 **Save**를 누릅니다.
7. 1~2분 후 `https://내아이디.github.io/danang-trip/` 주소로 접속하면 대시보드가 열려요.

## 2. 휴대폰에 앱처럼 설치하기 (PWA)
1. 휴대폰에서 위 주소로 접속합니다.
2. 화면 아래에 "홈 화면에 앱으로 설치할 수 있어요" 배너가 뜨면 **설치** 버튼을 누릅니다.
   - 아이폰(사파리)은 배너가 안 뜰 수 있어요. 이땐 공유 버튼(⬆️) → **홈 화면에 추가**를 누르면 됩니다.
3. 설치하면 다른 앱처럼 홈 화면 아이콘을 눌러 바로 실행돼요.

## 3. 각 기능 설명
- **환율 계산기**: 원화(KRW) 또는 동(VND) 칸에 숫자를 입력하면 실시간 환율로 자동 계산됩니다.
- **날씨**: 다낭 현재 기온과 5일 예보를 자동으로 불러옵니다.
- **지도 열기**: 구글맵 앱(또는 웹)으로 해당 주소를 바로 검색해줍니다.
- **Grab 호출**: Grab 앱이 설치되어 있으면 바로 열리고, 없으면 Grab 웹사이트로 이동합니다.
- **주소 복사**: 버튼을 누르면 숙소 주소가 클립보드에 복사돼요. (Grab 앱에 붙여넣기 하면 편해요)
- **숙소 근처 맛집 지도**: 각 숙소 페이지 하단에 실제 위치 기반 지도(OpenStreetMap, API 키 불필요)가 있고, 숙소 근처 맛집 3곳이 함께 표시돼요. 목록을 누르면 구글맵으로 바로 이동합니다. 다른 맛집으로 바꾸고 싶으면 각 `stayN.html` 파일 맨 아래 `initStayMap(...)` 부분의 `restaurants` 배열을 수정하면 돼요.

## 4. 나중에 수정하고 싶을 때
Codespaces에서 해당 파일을 열어 텍스트를 수정한 뒤 다시
```
git add .
git commit -m "수정"
git push
```
를 입력하면 1분 안에 실제 사이트에 반영됩니다.
