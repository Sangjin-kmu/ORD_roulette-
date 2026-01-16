const firebaseConfig = {
  apiKey: "AIzaSyCxRFYGtDtGik3qD_yDj5bioqHp4xSrFTQ",
  authDomain: "ord-roulette.firebaseapp.com",
  projectId: "ord-roulette",
  storageBucket: "ord-roulette.firebasestorage.app",
  messagingSenderId: "655941963892",
  appId: "1:655941963892:web:5bc64118e72f2efa20c121",
  measurementId: "G-XHXY3Q88T5"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

const $backToMainBtn = document.getElementById("backToMainBtn");
const $clearNickInput = document.getElementById("clearNickInput");
const $clearPhotoDrop = document.getElementById("clearPhotoDrop");
const $clearPhotoInput = document.getElementById("clearPhotoInput");
const $clearPhotoPreview = document.getElementById("clearPhotoPreview");
const $clearContent = document.getElementById("clearContent");
const $clearCount = document.getElementById("clearCount");
const $saveClearBtn = document.getElementById("saveClearBtn");
const $clearResetBtn = document.getElementById("clearResetBtn");
const $clearInfo = document.getElementById("clearInfo");
const $myClearList = document.getElementById("myClearList");
const $allClearList = document.getElementById("allClearList");
const $toastRoot = document.getElementById("toastRoot");

let uid = "";
let photoData = "";
let unsubAll = null;

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
  const raw = ($clearNickInput.value || "").trim();
  if (raw) return raw.slice(0,16);
  const saved = (localStorage.getItem("ord_nick") || "").trim();
  return saved ? saved.slice(0,16) : "익명";
}
function saveNick(){
  const raw = ($clearNickInput.value || "").trim();
  localStorage.setItem("ord_nick", raw ? raw.slice(0,16) : "");
}

async function ensureAuth(){
  if (uid) return uid;
  await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  if (!auth.currentUser) await auth.signInAnonymously();
  uid = auth.currentUser.uid;
  return uid;
}

function approxBytesFromDataUrl(dataUrl){
  const idx = dataUrl.indexOf(",");
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  return Math.floor(b64.length * 3 / 4);
}

function resetForm(){
  photoData = "";
  $clearPhotoPreview.style.display = "none";
  $clearPhotoPreview.removeAttribute("src");
  $clearPhotoInput.value = "";
  $clearContent.value = "";
  $clearCount.textContent = "0";
  $clearInfo.textContent = "—";
}

function loadImageFromFile(file){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{ URL.revokeObjectURL(url); resolve(img); };
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error("image load fail")); };
    img.src = url;
  });
}

async function compressToDataUrl(file, maxSide = 720, quality = 0.72){
  const img = await loadImageFromFile(file);
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

async function setPhotoFromFile(file){
  try{
    const dataUrl = await compressToDataUrl(file);
    const bytes = approxBytesFromDataUrl(dataUrl);
    if (bytes > 650 * 1024){
      toast("사진이 너무 큽니다. 더 작은 이미지로 시도하세요.");
      return;
    }
    photoData = dataUrl;
    $clearPhotoPreview.src = dataUrl;
    $clearPhotoPreview.style.display = "";
  }catch(e){
    toast("사진 처리 실패");
  }
}

function getClipboardImageFile(e){
  const dt = e.clipboardData;
  if (!dt || !dt.items) return null;
  for (const it of dt.items){
    if (it.kind === "file" && it.type && it.type.startsWith("image/")) return it.getAsFile();
  }
  return null;
}

function renderList(rootEl, list, showDelete){
  if (!rootEl) return;
  if (!list.length){
    rootEl.textContent = "기록이 없습니다.";
    return;
  }
  rootEl.innerHTML = "";
  list.forEach((x)=>{
    const wrap = document.createElement("div");
    wrap.style.border = "1px solid rgba(255,255,255,0.12)";
    wrap.style.borderRadius = "12px";
    wrap.style.background = "rgba(255,255,255,0.06)";
    wrap.style.padding = "10px 12px";
    wrap.style.marginTop = "10px";

    const top = document.createElement("div");
    top.style.display = "flex";
    top.style.alignItems = "center";
    top.style.justifyContent = "space-between";
    top.style.gap = "10px";

    const left = document.createElement("div");
    left.style.fontWeight = "900";
    left.textContent = (x.nick || "익명").slice(0,16);

    const right = document.createElement("div");
    right.style.fontSize = "12px";
    right.style.opacity = "0.75";
    right.textContent = x.when || "";

    top.appendChild(left);
    top.appendChild(right);

    const body = document.createElement("div");
    body.style.marginTop = "8px";
    body.style.whiteSpace = "pre-line";
    body.style.wordBreak = "break-word";
    body.textContent = (x.content || "").slice(0,2000);

    wrap.appendChild(top);

    if (x.photoData){
      const img = document.createElement("img");
      img.src = x.photoData;
      img.alt = "photo";
      img.style.width = "100%";
      img.style.maxHeight = "320px";
      img.style.objectFit = "contain";
      img.style.borderRadius = "12px";
      img.style.border = "1px solid rgba(255,255,255,0.12)";
      img.style.background = "rgba(0,0,0,0.18)";
      img.style.marginTop = "10px";
      wrap.appendChild(img);
    }

    wrap.appendChild(body);

    if (showDelete){
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "flex-end";
      row.style.marginTop = "10px";

      const delBtn = document.createElement("button");
      delBtn.className = "btnSub";
      delBtn.type = "button";
      delBtn.textContent = "삭제";
      delBtn.onclick = async ()=>{
        if (!confirm("삭제할까요?")) return;
        try{
          await x.ref.delete();
          toast("삭제 완료");
        }catch(e){
          toast("삭제 실패");
        }
      };
      row.appendChild(delBtn);
      wrap.appendChild(row);
    }

    rootEl.appendChild(wrap);
  });
}

function attachLists(){
  if (unsubAll) unsubAll();
  $myClearList.textContent = "로딩 중…";
  $allClearList.textContent = "로딩 중…";

  unsubAll = db.collection("clearRecords").orderBy("createdAt", "desc").limit(100).onSnapshot((snap)=>{
    const all = [];
    snap.forEach((doc)=>{
      const d = doc.data({ serverTimestamps: "estimate" }) || {};
      const ms = tsToMs(d.createdAt) || nowMs();
      const when = new Date(ms);
      const yy = when.getFullYear();
      const mm = String(when.getMonth()+1).padStart(2,"0");
      const dd = String(when.getDate()).padStart(2,"0");
      const hh = String(when.getHours()).padStart(2,"0");
      const mi = String(when.getMinutes()).padStart(2,"0");
      all.push({
        ref: doc.ref,
        uid: d.uid || "",
        nick: d.nick || "익명",
        content: d.content || "",
        photoData: d.photoData || "",
        when: yy + "." + mm + "." + dd + " " + hh + ":" + mi
      });
    });
    const mine = all.filter(x => x.uid === uid);
    renderList($myClearList, mine, true);
    renderList($allClearList, all, false);
  }, ()=>{
    $myClearList.textContent = "불러오기 실패";
    $allClearList.textContent = "불러오기 실패";
  });
}

async function saveClearRecord(){
  await ensureAuth();
  saveNick();

  const nick = getNick();
  const content = ($clearContent.value || "").trim();

  if (!content){
    toast("내용을 입력하세요.");
    return;
  }

  $saveClearBtn.disabled = true;
  $clearInfo.textContent = "저장 중...";

  try{
    await db.collection("clearRecords").add({
      uid: uid,
      nick: nick,
      content: content.slice(0,2000),
      photoData: photoData || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast("저장 완료");
    resetForm();
  }catch(e){
    const msg = (e && e.code) ? e.code : "error";
    $clearInfo.textContent = "저장 실패: " + msg;
    toast("저장 실패");
  }finally{
    $saveClearBtn.disabled = false;
  }
}

async function init(){
  try{
    await ensureAuth();
  }catch(e){
    const msg = (e && e.code) ? e.code : "error";
    $clearInfo.textContent = "인증 실패: " + msg;
    return;
  }

  $clearNickInput.value = (localStorage.getItem("ord_nick") || "").slice(0,16);

  $backToMainBtn.addEventListener("click", ()=>{
    location.href = "./index.html";
  });

  $clearContent.addEventListener("input", ()=>{
    $clearCount.textContent = String($clearContent.value.length);
  });

  $clearResetBtn.addEventListener("click", resetForm);
  $saveClearBtn.addEventListener("click", saveClearRecord);

  $clearPhotoDrop.addEventListener("click", ()=> $clearPhotoInput.click());
  $clearPhotoInput.addEventListener("change", ()=>{
    const f = $clearPhotoInput.files && $clearPhotoInput.files[0];
    if (f) setPhotoFromFile(f);
  });

  document.addEventListener("paste", (e)=>{
    const f = getClipboardImageFile(e);
    if (!f) return;
    e.preventDefault();
    setPhotoFromFile(f);
  });

  attachLists();
}

init();
