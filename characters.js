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

function addScore(amount){
  playerScore += amount;
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
function useBomb(){
  if(launchSequenceActive || continueScreenActive || gameOverActive || playerBombs <= 0) return;
  playerBombs--;
  bullets = [];
  screenFlash = SCREEN_FLASH_DURATION;
}

// ---- 주인공 ----
const player = { x: W/2, y: H-80 };
let playerCool = 0; // ms 누적
const PLAYER_FIRE_RATE = 217; // ms 주기, 초당 약 4.5회 발사 (기본, R 스택 0일 때)
const PLAYER_FIRE_RATE_MIN = 90; // ms, R 스택 4개일 때 도달하는 최소 발사 주기(더 짧아지지 않음)

// R 스택 개수에 따라 더 촘촘하게(짧은 주기로) 발사되도록 실제 발사 주기를 계산.
// 스택당 균등하게 보간되어 4스택에서 PLAYER_FIRE_RATE_MIN에 도달.
function getPlayerFireRate(){
  const t = Math.min(1, playerRStack / 4);
  return PLAYER_FIRE_RATE - (PLAYER_FIRE_RATE - PLAYER_FIRE_RATE_MIN) * t;
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
  registeredAudioElements.push(a);
  return a;
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
function unlockAllAudio(){
  if(audioUnlocked) return;
  audioUnlocked = true;
  // 사용자 제스처 콜스택 안에서 전부 동기적으로 처리해야 브라우저의 자동재생 잠금 해제가 정상 동작함.
  // (프레임 단위로 나눠서 처리하면 일부가 제스처 콜스택 밖에서 실행되어 muted 동기화가 깨지고,
  //  효과음이 짧게 새어나오는(예: 폭발음이 시작과 동시에 들리는) 문제가 있어 한 번에 처리로 되돌림)
  registeredAudioElements.forEach(a=>{
    const wasMuted = a.muted;
    const wasVolume = a.volume;
    a.muted = true; // 언락 재생 자체는 소리가 들리지 않도록
    a.volume = 0; // muted 적용이 브라우저에서 비동기적으로 지연되는 경우(Safari 등)에도 확실히 무음이 되도록 volume도 함께 0으로
    const p = a.play();
    if(p && p.catch) p.then(()=>{ a.pause(); a.currentTime = 0; a.muted = wasMuted; a.volume = wasVolume; }).catch(()=>{ a.muted = wasMuted; a.volume = wasVolume; });
    else { a.muted = wasMuted; a.volume = wasVolume; }
  });
  const laserCtx = getLaserAudioCtx();
  if(laserCtx && laserCtx.state === 'suspended') laserCtx.resume().catch(()=>{});
  loadEnemyHitSoundBuffer(); // 적 폭발음(Web Audio 버퍼)도 이 시점에 미리 디코드해둬서 첫 격파 때 스킵되지 않도록 함
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
  if(bossLaserSoundPlaying){
    bossLaserSoundPlaying = false;
    bossLaserAudio.pause();
  }
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
window.addEventListener('blur', pauseAllAudioForPageHidden);
window.addEventListener('pagehide', pauseAllAudioForPageHidden);
window.addEventListener('focus', resumeBgmAfterPageVisible);
window.addEventListener('pageshow', resumeBgmAfterPageVisible);
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

const LASER_SOUND_BASE_VOLUME = 0.0084375; // 기본 볼륨(0~1), 전체 볼륨 30%로 조정

// 발사 주기가 기본값(PLAYER_FIRE_RATE)보다 짧아진 비율만큼 톤의 길이/피치도 함께 스케일.
// 매번 동일한 음(높은 음 -> 낮은 음으로 짧게 미끄러지는 "핑")이며, 매 발사마다 완전히
// 새로운 오실레이터+게인 노드를 만들어 서로 간섭 없이 독립적으로 재생/소멸됨.
function playLaserSound(){
  if(audioMuted) return;
  const audioCtx = getLaserAudioCtx();
  if(!audioCtx) return;
  if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});

  const rate = PLAYER_FIRE_RATE / getPlayerFireRate(); // 1.0(기본) ~ PLAYER_FIRE_RATE/PLAYER_FIRE_RATE_MIN(최대 스택)
  const now = audioCtx.currentTime;
  const duration = 0.1 / rate; // 빨라질수록 "핑"도 더 짧게

  const highFreq = 720 * rate; // 시작(높은 음)
  const lowFreq = 200 * rate;  // 끝(낮은 음)으로 미끄러짐

  const osc = audioCtx.createOscillator();
  osc.type = 'sine'; // 사인파: 배음이 적어 부드럽고 뭉툭한 느낌

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900; // 고음(귀 피로의 주 원인) 컷
  filter.Q.value = 0.0001; // 공진 거의 없음(금속성 링잉 방지)

  const gain = audioCtx.createGain();

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  // 주파수: 높은 음에서 시작해 낮은 음으로 선형 슬라이드(지수 슬라이드는 급격히 꺾여 배음이 생기기 쉬움)
  osc.frequency.setValueAtTime(highFreq, now);
  osc.frequency.linearRampToValueAtTime(lowFreq, now + duration);

  // 볼륨: 아주 짧은 선형 어택(클릭 노이즈 방지) 후, 톤 슬라이드보다 더 길게 여유를 두고
  // 지수적으로 완전히 무음(0.0001)까지 부드럽게 감쇠(release)시켜 끝이 뚝 끊기지 않게 함.
  // 다음 발사음은 완전히 새로운 노드이므로 이전 소리의 꼬리와 절대 겹치거나 간섭하지 않음.
  const release = duration * 2.2; // 톤 슬라이드보다 더 오래 여운이 남도록
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(LASER_SOUND_BASE_VOLUME, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + release);

  osc.start(now);
  osc.stop(now + release + 0.03); // 감쇠가 다 끝난 뒤 여유를 두고 정지(꼬리 잘림 방지)
}

// ---- 배경음악(BGM): 스테이지 진행 중 반복 재생. 브라우저 자동재생 정책상 사용자
// 상호작용(첫 마우스/터치 입력) 이후에만 재생 가능하므로, 메인 HTML의 입력 리스너에서
// startBgm()을 최초 1회 호출합니다.
// 성능 최적화: main.mp3(4.6MB)는 스크립트 로드 시점이 아니라 최초 재생 시점에 생성해서
// 게임 시작 직후 몰리는 초기 네트워크/디코딩 부담을 줄임(지연 생성).
let bgmAudio = null;
let bgmStarted = false;
function getBgmAudio(){
  if(!bgmAudio){
    bgmAudio = registerAudio(new Audio('sound/main.m4a'));
    bgmAudio.loop = true;
    bgmAudio.volume = 0.028; // BGM 볼륨 소폭 추가 상향
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
// 일반7 포함 모든 적 격파음이 game_explosion8.mp3로 통일됨(과거엔 일반7만 별도 사운드 사용).
const ENEMY_HIT_SOUND_VOLUME = 0.0075; // 적 폭발음, 기존 대비 50% 추가 감소
const ENEMY_HIT_SOUND_MAX_DURATION_MS = 1500; // ms, 원본 2.17초에서 1.5초로 잘라 재생
let enemyHitSoundBuffer = null; // 디코드 완료된 AudioBuffer(공용, normal7도 동일 버퍼 재사용)
let enemyHitSoundBufferLoading = false;
let enemyHitSoundUseFallback = false; // true면 Web Audio 로딩 실패 -> <audio> 풀 방식 사용
const ENEMY_HIT_SOUND_POOL_SIZE = 6;
let enemyHitSoundPool = null; // fallback 시에만 생성(지연 생성)
let enemyHitSoundIdx = 0;
function getEnemyHitSoundPool(){
  if(!enemyHitSoundPool){
    enemyHitSoundPool = Array.from({length: ENEMY_HIT_SOUND_POOL_SIZE}, ()=>{
      const a = registerAudio(new Audio('sound/game_explosion8.mp3'));
      a.volume = ENEMY_HIT_SOUND_VOLUME;
      return a;
    });
  }
  return enemyHitSoundPool;
}
function loadEnemyHitSoundBuffer(){
  if(enemyHitSoundBuffer || enemyHitSoundBufferLoading || enemyHitSoundUseFallback) return;
  enemyHitSoundBufferLoading = true;
  const audioCtx = getLaserAudioCtx();
  if(!audioCtx) { enemyHitSoundBufferLoading = false; enemyHitSoundUseFallback = true; return; }
  fetch('sound/game_explosion8.mp3')
    .then(res => res.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .then(decoded => { enemyHitSoundBuffer = decoded; })
    .catch(()=>{ enemyHitSoundUseFallback = true; }) // fetch 실패(file:// 환경 등) -> 이후 <audio> 풀로 재생
    .finally(()=>{ enemyHitSoundBufferLoading = false; });
}
function playEnemyHitSound(enemyType){
  if(audioMuted) return;
  if(enemyHitSoundUseFallback){
    const pool = getEnemyHitSoundPool();
    const a = pool[enemyHitSoundIdx];
    enemyHitSoundIdx = (enemyHitSoundIdx + 1) % ENEMY_HIT_SOUND_POOL_SIZE;
    a.currentTime = 0;
    a.play().catch(()=>{});
    setTimeout(()=>{ a.pause(); }, ENEMY_HIT_SOUND_MAX_DURATION_MS);
    return;
  }
  if(!enemyHitSoundBuffer){ loadEnemyHitSoundBuffer(); return; } // 최초 몇 번은 디코드 대기 중이라 재생 스킵될 수 있음
  const audioCtx = getLaserAudioCtx();
  if(!audioCtx) return;
  if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  const src = audioCtx.createBufferSource();
  src.buffer = enemyHitSoundBuffer;
  const gain = audioCtx.createGain();
  gain.gain.value = ENEMY_HIT_SOUND_VOLUME;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  const playDur = Math.min(src.buffer.duration, ENEMY_HIT_SOUND_MAX_DURATION_MS/1000);
  src.start(0, 0, playDur); // offset 0부터 최대 1.5초까지만 재생(잘라 재생)
}

// 주인공 피격 효과음: 격파음과 마찬가지로 풀(pool) 방식으로 재생 (연속 피격 시 겹쳐도 끊기지 않도록)
const PLAYER_HIT_SOUND_VOLUME = 0.015;
const PLAYER_HIT_SOUND_POOL_SIZE = 3;
const playerHitSoundPool = Array.from({length: PLAYER_HIT_SOUND_POOL_SIZE}, ()=>{
  const a = registerAudio(new Audio('sound/ihit.mp3'));
  a.volume = PLAYER_HIT_SOUND_VOLUME;
  return a;
});
let playerHitSoundIdx = 0;
function playPlayerHitSound(){
  const a = playerHitSoundPool[playerHitSoundIdx];
  playerHitSoundIdx = (playerHitSoundIdx + 1) % PLAYER_HIT_SOUND_POOL_SIZE;
  a.currentTime = 0;
  a.play().catch(()=>{});
}

// 보스 격파(폭발) 효과음: 보스는 동시에 여러 번 겹쳐 재생될 일이 거의 없어 단일 인스턴스로 충분.
const BOSS_HIT_SOUND_VOLUME = 0.15;
const bossHitAudio = registerAudio(new Audio('sound/bosshit.m4a'));
bossHitAudio.volume = BOSS_HIT_SOUND_VOLUME;
function playBossHitSound(){
  bossHitAudio.currentTime = 0;
  bossHitAudio.play().catch(()=>{});
}

// 아이템 획득 효과음: R/W 아이템을 먹는 순간 재생. 단일 인스턴스로 충분(연속 획득이 겹칠 일 거의 없음).
const ITEM_PICKUP_SOUND_VOLUME = 0.015;
const itemPickupAudio = registerAudio(new Audio('sound/item.mp3'));
itemPickupAudio.volume = ITEM_PICKUP_SOUND_VOLUME;
function playItemPickupSound(){
  itemPickupAudio.currentTime = 0;
  itemPickupAudio.play().catch(()=>{});
}

// 적 발사(탄환) 효과음: 여러 적이 동시에 쏘는 경우가 많아 풀(pool) 방식으로 재생.
// 각 fireXXX() 발사 패턴 함수 안에서 직접 호출됨(일반 적 전부 + 보스1의 부채꼴탄 포함).
const ENEMY_SHOOT_SOUND_VOLUME = 0.06; // 기존 0.2에서 70% 감소
const ENEMY_SHOOT_SOUND_POOL_SIZE = 6;
const enemyShootSoundPool = Array.from({length: ENEMY_SHOOT_SOUND_POOL_SIZE}, ()=>{
  const a = registerAudio(new Audio('sound/eshoot.m4a'));
  a.volume = ENEMY_SHOOT_SOUND_VOLUME;
  return a;
});
let enemyShootSoundIdx = 0;
function playEnemyShootSound(volume){
  return; // 적 탄소리 제거
}

// 일반8(spiral) 전용 발사음: 총소리 느낌(짧은 크랙+바디), 다른 적 탄소리 풀과 분리.
const SPIRAL_SHOOT_SOUND_VOLUME = 0.06;
const SPIRAL_SHOOT_SOUND_POOL_SIZE = 6;
const spiralShootSoundPool = Array.from({length: SPIRAL_SHOOT_SOUND_POOL_SIZE}, ()=>{
  const a = registerAudio(new Audio('sound/spiral_gunshot.m4a'));
  a.volume = SPIRAL_SHOOT_SOUND_VOLUME;
  return a;
});
let spiralShootSoundIdx = 0;
function playSpiralShootSound(){
  const a = spiralShootSoundPool[spiralShootSoundIdx];
  spiralShootSoundIdx = (spiralShootSoundIdx + 1) % SPIRAL_SHOOT_SOUND_POOL_SIZE;
  a.currentTime = 0;
  a.play().catch(()=>{});
}

// 보스 레이저 발사음: 레이저가 실제로 나가는 동안 계속 루프 재생, 발사가 끝나면 정지.
// (충전 단계에는 재생하지 않고, drawBossLaser()가 실제로 호출되는 구간에서만 재생)
const BOSS_LASER_SOUND_VOLUME = 0.075;
const bossLaserAudio = registerAudio(new Audio('sound/laser.m4a'));
bossLaserAudio.loop = true;
bossLaserAudio.volume = BOSS_LASER_SOUND_VOLUME;
let bossLaserSoundPlaying = false;
function startBossLaserSound(){
  if(bossLaserSoundPlaying) return;
  bossLaserSoundPlaying = true;
  bossLaserAudio.currentTime = 0;
  bossLaserAudio.play().catch(()=>{});
}
function stopBossLaserSound(){
  if(!bossLaserSoundPlaying) return;
  bossLaserSoundPlaying = false;
  bossLaserAudio.pause();
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
// hold(0.5초 정지) -> dash(화면 중앙까지 힘차게 전진, 스테이션은 같은 진행률로 동시에 아래로 퇴장) ->
// descend(기본 위치로 천천히 하강 복귀) -> title(제자리로 돌아온 순간 STAGE N 표시) ->
// startStage() 호출 + 조작 잠금 해제
let launchSequenceActive = false;
let launchPhase = 'sit';
let launchElapsed = 0;
let launchStageNum = 1;
const LAUNCH_SIT_MS = 900;
const LAUNCH_GROW_MS = 2000; // 제자리에서 크기 100%로 확대되는 시간 2초
const LAUNCH_HOLD_MS = 500; // 확대 완료 후 정지 0.5초
const LAUNCH_DASH_MS = 3000; // 화면 중앙까지 힘차게 전진하는 시간(3초로 연장) (스테이션도 같은 진행률로 퇴장)
const LAUNCH_DESCEND_MS = 3000; // 기본 위치로 하강 복귀하는 시간(3초로 연장)
const LAUNCH_TITLE_MS = 1300;
const LAUNCH_SIT_SCALE = 0.5; // 발사대 위에 앉아있을 때 축소 비율(50%에서 확대 시작)
let launchCenterY = 0; // dash 종료 시점의 화면 중앙 y (계산해서 고정)
let launchBaseY = 0; // 발사 시작 시 스테이션 링 중심 y (sit/grow/hold 동안의 고정 위치)

function startLaunchSequence(stageNum){
  launchStageNum = stageNum || 1;
  launchSequenceActive = true;
  launchPhase = 'sit';
  launchElapsed = 0;
  // 기체를 스테이션 발사 링 중심에 정확히 배치 (station.png 링 좌표 분석값, bg.js)
  player.x = (typeof STATION_RING_X !== 'undefined' && STATION_RING_X) ? STATION_RING_X : W/2;
  player.y = (typeof STATION_RING_Y !== 'undefined' && STATION_RING_Y) ? STATION_RING_Y : H - 80;
  launchBaseY = player.y;
  launchCenterY = H/2;
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
    launchPhase = 'descend'; launchElapsed = 0;
  } else if(launchPhase === 'descend' && launchElapsed >= LAUNCH_DESCEND_MS){
    launchPhase = 'title'; launchElapsed = 0;
  } else if(launchPhase === 'title' && launchElapsed >= LAUNCH_TITLE_MS){
    launchSequenceActive = false;
    // 시퀀스 중 화면에 그려지던 위치(H-80, 즉 기본 플레이 위치)를 실제 player.y에도 반영해
    // 조작 가능 시점에 기체가 순간이동하지 않고 그 자리에서 그대로 이어지도록 함.
    player.y = H - 80;
    startStage(launchStageNum); // 여기서부터 실제 게임 시작(적 스폰 활성화) + 조작 잠금 해제
  }
}

// 현재 프레임의 렌더 상태(기체 y좌표, 크기 배율, 그림자 배율, 스테이션 퇴장 비율) 계산
function getLaunchRenderState(){
  if(launchPhase === 'sit'){
    return { y: launchBaseY, scale: LAUNCH_SIT_SCALE, shadowScale: LAUNCH_SIT_SCALE, stationOffset: 0 };
  }
  if(launchPhase === 'grow'){
    const t = Math.min(1, launchElapsed / LAUNCH_GROW_MS);
    const ease = 1 - Math.pow(1 - t, 2); // ease-out: 서서히 가속 후 감속
    const scale = LAUNCH_SIT_SCALE + (1 - LAUNCH_SIT_SCALE) * ease;
    return {
      y: launchBaseY, // 제자리에서 확대만
      scale,
      shadowScale: scale, // 기체가 커지는 만큼 그림자도 함께 커짐
      stationOffset: 0
    };
  }
  if(launchPhase === 'hold'){
    return { y: launchBaseY, scale: 1, shadowScale: 1, stationOffset: 0 }; // 정지
  }
  if(launchPhase === 'dash'){
    const t = Math.min(1, launchElapsed / LAUNCH_DASH_MS);
    const ease = 1 - Math.pow(1 - t, 2); // ease-out: 힘차게 튀어나가듯 전진
    return {
      y: launchBaseY + (launchCenterY - launchBaseY) * ease,
      scale: 1,
      shadowScale: 1,
      stationOffset: ease // 기체가 전진하는 진행률과 동일하게 스테이션도 아래로 퇴장
    };
  }
  if(launchPhase === 'descend'){
    const t = Math.min(1, launchElapsed / LAUNCH_DESCEND_MS);
    const ease = 1 - Math.pow(1 - t, 3); // 더 천천히 감속하며 착지 (기존보다 느리게 복귀)
    return {
      y: launchCenterY + ((H - 80) - launchCenterY) * ease,
      scale: 1,
      shadowScale: 1,
      stationOffset: 1 // 스테이션은 이미 화면 밖으로 사라진 상태 유지
    };
  }
  // 'title' 단계: 기본 위치에 정지, 스테이션은 화면 밖
  return { y: H - 80, scale: 1, shadowScale: 1, stationOffset: 1 };
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
  let renderScale = 1;
  let shadowScale = 0; // 0이면 그림자 안 그림 (발사 시퀀스의 sit/grow/hold 단계에서만 사용)
  if(launchSequenceActive){
    const st = getLaunchRenderState();
    renderY = st.y;
    renderScale = st.scale;
    // dash 단계부터는 기체가 스테이션을 벗어나 날아가는 연출이라 그림자를 그리지 않음
    if(launchPhase === 'sit' || launchPhase === 'grow' || launchPhase === 'hold'){
      shadowScale = st.shadowScale;
    }
  } else if(playerRespawnTimer > 0){
    const t = 1 - (playerRespawnTimer / PLAYER_RESPAWN_RISE_DURATION); // 0(시작) -> 1(완료)
    const ease = 1 - Math.pow(1 - t, 2); // ease-out: 빠르게 올라오다 서서히 감속
    renderY = player.y + PLAYER_RESPAWN_RISE_DISTANCE * (1 - ease);
  }
  const img = playerFrames[Math.floor(Date.now() / PLAYER_FRAME_INTERVAL_MS) % playerFrames.length];
  if(!img || !img.complete || img.naturalWidth === 0) return;
  const size = 96 * renderScale;
  if(shadowScale > 0){
    // 기체 스프라이트 자체의 실루엣을 그대로 검게 칠해 그림자로 사용(타원 대체) - 기체 바로 아래 깔리도록
    // 세로로 살짝 눌러(squish) 바닥에 깔린 느낌을 내고, 살짝 아래로만 오프셋.
    const shadowSize = size;
    const shadowOffsetY = 10 * shadowScale;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.filter = 'brightness(0)'; // 투명도(알파)는 유지한 채 보이는 픽셀만 검게 칠함 -> 기체와 동일한 실루엣
    ctx.translate(player.x, renderY + shadowOffsetY);
    ctx.scale(1, 0.55); // 바닥에 깔린 것처럼 세로로 압축
    ctx.drawImage(img, -shadowSize/2, -shadowSize/2, shadowSize, shadowSize);
    ctx.restore();
  }
  ctx.drawImage(img, player.x - size/2, renderY - size/2, size, size);
}

// ---- 아이템 (R: 탄속 강화 스택형, W: 3방향 스프레드) ----
const itemAssets = { R: 'assets/optimized/item_r_sm.png', W: 'assets/optimized/item_w_sm.png' };
const itemImgs = {};
Object.entries(itemAssets).forEach(([key, src])=>{
  const img = new Image();
  img.src = src;
  itemImgs[key] = img;
});

// 폭탄 HUD 아이콘 스프라이트 (item_r/item_w와 동일 프레임 틀, 색상만 붉은 계열로 변경 + 알파벳 B)
const bombIconImg = new Image();
bombIconImg.src = 'assets/optimized/item_bomb_sm.png';
let items = []; // {type:'R'|'W', x, y, vy}
const ITEM_FALL_SPEED = 90; // px/s
const ITEM_SIZE_R = 90; // px (20% 축소, 기존 112px)
const ITEM_SIZE_W = 115; // px, R보다 더 크게 (20% 축소, 기존 144px)
let playerRStack = 0; // 0~4, R 아이템 스택 개수 (스택당 탄속 +35% + 발사 주기 단축, 최대 4개면 +140%)
let playerHasW = false; // W 아이템 획득 여부 (3방향 스프레드), 획득하면 더 이상 W 아이템 드랍 안 됨
// R/W는 격파 드랍과 무관하게 stage.js에서 시간 기반으로 독립 등장(STAGE1_R_SPAWN_*, STAGE1_W_SPAWN_* 참고)

function spawnItem(type, x, y){
  // 등장 시 근처 적 탄환과 겹치지 않도록 x좌표를 살짝 밀어냄 (겹침 회피)
  const size = type === 'W' ? ITEM_SIZE_W : ITEM_SIZE_R;
  const avoidRadius = size/2 + 20; // 탄환 반경(6px) 포함 여유
  const margin = size/2 + 10;
  let attempts = 0;
  while(attempts < 8 && typeof bullets !== 'undefined' && bullets.some(b => Math.hypot(b.x - x, b.y - y) < avoidRadius)){
    x += (Math.random() < 0.5 ? -1 : 1) * (avoidRadius + 10);
    x = Math.max(margin, Math.min(W - margin, x));
    attempts++;
  }
  items.push({ type, x, y, vy: ITEM_FALL_SPEED, pulseSeed: Math.random()*Math.PI*2 });
}

function drawItem(it){
  const img = itemImgs[it.type];
  if(!img || !img.complete || img.naturalWidth === 0) return;
  const size = it.type === 'W' ? ITEM_SIZE_W : ITEM_SIZE_R;
  // 발광했다 안했다 하는 펄스 연출 (실제 시간 기반, dt 무관)
  const pulse = 0.5 + 0.5 * Math.sin(Date.now()/220 + (it.pulseSeed || 0));
  ctx.save();
  ctx.shadowColor = it.type === 'R' ? '#ff9a3c' : '#c77dff';
  ctx.shadowBlur = 8 + pulse * 22;
  ctx.globalAlpha = 0.75 + pulse * 0.25;
  ctx.drawImage(img, it.x - size/2, it.y - size/2, size, size);
  ctx.restore();
}

const ITEM_AVOID_SPEED = 220; // px/s, 아이템이 탄환을 피하는 좌우 최대 회피 속도

// 낙하 중에도 매 프레임 근처 적 탄환을 좌우로 피하도록 스티어링 (즉시 텔레포트가 아닌 dt 기반 이동)
function avoidBulletsForItem(it, dt){
  const size = it.type === 'W' ? ITEM_SIZE_W : ITEM_SIZE_R;
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
const spawnCycle = ['normal1','normal2','normal3','normal4','normal5','normal6']; // 일반7/8은 별도 타이머로 분리
let cycleIdx = 0;
const MAX_ENEMIES_ON_SCREEN = 10; // 화면 내 동시 존재 상한 (항상 8~10기 유지되도록 목표치와 함께 사용)
const NORMAL_SPAWN_INTERVAL = 350; // 공용 사이클 spawn 체크 간격(ms) — 인원 미달 시 이 주기로 즉시 재시도해 격파 즉시 채움
const NORMAL7_SPAWN_INTERVAL = 4000;  // 일반7 spawn 간격(ms)
let normal8SpawnTimer = 0; // ms 누적, spiral(일반8) 전용 스폰 타이머
const NORMAL8_SPAWN_INTERVAL = 10000; // spiral 등장 간격: 1기 등장 후 10초 뒤 다음 등장

// ---- 스폰 함수 (모든 이동속도는 px/s, 모든 타이머는 ms 기준) ----

function spawnNormal1(){ // 일반1: 터렛 포드, 지그재그
  const count = 2 + Math.floor(Math.random()*2); // 2~3대
  const margin = 90;
  const minGapX = 70; // 서로 최소 이 정도 x간격은 유지(완전 겹침 방지)
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
      type:'normal1', x, y: -40 - Math.random()*260, // 등장 높이도 각자 크게 다르게(대형처럼 안 보이도록)
      vy:110, zdir: Math.random()<0.5?1:-1, hp:2, score:90, cool:0, fireRate:1000
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
      type:'normal2', x, y: -40 - Math.random()*260,
      vy:110, hp:2, score:90, cool:0, fireRate:1000
    });
  }
}
function spawnNormal3(){ // 일반3: 정찰 드론
  enemies.push({
    type:'normal3', x: 80 + Math.random()*(W-160), y:-30,
    vy:90, hp:7, score:50, cool:0, fireRate:1250
  });
}
function spawnNormal4(){ // 일반4: 감염형 편대(정방향), Zone-1 좌측 끝에서 등장해 Zone-2 우측으로 빠져나감 (3대 가로로 나란히, 겹치지 않음)
  const startX = -60;
  const spacing = 75; // 스프라이트(80px)끼리 겹치지 않는 가로 간격
  const zone1Y = ZONE_HEIGHT * 0.5;   // Zone-1 중간 높이에서 시작
  const zone2Y = ZONE_HEIGHT * 1.5;   // Zone-2 중간 높이로 하강하며 퇴장
  const travelDist = W + 120; // startX(-60) ~ 퇴장(W+60)
  const vx = 240; // 편대 이동속도, px/s
  const timeToCross = travelDist / vx; // seconds
  const baseVy = (zone2Y - zone1Y) / timeToCross; // px/s
  const squadId = 'squad_' + Date.now() + '_' + Math.random();
  for(let i=-1;i<=1;i++){
    const vySpread = baseVy * (1 + (Math.random()*0.3 - 0.15)); // 개체별 속도 ±15% 편차
    enemies.push({
      type:'normal4', x: startX + i*spacing, y: zone1Y,
      vx, vy: vySpread, hp:4, score:70, cool:0, squadId,
      isSquadLeader: i === 0, fired:false, fireDelay: 900 // 편대 중앙 기체만 등장 0.9초 후 180도 9발 부채꼴 1회 발사
    });
  }
}
function spawnNormal5(){ // 일반5: 감염형 편대(역방향), Zone-1 우측 끝에서 등장해 Zone-2 좌측으로 빠져나감 (좌우 대칭 버전)
  const startX = W + 60;
  const spacing = 75;
  const zone1Y = ZONE_HEIGHT * 0.5;
  const zone2Y = ZONE_HEIGHT * 1.5;
  const travelDist = W + 120;
  const vx = -240; // 우→좌 이동, px/s
  const timeToCross = travelDist / Math.abs(vx);
  const baseVy = (zone2Y - zone1Y) / timeToCross;
  const squadId = 'squad_' + Date.now() + '_' + Math.random();
  for(let i=-1;i<=1;i++){
    const vySpread = baseVy * (1 + (Math.random()*0.3 - 0.15));
    enemies.push({
      type:'normal4', x: startX + i*spacing, y: zone1Y, // 일반4와 동일 type(에셋/탄막 공유), 이동벡터만 반대
      vx, vy: vySpread, hp:4, score:70, cool:0, squadId,
      isSquadLeader: i === 0, fired:false, fireDelay: 900
    });
  }
}
function spawnNormal6(){ // 일반6: 램(Ram), 고속 몸통박치기. Zone-1까지는 직선 하강, Zone-2부터는 플레이어 방향으로 서서히 조준
  const x = 60 + Math.random()*(W-120);
  const y = -40;
  const speed = 510; // 빠른 돌진 속도, px/s
  enemies.push({
    type:'normal6', x, y,
    vx: 0, vy: speed, // Zone-1까지는 아래로 직진
    speed,
    homing: false, // Zone-2 진입 후 true로 전환
    hp:7, score:120
  });
}
function spawnNormal7(){ // 일반7: Stubby
  const margin = 90;
  const x = margin + Math.random()*(W - margin*2);
  enemies.push({
    type:'normal7', x, y:-40, targetY: (Math.random()<0.5 ? ZONE_HEIGHT : ZONE_HEIGHT*2), // Zone-2 또는 Zone-3 경계선 중 랜덤
    settled:false, vy:210, hp:21, score:110, cool:0, fireRate:1833, burstFired:false // 등장(Zone-2 도달) 속도를 빠르게
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
    settled:false, retreating:false, stayTimer:0, vy:150, hp:20, score:130, cool:0, fireRate:90,
    spiralAngle: Math.random()*Math.PI*2, spawnTime: Date.now() // 회전 애니메이션 기준 시각
  });
}

// 보스전 전용: spiral 2기를 보스(x:W/2, Zone-1/2 경계)와 겹치지 않도록 좌우로 벌려 동시 배치.
// 좌측 기체는 Zone-3(더 아래), 우측 기체는 Zone-2로 높이도 다르게 둬서 겹침을 추가로 방지.
const BOSS_SPIRAL_PAIR_OFFSET_X = 130; // px, 화면 중앙(보스 위치)에서 좌우로 벌리는 거리
function spawnBossSpiralPair(){
  spawnNormal8({ x: W/2 - BOSS_SPIRAL_PAIR_OFFSET_X, targetY: ZONE_HEIGHT * 2 });
  spawnNormal8({ x: W/2 + BOSS_SPIRAL_PAIR_OFFSET_X, targetY: ZONE_HEIGHT });
}

function spawnBoss1(){ // 보스1: 외계 문명 중형 기체 (일반7의 약 2.3배 크기)
  enemies.push({
    type:'boss1', x: W/2, y:-140, targetY: ZONE_HEIGHT, // Zone-1과 Zone-2 경계선에 도착 후 정지
    settled:false, vy:80, hp:280, maxHp:280, score:2000, // HP 기존 140에서 2배로 증가
    size:240, cool:0,
    // 좌우 이동↔정지 발사 상태 머신 (등장 완료 후부터 동작)
    moveState:'move', moveTargetX: null, moveSpeed:180, // px/s, 좌우 이동 속도
    minMoveDist:120, // px, 한 번 이동 시 최소 이동 거리
    moveCount:0, // 완료한 이동 횟수 (2회차부터 레이저, 5회차부터 스윕 레이저)
    fireRound:0, fireCool:0, fireElapsed:0, sweepThisRound:false, // fireElapsed: 정지 발사 단계 진입 후 누적 경과(ms), 레이저 충전/스윕 타이밍용
    sweepCenterAngle:0, sweepCenterSet:false // 스윕 시작 시점 플레이어 방향으로 중심각 고정
  });
}

// ---- 탄 발사 패턴 ----

function liteBullet(x,y,r,color){
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function fireAimed(e, color, speed){ // speed: px/s
  const dx = player.x - e.x, dy = player.y - e.y;
  const d = Math.hypot(dx,dy) || 1;
  bullets.push({x:e.x,y:e.y,vx:dx/d*speed,vy:dy/d*speed,r:6,color});
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

function fireFan3(e, color, speed){
  const spread = Math.PI/3; // 양쪽 30도 (총 60도)
  const base = Math.PI/2;
  for(let i=0;i<3;i++){
    const a = base - spread/2 + spread*(i/2);
    bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:6,color});
  }
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
  for(let i=0;i<arcCount;i++){
    const a = base - totalSpread/2 + totalSpread*(i/(arcCount-1));
    bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:7,color});
    playSpiralShootSound(); // 보스 일반탄도 spiral(일반8)과 동일한 총소리로, 갈래마다 재생해 연속으로 잘 들리게 함
  }
}
// 보스1 몸통 하단(주둥이) 실제 화면 좌표. drawBossSprite와 동일한 정렬 기준을 사용해
// 레이저 시작점이 항상 주둥이 끝에서 나오도록 함.
function getBossMuzzle(e){
  const eyeDistFromBottomRatio = 0.603;
  const baseH = e.size * 592/616;
  const bottomY = e.y + baseH * eyeDistFromBottomRatio;
  return { x: e.x, y: bottomY };
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

// 보스1 레이저: 시각 효과 전용(데미지 판정 없음). angleOffsetRad는 수직(아래) 기준 좌우 각도(라디안).
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
  const baseSpeed = 936; // 탄속 30% 상향 기준값: 720 -> 936px/s
  const speed = baseSpeed * (1 + playerRStack * 0.35); // R 스택당 +35%, 최대 4스택 +140%
  playLaserSound(); // 레이저 발사음 재생 (R 스택 비율만큼 재생 속도도 함께 빨라짐)
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
  // 성능 최적화: shadowBlur(매 프레임 고비용 블러 재계산)를 쓰지 않고, 굵고 반투명한 외곽 스트로크를
  // 겹쳐 그려 비슷한 네온 글로우 느낌을 훨씬 저렴하게 재현.
  const speed = Math.hypot(b.vx || 0, b.vy) || 1;
  const dirX = (b.vx || 0) / speed, dirY = b.vy / speed;
  const tailX = b.x - dirX * b.len;
  const tailY = b.y - dirY * b.len;
  ctx.save();
  ctx.lineCap = 'round';
  // 글로우(넓고 옅은 레이어)
  ctx.strokeStyle = 'rgba(0,230,255,0.35)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(tailX, tailY);
  ctx.stroke();
  // 메인 컬러 라인
  ctx.strokeStyle = '#7dfcff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(tailX, tailY);
  ctx.stroke();
  // 밝은 코어 라인
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(tailX, tailY);
  ctx.stroke();
  ctx.restore();
}

// ---- 그리기 헬퍼 ----

function drawSprite(e, key, size){
  const img = assets[key];
  if(!img || !img.complete || img.naturalWidth === 0) return;
  ctx.drawImage(img, e.x - size/2, e.y - size/2, size, size);
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
  ctx.drawImage(img, e.x - w/2, bottomY - h, w, h);
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
  if(hitFrames[type]){ // normal1/2/3/4/6/7/boss1: 프레임 스프라이트 시트 애니메이션 (기종별 색상·크기·프레임수)
    let size = 90;
    let maxLife = 0.5;
    let opacity = 1; // 폭발 전체 불투명도 (0~1), 기종별로 조절 가능
    if(type === 'normal7'){ size = 150; maxLife = 0.6; }
    else if(type === 'boss1'){ size = 320; maxLife = 1.05; opacity = 0.70; screenFlash = SCREEN_FLASH_DURATION; } // 보스는 파편이 훨씬 크고 오래 지속(6프레임) + 화면 전체 화이트 플래시
    const frameCount = hitFrameCounts[type] || 5;
    explosions.push({
      x, y, life: 0, maxLife, kind:'sprite', frames: hitFrames[type],
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
  const size = itemType === 'W' ? ITEM_SIZE_W : ITEM_SIZE_R;
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

// 주인공 피격 시 폭발(스프라이트 시트, 흰색+청색 계열, normal1 시트를 재색상화)
function spawnPlayerHitExplosion(x, y){
  const frameCount = hitFrameCounts.player || 5;
  explosions.push({
    x, y, life: 0, maxLife: 0.5, kind:'sprite', frames: hitFrames.player,
    frameCount, size: 90, opacity: 1
  });
}

// 화면 좌측 하단에 R 아이템 스택을 아이콘으로 나란히(겹치지 않게) 표시 (최대 4개, 스택 0이면 표시 안 함)
const R_STACK_ICON_SIZE = 28; // px
const R_STACK_GAP = 0; // px, 아이콘 사이 간격
// item_r.png 원본(1024x1024)은 실제 도안이 중앙 약 60%만 차지하고 사방에 투명 여백이 있어
// 그대로 그리면 0px 간격으로도 벌어져 보임. 실제 콘텐츠 바운딩박스만 잘라서 그림.
const R_ICON_CROP = { sx: 32, sy: 32, sw: 96, sh: 94 }; // item_r_sm.png(160px 기준)로 축소된 크롭 좌표

function drawRapidHud(){
  if(playerRStack <= 0) return;
  const img = itemImgs['R'];
  if(!img || !img.complete || img.naturalWidth === 0) return;
  ctx.save();
  ctx.globalAlpha = 0.5; // 반투명
  const startX = 2;
  const y = H - 2 - R_STACK_ICON_SIZE;
  for(let i=0;i<playerRStack;i++){
    const x = startX + i * (R_STACK_ICON_SIZE + R_STACK_GAP);
    ctx.drawImage(img, R_ICON_CROP.sx, R_ICON_CROP.sy, R_ICON_CROP.sw, R_ICON_CROP.sh, x, y, R_STACK_ICON_SIZE, R_STACK_ICON_SIZE);
  }
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

const LIFE_ICON_SIZE = 52; // px (좀더 키움)
const BOMB_ICON_SIZE = 46; // px (좀더 키움)
const LIFE_ICON_GAP = 2; // px, 잔기 아이콘 사이 간격(붙여서 표시)

// SCORE 좌측: 주인공 기체 아이콘으로 잔여 라이프 표시 (LIFE 글자 없음, 반투명), SCORE 텍스트 블록 높이에 맞춰 정렬
function drawLifeHud(){
  const img = assets['player'];
  if(!img || !img.complete || img.naturalWidth === 0) return;
  if(playerLife <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.6; // 반투명
  const totalWidth = playerLife * LIFE_ICON_SIZE + (playerLife - 1) * LIFE_ICON_GAP;
  const rightEdge = W/2 - 65; // SCORE 텍스트 블록 좌측 여백
  const startX = rightEdge - totalWidth;
  const y = 12; // SCORE 라벨/숫자 블록(대략 13~58px) 세로 중심에 맞춤
  for(let i=0;i<playerLife;i++){
    const x = startX + i * (LIFE_ICON_SIZE + LIFE_ICON_GAP);
    ctx.drawImage(img, x, y, LIFE_ICON_SIZE, LIFE_ICON_SIZE);
  }
  ctx.restore();
}

// SCORE 우측: 폭탄 아이콘(스프라이트, assets/items/item_bomb.png)으로 잔여 폭탄 표시 (반투명)
function drawBombHud(){
  if(playerBombs <= 0) return;
  if(!bombIconImg.complete || bombIconImg.naturalWidth === 0) return;
  ctx.save();
  ctx.globalAlpha = 0.6; // 반투명
  const leftEdge = W/2 + 65; // SCORE 텍스트 블록 우측 여백
  const y = 14; // SCORE 라벨/숫자 블록 세로 중심에 맞춤
  for(let i=0;i<playerBombs;i++){
    const x = leftEdge + i * (BOMB_ICON_SIZE + LIFE_ICON_GAP);
    ctx.drawImage(bombIconImg, x, y, BOMB_ICON_SIZE, BOMB_ICON_SIZE);
  }
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
  if(!boss || boss.type !== 'boss1') return;
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
