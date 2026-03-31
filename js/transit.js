const ODSAY_KEY = encodeURIComponent('9vT5b5ryWK0WowAXS953+g');

let naverMap        = null;
let currentMarkers  = [];
let currentPolylines = [];
let transitMode     = 'car';
let departureCoords = null;
let currentDest     = null;

/* ===== 탭 초기화 ===== */
function initTransitTab(dest) {
  currentDest = dest;

  const destLabel = document.getElementById('transitDestLabel');
  if (destLabel) destLabel.textContent = dest.displayName || dest.name;

  initNaverMap(dest);
  initModeButtons();

  const btn = document.getElementById('searchTransitBtn');
  if (btn) {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => searchRoute(dest));
  }

  const input = document.getElementById('departureInput');
  if (input) {
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchRoute(dest); });
  }

  document.getElementById('transitResults').innerHTML =
    '<div class="transit-hint">출발지를 입력하고 <strong>경로 찾기</strong>를 눌러보세요</div>';
}

function initModeButtons() {
  document.querySelectorAll('.transit-mode-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      document.querySelectorAll('.transit-mode-btn').forEach(b => b.classList.remove('active'));
      newBtn.classList.add('active');
      transitMode = newBtn.dataset.mode;
      if (currentDest) searchRoute(currentDest);
    });
  });
}

/* ===== 네이버맵 초기화 ===== */
function initNaverMap(dest) {
  const container = document.getElementById('kakaoMap');
  if (!container || !window.naver?.maps) return;

  if (naverMap) {
    naverMap.setCenter(new naver.maps.LatLng(dest.lat, dest.lon));
    return;
  }

  naverMap = new naver.maps.Map('kakaoMap', {
    center: new naver.maps.LatLng(dest.lat, dest.lon),
    zoom: 10,
    mapTypeId: naver.maps.MapTypeId.NORMAL,
  });

  addDestMarker(dest);
}

function addDestMarker(dest) {
  if (!naverMap) return;
  const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(dest.lat, dest.lon),
    map: naverMap,
    icon: {
      content: `<div style="background:#ff6b35;color:#fff;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏁 ${dest.displayName || dest.name}</div>`,
      anchor: new naver.maps.Point(0, 30),
    },
  });
  currentMarkers.push(marker);
}

function clearMapLayers() {
  currentMarkers.forEach(m => m.setMap(null));
  currentPolylines.forEach(p => p.setMap(null));
  currentMarkers  = [];
  currentPolylines = [];
}

/* ===== 경로 찾기 메인 ===== */
async function searchRoute(dest) {
  const input   = document.getElementById('departureInput');
  const results = document.getElementById('transitResults');
  const btn     = document.getElementById('searchTransitBtn');
  const query   = input?.value.trim();

  if (!query) {
    results.innerHTML = '<div class="transit-hint">출발지를 입력해주세요</div>';
    return;
  }

  if (btn) btn.disabled = true;

  if (transitMode === 'longdist') {
    showLongDistance({ name: query }, dest, results);
    if (btn) btn.disabled = false;
    return;
  }

  results.innerHTML = `<div class="transit-loading"><div class="loading-spinner"></div><p>경로 탐색 중...</p></div>`;

  try {
    const coords = await geocodeQuery(query);
    departureCoords = coords ? { ...coords, name: query } : { name: query };

    clearMapLayers();
    addDestMarker(dest);
    if (coords) addStartMarker(coords, query);

    if (transitMode === 'car') {
      if (coords) {
        await showCarRoute(coords, dest, results);
      } else {
        showCarFallback(query, dest, results);
      }
    } else if (transitMode === 'transit') {
      if (coords) {
        await showTransitRoute(coords, dest, results);
      } else {
        showLongDistance({ name: query }, dest, results);
      }
    }
  } catch (err) {
    console.error('경로 탐색 오류:', err);
    showLongDistance({ name: query }, dest, results);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function addStartMarker(coords, label) {
  if (!naverMap) return;
  const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(coords.lat, coords.lng),
    map: naverMap,
    icon: {
      content: `<div style="background:#7fb3f5;color:#fff;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🚀 ${label}</div>`,
      anchor: new naver.maps.Point(0, 30),
    },
  });
  currentMarkers.push(marker);
}

/* ===== 자가용 경로 (OSRM) ===== */
async function showCarRoute(start, dest, container) {
  try {
    const url  = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`;
    const res  = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const route   = data.routes[0];
      const distKm  = (route.distance / 1000).toFixed(1);
      const durMin  = Math.round(route.duration / 60);
      const durH    = Math.floor(durMin / 60);
      const durM    = durMin % 60;
      const durText = durH > 0 ? `${durH}시간 ${durM}분` : `${durM}분`;

      if (naverMap) {
        const coords = route.geometry.coordinates.map(([lng, lat]) => new naver.maps.LatLng(lat, lng));
        const poly = new naver.maps.Polyline({
          path: coords,
          strokeColor: '#ff6b35',
          strokeWeight: 5,
          strokeOpacity: 0.85,
          map: naverMap,
        });
        currentPolylines.push(poly);

        const bounds = new naver.maps.LatLngBounds();
        coords.forEach(c => bounds.extend(c));
        naverMap.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      }

      const kakaoCarUrl = `https://map.kakao.com/link/by/car/${encodeURIComponent(start.name)},${start.lat},${start.lng}/${encodeURIComponent(dest.displayName || dest.name)},${dest.lat},${dest.lon}`;
      const naverCarUrl = `https://map.naver.com/v5/directions/-/${encodeURIComponent(start.name)}/-/${encodeURIComponent(dest.displayName || dest.name)}/-/car`;

      container.innerHTML = `
        <div class="car-route-card">
          <div class="car-route-header">
            <span class="car-route-icon">🚗</span>
            <div class="car-route-info">
              <div class="car-route-time">${durText}</div>
              <div class="car-route-dist">약 ${distKm} km</div>
            </div>
          </div>
          <div class="car-route-path">
            <span class="car-node start">${start.name}</span>
            <span class="car-arrow">→</span>
            <span class="car-node end">${dest.displayName || dest.name}</span>
          </div>
          <div class="car-nav-links">
            <a class="car-nav-btn kakao" href="${kakaoCarUrl}" target="_blank">🗺️ 카카오맵 내비</a>
            <a class="car-nav-btn naver" href="${naverCarUrl}" target="_blank">🟢 네이버맵 내비</a>
          </div>
        </div>`;
    } else {
      showCarFallback(start.name, dest, container);
    }
  } catch {
    showCarFallback(start.name, dest, container);
  }
}

function showCarFallback(depName, dest, container) {
  const destName    = dest.displayName || dest.name;
  const kakaoCarUrl = `https://map.kakao.com/link/by/car/${encodeURIComponent(depName)},0,0/${encodeURIComponent(destName)},${dest.lat},${dest.lon}`;
  const naverCarUrl = `https://map.naver.com/v5/directions/-/${encodeURIComponent(depName)}/-/${encodeURIComponent(destName)}/-/car`;

  container.innerHTML = `
    <div class="car-route-card">
      <div class="car-route-header">
        <span class="car-route-icon">🚗</span>
        <div class="car-route-info">
          <div class="car-route-time" style="font-size:16px">경로 안내</div>
          <div class="car-route-dist">지도 앱에서 정확한 경로를 확인하세요</div>
        </div>
      </div>
      <div class="car-route-path">
        <span class="car-node start">${depName}</span>
        <span class="car-arrow">→</span>
        <span class="car-node end">${destName}</span>
      </div>
      <div class="car-nav-links">
        <a class="car-nav-btn kakao" href="${kakaoCarUrl}" target="_blank">🗺️ 카카오맵 내비</a>
        <a class="car-nav-btn naver" href="${naverCarUrl}" target="_blank">🟢 네이버맵 내비</a>
      </div>
    </div>`;
}

/* ===== 대중교통 (ODsay) ===== */
async function showTransitRoute(start, dest, container) {
  const paths = await searchODsay(start.lng, start.lat, dest.lon, dest.lat);
  if (!paths || paths.length === 0) {
    showLongDistance(start, dest, container);
  } else {
    renderTransitPaths(paths, container);
  }
}

/* ===== 지오코딩 (Nominatim 단계적 검색) ===== */
async function geocodeQuery(query) {
  const attempts = buildSearchAttempts(query);
  for (const q of attempts) {
    const result = await nominatimSearch(q);
    if (result) return result;
  }
  return null;
}

function buildSearchAttempts(query) {
  const attempts = [];
  const cleaned  = query.trim();
  attempts.push(cleaned + ' 한국');
  attempts.push(cleaned);
  const words = cleaned.split(/\s+/);
  for (let i = words.length - 1; i >= 1; i--) {
    attempts.push(words.slice(0, i).join(' ') + ' 한국');
  }
  const keywords = ['대학교', '대학', '역', '터미널', '병원', '공항', '시청', '구청', '군청', '호텔', '리조트'];
  for (const kw of keywords) {
    const idx = cleaned.indexOf(kw);
    if (idx > 0) { attempts.push(cleaned.substring(0, idx + kw.length) + ' 한국'); break; }
  }
  return [...new Set(attempts)];
}

async function nominatimSearch(query) {
  try {
    const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=kr`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'ko' } });
    const data = await res.json();
    if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch { return null; }
}

/* ===== ODsay API ===== */
async function searchODsay(startX, startY, endX, endY) {
  const url = `/odsay/v1/api/searchPubTransPathT?apiKey=${ODSAY_KEY}&SX=${startX}&SY=${startY}&EX=${endX}&EY=${endY}&SearchType=0&SearchPathType=0`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.result?.path || null;
  } catch (e) { clearTimeout(timeout); return null; }
}

/* ===== 대중교통 경로 렌더링 ===== */
function renderTransitPaths(paths, container) {
  const colors = ['#ff6b35', '#7fb3f5', '#6de0a0', '#ffb347', '#e879f9'];
  container.innerHTML = `<div class="transit-results-title">🚌 대중교통 경로 ${paths.length}개</div>`;

  paths.slice(0, 5).forEach((path, idx) => {
    const info = path.info;
    const subPaths = path.subPath || [];
    const busCount = info.busCount || 0;
    const subwayCount = info.subwayCount || 0;
    let typeLabel = '🚌 버스';
    if (subwayCount > 0 && busCount > 0) typeLabel = '🚇 지하철+버스';
    else if (subwayCount > 0) typeLabel = '🚇 지하철';

    const routeTags = subPaths
      .filter(sp => sp.trafficType === 1 || sp.trafficType === 2)
      .map(sp => {
        const isSub = sp.trafficType === 1;
        const lineName = isSub ? (sp.lane?.[0]?.name || '지하철') : (sp.lane?.[0]?.busNo || '버스');
        return `<span class="transit-tag ${isSub ? 'subway' : 'bus'}">${lineName}</span>`;
      }).join('<span class="transit-arrow">→</span>');

    const subPathDetails = subPaths.map(sp => {
      if (sp.trafficType === 3) return `<div class="subpath-row"><span class="subpath-icon">🚶</span><span class="subpath-info subpath-walk">도보 ${sp.sectionTime}분</span></div>`;
      if (sp.trafficType === 1) return `<div class="subpath-row"><span class="subpath-icon">🚇</span><span class="subpath-info"><strong>${sp.startName}</strong> 승차 → <strong>${sp.endName}</strong> 하차 (${sp.stationCount}역)</span></div>`;
      if (sp.trafficType === 2) return `<div class="subpath-row"><span class="subpath-icon">🚌</span><span class="subpath-info"><strong>${sp.startName}</strong> 승차 → <strong>${sp.endName}</strong> 하차 (${sp.stationCount}정류장)</span></div>`;
      return '';
    }).join('');

    const card = document.createElement('div');
    card.className = 'transit-card';
    card.innerHTML = `
      <div class="transit-card-header">
        <span class="transit-type">${typeLabel}</span>
        <span class="transit-time">${info.totalTime}분</span>
      </div>
      <div class="transit-route">${routeTags || '<span style="color:var(--text3);font-size:12px">경로 정보 없음</span>'}</div>
      <div class="transit-card-footer">
        <span>🚶 도보 ${Math.round(info.totalWalk / 60)}분</span>
        ${subwayCount > 0 ? `<span>🚇 지하철 ${subwayCount}회</span>` : ''}
        ${busCount > 0 ? `<span>🚌 버스 ${busCount}회</span>` : ''}
      </div>
      <div class="transit-subpath">${subPathDetails}</div>`;

    card.addEventListener('click', () => {
      document.querySelectorAll('.transit-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      drawPathOnMap(subPaths, colors[idx % colors.length]);
    });
    container.appendChild(card);
  });

  if (paths.length > 0) {
    drawPathOnMap(paths[0].subPath || [], colors[0]);
    container.querySelectorAll('.transit-card')[0]?.classList.add('selected');
  }
}

function drawPathOnMap(subPaths, color) {
  if (!naverMap) return;
  currentPolylines.forEach(p => p.setMap(null));
  currentPolylines = [];

  const allCoords = [];
  subPaths.forEach(sp => {
    const stops = sp.passStopList?.stations || [];
    const coords = stops.filter(s => s.x && s.y).map(s => new naver.maps.LatLng(parseFloat(s.y), parseFloat(s.x)));
    if (coords.length >= 2) {
      const poly = new naver.maps.Polyline({
        path: coords,
        strokeColor: sp.trafficType === 1 ? '#4a90d9' : color,
        strokeWeight: sp.trafficType === 1 ? 5 : 4,
        strokeOpacity: 0.85,
        strokeStyle: sp.trafficType === 3 ? 'shortdash' : 'solid',
        map: naverMap,
      });
      currentPolylines.push(poly);
      allCoords.push(...coords);
    }
  });

  if (allCoords.length > 0) {
    const bounds = new naver.maps.LatLngBounds();
    allCoords.forEach(c => bounds.extend(c));
    naverMap.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
  }
}

/* ===== 장거리 교통 ===== */
function showLongDistance(start, dest, container) {
  const destName  = dest.displayName || dest.name;
  const startName = start?.name || '';

  const naverTransitUrl = `https://map.naver.com/v5/directions/-/${encodeURIComponent(startName)}/-/${encodeURIComponent(destName)}/-/transit`;
  const naverCarUrl     = `https://map.naver.com/v5/directions/-/${encodeURIComponent(startName)}/-/${encodeURIComponent(destName)}/-/car`;

  container.innerHTML = `
    <div class="transit-long-distance">
      <div class="transit-ld-title">🗺️ ${destName}(으)로 가는 방법</div>
      <div class="transit-ld-sub">${startName ? `<strong>${startName}</strong> → <strong>${destName}</strong>` : '출발지를 입력하면 자동으로 경로가 적용됩니다'}</div>

      <div class="transit-ld-section-title">🗺️ 통합 경로 검색</div>
      <div class="transit-ld-links" style="margin-bottom:12px">
        <a class="transit-link-btn" style="background:linear-gradient(135deg,#03c75a,#028a3e)"
           href="${naverTransitUrl}" target="_blank">🚇 네이버맵 대중교통 경로</a>
        <a class="transit-link-btn" style="background:linear-gradient(135deg,#ff6b35,#e85d04)"
           href="${naverCarUrl}" target="_blank">🚗 네이버맵 자가용 경로</a>
      </div>

      <div class="transit-ld-section-title">🎫 직접 예매</div>
      <div class="transit-ld-links">
        <a class="transit-link-btn train"     href="https://www.korail.com/ticket/main.do" target="_blank">🚄 코레일 기차 예매</a>
        <a class="transit-link-btn express"   href="https://www.srt.co.kr"                target="_blank">🚅 SRT 고속열차</a>
        <a class="transit-link-btn intercity" href="https://www.bustago.or.kr"            target="_blank">🚌 버스타고 시외·고속</a>
        <a class="transit-link-btn flight"    href="https://flight.naver.com"             target="_blank">✈️ 네이버 항공권</a>
      </div>
    </div>`;
}
