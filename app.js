/* NutriSnap AI — app logic (vanilla JS, no build step) */
"use strict";

/* ---------------- state ---------------- */
const LS_KEY = "nutrisnap.v1";
const MEALS = ["breakfast", "lunch", "dinner", "snacks"];
const MEAL_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };
const GOALS = {
  lose:    { label: "Lose fat",        icon: "🔥", desc: "calorie deficit",   delta: -500, proteinPerKg: 2.2, fatPerKg: 0.8 },
  maintain:{ label: "Maintain",        icon: "⚖️", desc: "stay as you are",   delta: 0,    proteinPerKg: 1.8, fatPerKg: 0.9 },
  muscle:  { label: "Gain muscle",     icon: "💪", desc: "lean bulk",         delta: 300,  proteinPerKg: 2.0, fatPerKg: 0.9 },
  gain:    { label: "Gain weight",     icon: "📈", desc: "bigger surplus",    delta: 500,  proteinPerKg: 1.8, fatPerKg: 1.0 },
};
const ACTIVITY = {
  sedentary: { label: "Sedentary (desk job)", mult: 1.2 },
  light:     { label: "Light (1–3 workouts/wk)", mult: 1.375 },
  moderate:  { label: "Moderate (3–5 workouts/wk)", mult: 1.55 },
  active:    { label: "Active (6–7 workouts/wk)", mult: 1.725 },
  athlete:   { label: "Athlete (2×/day)", mult: 1.9 },
};

let state = loadState();
let viewDate = new Date();
let currentPage = "today";

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupted */ }
  return { profile: null, diary: {}, weights: [] };
}
function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function dayEntry(key) {
  if (!state.diary[key]) state.diary[key] = { meals: { breakfast: [], lunch: [], dinner: [], snacks: [] }, water: 0 };
  return state.diary[key];
}

/* ---------------- dates ---------------- */
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function todayKey() { return dateKey(new Date()); }

/* ---------------- plan math ---------------- */
function computePlan(p) {
  const bmr = p.sex === "male"
    ? 10 * p.weight + 6.25 * p.height - 5 * p.age + 5
    : 10 * p.weight + 6.25 * p.height - 5 * p.age - 161;
  const tdee = Math.round(bmr * (ACTIVITY[p.activity]?.mult ?? 1.2));
  const g = GOALS[p.goal] ?? GOALS.maintain;
  let target = Math.round(tdee + g.delta);
  const floor = p.sex === "male" ? 1500 : 1200;
  if (target < floor) target = floor;
  const protein = Math.round(g.proteinPerKg * p.weight);
  const fat = Math.round(g.fatPerKg * p.weight);
  const carbs = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(bmr), tdee, target, protein, carbs, fat, goal: p.goal, goalDef: g };
}
function plan() { return state.profile ? computePlan(state.profile) : null; }

/* ---------------- helpers ---------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function rnd(x) { return Math.round(x); }
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  $("#toast-wrap").appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ---------------- nutrition sources ---------------- */
const OFF_FIELDS = "code,product_name,generic_name,brands,image_front_small_url,nutriments,serving_size,product_quantity";
function offNutrition(n) {
  if (!n) return null;
  let kcal = n["energy-kcal_100g"];
  if (kcal == null && n["energy-kj_100g"] != null) kcal = n["energy-kj_100g"] / 4.184;
  if (kcal == null) return null;
  return {
    kcal: +kcal, protein: +(n.proteins_100g || 0), carbs: +(n.carbohydrates_100g || 0), fat: +(n.fat_100g || 0),
  };
}
async function offSearch(q) {
  const url = "https://world.openfoodfacts.org/cgi/search.pl?action=process&search_terms=" +
    encodeURIComponent(q) + "&search_simple=1&json=1&page_size=12&fields=" + encodeURIComponent(OFF_FIELDS);
  const r = await fetch(url);
  if (!r.ok) throw new Error("OFF " + r.status);
  const j = await r.json();
  return (j.products || []).map(p => {
    const per100 = offNutrition(p.nutriments);
    if (!per100) return null;
    return {
      name: p.product_name || p.generic_name || "Food",
      brand: p.brands || "",
      img: p.image_front_small_url || "",
      per100, source: "off", code: p.code,
      serving: p.serving_size ? parseFloat(p.serving_size) : 0,
    };
  }).filter(Boolean).slice(0, 12);
}
async function offBarcode(code) {
  const r = await fetch("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(code) + ".json");
  if (!r.ok) throw new Error("OFF " + r.status);
  const j = await r.json();
  if (j.status !== 1) return null;
  const p = j.product;
  const per100 = offNutrition(p.nutriments);
  if (!per100) return null;
  return {
    name: p.product_name || "Product", brand: p.brands || "", img: p.image_front_small_url || "",
    per100, source: "off", code: p.code, serving: p.serving_size ? parseFloat(p.serving_size) : 0,
  };
}
async function nutritionForLabel(label) {
  const pretty = label.replace(/_/g, " ");
  try {
    const results = await Promise.race([
      offSearch(pretty),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);
    if (results.length) {
      const top = results[0];
      return { ...top, name: pretty.charAt(0).toUpperCase() + pretty.slice(1), matched: top.name };
    }
  } catch (e) { /* fall through to local estimate */ }
  const est = window.FOOD101_NUTRITION[label] || [200, 10, 20, 8];
  return {
    name: pretty.charAt(0).toUpperCase() + pretty.slice(1),
    brand: "AI estimate", img: "", source: "estimate",
    per100: { kcal: est[0], protein: est[1], carbs: est[2], fat: est[3] },
  };
}
function scalePer100(per100, grams) {
  const f = grams / 100;
  return { kcal: per100.kcal * f, protein: per100.protein * f, carbs: per100.carbs * f, fat: per100.fat * f };
}

/* ---------------- on-device AI (photo) ---------------- */
let ortSession = null;
async function ensureModel(onProgress) {
  if (ortSession) return ortSession;
  if (typeof ort === "undefined") throw new Error("ONNX runtime failed to load");
  ort.env.wasm.wasmPaths = "vendor/onnxruntime-web/";
  ort.env.wasm.numThreads = 1;
  const url = "assets/food101_mnv2_ak.onnx";
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("model download failed: " + resp.status);
  const total = +resp.headers.get("content-length") || 0;
  const buf = await readWithProgress(resp, total, onProgress);
  ortSession = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
  return ortSession;
}
async function readWithProgress(resp, total, onProgress) {
  if (!resp.body || !total) return new Uint8Array(await resp.arrayBuffer());
  const reader = resp.body.getReader();
  const chunks = []; let got = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    if (onProgress) onProgress(got / total);
  }
  const out = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out.buffer;
}
async function preprocessImage(blobUrl) {
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = blobUrl;
  });
  const w = img.naturalWidth, h = img.naturalHeight;
  const scale = 256 / Math.min(w, h); // training val transform: Resize(256) -> CenterCrop(224)
  const sw = Math.max(224, Math.round(w * scale)), sh = Math.max(224, Math.round(h * scale));
  const big = document.createElement("canvas");
  big.width = sw; big.height = sh;
  big.getContext("2d").drawImage(img, 0, 0, sw, sh);
  const crop = document.createElement("canvas");
  crop.width = 224; crop.height = 224;
  const ctx = crop.getContext("2d");
  ctx.drawImage(big, (sw - 224) / 2, (sh - 224) / 2, 224, 224, 0, 0, 224, 224);
  const data = ctx.getImageData(0, 0, 224, 224).data;
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const out = new Float32Array(3 * 224 * 224);
  for (let i = 0; i < 224 * 224; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * 224 * 224 + i] = (data[i * 4 + c] / 255 - mean[c]) / std[c];
    }
  }
  return out;
}
async function classifyPhoto(blobUrl, onProgress) {
  const session = await ensureModel(onProgress);
  const input = await preprocessImage(blobUrl);
  const tensor = new ort.Tensor("float32", input, [1, 3, 224, 224]);
  const results = await session.run({ input: tensor });
  const logits = results.output1.data;
  const max = Math.max(...logits);
  let sum = 0;
  const probs = new Float32Array(logits.length);
  for (let i = 0; i < logits.length; i++) { probs[i] = Math.exp(logits[i] - max); sum += probs[i]; }
  const top = [...probs.keys()].sort((a, b) => probs[b] - probs[a]).slice(0, 3)
    .map(i => ({ label: window.FOOD101_LABELS[i], conf: probs[i] / sum }));
  return top;
}

/* ---------------- router ---------------- */
function showPage(name) {
  currentPage = name;
  $$(".page").forEach(p => p.classList.remove("active"));
  $("#page-" + name).classList.add("active");
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === name));
  if (name === "today") renderToday();
  if (name === "stats") renderStats();
  if (name === "profile") renderProfile();
  window.scrollTo(0, 0);
}

/* ---------------- today page ---------------- */
function dayTotals(entry) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const m of MEALS) for (const it of entry.meals[m]) {
    t.kcal += it.kcal; t.protein += it.protein; t.carbs += it.carbs; t.fat += it.fat;
  }
  return t;
}
function renderToday() {
  const key = dateKey(viewDate);
  const entry = dayEntry(key);
  const p = plan();
  const t = dayTotals(entry);

  // date label
  const now = new Date();
  const diff = Math.round((parseKey(todayKey()) - viewDate) / 86400000);
  let label = viewDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  let sub = "";
  if (diff === 0) sub = "Today";
  else if (diff === 1) sub = "Yesterday";
  $("#date-label").innerHTML = esc(sub || label) + (sub ? `<small>${esc(label)}</small>` : "");
  $("#btn-next-day").disabled = diff <= 0;
  $("#btn-next-day").style.opacity = diff <= 0 ? 0.35 : 1;

  // ring
  const C = 2 * Math.PI * 54;
  const target = p ? p.target : 2000;
  const frac = Math.min(1, t.kcal / target);
  const ring = $("#ring-fg");
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - frac);
  const remaining = p ? p.target - t.kcal : 0;
  ring.style.stroke = !p ? "#a3e635" : (remaining >= 0 ? "#a3e635" : "#f87171");
  $("#ring-remaining").textContent = p ? (remaining >= 0 ? rnd(remaining) : "+" + rnd(-remaining)) : "—";
  $("#ring-remaining").style.color = p && remaining < 0 ? "var(--red)" : "var(--text)";
  $("#ring-cap").textContent = p && remaining < 0 ? "kcal over" : "kcal left";

  // hero
  $("#hero-goal").textContent = p ? `${GOALS[p.goal].icon} ${GOALS[p.goal].label}` : "—";
  $("#hero-eaten").textContent = rnd(t.kcal) + " kcal";
  $("#hero-target").textContent = p ? p.target + " kcal" : "—";
  $("#hero-tdee").textContent = p ? p.tdee + " kcal" : "—";

  // impact card
  $("#impact-text").innerHTML = impactText(p, t);

  // macros
  if (p) {
    setMacro("#macro-protein", t.protein, p.protein, "g");
    setMacro("#macro-carbs", t.carbs, p.carbs, "g");
    setMacro("#macro-fat", t.fat, p.fat, "g");
  }

  // water
  $("#water-label").textContent = `${entry.water} / 8`;
  $("#water-row").innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const d = document.createElement("div");
    d.className = "drop" + (i < entry.water ? " on" : "");
    d.addEventListener("click", () => {
      entry.water = (i < entry.water && i === entry.water - 1) ? 0 : i + 1;
      saveState(); renderToday();
    });
    $("#water-row").appendChild(d);
  }

  // meals
  const wrap = $("#meals");
  wrap.innerHTML = "";
  let runningKcal = 0;
  for (const m of MEALS) {
    const items = entry.meals[m];
    const mealKcal = items.reduce((s, it) => s + it.kcal, 0);
    const div = document.createElement("div");
    div.className = "meal";
    div.innerHTML = `
      <div class="meal-head">
        <span class="meal-name">${MEAL_LABEL[m]}</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="meal-kcal">${rnd(mealKcal)} kcal</span>
          <button class="add-mini" data-meal="${m}">+ add</button>
        </span>
      </div>
      <div class="meal-items"></div>`;
    div.querySelector(".add-mini").addEventListener("click", () => {
      showPage("add");
      openSearchPanel(m);
    });
    const list = div.querySelector(".meal-items");
    if (!items.length) {
      list.innerHTML = `<div class="empty">Nothing logged yet</div>`;
    }
    for (const it of items) {
      runningKcal += it.kcal;
      const pPct = p ? Math.round((it.protein / p.protein) * 100) : 0;
      const fits = p ? (p.target - runningKcal) >= 0 : true;
      const el = document.createElement("div");
      el.className = "food-item";
      el.innerHTML = `
        ${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
        <div class="food-info">
          <div class="food-name">${esc(it.name)}</div>
          <div class="food-sub">${rnd(it.grams)} g · P ${rnd(it.protein)}g · C ${rnd(it.carbs)}g · F ${rnd(it.fat)}g</div>
          <span class="chip prot">🥩 ${pPct}% protein goal</span>
          <span class="chip ${fits ? "ok" : "warn"}">${fits ? "✔ within goal" : "⚠ over goal"}</span>
        </div>
        <div class="food-kcal">${rnd(it.kcal)}<span class="muted" style="font-size:10px"> kcal</span></div>
        <button class="food-del" title="Delete">✕</button>`;
      el.querySelector(".food-del").addEventListener("click", () => {
        entry.meals[m] = entry.meals[m].filter(x => x.id !== it.id);
        saveState(); renderToday();
      });
      list.appendChild(el);
    }
    wrap.appendChild(div);
  }
}
function setMacro(sel, val, target, unit) {
  const el = $(sel);
  el.querySelector("b").textContent = `${rnd(val)} / ${rnd(target)} ${unit}`;
  el.querySelector(".bar i").style.width = Math.min(100, (val / target) * 100) + "%";
}
function impactText(p, t) {
  if (!p) return "Set your profile (top-right icon) to get a personalized plan.";
  const remaining = p.target - t.kcal;
  const protLeft = Math.max(0, p.protein - t.protein);
  const g = GOALS[p.goal];
  if (p.goal === "lose") {
    return remaining >= 0
      ? `✅ <b>${rnd(remaining)} kcal left</b> — on track to lose ~0.5 kg of fat per week. Protein ${rnd(t.protein)}/${p.protein} g.`
      : `⚠️ <b>${rnd(-remaining)} kcal over</b> your target. A 25-min brisk walk burns roughly that much. Protein ${rnd(t.protein)}/${p.protein} g.`;
  }
  if (p.goal === "muscle") {
    return `💪 <b>${remaining > 0 ? rnd(remaining) + " kcal to go" : "surplus reached ✔"}</b> — eat ${protLeft > 0 ? rnd(protLeft) + " g more protein" : "enough protein ✔"} today to support muscle gain (~+0.25 kg/week at this surplus).`;
  }
  if (p.goal === "gain") {
    return `📈 <b>${remaining > 0 ? rnd(remaining) + " kcal to go" : "surplus reached ✔"}</b> — this surplus supports ~0.5 kg/week of weight gain. Keep protein ≥ ${p.protein} g (now ${rnd(t.protein)} g).`;
  }
  return remaining >= 0
    ? `⚖️ <b>${rnd(remaining)} kcal left</b> — staying at maintenance. Protein ${rnd(t.protein)}/${p.protein} g.`
    : `⚖️ <b>${rnd(-remaining)} kcal over</b> maintenance today. Protein ${rnd(t.protein)}/${p.protein} g.`;
}

/* ---------------- add page ---------------- */
function renderAdd() { $("#add-panel").innerHTML = ""; }
function openSearchPanel(preselectMeal) {
  const panel = $("#add-panel");
  panel.innerHTML = `
    <div class="card">
      <div class="card-title">Search food</div>
      <input class="search-box" id="search-input" placeholder="e.g. chicken breast, cola, pizza…" autocomplete="off" />
      <div class="muted small" style="margin:8px 0 2px">…or scan a barcode:</div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <input class="search-box" id="barcode-input" placeholder="barcode (e.g. 5449000000996)" inputmode="numeric" />
        <button class="mini-btn" id="btn-barcode">Go</button>
      </div>
      <div id="search-results"></div>
    </div>`;
  const input = $("#search-input");
  let timer = null, lastQ = "";
  input.focus();
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    timer = setTimeout(() => runSearch(q), 350);
  });
  $("#btn-barcode").addEventListener("click", async () => {
    const code = $("#barcode-input").value.trim();
    if (!code) return toast("Enter a barcode");
    $("#search-results").innerHTML = `<div class="muted small">Looking up barcode…</div>`;
    try {
      const f = await offBarcode(code);
      if (!f) { $("#search-results").innerHTML = `<div class="muted small">Product not found.</div>`; return; }
      $("#search-results").innerHTML = "";
      $("#search-results").appendChild(resultEl(f, preselectMeal));
    } catch (e) { $("#search-results").innerHTML = `<div class="muted small">Lookup failed (offline?).</div>`; }
  });
  runSearch("");
  async function runSearch(q) {
    if (q === lastQ) return;
    lastQ = q;
    const box = $("#search-results");
    if (!q) { box.innerHTML = `<div class="muted small">Type to search 3M+ products, or pick a quick food above.</div>`; return; }
    // local first
    const ql = q.toLowerCase();
    const local = window.LOCAL_FOODS.filter(f => f.name.toLowerCase().includes(ql) || (f.tags || "").includes(ql)).slice(0, 5)
      .map(f => ({ name: f.name, brand: "quick add", img: "", per100: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat }, source: "local" }));
    box.innerHTML = `<div class="muted small">Searching…</div>`;
    let remote = [];
    try { remote = await offSearch(q); } catch (e) { /* offline */ }
    box.innerHTML = "";
    for (const f of local) box.appendChild(resultEl(f, preselectMeal, "local"));
    for (const f of remote) box.appendChild(resultEl(f, preselectMeal, "off"));
    if (!local.length && !remote.length) box.innerHTML = `<div class="muted small">No results. Try another word, or use Custom.</div>`;
  }
}
function resultEl(f, preselectMeal, badge) {
  const el = document.createElement("button");
  el.className = "result";
  el.innerHTML = `
    ${f.img ? `<img src="${esc(f.img)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
    <div class="food-info">
      <div class="food-name">${esc(f.name)}</div>
      <div class="food-sub">${esc(f.brand || "")} · ${rnd(f.per100.kcal)} kcal/100g · P ${rnd(f.per100.protein)} C ${rnd(f.per100.carbs)} F ${rnd(f.per100.fat)}</div>
    </div>
    <span class="src-badge ${badge === "off" ? "off" : ""}">${badge || f.source}</span>`;
  el.addEventListener("click", () => openFoodModal(f, preselectMeal));
  return el;
}
function openQuickPanel(preselectMeal) {
  const panel = $("#add-panel");
  panel.innerHTML = `<div class="card"><div class="card-title">Quick add (per 100 g)</div><div class="quick-grid" id="quick-grid"></div></div>`;
  const grid = $("#quick-grid");
  for (const f of window.LOCAL_FOODS) {
    const b = document.createElement("button");
    b.className = "quick-item";
    b.innerHTML = `<b>${esc(f.name)}</b><span>${rnd(f.kcal)} kcal · P ${rnd(f.protein)} C ${rnd(f.carbs)} F ${rnd(f.fat)}</span>`;
    b.addEventListener("click", () => openFoodModal({ name: f.name, brand: "quick add", img: "", per100: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat }, source: "local" }, preselectMeal));
    grid.appendChild(b);
  }
}
function openCustomPanel(preselectMeal) {
  const panel = $("#add-panel");
  panel.innerHTML = `
    <div class="card">
      <div class="card-title">Custom food</div>
      <form class="form" id="custom-form">
        <div class="field"><label>Name</label><input name="name" required placeholder="e.g. Mom's koshari" /></div>
        <div class="field-row">
          <div class="field"><label>Calories (kcal)</label><input name="kcal" type="number" min="0" step="1" required value="300" /></div>
          <div class="field"><label>Grams eaten</label><input name="grams" type="number" min="1" step="1" required value="200" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Protein (g)</label><input name="protein" type="number" min="0" step="0.1" value="0" /></div>
          <div class="field"><label>Carbs (g)</label><input name="carbs" type="number" min="0" step="0.1" value="0" /></div>
        </div>
        <div class="field"><label>Fat (g)</label><input name="fat" type="number" min="0" step="0.1" value="0" /></div>
        <div class="field"><label>Meal</label><div class="meal-picker" id="custom-meals"></div></div>
        <button class="submit-btn" type="submit">Add to diary</button>
      </form>
    </div>`;
  let meal = preselectMeal || "lunch";
  const mp = $("#custom-meals");
  MEALS.forEach(m => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "meal-opt" + (m === meal ? " sel" : ""); b.textContent = MEAL_LABEL[m];
    b.addEventListener("click", () => { meal = m; $$(".meal-opt", mp).forEach(x => x.classList.remove("sel")); b.classList.add("sel"); });
    mp.appendChild(b);
  });
  $("#custom-form").addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addItem({
      name: fd.get("name"), grams: +fd.get("grams"),
      kcal: +fd.get("kcal"), protein: +fd.get("protein"), carbs: +fd.get("carbs"), fat: +fd.get("fat"),
      img: "", source: "custom",
    }, meal);
    panel.innerHTML = "";
    showPage("today");
    toast("Added ✔");
  });
}

/* food modal (grams + meal + preview) */
function openFoodModal(food, preselectMeal) {
  const modal = $("#food-modal");
  const body = $("#food-modal-body");
  let grams = food.serving && food.serving > 0 ? Math.round(food.serving) : 100;
  let meal = preselectMeal || "lunch";
  body.innerHTML = `
    <div class="close-row"><button class="icon-btn" id="food-close">✕</button></div>
    <h2>${esc(food.name)}</h2>
    <div class="muted small">${esc(food.source === "off" ? (food.brand ? food.brand + " · " : "") + "Open Food Facts" : food.source === "estimate" ? "AI nutrition estimate" : (food.brand || ""))}</div>
    ${food.img ? `<img class="preview-img" src="${esc(food.img)}" alt="" style="margin-top:10px" onerror="this.remove()">` : ""}
    <div class="field" style="margin-top:12px"><label>Amount (grams)</label>
      <input type="number" id="fm-grams" min="1" step="1" value="${grams}" /></div>
    <div class="nutri-preview" id="fm-preview"></div>
    <div class="field"><label>Meal</label><div class="meal-picker" id="fm-meals"></div></div>
    <button class="submit-btn" id="fm-add">Add to diary</button>`;
  modal.classList.remove("hidden");
  $("#food-close").addEventListener("click", () => modal.classList.add("hidden"));
  const mp = $("#fm-meals");
  MEALS.forEach(m => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "meal-opt" + (m === meal ? " sel" : ""); b.textContent = MEAL_LABEL[m];
    b.addEventListener("click", () => { meal = m; $$(".meal-opt", mp).forEach(x => x.classList.remove("sel")); b.classList.add("sel"); });
    mp.appendChild(b);
  });
  const updatePreview = () => {
    grams = Math.max(1, +$("#fm-grams").value || 100);
    const n = scalePer100(food.per100, grams);
    $("#fm-preview").innerHTML = `
      <div class="nutri-cell"><b>${rnd(n.kcal)}</b><span>kcal</span></div>
      <div class="nutri-cell"><b>${rnd(n.protein)}g</b><span>protein</span></div>
      <div class="nutri-cell"><b>${rnd(n.carbs)}g</b><span>carbs</span></div>
      <div class="nutri-cell"><b>${rnd(n.fat)}g</b><span>fat</span></div>`;
  };
  $("#fm-grams").addEventListener("input", updatePreview);
  updatePreview();
  $("#fm-add").addEventListener("click", () => {
    const n = scalePer100(food.per100, grams);
    addItem({ name: food.name, grams, kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat, img: food.img || "", source: food.source }, meal);
    modal.classList.add("hidden");
    showPage("today");
    toast("Added ✔ " + rnd(n.kcal) + " kcal");
  });
}
function addItem(item, meal) {
  const entry = dayEntry(dateKey(viewDate));
  entry.meals[meal].push({ id: uid(), ...item });
  saveState();
}

/* ---------------- photo scan ---------------- */
function openScanFlow(file) {
  const modal = $("#scan-modal");
  const body = $("#scan-modal-body");
  const url = URL.createObjectURL(file);
  modal.classList.remove("hidden");
  body.innerHTML = `
    <div class="close-row"><button class="icon-btn" id="scan-close">✕</button></div>
    <h2>📸 Scan your food</h2>
    <img class="preview-img" src="${url}" alt="food photo" />
    <div id="scan-status" class="muted small" style="margin-top:10px">Loading AI model…</div>
    <div class="progress"><i id="scan-bar"></i></div>
    <div class="pred-chips hidden" id="scan-preds"></div>
    <div class="muted small hidden" id="scan-hint">Tap a guess if the first one isn't right — then we look up its calories.</div>`;
  $("#scan-close").addEventListener("click", () => { modal.classList.add("hidden"); URL.revokeObjectURL(url); });
  (async () => {
    try {
      const preds = await classifyPhoto(url, f => {
        $("#scan-status").textContent = f < 1 ? `Downloading AI model… ${Math.round(f * 100)}%` : "Analyzing photo…";
        $("#scan-bar").style.width = Math.round(f * 100) + "%";
      });
      $("#scan-status").textContent = "What's in your photo?";
      $("#scan-bar").style.width = "100%";
      const chips = $("#scan-preds");
      chips.classList.remove("hidden");
      $("#scan-hint").classList.remove("hidden");
      let selected = preds[0].label;
      preds.forEach((p, i) => {
        const pretty = p.label.replace(/_/g, " ");
        const b = document.createElement("button");
        b.className = "pred-chip" + (i === 0 ? " sel" : "");
        b.innerHTML = `${esc(pretty)}<small>${Math.round(p.conf * 100)}%</small>`;
        b.addEventListener("click", () => {
          selected = p.label;
          $$(".pred-chip", chips).forEach(x => x.classList.remove("sel"));
          b.classList.add("sel");
        });
        chips.appendChild(b);
      });
      // auto-continue with top guess after chips render
      const useLabel = async (label) => {
        $("#scan-status").textContent = "Looking up calories…";
        const food = await nutritionForLabel(label);
        food.img = url;
        modal.classList.add("hidden");
        openFoodModal(food);
      };
      chips.appendChild(Object.assign(document.createElement("button"), { className: "submit-btn", textContent: "Use top guess ✔", style: "margin-top:10px" }))
        .addEventListener("click", () => useLabel(selected));
      // also auto-use top guess after 1.2s if user doesn't pick? keep manual for correctness — provide button only.
    } catch (e) {
      console.error(e);
      $("#scan-status").textContent = "⚠️ " + e.message + " — you can still search manually.";
      $("#scan-bar").style.width = "100%";
    }
  })();
}

/* ---------------- stats page ---------------- */
function renderStats() {
  const p = plan();
  $("#plan-card").innerHTML = p ? `
    <div class="plan-grid">
      <div class="plan-cell"><span>BMR</span><b>${p.bmr} kcal</b></div>
      <div class="plan-cell"><span>TDEE (burn)</span><b>${p.tdee} kcal</b></div>
      <div class="plan-cell"><span>Daily target</span><b>${p.target} kcal</b></div>
      <div class="plan-cell"><span>Goal</span><b>${GOALS[p.goal].icon} ${esc(GOALS[p.goal].label)}</b></div>
      <div class="plan-cell"><span>Protein</span><b>${p.protein} g</b></div>
      <div class="plan-cell"><span>Carbs</span><b>${p.carbs} g</b></div>
      <div class="plan-cell"><span>Fat</span><b>${p.fat} g</b></div>
      <div class="plan-cell"><span>Expected</span><b>${p.goal === "lose" ? "−0.5 kg/wk" : p.goal === "gain" ? "+0.5 kg/wk" : p.goal === "muscle" ? "+0.25 kg/wk" : "stable"}</b></div>
    </div>` : `<div class="muted">No profile yet.</div>`;

  // week chart
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    const k = dateKey(d);
    const entry = state.diary[k];
    const kcal = entry ? dayTotals(entry).kcal : 0;
    days.push({ label: d.toLocaleDateString(undefined, { weekday: "narrow" }), kcal, key: k });
  }
  const max = Math.max(100, ...days.map(d => d.kcal), p ? p.target : 0);
  const W = 320, H = 140, pad = 18;
  const bw = (W - pad * 2) / 7;
  let bars = "";
  days.forEach((d, i) => {
    const h = (d.kcal / max) * (H - pad * 2 - 8);
    const x = pad + i * bw + bw * 0.18;
    const y = H - pad - h;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="4" fill="${d.kcal > 0 ? "#a3e635" : "#22314f"}"/>
      <text x="${(x + bw * 0.32).toFixed(1)}" y="${H - 4}" font-size="9" fill="#8fa3c7" text-anchor="middle">${d.label}</text>
      <text x="${(x + bw * 0.32).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="8.5" fill="#e8eefb" text-anchor="middle">${d.kcal ? Math.round(d.kcal) : ""}</text>`;
  });
  if (p) {
    const ty = H - pad - (p.target / max) * (H - pad * 2 - 8);
    bars += `<line x1="${pad}" y1="${ty}" x2="${W - pad}" y2="${ty}" stroke="#fb923c" stroke-width="1.4" stroke-dasharray="4 3"/>
      <text x="${W - pad}" y="${ty - 4}" font-size="8.5" fill="#fb923c" text-anchor="end">target ${p.target}</text>`;
  }
  $("#chart-week").innerHTML = `<svg viewBox="0 0 ${W} ${H}">${bars}</svg>`;

  // weight chart
  const ws = state.weights.slice(-14);
  const wc = $("#chart-weight");
  if (ws.length < 2) {
    wc.innerHTML = `<div class="muted small">Log your weight a few times and a trend line appears here.</div>`;
  } else {
    const min = Math.min(...ws.map(w => w.kg)) - 0.5, max2 = Math.max(...ws.map(w => w.kg)) + 0.5;
    const W2 = 320, H2 = 120, pad2 = 20;
    const pts = ws.map((w, i) => {
      const x = pad2 + (i / (ws.length - 1)) * (W2 - pad2 * 2);
      const y = H2 - pad2 - ((w.kg - min) / (max2 - min)) * (H2 - pad2 * 2);
      return [x, y];
    });
    const line = pts.map((pt, i) => (i ? "L" : "M") + pt[0].toFixed(1) + " " + pt[1].toFixed(1)).join(" ");
    wc.innerHTML = `<svg viewBox="0 0 ${W2} ${H2}">
      <path d="${line}" fill="none" stroke="#60a5fa" stroke-width="2.4" stroke-linecap="round"/>
      ${pts.map((pt, i) => `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="3.4" fill="#60a5fa"/><text x="${pt[0].toFixed(1)}" y="${(pt[1] - 7).toFixed(1)}" font-size="8.5" fill="#e8eefb" text-anchor="middle">${ws[i].kg}</text>`).join("")}
    </svg>`;
  }

  // weekly average
  const weekKcal = days.reduce((s, d) => s + d.kcal, 0);
  $("#weekly-avg").textContent = p
    ? `Avg ${Math.round(weekKcal / 7)} kcal/day over the last 7 days (target ${p.target}).`
    : "—";
}

/* ---------------- profile / onboarding ---------------- */
function profileFormHTML(p) {
  p = p || { name: "", sex: "male", age: 25, height: 175, weight: 70, activity: "light", goal: "muscle" };
  const goalOpts = Object.entries(GOALS).map(([k, g]) =>
    `<button type="button" class="goal-opt ${p.goal === k ? "sel" : ""}" data-goal="${k}"><b>${g.icon} ${g.label}</b><span>${g.desc}</span></button>`).join("");
  const actOpts = Object.entries(ACTIVITY).map(([k, a]) => `<option value="${k}" ${p.activity === k ? "selected" : ""}>${a.label}</option>`).join("");
  return `
    <div class="field"><label>Name</label><input name="name" value="${esc(p.name)}" placeholder="Your name" required /></div>
    <div class="field-row">
      <div class="field"><label>Sex</label><select name="sex"><option value="male" ${p.sex === "male" ? "selected" : ""}>Male</option><option value="female" ${p.sex === "female" ? "selected" : ""}>Female</option></select></div>
      <div class="field"><label>Age</label><input name="age" type="number" min="10" max="100" value="${p.age}" required /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Height (cm)</label><input name="height" type="number" min="100" max="250" value="${p.height}" required /></div>
      <div class="field"><label>Weight (kg)</label><input name="weight" type="number" min="30" max="300" step="0.1" value="${p.weight}" required /></div>
    </div>
    <div class="field"><label>Activity level</label><select name="activity">${actOpts}</select></div>
    <div class="field"><label>Your goal</label><div class="goal-picker" id="goal-picker">${goalOpts}</div></div>`;
}
function bindProfileForm(form, onDone) {
  let goal = (state.profile && state.profile.goal) || "muscle";
  $$("#goal-picker .goal-opt", form).forEach(b => b.addEventListener("click", () => {
    goal = b.dataset.goal;
    $$("#goal-picker .goal-opt", form).forEach(x => x.classList.toggle("sel", x === b));
  }));
  form.addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(form);
    state.profile = {
      name: fd.get("name"), sex: fd.get("sex"),
      age: +fd.get("age"), height: +fd.get("height"), weight: +fd.get("weight"),
      activity: fd.get("activity"), goal,
    };
    // seed today's weight
    const tk = todayKey();
    if (!state.weights.length || state.weights[state.weights.length - 1].date !== tk) {
      state.weights.push({ date: tk, kg: +fd.get("weight") });
    }
    saveState();
    onDone && onDone();
  });
}
function renderProfile() {
  const form = $("#profile-form");
  form.innerHTML = profileFormHTML(state.profile) + `<button class="submit-btn" type="submit">Save & recalculate plan</button>`;
  bindProfileForm(form, () => {
    toast("Plan updated ✔ target " + plan().target + " kcal");
    renderToday(); renderStats();
    showPage("today");
  });
}
function maybeShowOnboarding() {
  if (!state.profile) $("#onboard-modal").classList.remove("hidden");
}

/* ---------------- events ---------------- */
function init() {
  $$(".nav-btn").forEach(b => b.addEventListener("click", () => showPage(b.dataset.page)));
  $("#btn-prev-day").addEventListener("click", () => { viewDate = addDays(viewDate, -1); renderToday(); });
  $("#btn-next-day").addEventListener("click", () => { viewDate = addDays(viewDate, 1); renderToday(); });
  $("#btn-edit-profile").addEventListener("click", () => showPage("profile"));

  $("#btn-snap").addEventListener("click", () => $("#photo-input").click());
  $("#photo-input").addEventListener("change", e => {
    const f = e.target.files[0];
    if (f) openScanFlow(f);
    e.target.value = "";
  });
  $("#btn-search").addEventListener("click", () => openSearchPanel());
  $("#btn-quick").addEventListener("click", () => openQuickPanel());
  $("#btn-custom").addEventListener("click", () => openCustomPanel());

  $("#btn-add-weight").addEventListener("click", () => {
    const v = prompt("Today's weight (kg):", state.profile ? state.profile.weight : "");
    if (v && !isNaN(+v)) {
      const tk = todayKey();
      const last = state.weights[state.weights.length - 1];
      if (last && last.date === tk) last.kg = +v; else state.weights.push({ date: tk, kg: +v });
      saveState(); renderStats(); toast("Weight logged ✔");
    }
  });
  $("#btn-reset").addEventListener("click", () => {
    if (confirm("Delete all data on this device?")) { localStorage.removeItem(LS_KEY); location.reload(); }
  });

  // onboarding
  const ob = $("#onboard-form");
  ob.innerHTML = profileFormHTML(null) + `<button class="submit-btn" type="submit">Create my plan 🚀</button>`;
  bindProfileForm(ob, () => {
    $("#onboard-modal").classList.add("hidden");
    toast("Welcome, " + state.profile.name + "! Target: " + plan().target + " kcal/day");
    renderToday(); renderStats();
  });

  // close modals on backdrop click
  $$(".modal-backdrop").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.add("hidden"); }));

  // service worker (offline / installable)
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  maybeShowOnboarding();
  showPage("today");
}
document.addEventListener("DOMContentLoaded", init);
