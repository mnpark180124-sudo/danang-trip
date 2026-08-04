// ===== 다낭 여행 대시보드 공용 스크립트 =====

// ---- 서비스 워커 등록 (PWA) ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const inPages = location.pathname.includes('/pages/');
    const swUrl = inPages ? '../sw.js' : 'sw.js';
    const swScope = inPages ? '../' : './';
    navigator.serviceWorker.register(swUrl, { scope: swScope }).catch(() => {});
  });
}

// ---- PWA 설치 배너 ----
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById('installBanner');
  if (banner) banner.style.display = 'flex';
});

function installApp() {
  const banner = document.getElementById('installBanner');
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.finally(() => {
    deferredPrompt = null;
    if (banner) banner.style.display = 'none';
  });
}

window.addEventListener('appinstalled', () => {
  const banner = document.getElementById('installBanner');
  if (banner) banner.style.display = 'none';
});

// ---- 토스트 알림 ----
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---- 주소 복사 ----
function copyAddress(text, btn) {
  const done = () => showToast('주소를 복사했어요 📋');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}
function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); cb(); } catch (e) {}
  document.body.removeChild(ta);
}

// ---- 구글맵 열기 ----
function openMaps(address, lat, lng) {
  let url;
  if (lat && lng) {
    url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  } else {
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  window.open(url, '_blank');
}

// ---- Grab 앱 열기 (없으면 웹으로 대체) ----
function openGrab() {
  const fallback = 'https://www.grab.com/vn/en/';
  const now = Date.now();
  let didHide = false;
  const onBlur = () => { didHide = true; };
  window.addEventListener('blur', onBlur, { once: true });
  window.location.href = 'grab://open';
  setTimeout(() => {
    window.removeEventListener('blur', onBlur);
    if (!didHide) window.open(fallback, '_blank');
  }, 900);
}

// ---- 실시간 환율 (한국 원 ↔ 베트남 동) ----
const FX_CACHE_KEY = 'danang_fx_cache_v1';
async function loadExchangeRate() {
  const rateEl = document.getElementById('fxRate');
  const updatedEl = document.getElementById('fxUpdated');
  const krwInput = document.getElementById('fxKrw');
  const vndInput = document.getElementById('fxVnd');
  if (!krwInput) return;

  let rate = null;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/KRW');
    const data = await res.json();
    if (data && data.rates && data.rates.VND) {
      rate = data.rates.VND;
      localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rate, ts: Date.now() }));
    }
  } catch (e) {
    const cached = localStorage.getItem(FX_CACHE_KEY);
    if (cached) rate = JSON.parse(cached).rate;
  }

  if (!rate) {
    rateEl.textContent = '환율을 불러오지 못했어요. 인터넷 연결을 확인해주세요.';
    return;
  }

  window.__krwToVnd = rate;
  rateEl.textContent = `1 KRW ≈ ${rate.toFixed(2)} VND`;
  updatedEl.textContent = `업데이트: ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;

  krwInput.addEventListener('input', () => {
    const v = parseFloat(krwInput.value.replace(/,/g, '')) || 0;
    vndInput.value = Math.round(v * rate).toLocaleString('ko-KR');
  });
  vndInput.addEventListener('input', () => {
    const v = parseFloat(vndInput.value.replace(/,/g, '')) || 0;
    krwInput.value = Math.round(v / rate).toLocaleString('ko-KR');
  });

  // 기본값 10만원
  krwInput.value = '100,000';
  krwInput.dispatchEvent(new Event('input'));
}

function swapFx() {
  const a = document.getElementById('fxKrw');
  const b = document.getElementById('fxVnd');
  const tmp = a.value;
  a.value = b.value;
  b.value = tmp;
}

// ---- 다낭 날씨 (Open-Meteo, API 키 불필요) ----
const WMO = {
  0: ['☀️', '맑음'], 1: ['🌤️', '대체로 맑음'], 2: ['⛅', '구름 조금'], 3: ['☁️', '흐림'],
  45: ['🌫️', '안개'], 48: ['🌫️', '안개'],
  51: ['🌦️', '이슬비'], 53: ['🌦️', '이슬비'], 55: ['🌧️', '이슬비'],
  61: ['🌧️', '약한 비'], 63: ['🌧️', '비'], 65: ['🌧️', '강한 비'],
  80: ['🌦️', '소나기'], 81: ['🌧️', '소나기'], 82: ['⛈️', '강한 소나기'],
  95: ['⛈️', '뇌우'], 96: ['⛈️', '뇌우'], 99: ['⛈️', '강한 뇌우'],
};
function wIcon(code) { return (WMO[code] || ['🌡️', '-'])[0]; }
function wDesc(code) { return (WMO[code] || ['🌡️', '-'])[1]; }

async function loadWeather() {
  const tempEl = document.getElementById('wTemp');
  const descEl = document.getElementById('wDesc');
  const iconEl = document.getElementById('wIcon');
  const daysEl = document.getElementById('wDays');
  if (!tempEl) return;

  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=16.0544&longitude=108.2022&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FBangkok';
    const res = await fetch(url);
    const data = await res.json();
    const cur = data.current;
    tempEl.textContent = `${Math.round(cur.temperature_2m)}°C`;
    descEl.textContent = `다낭 · ${wDesc(cur.weather_code)}`;
    iconEl.textContent = wIcon(cur.weather_code);

    const days = data.daily.time.slice(0, 5);
    daysEl.innerHTML = days.map((d, i) => {
      const date = new Date(d);
      const label = i === 0 ? '오늘' : date.toLocaleDateString('ko-KR', { weekday: 'short' });
      const max = Math.round(data.daily.temperature_2m_max[i]);
      const min = Math.round(data.daily.temperature_2m_min[i]);
      return `<div class="wday"><div class="d">${label}</div><div class="i">${wIcon(data.daily.weather_code[i])}</div>${max}° / ${min}°</div>`;
    }).join('');
  } catch (e) {
    tempEl.textContent = '-';
    descEl.textContent = '날씨 정보를 불러오지 못했어요';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadExchangeRate();
  loadWeather();
});

// ---- 숙소 + 주변 맛집 지도 (Leaflet / OpenStreetMap, API 키 불필요) ----
function initStayMap(hotel, restaurants) {
  const mapEl = document.getElementById('stayMap');
  const listEl = document.getElementById('foodList');
  if (!mapEl || typeof L === 'undefined') return;

  const map = L.map('stayMap', { zoomControl: true, attributionControl: false })
    .setView([hotel.lat, hotel.lng], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  const hotelIcon = L.divIcon({
    className: '',
    html: '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:#0B4F6C;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.3);"><span style="transform:rotate(45deg);font-size:14px;">🏨</span></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
  L.marker([hotel.lat, hotel.lng], { icon: hotelIcon })
    .addTo(map)
    .bindPopup(`<div class="popup-title">🏨 ${hotel.name}</div><div class="popup-addr">${hotel.address}</div>`);

  const markers = [[hotel.lat, hotel.lng]];
  const foodIcon = (n) => L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#FF6B4A;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.3);"><span style="transform:rotate(45deg);font-size:11px;color:#fff;font-weight:700;">${n}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });

  const listHtml = restaurants.map((r, i) => {
    markers.push([r.lat, r.lng]);
    const mLink = `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`;
    const dishIcon = r.icon || '🍽️';
    const descLine = r.desc ? `<div class="desc">${r.desc}</div>` : '';
    L.marker([r.lat, r.lng], { icon: foodIcon(i + 1) })
      .addTo(map)
      .bindPopup(`<div class="popup-title">${dishIcon} ${i + 1}. ${r.name}</div><div class="popup-addr">${r.address}</div><a class="popup-link" href="${mLink}" target="_blank">구글 지도에서 열기 →</a>`);
    return `<div class="food-item" onclick="window.open('${mLink}','_blank')">
      <div class="badge">${dishIcon}</div>
      <div class="info"><div class="name">${r.name}</div>${descLine}<div class="addr">${r.address}</div></div>
      <div class="rating">★ ${r.rating}</div>
    </div>`;
  }).join('');
  if (listEl) listEl.innerHTML = listHtml;

  if (markers.length > 1) {
    map.fitBounds(markers, { padding: [30, 30] });
  }
}
