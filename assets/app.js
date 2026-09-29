(() => {
  "use strict";
  const state = { questions: [], mode: "all", order: [], position: 0, selected: [], revealed: false, results: {}, responses: {}, favorites: new Set(), wrong: new Set() };
  const card = document.getElementById("question-card");
  const status = document.getElementById("session-status");
  const storageKey = "theone-driving-bank-20260309-v1";
  const officialVideos = "https://www.safedriving.or.kr/subExamBoard/selectSubExamBoardMovieList.do?menuCd=MN-PO-1153";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const sample = (items, count) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  };
  function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      state.favorites = new Set((saved.favorites || []).filter(Number.isInteger));
      state.wrong = new Set((saved.wrong || []).filter(Number.isInteger));
    } catch { /* Storage may be unavailable. Practice still works. */ }
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({ favorites: [...state.favorites], wrong: [...state.wrong] })); } catch { /* Ignore blocked storage. */ }
    document.getElementById("favorite-count").textContent = state.favorites.size;
    document.getElementById("wrong-count").textContent = state.wrong.size;
  }
  function current() { return state.questions[state.order[state.position]]; }
  function setMode(mode) {
    state.mode = mode;
    const all = state.questions.map((_, index) => index);
    if (mode === "random") state.order = sample(all, all.length);
    else if (mode === "mock") state.order = sample(all.filter(index => !state.questions[index].videoReference), 40);
    else if (mode === "wrong") state.order = all.filter(index => state.wrong.has(state.questions[index].number));
    else if (mode === "favorite") state.order = all.filter(index => state.favorites.has(state.questions[index].number));
    else state.order = all;
    state.position = 0;
    state.selected = [];
    state.revealed = false;
    state.results = {};
    state.responses = {};
    document.querySelectorAll("[data-mode]").forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    render();
  }
  function updateStatus() {
    if (state.mode === "mock") {
      const entries = Object.values(state.results);
      const correct = entries.filter(Boolean).length;
      status.textContent = `${entries.length}/40 풀이 · ${correct}개 정답${entries.length === 40 ? " · 연습 완료" : ""}`;
    } else status.textContent = state.order.length ? `${state.position + 1}/${state.order.length} 문항` : "저장된 문항이 없습니다";
    document.getElementById("previous").disabled = state.position === 0 || !state.order.length;
    document.getElementById("next").disabled = state.position >= state.order.length - 1;
  }
  function render() {
    updateStatus();
    if (!state.order.length) {
      card.innerHTML = `<div class="loading">${state.mode === "wrong" ? "오답으로 저장된 문제가 없습니다." : "즐겨찾기한 문제가 없습니다."}</div>`;
      return;
    }
    const q = current();
    const savedResult = state.mode === "mock" && Object.hasOwn(state.results, q.number);
    if (savedResult) { state.revealed = true; state.selected = state.responses[q.number] || []; }
    const multi = q.answer.length > 1;
    const images = q.images.map((src, index) => `<img src="${escape(src)}" alt="${q.number}번 문제 그림 ${index + 1}" loading="lazy">`).join("");
    const choices = q.options.map((option, index) => {
      const num = index + 1;
      const selected = state.selected.includes(num);
      const correct = state.revealed && q.answer.includes(num);
      const incorrect = state.revealed && selected && !correct;
      return `<button class="choice ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${incorrect ? "incorrect" : ""}" type="button" data-choice="${num}" aria-pressed="${selected}" ${state.revealed ? "disabled" : ""}><span class="num">${num}.</span>${escape(option)}</button>`;
    }).join("");
    const isCorrect = state.selected.length === q.answer.length && state.selected.every(num => q.answer.includes(num));
    card.innerHTML = `<div class="question-head"><span class="pill">${q.number}번</span><span class="pill">${multi ? `${q.answer.length}개 선택` : "1개 선택"}</span>${q.videoReference ? '<span class="pill video">영상 참조</span>' : ""}<span class="count">원본 PDF ${q.pages[0]}쪽</span></div>
      <h2 class="question-title">${escape(q.stem)}</h2>
      ${q.videoReference ? `<p class="notice">원본 PDF에는 이 문제의 영상이 없습니다. <a href="${officialVideos}" target="_blank" rel="noopener noreferrer">공단 동영상 문제</a>를 확인한 뒤 답을 선택하세요.</p>` : ""}
      ${images ? `<div class="figures">${images}</div>` : ""}
      ${q.context ? `<p class="context">${escape(q.context)}</p>` : ""}
      <div class="choices" aria-label="선택지">${choices}</div>
      <div class="question-actions"><button id="check" type="button" ${state.selected.length === (multi ? q.answer.length : 1) || state.revealed ? "" : "disabled"} ${state.revealed ? "hidden" : ""}>정답 확인</button><button class="favorite ${state.favorites.has(q.number) ? "active" : ""}" id="favorite" type="button" aria-pressed="${state.favorites.has(q.number)}">${state.favorites.has(q.number) ? "★ 즐겨찾기" : "☆ 즐겨찾기"}</button></div>
      ${state.revealed ? `<div class="feedback ${isCorrect ? "" : "wrong"}"><strong>${isCorrect ? "정답입니다" : `정답은 ${q.answer.join(", ")}번입니다`}</strong>${q.explanation ? escape(q.explanation) : "원본 PDF에 별도 해설이 없습니다."}</div>` : ""}`;
    card.querySelectorAll("[data-choice]").forEach(button => button.addEventListener("click", () => {
      const num = Number(button.dataset.choice);
      if (multi) state.selected = state.selected.includes(num) ? state.selected.filter(item => item !== num) : state.selected.length < q.answer.length ? [...state.selected, num] : state.selected;
      else state.selected = [num];
      render();
    }));
    const check = document.getElementById("check");
    if (check) check.addEventListener("click", () => {
      if (state.revealed || state.selected.length !== q.answer.length) return;
      const right = state.selected.every(num => q.answer.includes(num));
      state.revealed = true;
      if (right) state.wrong.delete(q.number); else state.wrong.add(q.number);
      if (state.mode === "mock") state.results[q.number] = right;
      if (state.mode === "mock") state.responses[q.number] = [...state.selected];
      save(); render();
    });
    document.getElementById("favorite").addEventListener("click", () => {
      if (state.favorites.has(q.number)) state.favorites.delete(q.number); else state.favorites.add(q.number);
      save(); render();
    });
  }
  function move(delta) {
    const next = state.position + delta;
    if (next < 0 || next >= state.order.length) return;
    state.position = next;
    state.selected = [];
    state.revealed = false;
    render();
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  document.getElementById("previous").addEventListener("click", () => move(-1));
  document.getElementById("next").addEventListener("click", () => move(1));
  document.getElementById("jump").addEventListener("click", () => {
    const number = Number(document.getElementById("question-number").value);
    if (!Number.isInteger(number) || number < 1 || number > state.questions.length) { status.textContent = "1~1000번을 입력하세요"; return; }
    setMode("all"); state.position = number - 1; render(); card.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("question-number").addEventListener("keydown", event => { if (event.key === "Enter") document.getElementById("jump").click(); });
  loadSaved(); save();
  fetch("questions.json").then(response => { if (!response.ok) throw Error(String(response.status)); return response.json(); }).then(questions => {
    if (!Array.isArray(questions) || questions.length !== 1000) throw Error("문항 수 확인 실패");
    state.questions = questions;
    setMode("all");
  }).catch(error => { card.innerHTML = `<div class="notice">문제은행을 불러오지 못했습니다. 페이지를 새로고침해 주세요. (${escape(error.message)})</div>`; });
})();
