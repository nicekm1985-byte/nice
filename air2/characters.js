// ==========================================================================
// characters.js — Air2 주인공/적 캐릭터 데이터 및 로직
// (에셋 로딩, 스탯, 스폰 함수, 발사 패턴, 그리기, 폭발 이펙트)
// canvas/ctx/W/H, enemies, bullets, playerBullets 등은 메인 HTML의 게임 루프
// 스크립트에서 전역으로 선언되며, 이 파일의 함수들은 호출 시점에 그 전역을
// 참조합니다. (같은 문서 내 <script> 태그는 top-level 스코프를 공유)
// ==========================================================================

// ---- 에셋 로딩 ----
const assets = {};
const assetList = {
  player: 'assets/optimized/player_sm.png',
  normal1: 'assets/optimized/normal1_sm.png',
  normal2: 'assets/optimized/normal2_sm.png',
  normal3: 'assets/optimized/normal3_sm.png',
  normal4: 'assets/optimized/normal4_sm.png', // 일반5(역방향)도 동일 에셋 공유
  normal6: 'assets/optimized/normal6_sm.png',
  normal7: 'assets/optimized/normal7_sm.png',
  normal8: 'assets/optimized/normal8_sm.png' // 바람개비 UFO, 나선형(spiral) 탄막
};
Object.entries(assetList).forEach(([key, src])=>{
  const img = new Image();
  img.src = src;
  assets[key] = img;
});

// 주인공 기체 애니메이션: player.png/player2.png 2프레임을 실제 시간 기반으로 교차 표시
// (보스1 불꽃 애니메이션과 동일한 방식, 프레임 카운트가 아닌 Date.now() 기준)
const playerFrames = ['assets/optimized/player_sm.png', 'assets/optimized/player2_sm.png'].map(src=>{
  const img = new Image();
  img.src = src;
  return img;
});
const PLAYER_FRAME_INTERVAL_MS = 80; // ms, 프레임 전환 간격

// 보스1 (외계 문명 중형 기체, 불꽃 길이가 다른 2프레임을 교차 표시해 애니메이션 효과)
const bossFrames = ['assets/optimized/boss1_sm.png', 'assets/optimized/boss1_longflame_sm.png'].map(src=>{
  const img = new Image();
  img.src = src;
  return img;
});

// 보스2 (스테이지2 전용, 거미형 기계. 좌/우 다리가 반대 위상으로 번갈아 움직이는 4프레임 보행 애니메이션,
// 몸체는 4프레임 모두 고정이고 다리만 움직임. 이동 중에만 애니메이션 진행, 정지(발사) 중에는 프레임 고정)
const boss2Frames = ['assets/optimized/boss2_frame0_sm.png','assets/optimized/boss2_frame1_sm.png',
  'assets/optimized/boss2_frame2_sm.png','assets/optimized/boss2_frame3_sm.png'].map(src=>{
  const img = new Image();
  img.src = src;
  return img;
});
const BOSS2_FRAME_INTERVAL_MS = 110; // ms, 다리 프레임 전환 간격

// 폭발 스프라이트 시트 (기종별 폴더, 5프레임 개별 파일 — 코어 노란색→붉은색 파편형; boss1은 6프레임)
const hitFrames = { normal1: [], normal2: [], normal3: [], normal4: [], normal6: [], normal7: [], normal8: [], boss1: [], player: [] };
const hitFrameCounts = { normal1:5, normal2:5, normal3:5, normal4:5, normal6:5, normal7:5, normal8:5, boss1:6, player:5 };
Object.keys(hitFrames).forEach(type=>{
  const count = hitFrameCounts[type] || 5;
  for(let i=0;i<count;i++){
    const img = new Image();
    img.src = `assets/hit/${type}/frame_${i}.png`;
    hitFrames[type].push(img);
  }
});

// ---- 점수/라이프/폭탄 시스템 ----
let playerScore = 0; // 적 명중 시마다 증가
let playerLife = 2; // 잔여 라이프(화면에 보이는 기체 외 여유분). 모두 소진 후 한 번 더 피격되면 컨티뉴 화면 트리거
let playerBombs = 2; // 폭탄 개수. 2손가락 터치 또는 마우스 좌/우 버튼 동시 클릭으로 사용
let continueScreenActive = false; // true면 게임 로직 정지, 컨티뉴 화면 표시 중 (상세 디자인은 추후 논의)

// 점수 임계값 돌파 시 1회성 보너스 라이프 (상한 5개까지만 적용)
const LIFE_BONUS_THRESHOLDS = [15000, 40000, 80000, 150000];
let nextLifeBonusIdx = 0;
const MAX_LIFE_ICON = 5;
let lifeBonusPopupMs = 0; // >0이면 "LIFE" 글로우 팝업 표시 중 (ms 카운트다운)
const LIFE_BONUS_POPUP_DURATION_MS = 500;

function addScore(amount){
  playerScore += amount;
  while(nextLifeBonusIdx < LIFE_BONUS_THRESHOLDS.length && playerScore >= LIFE_BONUS_THRESHOLDS[nextLifeBonusIdx]){
    nextLifeBonusIdx++;
    if(playerLife < MAX_LIFE_ICON){
      playerLife++;
      lifeBonusPopupMs = LIFE_BONUS_POPUP_DURATION_MS;
      playItemPickupSound();
    }
  }
}

// 매 프레임(델타타임 ms) 호출: LIFE 팝업 표시 타이머 감쇠
function updateLifeBonusPopup(dtMs){
  if(lifeBonusPopupMs > 0) lifeBonusPopupMs = Math.max(0, lifeBonusPopupMs - dtMs);
}

// SCORE 숫자 근처에 "LIFE" 글로우 작게 짧게 표시 (0.5초, WARNING!과 같은 그라디언트 글로우 스타일의 축소판)
function drawLifeBonusPopup(){
  if(lifeBonusPopupMs <= 0) return;
  const t = lifeBonusPopupMs / LIFE_BONUS_POPUP_DURATION_MS; // 1→0
  const cx = W/2, cy = 86; // SCORE 숫자(y:52) 바로 아래
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = Math.min(1, t * 2); // 끝부분에서 살짝 빠르게 사라짐
  ctx.font = 'bold 20px "Trebuchet MS", Arial, sans-serif';
  ctx.shadowColor = '#4dff8f';
  ctx.shadowBlur = 16;
  const grad = ctx.createLinearGradient(cx, cy - 10, cx, cy + 10);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.5, '#9affc2');
  grad.addColorStop(1, '#2bff7a');
  ctx.fillStyle = grad;
  ctx.fillText('LIFE', cx, cy);
  ctx.restore();
}

// 적 탄환에 피격 시 호출. 라이프가 남아있으면 1대 소진, 없으면 컨티뉴 화면 트리거.
// 무적 상태(피격 후 2초)일 때는 재차 호출되어도 무시됨.
function handlePlayerHit(){
  if(continueScreenActive || gameOverActive || playerInvincible) return;
  spawnPlayerHitExplosion(player.x, player.y);
  playPlayerHitSound(); // 피격 효과음
  startPlayerInvincibility(); // 2초 무적 + 떠오름/깜빡임 연출 시작
  if(playerLife > 0){
    playerLife--;
  } else {
    continueScreenActive = true;
    continueCountdown = 10;
    continueCountdownTimer = 0;
    const overlay = document.getElementById('continueOverlay');
    if(overlay) overlay.style.display = 'flex';
    const numEl = document.getElementById('continueCountdownNum');
    if(numEl) numEl.textContent = continueCountdown;
  }
}

// 컨티뉴 카운트다운 상태: 10초부터 0초까지 1초 간격으로 감소. 아무 키/터치 입력이 오면
// resumeFromContinue()로 이어하기, 0초에 도달하면 triggerGameOver()로 전이.
let continueCountdown = 10;
let continueCountdownTimer = 0; // ms 누적, 1000ms마다 카운트다운 1 감소
let gameOverActive = false; // 0초 도달 후 GAME OVER 화면 표시 중
let gameOverTimer = 0; // ms, GAME OVER 표시 후 경과 시간
const GAME_OVER_AUTO_TITLE_MS = 3000; // GAME OVER 표시 3초 후 타이틀로 자동 이동

// 매 프레임(컨티뉴 화면 표시 중) 호출: 델타타임 기반으로 1초마다 카운트다운 감소
function updateContinueScreen(dtMs){
  if(!continueScreenActive) return;
  continueCountdownTimer += dtMs;
  while(continueCountdownTimer >= 1000 && continueCountdown > 0){
    continueCountdownTimer -= 1000;
    continueCountdown--;
    const numEl = document.getElementById('continueCountdownNum');
    if(numEl) numEl.textContent = continueCountdown;
  }
  if(continueCountdown <= 0){
    triggerGameOver();
  }
}

// 아무 키/마우스/터치 입력 시 호출: 컨티뉴 화면을 닫고 라이프를 리필해 게임을 이어감.
function resumeFromContinue(){
  if(!continueScreenActive) return;
  continueScreenActive = false;
  const overlay = document.getElementById('continueOverlay');
  if(overlay) overlay.style.display = 'none';
  playerLife = 2; // 컨티뉴 수락 시 라이프 리필
  startPlayerInvincibility(); // 재개 직후 잠깐 무적 부여(안전 확보)
}

// 카운트다운이 0에 도달하면 호출: 컨티뉴 화면을 닫고 GAME OVER 화면을 표시
function triggerGameOver(){
  continueScreenActive = false;
  const overlay = document.getElementById('continueOverlay');
  if(overlay) overlay.style.display = 'none';
  gameOverActive = true;
  gameOverTimer = 0;
  const goOverlay = document.getElementById('gameOverOverlay');
  if(goOverlay) goOverlay.style.display = 'flex';
}

// 매 프레임(GAME OVER 표시 중) 호출: 3초 경과 시 타이틀로 자동 이동
// (타이틀 복귀 방식은 파일마다 다르므로 각 HTML에서 정의한 returnToTitleAfterGameOver()를 호출)
function updateGameOverScreen(dtMs){
  if(!gameOverActive) return;
  gameOverTimer += dtMs;
  if(gameOverTimer >= GAME_OVER_AUTO_TITLE_MS){
    gameOverActive = false;
    if(typeof returnToTitleAfterGameOver === 'function') returnToTitleAfterGameOver();
    else window.location.reload();
  }
}

// 폭탄 사용: 화면의 적 탄환을 전부 제거 + 화이트 플래시. TODO: 폭탄 아이템 드랍 시스템(획득 방식) 추후 설계
const BOMB_DAMAGE = 100; // 폭탄 공격력: 화면 안의 모든 적에게 100 데미지(보스는 하강을 마치고 전투 시작한 뒤부터)
function useBomb(){
  if(launchSequenceActive || continueScreenActive || gameOverActive || playerBombs <= 0) return;
  playerBombs--;
  bullets = [];
  screenFlash = SCREEN_FLASH_DURATION;
  enemies.forEach(e=>{
    if(e.dead) return;
    if((e.type === 'boss1' || e.type === 'boss2') ? !e.settled : !isEnemyOnScreen(e)) return;
    e.hp -= BOMB_DAMAGE;
    if(typeof triggerHitFlash === 'function' && (e.type === 'normal7' || e.type === 'normal8' || e.type === 'boss1' || e.type === 'boss2')) triggerHitFlash(e);
    if(e.hp <= 0) killEnemy(e);
  });
}

// ---- 주인공 ----
const player = { x: W/2, y: H-80 };
let playerCool = 0; // ms 누적
const PLAYER_FIRE_RATE = 90; // ms 주기, 고정 연사 속도(파워와 무관, 항상 동일)
// 요청사항(재설계): 파워 시스템을 "공격력" 하나로 단순화.
// 기본 공격력 1, P 아이템 1개당 +0.5, 최대 4개까지 먹을 수 있음(공격력 1~3).
const PLAYER_POWER_BASE = 1; // 기본 공격력
const PLAYER_POWER_STEP = 0.3; // P 1개당 증가량(요청사항: 4개 다 먹으면 일반7이 10발에 터지도록)
const PLAYER_POWER_MAX_ITEMS = 4; // P 아이템 최대 적용 개수
const PLAYER_POWER_MAX = PLAYER_POWER_BASE + PLAYER_POWER_STEP * PLAYER_POWER_MAX_ITEMS; // 1 + 0.3*4 = 2.2

function getPlayerFireRate(){
  return PLAYER_FIRE_RATE; // 연사 속도는 고정, 파워는 공격력(데미지)에만 영향
}
// 공격력(레이저 1발당 데미지). playerPower 자체가 그대로 공격력 값.
function getPlayerAttackPower(){
  return playerPower;
}

// ---- 전역 음소거 시스템 ----
// 모든 mp3 Audio 인스턴스를 이 레지스트리에 등록해두고, 토글 시 한 번에 muted 처리.
// Web Audio(레이저 합성음)는 별도 오실레이터 기반이라 playLaserSound() 진입부에서 게이트.
// 성능 최적화: 등록 시 preload='metadata'로 낮춰 스크립트 로드 즉시 전체 파일을
// 다운로드/디코딩하지 않도록 함(효과음 20여 개가 한꺼번에 프리로드되며 시작 지점에서
// 버벅이는 문제의 원인이었음). 실제 재생 시점에 필요한 만큼만 로드됨.
let audioMuted = false;
const registeredAudioElements = [];
function registerAudio(a){
  a.preload = 'metadata';
  a.muted = audioMuted;
  // 게임 코드가 부르는 a.play()는 "의도한 재생"으로 표시. unlockAllAudio()의 프라이밍은 원본 play를 직접 호출.
  const nativePlay = HTMLMediaElement.prototype.play;
  a.play = function(){ a._intentionalPlay = true; return nativePlay.call(a); };
  // 프라이밍 재생이 Safari에서 늦게(복구 타이머 이후) 실제로 시작되면 원래 볼륨으로 소리가 새어 나옴
  // (발사대에서 클리어 음악이 들리던 원인) → 의도한 재생이 아니면 시작되는 즉시 정지.
  a.addEventListener('playing', ()=>{ if(!a._intentionalPlay){ a.pause(); a.currentTime = 0; } });
  registeredAudioElements.push(a);
  return a;
}
// 타이틀/발사대 연출 동안 호출(매 프레임): 게임 코드가 일부러 재생(a.play())하지 않은 오디오가
// 재생 중이면 즉시 정지. 언락용 무음 재생이 브라우저에 따라 늦게 시작돼 음악이 새어 나오는 경우를 확실히 차단.
function silenceUnintendedAudio(){
  for(const a of registeredAudioElements){
    if(!a._intentionalPlay && !a.paused){ a.pause(); a.currentTime = 0; }
  }
}
function toggleMute(){
  audioMuted = !audioMuted;
  registeredAudioElements.forEach(a => { a.muted = audioMuted; });
}

// ---- 오디오 언락 ----
// 브라우저는 "사용자 제스처의 콜스택 내부"에서 호출된 재생만 최초에 허용하는 경우가 많음.
// 타이틀 화면을 닫는 클릭/키/터치 이벤트 콜스택 안에서 등록된 모든 <audio>를 짧게
// play()+pause()로 미리 재생 허용 상태로 만들어두면, 이후 게임 루프(requestAnimationFrame)
// 안에서 효과음을 처음 재생할 때도(첫 플레이부터) 막히지 않고 정상적으로 소리가 남.
let audioUnlocked = false;
// AudioContext resume + 무음 버퍼 재생은 "매번" 사용자 제스처 콜스택 안에서 호출해야 함.
// iOS Safari는 게임 루프(requestAnimationFrame) 안에서 resume()을 호출해도 실제로 풀리지 않는
// 경우가 있어(진짜 사용자 제스처가 아니므로), 타이틀 화면 최초 1회 언락이 불완전하게 실패하면
// 이후 효과음이 계속 안 들림. 메뉴(M) 버튼 클릭처럼 확실한 클릭 제스처가 생길 때마다 다시
// resume을 시도하도록 별도 함수로 분리(무거운 <audio> 프라이밍은 최초 1회만).
function resumeAudioContextFromGesture(){
  const laserCtx = getLaserAudioCtx();
  if(laserCtx){
    if(laserCtx.state === 'suspended') laserCtx.resume().catch(()=>{});
    try {
      const silentBuffer = laserCtx.createBuffer(1, 1, laserCtx.sampleRate);
      const silentSrc = laserCtx.createBufferSource();
      silentSrc.buffer = silentBuffer;
      silentSrc.connect(laserCtx.destination);
      silentSrc.start(0);
    } catch(e){}
  }
}
function unlockAllAudio(){
  resumeAudioContextFromGesture(); // 매번 실행: 언락이 실패했던 경우 재시도 기회를 줌
  if(audioUnlocked) return;
  audioUnlocked = true;
  // 스테이지 클리어 음악(stage_clear.wav)/보스 BGM(boss.m4a)은 실제 재생 시점(보스 격파/등장 시,
  // 사용자 제스처와 무관한 시점)에 처음 생성/최초 play()를 시도하면 모바일 자동재생 정책에 막혀
  // 소리가 전혀 안 나는 문제가 있었음. 여기서 미리 생성해 registeredAudioElements에 포함시켜,
  // 아래 프라이밍 루프의 대상이 되도록 함.
  getStageClearMusicAudio();
  if(typeof getBossBgmAudio === 'function') getBossBgmAudio();
  // 스테이지 BGM(세그먼트 기반, STAGE{N}_BGM_DATA)도 보스 BGM과 동일한 이유로 미리 생성해둬야 함.
  // switchToStageBgm()이 처음 호출되는 시점(발사 연출 종료 후)은 사용자 제스처 콜스택 밖이라,
  // 거기서 처음 Audio를 생성/최초 play()하면 모바일 자동재생 정책에 막혀 BGM이 전혀 안 나옴.
  if(typeof getBgmScheduleData === 'function' && typeof getStageBgmAudioForTrack === 'function'){
    [1, 2].forEach(stageNum=>{
      const bgmData = getBgmScheduleData(stageNum);
      if(bgmData && bgmData.tracks){
        Object.keys(bgmData.tracks).forEach(trackKey=>{
          getStageBgmAudioForTrack(stageNum, trackKey, bgmData.tracks[trackKey]);
        });
      }
    });
  }
  // 사용자 제스처 콜스택 안에서 전부 동기적으로 처리해야 브라우저의 자동재생 잠금 해제가 정상 동작함.
  // (프레임 단위로 나눠서 처리하면 일부가 제스처 콜스택 밖에서 실행되어 muted 동기화가 깨지고,
  //  효과음이 짧게 새어나오는(예: 폭발음이 시작과 동시에 들리는) 문제가 있어 한 번에 처리로 되돌림)
  registeredAudioElements.forEach(a=>{
    const wasMuted = a.muted;
    const wasVolume = a.volume;
    a.muted = true; // 언락 재생 자체는 소리가 들리지 않도록
    a.volume = 0; // muted 적용이 브라우저에서 비동기적으로 지연되는 경우(Safari 등)에도 확실히 무음이 되도록 volume도 함께 0으로
    let restored = false;
    const restore = ()=>{
      if(restored) return;
      restored = true;
      // 프라이밍 이후(비동기로 이 콜백이 실행되는 사이) 게임 코드가 이미 의도적으로 이 오디오를
      // 재생시킨 경우(a._intentionalPlay === true, 예: 발사대 장면에서 곧바로 시작하는 스테이지1
      // BGM) 그 재생을 건드리면 안 됨 — pause/currentTime 리셋/볼륨 덮어쓰기를 하면 방금 시작한
      // 진짜 재생이 끊기고 볼륨도 프라이밍 전 값(보통 1)으로 되돌아가버리는 경쟁 상태가 생김.
      // 그런 경우엔 muted 상태만 원래대로 돌려주고 나머지는 그대로 둔다.
      if(a._intentionalPlay){
        a.muted = wasMuted;
        return;
      }
      a.pause();
      a.currentTime = 0;
      a.muted = wasMuted;
      a.volume = wasVolume;
    };
    const p = HTMLMediaElement.prototype.play.call(a); // 프라이밍: 의도한 재생 표시 없이 호출
    if(p && p.then) p.then(restore).catch(restore);
    // iOS Safari에서는 이 play() 프로미스가 resolve되지 않거나 매우 늦게 resolve되는 경우가 있어,
    // 그대로 두면 볼륨이 0으로 영구히 남아 이후 정상 재생 시에도 소리가 안 나는 버그가 있었음.
    // 200ms 안에 Promise가 안 풀려도 무조건 원래 볼륨/muted 상태로 복구되도록 안전장치를 둠.
    setTimeout(restore, 200);
  });
  // 새로 버퍼 방식으로 전환한 효과음들도 동일하게 제스처 콜스택 근처에서 미리 디코드해둬서
  // 첫 재생 때 스킵되지 않도록 함(디코드 자체는 비동기라 콜스택 밖에서 끝나도 무방).
  ['sound/ihit.mp3','sound/bosshit.m4a','sound/item.mp3','sound/laser.m4a','sound/game_explosion8.mp3'].forEach(loadSoundBuffer);
}

// ---- 페이지 이탈 시 전체 오디오 정지 / 복귀 시 BGM 재개 ----
// 탭 전환, 다른 앱으로 전환, 최소화 등으로 페이지가 백그라운드로 가면(visibilitychange)
// BGM/효과음 풀/보스 레이저 루프/Web Audio(레이저 합성음)까지 전부 즉시 정지시킴.
// 복귀 시에는 효과음/레이저 합성음은 다음 재생 시점에 자연히 다시 흐르지만, BGM(스테이지/보스)은
// loop 재생 중이던 트랙이므로 명시적으로 이어서 재생해야 끊긴 채로 멈춰있지 않음.
let wasBgmPlayingBeforeHidden = false;
let wasBossBgmPlayingBeforeHidden = false;
function pauseAllAudioForPageHidden(){
  wasBgmPlayingBeforeHidden = !!(bgmAudio && !bgmAudio.paused);
  wasBossBgmPlayingBeforeHidden = !!(bossBgmAudio && !bossBgmAudio.paused);
  registeredAudioElements.forEach(a=>{ a.pause(); });
  stopBossLaserSound();
  const laserCtx = getLaserAudioCtx();
  if(laserCtx && laserCtx.state === 'running') laserCtx.suspend().catch(()=>{});
}
// 페이지가 다시 보이면 재생 중이던 BGM만 그 자리에서 이어서 재생(효과음은 재개할 필요 없음).
function resumeBgmAfterPageVisible(){
  if(wasBgmPlayingBeforeHidden && bgmAudio){
    bgmAudio.play().catch(()=>{});
  }
  if(wasBossBgmPlayingBeforeHidden && bossBgmAudio){
    bossBgmAudio.play().catch(()=>{});
  }
  const laserCtx = getLaserAudioCtx();
  if(laserCtx && laserCtx.state === 'suspended') laserCtx.resume().catch(()=>{});
}
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden) pauseAllAudioForPageHidden();
  else resumeBgmAfterPageVisible();
});
window.addEventListener('pagehide', pauseAllAudioForPageHidden);
window.addEventListener('pageshow', resumeBgmAfterPageVisible);
// 주의: 과거 여기 window 'blur'/'focus' 리스너가 있었으나, PC에서는 탭이 안 보이게 되는 게 아니라
// 창이 포커스만 잃어도(다른 창 클릭, 개발자 도구 열기 등) 곧바로 발동되어 BGM이 자주 끊기는
// 원인이었음. 실제로 화면이 안 보일 때만 멈춰야 하므로 visibilitychange만 사용하도록 정리함.
// M 키(물리 키코드 기준, 한/영 자판 상관없이 동작 — 두벌식 자판에서 M은 'ㅡ'로 표시됨)로 음소거 토글
window.addEventListener('keydown', e=>{
  if(e.code === 'KeyM' || e.key === 'm' || e.key === 'M' || e.key === 'ㅡ'){
    toggleMute();
  }
});

// ---- 사운드 (레이저 발사음, Web Audio API로 직접 합성 — mp3 파일 사용 안 함) ----
// 발사마다 독립된 오실레이터를 새로 만들어(one-shot) 짧은 "핑~" 톤을 재생하고 완전히
// 무음까지 감쇠시킨 뒤 정지합니다. (이전엔 오실레이터 하나를 계속 켜두고 게인만 오르내리는
// 방식이었는데, 빠른 연사 시 게인이 완전히 꺼지지 않고 남아있어 재어택음이 겹쳐 "두두두두"
// 리듬처럼 들리는 문제가 있었음. one-shot + 완전 무음까지 지수 감쇠로 이 문제를 해결.)
let laserAudioCtx = null;
function getLaserAudioCtx(){
  if(!laserAudioCtx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(AC) laserAudioCtx = new AC();
  }
  return laserAudioCtx;
}

let LASER_SOUND_BASE_VOLUME = 0.09; // 기본 볼륨(0~1) — 사용자 요청으로 10% 추가 하향(기존 0.1)

// 레이저 발사음: "B4 워터퍼프" 방식 채택 — 저역통과 노이즈(450Hz 이하) + 사인 하강(340->170Hz) 겹침.
// 물방울처럼 몽글몽글하고 부드러운 톤, 공진 없어 연사해도 귀에 부담 없음.
// LASER_SOUND_BASE_VOLUME은 원본 샘플 게인(0.35, 노이즈 레이어 기준) 대비 배율로 적용됨.
const LASER_VOLUME_SCALE = LASER_SOUND_BASE_VOLUME / 0.35;
function playLaserSound(){
  if(audioMuted) return;
  const audioCtx = getLaserAudioCtx();
  if(!audioCtx) return;
  if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});

  const now = audioCtx.currentTime;
  const mobileScale = getMobileAdjustedVolume(1); // 모바일이면 1.3, 아니면 1 (기존 볼륨 계산에 곱해서 사용)

  // 저역 노이즈 레이어(부드러운 바디감)
  const noiseDur = 0.02;
  const buf = audioCtx.createBuffer(1, Math.max(1, Math.floor(audioCtx.sampleRate * noiseDur)), audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 1.6);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 450; lp.Q.value = 0.0001;
  const ng = audioCtx.createGain();
  ng.gain.value = 0.18 * LASER_VOLUME_SCALE * mobileScale;
  src.connect(lp); lp.connect(ng); ng.connect(audioCtx.destination);
  src.start(now);

  // 사인 하강 레이어(몽글몽글한 물방울 느낌)
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(340, now);
  osc.frequency.exponentialRampToValueAtTime(170, now + 0.03);
  const og = audioCtx.createGain();
  osc.connect(og); og.connect(audioCtx.destination);
  og.gain.setValueAtTime(0, now);
  og.gain.linearRampToValueAtTime(0.22 * LASER_VOLUME_SCALE * mobileScale, now + 0.004);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
  osc.start(now); osc.stop(now + 0.04);
}

// ---- 배경음악(BGM): 스테이지 진행 중 반복 재생. 브라우저 자동재생 정책상 사용자
// 상호작용(첫 마우스/터치 입력) 이후에만 재생 가능하므로, 메인 HTML의 입력 리스너에서
// startBgm()을 최초 1회 호출합니다.
// 성능 최적화: main.mp3(4.6MB)는 스크립트 로드 시점이 아니라 최초 재생 시점에 생성해서
// 게임 시작 직후 몰리는 초기 네트워크/디코딩 부담을 줄임(지연 생성).
// 모바일 기기 판별(BGM 볼륨을 모바일에서만 추가로 낮추는 데 사용).
const IS_MOBILE_DEVICE = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
let BGM_MOBILE_VOLUME_SCALE = 0.8; // 개발자 모드에서 조정 가능(참고용). 실제 모바일 하향은 getBgmVolume()의 고정 0.8배로 적용됨.
const BGM_TO_SFX_RATIO = 0.3; // BGM은 항상 효과음 평균 볼륨의 30% 수준을 유지
// 효과음(레이저/폭발/피격/아이템/스파이럴/보스탄/보스레이저) 평균 볼륨을 구해 그 30%를 BGM 기준 볼륨으로 사용.
// 이 함수보다 아래에 선언된 _SOUND_VOLUME 상수들을 참조하지만, 실제 호출은 항상 스크립트 로드가
// 끝난 뒤(BGM 재생 시점)에 일어나므로 참조 시점에는 모든 상수가 이미 정의되어 있어 문제 없음.
function getSfxAverageVolume(){
  const vols = [
    LASER_SOUND_BASE_VOLUME, ENEMY_HIT_SOUND_VOLUME, PLAYER_HIT_SOUND_VOLUME,
    BOSS_HIT_SOUND_VOLUME, ITEM_PICKUP_SOUND_VOLUME, SPIRAL_SHOOT_SOUND_VOLUME,
    BOSS_SHOT_SOUND_VOLUME, BOSS_LASER_SOUND_VOLUME
  ];
  return vols.reduce((a,b)=>a+b, 0) / vols.length;
}
function getBgmVolume(){
  const base = 0.045; // 사용자 요청으로 고정값 지정(스테이지1/2 공용 메인 BGM 볼륨)
  return IS_MOBILE_DEVICE ? base * BGM_MOBILE_VOLUME_SCALE : base; // 요청사항: 모바일에서만 20% 추가 하향(기본 0.8배)
}
// 모바일 전용 효과음 볼륨 배율: 레이저/스파이럴탄/보스탄/적격파음/보스격파음은 모바일 스피커에서
// 더 잘 들리도록 재생 시점에만 2배 증폭(효과음 볼륨 상수 자체는 그대로 유지 -> BGM 계산에 영향 없음).
let SFX_MOBILE_VOLUME_SCALE = 2;
function getMobileAdjustedVolume(baseVolume){
  return baseVolume * SFX_MOBILE_VOLUME_SCALE; // PC도 모바일과 동일한 볼륨 설정 사용(기기 구분 없이 항상 적용)
}
// 보스 BGM 전용 모바일 배율: 메인 BGM(getBgmVolume)은 모바일에서도 고정값 유지, 보스 BGM만 2배 증폭.
let BOSS_BGM_MOBILE_VOLUME_SCALE = 2;
function getBossBgmVolume(){
  const baseVolume = getSfxAverageVolume() * BGM_TO_SFX_RATIO;
  return baseVolume * BOSS_BGM_MOBILE_VOLUME_SCALE; // PC도 모바일과 동일한 볼륨 설정 사용(기기 구분 없이 항상 적용)
}
// 스테이지 클리어 음악 전용: 모바일에서도 다른 BGM처럼 30% 낮추지 않고 데스크톱과 동일한 수준(효과음 평균의 30%) 유지.
// 사용자 요청으로 4배 상향(기존 2배에서 추가로 2배 더).
let STAGE_CLEAR_MUSIC_VOLUME_SCALE = 4;
function getStageClearMusicVolume(){
  return getSfxAverageVolume() * BGM_TO_SFX_RATIO * STAGE_CLEAR_MUSIC_VOLUME_SCALE;
}

let bgmAudio = null;
let bgmStarted = false;
function getBgmAudio(){
  if(!bgmAudio){
    bgmAudio = registerAudio(new Audio('sound/main.mp3'));
    bgmAudio.loop = true;
    bgmAudio.volume = getBgmVolume(); // 효과음 평균 볼륨의 30% 수준을 항상 유지(모바일에서는 추가로 30% 하향)
    // 일부 브라우저(Safari 등)는 대용량 오디오에서 loop 속성이 씹혀 재생이 끝나면
    // 멈추는 버그가 있어, ended 이벤트로 강제 재시작하는 이중 안전장치를 둠.
    bgmAudio.addEventListener('ended', ()=>{
      bgmAudio.currentTime = 0;
      bgmAudio.play().catch(()=>{});
    });
  }
  return bgmAudio;
}
function startBgm(){
  if(bgmStarted) return;
  bgmStarted = true;
  const audio = getBgmAudio();
  const targetVolume = audio.volume;
  audio.volume = 0; // 재생 시작 시 볼륨 0에서 시작해 서서히 올려 초반 타격음이 갑작스럽게 튀지 않도록 함
  audio.play().then(()=>{
    fadeInAudio(audio, targetVolume, 1000); // 1초간 페이드인
  }).catch(()=>{ bgmStarted = false; audio.volume = targetVolume; });
}

// ---- 스테이지 클리어 음악(1회성, 5초) ----
// 스테이지 BGM/보스 BGM과 달리 loop 없이 한 번만 재생. 볼륨은 다른 BGM과 동일하게
// getBgmVolume() 규칙(효과음 평균의 30%)을 따름.
let stageClearMusicAudio = null;
function getStageClearMusicAudio(){
  if(!stageClearMusicAudio){
    stageClearMusicAudio = registerAudio(new Audio('sound/stage_clear.wav'));
    stageClearMusicAudio.loop = false;
  }
  return stageClearMusicAudio;
}
function playStageClearMusic(){
  const audio = getStageClearMusicAudio();
  audio.volume = getStageClearMusicVolume(); // 모바일에서도 낮추지 않고 데스크톱과 동일한 값(0.0546 수준) 유지
  audio.currentTime = 0;
  audio.play().catch(()=>{});
}
function stopStageClearMusic(){
  if(stageClearMusicAudio){ stageClearMusicAudio.pause(); }
}

// 오디오 엘리먼트의 볼륨을 0에서 target까지 실제 시간 기반으로 서서히 올리는 범용 페이드인 유틸.
// setInterval을 쓰지 않고 requestAnimationFrame으로 진행해 탭 성능에 맞춰 자연스럽게 보간됨.
function fadeInAudio(audio, targetVolume, durationMs){
  const startTime = performance.now();
  function step(now){
    const t = Math.min(1, (now - startTime) / durationMs);
    audio.volume = targetVolume * t;
    if(t < 1 && !audio.paused) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// 적 피격(타격) 효과음: Web Audio API(AudioBuffer)로 미리 디코드해두고 즉발 재생.
// (이전엔 <audio> 풀 방식으로 재생했는데, 모바일에서 play() 호출 후 실제 소리가 나오기까지
//  지연이 커서 폭발 이펙트와 싱크가 어긋나는 문제가 있었음. 레이저 합성음과 동일한 AudioContext를
//  재사용해 디코드된 PCM 버퍼를 매번 새 AudioBufferSourceNode로 재생하면 지연 없이 즉시 소리가 남.)
// 단, file://로 로컬에서 직접 열어 테스트하는 경우 fetch()가 CORS 정책에 막혀 버퍼 로딩이 실패할 수 있어,
// 그 경우엔 기존 <audio> 풀 방식으로 자동 전환(fallback)해 어떤 환경에서도 소리가 나도록 함.
// 적 폭발음: game_explosion8.mp3 파일 기반. 다른 효과음(피격/아이템/보스격파 등)과 동일하게
// 공용 playSoundBuffer/loadSoundBuffer 유틸을 사용(과거엔 여기만 별도의 6개짜리 <audio> 풀 방식을
// 썼는데, 그 풀이 게임 루프 도중(사용자 제스처 콜스택 밖)에 지연 생성되며 한꺼번에 play()를 시도해
// 모바일 자동재생 정책에 막혀 소리가 전혀 안 나는 문제가 있었음 — 다른 효과음들처럼 스크립트 로드
// 시점에 fallback용 <audio> 엘리먼트 1개를 미리 만들어 unlockAllAudio()가 프라이밍하도록 통일함).
let ENEMY_HIT_SOUND_VOLUME = 0.0765; // 사용자 요청으로 15% 추가 하향(기존 0.09)
const ENEMY_HIT_SOUND_MAX_DURATION_MS = 1500; // ms, 원본 2.17초에서 1.5초로 잘라 재생
const enemyHitAudioFallback = registerAudio(new Audio('sound/game_explosion8.mp3'));
enemyHitAudioFallback.volume = ENEMY_HIT_SOUND_VOLUME;
function playEnemyHitSound(enemyType){
  const result = playSoundBuffer('sound/game_explosion8.mp3', getMobileAdjustedVolume(ENEMY_HIT_SOUND_VOLUME), {maxDurationMs: ENEMY_HIT_SOUND_MAX_DURATION_MS});
  if(result === 'fallback'){
    enemyHitAudioFallback.volume = getMobileAdjustedVolume(ENEMY_HIT_SOUND_VOLUME);
    enemyHitAudioFallback.currentTime = 0;
    enemyHitAudioFallback.play().catch(()=>{});
  }
}

// ---- 범용 Web Audio 버퍼 사운드 시스템 ----
// 모바일(iOS Safari)은 동시에 프리로드 가능한 <audio> 엘리먼트 개수에 제한이 있어(대략 4개 안팎),
// <audio> 풀을 여러 종류 만들면 일부가 조용히 재생 실패하는 문제가 있었음. (적 격파음은 이제 합성음이라 해당 없음)
// 적용했던 것과 동일하게, 공용 AudioContext + decodeAudioData로 미리 디코드한 PCM 버퍼를 매번 새
// AudioBufferSourceNode로 재생하는 방식으로 통일. 버퍼 방식은 동시 재생 시에도 노드가 각자 독립적으로
// 생기므로 풀(pool) 자체가 필요 없음(동시에 여러 발 겹쳐도 문제 없이 전부 들림).
// file://로 직접 열어 fetch()가 CORS에 막히는 환경에서만 <audio> 단일 인스턴스로 자동 전환(fallback).
const soundBuffers = {};       // url -> 디코드된 AudioBuffer
const soundBufferLoading = {}; // url -> true(로딩 중)
const soundUseFallback = {};   // url -> true(Web Audio 실패, <audio> fallback 사용)
function loadSoundBuffer(url){
  if(soundBuffers[url] || soundBufferLoading[url] || soundUseFallback[url]) return;
  soundBufferLoading[url] = true;
  const audioCtx = getLaserAudioCtx();
  if(!audioCtx){ soundBufferLoading[url] = false; soundUseFallback[url] = true; return; }
  fetch(url)
    .then(res => res.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .then(decoded => { soundBuffers[url] = decoded; })
    .catch(()=>{ soundUseFallback[url] = true; })
    .finally(()=>{ soundBufferLoading[url] = false; });
}
// 반환값: 재생에 사용된 AudioBufferSourceNode(루프 정지 등에 필요한 경우) 또는 재생 못했으면 null.
function playSoundBuffer(url, volume, opts){
  opts = opts || {};
  if(audioMuted) return null;
  if(soundUseFallback[url]) return 'fallback'; // 호출부에서 <audio> fallback으로 재생하도록 신호
  if(!soundBuffers[url]){ loadSoundBuffer(url); return null; } // 아직 디코드 전이면 이번 호출은 스킵
  const audioCtx = getLaserAudioCtx();
  if(!audioCtx) return null;
  if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  const src = audioCtx.createBufferSource();
  src.buffer = soundBuffers[url];
  src.loop = !!opts.loop;
  if(opts.playbackRate) src.playbackRate.value = opts.playbackRate; // 1보다 낮추면 피치가 내려가 더 묵직/중후한 톤이 됨
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  if(opts.loop){
    src.start(0);
  } else {
    const dur = opts.maxDurationMs ? Math.min(src.buffer.duration, opts.maxDurationMs/1000) : src.buffer.duration;
    src.start(0, 0, dur);
  }
  return src;
}

// 주인공 피격 효과음
let PLAYER_HIT_SOUND_VOLUME = 0.2; // 기존 0.5 대비 60% 하향
const playerHitAudioFallback = registerAudio(new Audio('sound/ihit.mp3'));
playerHitAudioFallback.volume = PLAYER_HIT_SOUND_VOLUME;
function playPlayerHitSound(){
  const result = playSoundBuffer('sound/ihit.mp3', PLAYER_HIT_SOUND_VOLUME);
  if(result === 'fallback'){
    playerHitAudioFallback.currentTime = 0;
    playerHitAudioFallback.play().catch(()=>{});
  }
}

// 보스 격파(폭발) 효과음: 보스는 동시에 여러 번 겹쳐 재생될 일이 거의 없어 단일 인스턴스로 충분.
let BOSS_HIT_SOUND_VOLUME = 0.14; // 기존 0.35 대비 60% 추가 하향
const bossHitAudioFallback = registerAudio(new Audio('sound/bosshit.m4a'));
bossHitAudioFallback.volume = BOSS_HIT_SOUND_VOLUME;
function playBossHitSound(){
  const result = playSoundBuffer('sound/bosshit.m4a', getMobileAdjustedVolume(BOSS_HIT_SOUND_VOLUME));
  if(result === 'fallback'){
    bossHitAudioFallback.volume = getMobileAdjustedVolume(BOSS_HIT_SOUND_VOLUME);
    bossHitAudioFallback.currentTime = 0;
    bossHitAudioFallback.play().catch(()=>{});
  }
}

// 아이템 획득 효과음: R/W 아이템을 먹는 순간 재생.
let ITEM_PICKUP_SOUND_VOLUME = 0.2; // 사용자 요청으로 2배 상향(기존 0.1)
const itemPickupAudioFallback = registerAudio(new Audio('sound/item.mp3'));
itemPickupAudioFallback.volume = ITEM_PICKUP_SOUND_VOLUME;
function playItemPickupSound(){
  const result = playSoundBuffer('sound/item.mp3', ITEM_PICKUP_SOUND_VOLUME);
  if(result === 'fallback'){
    itemPickupAudioFallback.volume = ITEM_PICKUP_SOUND_VOLUME;
    itemPickupAudioFallback.currentTime = 0;
    itemPickupAudioFallback.play().catch(()=>{});
  }
}

// 적 발사(탄환) 효과음: 현재 미사용(호출부에서 소리 제거 정책).
function playEnemyShootSound(volume){
  return; // 적 탄소리 제거
}

// 일반8(spiral) 전용 발사음: "B2 뭉근 필터팝" 방식 채택 — 저역통과 필터링된 화이트노이즈(400Hz 이하),
// 28ms. 공진 없는 부드럽고 둥근 팝 소리. 보스 일반탄(fireBossQuadArc)도 이 소리를 피치만 낮춰 재사용(playBossShotSound 참고).
let SPIRAL_SHOOT_SOUND_VOLUME = 0.32;
// 보스전 중(stagePhase가 'bossIntro' 또는 'boss')일 때만 spiral/보스탄/보스레이저 볼륨을 추가로 키움.
const BOSS_PHASE_SFX_BOOST = 1.6;
function getBossPhaseVolume(baseVolume){
  const inBossPhase = (typeof stagePhase !== 'undefined') && (stagePhase === 'bossIntro' || stagePhase === 'boss');
  return inBossPhase ? baseVolume * BOSS_PHASE_SFX_BOOST : baseVolume;
}
function playSpiralPopSound(audioCtx, volume, playbackRate){
  const now = audioCtx.currentTime;
  const dur = 0.028;
  const rate = playbackRate || 1; // 1보다 낮추면 피치가 내려가 더 중후해짐(보스탄용)

  const buf = audioCtx.createBuffer(1, Math.max(1, Math.floor(audioCtx.sampleRate * dur)), audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 1.4);

  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  if(rate !== 1) src.playbackRate.value = rate;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 400 * rate; lp.Q.value = 0.0001; // 공진 없음

  const gain = audioCtx.createGain();
  gain.gain.value = getMobileAdjustedVolume(volume);

  src.connect(lp); lp.connect(gain); gain.connect(audioCtx.destination);
  src.start(now);
}
function playSpiralShootSound(){
  if(audioMuted) return;
  const audioCtx = getLaserAudioCtx();
  if(!audioCtx) return;
  if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  playSpiralPopSound(audioCtx, getBossPhaseVolume(SPIRAL_SHOOT_SOUND_VOLUME));
}

// 보스 일반탄(fireBossQuadArc) 전용 발사음: spiral 발사음(G4 라운드 팝)을 그대로 복제하되 피치를 낮춰
// 더 중후하고 묵직한 톤으로 재생(같은 소리지만 보스답게 구별되는 소리를 위함).
let BOSS_SHOT_SOUND_VOLUME = 0.32;
const BOSS_SHOT_PITCH_RATE = 0.65; // 1보다 낮을수록 피치가 내려가 더 중후해짐
function playBossShotSound(){
  if(audioMuted) return;
  const audioCtx = getLaserAudioCtx();
  if(!audioCtx) return;
  if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  playSpiralPopSound(audioCtx, getBossPhaseVolume(BOSS_SHOT_SOUND_VOLUME), BOSS_SHOT_PITCH_RATE);
}

// 보스 레이저 발사음: 레이저가 실제로 나가는 동안 계속 루프 재생, 발사가 끝나면 정지.
// (충전 단계에는 재생하지 않고, drawBossLaser()가 실제로 호출되는 구간에서만 재생)
let BOSS_LASER_SOUND_VOLUME = 0.2; // 기존 0.5 대비 60% 하향
const bossLaserAudioFallback = registerAudio(new Audio('sound/laser.m4a'));
bossLaserAudioFallback.loop = true;
bossLaserAudioFallback.volume = BOSS_LASER_SOUND_VOLUME;
let bossLaserSoundPlaying = false;
let bossLaserSrcNode = null; // Web Audio 루프 재생 중인 소스 노드(정지 시 필요)
function startBossLaserSound(){
  if(bossLaserSoundPlaying) return;
  if(audioMuted) return;
  const vol = getBossPhaseVolume(BOSS_LASER_SOUND_VOLUME);
  const result = playSoundBuffer('sound/laser.m4a', vol, {loop:true});
  if(result === 'fallback'){
    bossLaserAudioFallback.volume = vol;
    bossLaserAudioFallback.currentTime = 0;
    bossLaserAudioFallback.play().catch(()=>{});
    bossLaserSoundPlaying = true;
  } else if(result){
    bossLaserSrcNode = result;
    bossLaserSoundPlaying = true;
  }
  // result가 null이면(버퍼 디코드 대기 중) 아직 재생 못 함 — 다음 프레임 호출 시 재시도됨
}
function stopBossLaserSound(){
  if(!bossLaserSoundPlaying) return;
  bossLaserSoundPlaying = false;
  if(bossLaserSrcNode){
    try{ bossLaserSrcNode.stop(); } catch(e){}
    bossLaserSrcNode = null;
  }
  if(!bossLaserAudioFallback.paused) bossLaserAudioFallback.pause();
}

// ---- 주인공 무적/재등장 상태 ----
// 피격 시 2초간 무적 + 화면 아래에서 위로 떠오르며 깜빡이는(blink) 재등장 연출.
// 실제 판정용 player.x/player.y는 계속 마우스/터치 입력을 그대로 따라가고(로직에는 영향 없음),
// 그리기 시점에만 "떠오름" 오프셋을 더해서 시각적으로 아래에서 올라오는 것처럼 보이게 함.
let playerInvincible = false;
let playerInvincibleTimer = 0; // ms, 0이면 무적 아님
const PLAYER_INVINCIBLE_DURATION = 2000; // ms, 총 무적 시간
let playerRespawnTimer = 0; // ms, 0이면 떠오름 애니메이션 끝
const PLAYER_RESPAWN_RISE_DURATION = 500; // ms, 떠오름 애니메이션 길이(무적 시간의 앞부분)
const PLAYER_RESPAWN_RISE_DISTANCE = 220; // px, 시작 시 아래로 내려가 있는 거리
const PLAYER_BLINK_INTERVAL_MS = 90; // ms, 깜빡임 on/off 전환 주기

function startPlayerInvincibility(){
  playerInvincible = true;
  playerInvincibleTimer = PLAYER_INVINCIBLE_DURATION;
  playerRespawnTimer = PLAYER_RESPAWN_RISE_DURATION;
}

// 매 프레임 호출: 무적/떠오름 타이머를 dt(ms) 기준으로 감소시킴 (델타타임 기반)
function updatePlayerInvincibility(dtMs){
  if(playerInvincibleTimer > 0){
    playerInvincibleTimer -= dtMs;
    if(playerInvincibleTimer <= 0){
      playerInvincibleTimer = 0;
      playerInvincible = false;
    }
  }
  if(playerRespawnTimer > 0){
    playerRespawnTimer -= dtMs;
    if(playerRespawnTimer < 0) playerRespawnTimer = 0;
  }
}

// ---- 발사 시퀀스 (스테이지 시작 시 발사대에서 이탈하는 연출) ----
// sit(스테이션 링 중심에 살짝 축소된 채 대기) -> grow(제자리에서 2초간 크기 100%로 확대) ->
// hold(0.5초 정지) -> dash(가속하며 화면 중앙까지 힘차게 전진 3초, 스테이션은 같은 진행률로 동시에 아래로 퇴장) ->
// cruise(화면 중앙에서 3초간 정지 비행) -> descend(기본 위치로 천천히 하강 복귀) ->
// title(제자리로 돌아온 순간 STAGE N 표시) -> startStage() 호출 + 조작 잠금 해제
let launchSequenceActive = false;
let launchPhase = 'sit';
let launchElapsed = 0;
let launchStageNum = 1;
const LAUNCH_SIT_MS = 900;
const LAUNCH_GROW_MS = 2000; // 제자리에서 크기 100%로 확대되는 시간 2초
const LAUNCH_HOLD_MS = 500; // 확대 완료 후 정지 0.5초
const LAUNCH_DASH_MS = 1000; // 가속하며 화면 중앙까지 힘차게 전진하는 시간(1초)
const LAUNCH_WARP_ACCEL_MS = 500; // 스테이션 완전 퇴장(cruise 진입) 후 배속이 20배속까지 가속되는 데 걸리는 시간(0.5초)
const LAUNCH_CRUISE_MS = 3000; // 화면 중앙에 도착해 멈춰서 비행하는 느낌으로 대기하는 시간(3초)
const LAUNCH_DESCEND_BG_MS = 2000; // descend 진입 후 배경만 먼저 정상속도로 복귀하는 시간(2초, 기체는 이 구간엔 정지)
const LAUNCH_DESCEND_MOVE_MS = 1000; // 배경 정상화 후 기체가 H-80으로 복귀하는 시간(1초, 천천히 자리잡는 느낌)
const LAUNCH_DESCEND_MS = LAUNCH_DESCEND_BG_MS + LAUNCH_DESCEND_MOVE_MS; // 총 하강 단계 시간
const LAUNCH_STATION_BG_SPEED_MUL = 0.3; // 스테이션이 화면에 있는 동안(sit/grow/hold) layer2/3이 천천히 흐르는 배속
const LAUNCH_TITLE_MS = 1300;
const LAUNCH_SIT_SCALE = 0.5; // 발사대 위에 앉아있을 때 축소 비율(50%에서 확대 시작)
let launchCenterY = 0; // dash 종료 시점의 화면 중앙 y (계산해서 고정)
let launchCenterXBase = 0; // cruise 단계에서 좌우로 살짝 흔들리는 기준 x(= 발사 시작 시 x, station.png 링 중심 x)
let launchBaseY = 0; // 발사 시작 시 스테이션 링 중심 y (sit/grow/hold 동안의 고정 위치)

function startLaunchSequence(stageNum){
  launchStageNum = stageNum || 1;
  launchSequenceActive = true;
  launchPhase = 'sit';
  launchElapsed = 0;
  // 스테이지2: 발사대/워프 연출 없이 처음부터 지면 위를 나는 상태로 시작 → 'title'(STAGE 2 표시)만 거쳐 startStage
  if(launchStageNum === 2){
    launchPhase = 'title';
    player.x = W/2;
    player.y = H - 80;
    // 타이틀 동안에도 에디터에서 만든 지면/오브젝트가 보이도록 미리 적용 + #1 타일부터 시작
    if(typeof STAGE2_LAYOUT_DATA !== 'undefined' && typeof applyStage2LayoutData === 'function') applyStage2LayoutData(STAGE2_LAYOUT_DATA);
    if(typeof resetStage2Background === 'function') resetStage2Background();
    return;
  }
  // 기체를 스테이션 발사 링 중심에 정확히 배치 (station.png 링 좌표 분석값, bg.js)
  player.x = (typeof STATION_RING_X !== 'undefined' && STATION_RING_X) ? STATION_RING_X : W/2;
  player.y = (typeof STATION_RING_Y !== 'undefined' && STATION_RING_Y) ? STATION_RING_Y : H - 80;
  launchBaseY = player.y;
  launchCenterY = H/2;
  launchCenterXBase = player.x;
}

// 매 프레임: 먼저 현재 phase의 렌더 상태를 계산해서 그리고, 그 다음에 시간 진행에 따라 phase를 전이시킴.
// (전이 시점에 한 프레임이라도 잘못된 상태로 그려지면 화면이 번쩍이듯 보이는 문제가 있어 순서를 분리함)
function updateLaunchSequence(dtMs){
  if(!launchSequenceActive) return;
  launchElapsed += dtMs;
  if(launchPhase === 'sit' && launchElapsed >= LAUNCH_SIT_MS){
    launchPhase = 'grow'; launchElapsed = 0;
  } else if(launchPhase === 'grow' && launchElapsed >= LAUNCH_GROW_MS){
    launchPhase = 'hold'; launchElapsed = 0;
  } else if(launchPhase === 'hold' && launchElapsed >= LAUNCH_HOLD_MS){
    launchPhase = 'dash'; launchElapsed = 0;
  } else if(launchPhase === 'dash' && launchElapsed >= LAUNCH_DASH_MS){
    launchPhase = 'cruise'; launchElapsed = 0;
  } else if(launchPhase === 'cruise' && launchElapsed >= LAUNCH_CRUISE_MS){
    launchPhase = 'descend'; launchElapsed = 0;
  } else if(launchPhase === 'descend' && launchElapsed >= LAUNCH_DESCEND_MS){
    launchPhase = 'title'; launchElapsed = 0;
  } else if(launchPhase === 'title' && launchElapsed >= LAUNCH_TITLE_MS){
    launchSequenceActive = false;
    // 시퀀스 중 화면에 그려지던 위치(H-80, 즉 기본 플레이 위치)를 실제 player.y에도 반영해
    // 조작 가능 시점에 기체가 순간이동하지 않고 그 자리에서 그대로 이어지도록 함.
    player.y = H - 80;
    startStage(launchStageNum, true); // 여기서부터 실제 게임 시작(적 스폰 활성화) + 조작 잠금 해제. skipBgReset=true로 발사대 화면부터 흘러온 배경 스크롤 위치를 그대로 이어감(순간이동 방지)
  }
}

// 현재 프레임의 렌더 상태(기체 y좌표, 크기 배율, 그림자 배율, 스테이션 퇴장 비율, 배경 배속,
// layer1(행성 배경) 불투명도, bgAlpha(layer2/3 표시 여부)) 계산
function getLaunchRenderState(){
  if(launchPhase === 'sit'){
    // 스테이션이 화면에 있는 동안: 행성 배경(layer1) 숨김, 먼지/파편(layer2/3)은 저속으로 흐름
    return { y: launchBaseY, scale: LAUNCH_SIT_SCALE, shadowScale: LAUNCH_SIT_SCALE, stationOffset: 0, bgSpeedMul: LAUNCH_STATION_BG_SPEED_MUL, layer1Alpha: 0, bgAlpha: 1 };
  }
  if(launchPhase === 'grow'){
    const t = Math.min(1, launchElapsed / LAUNCH_GROW_MS);
    const ease = 1 - Math.pow(1 - t, 2); // ease-out: 서서히 가속 후 감속
    const scale = LAUNCH_SIT_SCALE + (1 - LAUNCH_SIT_SCALE) * ease;
    return {
      y: launchBaseY, // 제자리에서 확대만
      scale,
      shadowScale: scale, // 기체가 커지는 만큼 그림자도 함께 커짐
      stationOffset: 0,
      bgSpeedMul: LAUNCH_STATION_BG_SPEED_MUL,
      layer1Alpha: 0,
      bgAlpha: 1
    };
  }
  if(launchPhase === 'hold'){
    return { y: launchBaseY, scale: 1, shadowScale: 1, stationOffset: 0, bgSpeedMul: LAUNCH_STATION_BG_SPEED_MUL, layer1Alpha: 0, bgAlpha: 1 }; // 정지
  }
  if(launchPhase === 'dash'){
    const t = Math.min(1, launchElapsed / LAUNCH_DASH_MS);
    const ease = t*t; // ease-in: 천천히 시작해 점점 가속하며 힘차게 튀어나가듯 전진
    return {
      y: launchBaseY + (launchCenterY - launchBaseY) * ease,
      scale: 1,
      shadowScale: 1,
      stationOffset: ease, // 기체가 전진하는 진행률과 동일하게 스테이션도 아래로 퇴장(ease=1 시점에 완전히 화면 밖)
      bgSpeedMul: LAUNCH_STATION_BG_SPEED_MUL, // 스테이션이 아직 화면에 남아있는 동안은 배경 저속 유지
      layer1Alpha: 0, // 행성 배경은 스테이션 퇴장 시점부터 이미 숨겨진 상태 유지
      bgAlpha: 1
    };
  }
  if(launchPhase === 'cruise'){
    // 화면 중앙에서 완전히 정지하지 않고, 비행 중인 느낌을 주기 위해 상하좌우로 아주 살짝 흔들리게 함.
    // cruise가 끝나기 직전(마지막 CRUISE_SETTLE_MS)에는 흔들림 진폭을 서서히 0으로 줄여 정확히
    // 중앙으로 수렴시킨 뒤 descend로 넘어가게 함(흔들리던 중 임의의 위치에서 뚝 끊기지 않도록).
    const t = launchElapsed / 1000; // 초 단위
    const CRUISE_SETTLE_MS = 700; // 이 시간 동안 흔들림이 서서히 가라앉으며 중앙으로 복귀
    const settleStart = LAUNCH_CRUISE_MS - CRUISE_SETTLE_MS;
    let wobbleMul = 1;
    if(launchElapsed > settleStart){
      const settleT = Math.min(1, (launchElapsed - settleStart) / CRUISE_SETTLE_MS);
      wobbleMul = Math.pow(1 - settleT, 2); // 진폭이 제곱으로 빠르게 줄며 자연스럽게 중앙에 안착
    }
    const bobY = Math.sin(t * 2.1) * 6 * wobbleMul; // 상하로 살짝
    const bobX = Math.sin(t * 1.4 + 1.2) * 5 * wobbleMul; // 좌우로 살짝, 위상을 다르게 해서 원형이 아닌 자연스러운 흔들림
    // 스테이션이 완전히 사라진 직후(cruise 진입)부터 20배속까지 0.5초에 걸쳐 가속.
    // 선형이 아니라 ease-in(t^2)으로 처음엔 천천히 붙다가 점점 빠르게 가속되도록 함.
    // 배속이 올라갈수록 layer2/3 파티클이 자동으로 세로 스트릭으로 늘어나며 워프 느낌을 냄(drawBgLayer2/3 참고).
    const accelT = Math.min(1, launchElapsed / LAUNCH_WARP_ACCEL_MS);
    const accelEase = accelT * accelT; // ease-in
    return {
      y: launchCenterY + bobY,
      x: launchCenterXBase + bobX,
      scale: 1, shadowScale: 1, stationOffset: 1,
      bgSpeedMul: LAUNCH_STATION_BG_SPEED_MUL + (20 - LAUNCH_STATION_BG_SPEED_MUL) * accelEase,
      layer1Alpha: 0, bgAlpha: 1
    };
  }
  if(launchPhase === 'descend'){
    if(launchElapsed < LAUNCH_DESCEND_BG_MS){
      // 1단계: 기체는 cruise 위치에 정지, 배경 배속만 20배속에서 서서히 1배속으로 복귀(파티클도 자연스럽게 원래 모양으로 돌아옴).
      // 가속(ease-in, t^2)의 정확히 반대인 ease-out(1-(1-t)^2)으로 감속해 대칭되는 느낌을 줌.
      // 행성 배경(layer1)은 아직 숨긴 채로 유지 — 속도가 완전히 1배속으로 돌아온 뒤(2단계)에 페이드인 시작.
      const t = Math.min(1, launchElapsed / LAUNCH_DESCEND_BG_MS);
      const decelEase = 1 - Math.pow(1 - t, 2); // ease-out
      return {
        y: launchCenterY,
        scale: 1,
        shadowScale: 1,
        stationOffset: 1,
        bgSpeedMul: 20 - 19 * decelEase, // 20배속에서 정상 속도(1배)까지 ease-out으로 감속
        layer1Alpha: 0,
        bgAlpha: 1
      };
    }
    // 2단계: 배경 배속은 이미 1배속으로 완전히 정상화된 상태. 이 시점부터 행성 배경(layer1)이 0->1로
    // 서서히 페이드인되며, 기체도 동시에 천천히(1초) 출발해 부드럽게 안착(ease-out)
    const t = Math.min(1, (launchElapsed - LAUNCH_DESCEND_BG_MS) / LAUNCH_DESCEND_MOVE_MS);
    const ease = 1 - Math.pow(1 - t, 3);
    return {
      y: launchCenterY + ((H - 80) - launchCenterY) * ease,
      scale: 1,
      shadowScale: 1,
      stationOffset: 1,
      bgSpeedMul: 1,
      layer1Alpha: t, // 속도 정상화 완료 후 서서히 나타남
      bgAlpha: 1
    };
  }
  // 'title' 단계: 기본 위치에 정지, 스테이션은 화면 밖, 배경은 원래 속도로 복귀 완료
  return { y: H - 80, scale: 1, shadowScale: 1, stationOffset: 1, bgSpeedMul: 1, layer1Alpha: 1, bgAlpha: 1 };
}

// ---- 스테이지 클리어 연출: 주인공이 가속 축소되며 행성(화면 상단) 쪽으로 사라지는 비행 ----
// stage.js의 clearSubPhase==='fly' 구간 동안 index.html에서 매 프레임 호출.
// t: 0(비행 시작, 현재 위치)~1(비행 완료, 화면 밖/행성 근처로 사라짐).
// ease-in(t^3)으로 처음엔 천천히 출발했다가 점점 더 빠르게 가속하는 곡선을 사용.
// 시작 좌표는 'fly' 진입 순간의 실제 플레이어 위치(clearFlyStartX/Y, 보스 격파 시점 좌표 그대로)를
// 사용 — 과거엔 무조건 화면 중앙(W/2, H-80)에서 시작해 격파 위치와 다르면 순간이동하듯 보였음.
let clearFlyStartX = W/2, clearFlyStartY = H - 80;
function getClearFlyRenderState(t){
  const ease = Math.min(1, t) ** 3; // 가속도가 점점 붙는 느낌(3제곱 ease-in)
  const targetX = W/2, targetY = -40; // 화면 상단(행성 배경 방향)으로 사라짐
  return {
    x: clearFlyStartX + (targetX - clearFlyStartX) * ease,
    y: clearFlyStartY + (targetY - clearFlyStartY) * ease,
    scale: 1 // 요청사항: 축소 없이 원래 크기 유지한 채 위로 사라짐
  };
}

// 기체 스프라이트를 검은 실루엣(그림자용)으로 변환한 오프스크린 캔버스를 이미지별로 캐싱.
// (ctx.filter='brightness(0)'는 Safari 등 일부 브라우저에서 canvas에 제대로 적용되지 않는 경우가 있어,
//  composite 연산(source-in)으로 투명도는 유지한 채 보이는 픽셀만 확실하게 검정으로 칠하는 방식을 사용)
const playerShadowCanvasCache = new Map();
function getPlayerShadowCanvas(img){
  let shadow = playerShadowCanvasCache.get(img);
  if(shadow) return shadow;
  const size = img.naturalWidth;
  const c = document.createElement('canvas');
  c.width = size; c.height = img.naturalHeight;
  const sctx = c.getContext('2d');
  sctx.drawImage(img, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#000000';
  sctx.fillRect(0, 0, c.width, c.height);
  playerShadowCanvasCache.set(img, c);
  return c;
}

// 주인공 기체를 그림. 무적 중이면 실제 시간 기반으로 깜빡이고(짝수 구간만 그림),
// 떠오름 애니메이션 진행 중이면 아래쪽 오프셋을 더해 화면 아래에서 위로 올라오는 것처럼 보이게 함.
// 발사 시퀀스 진행 중에는 크기를 별도로 계산해 발사대 이탈 연출을 그림.
function drawPlayerWithEffects(){
  if(playerInvincible){
    const blinkOn = Math.floor(Date.now() / PLAYER_BLINK_INTERVAL_MS) % 2 === 0;
    if(!blinkOn) return; // 깜빡임의 꺼짐 구간에는 그리지 않음
  }
  let renderY = player.y;
  let renderX = player.x;
  let renderScale = 1;
  let shadowScale = 0; // 0이면 그림자 안 그림 (발사 시퀀스의 sit/grow/hold 단계에서만 사용)
  let shadowLiftBias = 0; // 0(발사대 위 sit)~1(100% 확대 완료), 떠오를수록 그림자가 왼쪽 아래로 벌어짐
  if(launchSequenceActive){
    const st = getLaunchRenderState();
    renderY = st.y;
    if(st.x !== undefined) renderX = st.x; // cruise 단계에서만 좌우로 살짝 흔들리는 x 오프셋 적용
    renderScale = st.scale;
    // dash 단계부터는 기체가 스테이션을 벗어나 날아가는 연출이라 그림자를 그리지 않음
    if(launchPhase === 'sit' || launchPhase === 'grow' || launchPhase === 'hold'){
      shadowScale = st.shadowScale;
      const growRange = 1 - LAUNCH_SIT_SCALE;
      shadowLiftBias = growRange > 0 ? Math.max(0, Math.min(1, (renderScale - LAUNCH_SIT_SCALE) / growRange)) : 1;
    }
  } else if(typeof stagePhase !== 'undefined' && stagePhase === 'clear' && clearSubPhase === 'fly'){
    // 스테이지 클리어 연출: 주인공이 가속 축소되며 행성 쪽으로 사라짐(그림자 없음)
    const t = clearSubPhaseElapsed / CLEAR_FLY_MS;
    const st = getClearFlyRenderState(t);
    renderX = st.x; renderY = st.y; renderScale = st.scale;
  } else if(playerRespawnTimer > 0){
    const t = 1 - (playerRespawnTimer / PLAYER_RESPAWN_RISE_DURATION); // 0(시작) -> 1(완료)
    const ease = 1 - Math.pow(1 - t, 2); // ease-out: 빠르게 올라오다 서서히 감속
    renderY = player.y + PLAYER_RESPAWN_RISE_DISTANCE * (1 - ease);
  }
  const img = playerFrames[Math.floor(Date.now() / PLAYER_FRAME_INTERVAL_MS) % playerFrames.length];
  if(!img || !img.complete || img.naturalWidth === 0) return;
  const size = 96 * renderScale;
  if(shadowScale > 0){
    // 기체 스프라이트의 검은 실루엣(그림자용 오프스크린 캔버스)을 재사용 - 기체와 완전히 동일한 모양.
    // 떠오를수록(shadowLiftBias -> 1) 그림자가 기체 오른쪽 아래로 살짝 벌어져 공중에 뜬 느낌을 줌.
    const shadowSize = size;
    const shadowOffsetX = 10 * shadowScale * shadowLiftBias; // 100%로 떠오를수록 오른쪽으로 살짝 벌어짐
    const shadowOffsetY = (10 + 14 * shadowLiftBias) * shadowScale; // 아래로도 더 벌어짐(떠오를수록 커짐)
    const shadowImg = getPlayerShadowCanvas(img);
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.translate(renderX + shadowOffsetX, renderY + shadowOffsetY);
    ctx.scale(1, 0.55); // 바닥에 깔린 것처럼 세로로 압축
    ctx.drawImage(shadowImg, -shadowSize/2, -shadowSize/2, shadowSize, shadowSize);
    ctx.restore();
  }
  ctx.drawImage(img, renderX - size/2, renderY - size/2, size, size);
}

// ---- 아이템 (P: 파워 강화 스택형, W: 3방향 스프레드) ----
const itemAssets = { P: 'assets/optimized/item_p_sm.png', W: 'assets/optimized/item_w_sm.png' };
const itemImgs = {};
Object.entries(itemAssets).forEach(([key, src])=>{
  const img = new Image();
  img.src = src;
  itemImgs[key] = img;
});

// 폭탄 HUD 아이콘 스프라이트 (item_r/item_w와 동일 프레임 틀, 색상만 붉은 계열로 변경 + 알파벳 B)
const bombIconImg = new Image();
bombIconImg.src = 'assets/optimized/item_bomb_sm.png';
itemImgs['B'] = bombIconImg; // 낙하 아이템도 동일 비주얼 재사용
let items = []; // {type:'P'|'W'|'B', x, y, vy}
const ITEM_FALL_SPEED = 90; // px/s
const ITEM_SIZE_P = 115; // px, W 아이템과 동일 크기(요청사항)
const ITEM_SIZE_W = 115; // px
const ITEM_SIZE_B = 90; // px, 폭탄 아이템(P와 동일 크기)
const BOMB_MAX_STOCK = 4; // 폭탄 보유 상한
// 요청사항: 기본 파워값은 4("R 4개 먹은 것과 동일한 연사"로 시작), P 아이템을 먹을 때마다 +1,
// 최대 PLAYER_POWER_MAX(8)까지 강화. 기존 R 스택 시스템을 완전히 대체.
let playerPower = PLAYER_POWER_BASE;
let playerHasW = false; // W 아이템 획득 여부 (3방향 스프레드), 획득하면 더 이상 W 아이템 드랍 안 됨
// P/W/B는 격파 드랍과 무관하게 stage.js에서 시간 기반으로 독립 등장(STAGE1_P_SPAWN_*, STAGE1_W_SPAWN_*, STAGE1_B_SPAWN_* 참고)

function itemSizeFor(type){
  return type === 'W' ? ITEM_SIZE_W : (type === 'B' ? ITEM_SIZE_B : ITEM_SIZE_P);
}

function spawnItem(type, x, y){
  // 등장 시 근처 적 탄환과 겹치지 않도록 x좌표를 살짝 밀어냄 (겹침 회피)
  const size = itemSizeFor(type);
  const avoidRadius = size/2 + 20; // 탄환 반경(6px) 포함 여유
  const margin = size/2 + 10;
  let attempts = 0;
  while(attempts < 8 && typeof bullets !== 'undefined' && bullets.some(b => Math.hypot(b.x - x, b.y - y) < avoidRadius)){
    x += (Math.random() < 0.5 ? -1 : 1) * (avoidRadius + 10);
    x = Math.max(margin, Math.min(W - margin, x));
    attempts++;
  }
  // 요청사항: 아이템이 제자리 흔들림이 아니라, 화면 전체를 랜덤한 목표점으로 계속 이동하며
  // 둥둥 떠다니게 함. A1 라인(그리드 행1 경계, H/5*1=144px) 위로는 절대 못 올라가고, 그 아래
  // 영역에서만 돌아다님.
  const floatMargin = size/2 + 6;
  items.push({
    type, x, y, vy: 0, pulseSeed: Math.random()*Math.PI*2,
    floatTargetX: x, floatTargetY: Math.max(y, H/5 + floatMargin),
    floatSpeed: 110 + Math.random()*40 // px/s, 요청사항: 기존(220~300)의 절반으로 하향
  });
}

function drawItem(it){
  const img = itemImgs[it.type];
  if(!img || !img.complete || img.naturalWidth === 0) return;
  const size = itemSizeFor(it.type);
  // 발광했다 안했다 하는 펄스 연출 (실제 시간 기반, dt 무관)
  const pulse = 0.5 + 0.5 * Math.sin(Date.now()/220 + (it.pulseSeed || 0));
  const dx = it.drawX != null ? it.drawX : it.x;
  const dy = it.drawY != null ? it.drawY : it.y;
  ctx.save();
  ctx.shadowColor = it.type === 'P' ? '#ff9a3c' : (it.type === 'B' ? '#ff4d4d' : '#c77dff');
  ctx.shadowBlur = 8 + pulse * 22;
  ctx.globalAlpha = 0.75 + pulse * 0.25;
  ctx.drawImage(img, dx - size/2, dy - size/2, size, size);
  ctx.restore();
}

const ITEM_AVOID_SPEED = 220; // px/s, 아이템이 탄환을 피하는 좌우 최대 회피 속도

// 낙하 중에도 매 프레임 근처 적 탄환을 좌우로 피하도록 스티어링 (즉시 텔레포트가 아닌 dt 기반 이동)
function avoidBulletsForItem(it, dt){
  const size = itemSizeFor(it.type);
  const avoidRadius = size/2 + 20;
  let pushX = 0;
  if(typeof bullets !== 'undefined'){
    bullets.forEach(b=>{
      const dx = it.x - b.x, dy = it.y - b.y;
      const d = Math.hypot(dx, dy);
      if(d < avoidRadius && d > 0.001){
        pushX += (dx/d) * ((avoidRadius - d) / avoidRadius);
      }
    });
  }
  it.x += pushX * ITEM_AVOID_SPEED * dt;
  const margin = size/2 + 4;
  it.x = Math.max(margin, Math.min(W - margin, it.x));
}

// ---- 적 종류별 on/off 스위치 (일반1↔일반2, 일반4↔일반5는 짝으로 함께 제어) ----
const enabledTypes = { normal1:true, normal2:true, normal3:true, normal4:true, normal5:true, normal6:true, normal7:true, normal8:true };

// ---- 공용 스폰 사이클/타이머 상수 ----
let spawnTimer = 0; // ms 누적
let normal7SpawnTimer = 0; // ms 누적
let normal7Alive = false; // 화면에 일반7이 존재하는지 여부 (동시 1기 운용)
let normal7RespawnTimer = 0; // 0이면 대기 없음, >0이면 카운트다운 중 (ms)
const NORMAL7_RESPAWN_DELAY = 1500; // 격파 후 재등장까지 지연 (ms)
const spawnCycle = ['normal2','normal3','normal6']; // 일반1/4/5/7/8은 별도 타이머로 분리
// 일반4/5 전용: 6초마다 1편대씩(일반4 → 일반5 번갈아). 해당 구간에서 켜진 쪽만 등장.
const NORMAL45_SPAWN_INTERVAL = 10000; // ms, 10초마다 1편대(4 또는 5 중 랜덤)
let normal45SpawnTimer = 0; // ms 누적
let cycleIdx = 0;
const MAX_ENEMIES_ON_SCREEN = 10; // 화면 내 동시 존재 상한 (항상 8~10기 유지되도록 목표치와 함께 사용)
const NORMAL_SPAWN_INTERVAL = 350; // 공용 사이클 spawn 체크 간격(ms) — 인원 미달 시 이 주기로 즉시 재시도해 격파 즉시 채움
const NORMAL7_SPAWN_INTERVAL = 4000;  // 일반7 spawn 간격(ms)
let normal8SpawnTimer = 0; // ms 누적, spiral(일반8) 전용 스폰 타이머
const NORMAL8_SPAWN_INTERVAL = 10000; // spiral 등장 간격: 1기 등장 후 10초 뒤 다음 등장

// ---- 스폰 함수 (모든 이동속도는 px/s, 모든 타이머는 ms 기준) ----

// ---- 일반1 신규 패턴 전용 상수 (B라인→D라인 반원 U턴, 요청사항 확정 수치) ----
// 그리드 체계: 가로 10등분(A~K 열), 세로 5등분(0~5 행). B열=1번 컬럼, D열=3번 컬럼.
// 미러(우측) 라인: J열=9번 컬럼(B의 좌우 대칭), H열=7번 컬럼(D의 좌우 대칭).
const NORMAL1_COL_W = W / 10;
const NORMAL1_B_X = NORMAL1_COL_W * 1; // B라인(좌측 시작)
const NORMAL1_D_X = NORMAL1_COL_W * 3; // D라인(좌측 전환 목적지)
const NORMAL1_J_X = NORMAL1_COL_W * 9; // J라인(우측 시작, B의 미러)
const NORMAL1_H_X = NORMAL1_COL_W * 7; // H라인(우측 전환 목적지, D의 미러)
const NORMAL1_TURN_Y = (H / 5) * 3; // B3 지점(3번째 행 경계선) 높이에서 U턴 시작
const NORMAL1_DESCEND_SPEED = 389; // px/s
const NORMAL1_ASCEND_SPEED = 435; // px/s
const NORMAL1_SPACING = 138; // px, 편대 간격
const NORMAL1_TURN_MS = 137; // ms, U턴 소요 시간
const NORMAL1_TRAIL_COUNT = 1; // 기체당 발사 개수
const NORMAL1_TRAIL_INTERVAL_MS = 216; // 탄 생성 간격
const NORMAL1_TRAIL_FALL_SPEED = 151; // px/s, 탄 낙하 속도
const NORMAL1_RESPAWN_DELAY_MS = 1209; // ms, 편대 전원 퇴장 후 재등장까지 대기(요청사항)
let normal1RespawnTimer = 0; // ms 누적
// 좌/우 등장 순서 상태(요청사항): stageElapsed < 130000(130초)이면 "왼쪽 한 번 → 2초 뒤 오른쪽
// 한 번" 패턴을 반복하고, 130초부터는 양쪽을 동시에 등장시킴.
// normal1SideState: 'left'(다음 왼쪽 차례) / 'waitRight'(오른쪽 등장까지 2초 대기 중) / 'right'(다음 오른쪽 차례, 대기 종료)
let normal1SideState = 'left';
let normal1SideWaitTimer = 0;
const NORMAL1_SIDE_GAP_MS = 2000; // 요청사항: 왼쪽 등장 후 오른쪽 등장까지 2초

function spawnNormal1(){
  const bothSides = (typeof stageElapsed !== 'undefined') && stageElapsed >= 130000;
  if(bothSides){
    // 양쪽에서 동시에 3대씩(총 6대) 등장
    spawnNormal1Squad(NORMAL1_B_X, NORMAL1_D_X);
    spawnNormal1Squad(NORMAL1_J_X, NORMAL1_H_X);
    return;
  }
  if(normal1SideState === 'left'){
    spawnNormal1Squad(NORMAL1_B_X, NORMAL1_D_X); // 왼쪽 등장
    normal1SideState = 'waitRight';
    normal1SideWaitTimer = 0;
  } else if(normal1SideState === 'right'){
    spawnNormal1Squad(NORMAL1_J_X, NORMAL1_H_X); // 왼쪽과 완전히 미러(좌우 대칭 라인)
    normal1SideState = 'left';
  }
  // 'waitRight' 상태일 때는 아무 것도 스폰하지 않음(index.html의 전용 타이머가 2초 경과를 기다려
  // normal1SideState를 'right'로 전환시킴).
}
function spawnNormal1Squad(startX, endX){ // 3대 편대, startX 하강 → B3에서 반원 U턴 → endX 상승하며 탄 남기고 퇴장
  for(let i=0;i<3;i++){
    enemies.push({
      type:'normal1', x: startX, y: -40 - i*NORMAL1_SPACING,
      startX, endX, // 이동 분기에서 좌/우 어느 편대인지 참조
      phase: 'descend', // descend -> turn -> ascend
      turnElapsed: 0, turnStartX: startX, turnStartY: 0,
      trailTimer: 0, trailFiredCount: 0,
      hp:2, score:90
    });
  }
}
function spawnNormal2(){ // 일반2: 일반1과 동일 스탯, 지그재그 없이 위에서 아래로 직선 이동만
  const count = 2 + Math.floor(Math.random()*2); // 2~3대
  const margin = 90;
  const minGapX = 70;
  const positions = [];
  for(let i=0;i<count;i++){
    let x;
    let attempts = 0;
    do {
      x = margin + Math.random()*(W - margin*2);
      attempts++;
    } while(positions.some(p => Math.abs(p - x) < minGapX) && attempts < 10);
    positions.push(x);
    enemies.push({
      type:'normal2', x, baseX: x, y: -40 - Math.random()*260,
      vy:110, hp:2, score:90, cool:0, fireRate:2000
    });
  }
}
function spawnNormal3(opts){ // 일반3: 정찰 드론 (opts.x로 좌표 고정 가능, 보스전 쌍 소환용)
  const x = (opts && opts.x != null) ? opts.x : 80 + Math.random()*(W-160);
  enemies.push({
    type:'normal3', x, y:-30,
    vy:90, hp:7, score:50, cool:0, fireRate:1250
  });
}
// 일반4/5: 감염형 편대. Zone-3 높이에서 등장해 Zone-1 높이로 대각선 이동하며 빠져나감.
// 3대가 진행 방향으로 일렬(앞·중간·뒤)로 따라붙고, 가운데 기체가 0.9초 뒤 180도 9발 부채꼴 1회 발사.
// 10초마다 일반4 또는 일반5 중 하나만 랜덤으로 등장(기존처럼 번갈아 가며 둘 다 나오지 않음).
const NORMAL45_SPEED = 430;          // px/s, 대각선 이동 속도
const NORMAL45_SPACING = 70;         // 편대 기체 간격(진행 방향 기준)
function spawnNormal45(dir){         // dir: 1 = 일반4(왼쪽→오른쪽), -1 = 일반5(오른쪽→왼쪽)
  const startX = dir > 0 ? -50 : W + 50, endX = dir > 0 ? W + 50 : -50;
  const startY = ZONE_HEIGHT * 2.3;  // Zone-3 높이에서 등장
  const endY = ZONE_HEIGHT * 0.4;    // Zone-1 높이로 퇴장
  const dx = endX - startX, dy = endY - startY, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const vx = ux * NORMAL45_SPEED, vy = uy * NORMAL45_SPEED;
  const squadId = 'squad_' + Date.now() + '_' + Math.random();
  for(let k=0;k<3;k++){              // k=0 선두, 1 가운데(리더), 2 후미
    const back = k * NORMAL45_SPACING;
    enemies.push({
      type:'normal4', x: startX - ux*back, y: startY - uy*back, // 일반5도 같은 type(에셋/탄막 공유), vx 부호로 구분
      vx, vy, hp:8, score:70, cool:0, squadId,
      // 요청사항: 리더가 "교차 부채꼴"을 2세트 연속 쏘고 1.5초 쉬었다가 다시 2세트... 반복(퇴장 전까지).
      isSquadLeader: k === 1, fireDelay: 900, crossFanState: 'wait', crossFanSetCount: 0,
      crossFanShotTimer: 0, crossFanRestTimer: 0, crossFanToggle: false
    });
  }
}
function spawnNormal4(){ spawnNormal45(1); }
function spawnNormal5(){ spawnNormal45(-1); }
function spawnNormal6(){ // 일반6: 램(Ram), 고속 몸통박치기. Zone-1까지는 직선 하강, Zone-2부터는 플레이어 방향으로 서서히 조준
  const x = 60 + Math.random()*(W-120);
  const y = -40;
  const speed = 400; // 빠른 돌진 속도, px/s
  enemies.push({
    type:'normal6', x, y,
    vx: 0, vy: speed, // Zone-1까지는 아래로 직진
    speed,
    homing: false, // Zone-2 진입 후 true로 전환
    hp:3, score:120
  });
}
function spawnNormal7(){ // 일반7: Stubby
  const margin = 90;
  const x = margin + Math.random()*(W - margin*2);
  enemies.push({
    type:'normal7', x, y:-40, targetY: (Math.random()<0.5 ? ZONE_HEIGHT : ZONE_HEIGHT*2), // Zone-2 또는 Zone-3 경계선 중 랜덤
    settled:false, vy:210, hp:35, score:110, cool:0, fireRate:1833, burstFired:false // 등장(Zone-2 도달) 속도를 빠르게
  });
  normal7Alive = true;
}

const NORMAL8_SPIN_SPEED = 2.4; // rad/s, 바람개비 자체 회전 속도(시각 연출)
const NORMAL8_STAY_MS = 5000; // ms, 정지 후 이 시간이 지나면 다시 위로 퇴장 시작
const NORMAL8_RETREAT_SPEED = 150; // px/s, 퇴장 시 위로 올라가는 속도
function spawnNormal8(opts){ // 일반8: 바람개비 UFO, 등장 후 정지해 나선형(spiral) 탄막 반복 발사 -> 5초 후 위로 퇴장
  const margin = 90;
  const x = (opts && opts.x !== undefined) ? opts.x : margin + Math.random()*(W - margin*2);
  const targetY = (opts && opts.targetY !== undefined) ? opts.targetY : (Math.random()<0.5 ? ZONE_HEIGHT : ZONE_HEIGHT*2);
  enemies.push({
    type:'normal8', x, y:-60, targetY, // Zone-2 또는 Zone-3 경계선 중 랜덤(옵션으로 지정 가능)
    settled:false, retreating:false, stayTimer:0, vy:150, hp:35, score:130, cool:0, fireRate:90,
    spiralAngle: Math.random()*Math.PI*2, spawnTime: Date.now() // 회전 애니메이션 기준 시각
  });
}

// 보스전 전용: 2기를 보스(x:W/2)와 겹치지 않도록 좌우로 벌려 동시 배치.
// 스테이지1은 spiral(일반8), 스테이지2는 요청에 따라 normal3(정찰 드론)를 사용.
const BOSS_SPIRAL_PAIR_OFFSET_X = 130; // px, 화면 중앙(보스 위치)에서 좌우로 벌리는 거리
function spawnBossSpiralPair(){
  spawnNormal8({ x: W/2 - BOSS_SPIRAL_PAIR_OFFSET_X, targetY: ZONE_HEIGHT * 2 });
  spawnNormal8({ x: W/2 + BOSS_SPIRAL_PAIR_OFFSET_X, targetY: ZONE_HEIGHT });
}
function spawnBossNormal3Pair(){
  spawnNormal3({ x: W/2 - BOSS_SPIRAL_PAIR_OFFSET_X });
  spawnNormal3({ x: W/2 + BOSS_SPIRAL_PAIR_OFFSET_X });
}

function spawnBoss1(){ // 보스1: 외계 문명 중형 기체 (일반7의 약 2.3배 크기)
  enemies.push({
    type:'boss1', x: W/2, y:-140, targetY: ZONE_HEIGHT * 1.25, // Zone-1과 Zone-2 경계선보다 조금 더 아래로 조정(요청사항)
    settled:false, vy:50, hp:600, maxHp:600, score:2000, // HP 500(사용자 요청으로 300->500 상향). 하강 속도(vy) 80->50px/s로 늦춰 더 천천히 등장
    size:240, cool:0,
    // 좌우 이동↔정지 발사 상태 머신 (등장 완료 후부터 동작)
    moveState:'move', moveTargetX: null, moveSpeed:180, // px/s, 좌우 이동 속도
    minMoveDist:120, // px, 한 번 이동 시 최소 이동 거리
    moveCount:0, // 완료한 이동 횟수 (2회차부터 레이저, 5회차부터 스윕 레이저)
    fireRound:0, fireCool:0, fireElapsed:0, sweepThisRound:false, // fireElapsed: 정지 발사 단계 진입 후 누적 경과(ms), 레이저 충전/스윕 타이밍용
    sweepCenterAngle:0, sweepCenterSet:false // 스윕 시작 시점 플레이어 방향으로 중심각 고정
  });
}

// ---- 보스2 (스테이지2 전용, 거미형 기계) ----
// 보스1과 동일한 좌우 이동↔정지 발사 상태 머신 골격을 쓰되, 발사 패턴은 web/venom/legVolley 3종을
// 조합해서 사용(아래 11절 참고). 다리 보행 애니메이션은 이동 중에만 진행되고 정지 중엔 고정됨
// (frameFrozenIdx에 멈춘 프레임 번호를 저장, index.html의 그리기 쪽에서 참조).
const BOSS2_PATTERN_SEQUENCE_SOLO = ['web', 'venom', 'legVolley']; // 전투 시작 후 1회차: 한 번씩 단독으로 보여줌
const BOSS2_PATTERN_COMBOS = [['web','venom'],['web','legVolley'],['venom','legVolley']]; // 2회차부터 랜덤 조합(2개 동시)
function spawnBoss2(){ // 보스2: 거미형 기계 (스테이지2 전용)
  enemies.push({
    type:'boss2', x: W/2, y:-140, targetY: ZONE_HEIGHT * 1.25, // 보스1과 동일하게 조금 더 아래로 조정(요청사항)
    settled:false, vy:50, hp:800, maxHp:800, score:3000, // HP 800(사용자 요청)
    size:220, cool:0,
    // 좌우 이동↔정지 발사 상태 머신: 이동 2초 후 정지해 발사(요청사항), 발사 시간은 패턴에 따라 다름
    moveState:'move', moveTargetX: null, moveSpeed:150,
    minMoveDist:100,
    moveElapsed:0, // 'move' 상태 진입 후 누적 경과(ms), 2초 되면 'fire'로 전환
    MOVE_DURATION_MS: 2000,
    fireElapsed:0, // 'fire' 상태 진입 후 누적 경과(ms)
    legFrameIdx:0, legFrameTimer:0, // 다리 보행 애니메이션 프레임/타이머(이동 중에만 진행)
    soloPatternIdx:0, // 전투 시작 후 1회차(web->venom->legVolley 순으로 단독 등장)에 사용할 인덱스
    usedSoloIntro:false, // 1회차 솔로 소개가 끝났는지(끝나면 이후부터는 랜덤 2개 조합)
    currentPatterns:['web'], // 이번 'fire' 구간에서 실제로 사용할 패턴 배열(1개 또는 2개)
    webFireTimer:0, webFireIdx:0, // 거미줄 패턴 전용 타이머
    venomFireTimer:0, // 독액 낙하 패턴 전용 타이머
    legVolleyFireTimer:0, legVolleyIdx:0 // 다리 연계 사격 전용 타이머/다리 인덱스
  });
}

// ---- 탄 발사 패턴 ----
const BULLET_MAX_LIFE_MS = 13000; // 적 탄환 최대 생존 시간(ms). 가장 느린 일반 탄(fireAimed 기본 100px/s)이
// 화면 맨 위(y≈-300)에서 맨 아래(y≈740)까지 가는 데 최대 약 10.4초가 걸리므로, 그보다 넉넉히 길게
// 설정해 중간에 사라지지 않도록 함(기존 6000ms는 너무 짧아 끝까지 못 가고 사라지는 버그가 있었음).
// 비정상적으로 느린 탄에 대한 안전장치 역할은 유지됨.

function liteBullet(x,y,r,color){
  ctx.save();
  ctx.globalAlpha = (typeof bulletFadeAlpha !== 'undefined') ? bulletFadeAlpha : 1; // WARNING! 단계 동안 서서히 페이드아웃
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// 수직 단발: 조준 없이 항상 아래 방향(90도)으로 발사. 일반1 전용.
function fireStraightDown(e, color, speed){
  bullets.push({x:e.x,y:e.y,vx:0,vy:speed,r:6,color});
  playEnemyShootSound();
}

function fireAimed(e, color, speed){ // speed: px/s
  const dx = player.x - e.x, dy = player.y - e.y;
  const d = Math.hypot(dx,dy) || 1;
  let ux = dx/d, uy = dy/d;
  // 일반1/2처럼 조준 단발을 쏘는 적은, 조준 각도에 따라 수직 속도(vy)가 매우 작아지면
  // 화면 맨 아래까지 도달하는 데 너무 오래 걸려 수명 제한(BULLET_MAX_LIFE_MS) 전에 끝까지
  // 못 가고 사라지는 문제가 있었음. 실제 하강 속도(vy)가 항상 MIN_VY 이상이 되도록
  // 전체 속도를 필요한 만큼 증폭(각도는 그대로 유지, 속도 스칼라만 키움).
  const MIN_VY = 90; // px/s, 화면 전체 세로 길이(720)를 아무리 느려도 5초 안에는 지나갈 수 있는 하한
  let actualSpeed = speed;
  const vyAtBaseSpeed = Math.abs(uy) * speed;
  if(vyAtBaseSpeed < MIN_VY){
    actualSpeed = (uy !== 0) ? MIN_VY / Math.abs(uy) : speed;
  }
  bullets.push({x:e.x,y:e.y,vx:ux*actualSpeed,vy:uy*actualSpeed,r:6,color});
  playEnemyShootSound();
}

// 고정 좌표(targetX, targetY) 방향으로 발사 (플레이어 조준이 아닌 화면상 고정 지점 조준)
function fireToward(e, color, speed, targetX, targetY){
  const dx = targetX - e.x, dy = targetY - e.y;
  const d = Math.hypot(dx,dy) || 1;
  bullets.push({x:e.x,y:e.y,vx:dx/d*speed,vy:dy/d*speed,r:6,color});
  playEnemyShootSound();
}

// 25도 스프레드 2발 (정면 기준 좌우 12.5도씩)
function fireSpread2(e, color, speed, spreadDeg){
  const spreadRad = spreadDeg * Math.PI/180;
  const base = Math.PI/2; // 아래 방향
  const a1 = base - spreadRad/2;
  const a2 = base + spreadRad/2;
  bullets.push({x:e.x,y:e.y,vx:Math.cos(a1)*speed,vy:Math.sin(a1)*speed,r:6,color});
  bullets.push({x:e.x,y:e.y,vx:Math.cos(a2)*speed,vy:Math.sin(a2)*speed,r:6,color});
  playEnemyShootSound();
}

// 스테이지2부터 일반3이 사용하는 신규 탄막: 9발이 반경18px, 회전축을 30도 기울여
// 내려오는 "원통형(링 전체 회전)" 탄막. 사용자 요청 수치로 재조정
// (9발, omega 5rad/s, radius 18px, speed 140px/s, 회전축 기울기 30도).
function fireScrewCylinder(e, color){
  const strands = 9, omega = 5, radius = 18, speed = 140;
  const wobbleRad = 30 * Math.PI/180;
  const wobbleDirX = Math.cos(wobbleRad), wobbleDirY = Math.sin(wobbleRad);
  const baseAngle = Math.random() * Math.PI * 2;
  for(let i=0;i<strands;i++){
    bullets.push({
      kind:'screw', ox:e.x, oy:e.y, x:e.x, y:e.y, wobbleDirX, wobbleDirY,
      vy: speed, omega, radius, baseAngle: baseAngle + (Math.PI*2/strands)*i,
      age: 0, r:6, color
    });
  }
  playEnemyShootSound();
}

function fireFan3(e, color, speed){
  const spread = Math.PI/3; // 양쪽 30도 (총 60도)
  const base = Math.PI/2;
  for(let i=0;i<3;i++){
    const a = base - spread/2 + spread*(i/2);
    bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:6,color});
  }
  playEnemyShootSound();
}

// 일반7(Stubby) 쌍포신 끝 좌표(스프라이트 비율 기준 오프셋, size=104 기준으로 스케일).
const NORMAL7_MUZZLE_OFFSETS = [ {x:-0.11, y:0.42}, {x:0.11, y:0.42} ];
function getNormal7Muzzles(e){
  const size = 104;
  return NORMAL7_MUZZLE_OFFSETS.map(o=>({ x: e.x + o.x*size, y: e.y + o.y*size }));
}
// 요청사항(normal7_bullet_patterns_sample.html "5. 쌍포 교차 직선탄", 4줄 버전): 좌측 포신에서
// 우측 하단(교차)+좌측 하단(평행) 2방향, 우측 포신에서 좌측 하단(교차)+우측 하단(평행) 2방향,
// 총 4줄을 동시에 발사해 X자 그물 2겹을 만듦. count발을 lineSpacing(ms) 간격으로 연속 발사.
const NORMAL7_CROSSBEAM_SPEED = 200;
const NORMAL7_CROSSBEAM_LINE_SPACING_MS = 60; // 4줄을 한 번에 쏘지 않고 살짝 시차를 둠(index.html의 상태 타이머가 호출 간격을 관리)
function fireNormal7CrossBeamLine(e, color){
  const [left, right] = getNormal7Muzzles(e);
  const targets = [
    { from: left,  to: { x: W-40, y: H+40 } }, // 좌포 -> 우측 하단(교차)
    { from: left,  to: { x: 40,   y: H+40 } }, // 좌포 -> 좌측 하단(평행)
    { from: right, to: { x: 40,   y: H+40 } }, // 우포 -> 좌측 하단(교차)
    { from: right, to: { x: W-40, y: H+40 } }  // 우포 -> 우측 하단(평행)
  ];
  targets.forEach(({from, to})=>{
    const dx = to.x - from.x, dy = to.y - from.y;
    const d = Math.hypot(dx,dy) || 1;
    bullets.push({x: from.x, y: from.y, vx: dx/d*NORMAL7_CROSSBEAM_SPEED, vy: dy/d*NORMAL7_CROSSBEAM_SPEED, r:6, color});
  });
  playEnemyShootSound();
}

// 조준 없이 고정 중심각(기본 아래 방향) 기준으로 넓은 부채꼴에 N발을 균등 배치해 동시 발사.
// (Unity 참고 코드의 Fire180Degrees 로직과 동일: 부채꼴 폭을 (개수-1)등분해 간격을 구하고,
// 중심각 - 폭/2 지점부터 순서대로 배치. 여기서는 플레이어 방향 조준을 하지 않고 항상 정면(아래) 기준.)
function fireFanN(e, color, speed, bulletCount, spreadDeg){
  const spreadRad = spreadDeg * Math.PI/180;
  const base = Math.PI/2; // 아래 방향(정면) 기준, 조준하지 않음
  const angleStep = bulletCount > 1 ? spreadRad / (bulletCount - 1) : 0;
  const startAngle = base - spreadRad/2;
  for(let i=0;i<bulletCount;i++){
    const a = startAngle + angleStep * i;
    bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:6,color});
  }
  playEnemyShootSound();
}

// 일반4/5 신규 패턴(요청사항, normal4_bullet_patterns_sample.html의 "1. 교차 부채꼴" 반영):
// 리더 기체 중심에서 70도 부채꼴(9발)을 좌/우 번갈아 20도씩 기울여 발사. 호출될 때마다
// e.crossFanToggle이 반전되어 다음 호출은 반대쪽으로 기움(교차 효과).
function fireNormal4CrossFan(e, color, speed){
  const count = 9, spread = 70 * Math.PI/180;
  const tilt = (e.crossFanToggle ? 1 : -1) * 20 * Math.PI/180;
  e.crossFanToggle = !e.crossFanToggle;
  const base = Math.PI/2 + tilt;
  for(let i=0;i<count;i++){
    const a = base - spread/2 + spread*(i/(count-1));
    bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:6,color});
  }
  playEnemyShootSound();
}

// 일반8(바람개비 UFO): 매 발사마다 SPIRAL_COUNT_PER_SHOT방향(등간격) 동시 발사 + 기준각을
// SPIRAL_STEP_DEG만큼 조금씩 회전시켜, 반복 발사가 쌓이면 나선형(spiral) 탄막 모양으로 퍼짐.
const SPIRAL_COUNT_PER_SHOT = 3; // 한 번에 동시 발사하는 가닥 수(등간격)
const SPIRAL_STEP_DEG = 9; // 발사마다 기준각을 이만큼 회전(나선이 벌어지는 정도)
function fireSpiral(e, color, speed){
  const baseAngle = e.spiralAngle || 0;
  for(let i=0;i<SPIRAL_COUNT_PER_SHOT;i++){
    const a = baseAngle + (Math.PI*2/SPIRAL_COUNT_PER_SHOT)*i;
    bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:6,color});
  }
  e.spiralAngle = baseAngle + SPIRAL_STEP_DEG * Math.PI/180;
  playSpiralShootSound();
}

// 보스1: 40도 부채꼴을 4갈래(각 10도)로 나눠 매 갈래 방향으로 1발씩 동시 발사.
// 7번 반복 호출하면(0.5초 간격) 갈래당 7발, 총 28발이 40도 부채꼴을 채움.
function fireBossQuadArc(e, color, speed){
  const totalSpread = 40 * Math.PI/180; // 부채꼴 전체 폭 40도
  const arcCount = 4;
  const base = Math.PI/2; // 아래 방향 기준
  const eye = getBossEye(e); // 탄은 보스 눈(보라 코어)에서 발사
  for(let i=0;i<arcCount;i++){
    const a = base - totalSpread/2 + totalSpread*(i/(arcCount-1));
    bullets.push({x:eye.x,y:eye.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:7,color});
    playBossShotSound(); // 보스 전용 발사음(spiral 소리를 복제해 피치를 낮춘 중후한 톤), 갈래마다 재생
  }
}
// 보스1 몸통 하단(주둥이) 실제 화면 좌표. drawBossSprite와 동일한 정렬 기준을 사용해
// 레이저 시작점이 항상 주둥이 끝에서 나오도록 함.
// 보스1 눈(보라 코어) 실제 화면 좌표. 스프라이트(boss1_sm.png 480x461) 분석값: 눈 중심이 하단에서 0.1995 높이.
function getBossEye(e){
  const baseH = e.size * 592/616;
  const bottomY = e.y + baseH * 0.603;
  return { x: e.x, y: bottomY - baseH * 0.1995 };
}
function getBossMuzzle(e){
  const eyeDistFromBottomRatio = 0.603;
  const baseH = e.size * 592/616;
  const bottomY = e.y + baseH * eyeDistFromBottomRatio;
  return { x: e.x, y: bottomY };
}

// ---- 보스2(거미형) 전용 탄막 패턴 3종 ----
// 샘플(boss_bullet_patterns_sample.html)에서 확정한 수치를 그대로 적용.
// ---- 스테이지2 전용 일반 적 색상(기체 발광색 + 탄 색). 샘플(stage2_enemy_color_proposal.html)에서
// 승인된 조합 그대로 적용. 스테이지1에서는 기존 색을 그대로 유지(index.html에서 currentStage로 분기).
const STAGE2_ENEMY_COLORS = {
  normal1: '#ff5a7a', // 녹색 -> 코랄핑크
  normal3: '#ffb347', // 시안 -> 호박색
  normal4: '#7dffb0', // 밝은 보라 -> 민트그린
  normal6: '#ff7043', // (청색계 화염) -> 오렌지
  normal7: '#c77dff', // 오렌지 -> 보라
  normal8: '#4de8ff'  // 마젠타 -> 시안
};
function getEnemyColor(type, stage1Color){
  return (typeof currentStage !== 'undefined' && currentStage >= 2 && STAGE2_ENEMY_COLORS[type]) ? STAGE2_ENEMY_COLORS[type] : stage1Color;
}
const BOSS2_WEB_COLOR = '#3ad9ff';
const BOSS2_VENOM_COLOR = '#8fff6a';
const BOSS2_LEG_COLOR = '#ff9a3c';
const BOSS2_WEB_STRANDS = 8;
const BOSS2_WEB_RING_INTERVAL_MS = 500;
const BOSS2_WEB_SPEED = 150;
const BOSS2_WEB_PHASE_MS = 1000; // 요청사항: 1초 쏘고 각도를 반바퀴(180도) 돌려서 1초, 총 3회(3초)
// 거미줄(Web Shot): 보스 중심에서 8방향 방사형으로 탄 링을 바깥으로 반복 발사.
// baseAngleOffset: 1초 단위 phase가 바뀔 때마다 180도씩 번갈아 뒤집혀 전체 패턴이 반전됨.
function fireBossWebRing(e){
  const phaseIdx = Math.floor((e.webPhaseElapsed || 0) / BOSS2_WEB_PHASE_MS);
  const base = Math.PI/2 + (phaseIdx % 2) * Math.PI; // 아래 방향부터 시작, 홀수 phase면 180도 반전
  for(let i=0;i<BOSS2_WEB_STRANDS;i++){
    const ang = (Math.PI*2/BOSS2_WEB_STRANDS)*i + base;
    bullets.push({x:e.x,y:e.y,vx:Math.cos(ang)*BOSS2_WEB_SPEED,vy:Math.sin(ang)*BOSS2_WEB_SPEED,r:5,color:BOSS2_WEB_COLOR});
  }
  playBossShotSound();
}
const BOSS2_VENOM_INTERVAL_MS = 1400;
const BOSS2_VENOM_LIFE_MS = 3000; // 요청사항: 독액 탄은 생성 후 3초가 지나면 화면에 남아 있어도 사라짐
// 독액 낙하(Venom Drip): 보스 아래쪽에서 가늘고 느린 독탄 3~5발이 랜덤 x좌표로 낙하.
// 요청사항: 거의 화면 맨 아래까지 흐르듯 떨어지다가 3초 뒤 소멸, trail(흐르는 산성 자국)로 시각화,
// 화면에 독탄이 남아있는 동안은 추가 독공격을 하지 않음(venomActive 플래그로 보스 쪽에서 게이트).
function fireBossVenomDrip(e){
  const count = 8; // 요청사항: 화면에 한 번에 8군데로 독액을 뿌림(기존 3~5발에서 상향)
  const margin = 70;
  // 3초(BOSS2_VENOM_LIFE_MS) 안에 화면 아래쪽 끝 근처까지 도달하도록 속도 산정.
  const travelDist = H - e.y - e.size*0.3 - 40; // 생성 위치에서 화면 하단 40px 위까지
  const baseSpeed = Math.max(140, (travelDist / (BOSS2_VENOM_LIFE_MS/1000)) * 0.92);
  // 8군데가 균등하게 흩어지도록 화면을 8등분한 구간 안에서 각각 랜덤 x를 뽑음(완전 랜덤이면
  // 일부 구간에 몰리고 일부가 비어 "8군데"라는 느낌이 안 날 수 있어 구간 분산을 보장).
  const slotW = (W - margin*2) / count;
  for(let i=0;i<count;i++){
    const x = margin + slotW*i + Math.random()*slotW;
    bullets.push({ x, y: e.y + e.size*0.3, vx:0, vy: baseSpeed + Math.random()*20, r: 4, color: BOSS2_VENOM_COLOR,
      maxLifeMs: BOSS2_VENOM_LIFE_MS, kind:'venomTrail', trail:[] });
  }
  playBossShotSound();
}
const BOSS2_LEG_VOLLEY_INTERVAL_MS = 220;
const BOSS2_LEG_VOLLEY_SPEED = 180;
const BOSS2_LEG_VOLLEY_HOMING_STRENGTH = 1.8; // rad/s, 완전 유도가 아닌 약한 유도(값이 작을수록 더 느리게 꺾임)
const BOSS2_LEG_VOLLEY_HOMING_DURATION_MS = 900; // 발사 후 이 시간 동안만 유도, 이후엔 직진
// 다리 연계 사격(Leg Volley): 보스 다리 끝 좌표에서 발사되어 퍼져나가며, 완전 조준이 아닌
// 약한 유도성(발사 초반에만 서서히 플레이어 쪽으로 꺾임)을 가짐. 옅은 궤적(trail)으로 흐름을 표시.
function fireBossLegVolley(e){
  const legs = getBoss2LegPositions(e);
  const leg = legs[e.legVolleyIdx % legs.length];
  e.legVolleyIdx++;
  // 초기 발사 방향은 다리가 뻗은 쪽(보스 중심 반대 방향)으로 "퍼지듯" 나가고, 그 뒤 서서히 유도됨.
  const outDx = leg.x - e.x, outDy = leg.y - e.y;
  const outD = Math.hypot(outDx, outDy) || 1;
  bullets.push({ kind:'legVolley', x: leg.x, y: leg.y,
    vx: outDx/outD*BOSS2_LEG_VOLLEY_SPEED, vy: outDy/outD*BOSS2_LEG_VOLLEY_SPEED,
    r:6, color: BOSS2_LEG_COLOR, age:0, trail:[] });
  playBossShotSound();
}

// 레이저 충전 이펙트: 주둥이 위치에서 맴도는(회전) 보라 광구, t는 0~1 진행률.
// willSweep이 true면(이번 라운드가 스윕 예정) 입자를 더 많이/빠르게 돌려서 스윕을 예고함.
function drawBossLaserCharge(x, y, t, willSweep){
  ctx.save();
  const baseR = 8 + t * 10;
  const particleCount = willSweep ? 6 : 3;
  const spinSpeed = willSweep ? 16 : 10;
  const spinAngle = t * Math.PI * spinSpeed;
  ctx.translate(x, y);
  // 중심 광구
  const grad = ctx.createRadialGradient(0,0,0, 0,0,baseR*1.6);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, willSweep ? 'rgba(255,150,200,0.85)' : 'rgba(199,125,255,0.85)');
  grad.addColorStop(1, willSweep ? 'rgba(255,96,176,0)' : 'rgba(176,96,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0,0,baseR*1.6,0,Math.PI*2);
  ctx.fill();
  // 맴도는 작은 입자들 (스윕 예정이면 개수/속도 증가)
  for(let i=0;i<particleCount;i++){
    const a = spinAngle + i*(Math.PI*2/particleCount);
    const px = Math.cos(a) * (baseR+6);
    const py = Math.sin(a) * (baseR+6);
    ctx.fillStyle = willSweep ? '#ffd6ec' : '#e6ccff';
    ctx.beginPath();
    ctx.arc(px,py,3,0,Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

// 보스1 레이저 피격 판정: 레이저 선분(시작점 → 화면 끝)과 주인공 히트박스 사이 거리가 반폭 이내면 피격.
// 그려지는 빛줄기(바깥 폭 10px) + 주인공 타원 히트박스 크기를 고려해 반폭 9px.
const BOSS_LASER_HIT_HALF_WIDTH = 9;
function bossLaserHitsPlayer(x, y, angleOffsetRad){
  const dirX = Math.sin(angleOffsetRad), dirY = Math.cos(angleOffsetRad);
  // 주인공 히트박스 중심 두 곳(몸통/날개) 중 하나라도 레이저와 가까우면 피격
  const pts = [[player.x, player.y + PLAYER_HIT_OFFSET_Y], [player.x, player.y + PLAYER_HIT2_OFFSET_Y]];
  for(const [px, py] of pts){
    const t = (px - x) * dirX + (py - y) * dirY; // 레이저 진행 방향으로의 거리
    if(t < 0) continue;                           // 레이저 시작점 뒤쪽(보스 위)은 무효
    const dist = Math.abs((px - x) * dirY - (py - y) * dirX); // 레이저 선까지의 수직 거리
    if(dist < BOSS_LASER_HIT_HALF_WIDTH + Math.min(PLAYER_HIT_RADIUS_X, PLAYER_HIT2_RADIUS_X)) return true;
  }
  return false;
}
// 보스1 레이저 그리기. angleOffsetRad는 수직(아래) 기준 좌우 각도(라디안).
function drawBossLaser(x, y, angleOffsetRad){
  const dirX = Math.sin(angleOffsetRad), dirY = Math.cos(angleOffsetRad);
  const endX = x + dirX * H, endY = y + dirY * H; // 화면 아래까지 충분히 길게
  ctx.save();
  ctx.strokeStyle = '#c77dff';
  ctx.shadowColor = '#b060ff';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

function fireLaser(){
  const speed = 936; // 탄속 고정(파워와 무관, 30% 상향 기준값: 720 -> 936px/s)
  playLaserSound(); // 레이저 발사음 재생
  if(playerHasW){
    // W 획득 시: 30도 부채꼴로 3방향(좌/중/우) 발사
    const spreadDeg = 15; // 좌우 각 15도(총 30도)
    const spreadRad = spreadDeg * Math.PI/180;
    const angles = [-spreadRad, 0, spreadRad]; // 수직(위쪽) 기준 좌/중/우
    angles.forEach(a=>{
      playerBullets.push({
        x: player.x, y: player.y - 10,
        vx: Math.sin(a) * speed, vy: -Math.cos(a) * speed,
        len: 26, angle: a
      });
    });
  } else {
    // 기본: 양 날개 트윈 레이저
    playerBullets.push({x: player.x - 18, y: player.y - 10, vx:0, vy: -speed, len: 26, angle: 0});
    playerBullets.push({x: player.x + 18, y: player.y - 10, vx:0, vy: -speed, len: 26, angle: 0});
  }
}

function drawLaser(b){
  // 진행 방향(vx,vy)의 반대쪽으로 꼬리를 그림. 방향 벡터가 없으면(각도 미지정) 기본 수직 위쪽 발사로 간주.
  // 요청사항: 네오지오풍 "프리즘 팽" 스타일 — 앞이 뾰족한 삼각 프리즘(쐐기) 단면, 양면에 서로
  // 다른 밝기의 그라데이션을 줘서 입체적인 수정 송곳니처럼 보이게 함(TEST/laser_neogeo_style_sample.html
  // 14번 반영). 색상은 기존과 동일한 푸른 계열(시안) 유지.
  const speed = Math.hypot(b.vx || 0, b.vy) || 1;
  const dirX = (b.vx || 0) / speed, dirY = b.vy / speed;
  const tailX = b.x - dirX * b.len;
  const tailY = b.y - dirY * b.len;
  const perpX = -dirY, perpY = dirX;
  const w = 7;
  ctx.save();
  // 외곽선(검은 테두리)
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(tailX + perpX*(w+1.5), tailY + perpY*(w+1.5));
  ctx.lineTo(tailX - perpX*(w+1.5), tailY - perpY*(w+1.5));
  ctx.closePath();
  ctx.fill();
  // 왼쪽 면(밝은 흰색 -> 중간 톤 시안)
  const gradL = ctx.createLinearGradient(b.x, b.y, tailX + perpX*w, tailY + perpY*w);
  gradL.addColorStop(0, '#ffffff'); gradL.addColorStop(1, '#1a9fc8');
  ctx.fillStyle = gradL;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(tailX + perpX*w, tailY + perpY*w);
  ctx.lineTo(tailX, tailY);
  ctx.closePath();
  ctx.fill();
  // 오른쪽 면(옅은 시안 -> 짙은 네이비, 입체 음영)
  const gradR = ctx.createLinearGradient(b.x, b.y, tailX - perpX*w, tailY - perpY*w);
  gradR.addColorStop(0, '#eaffff'); gradR.addColorStop(1, '#0a3a55');
  ctx.fillStyle = gradR;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(tailX, tailY);
  ctx.lineTo(tailX - perpX*w, tailY - perpY*w);
  ctx.closePath();
  ctx.fill();
  // 중앙 능선 하이라이트
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(tailX, tailY);
  ctx.stroke();
  ctx.restore();
}

// ---- 그리기 헬퍼 ----

// ---- 피격 플래시(아주 살짝 밝아지는 연출, 기체 모양에만 적용) ----
// 과거엔 source-atop을 본 캔버스(배경까지 이미 그려진 상태)에 바로 적용해서 사각형 전체가
// 밝아지는 버그가 있었음(air2 스킬 참고). 이번엔 스프라이트를 임시 오프스크린 캔버스에
// 따로 그린 뒤 그 캔버스 안에서만 source-atop으로 흰색을 덮어씌우고, 결과물만 본 캔버스에
// 그려서 배경/그리드 등 주변에는 전혀 영향 없이 기체 모양대로만 밝아지게 함.
const HIT_FLASH_DURATION_MS = 150;
const HIT_FLASH_MAX_ALPHA = 0.20; // 아주 살짝만 밝아지도록 낮게 설정
function triggerHitFlash(e){
  e.hitFlashTimer = HIT_FLASH_DURATION_MS;
}
function updateHitFlash(e, dtMs){
  if(e.hitFlashTimer > 0){
    e.hitFlashTimer -= dtMs;
    if(e.hitFlashTimer < 0) e.hitFlashTimer = 0;
  }
}
function getHitFlashAlpha(e){
  if(!e.hitFlashTimer || e.hitFlashTimer <= 0) return 0;
  const t = e.hitFlashTimer / HIT_FLASH_DURATION_MS;
  return HIT_FLASH_MAX_ALPHA * Math.pow(t, 3); // 초반에 급격히 밝아졌다가 빠르게 꺼지는 곡선
}
const hitFlashTmpCanvas = document.createElement('canvas');
// img를 (x,y) 중심에 w×h 크기로 그리되, e.hitFlashTimer가 있으면 그 알파만큼 스프라이트
// 모양에만 흰색을 살짝 덮어씌운 뒤 그림(회전 등 변환이 적용된 컨텍스트 안에서 호출해도 무방 —
// drawImage와 동일하게 현재 좌표계 기준으로 그려짐).
function drawImageWithHitFlash(img, x, y, w, h, e){
  const alpha = getHitFlashAlpha(e);
  if(alpha <= 0){
    ctx.drawImage(img, x, y, w, h);
    return;
  }
  const cw = Math.max(1, Math.round(w)), ch = Math.max(1, Math.round(h));
  hitFlashTmpCanvas.width = cw;
  hitFlashTmpCanvas.height = ch;
  const tctx = hitFlashTmpCanvas.getContext('2d');
  tctx.clearRect(0, 0, cw, ch);
  tctx.drawImage(img, 0, 0, cw, ch);
  tctx.globalCompositeOperation = 'source-atop';
  tctx.globalAlpha = alpha;
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(hitFlashTmpCanvas, x, y, w, h);
}

// 스테이지2 요청사항: 기체 발광색을 탄 색상과 동일하게 — 원본 스프라이트에 색상 틴트를
// source-atop으로 입힌 결과를 캐싱(타입+색상 조합당 1회만 생성, 매 프레임 재생성 안 함).
const tintedImageCache = new Map(); // key: img.src+'_'+color -> offscreen canvas
function getTintedImage(img, color){
  const key = img.src + '_' + color;
  let c = tintedImageCache.get(key);
  if(c) return c;
  c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const tctx = c.getContext('2d');
  tctx.drawImage(img, 0, 0);
  tctx.globalCompositeOperation = 'source-atop';
  tctx.globalAlpha = 0.55; // 원본 질감이 살짝 남도록 완전 덮지 않음
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, c.width, c.height);
  tctx.globalCompositeOperation = 'source-over';
  tintedImageCache.set(key, c);
  return c;
}

function drawSprite(e, key, size){
  const img = assets[key];
  if(!img || !img.complete || img.naturalWidth === 0) return;
  // 스테이지2부터는 기체 색상을 탄 색상(STAGE2_ENEMY_COLORS)과 동일하게 틴트.
  const stage2Color = (typeof currentStage !== 'undefined' && currentStage >= 2) ? STAGE2_ENEMY_COLORS[key] : null;
  const drawImg = stage2Color ? getTintedImage(img, stage2Color) : img;
  drawImageWithHitFlash(drawImg, e.x - size/2, e.y - size/2, size, size, e);
}

// ---- 보스 등장 전 WARNING! 경고 문구 ----
// 화면의 모든 적이 사라진 뒤 2초간(BOSS_WARNING_DURATION_MS) 타이틀 로고와 동일한
// 폰트/글로우 스타일로 화면 중앙에 표시. 5회(BOSS_WARNING_BLINK_COUNT) 깜빡임.
function drawBossWarning(elapsedMs, durationMs, blinkCount){
  const cycleMs = durationMs / blinkCount;
  const phase = (elapsedMs % cycleMs) / cycleMs; // 0~1, 한 깜빡임 주기 내 진행률
  const visible = phase < 0.5; // 주기의 앞 절반만 보이게(켜짐/꺼짐 반복)
  if(!visible) return;

  const cx = W/2, cy = H/2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px "Trebuchet MS", Arial, sans-serif';
  ctx.shadowColor = '#ff3b3b';
  ctx.shadowBlur = 30;
  const grad = ctx.createLinearGradient(cx, cy - 28, cx, cy + 28);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, '#ff9a9a');
  grad.addColorStop(1, '#ff2020');
  ctx.fillStyle = grad;
  ctx.fillText('WARNING!', cx, cy);
  ctx.shadowBlur = 8;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('WARNING!', cx, cy);
  ctx.restore();
}

function drawBossSprite(e, size){
  // 짧은 불꽃/긴 불꽃 2프레임을 70ms 간격으로 교차 표시 (실제 시간 기반, dt 무관)
  const frameIdx = Math.floor(Date.now()/70) % 2;
  const img = bossFrames[frameIdx];
  if(!img || !img.complete || img.naturalWidth === 0) return;
  const w = size;
  const h = size * (img.naturalHeight / img.naturalWidth);
  // 두 프레임 모두 몸통 하단이 이미지 맨 아래에 거의 붙어있으므로, 하단 기준으로 정렬하면
  // 몸통은 흔들리지 않고 불꽃 길이만 위로 늘어난다.
  // e.x, e.y는 눈 코어 위치를 가리키도록, 짧은 불꽃(기본) 프레임 기준 하단에서의 고정 비율로 계산.
  const eyeDistFromBottomRatio = 0.603; // 짧은 불꽃 기준, 하단→눈 거리 비율
  const baseH = size * 592/616; // 짧은 불꽃 원본 비율 기준 높이(불꽃 길이 변화와 무관하게 고정)
  const bottomY = e.y + baseH * eyeDistFromBottomRatio;
  drawImageWithHitFlash(img, e.x - w/2, bottomY - h, w, h, e);
}

// 보스2(거미형) 몸체 정사각형 스프라이트 그리기. 다리 보행 프레임은 이동 중일 때만 index.html의
// update() 쪽에서 e.legFrameIdx를 갱신하고, 정지(fire) 중에는 멈춘 그대로 유지됨.
function drawBoss2Sprite(e, size){
  const img = boss2Frames[e.legFrameIdx] || boss2Frames[0];
  if(!img || !img.complete || img.naturalWidth === 0) return;
  drawImageWithHitFlash(img, e.x - size/2, e.y - size/2, size, size, e);
}
// 보스2 다리 끝 좌표(상대 오프셋, size=220 기준으로 비율 맞춰 스케일). 거미줄/다리 연계 사격 발사 원점으로 사용.
const BOSS2_LEG_OFFSETS_BASE = [
  {x:-0.43,y:-0.25},{x:-0.45,y:-0.045},{x:-0.43,y:0.16},{x:-0.36,y:0.34},
  {x: 0.43,y:-0.25},{x: 0.45,y:-0.045},{x: 0.43,y:0.16},{x: 0.36,y:0.34}
];
function getBoss2LegPositions(e){
  return BOSS2_LEG_OFFSETS_BASE.map(off=>({ x: e.x + off.x*e.size, y: e.y + off.y*e.size }));
}

function drawFlameTrail(e, size){
  // 진행 방향 반대쪽으로 뻗는 촛불 모양의 가는 화염
  const speed = Math.hypot(e.vx, e.vy) || 1;
  const dirX = e.vx / speed, dirY = e.vy / speed;
  const perpX = -dirY, perpY = dirX;

  const baseX = e.x - dirX * (size*0.42);
  const baseY = e.y - dirY * (size*0.42);
  const flameLen = size * 1.15;
  const tipX = baseX - dirX * flameLen;
  const tipY = baseY - dirY * flameLen;

  // 살짝 흔들리는 느낌을 주는 실제 시간 기반 오프셋 (모니터 주사율과 무관)
  const wobble = Math.sin(Date.now()/70 + e.x) * size * 0.05;
  const midX = baseX - dirX * (flameLen*0.55) + perpX * wobble;
  const midY = baseY - dirY * (flameLen*0.55) + perpY * wobble;

  const baseWidth = size * 0.09; // 가늘게

  ctx.save();
  const grad = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
  grad.addColorStop(0, 'rgba(200,235,255,0.95)');
  grad.addColorStop(0.4, 'rgba(80,160,255,0.85)');
  grad.addColorStop(1, 'rgba(30,80,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(baseX + perpX*baseWidth, baseY + perpY*baseWidth);
  ctx.quadraticCurveTo(midX + perpX*baseWidth*0.4, midY + perpY*baseWidth*0.4, tipX, tipY);
  ctx.quadraticCurveTo(midX - perpX*baseWidth*0.4, midY - perpY*baseWidth*0.4, baseX - perpX*baseWidth, baseY - perpY*baseWidth);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---- 폭발 이펙트 (절차적 파티클 + 스프라이트 시트, 적 기종별로 다르게 설계) ----
let explosions = [];
let screenFlash = 0; // 0~1, 화면 전체 화이트 플래시 남은 진행률 (0이면 없음)
const SCREEN_FLASH_DURATION = 0.5; // 초

function spawnExplosion(type, x, y){
  const lookupType = type === 'boss2' ? 'boss1' : type; // 보스2는 전용 폭발 에셋이 없어 보스1 것을 재사용
  if(hitFrames[lookupType]){ // normal1/2/3/4/6/7/boss1: 프레임 스프라이트 시트 애니메이션 (기종별 색상·크기·프레임수)
    let size = 90;
    let maxLife = 0.5;
    let opacity = 1; // 폭발 전체 불투명도 (0~1), 기종별로 조절 가능
    if(lookupType === 'normal7'){ size = 150; maxLife = 0.6; }
    else if(lookupType === 'boss1'){ size = 320; maxLife = 1.05; opacity = 0.70; screenFlash = SCREEN_FLASH_DURATION; } // 보스는 파편이 훨씬 크고 오래 지속(6프레임) + 화면 전체 화이트 플래시
    const frameCount = hitFrameCounts[lookupType] || 5;
    explosions.push({
      x, y, life: 0, maxLife, kind:'sprite', frames: hitFrames[lookupType],
      frameCount, size, opacity
    });
  }
}

function updateAndDrawExplosions(dt){
  explosions.forEach(p=>{
    p.life += dt;
    const t = Math.min(1, p.life / p.maxLife);
    if(p.kind === 'shockwave'){
      const radius = t * 70;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4 * (1-t) + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if(p.kind === 'sprite'){
      const frameIdx = Math.min(p.frameCount-1, Math.floor(t * p.frameCount));
      const img = p.frames[frameIdx];
      if(img && img.complete && img.naturalWidth > 0){
        ctx.save();
        ctx.globalAlpha = p.opacity !== undefined ? p.opacity : 1;
        ctx.drawImage(img, p.x - p.size/2, p.y - p.size/2, p.size, p.size);
        ctx.restore();
      }
      return;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= (1 - Math.min(1, dt*3)); // 감속
    p.vy *= (1 - Math.min(1, dt*3));
    const alpha = 1 - t;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    if(p.kind === 'shard'){
      // 날카로운 파편: 진행 방향으로 뻗는 짧은 선
      const ang = Math.atan2(p.vy, p.vx);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * (1-t) + 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(ang)*8, p.y - Math.sin(ang)*8);
      ctx.stroke();
    } else if(p.kind === 'spark'){
      const ang = Math.atan2(p.vy, p.vx);
      ctx.strokeStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(ang)*p.size, p.y - Math.sin(ang)*p.size);
      ctx.stroke();
    } else if(p.kind === 'spore'){
      const radius = (p.size) * (0.4 + t*1.2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI*2);
      ctx.fill();
    } else if(p.kind === 'fire'){
      const radius = p.size * (1 - t*0.3);
      const grad = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
      grad.addColorStop(0, '#ffe6b3');
      grad.addColorStop(0.5, p.color);
      grad.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI*2);
      ctx.fill();
    } else if(p.kind === 'smoke'){
      const radius = p.size * (0.5 + t*0.9);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  });
  explosions = explosions.filter(p => p.life < p.maxLife);
}

// 화면 전체 화이트 플래시 (보스 격파 등 강한 임팩트 시). W, H는 메인 스크립트의 캔버스 크기.
function updateAndDrawScreenFlash(dt){
  if(screenFlash <= 0) return;
  const t = screenFlash / SCREEN_FLASH_DURATION; // 1 → 0으로 감소
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, t));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  screenFlash -= dt;
  if(screenFlash < 0) screenFlash = 0;
}

// ---- 주인공 피격 판정 (세로 타원 + 가로 타원, 두 개) ----
const PLAYER_HIT_RADIUS_X = 6; // 세로 타원의 가로 반경(px)
const PLAYER_HIT_RADIUS_Y = 15; // 세로 타원의 세로 반경(px)
const PLAYER_HIT_OFFSET_Y = -3; // 세로 타원을 날개 부근까지 아래로 내리는 오프셋(px)
const PLAYER_HIT2_RADIUS_X = 12; // 가로 타원의 가로 반경(px) — 세로 타원을 눕힌 복제본
const PLAYER_HIT2_RADIUS_Y = 6; // 가로 타원의 세로 반경(px)
const PLAYER_HIT2_OFFSET_Y = -7; // 가로 타원을 날개 부근까지 아래로 내리는 오프셋(px)

function drawPlayerHitbox(){
  ctx.save();
  ctx.strokeStyle = 'rgba(255,60,60,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + PLAYER_HIT2_OFFSET_Y, PLAYER_HIT_RADIUS_X, PLAYER_HIT_RADIUS_Y, 0, 0, Math.PI*2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + PLAYER_HIT2_OFFSET_Y, PLAYER_HIT2_RADIUS_X, PLAYER_HIT2_RADIUS_Y, 0, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();
}

// 타원형 피격 판정: (dx/rx)^2 + (dy/ry)^2 < 1 이면 내부. 세로 타원 또는 가로 타원 중 하나라도 맞으면 피격.
// (적 탄환 vs 주인공 피격 판정에만 사용. 아이템 획득 판정은 픽셀 단위 충돌 함수를 별도 사용)
function isInsidePlayerHitbox(px, py){
  const dx1 = (px - player.x) / PLAYER_HIT_RADIUS_X;
  const dy1 = (py - (player.y + PLAYER_HIT_OFFSET_Y)) / PLAYER_HIT_RADIUS_Y;
  if((dx1*dx1 + dy1*dy1) < 1) return true;
  const dx2 = (px - player.x) / PLAYER_HIT2_RADIUS_X;
  const dy2 = (py - (player.y + PLAYER_HIT2_OFFSET_Y)) / PLAYER_HIT2_RADIUS_Y;
  return (dx2*dx2 + dy2*dy2) < 1;
}

// ---- 아이템 획득: 히트박스가 아닌 실제 스프라이트 픽셀(알파>0) 겹침으로 판정 ----
// 주의: file:// 프로토콜로 직접 연 경우 canvas.getImageData()가 보안 오류(SecurityError)를 던질 수 있음
// (로컬 이미지 소스를 "오염된 캔버스"로 취급). 이 경우 조용히 원형 근사 판정으로 대체(fallback)해서
// 게임 루프가 멈추지 않도록 함.
const _alphaCanvasCache = new Map(); // key: img.src+size -> {data, size} | false(실패 캐시)

function _getAlphaData(img, size){
  if(!img || !img.complete || img.naturalWidth === 0) return null;
  const key = img.src + '_' + size;
  if(_alphaCanvasCache.has(key)){
    const cached = _alphaCanvasCache.get(key);
    return cached === false ? null : cached;
  }
  try {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const cctx = c.getContext('2d');
    cctx.drawImage(img, 0, 0, size, size);
    const entry = { data: cctx.getImageData(0, 0, size, size).data, size };
    _alphaCanvasCache.set(key, entry);
    return entry;
  } catch(err){
    // getImageData 보안 오류 등 실패 시 이후 호출에서 재시도하지 않도록 실패로 캐싱
    _alphaCanvasCache.set(key, false);
    return null;
  }
}

// 주인공 스프라이트(96px)와 아이템 스프라이트가 실제 알파 픽셀 단위로 겹치는지 검사.
// 두 사각형의 겹치는 영역을 2px 간격으로 순회하며 두 이미지 모두 alpha>0인 지점이 있으면 true.
// 픽셀 데이터를 얻을 수 없는 환경(예: file:// 보안 제약)에서는 원형 근사 판정으로 대체.
function pixelHitsPlayer(itemX, itemY, itemType){
  const size = itemSizeFor(itemType);
  const playerData = _getAlphaData(assets['player'], 96);
  const itemImg = itemImgs[itemType];
  const itemData = _getAlphaData(itemImg, size);
  if(!playerData || !itemData){
    // fallback: 주인공 반경(대략 30px, 실제 스프라이트보다 살짝 작게) + 아이템 반경 겹침
    const dx = itemX - player.x, dy = itemY - player.y;
    return Math.hypot(dx, dy) < (30 + size/2);
  }

  const pLeft = player.x - 48, pTop = player.y - 48;
  const iLeft = itemX - size/2, iTop = itemY - size/2;

  const left = Math.max(pLeft, iLeft);
  const top = Math.max(pTop, iTop);
  const right = Math.min(pLeft + 96, iLeft + size);
  const bottom = Math.min(pTop + 96, iTop + size);
  if(left >= right || top >= bottom) return false;

  const step = 2; // 2px 간격 샘플링(성능/정확도 균형)
  for(let y = top; y < bottom; y += step){
    const py = Math.floor(y - pTop), iy = Math.floor(y - iTop);
    for(let x = left; x < right; x += step){
      const px = Math.floor(x - pLeft), ix = Math.floor(x - iLeft);
      const pAlpha = playerData.data[(py*96 + px)*4 + 3];
      if(pAlpha === 0) continue;
      const iAlpha = itemData.data[(iy*size + ix)*4 + 3];
      if(iAlpha > 0) return true;
    }
  }
  return false;
}

// 범용 픽셀 충돌 검사: 플레이어 스프라이트(96px)와 임의의 적/오브젝트 이미지가 실제 알파 픽셀
// 단위로 겹치는지 검사(pixelHitsPlayer와 동일한 방식을 적 본체 충돌 판정에도 재사용하기 위해 분리).
function pixelHitsPlayerGeneric(targetImg, targetX, targetY, targetSize){
  const playerData = _getAlphaData(assets['player'], 96);
  const targetData = _getAlphaData(targetImg, targetSize);
  if(!playerData || !targetData){
    const dx = targetX - player.x, dy = targetY - player.y;
    return Math.hypot(dx, dy) < (30 + targetSize/2);
  }
  const pLeft = player.x - 48, pTop = player.y - 48;
  const tLeft = targetX - targetSize/2, tTop = targetY - targetSize/2;
  const left = Math.max(pLeft, tLeft);
  const top = Math.max(pTop, tTop);
  const right = Math.min(pLeft + 96, tLeft + targetSize);
  const bottom = Math.min(pTop + 96, tTop + targetSize);
  if(left >= right || top >= bottom) return false;
  const step = 2;
  for(let y = top; y < bottom; y += step){
    const py = Math.floor(y - pTop), ty = Math.floor(y - tTop);
    for(let x = left; x < right; x += step){
      const px = Math.floor(x - pLeft), tx = Math.floor(x - tLeft);
      const pAlpha = playerData.data[(py*96 + px)*4 + 3];
      if(pAlpha === 0) continue;
      const tAlpha = targetData.data[(ty*targetSize + tx)*4 + 3];
      if(tAlpha > 0) return true;
    }
  }
  return false;
}

// 적 본체 렌더 크기 매핑(drawSprite 등에서 사용하는 값과 동일하게 유지). 보스는 e.size를 그대로 사용.
const ENEMY_BODY_SIZE = { normal1:64, normal2:64, normal3:74, normal4:64, normal6:60, normal7:104, normal8:90 };
// 요청사항: 적 기체 본체에 플레이어 스프라이트가 픽셀 단위로 닿으면 즉시 그 적을 폭발(격파)시키고
// 플레이어도 피격 처리. 몸통박치기 전용이었던 일반6뿐 아니라 전체 일반 적에 공통 적용.
function pixelHitsEnemyBody(e){
  if(e.type === 'boss1' || e.type === 'boss2') return false; // 보스는 레이저/탄 전용 판정 유지(몸통 충돌 제외)
  const img = assets[e.type];
  const size = ENEMY_BODY_SIZE[e.type] || 64;
  if(!img) return false;
  return pixelHitsPlayerGeneric(img, e.x, e.y, size);
}

// 주인공 피격 시 폭발(스프라이트 시트, 흰색+청색 계열, normal1 시트를 재색상화)
function spawnPlayerHitExplosion(x, y){
  const frameCount = hitFrameCounts.player || 5;
  explosions.push({
    x, y, life: 0, maxLife: 0.5, kind:'sprite', frames: hitFrames.player,
    frameCount, size: 90, opacity: 1
  });
}

// 화면 상단: SCORE 좌측에 LIFE 숫자, 우측에 POWER 숫자 (타이틀과 동일한 Trebuchet MS bold 폰트)
function drawLifeHud(){
  ctx.save();
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#4dff8f';
  ctx.shadowBlur = 6;
  ctx.font = 'bold 13px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText('LIFE', W/2 - 68, 24);
  ctx.font = 'bold 22px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(String(playerLife), W/2 - 68, 50);
  ctx.restore();
}

// POWER: itemsEaten(먹은 P 개수)을 숫자로 표시
function drawRapidHud(){
  const itemsEaten = Math.round((playerPower - PLAYER_POWER_BASE) / PLAYER_POWER_STEP); // 먹은 P 개수(정수)
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ff9a3c';
  ctx.shadowBlur = 6;
  ctx.font = 'bold 13px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText('POWER', W/2 + 68, 24);
  ctx.font = 'bold 22px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(String(itemsEaten), W/2 + 68, 50);
  ctx.restore();
}

// 화면 상단 중앙: SCORE 글자 + 7자리 점수
function drawScoreHud(){
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#7dfcff';
  ctx.shadowBlur = 4;
  ctx.font = 'bold 17px monospace';
  ctx.fillText('SCORE', W/2, 26);
  ctx.font = 'bold 25px monospace';
  ctx.fillText(String(playerScore).padStart(8,'0'), W/2, 52);
  ctx.restore();
}

// 화면 좌측 하단: BOMB 숫자 (타이틀과 동일한 Trebuchet MS bold 폰트)
function drawBombHud(){
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ff4d4d';
  ctx.shadowBlur = 6;
  ctx.font = 'bold 13px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText('BOMB', 10, H - 32);
  ctx.font = 'bold 22px "Trebuchet MS", Arial, sans-serif';
  ctx.fillText(String(playerBombs), 10, H - 10);
  ctx.restore();
}
// ---- 보스 HP바 ----
// SCORE 숫자 블록 바로 아래, 화면 중앙에 "BOSS" 라벨 + 가로 선으로 남은 체력을 표시.
// 전체 바는 반투명하게, 남은 비율만큼은 시안 네온 선, 깎인(잃은) 부분은 붉은색 선으로 그려
// 한눈에 피해량을 알 수 있게 함.
const BOSS_HP_BAR_Y = 66; // px, SCORE 숫자(y:52) 바로 아래
const BOSS_HP_BAR_MARGIN = 60; // px, 좌우 여백(라벨 폭 확보)
const BOSS_HP_BAR_LABEL = 'BOSS';
const BOSS_HP_BAR_ALPHA = 0.55; // 바 전체 반투명도

function drawBossHpBar(boss){
  if(!boss || (boss.type !== 'boss1' && boss.type !== 'boss2')) return;
  const maxHp = boss.maxHp || boss.hp || 1;
  const ratio = Math.max(0, Math.min(1, boss.hp / maxHp));

  const barLeft = BOSS_HP_BAR_MARGIN;
  const barRight = W - 10;
  const barWidth = barRight - barLeft;
  const filledWidth = barWidth * ratio; // 남은 체력에 해당하는 길이

  ctx.save();
  ctx.globalAlpha = BOSS_HP_BAR_ALPHA;
  // 라벨
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff5a5a';
  ctx.shadowColor = '#ff5a5a';
  ctx.shadowBlur = 4;
  ctx.fillText(BOSS_HP_BAR_LABEL, 10, BOSS_HP_BAR_Y);

  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();

  // 깎인 부분(잃은 체력): 붉은색으로 전체 바 위에 먼저 그림(바탕)
  ctx.strokeStyle = 'rgba(255,60,60,0.7)';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.moveTo(barLeft, BOSS_HP_BAR_Y);
  ctx.lineTo(barRight, BOSS_HP_BAR_Y);
  ctx.stroke();

  // 남은 체력: 시안 네온 선으로 왼쪽부터 채움
  if(filledWidth > 0){
    ctx.beginPath();
    ctx.strokeStyle = '#7dfcff';
    ctx.shadowColor = '#00e6ff';
    ctx.shadowBlur = 6;
    ctx.moveTo(barLeft, BOSS_HP_BAR_Y);
    ctx.lineTo(barLeft + filledWidth, BOSS_HP_BAR_Y);
    ctx.stroke();
  }
  ctx.restore();
}
