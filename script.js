// ---------- ข้อมูลตั้งต้น: แม่สี 3 สี + สีขาว ----------
const PRIMARY_COLORS = [
  { name: 'แดง', rgb: [224, 49, 49] },
  { name: 'เหลือง', rgb: [255, 209, 70] },
  { name: 'น้ำเงิน', rgb: [37, 72, 190] },
  { name: 'ขาว', rgb: [255, 255, 255] },
];

// ตั้งค่าจานสี
const DEFAULT_SLOTS = 3;
const MIN_SLOTS = 2;
const MAX_SLOTS = 8;
const MAX_PARTS = 10;

// แถบชื่อสีตามค่า Hue (องศา 0-360) แบ่งละเอียดขึ้นให้ได้ชื่อหลากหลาย
const HUE_BANDS = [
  { max: 10, name: 'แดง' },
  { max: 20, name: 'แดงส้ม' },
  { max: 35, name: 'ส้ม' },
  { max: 48, name: 'ส้มเหลือง' },
  { max: 60, name: 'เหลือง' },
  { max: 75, name: 'เหลืองมะนาว' },
  { max: 95, name: 'มะกอก' },
  { max: 115, name: 'เขียวอมเหลือง' },
  { max: 135, name: 'เขียว' },
  { max: 155, name: 'เขียวมรกต' },
  { max: 172, name: 'เขียวหยก' },
  { max: 188, name: 'ฟ้าทะเล' },
  { max: 205, name: 'ฟ้า' },
  { max: 222, name: 'ฟ้าน้ำเงิน' },
  { max: 240, name: 'น้ำเงิน' },
  { max: 258, name: 'น้ำเงินคราม' },
  { max: 272, name: 'คราม' },
  { max: 288, name: 'ม่วง' },
  { max: 302, name: 'ม่วงบานเย็น' },
  { max: 316, name: 'บานเย็น' },
  { max: 330, name: 'ชมพูม่วง' },
  { max: 345, name: 'ชมพู' },
  { max: 355, name: 'กุหลาบ' },
  { max: 361, name: 'แดง' },
];

// คำขยายเพิ่มเติมไว้แก้ปัญหาชื่อซ้ำเมื่อสีเยอะขึ้นเรื่อย ๆ
const EXTRA_ADJECTIVES = [
  'สด', 'นวล', 'หม่น', 'ประกาย', 'ทึม', 'ใส', 'มัว', 'ดิน', 'ฝุ่น', 'หวาน',
  'อมควัน', 'อมทอง', 'อมเทา', 'เรือง', 'ซีด', 'แก่', 'อ่อนละมุน', 'เข้มขลับ', 'สนิม', 'พาสเทล',
];

let palette = [];       // {id, name, rgb, hex}
let usedNames = new Set();
let slots = [];         // ช่องบนจานสี: null (ว่าง) หรือ {id, parts} (id สี, parts จำนวนส่วน)
let nextId = 0;
let hintTimer = null;

// ---------- แปลงค่าสี ----------
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

// ผสมสีแบบลบ (คล้ายสีสีน้ำ/สีโปสเตอร์) ผ่าน CMY แทนการเฉลี่ย RGB ตรง ๆ
// รับได้กี่สีก็ได้: items = [{ rgb, weight }] น้ำหนักจะถูกทำให้รวมเป็น 1 อัตโนมัติ
// สีขาวใน CMY คือ (0,0,0) จึงทำหน้าที่ลดความเข้ม/ทำให้สีอ่อนลงเมื่อผสม
function mixMany(items) {
  const total = items.reduce((sum, it) => sum + it.weight, 0) || 1;
  let c = 0, m = 0, y = 0;
  items.forEach(({ rgb, weight }) => {
    const w = weight / total;
    c += (1 - rgb[0] / 255) * w;
    m += (1 - rgb[1] / 255) * w;
    y += (1 - rgb[2] / 255) * w;
  });
  return [(1 - c) * 255, (1 - m) * 255, (1 - y) * 255]
    .map(v => Math.max(0, Math.min(255, v)));
}

// สีอ่อนมาก (เช่น ขาว) ต้องใช้ตัวอักษรสีเข้ม
function isLight(rgb) {
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 190;
}

// ---------- ตั้งชื่อสีภาษาไทย ----------
function hueName(h) {
  const band = HUE_BANDS.find(b => h < b.max);
  return band ? band.name : 'แดง';
}

function baseColorName(rgb) {
  const { h, s, l } = rgbToHsl(rgb);
  if (s < 12) {
    if (l > 85) return 'ขาว';
    if (l < 15) return 'ดำ';
    return 'เทา';
  }
  const hue = hueName(h);
  if (l > 72 && (h < 10 || h >= 345)) return 'ชมพู'; // แดง + ขาว
  let modifier = '';
  if (l < 30) modifier = 'เข้ม';
  else if (l > 72) modifier = 'อ่อน';
  else if (s < 30) modifier = 'หม่น';
  return modifier ? `${hue}${modifier}` : hue;
}

function uniqueColorName(rgb) {
  const base = baseColorName(rgb);
  if (!usedNames.has(base)) return base;
  for (const adj of EXTRA_ADJECTIVES) {
    const candidate = `${base}${adj}`;
    if (!usedNames.has(candidate)) return candidate;
  }
  // กันชื่อซ้ำขั้นสุดท้าย: ใส่ลำดับต่อท้าย
  let n = 2;
  while (usedNames.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

// ---------- จัดการ state / UI ----------
function addColor(name, rgb) {
  const c = { id: nextId++, name, rgb, hex: rgbToHex(rgb) };
  palette.push(c);
  usedNames.add(name);
  return c;
}

function init() {
  palette = [];
  usedNames = new Set();
  slots = Array(DEFAULT_SLOTS).fill(null);
  nextId = 0;
  PRIMARY_COLORS.forEach(p => addColor(p.name, p.rgb));
  document.getElementById('resultCard').hidden = true;
  showHint('');
  renderPalette();
  renderSlots();
}

function colorById(id) {
  return palette.find(p => p.id === id);
}

function selectedIds() {
  return slots.filter(Boolean).map(s => s.id);
}

function showHint(text) {
  const el = document.getElementById('hint');
  el.textContent = text;
  clearTimeout(hintTimer);
  if (text) hintTimer = setTimeout(() => { el.textContent = ''; }, 2500);
}

function renderPalette() {
  const wrap = document.getElementById('palette');
  const chosen = selectedIds();
  wrap.innerHTML = '';
  palette.forEach(c => {
    const on = chosen.includes(c.id);
    const btn = document.createElement('button');
    btn.className = 'swatch' + (on ? ' selected' : '') + (isLight(c.rgb) ? ' light' : '');
    btn.style.background = c.hex;
    btn.textContent = c.name;
    btn.setAttribute('aria-pressed', on);
    btn.addEventListener('click', () => toggleSelect(c.id));
    wrap.appendChild(btn);
  });
  document.getElementById('countBadge').textContent = `${palette.length} สี`;
}

function renderSlots() {
  const grid = document.getElementById('slotsGrid');
  const total = slots.reduce((sum, s) => sum + (s ? s.parts : 0), 0);
  grid.innerHTML = '';

  slots.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'slot';
    const c = s && colorById(s.id);
    if (!c) {
      el.textContent = `ช่องที่ ${i + 1}`;
      grid.appendChild(el);
      return;
    }
    el.classList.add('filled');
    if (isLight(c.rgb)) el.classList.add('light');
    el.style.background = c.hex;

    const pct = Math.round((s.parts / total) * 100);
    const name = document.createElement('span');
    name.className = 'slot-name';
    name.textContent = c.name;

    const pctEl = document.createElement('span');
    pctEl.className = 'slot-pct';
    pctEl.textContent = `${pct}%`;

    const rm = document.createElement('button');
    rm.className = 'slot-remove';
    rm.textContent = '✕';
    rm.setAttribute('aria-label', `เอา${c.name}ออก`);
    rm.addEventListener('click', () => toggleSelect(c.id));

    const stepper = document.createElement('div');
    stepper.className = 'stepper';
    const minus = document.createElement('button');
    minus.textContent = '−';
    minus.setAttribute('aria-label', `ลดส่วน${c.name}`);
    minus.disabled = s.parts <= 1;
    minus.addEventListener('click', () => changeParts(i, -1));
    const num = document.createElement('span');
    num.textContent = `${s.parts} ส่วน`;
    const plus = document.createElement('button');
    plus.textContent = '+';
    plus.setAttribute('aria-label', `เพิ่มส่วน${c.name}`);
    plus.disabled = s.parts >= MAX_PARTS;
    plus.addEventListener('click', () => changeParts(i, 1));
    stepper.append(minus, num, plus);

    el.append(rm, name, pctEl, stepper);
    grid.appendChild(el);
  });

  document.getElementById('slotCount').textContent = `${slots.length} ช่อง`;
  document.getElementById('addSlotBtn').disabled = slots.length >= MAX_SLOTS;
  document.getElementById('removeSlotBtn').disabled = slots.length <= MIN_SLOTS;

  const ready = selectedIds().length >= 2;
  document.getElementById('mixBtn').disabled = !ready;
  document.getElementById('dishWrap').hidden = !ready;
  if (ready) updateDish();
}

// รายการสีที่อยู่บนจานสีตอนนี้ พร้อมน้ำหนัก
function currentMix() {
  return slots.filter(Boolean).map(s => {
    const c = colorById(s.id);
    return { color: c, rgb: c.rgb, weight: s.parts };
  });
}

function describeMix(items) {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  return items
    .map(it => `${it.color.name} ${Math.round((it.weight / total) * 100)}%`)
    .join(' + ');
}

function updateDish() {
  const items = currentMix();
  if (items.length < 2) return;
  document.getElementById('dish').style.background = rgbToHex(mixMany(items));
  document.getElementById('dishCaption').textContent = `ตัวอย่างก่อนผสม — ${describeMix(items)}`;
}

function toggleSelect(id) {
  const idx = slots.findIndex(s => s && s.id === id);
  if (idx >= 0) {
    slots[idx] = null;
  } else {
    const empty = slots.indexOf(null);
    if (empty < 0) {
      showHint('ช่องเต็มแล้ว — เพิ่มช่องหรือเอาสีออกก่อน');
      return;
    }
    slots[empty] = { id, parts: 1 };
  }
  renderPalette();
  renderSlots();
}

function changeParts(index, delta) {
  const s = slots[index];
  if (!s) return;
  s.parts = Math.max(1, Math.min(MAX_PARTS, s.parts + delta));
  renderSlots();
}

function addSlot() {
  if (slots.length >= MAX_SLOTS) return;
  slots.push(null);
  renderSlots();
}

function removeSlot() {
  if (slots.length <= MIN_SLOTS) return;
  // เอาช่องว่างท้ายสุดออกก่อน ถ้าไม่มีช่องว่างก็ตัดช่องสุดท้าย (พร้อมสีในช่องนั้น)
  const lastEmpty = slots.lastIndexOf(null);
  slots.splice(lastEmpty >= 0 ? lastEmpty : slots.length - 1, 1);
  renderPalette();
  renderSlots();
}

function mixSelected() {
  const items = currentMix();
  if (items.length < 2) return;
  const rgb = mixMany(items);
  const name = uniqueColorName(rgb);
  const created = addColor(name, rgb);

  const swatch = document.getElementById('resultSwatch');
  swatch.style.background = created.hex;
  document.getElementById('resultName').textContent = created.name;
  document.getElementById('resultHex').textContent =
    `จาก ${describeMix(items)} → ${created.hex}`;
  const card = document.getElementById('resultCard');
  card.hidden = false;
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';

  slots = slots.map(() => null); // เก็บจำนวนช่องไว้ แต่เคลียร์สีออก
  showHint('');
  renderPalette();
  renderSlots();
}

document.getElementById('mixBtn').addEventListener('click', mixSelected);
document.getElementById('resetBtn').addEventListener('click', init);
document.getElementById('addSlotBtn').addEventListener('click', addSlot);
document.getElementById('removeSlotBtn').addEventListener('click', removeSlot);

init();

// ---------- หน้าเปิดแอป: แสดงประมาณ 3 วินาทีแล้วเข้าหน้าแอป (แตะเพื่อข้ามได้) ----------
(function () {
  const splash = document.getElementById('splash');
  if (!splash) return;
  let done = false;
  function closeSplash() {
    if (done) return;
    done = true;
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 550);
  }
  setTimeout(closeSplash, 3000);
  splash.addEventListener('click', closeSplash);
})();

// ---------- PWA: ลงทะเบียน service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
