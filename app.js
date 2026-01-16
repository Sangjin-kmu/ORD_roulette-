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
const $openClearsBtn = document.getElementById("openClearsBtn");
const $lobbyInfo = document.getElementById("lobbyInfo");

const $joinOverlay = document.getElementById("joinOverlay");
const $joinRoomInput = document.getElementById("joinRoomInput");
const $joinRoomBtn = document.getElementById("joinRoomBtn");
const $closeJoinBtn = document.getElementById("closeJoinBtn");
const $joinInfo = document.getElementById("joinInfo");

const $roomInfo = document.getElementById("roomInfo");
const $copyRoomCodeBtn = document.getElementById("copyRoomCodeBtn");
const $openClearsBtnRoom = document.getElementById("openClearsBtnRoom");
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
let unsubHostPresence = null;

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

let ruleCheckboxMap = new Map();

let leavingGuard = false;

let lastSentNick = "";

const SPIN_MS = 1500;
const MIN_DELAY = 18;
const MAX_DELAY = 180;

const BANNED_HIGH_UNITS = new Set([
  "우타",
  "몽키 D. 루피(니카)",
  "마르코"
]);

let enabledHighSet = new Set();
let enabledLegendSet = new Set();
let enabledHiddenSet = new Set();

let draftHighSet = null;
let draftLegendSet = null;
let draftHiddenSet = null;

let unitOverlay = null;
let unitOverlayApplyBtn = null;

let unitHighListBox = null;
let unitLegendListBox = null;
let unitHiddenListBox = null;

let unitAllHighBtn = null;
let unitAllLegendBtn = null;
let unitAllHiddenBtn = null;

let unitCbHighMap = new Map();
let unitCbLegendMap = new Map();
let unitCbHiddenMap = new Map();

let unitOverlayOpen = false;

let lastHostSeenMs = 0;

let prevRoomHostUid = "";
let prevEnabledRulesKey = "";
let prevUnitKey = "";
let prevPickedRule = "__INIT__";
let prevSlotKey = "__INIT__";
let prevRoomInfoText = "";
let prevIsHost = null;

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

function goClearsPage(){
  const back = roomId ? String(roomId) : "";
  sessionStorage.setItem("ord_back_room", back);
  location.href = "./clears.html";
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
  return delays.map(d => Math.max(10, d * scale));
}

async function spinBySteps(items, { startIdx, steps, durationMs = SPIN_MS, minDelay = MIN_DELAY, maxDelay = MAX_DELAY, onTick }){
  if (!items || items.length === 0) return null;

  const len = items.length;
  const totalTicks = Math.max(12, Math.min(140, steps));
  const delays = makeScaledDelays(totalTicks, durationMs, minDelay, maxDelay);

  let idx = startIdx % len;
  for (let i=0; i<totalTicks; i++){
    idx = (idx + 1) % len;
    onTick?.(items[idx], idx);
    await sleep(delays[i]);
  }
  return items[idx];
}

function randInt(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
  closeUnitOverlay();

  roomId = null;
  roomRef = null;
  isHost = false;
  currentRuleName = null;

  $pickedRule.classList.remove("spinning");
  $pickedRule.textContent = "룰을 뽑아주세요";
  $desc.textContent = "아래 '룰 뽑기' 버튼을 눌러 시작하세요.";
  clearExtra();

  const saved = localStorage.getItem("ord_nick") || "";
  $nickInput.value = saved;

  leavingGuard = false;

  prevRoomHostUid = "";
  prevEnabledRulesKey = "";
  prevUnitKey = "";
  prevPickedRule = "__INIT__";
  prevSlotKey = "__INIT__";
  prevRoomInfoText = "";
  prevIsHost = null;

  lastSentNick = "";
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
  if (unsubHostPresence) unsubHostPresence();

  unsubRoom = null;
  unsubEvents = null;
  unsubMembers = null;
  unsubHostPresence = null;

  if (hostWatchTimer) clearInterval(hostWatchTimer);
  hostWatchTimer = null;

  if (memberBeatTimer) clearTimeout(memberBeatTimer);
  memberBeatTimer = null;

  handledEventIds.clear();
  mainSpinAnimating = false;
  isSpinningMain = false;

  prevRoomHostUid = "";
  prevEnabledRulesKey = "";
  prevUnitKey = "";
  prevPickedRule = "__INIT__";
  prevSlotKey = "__INIT__";
  prevRoomInfoText = "";
  prevIsHost = null;

  lastSentNick = "";
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
  lastSentNick = nick;
  await roomMembers().doc(uid).set({
    uid,
    nick,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastSeen: firebase.firestore.Timestamp.now()
  }, { merge:true }).catch(()=>{});
}

async function deleteMember(){
  if (!roomId || !uid) return;
  await roomMembers().doc(uid).delete().catch(()=>{});
}

function stableArrKey(arr){
  if (!Array.isArray(arr)) return "";
  return arr.join("\u0001");
}

function stableSetKey(set){
  return [...set].sort().join("\u0001");
}

function stableSlotKey(obj){
  if (!obj || typeof obj !== "object") return "";
  const keys = Object.keys(obj).sort();
  let out = "";
  for (const k of keys){
    out += k + "=" + String(obj[k]) + "\u0001";
  }
  return out;
}

function unitKeyFromData(uf){
  const h = Array.isArray(uf?.high) ? uf.high : HIGH_UNITS;
  const l = Array.isArray(uf?.legend) ? uf.legend : LEGEND_UNITS;
  const hd = Array.isArray(uf?.hidden) ? uf.hidden : HIDDEN_UNITS;
  const a = h.slice().sort().join("\u0001");
  const b = l.slice().sort().join("\u0001");
  const c = hd.slice().sort().join("\u0001");
  return a + "#" + b + "#" + c;
}

function applyHostUI(host){
  $spinMainBtn.style.display = host ? "" : "none";
  $leaveRoomBtn.textContent = host ? "방 닫기" : "나가기";

  MAIN_RULES.forEach((r)=>{
    const cb = ruleCheckboxMap.get(r);
    if (cb) cb.disabled = !host;
  });

  const dis = !host;

  unitCbHighMap.forEach(cb => cb.disabled = dis);
  unitCbLegendMap.forEach(cb => cb.disabled = dis);
  unitCbHiddenMap.forEach(cb => cb.disabled = dis);

  if (unitAllHighBtn) unitAllHighBtn.disabled = dis;
  if (unitAllLegendBtn) unitAllLegendBtn.disabled = dis;
  if (unitAllHiddenBtn) unitAllHiddenBtn.disabled = dis;

  if (unitOverlayApplyBtn) unitOverlayApplyBtn.disabled = dis || !unitOverlayOpen;
}

function startHostWatch(){
  if (hostWatchTimer) clearInterval(hostWatchTimer);
  hostWatchTimer = setInterval(async ()=>{
    if (!roomId || !roomRef) return;
    if (isHost) return;
    if (!lastHostSeenMs) return;
    if ((nowMs() - lastHostSeenMs) > 30000){
      toast("방이 사라졌습니다.");
      await leaveRoom({ close:false, silent:true });
    }
  }, 1500);
}

function scheduleMemberBeat(){
  if (memberBeatTimer) clearTimeout(memberBeatTimer);
  if (!roomId || !uid) return;

  const delay = 16000 + Math.floor(Math.random() * 6000);
  memberBeatTimer = setTimeout(async ()=>{
    if (!roomId || !uid) return;

    const nick = getNick();
    const payload = { lastSeen: firebase.firestore.Timestamp.now() };
    if (nick !== lastSentNick){
      payload.nick = nick;
      lastSentNick = nick;
    }

    await roomMembers().doc(uid).set(payload, { merge:true }).catch(()=>{});
    scheduleMemberBeat();
  }, delay);
}

function applyUnitFilterFromRoomData(data){
  const uf = data && data.unitFilter ? data.unitFilter : null;

  const nextHigh = new Set(Array.isArray(uf?.high) ? uf.high : HIGH_UNITS);
  const nextLegend = new Set(Array.isArray(uf?.legend) ? uf.legend : LEGEND_UNITS);
  const nextHidden = new Set(Array.isArray(uf?.hidden) ? uf.hidden : HIDDEN_UNITS);

  enabledHighSet = nextHigh;
  enabledLegendSet = nextLegend;
  enabledHiddenSet = nextHidden;
}

function syncUnitCheckboxesFromEnabled(){
  unitCbHighMap.forEach((cb, name)=> cb.checked = enabledHighSet.has(name));
  unitCbLegendMap.forEach((cb, name)=> cb.checked = enabledLegendSet.has(name));
  unitCbHiddenMap.forEach((cb, name)=> cb.checked = enabledHiddenSet.has(name));
}

function syncUnitCheckboxesFromDraft(){
  if (!draftHighSet || !draftLegendSet || !draftHiddenSet) return;
  unitCbHighMap.forEach((cb, name)=> cb.checked = draftHighSet.has(name));
  unitCbLegendMap.forEach((cb, name)=> cb.checked = draftLegendSet.has(name));
  unitCbHiddenMap.forEach((cb, name)=> cb.checked = draftHiddenSet.has(name));
}

async function saveUnitFilterToRoom(){
  if (!roomRef || !isHost) return;
  await roomRef.set({
    unitFilter: {
      high: Array.from(enabledHighSet),
      legend: Array.from(enabledLegendSet),
      hidden: Array.from(enabledHiddenSet)
    }
  }, { merge:true }).catch(()=>{});
}

function getHighPool(ruleName){
  const base = HIGH_UNITS.filter(u => enabledHighSet.has(u));
  const needBan = new Set(["원딜전","4인강제전","꼭가야할상위","강제상위","지츠다이스"]);
  if (!needBan.has(ruleName)) return base;
  return base.filter(u => !BANNED_HIGH_UNITS.has(u));
}

function getLegendPool(){
  return LEGEND_UNITS.filter(u => enabledLegendSet.has(u));
}

function getHiddenPool(){
  return HIDDEN_UNITS.filter(u => enabledHiddenSet.has(u));
}

function attachRoomListeners(){
  detachRoom();

  unsubRoom = roomRef.onSnapshot(async (doc)=>{
    if (!doc.exists){
      toast("방이 사라졌습니다.");
      detachRoom();
      showLobby();
      return;
    }

    const data = doc.data() || {};
    if (data.closed){
      toast(data.closedMsg || "방이 사라졌습니다.");
      detachRoom();
      showLobby();
      return;
    }

    const hostUid = data.hostUid || "";
    const nextIsHost = (hostUid === uid);

    if (prevIsHost === null || nextIsHost !== prevIsHost){
      isHost = nextIsHost;
      applyHostUI(isHost);
      prevIsHost = nextIsHost;
    }

    const enabledArr = Array.isArray(data.enabledRules) ? data.enabledRules : [...MAIN_RULES];
    const enabledKey = stableArrKey(enabledArr);
    if (enabledKey !== prevEnabledRulesKey){
      enabledRulesSet = new Set(enabledArr);
      syncRuleCheckboxesFromRoom(enabledRulesSet);
      prevEnabledRulesKey = enabledKey;
    }

    if (hostUid && hostUid !== prevRoomHostUid){
      prevRoomHostUid = hostUid;
      if (unsubHostPresence) unsubHostPresence();
      unsubHostPresence = roomMembers().doc(hostUid).onSnapshot((mDoc)=>{
        if (!mDoc.exists){
          lastHostSeenMs = 0;
          return;
        }
        const m = mDoc.data({ serverTimestamps: "estimate" }) || {};
        const ms = tsToMs(m.lastSeen) || tsToMs(m.joinedAt);
        if (ms) lastHostSeenMs = ms;
      });
      startHostWatch();
    }

    const uKey = unitKeyFromData(data.unitFilter);
    if (uKey !== prevUnitKey){
      applyUnitFilterFromRoomData(data);
      if (unitOverlayOpen){
        if (!draftHighSet || !draftLegendSet || !draftHiddenSet){
          draftHighSet = new Set(enabledHighSet);
          draftLegendSet = new Set(enabledLegendSet);
          draftHiddenSet = new Set(enabledHiddenSet);
        }
        syncUnitCheckboxesFromDraft();
      }else{
        syncUnitCheckboxesFromEnabled();
      }
      prevUnitKey = uKey;

      if (!mainSpinAnimating && currentRuleName){
        buildRuleUI(currentRuleName);
      }
    }

    const state = data.state || {};
    const picked = state.pickedRule || "";
    const slotKey = stableSlotKey(state.slotValues || {});

    if (!mainSpinAnimating){
      if (!picked){
        if (prevPickedRule !== ""){
          currentRuleName = null;
          $pickedRule.classList.remove("spinning");
          $pickedRule.textContent = "룰을 뽑아주세요";
          $desc.textContent = "아래 '룰 뽑기' 버튼을 눌러 시작하세요.";
          clearExtra();
          prevPickedRule = "";
          prevSlotKey = "";
        }
      } else {
        if (picked !== prevPickedRule){
          currentRuleName = picked;
          $pickedRule.textContent = picked;
          buildRuleUI(picked);
          applySlotValues(state.slotValues || {});
          prevPickedRule = picked;
          prevSlotKey = slotKey;
        } else {
          if (slotKey !== prevSlotKey){
            applySlotValues(state.slotValues || {});
            prevSlotKey = slotKey;
          }
        }
      }
    }

    const infoText = `방 코드: ${roomId}`;
    if (infoText !== prevRoomInfoText){
      $roomInfo.textContent = infoText;
      prevRoomInfoText = infoText;
    }
  });

  unsubEvents = roomEvents()
    .orderBy("createdAt", "asc")
    .limit(300)
    .onSnapshot((snap)=>{
      snap.docChanges().forEach((ch)=>{
        if (ch.type !== "added") return;
        const id = ch.doc.id;
        if (handledEventIds.has(id)) return;
        handledEventIds.add(id);
        handleEvent(ch.doc.data());
      });
    });

  let lastMembersKey = "";
  let lastMembersCount = -1;

  unsubMembers = roomMembers()
    .orderBy("joinedAt", "asc")
    .limit(50)
    .onSnapshot((snap)=>{
      const now = nowMs();
      const list = [];

      snap.forEach((d)=>{
        const m = d.data({ serverTimestamps: "estimate" }) || {};
        const ms = tsToMs(m.lastSeen) || tsToMs(m.joinedAt) || now;
        if ((now - ms) <= 35000){
          list.push({ uid: m.uid, nick: m.nick || "익명", joinedAt: m.joinedAt });
        }
      });

      list.sort((a,b)=>{
        const aj = tsToMs(a.joinedAt);
        const bj = tsToMs(b.joinedAt);
        if (aj !== bj) return aj - bj;
        return String(a.uid).localeCompare(String(b.uid));
      });

      const key = list.map(m => `${m.uid}|${m.nick}`).join(",");
      if (key === lastMembersKey && list.length === lastMembersCount) return;
      lastMembersKey = key;
      lastMembersCount = list.length;

      const nextCount = `${list.length}명`;
      if ($memberCount.textContent !== nextCount) $memberCount.textContent = nextCount;

      const frag = document.createDocumentFragment();
      list.forEach((m)=>{
        const li = document.createElement("li");
        li.textContent = m.nick;
        frag.appendChild(li);
      });

      $memberList.replaceChildren(frag);
    });

  scheduleMemberBeat();
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
        roomRef.set({
          state: { slotValues: { [slotId]: plan.picked } }
        }, { merge:true }).catch(()=>{});
      }, SPIN_MS + 120);
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
      if (slot.valEl.textContent !== String(picked)) slot.valEl.textContent = picked;
      const [g, idxStr] = slotId.split(":");
      const gi = groupNotifyRegistry.get(g);
      if (gi){
        const i = Number(idxStr);
        if (!Number.isNaN(i)){
          if (gi.values[i] !== picked){
            gi.values[i] = picked;
            gi.notify();
          }
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
        enabledRules: Array.from(enabledRulesSet)
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
    const next = set.has(r);
    if (cb.checked !== next) cb.checked = next;
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
    roomRef.set({
      state: { pickedRule: plan.picked, slotValues: {} }
    }, { merge:true }).catch(()=>{});
  }, SPIN_MS + 140);

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
        items: getHighPool("4인강제전"),
        uniqueWithinGroup: false
      });
      $extraArea.appendChild(g.card);
    }
  },

  "꼭가야할상위": {
    desc: "팀1/팀2가 각각 상위 유닛 2마리씩 뽑고 반드시 가야함 (팀 내부 중복 금지)",
    build: () => {
      const items = getHighPool("꼭가야할상위");
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
          const pool = getHighPool("녜횡제조기전");
          const allowed = pool.filter(u => letters.some(ch => String(u).includes(ch)));
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
        items: getHighPool("지츠다이스"),
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
        const orderGroup = createSlotRouletteGroup({
          groupId: "r_jitsu_stage2",
          title: "4명 숫자 뽑기",
          sub: "1~100 중복 없이",
          labels: colors(),
          items: rangeInt(1, 100),
          uniqueWithinGroup: true,
          onGroupChange: (nums) => {
            if (nums.some(v=>v==null)) return;
            const arr = colors().map((c,i)=>({ color:c, n:Number(nums[i]) }));
            arr.sort((a,b)=> b.n - a.n);
            const note = document.createElement("div");
            note.className = "note";
            note.textContent = `픽 순서: ${arr.map(x=>`${x.color}(${x.n})`).join(" > ")} / 상위 4개: ${vals.join(", ")}`;
            stage2Wrap.appendChild(note);
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
        items: getHighPool("강제상위"),
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
          items: getLegendPool(),
          uniqueWithinGroup: true
        });
        $extraArea.appendChild(leg.card);

        const hid = createSlotRouletteGroup({
          groupId: `r_hid_${id}`,
          title: `${team} 히든 4개`,
          sub: "히든 내부 중복 금지",
          labels: ["히든1","히든2","히든3","히든4"],
          items: getHiddenPool(),
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

  "신세계보상치기": { desc: "신세계 보상으로 받은 전설로 무조건 상위 유닛 가기(상위가 없는 캐릭은 안가도됨)", build: ()=>{} },

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

        const pool = tasks.slice();
        const slots = colors().map((c, i)=>{
          const p = pool.slice();
          const plan = makeSpinPlan(p);
          const picked = plan.picked;
          pool.splice(pool.indexOf(picked), 1);
          const slotId = `${groupId}:${i}`;
          return { slotId, pool: p, startIdx: plan.startIdx, steps: plan.steps, durationMs: SPIN_MS, picked };
        });

        await emitEvent({ type: "batchSpin", slots });

        setTimeout(()=>{
          if (!roomRef) return;
          const slotMap = {};
          slots.forEach(s => slotMap[s.slotId] = s.picked);
          roomRef.set({ state: { slotValues: slotMap } }, { merge:true }).catch(()=>{});
        }, SPIN_MS + 140);
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

  "전설위습먹기": { desc: "바질 호킨스를 이용해 위습 도박하기 최대 위습 등급에 따라\n전설 유카 + 0\n희귀 유카 + 15\n특별함 이하 유카 + 30", build: ()=>{} },
  "향로개척": { desc: "자신의 퀘스트(미션)을 다 깨는게 목표. 1개를 못깰때 마다 유카 + 10", build: ()=>{} },

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
  if ($desc.textContent !== def.desc) $desc.textContent = def.desc;
  def.build();
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
      if (g.values[idx] !== ev.picked){
        g.values[idx] = ev.picked;
        g.notify();
      }
    }
  }
}

async function playBatchSpinEvent(ev){
  const slots = ev.slots || [];
  const runs = slots.map(async (s)=>{
    const slot = slotRegistry.get(s.slotId);
    if (!slot) return;
    await slot.setValue(s.picked, {
      pool: s.pool,
      startIdx: s.startIdx,
      steps: s.steps,
      durationMs: s.durationMs ?? SPIN_MS
    });
  });
  await Promise.all(runs);
}

function ensureUnitOverlay(){
  if (unitOverlay) return;

  unitOverlay = document.createElement("div");
  unitOverlay.id = "unitOverlay";
  unitOverlay.className = "overlay hidden";

  const card = document.createElement("div");
  card.className = "overlayCard";

  const title = document.createElement("div");
  title.className = "overlayTitle";
  title.textContent = "유닛 포함 설정";

  const sub = document.createElement("div");
  sub.className = "overlaySub";
  sub.textContent = "체크된 유닛만 룰렛 후보에 포함됩니다.";

  const box = document.createElement("div");
  box.style.maxHeight = "55vh";
  box.style.overflow = "auto";
  box.style.marginTop = "12px";
  box.style.textAlign = "left";

  const mkSection = (name) => {
    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.style.marginTop = "10px";

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.justifyContent = "space-between";
    head.style.gap = "10px";

    const h = document.createElement("div");
    h.className = "cardTitle";
    h.textContent = name;

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "8px";

    const allBtn = document.createElement("button");
    allBtn.className = "btnSub";
    allBtn.textContent = "전체";

    right.appendChild(allBtn);
    head.appendChild(h);
    head.appendChild(right);

    const list = document.createElement("div");
    list.style.display = "grid";
    list.style.gridTemplateColumns = "1fr";
    list.style.gap = "6px";
    list.style.marginTop = "10px";

    wrap.appendChild(head);
    wrap.appendChild(list);

    return { wrap, list, allBtn };
  };

  const s1 = mkSection("상위 유닛");
  const s2 = mkSection("전설");
  const s3 = mkSection("히든");

  unitHighListBox = s1.list;
  unitLegendListBox = s2.list;
  unitHiddenListBox = s3.list;

  unitAllHighBtn = s1.allBtn;
  unitAllLegendBtn = s2.allBtn;
  unitAllHiddenBtn = s3.allBtn;

  unitAllHighBtn.onclick = () => {
    if (!isHost || !unitOverlayOpen) return;
    draftHighSet = new Set(HIGH_UNITS);
    syncUnitCheckboxesFromDraft();
  };

  unitAllLegendBtn.onclick = () => {
    if (!isHost || !unitOverlayOpen) return;
    draftLegendSet = new Set(LEGEND_UNITS);
    syncUnitCheckboxesFromDraft();
  };

  unitAllHiddenBtn.onclick = () => {
    if (!isHost || !unitOverlayOpen) return;
    draftHiddenSet = new Set(HIDDEN_UNITS);
    syncUnitCheckboxesFromDraft();
  };

  box.appendChild(s1.wrap);
  box.appendChild(s2.wrap);
  box.appendChild(s3.wrap);

  const bottomRow = document.createElement("div");
  bottomRow.className = "btnRow";
  bottomRow.style.marginTop = "12px";
  bottomRow.style.justifyContent = "space-between";

  const leftSpacer = document.createElement("div");

  const rightBtns = document.createElement("div");
  rightBtns.style.display = "flex";
  rightBtns.style.gap = "8px";

  unitOverlayApplyBtn = document.createElement("button");
  unitOverlayApplyBtn.className = "btnSub";
  unitOverlayApplyBtn.textContent = "적용";

  const closeBtn = document.createElement("button");
  closeBtn.className = "btnSub";
  closeBtn.textContent = "닫기";

  rightBtns.appendChild(unitOverlayApplyBtn);
  rightBtns.appendChild(closeBtn);

  bottomRow.appendChild(leftSpacer);
  bottomRow.appendChild(rightBtns);

  unitOverlayApplyBtn.onclick = async () => {
    if (!isHost || !unitOverlayOpen) return;
    if (!draftHighSet || !draftLegendSet || !draftHiddenSet) return;

    enabledHighSet = new Set(draftHighSet);
    enabledLegendSet = new Set(draftLegendSet);
    enabledHiddenSet = new Set(draftHiddenSet);

    syncUnitCheckboxesFromEnabled();

    if (roomRef) await saveUnitFilterToRoom();

    if (!mainSpinAnimating && currentRuleName){
      buildRuleUI(currentRuleName);
    }

    toast("적용 완료");
    closeUnitOverlay();
  };

  closeBtn.onclick = () => {
    closeUnitOverlay();
  };

  card.appendChild(title);
  card.appendChild(sub);
  card.appendChild(box);
  card.appendChild(bottomRow);

  unitOverlay.appendChild(card);
  document.body.appendChild(unitOverlay);

  unitOverlay.addEventListener("click", (e)=>{
    if (e.target === unitOverlay) closeUnitOverlay();
  });
}

function renderUnitOverlayLists(){
  ensureUnitOverlay();

  unitCbHighMap.clear();
  unitCbLegendMap.clear();
  unitCbHiddenMap.clear();

  unitHighListBox.innerHTML = "";
  unitLegendListBox.innerHTML = "";
  unitHiddenListBox.innerHTML = "";

  const mkRow = (name, cbMap, draftSetRef) => {
    const row = document.createElement("label");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.cursor = "pointer";
    row.style.userSelect = "none";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = draftSetRef.has(name);
    cb.disabled = !isHost;

    const sp = document.createElement("span");
    sp.textContent = name;
    sp.style.opacity = "0.92";

    row.appendChild(cb);
    row.appendChild(sp);

    cb.addEventListener("change", ()=>{
      if (!isHost || !unitOverlayOpen){
        cb.checked = draftSetRef.has(name);
        return;
      }
      if (cb.checked) draftSetRef.add(name);
      else draftSetRef.delete(name);
    });

    cbMap.set(name, cb);
    return row;
  };

  const frag1 = document.createDocumentFragment();
  HIGH_UNITS.forEach(name => frag1.appendChild(mkRow(name, unitCbHighMap, draftHighSet)));
  unitHighListBox.appendChild(frag1);

  const frag2 = document.createDocumentFragment();
  LEGEND_UNITS.forEach(name => frag2.appendChild(mkRow(name, unitCbLegendMap, draftLegendSet)));
  unitLegendListBox.appendChild(frag2);

  const frag3 = document.createDocumentFragment();
  HIDDEN_UNITS.forEach(name => frag3.appendChild(mkRow(name, unitCbHiddenMap, draftHiddenSet)));
  unitHiddenListBox.appendChild(frag3);

  applyHostUI(isHost);
}

function openUnitOverlay(){
  ensureUnitOverlay();

  unitOverlayOpen = true;

  draftHighSet = new Set(enabledHighSet);
  draftLegendSet = new Set(enabledLegendSet);
  draftHiddenSet = new Set(enabledHiddenSet);

  renderUnitOverlayLists();
  syncUnitCheckboxesFromDraft();

  unitOverlay.classList.remove("hidden");
  applyHostUI(isHost);
}

function closeUnitOverlay(){
  if (!unitOverlay) return;
  unitOverlay.classList.add("hidden");

  unitOverlayOpen = false;

  draftHighSet = null;
  draftLegendSet = null;
  draftHiddenSet = null;

  applyHostUI(isHost);
}

function ensureUnitButton(){
  let btn = document.getElementById("openUnitFilterBtn");

  if (!btn){
    const mainBox = document.querySelector(".mainBox");
    if (!mainBox) return;
    btn = document.createElement("button");
    btn.id = "openUnitFilterBtn";
    btn.className = "btnSub";
    btn.textContent = "유닛 포함 설정";
    mainBox.appendChild(btn);
  }

  btn.addEventListener("click", openUnitOverlay);
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
      closed: false,
      closedMsg: "",
      enabledRules: [...MAIN_RULES],
      unitFilter: {
        high: Array.from(enabledHighSet),
        legend: Array.from(enabledLegendSet),
        hidden: Array.from(enabledHiddenSet)
      },
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
  const data = snap.data() || {};
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
  if (leavingGuard) return;
  leavingGuard = true;

  if (!roomId){
    showLobby();
    leavingGuard = false;
    return;
  }

  try{
    if (close && isHost && roomRef){
      await roomRef.set({
        closed: true,
        closedMsg: "방이 사라졌습니다."
      }, { merge:true });

      await roomRef.delete().catch(()=>{});
    }
  }catch(e){}

  await deleteMember().catch(()=>{});

  detachRoom();
  if (!silent) toast("나왔습니다.");
  showLobby();

  leavingGuard = false;
}

function setDefaultUnitSets(){
  enabledHighSet = new Set(HIGH_UNITS);
  enabledLegendSet = new Set(LEGEND_UNITS);
  enabledHiddenSet = new Set(HIDDEN_UNITS);
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

  setDefaultUnitSets();
  ensureUnitButton();

  renderRuleList();
  syncRuleCheckboxesFromRoom(enabledRulesSet);

  $toggleRulesBtn.addEventListener("click", toggleRuleList);
  $spinMainBtn.addEventListener("click", spinMainRule);

  $createRoomBtn.addEventListener("click", createRoom);
  $openJoinBtn.addEventListener("click", openJoinOverlay);

  if ($openClearsBtn) $openClearsBtn.addEventListener("click", goClearsPage);
  if ($openClearsBtnRoom) $openClearsBtnRoom.addEventListener("click", goClearsPage);

  $closeJoinBtn.addEventListener("click", closeJoinOverlay);

  $joinOverlay.addEventListener("click", (e)=>{
    if (e.target === $joinOverlay) closeJoinOverlay();
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
  });
  const backRoom = sessionStorage.getItem("ord_back_room") || "";
  sessionStorage.removeItem("ord_back_room");
  if (backRoom){
    await enterRoom(backRoom);
    return;
  }

  showLobby();
}

init();
