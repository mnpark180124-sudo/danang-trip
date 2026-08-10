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
