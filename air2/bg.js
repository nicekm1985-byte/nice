// ==========================================================================
// bg.js — Air2 배경(3레이어 패럴랙스 우주 배경) 렌더링
// canvas/ctx/W/H는 메인 HTML의 캔버스 초기화 스크립트에서 전역으로 선언되며,
// 이 파일의 함수는 호출 시점에 그 전역을 참조합니다.
// ==========================================================================

// ---- Layer 1: (제거됨) 과거 단일 행성 이미지 배경. 통합 타임라인 에디터(stage_editor.html)로
// 행성/정거장/위성 등을 개별 오브젝트로 배치하는 stage1bg.js가 이를 대체하므로 더 이상 사용하지 않음.

// ---- Layer 2: 우주 먼지(작은 파티클, 여러 모양이 랜덤 섞임, 중간 속도) ----
// 기존에는 고정 상수였으나, 통합 타임라인 에디터(stage_editor.html)의 "레이어별 스크롤 속도" 설정에서
// 값을 덮어쓸 수 있도록 let으로 변경(setStage1ParticleSpeeds 참고).
let BG_LAYER2_SPEED = 400; // px/s (기존 200에서 2배, 에디터에서 범위 더 넓게 조절 가능)
const BG_LAYER2_COUNT = 22; // 드문드문(파티클화하며 개수 소폭 증가)
const BG_LAYER2_SHAPES = ['dot','streak','cross','diamond'];
let bgLayer2Stars = [];
for(let i=0;i<BG_LAYER2_COUNT;i++){
  bgLayer2Stars.push({
    x: Math.random()*W,
    y: Math.random()*H,
    r: 0.5 + Math.random()*0.9, // 기존 1.2~3.0에서 대폭 축소(0.5~1.4)
    shape: BG_LAYER2_SHAPES[Math.floor(Math.random()*BG_LAYER2_SHAPES.length)],
    rot: Math.random()*Math.PI*2,
    twinkleSeed: Math.random()*Math.PI*2
  });
}

function drawDustParticle(s, r, alphaGlow, alphaCore, stretch){
  ctx.save();
  ctx.translate(s.x, s.y);
  // stretch: 1(평상시, 원래 모양) ~ 그 이상(배속이 높을수록 세로로 길게 늘어남, SF 워프 느낌).
  // 늘어나는 동안엔 회전 없이(진행 방향인 세로와 어긋나지 않도록) 하나의 세로 스트릭(선)으로 통일해 그림.
  if(stretch > 1.15){
    ctx.globalAlpha = alphaCore;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(0.8, r * 0.9);
    ctx.lineCap = 'round';
    const half = r * 2 * stretch;
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.rotate(s.rot);
  if(s.shape === 'dot'){
    ctx.globalAlpha = alphaGlow;
    ctx.fillStyle = '#e6f7ff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = alphaCore;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI*2);
    ctx.fill();
  } else if(s.shape === 'streak'){
    // 짧은 세로 선(빠르게 앞으로 스쳐 지나가는 느낌)
    ctx.globalAlpha = alphaCore;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = r * 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r*2.5);
    ctx.lineTo(0, r*2.5);
    ctx.stroke();
  } else if(s.shape === 'cross'){
    ctx.globalAlpha = alphaCore;
    ctx.strokeStyle = '#dff3ff';
    ctx.lineWidth = r * 0.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r*1.6, 0); ctx.lineTo(r*1.6, 0);
    ctx.moveTo(0, -r*1.6); ctx.lineTo(0, r*1.6);
    ctx.stroke();
  } else { // diamond
    ctx.globalAlpha = alphaCore;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -r*1.8);
    ctx.lineTo(r*1.4, 0);
    ctx.lineTo(0, r*1.8);
    ctx.lineTo(-r*1.4, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawBgLayer2(dt, speedMul, alpha){
  if(alpha === undefined) alpha = 1;
  if(alpha <= 0) return;
  const mul = speedMul || 1;
  const stretch = 1 + Math.max(0, mul - 1) * 0.5; // 배속이 높을수록 세로로 길게 늘어남(모션블러 워프 느낌)
  ctx.save();
  bgLayer2Stars.forEach(s=>{
    s.y += BG_LAYER2_SPEED * mul * dt;
    if(s.y > H + 4){
      s.y = -Math.random()*H*0.5 - 4; // 한 줄로 몰리지 않도록 재배치 y좌표도 랜덤 범위로 분산
      s.x = Math.random()*W; // 위치 랜덤 재배치
      s.shape = BG_LAYER2_SHAPES[Math.floor(Math.random()*BG_LAYER2_SHAPES.length)]; // 모양도 다시 랜덤
      s.rot = Math.random()*Math.PI*2;
    }
    const twinkle = 0.95 + 0.15 * Math.sin(Date.now()/300 + s.twinkleSeed); // 0.95~1.1(더 밝게)
    drawDustParticle(s, s.r, Math.min(1, twinkle * 0.65 * alpha), Math.min(1, twinkle * alpha), stretch);
  });
  ctx.restore();
}

// ---- Layer 3: 작은 파편 조각(여러 모양 랜덤, 가장 위, 매우 빠르게) ----
let BG_LAYER3_SPEED = 1600; // px/s, 매우 빠름 (기존 800에서 2배, 에디터에서 범위 더 넓게 조절 가능)
const BG_LAYER3_COUNT = 14;
const BG_LAYER3_SHAPES = ['shard','dot','streak','cross'];
let bgLayer3Debris = [];
for(let i=0;i<BG_LAYER3_COUNT;i++){
  bgLayer3Debris.push({
    x: Math.random()*W,
    y: Math.random()*H,
    size: 0.8 + Math.random()*1.3, // 기존 2~5에서 대폭 축소(0.8~2.1)
    shape: BG_LAYER3_SHAPES[Math.floor(Math.random()*BG_LAYER3_SHAPES.length)],
    rot: Math.random()*Math.PI*2,
    rotSpeed: (Math.random()-0.5) * 4,
    alpha: 0.4 + Math.random()*0.4
  });
}

function drawBgLayer3(dt, speedMul, alpha){
  if(alpha === undefined) alpha = 1;
  if(alpha <= 0) return;
  const mul = speedMul || 1;
  const stretch = 1 + Math.max(0, mul - 1) * 0.4; // layer2보다 빠른 레이어라 늘어나는 비율은 살짝 낮게(과하게 겹치지 않도록)
  ctx.save();
  bgLayer3Debris.forEach(d=>{
    d.y += BG_LAYER3_SPEED * mul * dt;
    d.rot += d.rotSpeed * dt;
    if(d.y > H + 8){
      d.y = -Math.random()*H*0.5 - 8; // 한 줄로 몰리지 않도록 재배치 y좌표도 랜덤 범위로 분산
      d.x = Math.random()*W; // 위치 랜덤 재배치
      d.shape = BG_LAYER3_SHAPES[Math.floor(Math.random()*BG_LAYER3_SHAPES.length)]; // 모양도 다시 랜덤
    }
    ctx.save();
    ctx.translate(d.x, d.y);
    if(stretch > 1.15){
      // 배속이 높을 때는 파편도 회전 없이 세로 스트릭으로 그려 워프 느낌을 강화
      ctx.globalAlpha = d.alpha * alpha;
      ctx.strokeStyle = '#c7d9ef';
      ctx.lineWidth = Math.max(0.6, d.size * 0.7);
      ctx.lineCap = 'round';
      const half = d.size * 1.6 * stretch;
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(0, half);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.rotate(d.rot);
    ctx.globalAlpha = d.alpha * alpha;
    const s = d.size;
    if(d.shape === 'dot'){
      ctx.fillStyle = '#c7d9ef';
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI*2);
      ctx.fill();
    } else if(d.shape === 'streak'){
      ctx.strokeStyle = '#c7d9ef';
      ctx.lineWidth = Math.max(0.6, s*0.7);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -s*1.8); ctx.lineTo(0, s*1.8);
      ctx.stroke();
    } else if(d.shape === 'cross'){
      ctx.strokeStyle = '#c7d9ef';
      ctx.lineWidth = Math.max(0.5, s*0.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s*1.3, 0); ctx.lineTo(s*1.3, 0);
      ctx.moveTo(0, -s*1.3); ctx.lineTo(0, s*1.3);
      ctx.stroke();
    } else { // shard(기존 파편 조각 모양)
      ctx.fillStyle = '#9fb3c8';
      ctx.beginPath();
      ctx.moveTo(-s, -s*0.6);
      ctx.lineTo(s, -s*0.3);
      ctx.lineTo(s*0.6, s);
      ctx.lineTo(-s*0.7, s*0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  });
  ctx.restore();
}

// ---- Launch Station: 스테이지 시작 시 화면 하단에 배치되는 발사 스테이션 ----
const stationImg = new Image();
stationImg.src = 'assets/bg/station.png';
let stationDrawW = 0, stationDrawH = 0;
// 스테이션 이미지 내 발사 링(원)의 중심 비율 (이미지 기준 x=233/480, y=177.5/351 픽셀 분석값)
const STATION_RING_X_RATIO = 233/480;
const STATION_RING_Y_RATIO = 177.5/351;
let STATION_RING_X = 0, STATION_RING_Y = 0; // 캔버스 좌표 기준 실제 링 중심(발사 시퀀스에서 기체 기준점으로 사용)
stationImg.onload = () => {
  stationDrawW = W;
  stationDrawH = stationImg.naturalHeight * (W / stationImg.naturalWidth);
  // 통합 타임라인 에디터(stage_editor.html)의 "발사대 지점 설정"에서 내보낸 stage1_launch.js가
  // 로드되어 있으면(STAGE1_LAUNCH_CONFIG 전역) 하드코딩된 비율 대신 그 값을 사용.
  const ringXRatio = (typeof STAGE1_LAUNCH_CONFIG !== 'undefined' && STAGE1_LAUNCH_CONFIG.ringXRatio != null) ? STAGE1_LAUNCH_CONFIG.ringXRatio : STATION_RING_X_RATIO;
  const ringYRatio = (typeof STAGE1_LAUNCH_CONFIG !== 'undefined' && STAGE1_LAUNCH_CONFIG.ringYRatio != null) ? STAGE1_LAUNCH_CONFIG.ringYRatio : STATION_RING_Y_RATIO;
  STATION_RING_X = stationDrawW * ringXRatio;
  STATION_RING_Y = (H - stationDrawH) + stationDrawH * ringYRatio;
};
// offsetRatio: 0(제자리)~1(화면 완전히 밖으로) 비율, 스테이션이 아래로 빠져나가는 연출에 사용
function drawStation(offsetRatio){
  if(!stationDrawH) return;
  const offsetPx = (offsetRatio||0) * (stationDrawH + 20); // 완전히 화면 밖으로 나가도록 여유(20px) 포함
  ctx.drawImage(stationImg, 0, H - stationDrawH + offsetPx, stationDrawW, stationDrawH);
}

// 두 레이어(먼지/파편)를 아래→위 순서로 한 번에 그리는 통합 함수 (메인 게임 루프에서 이것만 호출)
// speedMul: layer2(먼지)/layer3(파편) 스크롤 배속. 발사 시퀀스의 dash~descend 구간에서 비행 가속감을 표현하는 데 사용(기본 1배).
// 배속이 1보다 커지면 layer2/3 파티클이 자동으로 세로 스트릭(선)으로 늘어나며 SF 워프 느낌을 냄(별도 레이어 불필요).
// layer1Alpha: (더 이상 사용하지 않음, 과거 단일 행성 이미지용 파라미터. 호출부 호환을 위해 인자는 유지하되 무시함)
// bgAlpha: layer2(먼지)/layer3(파편) 공통 불투명도(0~1, 기본 1). 스테이션이 화면에 있는 sit/grow/hold 구간에는
// 우주 배경 전체(먼지+파편)를 숨기기 위해 0으로, dash에서 스테이션이 퇴장하는 진행률에 맞춰 0->1로 나타남.
function drawStarBackground(dt, speedMul, layer1Alpha, bgAlpha){
  drawBgLayer2(dt, speedMul, bgAlpha);
  drawBgLayer3(dt, speedMul, bgAlpha);
}

// ---- 오브젝트 밝기(brightness) 적용 이미지 캐시 (stage1bg.js / stage2bg.js 공용) ----
// ctx.filter는 Safari에서 canvas에 적용되지 않는 경우가 있어 오프스크린 캔버스로 직접 합성합니다.
// brightness < 1: 스프라이트 모양 안에서만 검정을 덮어 어둡게(source-atop)
// brightness > 1: 같은 이미지를 'lighter'(가산)로 한 번 더 그려 밝게(최대 2배)
// 결과는 (이미지, 밝기)별로 캐시해 매 프레임 재합성하지 않음.
const brightnessImgCache = new Map();
function getBrightnessImage(img, brightness){
  const b = Math.round((brightness == null ? 1 : brightness) * 100) / 100;
  if (b === 1 || !img || !img.naturalWidth) return img;
  const key = img.src + '|' + b;
  let c = brightnessImgCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  if (b < 1) {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 1 - b;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
  } else {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, b - 1);
    g.drawImage(img, 0, 0);
  }
  brightnessImgCache.set(key, c);
  return c;
}
