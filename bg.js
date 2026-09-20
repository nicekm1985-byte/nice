// ==========================================================================
// bg.js — Air2 배경(3레이어 패럴랙스 우주 배경) 렌더링
// canvas/ctx/W/H는 메인 HTML의 캔버스 초기화 스크립트에서 전역으로 선언되며,
// 이 파일의 함수는 호출 시점에 그 전역을 참조합니다.
// ==========================================================================

// ---- Layer 1: 행성 배경 (가장 아래, 유일 이미지, 반복 없이 한 번만 천천히 위로 스크롤) ----
const bgLayer1Img = new Image();
bgLayer1Img.src = 'assets/bg/layer1_planet_v6.png';
let bgLayer1DrawW = 0, bgLayer1DrawH = 0;
let bgLayer1OffsetY = 0; // 이미지 내부에서 화면 상단에 대응하는 y좌표 (px, 이미지 기준)
const BG_LAYER1_START_RATIO = 1; // 게임 시작 시 보여줄 지점(이미지 상단 기준 비율) — 1이면 이미지 맨 아래부터 시작
const BG_LAYER1_SCROLL_DURATION = 180; // 초(3분)에 걸쳐 시작 지점에서 이미지 맨 위(0)까지 위로 스크롤
let bgLayer1Speed = 0; // px/s, onload 시 duration에 맞춰 계산

bgLayer1Img.onload = () => {
  const imgW = bgLayer1Img.naturalWidth, imgH = bgLayer1Img.naturalHeight;
  bgLayer1DrawW = W;
  bgLayer1DrawH = imgH * (W / imgW); // 캔버스 너비에 맞춘 실제 표시 높이(이미지 전체를 다 사용)

  const maxOffset = Math.max(0, bgLayer1DrawH - H); // 화면 하단이 이미지 맨 아래에 딱 맞는 오프셋(더 내려가면 빈 공간 노출)
  bgLayer1OffsetY = maxOffset * BG_LAYER1_START_RATIO; // 시작 지점
  bgLayer1Speed = bgLayer1OffsetY / BG_LAYER1_SCROLL_DURATION; // px/s, 위로 스크롤(오프셋이 0을 향해 감소)
};

function drawBgLayer1(dt){
  if(!bgLayer1DrawH) return;
  bgLayer1OffsetY = Math.max(0, bgLayer1OffsetY - bgLayer1Speed * dt);
  ctx.drawImage(bgLayer1Img, 0, -bgLayer1OffsetY, bgLayer1DrawW, bgLayer1DrawH);
}

// ---- Layer 2: 밝은 별 (드문드문, 중간 속도) ----
const BG_LAYER2_SPEED = 45; // px/s
const BG_LAYER2_COUNT = 18; // 드문드문
let bgLayer2Stars = [];
for(let i=0;i<BG_LAYER2_COUNT;i++){
  bgLayer2Stars.push({
    x: Math.random()*W,
    y: Math.random()*H,
    r: 1.2 + Math.random()*1.8,
    twinkleSeed: Math.random()*Math.PI*2
  });
}

function drawBgLayer2(dt){
  ctx.save();
  bgLayer2Stars.forEach(s=>{
    s.y += BG_LAYER2_SPEED * dt;
    if(s.y > H + 4){
      s.y = -4;
      s.x = Math.random()*W;
    }
    const twinkle = 0.8 + 0.2 * Math.sin(Date.now()/300 + s.twinkleSeed);
    ctx.globalAlpha = twinkle;
    ctx.shadowColor = '#e6f7ff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.restore();
}

// ---- Layer 3: 작은 파편 조각 (가장 위, 매우 빠르게) ----
const BG_LAYER3_SPEED = 420; // px/s, 매우 빠름
const BG_LAYER3_COUNT = 14;
let bgLayer3Debris = [];
for(let i=0;i<BG_LAYER3_COUNT;i++){
  bgLayer3Debris.push({
    x: Math.random()*W,
    y: Math.random()*H,
    size: 2 + Math.random()*3,
    rot: Math.random()*Math.PI*2,
    rotSpeed: (Math.random()-0.5) * 4,
    alpha: 0.4 + Math.random()*0.4
  });
}

function drawBgLayer3(dt){
  ctx.save();
  bgLayer3Debris.forEach(d=>{
    d.y += BG_LAYER3_SPEED * dt;
    d.rot += d.rotSpeed * dt;
    if(d.y > H + 8){
      d.y = -8;
      d.x = Math.random()*W;
    }
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.globalAlpha = d.alpha;
    ctx.fillStyle = '#9fb3c8';
    ctx.beginPath();
    ctx.moveTo(-d.size, -d.size*0.6);
    ctx.lineTo(d.size, -d.size*0.3);
    ctx.lineTo(d.size*0.6, d.size);
    ctx.lineTo(-d.size*0.7, d.size*0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

// 세 레이어를 아래→위 순서로 한 번에 그리는 통합 함수 (메인 게임 루프에서 이것만 호출)
function drawStarBackground(dt){
  drawBgLayer1(dt);
  drawBgLayer2(dt);
  drawBgLayer3(dt);
}
