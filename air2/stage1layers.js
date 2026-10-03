// ==========================================================================
// stage1layers.js — 스테이지1 레이어 배경 공용 렌더러
// 게임(index.html)과 에디터(stage_editor.html)가 이 파일의 같은 함수로 그리므로 미리보기 = 실제 게임 화면.
//
// 레이어 = { id, name, kind, speed(px/s), brightness(1=원본, 0.2~2), opacity(0~1), visible, warp, ...종류별 설정 }
//   kind: stars(별) / sparkle(반짝이는 작은 입자) / objects(오브젝트) / dust(우주 먼지) / debris(빠른 파편)
//   레이어 배열 순서 = 그리기 순서(0번이 가장 뒤, 마지막이 화면 가장 앞).
//   오브젝트의 속도/밝기/불투명도 = 레이어 값 × 오브젝트 개별 값(speedMul/brightness/opacity).
//   speedMul이 다른 오브젝트는 루프 길이도 같은 비율(loopH × speedMul)이라 한 바퀴 주기는 레이어와 동일.
// 호출 시점에 전역 ctx/W/H와 getBrightnessImage()(게임: bg.js, 에디터: 인라인 스크립트)를 참조함.
// '_'로 시작하는 필드(_rt, _scroll)는 실행 중 상태라 저장/내보내기에서 제외(s1lClean).
// ==========================================================================

const S1L_KINDS = {
  stars:   { label: '별',          icon: '✨' },
  sparkle: { label: '반짝이 입자', icon: '💫' },
  objects: { label: '오브젝트',    icon: '🪐' },
  dust:    { label: '우주 먼지',   icon: '🌫' },
  debris:  { label: '빠른 파편',   icon: '💨' }
};
const S1L_STAR_SHAPES = ['dot', 'cross', 'diamond', 'sparkle'];

function s1lNewLayer(kind, props){
  const layer = { name: S1L_KINDS[kind].label, kind, speed: 90, brightness: 1, opacity: 1, visible: true, warp: false };
  if(kind === 'stars')   Object.assign(layer, { speed: 60, count: 60, minSize: 0.6, maxSize: 1.4, shapes: S1L_STAR_SHAPES.slice(), particles: [] });
  if(kind === 'sparkle') Object.assign(layer, { speed: 45, count: 20, minSize: 0.8, maxSize: 1.8, twinkleSpeed: 1, color: '#bfe8ff', particles: [] });
  if(kind === 'dust')    Object.assign(layer, { speed: 400, count: 22, warp: true });
  if(kind === 'debris')  Object.assign(layer, { speed: 1600, count: 14, warp: true });
  return Object.assign(layer, props || {});
}

// 실행 중 상태(_로 시작) 제외한 복사본
function s1lClean(layer){
  const out = {};
  Object.keys(layer).forEach(k => { if(k[0] !== '_') out[k] = layer[k]; });
  return out;
}

// 오브젝트 레이어는 속도 0이면 위치 계산이 불가능하므로 최소 5px/s
function s1lSpeed(layer){
  return layer.kind === 'objects' ? Math.max(5, layer.speed || 0) : (layer.speed || 0);
}

// 레이어 한 바퀴(루프) 높이(px). 오브젝트 레이어는 타임라인 길이(초)마다 정확히 한 바퀴,
// 입자 레이어는 화면보다 짧아지지 않게 최소 H+40.
function s1lLoopH(layer, durSec){
  const len = s1lSpeed(layer) * durSec;
  return layer.kind === 'objects' ? Math.max(1, len) : Math.max(H + 40, len);
}

// 별/반짝이 입자 배치를 개수·크기·모양 설정대로 새로 뿌림(y는 0~1 정규화 → 루프 높이가 바뀌어도 유지)
function s1lGenerateParticles(layer){
  const n = Math.max(0, layer.count | 0);
  const lo = Math.min(layer.minSize, layer.maxSize), hi = Math.max(layer.minSize, layer.maxSize);
  const shapes = (layer.shapes && layer.shapes.length) ? layer.shapes : ['dot'];
  const r = (v, d) => Math.round(v * d) / d;
  layer.particles = [];
  for(let i = 0; i < n; i++){
    layer.particles.push({
      x: r(Math.random() * W, 10), yn: r(Math.random(), 10000),
      size: r(lo + Math.random() * (hi - lo), 100),
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      alpha: r(0.5 + Math.random() * 0.5, 100), seed: r(Math.random() * Math.PI * 2, 100)
    });
  }
}

// 밝기 적용: 1 이하면 투명도로 어둡게, 1 초과분은 'lighter'(가산)로 한 번 더 그려 밝게
function s1lWithBrightness(alpha, brightness, draw){
  const b = brightness == null ? 1 : brightness;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha * Math.min(1, b)));
  draw();
  if(b > 1){
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha * (b - 1)));
    draw();
    ctx.globalCompositeOperation = 'source-over';
  }
}

function s1lStretch(layer, speedMul, warpAll){
  if(!layer.warp && !warpAll) return 1;
  return 1 + Math.max(0, (speedMul || 1) - 1) * (layer.kind === 'debris' ? 0.4 : 0.5);
}

// 원점 기준 별 모양 하나(호출 전 translate)
function s1lStarShape(shape, r){
  if(shape === 'dot'){
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  } else if(shape === 'cross'){
    ctx.lineWidth = Math.max(0.5, r * 0.4); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 1.4, 0); ctx.lineTo(r * 1.4, 0); ctx.moveTo(0, -r * 1.4); ctx.lineTo(0, r * 1.4); ctx.stroke();
  } else if(shape === 'diamond'){
    ctx.beginPath(); ctx.moveTo(0, -r * 1.4); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.4); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill();
  } else { // sparkle
    ctx.lineWidth = Math.max(0.4, r * 0.25); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 2.2, 0); ctx.lineTo(r * 2.2, 0); ctx.moveTo(0, -r * 2.2); ctx.lineTo(0, r * 2.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill();
  }
}

function s1lVertStreak(len, width){
  ctx.lineWidth = Math.max(0.6, width); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(0, len); ctx.stroke();
}

// ---- 별 / 반짝이 입자 (배치 데이터 기반, 루프 스크롤) ----
function s1lDrawParticles(layer, env){
  const ps = layer.particles;
  if(!ps || !ps.length) return;
  const L = env.loopH, now = Date.now() / 1000;
  const stretch = s1lStretch(layer, env.speedMul, env.warpAll), streak = stretch > 1.15;
  const sparkle = layer.kind === 'sparkle';
  const base = env.alpha * (layer.opacity == null ? 1 : layer.opacity);
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = sparkle ? (layer.color || '#bfe8ff') : '#ffffff';
  for(const p of ps){
    let sy = (p.yn * L + env.scrollPx) % L;
    if(sy < 0) sy += L;
    if(sy > L - 20) sy -= L;
    if(sy > H + 20) continue;
    let a = p.alpha, r = p.size;
    if(sparkle){
      // 대부분 은은하게 있다가 짧게 반짝: sin^6 펄스
      const f = Math.pow(Math.max(0, Math.sin(now * 2.2 * (layer.twinkleSpeed || 1) + p.seed)), 6);
      a *= 0.12 + 0.88 * f;
      r *= 0.7 + 0.6 * f;
    } else {
      a *= 0.55 + 0.45 * Math.sin(now * 2.5 + p.seed);
    }
    ctx.save();
    ctx.translate(p.x, sy);
    s1lWithBrightness(base * a, layer.brightness, () => {
      if(streak) s1lVertStreak(r * 2 * stretch, r * 0.9);
      else if(sparkle){
        ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = Math.max(0.4, r * 0.35); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-r * 2.6, 0); ctx.lineTo(r * 2.6, 0); ctx.moveTo(0, -r * 2.6); ctx.lineTo(0, r * 2.6); ctx.stroke();
      } else s1lStarShape(p.shape, r);
    });
    ctx.restore();
  }
  ctx.restore();
}

// ---- 우주 먼지 / 빠른 파편 (화면 단위 재활용 입자, 기존 bg.js layer2/3와 동일한 모양) ----
function s1lSpawnFlake(layer, y){
  const dust = layer.kind === 'dust';
  const shapes = dust ? ['dot', 'streak', 'cross', 'diamond'] : ['shard', 'dot', 'streak', 'cross'];
  return {
    x: Math.random() * W, y,
    r: dust ? 0.5 + Math.random() * 0.9 : 0.8 + Math.random() * 1.3,
    shape: shapes[Math.floor(Math.random() * shapes.length)],
    rot: Math.random() * Math.PI * 2, rotSpeed: dust ? 0 : (Math.random() - 0.5) * 4,
    alpha: dust ? 1 : 0.4 + Math.random() * 0.4, seed: Math.random() * Math.PI * 2
  };
}

function s1lDrawFlakes(layer, env){
  const n = Math.max(0, layer.count | 0);
  if(!layer._rt) layer._rt = [];
  const rt = layer._rt;
  while(rt.length < n) rt.push(s1lSpawnFlake(layer, Math.random() * H));
  if(rt.length > n) rt.length = n;
  const dust = layer.kind === 'dust';
  const stretch = s1lStretch(layer, env.speedMul, env.warpAll), streak = stretch > 1.15;
  const base = env.alpha * (layer.opacity == null ? 1 : layer.opacity);
  const move = layer.speed * (env.speedMul || 1) * (env.dt || 0);
  ctx.save();
  for(let i = 0; i < rt.length; i++){
    const f = rt[i];
    f.y += move;
    f.rot += f.rotSpeed * (env.dt || 0);
    if(f.y > H + 8){
      rt[i] = s1lSpawnFlake(layer, -Math.random() * H * 0.5 - 8);
      continue;
    }
    ctx.save();
    ctx.translate(f.x, f.y);
    const tw = dust ? 0.95 + 0.15 * Math.sin(Date.now() / 300 + f.seed) : 1;
    const r = f.r;
    ctx.fillStyle = ctx.strokeStyle = dust ? '#ffffff' : '#c7d9ef';
    if(streak){
      s1lWithBrightness(base * f.alpha * tw, layer.brightness, () => s1lVertStreak(r * (dust ? 2 : 1.6) * stretch, r * (dust ? 0.9 : 0.7)));
    } else {
      ctx.rotate(f.rot);
      s1lWithBrightness(base * f.alpha * tw, layer.brightness, () => {
        if(f.shape === 'dot'){
          if(dust){
            ctx.save(); ctx.globalAlpha *= 0.65; ctx.fillStyle = '#e6f7ff';
            ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          }
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        } else if(f.shape === 'streak'){
          s1lVertStreak(r * (dust ? 2.5 : 1.8), r * (dust ? 0.8 : 0.7));
        } else if(f.shape === 'cross'){
          const k = dust ? 1.6 : 1.3;
          ctx.lineWidth = Math.max(0.5, r * (dust ? 0.6 : 0.5)); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-r * k, 0); ctx.lineTo(r * k, 0); ctx.moveTo(0, -r * k); ctx.lineTo(0, r * k); ctx.stroke();
        } else if(f.shape === 'diamond'){
          ctx.beginPath(); ctx.moveTo(0, -r * 1.8); ctx.lineTo(r * 1.4, 0); ctx.lineTo(0, r * 1.8); ctx.lineTo(-r * 1.4, 0); ctx.closePath(); ctx.fill();
        } else { // shard
          ctx.fillStyle = '#9fb3c8';
          ctx.beginPath(); ctx.moveTo(-r, -r * 0.6); ctx.lineTo(r, -r * 0.3); ctx.lineTo(r * 0.6, r); ctx.lineTo(-r * 0.7, r * 0.5); ctx.closePath(); ctx.fill();
        }
      });
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---- 오브젝트 (o.y = 레이어 루프 안의 월드 y, 화면 y = (o.y + scrollPx) % loopH) ----
function s1lDrawObjects(layer, env){
  const list = (env.objects || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  if(!list.length) return;
  const L = env.loopH, lb = layer.brightness == null ? 1 : layer.brightness;
  const la = env.alpha * (layer.opacity == null ? 1 : layer.opacity);
  const now = Date.now() / 1000;
  for(const o of list){
    if(env.only && !env.only.has(o)) continue; // 보스전: 이미 화면에 나와 있던 오브젝트만
    const img = env.imgs[o.type];
    if(!img || !img.complete || !img.naturalWidth) continue;
    const sc = (o.scale || 1) * (env.baseScale || 1), w = img.width * sc, h = img.height * sc;
    const seed = o.motionSeed || 0;
    const fy = (o.floatAmp || 0) * Math.sin(now * (o.floatSpeed || 1) + seed);
    const fx = (o.swayAmp || 0) * Math.sin(now * (o.swaySpeed || 1) * 0.8 + seed + 1.7);
    const m = o.speedMul > 0 ? o.speedMul : 1, Lo = L * m; // 개별 속도 배율: 스크롤과 루프를 같은 비율로
    let sy = (o.y + env.scrollPx * m) % Lo;
    if(sy < 0) sy += Lo;
    const pic = getBrightnessImage(img, Math.min(2, lb * (o.brightness == null ? 1 : o.brightness)));
    for(const yy of [sy - Lo, sy, sy + Lo]){
      if(yy + h < -80 || yy - h > H + 80) continue;
      ctx.save();
      ctx.globalAlpha = la * (o.opacity == null ? 1 : o.opacity);
      ctx.translate(o.x + fx, yy + fy);
      ctx.rotate((o.rot || 0) * Math.PI / 180);
      ctx.drawImage(pic, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
}

// env: { scrollPx, loopH, alpha(0~1), dt(초), speedMul, objects(오브젝트 레이어용, y 포함), imgs, baseScale }
// 게임/에디터 공통: 레이어 종류별로 어떤 알파 그룹에 속하는지(발사 연출 중 오브젝트만 숨기는 등)
function s1lAlphaGroup(layer){
  if(layer.kind === 'objects') return 'objects';
  if(layer.kind === 'dust' || layer.kind === 'debris') return 'flakes';
  return 'stars';
}
function s1lDrawLayer(layer, env){
  if(!layer.visible || env.alpha <= 0) return;
  if(layer.kind === 'objects') s1lDrawObjects(layer, env);
  else if(layer.kind === 'dust' || layer.kind === 'debris') s1lDrawFlakes(layer, env);
  else s1lDrawParticles(layer, env);
}

// 기본 6개 레이어(뒤 → 앞). 데이터가 없을 때와 구버전 변환 시 공통 뼈대.
function s1lDefaultLayers(){
  return [
    s1lNewLayer('stars',   { id: 1, name: '먼 별', speed: 40, brightness: 0.8 }),
    s1lNewLayer('sparkle', { id: 2, name: '반짝이 입자' }),
    s1lNewLayer('dust',    { id: 3 }),
    s1lNewLayer('debris',  { id: 4 }),
    s1lNewLayer('objects', { id: 5, name: '행성 오브젝트', speed: 90, objects: [] }),
    s1lNewLayer('objects', { id: 6, name: '잔해 오브젝트', speed: 140, objects: [] })
  ];
}

// 구버전 stage1_layout.js(objects[y], loopHeight, scrollSpeed, dustSpeed, debrisSpeed, starLayers[]) → 기본 6개 레이어.
// 속도·오브젝트 배치를 그대로 옮기고 그리기 순서(먼지 → 파편 → 오브젝트, 별빛은 기존 z 기준 앞/뒤)를 유지해
// 게임 화면이 달라지지 않게 함. 반환값 durSec = loopHeight / scrollSpeed (오브젝트 레이어 한 바퀴 시간).
function s1lFromLegacy(data){
  const sp = data.scrollSpeed || 90, L = data.loopHeight || 3700;
  const layers = s1lDefaultLayers();
  const byName = n => layers.find(l => l.name === n);
  byName('우주 먼지').speed = data.dustSpeed != null ? data.dustSpeed : 400;
  byName('빠른 파편').speed = data.debrisSpeed != null ? data.debrisSpeed : 1600;
  const planets = byName('행성 오브젝트');
  planets.speed = sp;
  planets.objects = (data.objects || []).map(o => Object.assign({}, o));
  const maxObjZ = Math.max(-Infinity, ...planets.objects.map(o => o.z || 0));
  let nextId = 7;
  (data.starLayers || []).filter(sl => sl.stars && sl.stars.length).forEach((sl, i) => {
    const layer = s1lNewLayer('stars', {
      id: nextId++, name: '별 ' + (i + 1), speed: sl.speed != null ? sl.speed : 90, count: sl.stars.length,
      minSize: sl.minSize != null ? sl.minSize : 0.6, maxSize: sl.maxSize != null ? sl.maxSize : 1.4,
      shapes: (sl.shapes && sl.shapes.length) ? sl.shapes.slice() : S1L_STAR_SHAPES.slice(),
      particles: sl.stars.map(st => ({
        x: st.x, yn: (((st.y % L) + L) % L) / L, size: st.size, shape: st.shape,
        alpha: st.alpha != null ? st.alpha : 1, seed: st.twinkleSeed || 0
      }))
    });
    // 기존 z가 모든 오브젝트보다 크면 오브젝트 앞, 아니면 맨 뒤
    if((sl.z || 0) > maxObjZ) layers.splice(layers.indexOf(planets) + 1, 0, layer);
    else layers.unshift(layer);
  });
  layers.forEach(l => { if((l.kind === 'stars' || l.kind === 'sparkle') && !l.particles.length) l.count = 0; });
  return { layers, durSec: L / sp };
}
