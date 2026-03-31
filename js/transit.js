const ODSAY_KEY = encodeURIComponent('9vT5b5ryWK0WowAXS953+g');
let kakaoMapInstance = null;
let kakaoLoaded      = false;
let currentMarkers   = [];
let currentPolylines = [];

function initTransitTab(dest) {
  const destLabel = document.getElementById('transitDestLabel');
  if (destLabel) destLabel.textContent = dest.displayName || dest.name;

  loadKakaoMap(() => initMap(dest));

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

function loadKakaoMap(callback) {
  if (!window.kakao || !window.kakao.maps) {
    const mapEl = document.getElementById('kakaoMap');
    if (mapEl) {
      mapEl.style.display = 'flex';
      mapEl.style.alignItems = 'center';
      mapEl.style.justifyContent = 'center';
      mapEl.style.color = '#aaa';
      mapEl.style.fontSize = '14px';
      mapEl.innerHTML = '🗺️ 지도를 불러올 수 없습니다.<br>카카오 개발자 콘솔에서 도메인을 등록해주세요.';
    }
    return;
  }
  kakaoLoaded = true;
  callback();
}

function initMap(dest) {
  const container = document.getElementById('kakaoMap');
  if (!container) return;

  if (kakaoMapInstance) {
    kakaoMapInstance.setCenter(new kakao.maps.LatLng(dest.lat, dest.lon));
    return;
  }

  const options = {
    center: new kakao.maps.LatLng(dest.lat, dest.lon),
    level: 9,
  };
  kakaoMapInstance = new kakao.maps.Map(container, options);

  const marker = new kakao.maps.Marker({
    position: new kakao.maps.LatLng(dest.lat, dest.lon),
    map: kakaoMapInstance,
  });

  const infowindow = new kakao.maps.InfoWindow({
    content: `<div style="padding:6px 10px;font-size:13px;font-weight:700;color:#333;">${dest.displayName || dest.name}</div>`,
  });
  infowindow.open(kakaoMapInstance, marker);
}

function clearMap() {
  currentMarkers.forEach(m => m.setMap(null));
  currentPolylines.forEach(p => p.setMap(null));
  currentMarkers = [];
  currentPolylines = [];
}

async function searchRoute(dest) {
  const input = document.getElementById('departureInput');
  const results = document.getElementById('transitResults');
  const btn = document.getElementById('searchTransitBtn');

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

async function geocodeQuery(query) {
  return new Promise((resolve) => {
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.addressSearch(query, (result, status) => {
      if (status === kakao.maps.services.Status.OK && result.length > 0) {
        resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
      } else {
        geocoder.keywordSearch(query, (kResult, kStatus) => {
          if (kStatus === kakao.maps.services.Status.OK && kResult.length > 0) {
            resolve({ lat: parseFloat(kResult[0].y), lng: parseFloat(kResult[0].x) });
          } else {
            resolve(null);
          }
        });
      }
    });
  });
}

function drawDepartureMarker(coords, label) {
  if (!kakaoMapInstance) return;
  clearMap();

  const pos = new kakao.maps.LatLng(coords.lat, coords.lng);
  const marker = new kakao.maps.Marker({ position: pos, map: kakaoMapInstance });
  const iw = new kakao.maps.InfoWindow({
    content: `<div style="padding:5px 8px;font-size:12px;font-weight:700;color:#333;">🚀 ${label}</div>`,
  });
  iw.open(kakaoMapInstance, marker);
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
    const info       = path.info;
    const subPaths   = path.subPath || [];
    const totalTime  = info.totalTime;
    const totalWalk  = info.totalWalk;
    const busCount   = info.busCount || 0;
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
      if (sp.trafficType === 3) {
        return `<div class="subpath-row"><span class="subpath-icon">🚶</span><span class="subpath-info subpath-walk">도보 ${sp.sectionTime}분</span></div>`;
      } else if (sp.trafficType === 1) {
        return `<div class="subpath-row"><span class="subpath-icon">🚇</span><span class="subpath-info"><strong>${sp.startName}</strong> 승차 → <strong>${sp.endName}</strong> 하차 (${sp.stationCount}역)</span></div>`;
      } else if (sp.trafficType === 2) {
        return `<div class="subpath-row"><span class="subpath-icon">🚌</span><span class="subpath-info"><strong>${sp.startName}</strong> 승차 → <strong>${sp.endName}</strong> 하차 (${sp.stationCount}정류장)</span></div>`;
      }
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
    const firstSubPaths = paths[0].subPath || [];
    drawPathOnMap(firstSubPaths, colors[0]);
    container.querySelectorAll('.transit-card')[0]?.classList.add('selected');
  }
}

function drawPathOnMap(subPaths, color) {
  if (!kakaoMapInstance) return;

  const prevPolylines = currentPolylines.filter(p => p._isRoute);
  prevPolylines.forEach(p => p.setMap(null));
  currentPolylines = currentPolylines.filter(p => !p._isRoute);

  const allPoints = [];

  subPaths.forEach(sp => {
    const passStops = sp.passStopList?.stations || [];
    const points = passStops
      .filter(s => s.x && s.y)
      .map(s => new kakao.maps.LatLng(parseFloat(s.y), parseFloat(s.x)));

    if (points.length >= 2) {
      const poly = new kakao.maps.Polyline({
        path: points,
        strokeWeight: sp.trafficType === 1 ? 5 : 4,
        strokeColor: sp.trafficType === 1 ? '#4a90d9' : color,
        strokeOpacity: 0.85,
        strokeStyle: sp.trafficType === 3 ? 'dashed' : 'solid',
        map: kakaoMapInstance,
      });
      poly._isRoute = true;
      currentPolylines.push(poly);
      allPoints.push(...points);
    }
  });

  if (allPoints.length > 0) {
    const bounds = new kakao.maps.LatLngBounds();
    allPoints.forEach(p => bounds.extend(p));
    kakaoMapInstance.setBounds(bounds);
  }
}

function showLongDistance(dest, container) {
  const name = dest.displayName || dest.name;
  const region = dest.region || '';

  container.innerHTML = `
    <div class="transit-long-distance">
      <div class="transit-ld-title">🗺️ ${name}(으)로 가는 방법</div>
      <div class="transit-ld-sub">대중교통 직결 경로를 찾지 못했어요. 아래 링크로 직접 검색해보세요.</div>
      <div class="transit-ld-links">
        <a class="transit-link-btn train"
           href="https://www.korail.com/ticket/main.do" target="_blank">
          🚄 코레일 기차 예매
        </a>
        <a class="transit-link-btn express"
           href="https://www.srt.co.kr" target="_blank">
          🚅 SRT 고속열차
        </a>
        <a class="transit-link-btn intercity"
           href="https://www.bustago.or.kr" target="_blank">
          🚌 버스타고 시외/고속
        </a>
        <a class="transit-link-btn flight"
           href="https://flight.naver.com/?from=GMP&to=CJU" target="_blank">
          ✈️ 항공권 검색
        </a>
      </div>
    </div>
  `;
}
