# 운전면허 학과시험 문제은행 2026

한국도로교통공단이 공개한 **2026년 3월 9일 시행 1·2종 보통·대형·특수 학과시험 문제은행**을 브라우저에서 연습할 수 있게 옮긴 비공식 학습 도구입니다.

- 1,000문항, 정답과 해설, 그림 자료
- 번호순·무작위·40문항 연습·오답노트·즐겨찾기
- 기록은 이용자의 브라우저에만 저장

## 원본과 한계

원본: [한국도로교통공단 안전운전 통합민원 문제은행](https://www.safedriving.or.kr/subExamBoard/selectSubExamBoardKorList.do?menuCd=MN-PO-1151). 이 저장소에는 원본 PDF를 포함하지 않습니다. `build-report.json`에 사용한 사본의 SHA-256과 추출 집계를 기록했습니다.

원본 PDF의 966~1000번은 별도 영상을 참조합니다. 이 저장소에는 영상이 없으므로 [공식 동영상 문제](https://www.safedriving.or.kr/subExamBoard/selectSubExamBoardMovieList.do?menuCd=MN-PO-1153)를 함께 확인해야 합니다. 964번은 원본 PDF에 별도 해설이 없습니다. 이 페이지의 40문항 결과는 학습용 정답률이며 실제 시험의 배점이나 합격 판정이 아닙니다.

## 실행

정적 파일 서버로 이 디렉터리를 열면 됩니다.

```sh
python -m http.server 8000
```

`http://localhost:8000/`에서 확인할 수 있습니다. `tools/build_bank.py`로 원본 PDF에서 JSON과 그림을 다시 만들려면 Python과 PyMuPDF가 필요합니다.

```sh
python tools/build_bank.py /path/to/original.pdf .
```

## 데이터 구조

`questions.json`의 각 문항에는 번호, 질문, 선택지, 정답 번호, 해설, PDF 쪽수, 그림 경로, 영상 참조 여부가 담겨 있습니다. 추출 오류를 발견하면 원본 쪽수와 문항 번호를 함께 알려주세요.
