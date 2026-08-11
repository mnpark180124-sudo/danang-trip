// ===== 다낭 여행 대시보드 공용 스크립트 =====
// V1 - 기능 복구 / GitHub Pages / iPhone Safari 대응

// ------------------------------------------------------------
// 공통: fetch 타임아웃
// ------------------------------------------------------------
function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal,
    cache: 'no-store',
  }).finally(() => clearTimeout(timer));
}

// ------------------------------------------------------------
// 서비스 워커 등록 (PWA)
// ------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const inPages = location.pathname.includes('/pages/');
    const swUrl = inPages ? '../sw.js' : './sw.js';
    const swScope = inPages ? '../' : './';

    try {
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: swScope,
        updateViaCache: 'none',
      });

      // 페이지가 열릴 때마다 새 sw.js 확인
      await registration.update();

      // 이미 새 Service Worker가 대기 중이면 즉시 활성화
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // 설치 중인 새 Service Worker도 즉시 활성화하도록 처리
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // 새 SW가 적용되었을 때 한 번만 새로고침
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    } catch (error) {
      console.warn('Service Worker 등록 실패:', error);
    }
  });
}

// ------------------------------------------------------------
// PWA 설치 배너
// ------------------------------------------------------------
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;

  const banner = document.getElementById('installBanner');
  if (banner) {
    banner.classList.remove('d-none');
    banner.style.display = 'flex';
  }
});

function installApp() {
  const banner = document.getElementById('installBanner');
  if (!deferredPrompt) return;

  deferredPrompt.prompt();

  deferredPrompt.userChoice
    .catch(() => {})
    .finally(() => {
      deferredPrompt = null;
      if (banner) {
        banner.classList.add('d-none');
        banner.style.display = 'none';
      }
    });
}

window.addEventListener('appinstalled', () => {
  const banner = document.getElementById('installBanner');
  if (banner) {
    banner.classList.add('d-none');
    banner.style.display = 'none';
  }
});

// ------------------------------------------------------------
// 토스트 알림
// ------------------------------------------------------------
function showToast(message) {
  let toast = document.querySelector('.toast');

  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(window.__danangToastTimer);
  window.__danangToastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 1800);
}

// ------------------------------------------------------------
// 주소 복사
// ------------------------------------------------------------
function copyAddress(text, button) {
  const done = () => {
    showToast('주소를 복사했어요 📋');

    if (button) {
      const original = button.innerHTML;
      button.innerHTML = '✓<span>복사됨</span>';
      setTimeout(() => {
        button.innerHTML = original;
      }, 1200);
    }
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(() => {
      fallbackCopy(text, done);
    });
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, callback) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';

  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    document.execCommand('copy');
    callback();
  } catch (error) {
    showToast('주소 복사에 실패했어요');
  } finally {
    document.body.removeChild(textarea);
  }
}

// ------------------------------------------------------------
// Google Maps
// ------------------------------------------------------------
function openMaps(address, lat, lng) {
  let url;

  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  } else {
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

// ------------------------------------------------------------
// Grab 앱 열기 (앱이 없으면 웹사이트)
// ------------------------------------------------------------
function openGrab() {
  const fallback = 'https://www.grab.com/vn/en/';
  let didHide = false;

  const onVisibilityChange = () => {
    if (document.hidden) didHide = true;
  };

  document.addEventListener('visibilitychange', onVisibilityChange, { once: true });

  try {
    window.location.href = 'grab://open';
  } catch (error) {
    // 웹 fallback은 아래 timeout에서 처리
  }

  setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);

    if (!didHide && !document.hidden) {
      window.open(fallback, '_blank', 'noopener,noreferrer');
    }
  }, 900);
}

// ------------------------------------------------------------
// 실시간 환율 (KRW → VND)
// ------------------------------------------------------------
const FX_CACHE_KEY = 'danang_fx_cache_v2';

async function loadExchangeRate() {
  const rateEl = document.getElementById('fxRate');
  const updatedEl = document.getElementById('fxUpdated');
  const krwInput = document.getElementById('fxKrw');
  const vndInput = document.getElementById('fxVnd');

  if (!krwInput || !vndInput || !rateEl) return;

  let rate = null;
  let isLive = false;

  try {
    const response = await fetchWithTimeout(
      'https://open.er-api.com/v6/latest/KRW',
      { method: 'GET' },
      10000
    );

    if (!response.ok) {
      throw new Error(`Exchange API HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data?.result === 'success' && Number.isFinite(data?.rates?.VND)) {
      rate = Number(data.rates.VND);
      isLive = true;

      localStorage.setItem(
        FX_CACHE_KEY,
        JSON.stringify({
          rate,
          ts: Date.now(),
        })
      );
    } else if (Number.isFinite(data?.rates?.VND)) {
      rate = Number(data.rates.VND);
      isLive = true;
    }
  } catch (error) {
    console.warn('실시간 환율 조회 실패:', error);
  }

  // 네트워크/API 실패 시 마지막으로 저장된 환율 사용
  if (!rate) {
    try {
      const cached = localStorage.getItem(FX_CACHE_KEY);

      if (cached) {
        const parsed = JSON.parse(cached);
        if (Number.isFinite(parsed?.rate)) {
          rate = Number(parsed.rate);
        }
      }
    } catch (error) {
      console.warn('저장된 환율 읽기 실패:', error);
    }
  }

  if (!rate) {
    rateEl.textContent = '환율을 불러오지 못했어요.';
    if (updatedEl) {
      updatedEl.textContent = '인터넷 연결을 확인해주세요.';
    }
    return;
  }

  window.__krwToVnd = rate;

  rateEl.textContent = `1 KRW ≈ ${rate.toFixed(2)} VND`;

  if (updatedEl) {
    const label = isLive ? '실시간 업데이트' : '마지막 저장값';
    updatedEl.textContent =
      `${label}: ${new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
  }

  // 기존 이벤트가 중복 등록되지 않도록 clone 후 교체
  const newKrwInput = krwInput.cloneNode(true);
  const newVndInput = vndInput.cloneNode(true);

  krwInput.replaceWith(newKrwInput);
  vndInput.replaceWith(newVndInput);

  const formatNumber = (value) => {
    const digits = String(value || '').replace(/[^\d]/g, '');
    return digits ? Number(digits).toLocaleString('ko-KR') : '';
  };

  newKrwInput.addEventListener('input', () => {
    const value = Number(newKrwInput.value.replace(/[^\d]/g, '')) || 0;
    newKrwInput.value = value ? value.toLocaleString('ko-KR') : '';
    newVndInput.value = value
      ? Math.round(value * rate).toLocaleString('ko-KR')
      : '';
  });

  newVndInput.addEventListener('input', () => {
    const value = Number(newVndInput.value.replace(/[^\d]/g, '')) || 0;
    newVndInput.value = value ? value.toLocaleString('ko-KR') : '';
    newKrwInput.value = value
      ? Math.round(value / rate).toLocaleString('ko-KR')
      : '';
  });

  // 기존 입력값이 있으면 유지, 없으면 기본 100,000원
  const currentKrw = Number(newKrwInput.value.replace(/[^\d]/g, '')) || 0;

  if (currentKrw > 0) {
    newKrwInput.value = formatNumber(currentKrw);
    newVndInput.value = Math.round(currentKrw * rate).toLocaleString('ko-KR');
  } else {
    newKrwInput.value = '100,000';
    newKrwInput.dispatchEvent(new Event('input'));
  }
}

function swapFx() {
  const krw = document.getElementById('fxKrw');
  const vnd = document.getElementById('fxVnd');

  if (!krw || !vnd) return;

  const oldKrw = krw.value;
  krw.value = vnd.value;
  vnd.value = oldKrw;

  krw.dispatchEvent(new Event('input'));
}

// ------------------------------------------------------------
// 다낭 날씨 (Open-Meteo)
// ------------------------------------------------------------
const WMO = {
  0: ['☀️', '맑음'],
  1: ['🌤️', '대체로 맑음'],
  2: ['⛅', '구름 조금'],
  3: ['☁️', '흐림'],
  45: ['🌫️', '안개'],
  48: ['🌫️', '안개'],
  51: ['🌦️', '이슬비'],
  53: ['🌦️', '이슬비'],
  55: ['🌧️', '이슬비'],
  56: ['🌧️', '어는 이슬비'],
  57: ['🌧️', '강한 어는 이슬비'],
  61: ['🌧️', '약한 비'],
  63: ['🌧️', '비'],
  65: ['🌧️', '강한 비'],
  66: ['🌧️', '어는 비'],
  67: ['🌧️', '강한 어는 비'],
  71: ['🌨️', '약한 눈'],
  73: ['🌨️', '눈'],
  75: ['❄️', '강한 눈'],
  77: ['🌨️', '눈 알갱이'],
  80: ['🌦️', '소나기'],
  81: ['🌧️', '소나기'],
  82: ['⛈️', '강한 소나기'],
  85: ['🌨️', '눈 소나기'],
  86: ['❄️', '강한 눈 소나기'],
  95: ['⛈️', '뇌우'],
  96: ['⛈️', '우박 동반 뇌우'],
  99: ['⛈️', '강한 우박 동반 뇌우'],
};

function wIcon(code) {
  return (WMO[code] || ['🌡️', '-'])[0];
}

function wDesc(code) {
  return (WMO[code] || ['🌡️', '-'])[1];
}

const WEATHER_CACHE_KEY = 'danang_weather_cache_v2';

async function loadWeather() {
  const tempEl = document.getElementById('wTemp');
  const descEl = document.getElementById('wDesc');
  const iconEl = document.getElementById('wIcon');
  const daysEl = document.getElementById('wDays');

  if (!tempEl) return;

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=16.0544' +
    '&longitude=108.2022' +
    '&current=temperature_2m,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min,weather_code' +
    '&timezone=Asia%2FBangkok' +
    '&forecast_days=5';

  let data = null;
  let isLive = false;

  try {
    const response = await fetchWithTimeout(url, { method: 'GET' }, 10000);

    if (!response.ok) {
      throw new Error(`Weather API HTTP ${response.status}`);
    }

    data = await response.json();

    if (data?.current && data?.daily) {
      isLive = true;
      localStorage.setItem(
        WEATHER_CACHE_KEY,
        JSON.stringify({
          data,
          ts: Date.now(),
        })
      );
    } else {
      data = null;
    }
  } catch (error) {
    console.warn('실시간 날씨 조회 실패:', error);
  }

  // 실패 시 마지막 날씨 사용
  if (!data) {
    try {
      const cached = localStorage.getItem(WEATHER_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.data?.current && parsed?.data?.daily) {
          data = parsed.data;
        }
      }
    } catch (error) {
      console.warn('저장된 날씨 읽기 실패:', error);
    }
  }

  if (!data?.current) {
    tempEl.textContent = '-';
    if (descEl) descEl.textContent = '날씨 정보를 불러오지 못했어요';
    if (iconEl) iconEl.textContent = '🌤️';
    return;
  }

  const currentTemp = Number(data.current.temperature_2m);
  const currentCode = Number(data.current.weather_code);

  tempEl.textContent = `${Math.round(currentTemp)}°C`;

  if (descEl) {
    descEl.textContent = `다낭 · ${wDesc(currentCode)}`;
  }

  if (iconEl) {
    iconEl.textContent = wIcon(currentCode);
  }

  if (daysEl && data.daily?.time) {
    const count = Math.min(5, data.daily.time.length);

    daysEl.innerHTML = Array.from({ length: count }, (_, i) => {
      const dateText = data.daily.time[i];
      const date = new Date(`${dateText}T12:00:00`);
      const label =
        i === 0
          ? '오늘'
          : date.toLocaleDateString('ko-KR', { weekday: 'short' });

      const max = Math.round(Number(data.daily.temperature_2m_max[i]));
      const min = Math.round(Number(data.daily.temperature_2m_min[i]));
      const code = Number(data.daily.weather_code[i]);

      return `
        <div class="wday">
          <div class="d">${label}</div>
          <div class="i">${wIcon(code)}</div>
          ${max}° / ${min}°
        </div>
      `;
    }).join('');
  }

  if (isLive && descEl) {
    // 실시간 조회 성공 여부는 텍스트를 과하게 바꾸지 않고 유지
  }
}

// ------------------------------------------------------------
// 숙소 + 주변 맛집 지도 (Leaflet / OpenStreetMap)
// ------------------------------------------------------------
function initStayMap(hotel, restaurants = []) {
  const mapEl = document.getElementById('stayMap');
  const listEl = document.getElementById('foodList');

  if (!mapEl) return;

  if (typeof L === 'undefined') {
    console.error('Leaflet이 로드되지 않았습니다.');
    if (listEl) {
      listEl.innerHTML =
        '<div class="text-muted p-3">지도를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</div>';
    }
    return;
  }

  // 같은 페이지에서 함수가 두 번 호출되어도 지도 중복 생성 방지
  if (mapEl._leaflet_id) {
    try {
      mapEl._leaflet_id = null;
    } catch (error) {}
  }

  const hotelLat = Number(hotel?.lat);
  const hotelLng = Number(hotel?.lng);

  if (!Number.isFinite(hotelLat) || !Number.isFinite(hotelLng)) {
    console.error('숙소 좌표가 올바르지 않습니다:', hotel);
    return;
  }

  const map = L.map(mapEl, {
    zoomControl: true,
    attributionControl: true,
  }).setView([hotelLat, hotelLng], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    crossOrigin: true,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const hotelIcon = L.divIcon({
    className: '',
    html: `
      <div style="
        width:30px;
        height:30px;
        border-radius:50% 50% 50% 0;
        background:#0B4F6C;
        transform:rotate(-45deg);
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:0 3px 8px rgba(0,0,0,0.3);
      ">
        <span style="transform:rotate(45deg);font-size:14px;">🏨</span>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });

  L.marker([hotelLat, hotelLng], { icon: hotelIcon })
    .addTo(map)
    .bindPopup(`
      <div class="popup-title">🏨 ${escapeHtml(hotel.name || '숙소')}</div>
      <div class="popup-addr">${escapeHtml(hotel.address || '')}</div>
    `);

  const markers = [[hotelLat, hotelLng]];

  const foodIcon = (number) =>
    L.divIcon({
      className: '',
      html: `
        <div style="
          width:26px;
          height:26px;
          border-radius:50% 50% 50% 0;
          background:#FF6B4A;
          transform:rotate(-45deg);
          display:flex;
          align-items:center;
          justify-content:center;
          box-shadow:0 3px 8px rgba(0,0,0,0.3);
        ">
          <span style="
            transform:rotate(45deg);
            font-size:11px;
            color:#fff;
            font-weight:700;
          ">${number}</span>
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 26],
    });

  const distKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const distLabel = (km) =>
    km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;

  const safeRestaurants = Array.isArray(restaurants) ? restaurants : [];

  const listHtml = safeRestaurants
    .map((restaurant, index) => {
      const lat = Number(restaurant.lat);
      const lng = Number(restaurant.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';

      markers.push([lat, lng]);

      const mapsLink =
        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

      const dishIcon = restaurant.icon || '🍽️';
      const name = restaurant.name || '맛집';
      const nameKo = restaurant.nameKo
        ? ` <span class="name-ko">· ${escapeHtml(restaurant.nameKo)}</span>`
        : '';

      const description = restaurant.desc
        ? `<div class="desc">${dishIcon} ${escapeHtml(restaurant.desc)}</div>`
        : '';

      const distance = distLabel(
        distKm(hotelLat, hotelLng, lat, lng)
      );

      L.marker([lat, lng], { icon: foodIcon(index + 1) })
        .addTo(map)
        .bindPopup(`
          <div class="popup-title">
            ${dishIcon} ${index + 1}. ${escapeHtml(name)}
          </div>
          <div class="popup-addr">
            ${escapeHtml(restaurant.address || '')} · 숙소에서 ${distance}
          </div>
          <a
            class="popup-link"
            href="${mapsLink}"
            target="_blank"
            rel="noopener noreferrer"
          >구글 지도에서 열기 →</a>
        `);

      return `
        <div
          class="food-item"
          role="button"
          tabindex="0"
          onclick="window.open('${mapsLink}', '_blank', 'noopener,noreferrer')"
          onkeydown="if(event.key==='Enter')window.open('${mapsLink}', '_blank', 'noopener,noreferrer')"
        >
          <div class="badge">${dishIcon}</div>
          <div class="info">
            <div class="name">${escapeHtml(name)}${nameKo}</div>
            ${description}
            <div class="addr">
              ${escapeHtml(restaurant.address || '')} ·
              <span class="dist">숙소에서 ${distance}</span>
            </div>
          </div>
          <div class="rating">★ ${Number(restaurant.rating || 0).toFixed(1)}</div>
        </div>
      `;
    })
    .join('');

  if (listEl) {
    listEl.innerHTML =
      listHtml ||
      '<div class="text-muted p-3">주변 맛집 정보가 없습니다.</div>';
  }

  if (markers.length > 1) {
    map.fitBounds(markers, {
      padding: [30, 30],
      maxZoom: 16,
    });
  }

  // 모바일에서 지도 컨테이너 크기를 다시 계산
  setTimeout(() => map.invalidateSize(), 250);
  setTimeout(() => map.invalidateSize(), 1000);

  // 페이지에서 필요하면 나중에 접근할 수 있도록 보관
  window.__stayMap = map;

  return map;
}

// ------------------------------------------------------------
// HTML 안전 처리
// ------------------------------------------------------------
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ------------------------------------------------------------
// 페이지 초기화
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  loadExchangeRate();
  loadWeather();
});

// ============================================================
// V3-1 · 공동 여행방 / 참여자 시스템 (Supabase)
// ============================================================

// ============================================================
// V3-1 · 공동 여행방 / 참여자 시스템 (Supabase)
// ============================================================

const SUPABASE_URL = 'https://kngqkfkppdrnmdzebxsg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3IOBdsAcYNgukQ7Q8wRy4A_4B8XEvmE';
const TRIP_STORAGE_KEY = 'danang_trip_v3_trip_id';
const NICKNAME_STORAGE_KEY = 'danang_trip_v3_nickname';

let __supabase = null;

function getSupabaseClient() {
  if (__supabase) return __supabase;
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.warn('Supabase SDK가 로드되지 않았습니다.');
    return null;
  }
  __supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    }
  );
  return __supabase;
}

async function ensureAnonymousSession() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase SDK를 불러오지 못했습니다.');

  const { data: sessionData } = await client.auth.getSession();
  if (sessionData && sessionData.session) return sessionData.session;

  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

function tripUiMessage(message, type = 'info') {
  const el = document.getElementById('tripMessage');
  if (!el) return;
  el.textContent = message;
  el.className = `trip-message ${type}`;
}

function setTripStatus(trip, nickname) {
  const status = document.getElementById('tripStatus');
  if (!status || !trip) return;

  status.innerHTML = `
    <div class="trip-status-title">🌴 ${escapeHtml(trip.name)}</div>
    <div class="trip-status-code">여행방 코드 <strong>${escapeHtml(trip.trip_code)}</strong></div>
    <div class="trip-status-user">👤 ${escapeHtml(nickname || '여행자')}</div>
  `;
  status.style.display = 'block';
}

async function createTrip() {
  const client = getSupabaseClient();
  if (!client) return tripUiMessage('Supabase 연결을 확인해주세요.', 'error');

  const name = (document.getElementById('tripName')?.value || '').trim() || 'Da Nang Trip 2026';
  const nickname = (document.getElementById('tripNickname')?.value || '').trim();
  if (!nickname) {
    tripUiMessage('닉네임을 먼저 입력해주세요.', 'error');
    return;
  }

  const startDate = document.getElementById('tripStartDate')?.value || '2026-08-23';
  const endDate = document.getElementById('tripEndDate')?.value || '2026-09-04';

  try {
    await ensureAnonymousSession();

    const { data, error } = await client.rpc('create_trip', {
      p_name: name,
      p_start_date: startDate,
      p_end_date: endDate,
      p_nickname: nickname,
    });

    if (error) throw error;

    const trip = Array.isArray(data) ? data[0] : data;
    localStorage.setItem(TRIP_STORAGE_KEY, trip.id);
    localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);

    setTripStatus(trip, nickname);
    tripUiMessage(`여행방이 만들어졌어요. 코드: ${trip.trip_code}`, 'success');
    await loadTripMembers(trip.id);
  } catch (error) {
    console.error(error);
    tripUiMessage(
      error.message?.includes('Anonymous')
        ? 'Supabase에서 Anonymous Sign-Ins를 켜주세요.'
        : `여행방 생성 실패: ${error.message || error}`,
      'error'
    );
  }
}

async function joinTrip() {
  const client = getSupabaseClient();
  if (!client) return tripUiMessage('Supabase 연결을 확인해주세요.', 'error');

  const code = (document.getElementById('tripCode')?.value || '').trim().toUpperCase();
  const nickname = (document.getElementById('tripNickname')?.value || '').trim();

  if (!code) {
    tripUiMessage('여행방 코드를 입력해주세요.', 'error');
    return;
  }
  if (!nickname) {
    tripUiMessage('닉네임을 입력해주세요.', 'error');
    return;
  }

  try {
    await ensureAnonymousSession();

    const { data, error } = await client.rpc('join_trip', {
      p_trip_code: code,
      p_nickname: nickname,
    });

    if (error) throw error;

    const trip = Array.isArray(data) ? data[0] : data;
    if (!trip) throw new Error('존재하지 않는 여행방입니다.');

    localStorage.setItem(TRIP_STORAGE_KEY, trip.id);
    localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);

    setTripStatus(trip, nickname);
    tripUiMessage(`'${trip.name}' 여행방에 참여했어요.`, 'success');
    await loadTripMembers(trip.id);
  } catch (error) {
    console.error(error);
    tripUiMessage(`여행방 참여 실패: ${error.message || error}`, 'error');
  }
}

async function loadTripMembers(tripId) {
  const client = getSupabaseClient();
  const list = document.getElementById('tripMembers');
  if (!client || !list || !tripId) return;

  try {
    await ensureAnonymousSession();
    const { data, error } = await client.rpc('get_trip_members', {
      p_trip_id: tripId,
    });
    if (error) throw error;

    list.innerHTML = (data || []).map((member, index) => `
      <span class="trip-member">
        ${index === 0 ? '👑' : '👤'} ${escapeHtml(member.nickname)}
      </span>
    `).join('') || '<span class="text-muted">참여자가 없습니다.</span>';
  } catch (error) {
    console.error(error);
    list.innerHTML = '<span class="text-muted">참여자 정보를 불러오지 못했습니다.</span>';
  }
}

async function restoreTripSession() {
  const tripId = localStorage.getItem(TRIP_STORAGE_KEY);
  const nickname = localStorage.getItem(NICKNAME_STORAGE_KEY);
  if (!tripId) return;

  const client = getSupabaseClient();
  if (!client) return;

  try {
    await ensureAnonymousSession();
    const { data, error } = await client
      .from('trips')
      .select('id,name,trip_code,start_date,end_date,created_by')
      .eq('id', tripId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      localStorage.removeItem(TRIP_STORAGE_KEY);
      return;
    }

    setTripStatus(data, nickname);
    await loadTripMembers(data.id);
  } catch (error) {
    console.warn('여행방 복원 실패:', error);
  }
}

async function copyTripCode() {
  const status = document.querySelector('.trip-status-code strong');
  if (!status) return;
  const code = status.textContent.trim();

  try {
    await navigator.clipboard.writeText(code);
    tripUiMessage('여행방 코드를 복사했어요 📋', 'success');
  } catch {
    tripUiMessage(`여행방 코드: ${code}`, 'info');
  }
}

window.createTrip = createTrip;
window.joinTrip = joinTrip;
window.copyTripCode = copyTripCode;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('tripRoom')) {
    restoreTripSession();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('tripRoom')) {
    restoreTripSession();
  }
});

// ============================================================
// V3-2 · 공동 여행경비
// ============================================================

const EXPENSE_TRIP_STORAGE_KEY = 'danang_trip_v3_trip_id';

let __expenseMembers = [];
let __expenseItems = [];

function getCurrentTripId() {
  return localStorage.getItem(EXPENSE_TRIP_STORAGE_KEY);
}

function expenseMessage(message, type = 'info') {
  const el = document.getElementById('expenseMessage');
  if (!el) return;

  el.textContent = message;
  el.className = `expense-message ${type}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}

function getCurrencyLabel(currency) {
  return currency === 'KRW' ? '원' : 'VND';
}

// ------------------------------------------------------------
// 여행방 참여자 가져오기
// ------------------------------------------------------------
async function loadExpenseMembers() {
  const client = getSupabaseClient();
  const tripId = getCurrentTripId();

  if (!client || !tripId) return [];

  try {
    await ensureAnonymousSession();

    const { data, error } = await client.rpc('get_trip_members', {
      p_trip_id: tripId
    });

    if (error) throw error;

    __expenseMembers = data || [];

    renderExpenseMemberOptions();

    return __expenseMembers;
  } catch (error) {
    console.error('경비 참여자 조회 실패:', error);
    return [];
  }
}

// ------------------------------------------------------------
// 결제자 / 부담자 선택 UI
// ------------------------------------------------------------
function renderExpenseMemberOptions() {
  const payer = document.getElementById('expensePayer');
  const splitList = document.getElementById('expenseSplitMembers');

  if (!payer || !splitList) return;

  payer.innerHTML = __expenseMembers.map(member => `
    <option value="${escapeHtml(member.user_id)}">
      ${escapeHtml(member.nickname)}
    </option>
  `).join('');

  splitList.innerHTML = __expenseMembers.map(member => `
    <label class="expense-member-check">
      <input
        type="checkbox"
        value="${escapeHtml(member.user_id)}"
        data-nickname="${escapeHtml(member.nickname)}"
        checked
      >
      <span>${escapeHtml(member.nickname)}</span>
    </label>
  `).join('');
}

// ------------------------------------------------------------
// 여행경비 등록
// ------------------------------------------------------------
async function addExpense() {
  const client = getSupabaseClient();
  const tripId = getCurrentTripId();

  if (!client) {
    expenseMessage('Supabase 연결을 확인해주세요.', 'error');
    return;
  }

  if (!tripId) {
    expenseMessage('먼저 여행방을 만들거나 참여해주세요.', 'error');
    return;
  }

  const description =
    document.getElementById('expenseDescription')?.value.trim();

  const amount =
    Number(
      document
        .getElementById('expenseAmount')
        ?.value
        .replace(/[^\d.]/g, '')
    );

  const currency =
    document.getElementById('expenseCurrency')?.value || 'VND';

  const expenseDate =
    document.getElementById('expenseDate')?.value ||
    new Date().toISOString().slice(0, 10);

  const payerId =
    document.getElementById('expensePayer')?.value;

  const category =
    document.getElementById('expenseCategory')?.value || '기타';

  const note =
    document.getElementById('expenseNote')?.value.trim() || null;

  if (!description) {
    expenseMessage('사용처를 입력해주세요.', 'error');
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    expenseMessage('금액을 올바르게 입력해주세요.', 'error');
    return;
  }

  if (!payerId) {
    expenseMessage('결제자를 선택해주세요.', 'error');
    return;
  }

  const checkedMembers = [
    ...document.querySelectorAll(
      '#expenseSplitMembers input[type="checkbox"]:checked'
    )
  ];

  if (!checkedMembers.length) {
    expenseMessage('부담할 사람을 한 명 이상 선택해주세요.', 'error');
    return;
  }

  const payer = __expenseMembers.find(
    member => member.user_id === payerId
  );

  if (!payer) {
    expenseMessage('결제자를 찾을 수 없습니다.', 'error');
    return;
  }

  try {
    await ensureAnonymousSession();

    const { data: expense, error } = await client
      .from('expenses')
      .insert({
        trip_id: tripId,
        description,
        amount,
        currency,
        expense_date: expenseDate,
        paid_by: payerId,
        paid_by_nickname: payer.nickname,
        category,
        note,
        created_by: (await client.auth.getUser()).data.user.id
      })
      .select()
      .single();

    if (error) throw error;

    const splitAmount = amount / checkedMembers.length;

    const splits = checkedMembers.map(input => ({
      expense_id: expense.id,
      user_id: input.value,
      nickname: input.dataset.nickname,
      share_amount: Math.round(splitAmount * 100) / 100
    }));

    const { error: splitError } =
      await client
        .from('expense_splits')
        .insert(splits);

    if (splitError) throw splitError;

    expenseMessage('경비가 저장되었습니다. 💰', 'success');

    clearExpenseForm();

    await loadExpenses();

  } catch (error) {
    console.error('경비 저장 실패:', error);
    expenseMessage(
      `경비 저장 실패: ${error.message || error}`,
      'error'
    );
  }
}

// ------------------------------------------------------------
// 경비 목록
// ------------------------------------------------------------
async function loadExpenses() {
  const client = getSupabaseClient();
  const tripId = getCurrentTripId();

  const list = document.getElementById('expenseList');

  if (!client || !tripId || !list) return;

  try {
    await ensureAnonymousSession();

    const { data, error } = await client
      .from('expenses')
      .select('*')
      .eq('trip_id', tripId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    __expenseItems = data || [];

    renderExpenses();

    await calculateSettlement();

  } catch (error) {
    console.error('경비 조회 실패:', error);

    list.innerHTML =
      '<div class="text-muted p-3">경비 정보를 불러오지 못했습니다.</div>';
  }
}

// ------------------------------------------------------------
// 경비 화면 표시
// ------------------------------------------------------------
function renderExpenses() {
  const list = document.getElementById('expenseList');

  if (!list) return;

  if (!__expenseItems.length) {
    list.innerHTML = `
      <div class="text-muted p-3 text-center">
        아직 등록된 여행경비가 없습니다.
      </div>
    `;
    return;
  }

  list.innerHTML = __expenseItems.map(expense => `
    <div class="expense-item">

      <div class="expense-main">

        <div class="expense-title">
          ${escapeHtml(expense.description)}
        </div>

        <div class="expense-meta">
          ${escapeHtml(expense.expense_date)}
          · ${escapeHtml(expense.category || '기타')}
          · 결제자 ${escapeHtml(expense.paid_by_nickname)}
        </div>

        ${
          expense.note
            ? `<div class="expense-note">${escapeHtml(expense.note)}</div>`
            : ''
        }

      </div>

      <div class="expense-amount">
        ${formatMoney(expense.amount)}
        <small>${getCurrencyLabel(expense.currency)}</small>
      </div>

      <button
        class="btn btn-sm btn-outline-danger expense-delete"
        onclick="deleteExpense('${expense.id}')"
      >
        삭제
      </button>

    </div>
  `).join('');
}

// ------------------------------------------------------------
// 경비 삭제
// ------------------------------------------------------------
async function deleteExpense(expenseId) {
  if (!confirm('이 경비를 삭제할까요?')) return;

  const client = getSupabaseClient();

  if (!client) return;

  try {
    const { error } =
      await client
        .from('expenses')
        .delete()
        .eq('id', expenseId);

    if (error) throw error;

    expenseMessage('경비를 삭제했습니다.', 'success');

    await loadExpenses();

  } catch (error) {
    console.error('경비 삭제 실패:', error);

    expenseMessage(
      `경비 삭제 실패: ${error.message || error}`,
      'error'
    );
  }
}

// ------------------------------------------------------------
// 정산 계산
// ------------------------------------------------------------
async function calculateSettlement() {
  const client = getSupabaseClient();
  const tripId = getCurrentTripId();

  if (!client || !tripId) return;

  const summary = document.getElementById('expenseSummary');
  const settlement = document.getElementById('settlementList');

  if (!summary || !settlement) return;

  try {
    const { data: expenses, error } =
      await client
        .from('expenses')
        .select('*')
        .eq('trip_id', tripId);

    if (error) throw error;

    const { data: splits, error: splitError } =
      await client
        .from('expense_splits')
        .select('*')
        .in(
          'expense_id',
          (expenses || []).map(e => e.id)
        );

    if (splitError) throw splitError;

    const totals = {};

    __expenseMembers.forEach(member => {
      totals[member.user_id] = {
        nickname: member.nickname,
        paid: 0,
        share: 0
      };
    });

    let total = 0;

    (expenses || []).forEach(expense => {
      total += Number(expense.amount || 0);

      if (!totals[expense.paid_by]) {
        totals[expense.paid_by] = {
          nickname: expense.paid_by_nickname,
          paid: 0,
          share: 0
        };
      }

      totals[expense.paid_by].paid +=
        Number(expense.amount || 0);
    });

    (splits || []).forEach(split => {

      if (!totals[split.user_id]) {
        totals[split.user_id] = {
          nickname: split.nickname,
          paid: 0,
          share: 0
        };
      }

      totals[split.user_id].share +=
        Number(split.share_amount || 0);
    });

    const people = Object.values(totals);

    const count = people.length || 1;

    summary.innerHTML = `
      <div class="expense-total-label">총 여행경비</div>
      <div class="expense-total-value">
        ${formatMoney(total)} VND
      </div>
      <div class="expense-per-person">
        1인 평균 ${formatMoney(total / count)} VND
      </div>
    `;

    settlement.innerHTML = people.map(person => {

      const balance = person.paid - person.share;

      let status = '정산 완료';
      let cls = 'settled';

      if (balance > 0.5) {
        status = `받을 돈 ${formatMoney(balance)} VND`;
        cls = 'receive';
      }

      if (balance < -0.5) {
        status = `낼 돈 ${formatMoney(Math.abs(balance))} VND`;
        cls = 'pay';
      }

      return `
        <div class="settlement-item">

          <div class="settlement-name">
            ${escapeHtml(person.nickname)}
          </div>

          <div class="settlement-detail">
            결제 ${formatMoney(person.paid)}
            · 부담 ${formatMoney(person.share)}
          </div>

          <div class="settlement-balance ${cls}">
            ${status}
          </div>

        </div>
      `;

    }).join('');

  } catch (error) {
    console.error('정산 계산 실패:', error);

    settlement.innerHTML =
      '<div class="text-muted">정산 정보를 계산하지 못했습니다.</div>';
  }
}

// ------------------------------------------------------------
// 입력폼 초기화
// ------------------------------------------------------------
function clearExpenseForm() {
  const description =
    document.getElementById('expenseDescription');

  const amount =
    document.getElementById('expenseAmount');

  const note =
    document.getElementById('expenseNote');

  if (description) description.value = '';
  if (amount) amount.value = '';
  if (note) note.value = '';

  document
    .querySelectorAll(
      '#expenseSplitMembers input[type="checkbox"]'
    )
    .forEach(input => {
      input.checked = true;
    });
}

// ------------------------------------------------------------
// V3-2 초기화
// ------------------------------------------------------------
async function initExpenses() {

  if (!document.getElementById('expenseRoom')) return;

  const tripId = getCurrentTripId();

  if (!tripId) {
    expenseMessage(
      '여행방을 먼저 만들거나 참여해주세요.',
      'info'
    );
    return;
  }

  await ensureAnonymousSession();

  await loadExpenseMembers();

  await loadExpenses();

  const dateInput =
    document.getElementById('expenseDate');

  if (dateInput && !dateInput.value) {
    dateInput.value =
      new Date().toISOString().slice(0, 10);
  }
}

window.addExpense = addExpense;
window.deleteExpense = deleteExpense;
window.loadExpenses = loadExpenses;

document.addEventListener('DOMContentLoaded', () => {
  initExpenses();
});

// ============================================================
// V3-3-1 · 날짜별 여행 플래너 / 공동 체크리스트
// ============================================================

const V33_SELECTED_DATE_PREFIX = 'danang_trip_v33_selected_date_';

let __v33Trip = null;
let __v33Dates = [];
let __v33SelectedDate = null;
let __v33Schedules = [];
let __v33Checklist = [];

function v33DateKey(date) {
  if (!date) return '';
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function v33DateRange(startDate, endDate) {
  const result = [];
  const current = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime())) return result;

  let guard = 0;
  while (current <= end && guard < 100) {
    result.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
    guard++;
  }
  return result;
}

function v33FormatDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short'
  });
}

function v33DayNumber(dateKey) {
  const index = __v33Dates.indexOf(dateKey);
  return index >= 0 ? index + 1 : 1;
}

function v33DefaultSchedules(trip) {
  const dates = v33DateRange(trip.start_date, trip.end_date);
  const defaults = [
    ['✈️ 인천 → 다낭', '대한항공 KE459 · 18:20 → 21:05 · 다낭 도착 후 Florence 이동'],
    ['🏨 Florence → Bel Marina', '호이안 이동 · Bel Marina 체크인'],
    ['🏮 호이안 올드타운', '구시가지 · 카페 · 야시장 후보'],
    ['🏮 호이안 DAY', '올드타운 자유 일정 · 마사지 · 카페'],
    ['🏖️ 안방비치 / 호이안', '해변과 호이안 자유 일정'],
    ['🏨 Bel Marina → Hyatt', '다낭 이동 · Hyatt 체크인'],
    ['🏖️ Hyatt / 미케비치', '리조트 · 해변 중심 휴식'],
    ['🏖️ 다낭 자유 일정', '미케비치 · 카페 · 마사지 후보'],
    ['🏨 Hyatt → Altara', 'Altara 이동 · 체크인'],
    ['🌴 다낭 자유 일정', '한시장 · 용다리 · 미케비치 후보'],
    ['🍜 다낭 맛집 DAY', '먹고 싶은 메뉴와 식당 후보 결정'],
    ['🌴 다낭 자유 일정', '쇼핑 · 마사지 · 카페 후보'],
    ['✈️ 다낭 → 인천', 'Altara 출발 · 공항 이동 · KE460 22:55 출발']
  ];

  return dates.map((date, index) => ({
    trip_id: trip.id,
    schedule_date: date,
    title: defaults[index]?.[0] || '🌴 다낭 자유 일정',
    description: defaults[index]?.[1] || '가고 싶은 장소와 먹고 싶은 메뉴를 추가해보세요.',
    sort_order: 10
  }));
}

async function v33EnsureSchedules(trip) {
  const client = getSupabaseClient();
  if (!client || !trip?.id) return;

  try {
    const { data, error } = await client
      .from('trip_schedules')
      .select('id,trip_id,schedule_date,title,description,sort_order,created_by,created_at')
      .eq('trip_id', trip.id)
      .order('schedule_date', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) throw error;

    if (data?.length) {
      __v33Schedules = data;
      return;
    }

    const user = (await client.auth.getUser())?.data?.user;
    const rows = v33DefaultSchedules(trip).map(row => ({
      ...row,
      created_by: user?.id || null
    }));

    const { data: inserted, error: insertError } = await client
      .from('trip_schedules')
      .insert(rows)
      .select();

    if (insertError) throw insertError;
    __v33Schedules = inserted || rows;
  } catch (error) {
    console.warn('V3-3 일정 초기화 실패:', error);
    __v33Schedules = v33DefaultSchedules(trip).map((row, i) => ({
      ...row, id: `local-${i}`
    }));
  }
}

async function v33LoadChecklist(tripId) {
  const client = getSupabaseClient();
  const list = document.getElementById('v33Checklist');
  const status = document.getElementById('v33ChecklistStatus');
  if (!client || !tripId || !list) return;

  try {
    const { error: rpcError } = await client.rpc('create_trip_checklist_v3', {
      p_trip_id: tripId
    });
    if (rpcError) throw rpcError;

    const { data, error } = await client
      .from('trip_checklist')
      .select('id,trip_id,item_key,item_name,checked,updated_by,updated_at')
      .eq('trip_id', tripId)
      .order('id', { ascending: true });

    if (error) throw error;

    __v33Checklist = data || [];
    v33RenderChecklist();

    if (status) {
      status.textContent = `${__v33Checklist.filter(x => x.checked).length} / ${__v33Checklist.length} 완료`;
    }
  } catch (error) {
    console.error('V3-3 체크리스트 조회 실패:', error);
    list.innerHTML = '<div class="text-muted">체크리스트를 불러오지 못했습니다.</div>';
  }
}

function v33RenderChecklist() {
  const list = document.getElementById('v33Checklist');
  const status = document.getElementById('v33ChecklistStatus');
  if (!list) return;

  list.innerHTML = __v33Checklist.map(item => `
    <label class="v33-check-item ${item.checked ? 'checked' : ''}">
      <input type="checkbox"
        ${item.checked ? 'checked' : ''}
        onchange="v33ToggleChecklist('${item.id}', this.checked)">
      <span class="check-name">${escapeHtml(item.item_name)}</span>
    </label>
  `).join('');

  if (status) {
    status.textContent = `${__v33Checklist.filter(x => x.checked).length} / ${__v33Checklist.length} 완료`;
  }
}

async function v33ToggleChecklist(id, checked) {
  const client = getSupabaseClient();
  if (!client) return;

  const item = __v33Checklist.find(x => String(x.id) === String(id));
  const previous = item?.checked;
  if (item) item.checked = checked;
  v33RenderChecklist();

  try {
    const user = (await client.auth.getUser())?.data?.user;
    const { error } = await client
      .from('trip_checklist')
      .update({
        checked,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('체크리스트 저장 실패:', error);
    if (item) item.checked = previous;
    v33RenderChecklist();
    showToast('체크 상태 저장에 실패했어요.');
  }
}

window.v33ToggleChecklist = v33ToggleChecklist;

function v33RenderDateStrip() {
  const strip = document.getElementById('v33DateStrip');
  if (!strip) return;

  strip.innerHTML = __v33Dates.map((dateKey, index) => {
    const date = new Date(`${dateKey}T12:00:00`);
    return `
      <button type="button"
        class="v33-date-chip ${dateKey === __v33SelectedDate ? 'active' : ''}"
        onclick="v33SelectDate('${dateKey}')">
        <div class="n">DAY ${index + 1}</div>
        <div class="d">${date.getMonth() + 1}/${date.getDate()}</div>
        <div class="n">${date.toLocaleDateString('ko-KR', {weekday:'short'})}</div>
      </button>
    `;
  }).join('');

  const active = strip.querySelector('.active');
  if (active) active.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'});
}

function v33RenderSelectedDay() {
  const list = document.getElementById('v33ScheduleList');
  const label = document.getElementById('v33DayLabel');
  const date = document.getElementById('v33DayDate');
  const sub = document.getElementById('v33DaySub');
  const prev = document.getElementById('v33PrevDay');
  const next = document.getElementById('v33NextDay');

  if (!list || !__v33SelectedDate) return;

  const dayNumber = v33DayNumber(__v33SelectedDate);
  if (label) label.textContent = `DAY ${dayNumber}`;
  if (date) date.textContent = v33FormatDate(__v33SelectedDate);

  const stayMap = {
    '2026-08-23': '다낭 도착 · Florence',
    '2026-08-24': 'Florence → Bel Marina',
    '2026-08-27': 'Bel Marina → Hyatt',
    '2026-08-29': 'Hyatt → Altara',
    '2026-09-04': '귀국일'
  };
  if (sub) sub.textContent = stayMap[__v33SelectedDate] || '다낭 여행';

  const schedules = __v33Schedules
    .filter(item => v33DateKey(item.schedule_date) === __v33SelectedDate)
    .sort((a,b) => Number(a.sort_order||0) - Number(b.sort_order||0));

  list.innerHTML = schedules.length
    ? schedules.map(item => `
        <div class="v33-schedule">
          <div class="v33-time">DAY ${dayNumber}</div>
          <div class="v33-title">${escapeHtml(item.title)}</div>
          ${item.description ? `<div class="v33-desc">${escapeHtml(item.description)}</div>` : ''}
        </div>
      `).join('')
    : `<div class="v33-empty">이 날짜에는 아직 일정이 없습니다.</div>`;

  const index = __v33Dates.indexOf(__v33SelectedDate);
  if (prev) prev.disabled = index <= 0;
  if (next) next.disabled = index >= __v33Dates.length - 1;
}

function v33SelectDate(dateKey) {
  if (!__v33Dates.includes(dateKey)) return;
  __v33SelectedDate = dateKey;

  if (__v33Trip?.id) {
    localStorage.setItem(`${V33_SELECTED_DATE_PREFIX}${__v33Trip.id}`, dateKey);
  }

  v33RenderDateStrip();
  v33RenderSelectedDay();
}

window.v33SelectDate = v33SelectDate;

function v33MoveDay(delta) {
  const index = __v33Dates.indexOf(__v33SelectedDate);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= __v33Dates.length) return;
  v33SelectDate(__v33Dates[nextIndex]);
}

function v33InitNavigation() {
  const prev = document.getElementById('v33PrevDay');
  const next = document.getElementById('v33NextDay');

  if (prev && !prev.dataset.bound) {
    prev.dataset.bound = '1';
    prev.addEventListener('click', () => v33MoveDay(-1));
  }
  if (next && !next.dataset.bound) {
    next.dataset.bound = '1';
    next.addEventListener('click', () => v33MoveDay(1));
  }
}

async function initV33Planner(trip) {
  if (!document.getElementById('v33Planner') || !trip?.id) return;

  __v33Trip = trip;
  __v33Dates = v33DateRange(trip.start_date, trip.end_date);
  if (!__v33Dates.length) return;

  const saved = localStorage.getItem(`${V33_SELECTED_DATE_PREFIX}${trip.id}`);
  __v33SelectedDate = saved && __v33Dates.includes(saved) ? saved : __v33Dates[0];

  v33InitNavigation();
  v33RenderDateStrip();
  v33RenderSelectedDay();

  await v33EnsureSchedules(trip);
  await v33LoadChecklist(trip.id);

  v33RenderDateStrip();
  v33RenderSelectedDay();
}

// 기존 V3-1의 여행방 상태 표시 함수에 V3-3 초기화를 연결
const __v33BaseSetTripStatus = setTripStatus;
setTripStatus = function(trip, nickname) {
  __v33BaseSetTripStatus(trip, nickname);
  if (trip?.id) initV33Planner(trip);
};
