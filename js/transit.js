const ODSAY_KEY = encodeURIComponent('9vT5b5ryWK0WowAXS953+g');
let leafletMap     = null;
let currentMarkers = [];
let currentLayers  = [];

function initTransitTab(dest) {
  const destLabel = document.getElementById('transitDestLabel');
  if (destLabel) destLabel.textContent = dest.displayName || dest.name;

  initLeafletMap(dest);

  const btn = document.getElementById('searchTransitBtn');
  if (btn) {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => searchRoute(dest));
  }

  document.getElementById('departureInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchRoute(dest);
  });
}

function initLeafletMap(dest) {
  const container = document.getElementById('kakaoMap');
  if (!container) return;

  if (leafletMap) {
    leafletMap.setView([dest.lat, dest.lon], 9);
    return;
  }

  leafletMap = L.map('kakaoMap').setView([dest.lat, dest.lon], 9);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(leafletMap);

  const destIcon = L.divIcon({
    html: `<div style="background:#ff6b35;color:#fff;border-radius:50% 50% 50% 0;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4)"><span style="transform:rotate(45deg)">🏁</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    className: '',
  });

  L.marker([dest.lat, dest.lon], { icon: destIcon })
    .addTo(leafletMap)
    .bindPopup(`<strong>${dest.displayName || dest.name}</strong>`)
    .openPopup();
}

function clearMapLayers() {
  currentMarkers.forEach(m => leafletMap?.removeLayer(m));
  currentLayers.forEach(l => leafletMap?.removeLayer(l));
  currentMarkers = [];
  currentLayers  = [];
}

async function searchRoute(dest) {
  const input   = document.getElementById('departureInput');
  const results = document.getElementById('transitResults');
  const btn     = document.getElementById('searchTransitBtn');

  const query = input?.value.trim();
  if (!query) {
    results.innerHTML = '<div class="transit-hint">출발지를 입력해주세요</div>';
    return;
  }

  results.innerHTML = `<div class="transit-loading"><div class="loading-spinner"></div><p>경로 탐색 중...</p></div>`;
  if (btn) btn.disabled = true;

  try {
    const coords = await geocodeQuery(query);
    if (!coords) {
      results.innerHTML = '<div class="transit-empty">⚠️ 출발지를 찾을 수 없어요. 더 구체적으로 입력해보세요.</div>';
      return;
    }

    drawDepartureMarker(coords, query);

    const paths = await searchODsay(coords.lng, coords.lat, dest.lon, dest.lat);
    if (!paths || paths.length === 0) {
      showLongDistance(dest, results);
      return;
    }

    renderTransitPaths(paths, results);
  } catch (err) {
    console.error('경로 탐색 오류:', err);
    showLongDistance(dest, results);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* Nominatim (OpenStreetMap) 지오코딩 — API 키 불필요 */
async function geocodeQuery(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' 한국')}&format=json&limit=1&accept-language=ko`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'ko' } });
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

function drawDepartureMarker(coords, label) {
  if (!leafletMap) return;
  clearMapLayers();

  const startIcon = L.divIcon({
    html: `<div style="background:#7fb3f5;color:#fff;border-radius:50% 50% 50% 0;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4)"><span style="transform:rotate(45deg)">🚀</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    className: '',
  });

  const marker = L.marker([coords.lat, coords.lng], { icon: startIcon })
    .addTo(leafletMap)
    .bindPopup(`<strong>🚀 ${label}</strong>`)
    .openPopup();

  currentMarkers.push(marker);
}

async function searchODsay(startX, startY, endX, endY) {
  const url = `/odsay/v1/api/searchPubTransPathT?apiKey=${ODSAY_KEY}&SX=${startX}&SY=${startY}&EX=${endX}&EY=${endY}&SearchType=0&SearchPathType=0`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.result?.path) return data.result.path;
    return null;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') console.warn('ODsay 타임아웃');
    return null;
  }
}

function renderTransitPaths(paths, container) {
  const colors = ['#ff6b35', '#7fb3f5', '#6de0a0', '#ffb347', '#e879f9'];

  container.innerHTML = `<div class="transit-results-title">🚌 대중교통 경로 ${paths.length}개</div>`;

  paths.slice(0, 5).forEach((path, idx) => {
    const info        = path.info;
    const subPaths    = path.subPath || [];
    const totalTime   = info.totalTime;
    const totalWalk   = info.totalWalk;
    const busCount    = info.busCount || 0;
    const subwayCount = info.subwayCount || 0;

    let typeLabel = '🚌 버스';
    if (subwayCount > 0 && busCount > 0) typeLabel = '🚇 지하철+버스';
    else if (subwayCount > 0) typeLabel = '🚇 지하철';

    const routeTags = subPaths
      .filter(sp => sp.trafficType === 1 || sp.trafficType === 2)
      .map(sp => {
        const isSub    = sp.trafficType === 1;
        const lineName = isSub ? (sp.lane?.[0]?.name || '지하철') : (sp.lane?.[0]?.busNo || '버스');
        return `<span class="transit-tag ${isSub ? 'subway' : 'bus'}">${lineName}</span>`;
      }).join('<span class="transit-arrow">→</span>');

    const subPathDetails = subPaths.map(sp => {
      if (sp.trafficType === 3)
        return `<div class="subpath-row"><span class="subpath-icon">🚶</span><span class="subpath-info subpath-walk">도보 ${sp.sectionTime}분</span></div>`;
      if (sp.trafficType === 1)
        return `<div class="subpath-row"><span class="subpath-icon">🚇</span><span class="subpath-info"><strong>${sp.startName}</strong> 승차 → <strong>${sp.endName}</strong> 하차 (${sp.stationCount}역)</span></div>`;
      if (sp.trafficType === 2)
        return `<div class="subpath-row"><span class="subpath-icon">🚌</span><span class="subpath-info"><strong>${sp.startName}</strong> 승차 → <strong>${sp.endName}</strong> 하차 (${sp.stationCount}정류장)</span></div>`;
      return '';
    }).join('');

    const card = document.createElement('div');
    card.className = 'transit-card';
    card.innerHTML = `
      <div class="transit-card-header">
        <span class="transit-type">${typeLabel}</span>
        <span class="transit-time">${totalTime}분</span>
      </div>
      <div class="transit-route">${routeTags || '<span style="color:var(--text3);font-size:12px">경로 정보 없음</span>'}</div>
      <div class="transit-card-footer">
        <span>🚶 도보 ${Math.round(totalWalk / 60)}분</span>
        ${subwayCount > 0 ? `<span>🚇 지하철 ${subwayCount}회</span>` : ''}
        ${busCount > 0 ? `<span>🚌 버스 ${busCount}회</span>` : ''}
      </div>
      <div class="transit-subpath">${subPathDetails}</div>
    `;

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
  if (!leafletMap) return;

  currentLayers.forEach(l => leafletMap.removeLayer(l));
  currentLayers = [];

  const allLatLngs = [];

  subPaths.forEach(sp => {
    const stops  = sp.passStopList?.stations || [];
    const latlngs = stops
      .filter(s => s.x && s.y)
      .map(s => [parseFloat(s.y), parseFloat(s.x)]);

    if (latlngs.length >= 2) {
      const lineColor  = sp.trafficType === 1 ? '#4a90d9' : color;
      const dashArray  = sp.trafficType === 3 ? '6, 8' : null;
      const weight     = sp.trafficType === 1 ? 5 : 4;

      const poly = L.polyline(latlngs, {
        color: lineColor,
        weight,
        opacity: 0.85,
        dashArray,
      }).addTo(leafletMap);

      currentLayers.push(poly);
      allLatLngs.push(...latlngs);
    }
  });

  if (allLatLngs.length > 0) {
    leafletMap.fitBounds(L.latLngBounds(allLatLngs), { padding: [30, 30] });
  }
}

function showLongDistance(dest, container) {
  const name = dest.displayName || dest.name;

  container.innerHTML = `
    <div class="transit-long-distance">
      <div class="transit-ld-title">🗺️ ${name}(으)로 가는 방법</div>
      <div class="transit-ld-sub">대중교통 직결 경로를 찾지 못했어요. 아래 링크로 직접 검색해보세요.</div>
      <div class="transit-ld-links">
        <a class="transit-link-btn train" href="https://www.korail.com/ticket/main.do" target="_blank">🚄 코레일 기차 예매</a>
        <a class="transit-link-btn express" href="https://www.srt.co.kr" target="_blank">🚅 SRT 고속열차</a>
        <a class="transit-link-btn intercity" href="https://www.bustago.or.kr" target="_blank">🚌 버스타고 시외/고속</a>
        <a class="transit-link-btn flight" href="https://flight.naver.com/?from=GMP&to=CJU" target="_blank">✈️ 항공권 검색</a>
      </div>
    </div>
  `;
}
