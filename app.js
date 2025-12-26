
const $pickedRule = document.getElementById("pickedRule");
const $desc = document.getElementById("desc");
const $extraArea = document.getElementById("extraArea");

const $spinMainBtn = document.getElementById("spinMainBtn");

const $toggleRulesBtn = document.getElementById("toggleRulesBtn");
const $ruleCount = document.getElementById("ruleCount");
const $chev = document.getElementById("chev");
const $ruleListWrap = document.getElementById("ruleListWrap");
const $ruleList = document.getElementById("ruleList");

let MAIN_RULES = [];
let HIGH_UNITS = [];
let LEGEND_UNITS = [];
let HIDDEN_UNITS = [];
let LETTER_POOL = [];

let mainLis = [];
let mainIndex = 0;
let isSpinningMain = false;

const SPIN_MS = 1500;   
const MIN_DELAY = 18; 
const MAX_DELAY = 180;

function easeOutQuad(t){ return 1 - (1 - t) * (1 - t); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function clearExtra(){ $extraArea.innerHTML = ""; }

function setActiveRule(idx){
  mainLis.forEach((li, i) => li.classList.toggle("active", i === idx));
}

function rangeInt(min, max){
  const out = [];
  for (let i=min; i<=max; i++) out.push(String(i));
  return out;
}

function makeScaledDelays(totalTicks, durationMs, minDelay, maxDelay){
  const delays = [];
  for (let i=1; i<=totalTicks; i++){
    const t = i / totalTicks;
    const d = minDelay + (maxDelay - minDelay) * easeOutQuad(t);
    delays.push(d);
  }
  const sum = delays.reduce((a,b)=>a+b, 0);
  const scale = durationMs / sum;
  return delays.map(d => Math.max(10, d * scale));
}

async function spinPickOne(items, { durationMs = SPIN_MS, minDelay = MIN_DELAY, maxDelay = MAX_DELAY, onTick }){
  if (!items || items.length === 0) return null;

  const len = items.length;
  let start = Math.floor(Math.random() * len);
  const target = Math.floor(Math.random() * len);

  const baseTicks = Math.max(18, Math.min(60, Math.round(durationMs / 32)));
  const toTarget = (target - start + len) % len;
  const totalTicks = baseTicks + toTarget;

  const delays = makeScaledDelays(totalTicks, durationMs, minDelay, maxDelay);

  let idx = start;
  for (let i=0; i<delays.length; i++){
    idx = (idx + 1) % len;
    onTick?.(items[idx]);
    await sleep(delays[i]);
  }
  return items[idx];
}

function makeCard(title, subText){
  const card = document.createElement("div");
  card.className = "card";

  const h = document.createElement("div");
  h.className = "cardTitle";
  h.textContent = title;

  const sub = document.createElement("div");
  sub.className = "cardSub";
  sub.textContent = subText ?? "";

  const body = document.createElement("div");

  card.appendChild(h);
  if (subText) card.appendChild(sub);
  card.appendChild(body);

  return { card, body };
}

function createSlotRouletteGroup({
  title,
  sub,
  labels,
  items,
  uniqueWithinGroup = false,
  onGroupChange 
}){
  const { card, body } = makeCard(title, sub);

  const grid = document.createElement("div");
  grid.className = "slotGrid";

  const values = Array(labels.length).fill(null);

  function poolForSlot(i){
    if (!uniqueWithinGroup) return items;
    const used = new Set(values.filter((v, idx)=> idx !== i && v != null));
    return items.filter(x => !used.has(x));
  }

  function notify(){
    onGroupChange?.([...values]);
  }

  labels.forEach((label, i) => {
    const slot = document.createElement("div");
    slot.className = "slot";

    const top = document.createElement("div");
    top.className = "slotTop";

    const lab = document.createElement("div");
    lab.className = "slotLabel";
    lab.textContent = label;

    const btn = document.createElement("button");
    btn.className = "slotBtn";
    btn.textContent = "돌리기";

    const val = document.createElement("div");
    val.className = "slotValue";
    val.textContent = "—";

    btn.onclick = async () => {
      const pool = poolForSlot(i);
      if (pool.length === 0) {
        val.textContent = "후보 부족";
        return;
      }

      btn.disabled = true;
      val.classList.add("spinning");

      const picked = await spinPickOne(pool, {
        onTick: (t)=> { val.textContent = t; }
      });

      values[i] = picked;
      val.textContent = picked ?? "—";

      val.classList.remove("spinning");
      btn.disabled = false;
      notify();
    };

    top.appendChild(lab);
    top.appendChild(btn);
    slot.appendChild(top);
    slot.appendChild(val);

    grid.appendChild(slot);
  });

  body.appendChild(grid);
  return { card, values };
}

function colors(){ return ["빨강","파랑","보라","노랑"]; }

const RULES = {
  "원딜전": {
    desc: "항법은 자유, 갈수있는 상위는 무조건 1개로 제한",
    build: () => {}
  },

  "4인강제전": {
    desc: "상위로 갈 유닛 1개를 정하고, 모두가 그 유닛을 반드시 가야함",
    build: () => {
      const g = createSlotRouletteGroup({
        title: "상위 유닛 1개 뽑기",
        sub: "상위에서 1개",
        labels: ["상위 유닛"],
        items: HIGH_UNITS,
        uniqueWithinGroup: false
      });
      $extraArea.appendChild(g.card);
    }
  },

  "꼭가야할상위": {
    desc: "팀1/팀2가 각각 상위 유닛 2마리씩 뽑고 반드시 가야함 (팀 내부 중복 금지)",
    build: () => {
      const team = (name) => {
        const g = createSlotRouletteGroup({
          title: `${name} 상위 유닛 2개`,
          sub: "팀 내부 중복 금지",
          labels: ["1번","2번"],
          items: HIGH_UNITS,
          uniqueWithinGroup: true
        });
        $extraArea.appendChild(g.card);
      };
      team("팀1");
      team("팀2");
    }
  },

  "녜횡제조기전": {
    desc: "팀마다 글자 2개(중복 없이)를 뽑고, 그 글자가 들어간 상위 유닛만 갈 수 있음",
    build: () => {
      const makeTeam = (name) => {
        const { card, values } = createSlotRouletteGroup({
          title: `${name} 글자 2개`,
          sub: "글자 2개를 뽑아 그 글자(비슷한 어조 포함)가 있는 상위만 갈 수 있음",
          labels: ["글자1","글자2"],
          items: LETTER_POOL,
          uniqueWithinGroup: true,
          onGroupChange: (vals) => {
            renderAllowed(vals);
          }
        });

        const note = document.createElement("div");
        note.className = "note";
        note.textContent = "가능 유닛: (글자 2개가 모두 뽑히면 표시됨)";

        const allowedBox = document.createElement("div");
        allowedBox.className = "note";
        allowedBox.style.marginTop = "6px";

        function renderAllowed(vals){
          const [a,b] = vals;
          if (!a || !b){
            allowedBox.textContent = "—";
            return;
          }
          const letters = [a,b];
          const allowed = HIGH_UNITS.filter(u => letters.some(ch => String(u).includes(ch)));
          allowedBox.textContent = allowed.length ? allowed.join(", ") : "해당 글자를 포함한 유닛이 없음(임시 데이터 가능)";
        }

        renderAllowed(values);

        card.appendChild(note);
        card.appendChild(allowedBox);

        $extraArea.appendChild(card);
      };

      makeTeam("팀1");
      makeTeam("팀2");
    }
  },

  "인생의고도전 5+1~10+추가1~10": {
    desc: "각 개인(빨강/파랑/보라/노랑)이 5~15 숫자를 뽑고, 제일 보상 늦은 1명만 1~10을 한번 더 뽑음",
    build: () => {
      const nums1 = rangeInt(5, 15);

      const stage1 = createSlotRouletteGroup({
        title: "1차: 5~15 (4명)",
        sub: "각 색상별 1개씩",
        labels: colors(),
        items: nums1,
        uniqueWithinGroup: false,
        onGroupChange: (vals) => updateStage2(vals)
      });
      $extraArea.appendChild(stage1.card);

      const nums2 = rangeInt(1, 10);
      const { card: stage2Card } = makeCard("2차: 1~10 (제일 늦은 1명만)");
      const stage2Wrap = document.createElement("div");
      stage2Card.appendChild(stage2Wrap);

      let stage2Group = null;

      function updateStage2(vals){
        if (vals.some(v => v == null)) {
          stage2Wrap.innerHTML = "";
          stage2Group = null;
          return;
        }

        const res = {};
        colors().forEach((c,i)=> res[c] = Number(vals[i]));
        const maxV = Math.max(...Object.values(res));
        const candidates = Object.keys(res).filter(k => res[k] === maxV);
        const target = candidates.length === 1
          ? candidates[0]
          : candidates[Math.floor(Math.random() * candidates.length)];

        stage2Wrap.innerHTML = "";
        const info = document.createElement("div");
        info.className = "note";
        info.textContent = candidates.length === 1
          ? `제일 늦은 사람용`
          : ``;
        stage2Wrap.appendChild(info);

        stage2Group = createSlotRouletteGroup({
          title: "추가 룰렛",
          sub: `추가 룰렛 1회 돌리기`,
          labels: [target],
          items: nums2,
          uniqueWithinGroup: false
        });

        stage2Wrap.appendChild(stage2Group.card);
      }

      $extraArea.appendChild(stage2Card);
    }
  },

  "지츠다이스": {
    desc: "상위 4개(중복 없이) 뽑고, 빨/파/보/노가 순서를 뽑아(중복 없이) 원하는 상위를 순서대로 가져감",
    build: () => {
      // 1) 상위 4개
      const stage1 = createSlotRouletteGroup({
        title: "1단계: 상위 4개 뽑기",
        sub: "중복 없이 4개 (각 칸 따로 돌리기)",
        labels: ["상위1","상위2","상위3","상위4"],
        items: HIGH_UNITS,
        uniqueWithinGroup: true,
        onGroupChange: (vals) => updateStage2(vals)
      });
      $extraArea.appendChild(stage1.card);

      const { card: stage2Card } = makeCard("2단계: 순서 뽑기(1~4)", "1단계 4개가 모두 정해지면 진행");
      const stage2Wrap = document.createElement("div");
      stage2Card.appendChild(stage2Wrap);

      function updateStage2(vals){
        if (vals.some(v => v == null)) {
          stage2Wrap.innerHTML = "<div class='note'>—</div>";
          return;
        }

        stage2Wrap.innerHTML = "";
        const pickedUnits = vals;

        const orderGroup = createSlotRouletteGroup({
          title: "빨/파/보/노 순서",
          sub: "1~4 중복 없이",
          labels: colors(),
          items: ["1","2","3","4"],
          uniqueWithinGroup: true
        });

        stage2Wrap.appendChild(orderGroup.card);

        const hint = document.createElement("div");
        hint.className = "note";
        hint.textContent = `뽑힌 상위 4개: ${pickedUnits.join(", ")} / 순서 1부터 원하는 상위를 선택해서 가져가면 됨`;
        stage2Wrap.appendChild(hint);
      }

      stage2Wrap.innerHTML = "<div class='note'>—</div>";
      $extraArea.appendChild(stage2Card);
    }
  },

  "상위고정 1~4": {
    desc: "빨강/파랑/보라/노랑이 각각 1~4를 뽑고, 상위 유닛을 그 숫자에 맞게 무조건 가야함",
    build: () => {
      const g = createSlotRouletteGroup({
        title: "1~4 뽑기 (4명)",
        sub: "각 칸 따로 돌리기",
        labels: colors(),
        items: ["1","2","3","4"],
        uniqueWithinGroup: false
      });
      $extraArea.appendChild(g.card);
    }
  },

  "노불노초": {
    desc: "불멸, 초월 금지",
    build: () => {}
  },

  "강제전설+히든(4전설, 4히든)": {
    desc: "팀1/팀2가 각각 전설 4개 + 히든 4개를 (팀 내부 중복 없이) 뽑고 반드시 가야함",
    build: () => {
      const makeTeam = (team) => {
        const leg = createSlotRouletteGroup({
          title: `${team} 전설 4개`,
          sub: "전설 내부 중복 금지",
          labels: ["전설1","전설2","전설3","전설4"],
          items: LEGEND_UNITS,
          uniqueWithinGroup: true
        });
        $extraArea.appendChild(leg.card);

        const hid = createSlotRouletteGroup({
          title: `${team} 히든 4개`,
          sub: "히든 내부 중복 금지",
          labels: ["히든1","히든2","히든3","히든4"],
          items: HIDDEN_UNITS,
          uniqueWithinGroup: true
        });
        $extraArea.appendChild(hid.card);
      };

      makeTeam("팀1");
      makeTeam("팀2");
    }
  },

  "중도 10~30": {
    desc: "빨강/파랑/보라/노랑이 각각 10~30 숫자를 뽑고, 그만큼 중급도박을 해야함",
    build: () => {
      const g = createSlotRouletteGroup({
        title: "10~30 뽑기 (4명)",
        sub: "각 칸 따로 돌리기",
        labels: colors(),
        items: rangeInt(10, 30),
        uniqueWithinGroup: false
      });
      $extraArea.appendChild(g.card);
    }
  },

  "랜덤항법": {
    desc: "랜덤한 항법 선택(노란색)",
    build: () => {}
  },

  "신비한이세계전": {
    desc: "반드시 이세계 상위 유닛을 1개 가야함",
    build: () => {}
  },

  "신세계보상치기": {
    desc: "신세계 보상으로 받은 전설로 무조건 상위 유닛 가기(상위가 없는 캐릭은 안가도됨)",
    build: () => {
    }
  },

  "강제상위": {
    desc: "각각 빨강/파랑/보라/노랑이 룰렛으로 상위 유닛 1개를 뽑아서 반드시 그 상위를 가야함",
    build: () => {
      const g = createSlotRouletteGroup({
        title: "강제상위: 상위 유닛 1개씩 (4명)",
        sub: "각 칸 따로 돌리기 / 중복 허용",
        labels: colors(),
        items: HIGH_UNITS,
        uniqueWithinGroup: false
      });
      $extraArea.appendChild(g.card);
    }
  }

};

function defaultRule(ruleName){
  return {
    desc: "설명 준비중",
    build: () => {
      const { card, body } = makeCard("추가 룰 없음", "이 룰은 아직 추가 룰렛이 정의되지 않았습니다.");
      body.innerHTML = `<div class="note">${ruleName}</div>`;
      $extraArea.appendChild(card);
    }
  };
}

function renderRuleList(){
  $ruleList.innerHTML = "";
  mainLis = MAIN_RULES.map((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    $ruleList.appendChild(li);
    return li;
  });

  $ruleCount.textContent = String(MAIN_RULES.length);

  mainIndex = Math.floor(Math.random() * MAIN_RULES.length);
  setActiveRule(mainIndex);
  $pickedRule.textContent = MAIN_RULES[mainIndex];
}

function toggleRuleList(){
  const open = !$ruleListWrap.classList.contains("hidden");
  if (open){
    $ruleListWrap.classList.add("hidden");
    $chev.textContent = "▼";
  } else {
    $ruleListWrap.classList.remove("hidden");
    $chev.textContent = "▲";
  }
}

async function spinMainRule(){
  if (isSpinningMain || MAIN_RULES.length === 0) return;

  isSpinningMain = true;
  $spinMainBtn.disabled = true;
  $pickedRule.classList.add("spinning");

  clearExtra();

  const picked = await spinPickOne(MAIN_RULES, {
    onTick: (t) => {
      const idx = MAIN_RULES.indexOf(t);
      if (idx >= 0) setActiveRule(idx);
      $pickedRule.textContent = t;
    }
  });

  $pickedRule.classList.remove("spinning");

  const rule = picked ?? MAIN_RULES[mainIndex];
  const def = RULES[rule] ?? defaultRule(rule);

  $desc.textContent = def.desc;
  def.build();

  $spinMainBtn.disabled = false;
  isSpinningMain = false;
}

async function init(){
  $toggleRulesBtn.addEventListener("click", toggleRuleList);
  $spinMainBtn.addEventListener("click", spinMainRule);

  const res = await fetch("./data.json");
  const data = await res.json();

  MAIN_RULES = data.mainRules ?? [];
  HIGH_UNITS = data.highUnits ?? [];
  LEGEND_UNITS = data.legendUnits ?? [];
  HIDDEN_UNITS = data.hiddenUnits ?? [];
  LETTER_POOL = data.letterPool ?? [];

  renderRuleList();

  const first = MAIN_RULES[mainIndex];
  const def = RULES[first] ?? defaultRule(first);
  $desc.textContent = def.desc;
  def.build();
}

init();
