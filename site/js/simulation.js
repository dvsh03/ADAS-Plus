/**
 * ADAS-Plus Interactive Vehicle Simulation Engine
 * Synchronized Dual Viewports: Top-Down Aerial View & Driver Cockpit Windshield View
 * High-DPI Canvas Rendering | Zero Dependencies | Full Accessibility Support
 */

(function () {
  'use strict';

  // --- Configuration & Constants ---
  const ROAD_WIDTH_METERS = 7.0; // Two-lane road (3.5m each lane)
  const CAR_WIDTH_METERS = 1.9;
  const CAR_LENGTH_METERS = 4.2;
  const CRUISE_SPEED_KMH = 45.0; // ~12.5 m/s
  const DECEL_BRAKING_MS2 = 6.2; // Emergency deceleration (m/s^2)
  const HUMAN_REACTION_TIME_SEC = 1.1; // Human driver perception-reaction delay

  // Distance thresholds (meters, illustrative simulation scale)
  const DIST_DANGER_THRESHOLD = 14.0;
  const DIST_CAUTION_THRESHOLD = 28.0;

  // Simulation State Enum
  const STATE = {
    CLEAR: 'CLEAR',
    DETECTED: 'DETECTED',
    CAUTION: 'CAUTION',
    DANGER: 'DANGER',
    OUTCOME: 'OUTCOME'
  };

  // Modes
  const MODE = {
    PROTOTYPE: 'prototype', // Warns driver, driver brakes after reaction delay
    PLANNED: 'planned'     // Automatic Emergency Braking (Planned concept)
  };

  // Trajectory Entry Sides
  const SIDES = ['left', 'right', 'center'];

  // DOM Elements
  const topCanvas = document.getElementById('topViewCanvas');
  const driverCanvas = document.getElementById('driverViewCanvas');
  const flashOverlay = document.getElementById('windshieldFlash');

  // Controls DOM
  const btnPrototypeMode = document.getElementById('btnModePrototype');
  const btnPlannedMode = document.getElementById('btnModePlanned');
  const btnToggleNight = document.getElementById('btnToggleNight');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnResetSim = document.getElementById('btnResetSim');

  // HUD DOM
  const hudStatePill = document.getElementById('hudStatePill');
  const hudDistanceVal = document.getElementById('hudDistanceVal');
  const hudSpeedVal = document.getElementById('hudSpeedVal');
  const hudStoppingVal = document.getElementById('hudStoppingVal');
  const hudBuzzerVal = document.getElementById('hudBuzzerVal');
  const simOutcomeText = document.getElementById('simOutcomeText');
  const simOutcomeNote = document.getElementById('simOutcomeNote');
  const simLiveAnnouncer = document.getElementById('simLiveAnnouncer');

  if (!topCanvas || !driverCanvas) {
    return;
  }

  const topCtx = topCanvas.getContext('2d');
  const driverCtx = driverCanvas.getContext('2d');

  // --- Simulation State Variables ---
  let isRunning = true;
  let isNightMode = false;
  let currentMode = MODE.PROTOTYPE;
  let currentState = STATE.CLEAR;

  // Car State
  let carSpeedKmh = CRUISE_SPEED_KMH;
  let carSpeedMs = CRUISE_SPEED_KMH / 3.6;
  let carDecelerating = false;
  let brakeApplied = false;
  let alertTriggerTime = null; // Timestamp when Caution/Danger began
  let roadScrollOffset = 0;

  // Animal Obstacle State
  let animal = {
    x: -5.0,        // Lateral offset from road center (meters): 0 = center lane, - = left, + = right
    z: 60.0,        // Longitudinal distance ahead of car bumper (meters)
    vx: 1.2,        // Lateral velocity (m/s)
    type: 'cow',    // 'cow' or 'dog'
    side: 'left',
    walkCycle: 0,
    widthMeters: 1.8,
    lengthMeters: 2.2,
    crossingActive: true,
    resolved: false
  };

  // Outcome Tracking
  let outcomeTimer = 0;
  let lastOutcome = null;

  // Check user preference for motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    isRunning = false;
    if (btnPlayPause) {
      btnPlayPause.textContent = '▶ Play';
      btnPlayPause.classList.remove('active');
    }
  }

  // --- Canvas High-DPI Sizing Helper ---
  function resizeCanvas(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.resetTransform?.();
      ctx.scale(dpr, dpr);
    }
    return { width, height };
  }

  // --- Reset & Respawn Animal Event ---
  function spawnAnimal() {
    const side = SIDES[Math.floor(Math.random() * SIDES.length)];
    animal.side = side;
    animal.type = Math.random() > 0.3 ? 'cow' : 'dog';
    animal.z = 62.0; // Start ~60 meters ahead
    animal.walkCycle = 0;
    animal.resolved = false;
    animal.crossingActive = true;

    if (side === 'left') {
      animal.x = -ROAD_WIDTH_METERS / 2 - 2.8;
      animal.vx = 1.35 + Math.random() * 0.4; // Walking into road from left
    } else if (side === 'right') {
      animal.x = ROAD_WIDTH_METERS / 2 + 2.8;
      animal.vx = -(1.35 + Math.random() * 0.4); // Walking into road from right
    } else {
      // Wandering slowly in lane
      animal.x = (Math.random() - 0.5) * 1.5;
      animal.vx = (Math.random() - 0.5) * 0.3;
    }

    // Reset car dynamics
    carSpeedKmh = CRUISE_SPEED_KMH;
    carSpeedMs = CRUISE_SPEED_KMH / 3.6;
    carDecelerating = false;
    brakeApplied = false;
    alertTriggerTime = null;
    currentState = STATE.CLEAR;
  }

  spawnAnimal();

  // --- Physics & State Update Loop ---
  let lastTimestamp = performance.now();

  function updateSimulation(dt) {
    if (!isRunning) return;

    // Road scroll proportional to car speed
    roadScrollOffset = (roadScrollOffset + carSpeedMs * dt * 25) % 1000;

    // Animal walking motion
    animal.walkCycle += dt * 4.5;
    if (animal.crossingActive) {
      animal.x += animal.vx * dt;
    }

    // Relative longitudinal approach
    animal.z -= carSpeedMs * dt;

    // Calculate dynamic stopping distance: d_stop = (v^2) / (2 * a)
    const stoppingDistMeters = (carSpeedMs * carSpeedMs) / (2 * DECEL_BRAKING_MS2);

    // Hazard evaluation: Is animal in or heading into car's travel corridor?
    const inPath = Math.abs(animal.x) < 2.0;
    const headingIntoPath = (animal.side === 'left' && animal.vx > 0 && animal.x < 1.5) ||
                            (animal.side === 'right' && animal.vx < 0 && animal.x > -1.5);
    const isThreat = inPath || headingIntoPath;

    // --- State Machine ---
    if (!animal.resolved) {
      if (animal.z <= 0.8) {
        // Animal reached or passed vehicle bumper
        animal.resolved = true;
        if (Math.abs(animal.x) < 1.4) {
          // Collision event
          currentState = STATE.DANGER;
          setOutcome('COLLISION', 'Animal was in vehicle path. Human reaction latency exceeded buffer distance.');
        } else {
          // Animal passed safely
          setOutcome('PASSED', 'Animal crossed or cleared lane safely.');
        }
      } else if (carSpeedMs <= 0.2) {
        // Car came to a complete stop before hitting animal
        animal.resolved = true;
        setOutcome('SAFE_STOP', `Vehicle safely halted ${Math.max(0, animal.z).toFixed(1)} m before animal.`);
      } else if (isThreat && (animal.z < DIST_DANGER_THRESHOLD || animal.z < stoppingDistMeters * 1.15)) {
        currentState = STATE.DANGER;
        if (!alertTriggerTime) alertTriggerTime = performance.now();
      } else if (isThreat && animal.z < DIST_CAUTION_THRESHOLD) {
        currentState = STATE.CAUTION;
        if (!alertTriggerTime) alertTriggerTime = performance.now();
      } else if (animal.z < 55.0) {
        currentState = STATE.DETECTED;
      } else {
        currentState = STATE.CLEAR;
      }
    }

    // --- Braking Response Logic Based on Mode ---
    if (currentMode === MODE.PLANNED) {
      // Planned Concept Mode: Automatic Emergency Braking (Zero human reaction delay)
      if ((currentState === STATE.DANGER || currentState === STATE.CAUTION) && !carDecelerating) {
        carDecelerating = true;
        brakeApplied = true;
      }
    } else {
      // Working Prototype Mode: Driver Warns Only (Human Reaction Delay)
      if ((currentState === STATE.DANGER || currentState === STATE.CAUTION) && alertTriggerTime) {
        const timeSinceAlertSec = (performance.now() - alertTriggerTime) / 1000.0;
        if (timeSinceAlertSec >= HUMAN_REACTION_TIME_SEC) {
          // Driver hits brakes after reaction time
          carDecelerating = true;
          brakeApplied = true;
        }
      }
    }

    // Apply deceleration
    if (carDecelerating) {
      carSpeedMs = Math.max(0, carSpeedMs - DECEL_BRAKING_MS2 * dt);
      carSpeedKmh = carSpeedMs * 3.6;
    }

    // Handle outcome transition timeout
    if (animal.resolved) {
      outcomeTimer += dt;
      if (outcomeTimer >= 3.0) {
        outcomeTimer = 0;
        spawnAnimal();
      }
    }

    updateHUD(stoppingDistMeters);
  }

  // --- Outcome Reporting ---
  function setOutcome(type, message) {
    lastOutcome = { type, message };
    outcomeTimer = 0;

    let icon = '🛡️';
    let textClass = 'color: var(--accent-emerald)';

    if (type === 'COLLISION') {
      icon = '⚠️';
      textClass = 'color: var(--accent-rose)';
    } else if (type === 'PASSED') {
      icon = '✅';
      textClass = 'color: var(--accent-cyan)';
    }

    if (simOutcomeText) {
      simOutcomeText.innerHTML = `<span style="${textClass}">${icon} ${message}</span>`;
    }

    if (simOutcomeNote) {
      if (currentMode === MODE.PROTOTYPE) {
        simOutcomeNote.textContent = 'Prototype Mode: Alerts driver only. The human driver brakes manually after reaction time.';
      } else {
        simOutcomeNote.textContent = 'Planned Concept: Automatic emergency braking halts car without human reaction lag (Not implemented in prototype).';
      }
    }

    // Announce to screen readers
    if (simLiveAnnouncer) {
      simLiveAnnouncer.textContent = `Simulation result: ${message}`;
    }
  }

  // --- HUD Update ---
  function updateHUD(stoppingDistMeters) {
    if (hudStatePill) {
      hudStatePill.className = `hud-state-pill state-${currentState.toLowerCase()}`;
      hudStatePill.textContent = currentState;
    }

    if (hudDistanceVal) {
      if (animal.z > 0 && animal.z < 60) {
        hudDistanceVal.textContent = `${animal.z.toFixed(1)} m`;
      } else {
        hudDistanceVal.textContent = '-- m';
      }
    }

    if (hudSpeedVal) {
      hudSpeedVal.textContent = `${Math.round(carSpeedKmh)} km/h`;
    }

    if (hudStoppingVal) {
      hudStoppingVal.textContent = `${stoppingDistMeters.toFixed(1)} m`;
    }

    if (hudBuzzerVal) {
      if (currentState === STATE.DANGER) {
        hudBuzzerVal.textContent = 'Continuous Alarm';
        hudBuzzerVal.style.color = 'var(--accent-rose)';
      } else if (currentState === STATE.CAUTION) {
        hudBuzzerVal.textContent = 'Pulsed Chime';
        hudBuzzerVal.style.color = 'var(--accent-amber)';
      } else {
        hudBuzzerVal.textContent = 'Silent (Clear)';
        hudBuzzerVal.style.color = 'var(--text-muted)';
      }
    }

    // Windshield flash overlay on Danger
    if (flashOverlay) {
      if (currentState === STATE.DANGER) {
        flashOverlay.classList.add('active-danger');
      } else {
        flashOverlay.classList.remove('active-danger');
      }
    }
  }

  // ============================================================
  // RENDER 1: BIRD'S-EYE TOP-DOWN ROAD VIEW
  // ============================================================
  function drawTopView() {
    const { width, height } = resizeCanvas(topCanvas, topCtx);
    const ctx = topCtx;

    // Background Verge / Grass
    const grassColor = isNightMode ? '#0c1514' : '#1e3328';
    ctx.fillStyle = grassColor;
    ctx.fillRect(0, 0, width, height);

    // Road Dimensions
    const roadWidthPx = Math.min(width * 0.72, 240);
    const roadLeft = (width - roadWidthPx) / 2;
    const roadRight = roadLeft + roadWidthPx;
    const roadCenter = width / 2;

    // Asphalt
    ctx.fillStyle = isNightMode ? '#10141d' : '#1e2430';
    ctx.fillRect(roadLeft, 0, roadWidthPx, height);

    // Shoulder Curbs
    ctx.fillStyle = isNightMode ? '#2a3344' : '#475569';
    ctx.fillRect(roadLeft - 4, 0, 4, height);
    ctx.fillRect(roadRight, 0, 4, height);

    // Center Dashed Lane Lines (Animated)
    ctx.strokeStyle = isNightMode ? '#64748b' : '#f8fafc';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 14]);
    ctx.lineDashOffset = -roadScrollOffset;
    ctx.beginPath();
    ctx.moveTo(roadCenter, 0);
    ctx.lineTo(roadCenter, height);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Roadside Trees / Markers scrolling
    ctx.fillStyle = isNightMode ? '#142921' : '#2d5a44';
    const treeSpacing = 70;
    const treeOffset = roadScrollOffset % treeSpacing;
    for (let y = -treeSpacing + treeOffset; y < height + treeSpacing; y += treeSpacing) {
      // Left trees
      ctx.beginPath();
      ctx.arc(roadLeft - 22, y, 12, 0, Math.PI * 2);
      ctx.fill();
      // Right trees
      ctx.beginPath();
      ctx.arc(roadRight + 22, y, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Car Position (fixed near bottom)
    const carY = height * 0.74;
    const carWidthPx = (CAR_WIDTH_METERS / ROAD_WIDTH_METERS) * roadWidthPx;
    const carHeightPx = (CAR_LENGTH_METERS / ROAD_WIDTH_METERS) * roadWidthPx;
    const carX = roadCenter - carWidthPx / 2;

    // Headlight / IR Illumination Beams (Top View)
    if (isNightMode) {
      // 850 nm IR / Headlight Light Cone forward
      const coneGrad = ctx.createRadialGradient(
        roadCenter, carY, 10,
        roadCenter, carY - 140, 180
      );
      coneGrad.addColorStop(0, 'rgba(59, 130, 246, 0.45)');
      coneGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.2)');
      coneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(carX + 4, carY);
      ctx.lineTo(roadLeft - 20, carY - 200);
      ctx.lineTo(roadRight + 20, carY - 200);
      ctx.lineTo(carX + carWidthPx - 4, carY);
      ctx.closePath();
      ctx.fill();
    }

    // Ultrasonic / Radar Range Sensor Arc (gated detection visual)
    if (currentState !== STATE.CLEAR) {
      ctx.strokeStyle = currentState === STATE.DANGER ? 'rgba(239, 68, 68, 0.65)' :
                        currentState === STATE.CAUTION ? 'rgba(245, 158, 11, 0.6)' :
                        'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(roadCenter, carY, 110, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Top-View Vehicle
    drawTopViewCar(ctx, carX, carY, carWidthPx, carHeightPx);

    // Draw Top-View Animal
    // Scale: distance in meters to pixels
    const pxPerMeter = (height * 0.7) / 50.0;
    const animalY = carY - (animal.z * pxPerMeter);
    const animalXPx = roadCenter + ((animal.x / (ROAD_WIDTH_METERS / 2)) * (roadWidthPx / 2));

    if (animalY > -40 && animalY < height + 40) {
      drawTopViewAnimal(ctx, animalXPx, animalY, animal.type, animal.walkCycle, animal.vx);
    }
  }

  function drawTopViewCar(ctx, x, y, w, h) {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.roundRect(x - 2, y + 2, w + 4, h + 4, 8);
    ctx.fill();

    // Car Body
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();

    // Windshield
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 8, w - 8, h * 0.22, 3);
    ctx.fill();

    // Rear glass
    ctx.beginPath();
    ctx.roundRect(x + 5, y + h - 14, w - 10, h * 0.16, 2);
    ctx.fill();

    // Roof
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(x + 5, y + h * 0.32, w - 10, h * 0.35);

    // Headlights
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(x + 2, y - 1, 5, 3);
    ctx.fillRect(x + w - 7, y - 1, 5, 3);

    // Taillights
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x + 2, y + h - 2, 5, 3);
    ctx.fillRect(x + w - 7, y + h - 2, 5, 3);

    ctx.restore();
  }

  function drawTopViewAnimal(ctx, x, y, type, walkCycle, vx) {
    ctx.save();

    const legOffset = Math.sin(walkCycle) * 3;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Animal Body (Cow-like shape)
    ctx.fillStyle = type === 'cow' ? '#d97706' : '#78716c';
    ctx.beginPath();
    ctx.roundRect(x - 10, y - 6, 20, 12, 4);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#92400e';
    ctx.fillRect(x - 8 + legOffset, y - 8, 3, 3);
    ctx.fillRect(x + 5 - legOffset, y - 8, 3, 3);
    ctx.fillRect(x - 8 - legOffset, y + 5, 3, 3);
    ctx.fillRect(x + 5 + legOffset, y + 5, 3, 3);

    // Head & Horns
    const headX = vx >= 0 ? x + 11 : x - 11;
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(headX, y, 5, 0, Math.PI * 2);
    ctx.fill();

    if (type === 'cow') {
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(headX - 1, y - 7, 2, 3); // horns
      ctx.fillRect(headX - 1, y + 4, 2, 3);
    }

    // Bounding Box indicator in Top View
    if (currentState !== STATE.CLEAR) {
      const boxColor = currentState === STATE.DANGER ? '#ef4444' :
                       currentState === STATE.CAUTION ? '#f59e0b' : '#06b6d4';
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 14, y - 10, 28, 20);
    }

    ctx.restore();
  }

  // ============================================================
  // RENDER 2: DRIVER WINDSHIELD PERSPECTIVE COCKPIT VIEW
  // ============================================================
  function drawDriverView() {
    const { width, height } = resizeCanvas(driverCanvas, driverCtx);
    const ctx = driverCtx;

    const horizonY = height * 0.44;
    const vpX = width / 2;

    // --- 1. Sky & Atmosphere ---
    if (isNightMode) {
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, '#070b14');
      skyGrad.addColorStop(1, '#111827');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizonY);

      // Stars
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 18; i++) {
        const sx = (i * 47) % width;
        const sy = (i * 23) % (horizonY * 0.7);
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
    } else {
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, '#60a5fa');
      skyGrad.addColorStop(0.7, '#93c5fd');
      skyGrad.addColorStop(1, '#dbeafe');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizonY);
    }

    // Rolling Hills on Horizon
    ctx.fillStyle = isNightMode ? '#0f172a' : '#22543d';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.quadraticCurveTo(width * 0.25, horizonY - 14, width * 0.5, horizonY - 2);
    ctx.quadraticCurveTo(width * 0.75, horizonY - 20, width, horizonY);
    ctx.lineTo(width, horizonY);
    ctx.lineTo(0, horizonY);
    ctx.fill();

    // --- 2. Ground / Terrain ---
    ctx.fillStyle = isNightMode ? '#091312' : '#1e3a2b';
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // --- 3. Perspective Road Trapezoid ---
    const roadTopWidth = 32;
    const roadBottomWidth = width * 0.95;
    const roadBottomY = height * 0.78; // Above dashboard cluster

    ctx.fillStyle = isNightMode ? '#0f172a' : '#1e293b';
    ctx.beginPath();
    ctx.moveTo(vpX - roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX + roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX + roadBottomWidth / 2, roadBottomY);
    ctx.lineTo(vpX - roadBottomWidth / 2, roadBottomY);
    ctx.closePath();
    ctx.fill();

    // Road Edge Stripes
    ctx.strokeStyle = isNightMode ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vpX - roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX - roadBottomWidth / 2, roadBottomY);
    ctx.moveTo(vpX + roadTopWidth / 2, horizonY);
    ctx.lineTo(vpX + roadBottomWidth / 2, roadBottomY);
    ctx.stroke();

    // Perspective Center Lane Lines
    drawPerspectiveCenterLines(ctx, vpX, horizonY, roadBottomY);

    // Night Mode Headlight Illumination on Road
    if (isNightMode) {
      const beamGrad = ctx.createRadialGradient(
        vpX, roadBottomY, 20,
        vpX, horizonY + 20, width * 0.55
      );
      beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.35)');
      beamGrad.addColorStop(0.4, 'rgba(59, 130, 246, 0.2)');
      beamGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(vpX - 20, horizonY + 20);
      ctx.lineTo(vpX + 20, horizonY + 20);
      ctx.lineTo(vpX + roadBottomWidth * 0.45, roadBottomY);
      ctx.lineTo(vpX - roadBottomWidth * 0.45, roadBottomY);
      ctx.closePath();
      ctx.fill();
    }

    // --- 4. Animal Obstacle in Perspective ---
    drawPerspectiveAnimal(ctx, vpX, horizonY, roadBottomY, roadBottomWidth);

    // --- 5. Dashboard Instrument Cluster & Windshield Frame ---
    drawDashboardCluster(ctx, width, height, roadBottomY);
  }

  function drawPerspectiveCenterLines(ctx, vpX, horizonY, roadBottomY) {
    const segments = 12;
    const offsetNorm = (roadScrollOffset % 100) / 100.0;

    ctx.strokeStyle = isNightMode ? '#94a3b8' : '#f8fafc';

    for (let i = 0; i < segments; i++) {
      const t1 = Math.pow((i + offsetNorm) / segments, 2.2);
      const t2 = Math.pow((i + 0.45 + offsetNorm) / segments, 2.2);

      if (t1 > 1.0 || t2 > 1.0) continue;

      const y1 = horizonY + (roadBottomY - horizonY) * t1;
      const y2 = horizonY + (roadBottomY - horizonY) * t2;
      const lineWidth = 1 + t1 * 6;

      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(vpX, y1);
      ctx.lineTo(vpX, y2);
      ctx.stroke();
    }
  }

  function drawPerspectiveAnimal(ctx, vpX, horizonY, roadBottomY, roadBottomWidth) {
    // Mapping distance Z (meters) to perspective scale
    const dist = Math.max(0.5, animal.z);
    // Perspective compression formula: scale ~ 1 / dist
    const scale = Math.min(1.0, 14.0 / dist);

    const groundY = horizonY + (roadBottomY - horizonY) * Math.min(1.0, Math.pow(scale, 0.82));
    const lateralSpanAtGround = (roadBottomWidth * Math.pow(scale, 0.82));
    const animalScreenX = vpX + (animal.x / (ROAD_WIDTH_METERS / 2)) * (lateralSpanAtGround / 2);

    // Dimensions in screen pixels
    const animalH = Math.max(14, 110 * scale);
    const animalW = animalH * 1.4;

    if (dist > 58.0 || dist < 0.2) return;

    ctx.save();

    // Animal Silhouette / Detailed Rendering
    const drawX = animalScreenX - animalW / 2;
    const drawY = groundY - animalH;

    // Shadow on asphalt
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(animalScreenX, groundY - 2, animalW * 0.45, animalH * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Animal Body (Cow profile)
    ctx.fillStyle = isNightMode ? '#9a5312' : '#b45309';
    ctx.beginPath();
    ctx.roundRect(drawX + animalW * 0.15, drawY + animalH * 0.25, animalW * 0.65, animalH * 0.5, animalH * 0.15);
    ctx.fill();

    // Animated Legs
    const legPhase = Math.sin(animal.walkCycle) * (animalH * 0.12);
    ctx.fillStyle = isNightMode ? '#78350f' : '#92400e';
    ctx.fillRect(drawX + animalW * 0.22 + legPhase, drawY + animalH * 0.7, animalW * 0.08, animalH * 0.32);
    ctx.fillRect(drawX + animalW * 0.38 - legPhase, drawY + animalH * 0.7, animalW * 0.08, animalH * 0.32);
    ctx.fillRect(drawX + animalW * 0.58 + legPhase, drawY + animalH * 0.7, animalW * 0.08, animalH * 0.32);
    ctx.fillRect(drawX + animalW * 0.72 - legPhase, drawY + animalH * 0.7, animalW * 0.08, animalH * 0.32);

    // Head, Snout & Horns (Facing direction based on vx)
    const isFacingRight = animal.vx >= 0;
    const headX = isFacingRight ? drawX + animalW * 0.75 : drawX + animalW * 0.05;

    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(headX + animalW * 0.1, drawY + animalH * 0.35, animalH * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Horns
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(headX + (isFacingRight ? 4 : -4), drawY + animalH * 0.12, animalW * 0.06, animalH * 0.18);

    // --- YOLO Bounding Box & Label ---
    if (currentState !== STATE.CLEAR) {
      const boxColor = currentState === STATE.DANGER ? '#ef4444' :
                       currentState === STATE.CAUTION ? '#f59e0b' : '#06b6d4';

      ctx.strokeStyle = boxColor;
      ctx.lineWidth = Math.max(1.5, 2.5 * scale);
      ctx.strokeRect(drawX - 4, drawY - 4, animalW + 8, animalH + 8);

      // Detection Tag Header
      const tagText = `${animal.type} 92% | ${animal.z.toFixed(1)}m`;
      ctx.font = `bold ${Math.max(10, Math.floor(13 * scale))}px monospace`;
      const textMetrics = ctx.measureText(tagText);

      ctx.fillStyle = boxColor;
      ctx.fillRect(drawX - 4, drawY - 20, textMetrics.width + 10, 16);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(tagText, drawX + 1, drawY - 7);
    }

    ctx.restore();
  }

  function drawDashboardCluster(ctx, width, height, roadBottomY) {
    const dashY = roadBottomY;
    const dashHeight = height - dashY;

    ctx.save();

    // Dashboard Bumper / Hood Silhouette
    ctx.fillStyle = isNightMode ? '#090d16' : '#0f172a';
    ctx.beginPath();
    ctx.moveTo(0, dashY);
    ctx.lineTo(width, dashY);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    // Subtle edge highlight
    ctx.strokeStyle = isNightMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, dashY);
    ctx.lineTo(width, dashY);
    ctx.stroke();

    // Steering Wheel Top Arc in center
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(width / 2, height + 40, width * 0.28, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Central Mini-Cluster Screen (ADAS+ Display)
    const clusterW = Math.min(220, width * 0.45);
    const clusterH = dashHeight * 0.72;
    const clusterX = (width - clusterW) / 2;
    const clusterY = dashY + 10;

    // Cluster screen background
    ctx.fillStyle = '#050811';
    ctx.beginPath();
    ctx.roundRect(clusterX, clusterY, clusterW, clusterH, 6);
    ctx.fill();

    const screenBorder = currentState === STATE.DANGER ? '#ef4444' :
                         currentState === STATE.CAUTION ? '#f59e0b' : '#1e293b';
    ctx.strokeStyle = screenBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Speed Digital Readout (Left side of cluster)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText('SPEED', clusterX + 12, clusterY + 18);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`${Math.round(carSpeedKmh)} km/h`, clusterX + 12, clusterY + 38);

    // Central ADAS+ State & Range
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText('ADAS+ ZONE', clusterX + clusterW * 0.52, clusterY + 18);

    const stateColor = currentState === STATE.DANGER ? '#ef4444' :
                       currentState === STATE.CAUTION ? '#f59e0b' :
                       currentState === STATE.DETECTED ? '#06b6d4' : '#10b981';
    ctx.fillStyle = stateColor;
    ctx.font = 'bold 15px monospace';
    ctx.fillText(currentState, clusterX + clusterW * 0.52, clusterY + 38);

    // Audio Buzzer Icon indicator
    if (currentState === STATE.DANGER || currentState === STATE.CAUTION) {
      ctx.fillStyle = stateColor;
      ctx.beginPath();
      ctx.arc(clusterX + clusterW - 18, clusterY + 22, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // --- Animation Frame Loop ---
  function loop(now) {
    const dt = Math.min(0.08, (now - lastTimestamp) / 1000.0);
    lastTimestamp = now;

    updateSimulation(dt);
    drawTopView();
    drawDriverView();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // --- User Control Event Listeners ---
  if (btnPrototypeMode) {
    btnPrototypeMode.addEventListener('click', () => {
      currentMode = MODE.PROTOTYPE;
      btnPrototypeMode.classList.add('active');
      btnPlannedMode.classList.remove('active');
      spawnAnimal();
    });
  }

  if (btnPlannedMode) {
    btnPlannedMode.addEventListener('click', () => {
      currentMode = MODE.PLANNED;
      btnPlannedMode.classList.add('active');
      btnPrototypeMode.classList.remove('active');
      spawnAnimal();
    });
  }

  if (btnToggleNight) {
    btnToggleNight.addEventListener('click', () => {
      isNightMode = !isNightMode;
      btnToggleNight.textContent = isNightMode ? '☀️ Day View' : '🌙 Night + IR';
      btnToggleNight.classList.toggle('active', isNightMode);
    });
  }

  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', () => {
      isRunning = !isRunning;
      btnPlayPause.textContent = isRunning ? '⏸ Pause' : '▶ Play';
      btnPlayPause.classList.toggle('active', isRunning);
    });
  }

  if (btnResetSim) {
    btnResetSim.addEventListener('click', () => {
      spawnAnimal();
    });
  }

  // Window Resize
  window.addEventListener('resize', () => {
    drawTopView();
    drawDriverView();
  });

})();
