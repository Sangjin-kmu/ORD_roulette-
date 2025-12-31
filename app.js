const $pickedRule = document.getElementById("pickedRule");
const $desc = document.getElementById("desc");
const $extraArea = document.getElementById("extraArea");

const $spinMainBtn = document.getElementById("spinMainBtn");

const $toggleRulesBtn = document.getElementById("toggleRulesBtn");
const $ruleCount = document.getElementById("ruleCount");
const $chev = document.getElementById("chev");
const $ruleListWrap = document.getElementById("ruleListWrap");
const $ruleList = document.getElementById("ruleList");

const $lobbyUI = document.getElementById("lobbyUI");
const $roomUI = document.getElementById("roomUI");

const $createRoomBtn = document.getElementById("createRoomBtn");
const $openJoinBtn = document.getElementById("openJoinBtn");
const $lobbyInfo = document.getElementById("lobbyInfo");

const $joinOverlay = document.getElementById("joinOverlay");
const $joinRoomInput = document.getElementById("joinRoomInput");
const $joinRoomBtn = document.getElementById("joinRoomBtn");
const $closeJoinBtn = document.getElementById("closeJoinBtn");
const $joinInfo = document.getElementById("joinInfo");

const $roomInfo = document.getElementById("roomInfo");
const $copyRoomCodeBtn = document.getElementById("copyRoomCodeBtn");
const $leaveRoomBtn = document.getElementById("leaveRoomBtn");

const $toastRoot = document.getElementById("toastRoot");

const $nickInput = document.getElementById("nickInput");
const $memberCount = document.getElementById("memberCount");
const $memberList = document.getElementById("memberList");

const firebaseConfig = {
  apiKey: "AIzaSyCxRFYGtDtGik3qD_yDj5bioqHp4xSrFTQ",
  authDomain: "ord-roulette.firebaseapp.com",
  projectId: "ord-roulette",
  storageBucket: "ord-roulette.firebasestorage.app",
  messagingSenderId: "655941963892",
  appId: "1:655941963892:web:5bc64118e72f2efa20c121",
  measurementId: "G-XHXY3Q88T5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let DATA = null;
let MAIN_RULES = [];
let HIGH_UNITS = [];
let LEGEND_UNITS = [];
let HIDDEN_UNITS = [];
let LETTER_POOL = [];
let CORSAIR = [];

let uid = null;

let roomId = null;
let roomRef = null;
let isHost = false;

let unsubRoom = null;
let unsubEvents = null;
let unsubMembers = null;

let hostPingTimer = null;
let hostWatchTimer = null;
let memberBeatTimer = null;

let handledEventIds = new Set();

let mainLis = [];
let enabledRulesSet = new Set();
let currentRuleName = null;

let slotRegistry = new Map();
let groupNotifyRegistry = new Map();

let isSpinningMain = false;
let mainSpinAnimating = false;

const SPIN_MS = 1500;
const MIN_DELAY = 18;
const MAX_DELAY = 180;

const HOST_PING_MS = 15000;
const MEMBER_BEAT_MS = 15000;
const HOST_TIMEOUT_MS = 45000;
const MEMBER_ALIVE_MS = 45000;

const BANNED_HIGH_UNITS = new Set([
  "우타",
  "몽키 D. 루피(니카)",
  "마르코"
]);

let ruleCheckboxMap = new Map();

let lastRoomHostPing = null;
let lastIsHostUI = null;
let lastEnabledSig = "";
let lastRoomInfoText = "";
let lastPickedSig = "";
let lastSlotSig = "";
let eventsBootstrapped = false;
let lastMemberSig = "";

function toast(msg, ms = 1200){
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $toastRoot.appendChild(el);
  setTimeout(()=>{
    el.classList.add("out");
    setTimeout(()=> el.remove(), 250);
  }, ms);
}

function nowMs(){ return Date.now(); }
function tsToMs(ts){ return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0; }

function getNick(){
  const raw = ($nickInput?.value ?? "").trim();
  if (raw) return raw.slice(0, 16);
  const saved = (localStorage.getItem("ord_nick") || "").trim();
  return saved ? saved.slice(0, 16) : "익명";
}

function saveNick(){
  const raw = ($nickInput?.value ?? "").trim();
  localStorage.setItem("ord_nick", raw ? raw.slice(0,16) : "");
}

function filteredHighUnitsFor(ruleName){
  const needBan = new Set(["원딜전","4인강제전","꼭가야할상위","강제상위","지츠다이스"]);
  if (!needBan.has(ruleName)) return HIGH_UNITS;
  return HIGH_UNITS.filter(u => !BANNED_HIGH_UNITS.has(u));
}

function easeOutQuad(t){ return 1 - (1 - t) * (1 - t); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function clearExtra(){
  $extraArea.innerHTML = "";
  slotRegistry.clear();
  groupNotifyRegistry.clear();
}

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
  return delays.map(d => Math.max(8, d * scale));
}

async function spinBySteps(items, { startIdx, steps, durationMs = SPIN_MS, minDelay = MIN_DELAY, maxDelay = MAX_DELAY, onTick }){
  if (!items || items.length === 0) return null;

  const len = items.length;
  const totalTicks = Math.max(10, Math.min(480, steps || 0));
  const delays = makeScaledDelays(totalTicks, durationMs, minDelay, maxDelay);

  let idx = (startIdx ?? 0) % len;
  for (let i=0; i<totalTicks; i++){
    idx = (idx + 1) % len;
    onTick?.(items[idx], idx);
    await sleep(delays[i]);
  }
  return items[idx];
}

function randInt(min, max){
  const r = (typeof crypto !== "undefined" && crypto.getRandomValues)
    ? (()=>{ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; })()
    : Math.random();
  return Math.floor(r * (max - min + 1)) + min;
}

function makeSpinPlan(pool){
  const len = pool.length;
  const startIdx = randInt(0, len - 1);
  const targetIdx = randInt(0, len - 1);
  const loops = randInt(2, 4);
  const toTarget = (targetIdx - startIdx + len) % len;
  const steps = loops * len + toTarget;
  return { startIdx, steps, picked: pool[(startIdx + steps) % len] };
}

function showLobby(){
  $lobbyUI.classList.remove("hidden");
  $roomUI.classList.add("hidden");
  closeJoinOverlay();

  roomId = null;
  roomRef = null;
  isHost = false;
  currentRuleName = null;

  $pickedRule.textContent = "룰을 뽑아주세요";
  $desc.textContent = "아래 '룰 뽑기' 버튼을 눌러 시작하세요.";
  clearExtra();

  const saved = localStorage.getItem("ord_nick") || "";
  $nickInput.value = saved;

  lastRoomHostPing = null;
  lastIsHostUI = null;
  lastEnabledSig = "";
  lastRoomInfoText = "";
  lastPickedSig = "";
  lastSlotSig = "";
  lastMemberSig = "";
  eventsBootstrapped = false;
}

function showRoom(){
  $lobbyUI.classList.add("hidden");
  $roomUI.classList.remove("hidden");
}

function openJoinOverlay(){
  $joinOverlay.classList.remove("hidden");
  $joinRoomInput.value = "";
  $joinInfo.textContent = "—";
  setTimeout(()=> $joinRoomInput.focus(), 50);
}

function closeJoinOverlay(){
  $joinOverlay.classList.add("hidden");
}

async function copyText(t){
  try{
    await navigator.clipboard.writeText(t);
    return true;
  }catch(e){
    return false;
  }
}

function detachRoom(){
  if (unsubRoom) unsubRoom();
  if (unsubEvents) unsubEvents();
  if (unsubMembers) unsubMembers();
  unsubRoom = null;
  unsubEvents = null;
  unsubMembers = null;

  if (hostPingTimer) clearInterval(hostPingTimer);
  if (hostWatchTimer) clearInterval(hostWatchTimer);
  if (memberBeatTimer) clearInterval(memberBeatTimer);
  hostPingTimer = null;
  hostWatchTimer = null;
  memberBeatTimer = null;

  handledEventIds.clear();
  mainSpinAnimating = false;
  isSpinningMain = false;
  eventsBootstrapped = false;
  lastMemberSig = "";
}

async function ensureAuth(){
  if (uid) return uid;
  await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  if (!auth.currentUser) await auth.signInAnonymously();
  uid = auth.currentUser.uid;
  return uid;
}

function roomEvents(){
  return db.collection("rooms").doc(roomId).collection("events");
}
function roomMembers(){
  return db.collection("rooms").doc(roomId).collection("members");
}

async function upsertMember(){
  if (!roomId || !uid) return;
  const nick = getNick();
  await roomMembers().doc(uid).set({
    uid,
    nick,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge:true }).catch(()=>{});
}

async function deleteMember(){
  if (!roomId || !uid) return;
  await roomMembers().doc(uid).delete().catch(()=>{});
}

function applyHostUI(host){
  $spinMainBtn.style.display = host ? "" : "none";
  $leaveRoomBtn.textContent = host ? "방 닫기" : "나가기";
  MAIN_RULES.forEach((r)=>{
    const cb = ruleCheckboxMap.get(r);
    if (cb) cb.disabled = !host;
  });
  slotRegistry.forEach((slot)=>{
    if (slot?.btnEl) slot.btnEl.style.display = host ? "" : "none";
  });
}

function attachRoomListeners(){
  detachRoom();
  eventsBootstrapped = false;

  unsubRoom = roomRef.onSnapshot((docSnap)=>{
    if (!docSnap.exists){
      toast("방이 사라졌습니다.");
      detachRoom();
      showLobby();
      return;
    }

    const data = docSnap.data() || {};
    if (data.closed){
      toast(data.closedMsg || "방이 사라졌습니다.");
      detachRoom();
      showLobby();
      return;
    }

    const nextIsHost = (data.hostUid === uid);
    if (lastIsHostUI === null || nextIsHost !== lastIsHostUI){
      isHost = nextIsHost;
      lastIsHostUI = nextIsHost;
      applyHostUI(isHost);
    } else {
      isHost = nextIsHost;
    }

    const enabled = Array.isArray(data.enabledRules) ? data.enabledRules : [...MAIN_RULES];
    const enabledSig = enabled.join("|");
    if (enabledSig !== lastEnabledSig){
      lastEnabledSig = enabledSig;
      enabledRulesSet = new Set(enabled);
      syncRuleCheckboxesFromRoom(enabledRulesSet);
    }

    lastRoomHostPing = data.hostPing || null;

    if (!isHost){
      if (hostWatchTimer) clearInterval(hostWatchTimer);
      hostWatchTimer = setInterval(()=>{
        const latest = tsToMs(lastRoomHostPing);
        if (latest && (nowMs() - latest) > HOST_TIMEOUT_MS){
          toast("방이 사라졌습니다.");
          leaveRoom({ close:false, silent:true });
        }
      }, 3000);
    } else {
      if (hostWatchTimer) { clearInterval(hostWatchTimer); hostWatchTimer = null; }
    }

    const state = data.state || {};
    const picked = state.pickedRule || null;
    const slotValues = state.slotValues || {};
    const slotSig = Object.keys(slotValues).sort().map(k => `${k}:${slotValues[k]}`).join("|");
    const pickedSig = picked ? String(picked) : "";

    if (!mainSpinAnimating){
      if (picked && pickedSig !== lastPickedSig){
        lastPickedSig = pickedSig;
        currentRuleName = picked;
        $pickedRule.textContent = picked;
        buildRuleUI(picked);
        lastSlotSig = "";
        if (slotSig) {
          applySlotValues(slotValues);
          lastSlotSig = slotSig;
        } else {
          lastSlotSig = "";
        }
      } else if (!picked && lastPickedSig){
        lastPickedSig = "";
        currentRuleName = null;
        $pickedRule.textContent = "룰을 뽑아주세요";
        $desc.textContent = "아래 '룰 뽑기' 버튼을 눌러 시작하세요.";
        clearExtra();
        lastSlotSig = "";
      } else if (picked && currentRuleName === picked && slotSig !== lastSlotSig){
        applySlotValues(slotValues);
        lastSlotSig = slotSig;
      }
    }

    const infoText = `방 코드: ${roomId}`;
    if (infoText !== lastRoomInfoText){
      lastRoomInfoText = infoText;
      $roomInfo.textContent = infoText;
    }
  });

  unsubEvents = roomEvents()
    .orderBy("createdAt", "asc")
    .limit(300)
    .onSnapshot((snap)=>{
      if (!eventsBootstrapped){
        snap.forEach(d => handledEventIds.add(d.id));
        eventsBootstrapped = true;
        return;
      }
      snap.docChanges().forEach((ch)=>{
        if (ch.type !== "added") return;
        const id = ch.doc.id;
        if (handledEventIds.has(id)) return;
        handledEventIds.add(id);
        handleEvent(ch.doc.data());
      });
    });

  unsubMembers = roomMembers()
    .orderBy("joinedAt", "asc")
    .limit(50)
    .onSnapshot((snap)=>{
      const now = nowMs();
      const list = [];
      snap.forEach((d)=>{
        const m = d.data() || {};
        const msRaw = tsToMs(m.lastSeen);
        const ms = msRaw || now;
        if ((now - ms) <= MEMBER_ALIVE_MS){
          list.push(m);
        }
      });

      const sig = list.map(m => `${m.uid}:${(m.nick||"익명")}`).join("|");
      if (sig === lastMemberSig) return;
      lastMemberSig = sig;

      $memberCount.textContent = `${list.length}명`;
      $memberList.innerHTML = "";
      list.forEach((m)=>{
        const li = document.createElement("li");
        li.textContent = m.nick || "익명";
        $memberList.appendChild(li);
      });
    });

  if (hostPingTimer) clearInterval(hostPingTimer);
  hostPingTimer = setInterval(async ()=>{
    if (!roomRef) return;
    if (!isHost) return;
    await roomRef.set({
      hostPing: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true }).catch(()=>{});
  }, HOST_PING_MS);

  if (memberBeatTimer) clearInterval(memberBeatTimer);
  memberBeatTimer = setInterval(async ()=>{
    if (!roomId || !uid) return;
    await roomMembers().doc(uid).set({
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      nick: getNick()
    }, { merge:true }).catch(()=>{});
  }, MEMBER_BEAT_MS);
}

async function emitEvent(payload){
  payload.actorUid = uid;
  payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  await roomEvents().add(payload);
}

async function handleEvent(ev){
  if (!ev || !ev.type) return;

  if (ev.type === "mainSpin"){
    await playMainSpinEvent(ev);
    return;
  }

  if (ev.type === "slotSpin"){
    await playSlotSpinEvent(ev);
    return;
  }

  if (ev.type === "batchSpin"){
    await playBatchSpinEvent(ev);
    return;
  }
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

function colors(){ return ["빨강","파랑","보라","노랑"]; }

function registerGroup(groupId, values, notify, setValueAt){
  groupNotifyRegistry.set(groupId, { values, notify, setValueAt });
}

function createSlotRouletteGroup({
  groupId,
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

  function setValueAt(i, picked){
    values[i] = picked;
    notify();
  }

  labels.forEach((label, i) => {
    const slotId = `${groupId}:${i}`;

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

    if (!isHost) btn.style.display = "none";

    btn.onclick = async () => {
      if (!isHost) return;

      const pool = poolForSlot(i);
      if (!pool.length){
        val.textContent = "후보 부족";
        return;
      }

      const plan = makeSpinPlan(pool);

      await emitEvent({
        type: "slotSpin",
        slotId,
        pool,
        startIdx: plan.startIdx,
        steps: plan.steps,
        durationMs: SPIN_MS,
        picked: plan.picked
      });

      setTimeout(()=>{
        if (!roomRef) return;
        roomRef.update({
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          [`state.slotValues.${slotId}`]: plan.picked
        }).catch(()=>{});
      }, SPIN_MS + 140);
    };

    top.appendChild(lab);
    top.appendChild(btn);
    slot.appendChild(top);
    slot.appendChild(val);

    grid.appendChild(slot);

    slotRegistry.set(slotId, {
      setValue: async (picked, spinParams) => {
        val.classList.add("spinning");
        if (spinParams && spinParams.pool){
          await spinBySteps(spinParams.pool, {
            startIdx: spinParams.startIdx,
            steps: spinParams.steps,
            durationMs: spinParams.durationMs ?? SPIN_MS,
            onTick: (t)=> { val.textContent = t; }
          });
        }
        val.textContent = picked ?? "—";
        val.classList.remove("spinning");
        setValueAt(i, picked);
      },
      valEl: val,
      btnEl: btn
    });
  });

  body.appendChild(grid);
  registerGroup(groupId, values, notify, setValueAt);

  return { card, values };
}

function applySlotValues(slotValues){
  if (!slotValues) return;
  Object.keys(slotValues).forEach((slotId)=>{
    const picked = slotValues[slotId];
    const slot = slotRegistry.get(slotId);
    if (slot){
      slot.valEl.textContent = picked;
      const parts = String(slotId).split(":");
      if (parts.length === 2){
        const gid = parts[0];
        const idx = Number(parts[1]);
        const g = groupNotifyRegistry.get(gid);
        if (g && !Number.isNaN(idx)){
          g.values[idx] = picked;
          g.notify();
        }
      }
    }
  });
}

function renderRuleList(){
  $ruleList.innerHTML = "";
  ruleCheckboxMap.clear();

  mainLis = MAIN_RULES.map((r) => {
    const li = document.createElement("li");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;

    const span = document.createElement("span");
    span.textContent = r;

    li.appendChild(cb);
    li.appendChild(span);

    $ruleList.appendChild(li);

    ruleCheckboxMap.set(r, cb);

    cb.addEventListener("change", async ()=>{
      if (!roomRef) return;
      if (!isHost){
        cb.checked = enabledRulesSet.has(r);
        return;
      }

      const next = new Set(enabledRulesSet);
      if (cb.checked) next.add(r); else next.delete(r);
      enabledRulesSet = next;

      await roomRef.set({
        enabledRules: Array.from(enabledRulesSet),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true }).catch(()=>{});
    });

    return li;
  });

  $ruleCount.textContent = String(MAIN_RULES.length);
}

function syncRuleCheckboxesFromRoom(set){
  MAIN_RULES.forEach((r)=>{
    const cb = ruleCheckboxMap.get(r);
    if (!cb) return;
    const should = set.has(r);
    if (cb.checked !== should) cb.checked = should;
    cb.disabled = !isHost;
  });
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

function enabledMainPool(){
  return MAIN_RULES.filter(r => enabledRulesSet.has(r));
}

async function spinMainRule(){
  if (!isHost) return;
  if (isSpinningMain || mainSpinAnimating) return;

  const pool = enabledMainPool();
  if (!pool.length){
    $desc.textContent = "체크된 룰이 없습니다. 최소 1개 이상 체크하세요.";
    return;
  }

  isSpinningMain = true;

  const plan = makeSpinPlan(pool);

  await emitEvent({
    type: "mainSpin",
    pool,
    startIdx: plan.startIdx,
    steps: plan.steps,
    durationMs: SPIN_MS,
    pickedRule: plan.picked
  });

  setTimeout(()=>{
    if (!roomRef) return;
    roomRef.update({
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      "state.pickedRule": plan.picked,
      "state.slotValues": {}
    }).catch(()=>{});
  }, SPIN_MS + 160);

  isSpinningMain = false;
}

const RULES = {
  "원딜전": { desc: "항법은 자유, 갈수있는 상위는 무조건 1개로 제한", build: ()=>{} },

  "4인강제전": {
    desc: "상위로 갈 유닛 1개를 정하고, 모두가 그 유닛을 반드시 가야함",
    build: () => {
      const g = createSlotRouletteGroup({
        groupId: "r_4in_high1",
        title: "상위 유닛 1개 뽑기",
        sub: "상위에서 1개",
        labels: ["상위 유닛"],
        items: filteredHighUnitsFor("4인강제전"),
        uniqueWithinGroup: false
      });
      $extraArea.appendChild(g.card);
    }
  },

  "꼭가야할상위": {
    desc: "팀1/팀2가 각각 상위 유닛 2마리씩 뽑고 반드시 가야함 (팀 내부 중복 금지)",
    build: () => {
      const items = filteredHighUnitsFor("꼭가야할상위");
      const team = (name, id) => {
        const g = createSlotRouletteGroup({
          groupId: `r_must_${id}`,
          title: `${name} 상위 유닛 2개`,
          sub: "팀 내부 중복 금지",
          labels: ["1번","2번"],
          items,
          uniqueWithinGroup: true
        });
        $extraArea.appendChild(g.card);
      };
      team("팀1","t1");
      team("팀2","t2");
    }
  },

  "녜횡제조기전": {
    desc: "팀마다 글자 2개(중복 없이)를 뽑고, 그 글자가 들어간 상위 유닛만 갈 수 있음",
    build: () => {
      const makeTeam = (name, id) => {
        const { card, values } = createSlotRouletteGroup({
          groupId: `r_letter_${id}`,
          title: `${name} 글자 2개`,
          sub: "글자 2개가 들어간 상위만 가능",
          labels: ["글자1","글자2"],
          items: LETTER_POOL,
          uniqueWithinGroup: true,
          onGroupChange: (vals) => renderAllowed(vals)
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
          allowedBox.textContent = allowed.length ? allowed.join(", ") : "해당 글자를 포함한 유닛이 없음";
        }

        renderAllowed(values);

        card.appendChild(note);
        card.appendChild(allowedBox);
        $extraArea.appendChild(card);
      };

      makeTeam("팀1","t1");
      makeTeam("팀2","t2");
    }
  },

  "인생의고도전 5+1~10+추가1~10": {
    desc: "각 개인(빨강/파랑/보라/노랑)이 5~15 숫자를 뽑고, 스토리5 보상 제일 늦은 1명만 1~10을 한번 더 뽑음",
    build: () => {
      const nums1 = rangeInt(5, 15);

      const stage1 = createSlotRouletteGroup({
        groupId: "r_life_stage1",
        title: "1차: 5~15 (4명)",
        sub: "각 색상별 1개씩",
        labels: colors(),
        items: nums1,
        uniqueWithinGroup: false,
        onGroupChange: (vals) => updateStage2(vals)
      });
      $extraArea.appendChild(stage1.card);

      const { card: stage2Card } = makeCard("2차: 1~10 (제일 늦은 1명만)", "");
      const stage2Wrap = document.createElement("div");
      stage2Card.appendChild(stage2Wrap);

      function updateStage2(vals){
        if (vals.some(v => v == null)) {
          stage2Wrap.innerHTML = "<div class='note'>—</div>";
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
        const stage2 = createSlotRouletteGroup({
          groupId: "r_life_stage2",
          title: "추가 룰렛(1명)",
          sub: ``,
          labels: [target],
          items: rangeInt(1, 10),
          uniqueWithinGroup: false
        });

        stage2Wrap.appendChild(stage2.card);
      }

      stage2Wrap.innerHTML = "<div class='note'>—</div>";
      $extraArea.appendChild(stage2Card);
    }
  },

  "지츠다이스": {
    desc: "상위 4개(중복 없이) 뽑고, 4명이 1~100(중복 없이)을 뽑아 높은 사람부터 상위를 하나씩 가져감",
    build: () => {
      const stage1 = createSlotRouletteGroup({
        groupId: "r_jitsu_stage1",
        title: "1단계: 상위 4개 뽑기",
        sub: "중복 없이 4개",
        labels: ["상위1","상위2","상위3","상위4"],
        items: filteredHighUnitsFor("지츠다이스"),
        uniqueWithinGroup: true,
        onGroupChange: (vals) => updateStage2(vals)
      });
      $extraArea.appendChild(stage1.card);

      const { card: stage2Card } = makeCard("2단계: 1~100 뽑기(중복 없음)", "높은 사람부터 상위를 하나씩 선택");
      const stage2Wrap = document.createElement("div");
      stage2Card.appendChild(stage2Wrap);

      function updateStage2(vals){
        if (vals.some(v => v == null)) {
          stage2Wrap.innerHTML = "<div class='note'>—</div>";
          return;
        }

        stage2Wrap.innerHTML = "";
        const note = document.createElement("div");
        note.className = "note";
        note.style.whiteSpace = "pre-line";
        note.textContent = "—";
        stage2Wrap.appendChild(note);

        const orderGroup = createSlotRouletteGroup({
          groupId: "r_jitsu_stage2",
          title: "4명 숫자 뽑기",
          sub: "1~100 중복 없이",
          labels: colors(),
          items: rangeInt(1, 100),
          uniqueWithinGroup: true,
          onGroupChange: (nums) => {
            if (nums.some(v=>v==null)) { note.textContent = "—"; return; }
            const arr = colors().map((c,i)=>({ color:c, n:Number(nums[i]) }));
            arr.sort((a,b)=> b.n - a.n);
            note.textContent = `픽 순서: ${arr.map(x=>`${x.color}(${x.n})`).join(" > ")}\n상위 4개: ${vals.join(", ")}`;
          }
        });

        stage2Wrap.appendChild(orderGroup.card);
      }

      stage2Wrap.innerHTML = "<div class='note'>—</div>";
      $extraArea.appendChild(stage2Card);
    }
  },

  "상위고정 1~4": {
    desc: "빨강/파랑/보라/노랑이 각각 1~4를 뽑고, 상위 유닛을 그 숫자에 맞게 무조건 가야함",
    build: () => {
      const g = createSlotRouletteGroup({
        groupId: "r_fix_1_4",
        title: "1~4 뽑기 (4명)",
        sub: "각 칸 따로 돌리기",
        labels: colors(),
        items: ["1","2","3","4"],
        uniqueWithinGroup: false
      });
      $extraArea.appendChild(g.card);
    }
  },

  "강제상위": {
    desc: "각각 빨강/파랑/보라/노랑이 룰렛으로 상위 유닛 1개를 뽑아서 반드시 그 상위를 가야함",
    build: () => {
      const g = createSlotRouletteGroup({
        groupId: "r_force_high",
        title: "강제상위: 상위 유닛 1개씩 (4명)",
        sub: "각 칸 따로 돌리기 / 중복 허용",
        labels: colors(),
        items: filteredHighUnitsFor("강제상위"),
        uniqueWithinGroup: false
      });
      $extraArea.appendChild(g.card);
    }
  },

  "노불노초": { desc: "불멸, 초월 금지", build: ()=>{} },

  "강제전설+히든(4전설, 4히든)": {
    desc: "팀1/팀2가 각각 전설 4개 + 히든 4개를 (팀 내부 중복 없이) 뽑고 반드시 가야함",
    build: () => {
      const makeTeam = (team, id) => {
        const leg = createSlotRouletteGroup({
          groupId: `r_leg_${id}`,
          title: `${team} 전설 4개`,
          sub: "전설 내부 중복 금지",
          labels: ["전설1","전설2","전설3","전설4"],
          items: LEGEND_UNITS,
          uniqueWithinGroup: true
        });
        $extraArea.appendChild(leg.card);

        const hid = createSlotRouletteGroup({
          groupId: `r_hid_${id}`,
          title: `${team} 히든 4개`,
          sub: "히든 내부 중복 금지",
          labels: ["히든1","히든2","히든3","히든4"],
          items: HIDDEN_UNITS,
          uniqueWithinGroup: true
        });
        $extraArea.appendChild(hid.card);
      };

      makeTeam("팀1","t1");
      makeTeam("팀2","t2");
    }
  },

  "중도 10~30": {
    desc: "빨강/파랑/보라/노랑이 각각 10~30 숫자를 뽑고, 그만큼 중급도박을 해야함",
    build: () => {
      const g = createSlotRouletteGroup({
        groupId: "r_mid_10_30",
        title: "10~30 뽑기 (4명)",
        sub: "각 칸 따로 돌리기",
        labels: colors(),
        items: rangeInt(10, 30),
        uniqueWithinGroup: false
      });
      $extraArea.appendChild(g.card);
    }
  },

  "랜덤항법": { desc: "랜덤한 항법 선택(노란색)", build: ()=>{} },
  "신비한이세계전": { desc: "반드시 이세계 상위 유닛을 1개 가야함", build: ()=>{} },

  "신세계보상치기": {
    desc: "신세계 보상으로 받은 전설로 무조건 상위 유닛 가기(상위가 없는 캐릭은 안가도됨)",
    build: ()=>{}
  },

  "강제해적선": {
    desc: "빨강/파랑/보라/노랑이 해적선을 1개씩 뽑아 반드시 가기",
    build: () => {
      const g = createSlotRouletteGroup({
        groupId: "r_corsair",
        title: "해적선 1개씩",
        sub: "각 칸 따로 돌리기",
        labels: colors(),
        items: CORSAIR,
        uniqueWithinGroup: false
      });
      $extraArea.appendChild(g.card);
    }
  },

  "책임완수": {
    desc: "종/문(해군대장)/해왕류/룸바영혼을 4명에게 중복 없이 1개씩 배정. (버튼 1번)",
    build: () => {
      const tasks = ["종", "문(해군대장)", "해왕류", "룸바영혼"];
      const groupId = "r_duty";

      const { card, body } = makeCard("책임완수 배정", "버튼 1번으로 4명에게 중복 없이 배정");
      const btnRow = document.createElement("div");
      btnRow.className = "btnRow";

      const btn = document.createElement("button");
      btn.className = "btnSub";
      btn.textContent = "한번에 돌리기";
      if (!isHost) btn.style.display = "none";

      btn.onclick = async () => {
        if (!isHost) return;

        const poolLeft = tasks.slice();
        const slots = colors().map((c, i)=>{
          const p = poolLeft.slice();
          const plan = makeSpinPlan(p);
          const picked = plan.picked;
          const idx = poolLeft.indexOf(picked);
          if (idx >= 0) poolLeft.splice(idx, 1);

          const slotId = `${groupId}:${i}`;
          return {
            slotId,
            pool: p,
            startIdx: plan.startIdx,
            steps: plan.steps,
            durationMs: SPIN_MS,
            picked
          };
        });

        await emitEvent({ type: "batchSpin", slots });

        setTimeout(()=>{
          if (!roomRef) return;
          const updates = {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          slots.forEach(s => {
            updates[`state.slotValues.${s.slotId}`] = s.picked;
          });
          roomRef.update(updates).catch(()=>{});
        }, SPIN_MS + 160);
      };

      btnRow.appendChild(btn);
      card.appendChild(btnRow);

      const grid = document.createElement("div");
      grid.className = "slotGrid";

      colors().forEach((c, i)=>{
        const slotId = `${groupId}:${i}`;

        const slot = document.createElement("div");
        slot.className = "slot";

        const top = document.createElement("div");
        top.className = "slotTop";

        const lab = document.createElement("div");
        lab.className = "slotLabel";
        lab.textContent = c;

        top.appendChild(lab);

        const val = document.createElement("div");
        val.className = "slotValue";
        val.textContent = "—";

        slot.appendChild(top);
        slot.appendChild(val);
        grid.appendChild(slot);

        slotRegistry.set(slotId, {
          setValue: async (picked, spinParams) => {
            val.classList.add("spinning");
            await spinBySteps(spinParams.pool, {
              startIdx: spinParams.startIdx,
              steps: spinParams.steps,
              durationMs: spinParams.durationMs ?? SPIN_MS,
              onTick: (t)=> { val.textContent = t; }
            });
            val.textContent = picked ?? "—";
            val.classList.remove("spinning");
          },
          valEl: val,
          btnEl: null
        });
      });

      body.appendChild(grid);
      $extraArea.appendChild(card);
    }
  },

  "전설위습먹기": {
    desc: "바질 호킨스, 타츠마키, 요츠바를 이용해 위습 도박하기 최대 위습 등급에 따라\n전설 유카 + 0\n희귀 유카 + 15\n특별함 이하 유카 + 30",
    build: ()=>{}
  },

  "향로개척": {
    desc: "자신의 퀘스트(미션)을 다 깨는게 목표. 1개를 못깰때 마다 유카 + 10",
    build: ()=>{}
  },

  "스토리보상랜덤": {
    desc: "스토리 10을 파괴한 후 나오는 위습으로 목박/초월위습/레적선 중 1개씩 배정",
    build: ()=> {
      const g = createSlotRouletteGroup({
        groupId: "r_story_reward",
        title: "스토리 보상 배정",
        sub: "각 칸 따로 돌리기",
        labels: colors(),
        items: ["목박", "초월위습", "레적선"],
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

function buildRuleUI(rule){
  clearExtra();
  const def = RULES[rule] ?? defaultRule(rule);
  $desc.textContent = def.desc;
  def.build();
  if (lastIsHostUI !== null) applyHostUI(lastIsHostUI);
}

async function playMainSpinEvent(ev){
  const pool = ev.pool || [];
  if (!pool.length) return;

  mainSpinAnimating = true;

  $pickedRule.classList.add("spinning");
  clearExtra();
  $desc.textContent = "룰 뽑는 중...";
  $extraArea.innerHTML = "";

  await spinBySteps(pool, {
    startIdx: ev.startIdx ?? 0,
    steps: ev.steps ?? Math.max(20, pool.length * 3),
    durationMs: ev.durationMs ?? SPIN_MS,
    onTick: (t) => {
      $pickedRule.textContent = t;
      const activeIdx = MAIN_RULES.indexOf(t);
      if (activeIdx >= 0) setActiveRule(activeIdx);
    }
  });

  $pickedRule.classList.remove("spinning");

  const picked = ev.pickedRule || $pickedRule.textContent;
  currentRuleName = picked;
  lastPickedSig = picked ? String(picked) : "";

  buildRuleUI(picked);

  mainSpinAnimating = false;
}

async function playSlotSpinEvent(ev){
  const slotId = ev.slotId;
  const slot = slotRegistry.get(slotId);
  if (!slot) return;

  await slot.setValue(ev.picked, {
    pool: ev.pool || [],
    startIdx: ev.startIdx ?? 0,
    steps: ev.steps ?? 40,
    durationMs: ev.durationMs ?? SPIN_MS
  });

  const parts = String(slotId).split(":");
  if (parts.length === 2){
    const gid = parts[0];
    const idx = Number(parts[1]);
    const g = groupNotifyRegistry.get(gid);
    if (g && !Number.isNaN(idx)){
      g.values[idx] = ev.picked;
      g.notify();
    }
  }
}

async function playBatchSpinEvent(ev){
  const slots = ev.slots || [];
  await Promise.all(slots.map(async (s)=>{
    const slot = slotRegistry.get(s.slotId);
    if (!slot) return;
    await slot.setValue(s.picked, {
      pool: s.pool,
      startIdx: s.startIdx,
      steps: s.steps,
      durationMs: s.durationMs ?? SPIN_MS
    });
  }));
}

async function createRoom(){
  await ensureAuth();
  saveNick();

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  async function gen(){
    let code = "";
    for (let i=0; i<6; i++) code += alphabet[Math.floor(Math.random()*alphabet.length)];
    return code;
  }

  for (let attempt=0; attempt<8; attempt++){
    const code = await gen();
    const ref = db.collection("rooms").doc(code);
    const snap = await ref.get();
    if (snap.exists) continue;

    await ref.set({
      hostUid: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      closed: false,
      closedMsg: "",
      hostPing: firebase.firestore.FieldValue.serverTimestamp(),
      enabledRules: [...MAIN_RULES],
      state: { pickedRule: null, slotValues: {} }
    });

    await enterRoom(code);
    return;
  }

  $lobbyInfo.textContent = "방 생성 실패. 다시 시도해주세요.";
}

async function enterRoom(code){
  await ensureAuth();
  saveNick();

  const ref = db.collection("rooms").doc(code.toUpperCase().trim());
  const snap = await ref.get();
  if (!snap.exists){
    $joinInfo.textContent = "해당 방이 없습니다.";
    return;
  }
  const data = snap.data();
  if (data.closed){
    $joinInfo.textContent = "이미 종료된 방입니다.";
    return;
  }

  roomId = ref.id;
  roomRef = ref;

  showRoom();
  closeJoinOverlay();

  attachRoomListeners();
  await upsertMember();
}

async function leaveRoom({ close = false, silent = false } = {}){
  if (!roomId){
    showLobby();
    return;
  }

  try{
    if (close && isHost && roomRef){
      await roomRef.set({
        closed: true,
        closedMsg: "방이 사라졌습니다.",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });

      await roomRef.delete().catch(()=>{});
    }
  }catch(e){}

  await deleteMember().catch(()=>{});

  detachRoom();
  if (!silent) toast("나왔습니다.");
  showLobby();
}

async function init(){
  await ensureAuth();

  const res = await fetch("./data.json");
  DATA = await res.json();

  MAIN_RULES = DATA.mainRules ?? [];
  HIGH_UNITS = DATA.highUnits ?? [];
  LEGEND_UNITS = DATA.legendUnits ?? [];
  HIDDEN_UNITS = DATA.hiddenUnits ?? [];
  LETTER_POOL = DATA.letterPool ?? [];
  CORSAIR = DATA.corsair ?? [];

  enabledRulesSet = new Set(MAIN_RULES);

  renderRuleList();
  syncRuleCheckboxesFromRoom(enabledRulesSet);

  $toggleRulesBtn.addEventListener("click", toggleRuleList);
  $spinMainBtn.addEventListener("click", spinMainRule);

  $createRoomBtn.addEventListener("click", createRoom);
  $openJoinBtn.addEventListener("click", openJoinOverlay);

  $closeJoinBtn.addEventListener("click", closeJoinOverlay);

  $joinOverlay.addEventListener("click", (e)=>{
    if (e.target === $joinOverlay) closeJoinOverlay();
  });

  window.addEventListener("keydown", (e)=>{
    if (e.key === "Escape") closeJoinOverlay();
  });

  $joinRoomBtn.addEventListener("click", async ()=>{
    const code = $joinRoomInput.value.trim().toUpperCase();
    if (!code){
      $joinInfo.textContent = "방 코드를 입력하세요.";
      return;
    }
    $joinInfo.textContent = "입장 중...";
    await enterRoom(code);
  });

  $copyRoomCodeBtn.addEventListener("click", async ()=>{
    if (!roomId) return;
    const ok = await copyText(roomId);
    if (ok) toast("복사 완료");
    else toast("복사 실패(브라우저 권한 확인)");
  });

  $leaveRoomBtn.addEventListener("click", async ()=>{
    if (!roomId) return;
    await leaveRoom({ close: isHost });
  });

  $nickInput.addEventListener("input", ()=>{
    saveNick();
    if (roomId && uid){
      roomMembers().doc(uid).set({
        nick: getNick(),
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true }).catch(()=>{});
    }
  });

  showLobby();
}

init();
