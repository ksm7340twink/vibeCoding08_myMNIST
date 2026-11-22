(function () {
  'use strict';

  // DOM 요소
  const canvas = document.getElementById('drawCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const canvasWrapper = document.getElementById('canvasWrapper');
  const canvasPlaceholder = document.getElementById('canvasPlaceholder');

  const thicknessBtns = document.querySelectorAll('.pill-btn');
  const eraserBtn = document.getElementById('eraserBtn');
  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');
  const recognizeBtn = document.getElementById('recognizeBtn');
  const autoRecognizeToggle = document.getElementById('autoRecognizeToggle');
  const photoInput = document.getElementById('photoInput');

  const accuracyBadge = document.getElementById('accuracyBadge');
  const accuracyValue = document.getElementById('accuracyValue');
  const accuracyBarFill = document.getElementById('accuracyBarFill');
  const resultInput = document.getElementById('resultInput');
  const resultHint = document.getElementById('resultHint');
  const detailPanel = document.getElementById('detailPanel');
  const detailTitle = document.getElementById('detailTitle');
  const detailContent = document.getElementById('detailContent');
  const copyBtn = document.getElementById('copyBtn');
  const saveHistoryBtn = document.getElementById('saveHistoryBtn');

  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const themeToggle = document.getElementById('themeToggle');
  const iconMoon = document.getElementById('iconMoon');
  const iconSun = document.getElementById('iconSun');
  const toastEl = document.getElementById('toast');

  // 상태 관리
  let isDrawing = false;
  let isEraser = false;
  let penSize = 18;
  let lastPoint = null;
  let midPoint = null;
  let hasInk = false;
  let undoStack = [];
  const MAX_UNDO = 25;
  let autoTimer = null;
  let lastRecognition = null; // { text, accuracyPct }
  let historyItems = [];
  let toastTimer = null;

  // 테마 색상 helper
  function getInkColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--ink-color').trim() || '#111827';
  }

  // 캔버스 해상도 맞춤 (리사이즈 시 기존 그림 유지)
  function resizeCanvas() {
    const rect = canvasWrapper.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width === targetW && canvas.height === targetH) return;

    let backup = null;
    if (canvas.width > 0 && canvas.height > 0 && hasInk) {
      backup = document.createElement('canvas');
      backup.width = canvas.width;
      backup.height = canvas.height;
      backup.getContext('2d').drawImage(canvas, 0, 0);
    }

    canvas.width = targetW;
    canvas.height = targetH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (backup) {
      ctx.drawImage(backup, 0, 0, targetW, targetH);
    }
  }

  // 다크 모드 전환 시 이미 그려진 잉크 색상도 새 테마에 맞게 변경
  function recolorInkOnCanvas() {
    if (!hasInk) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = getInkColor();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // 실행 취소 스택 관리
  function pushUndoState() {
    if (canvas.width === 0 || canvas.height === 0) return;
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    undoBtn.disabled = undoStack.length === 0;
  }

  function updateInkPresence() {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] > 20) {
        count++;
        if (count > 5) break;
      }
    }
    hasInk = count > 5;
    canvasPlaceholder.classList.toggle('hidden', hasInk);
  }

  function getCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function getStrokeWidth() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return (isEraser ? penSize * 1.9 : penSize) * dpr;
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    clearTimeout(autoTimer);

    canvas.setPointerCapture(e.pointerId);
    pushUndoState();

    isDrawing = true;
    canvasWrapper.classList.add('drawing');
    canvasPlaceholder.classList.add('hidden');

    const pt = getCanvasPoint(e);
    lastPoint = pt;
    midPoint = pt;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = getStrokeWidth();
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.fillStyle = getInkColor();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function onPointerMove(e) {
    if (!isDrawing) return;
    e.preventDefault();

    const pt = getCanvasPoint(e);
    const newMid = {
      x: (lastPoint.x + pt.x) / 2,
      y: (lastPoint.y + pt.y) / 2
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = getStrokeWidth();
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = getInkColor();

    ctx.beginPath();
    ctx.moveTo(midPoint.x, midPoint.y);
    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, newMid.x, newMid.y);
    ctx.stroke();
    ctx.restore();

    lastPoint = pt;
    midPoint = newMid;
  }

  function onPointerUp(e) {
    if (!isDrawing) return;
    e.preventDefault();
    isDrawing = false;
    canvasWrapper.classList.remove('drawing');

    if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    updateInkPresence();
    if (!hasInk) {
      resetResultUI();
      return;
    }

    if (autoRecognizeToggle.checked) {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => {
        runRecognition(false);
      }, 750);
    }
  }

  // =============================
  // 손글씨 이미지 전처리 및 숫자 분할
  // =============================

  // 캔버스에서 잉크 강도 맵(0..255) 추출 + 연결된 숫자 영역 찾기
  function extractDigitCropsFromCanvas() {
    const W = canvas.width;
    const H = canvas.height;
    const imgData = ctx.getImageData(0, 0, W, H).data;

    // 작업용 다운샘플링(속도와 노이즈 제거를 위해 최대 폭 320px 정도로 분석)
    const scale = Math.min(1, 320 / Math.max(W, H));
    const sw = Math.max(1, Math.round(W * scale));
    const sh = Math.max(1, Math.round(H * scale));

    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = sw;
    smallCanvas.height = sh;
    const sctx = smallCanvas.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(canvas, 0, 0, sw, sh);
    const sData = sctx.getImageData(0, 0, sw, sh).data;

    // 이진 마스크 (alpha > 30)
    const mask = new Uint8Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) {
      if (sData[i * 4 + 3] > 30) mask[i] = 1;
    }

    // 8방향 연결 요소(Connected Components) 찾기
    const visited = new Uint8Array(sw * sh);
    const rawBoxes = [];
    const queue = new Int32Array(sw * sh);

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const idx = y * sw + x;
        if (!mask[idx] || visited[idx]) continue;

        let head = 0, tail = 0;
        queue[tail++] = idx;
        visited[idx] = 1;

        let minX = x, maxX = x, minY = y, maxY = y, area = 0;

        while (head < tail) {
          const cur = queue[head++];
          const cx = cur % sw;
          const cy = (cur - cx) / sw;
          area++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= sh) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              if (nx < 0 || nx >= sw) continue;
              const nIdx = ny * sw + nx;
              if (mask[nIdx] && !visited[nIdx]) {
                visited[nIdx] = 1;
                queue[tail++] = nIdx;
              }
            }
          }
        }

        // 아주 작은 점(노이즈) 무시
        if (area >= 8) {
          rawBoxes.push({ minX, maxX, minY, maxY, area });
        }
      }
    }

    if (rawBoxes.length === 0) return [];

    // 5의 윗획, 4/7의 가로획처럼 같은 숫자인데 살짝 끊어진 획들을 가로 겹침 기준으로 병합
    let boxes = rawBoxes.slice();
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const aW = a.maxX - a.minX + 1;
          const bW = b.maxX - b.minX + 1;
          const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
          const minW = Math.min(aW, bW);
          const gapY = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
          const maxH = Math.max(a.maxY - a.minY + 1, b.maxY - b.minY + 1);

          // 가로로 일정 비율 이상 겹치고 세로로 너무 멀지 않으면 같은 숫자의 획으로 병합
          const shouldMerge =
            (overlapX >= minW * 0.28 && gapY <= maxH * 0.55) ||
            (overlapX >= -2 && gapY <= 4 && Math.min(a.area, b.area) < Math.max(a.area, b.area) * 0.25);

          if (shouldMerge) {
            boxes[i] = {
              minX: Math.min(a.minX, b.minX),
              maxX: Math.max(a.maxX, b.maxX),
              minY: Math.min(a.minY, b.minY),
              maxY: Math.max(a.maxY, b.maxY),
              area: a.area + b.area
            };
            boxes.splice(j, 1);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    // 왼쪽에서 오른쪽 순서로 정렬
    boxes.sort((a, b) => a.minX - b.minX);

    // 원본 캔버스 좌표로 환산하여 각 숫자를 28x28 MNIST 규격으로 변환
    const invScale = 1 / scale;
    const crops = [];

    for (const b of boxes) {
      const pad = 1;
      const ox = Math.max(0, Math.floor((b.minX - pad) * invScale));
      const oy = Math.max(0, Math.floor((b.minY - pad) * invScale));
      const ow = Math.min(W - ox, Math.ceil((b.maxX - b.minX + 1 + pad * 2) * invScale));
      const oh = Math.min(H - oy, Math.ceil((b.maxY - b.minY + 1 + pad * 2) * invScale));

      if (ow <= 2 || oh <= 2) continue;

      const tensor28 = cropToMnist28x28(canvas, ox, oy, ow, oh);
      if (tensor28) crops.push(tensor28);
    }

    return crops;
  }

  // 표준 MNIST 전처리: 비율 유지하며 20x20에 맞춘 뒤 무게중심(Center of Mass)을 28x28 중앙(14,14)에 정렬
  function cropToMnist28x28(sourceCanvas, sx, sy, sw, sh) {
    // 1. 정확하게 잘라낸 영역에서 잉크 바운딩 박스 다시 계산
    const temp = document.createElement('canvas');
    temp.width = sw;
    temp.height = sh;
    const tctx = temp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const tData = tctx.getImageData(0, 0, sw, sh).data;
    let minX = sw, maxX = -1, minY = sh, maxY = -1;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (tData[(y * sw + x) * 4 + 3] > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;

    // 2. 긴 변을 20px로 축소/확대 (비율 유지)
    const targetBox = 20;
    const ratio = targetBox / Math.max(bw, bh);
    const rw = Math.max(1, Math.round(bw * ratio));
    const rh = Math.max(1, Math.round(bh * ratio));

    const normCanvas = document.createElement('canvas');
    normCanvas.width = 28;
    normCanvas.height = 28;
    const nctx = normCanvas.getContext('2d', { willReadFrequently: true });
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = 'high';

    const dx = Math.round((28 - rw) / 2);
    const dy = Math.round((28 - rh) / 2);
    nctx.drawImage(temp, minX, minY, bw, bh, dx, dy, rw, rh);

    // 3. 무게중심 계산 후 (14, 14) 중심으로 이동 (MNIST 공식 생성 방식)
    const nData = nctx.getImageData(0, 0, 28, 28).data;
    let sumMass = 0, sumX = 0, sumY = 0;
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 28; x++) {
        const alpha = nData[(y * 28 + x) * 4 + 3] / 255;
        if (alpha > 0.02) {
          sumMass += alpha;
          sumX += x * alpha;
          sumY += y * alpha;
        }
      }
    }

    if (sumMass < 0.1) return null;

    const cx = sumX / sumMass;
    const cy = sumY / sumMass;
    const shiftX = Math.round(13.5 - cx);
    const shiftY = Math.round(13.5 - cy);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = 28;
    finalCanvas.height = 28;
    const fctx = finalCanvas.getContext('2d', { willReadFrequently: true });
    fctx.drawImage(normCanvas, shiftX, shiftY);

    const fData = fctx.getImageData(0, 0, 28, 28).data;
    const out = new Float32Array(784);

    // 약간의 대비 보정 및 너무 얇은 획 보강 (MNIST 표준 굵기에 맞춤)
    let maxVal = 0;
    let sumVal = 0;
    for (let i = 0; i < 784; i++) {
      const v = fData[i * 4 + 3] / 255;
      out[i] = v;
      sumVal += v;
      if (v > maxVal) maxVal = v;
    }
    if (maxVal > 0.1 && maxVal < 0.95) {
      const gain = 1 / maxVal;
      sumVal = 0;
      for (let i = 0; i < 784; i++) {
        out[i] = Math.min(1, out[i] * gain);
        sumVal += out[i];
      }
    }

    // 얇게 쓴 글씨(평균 밀도가 낮을 때)는 부드럽게 1단계 보강
    if (sumVal / 784 < 0.065) {
      const boosted = new Float32Array(784);
      for (let y = 0; y < 28; y++) {
        for (let x = 0; x < 28; x++) {
          let m = out[y * 28 + x];
          if (x > 0) m = Math.max(m, out[y * 28 + x - 1] * 0.65);
          if (x < 27) m = Math.max(m, out[y * 28 + x + 1] * 0.65);
          if (y > 0) m = Math.max(m, out[(y - 1) * 28 + x] * 0.65);
          if (y < 27) m = Math.max(m, out[(y + 1) * 28 + x] * 0.65);
          boosted[y * 28 + x] = m;
        }
      }
      return boosted;
    }

    return out;
  }

  // =============================
  // 인식 실행 및 결과 UI 업데이트
  // =============================

  function runRecognition(showWarningIfEmpty = true) {
    clearTimeout(autoTimer);
    updateInkPresence();

    if (!hasInk) {
      if (showWarningIfEmpty) {
        showToast('숫자를 먼저 써주세요!');
        resultHint.textContent = '왼쪽 공간에 숫자를 쓰고 다시 눌러주세요';
      }
      return;
    }

    const crops = extractDigitCropsFromCanvas();
    if (crops.length === 0) {
      if (showWarningIfEmpty) {
        showToast('조금 더 크게 또렷하게 써주세요');
      }
      return;
    }

    const predictions = crops.map(tensor => window.MnistModel.predict(tensor));
    const recognizedText = predictions.map(p => String(p.digit)).join('');
    const avgConfidence = predictions.reduce((acc, p) => acc + p.confidence, 0) / predictions.length;
    const accuracyPct = Math.round(avgConfidence * 1000) / 10; // 소수점 1자리

    lastRecognition = { text: recognizedText, accuracyPct };
    renderResult(recognizedText, accuracyPct, predictions);
  }

  function getAccuracyTier(pct) {
    if (pct >= 85) return 'good';
    if (pct >= 60) return 'mid';
    return 'low';
  }

  function renderResult(text, accuracyPct, predictions) {
    // 큰 숫자 표시 (자릿수에 따라 글자 크기 자동 조절)
    resultInput.value = text;
    resultInput.classList.toggle('multi-digit', text.length >= 3 && text.length <= 6);
    resultInput.classList.toggle('long-digit', text.length > 6);

    // "인식결과" 바로 옆 정확도 배지 및 게이지 업데이트
    const tier = getAccuracyTier(accuracyPct);
    const displayPct = accuracyPct >= 99.95 ? '99.9%' : `${accuracyPct.toFixed(1)}%`;

    accuracyBadge.className = `accuracy-badge ${tier}`;
    accuracyValue.textContent = displayPct;

    accuracyBarFill.style.width = `${Math.min(100, Math.max(2, accuracyPct))}%`;
    accuracyBarFill.style.backgroundColor =
      tier === 'good' ? 'var(--good-bar)' : tier === 'mid' ? 'var(--mid-bar)' : 'var(--low-bar)';

    // 친절한 안내 문구
    if (tier === 'good') {
      resultHint.textContent = '잘못 읽힌 숫자가 있다면 위 숫자를 눌러 직접 고칠 수 있어요';
    } else if (tier === 'mid') {
      resultHint.textContent = '조금 헷갈리는 모양이에요. 필요하면 숫자를 눌러 고치거나 다시 써보세요';
    } else {
      resultHint.textContent = '정확도가 낮아요. 숫자를 조금 더 크고 또렷하게 써보시면 좋아요';
    }

    // 세부 정보 표시 (한 자리면 상위 3개 후보 비교, 여러 자리면 각 자리별 정확도)
    detailPanel.hidden = false;
    if (predictions.length === 1) {
      detailTitle.textContent = '가장 비슷한 숫자 후보';
      const probs = predictions[0].probs
        .map((p, digit) => ({ digit, pct: p * 100 }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 3);

      detailContent.innerHTML = `<div class="candidate-list">${probs
        .map(
          (item, idx) => `
          <div class="candidate-row ${idx === 0 ? 'top' : ''}">
            <span class="candidate-digit">${item.digit}</span>
            <div class="candidate-bar-bg">
              <div class="candidate-bar-fill" style="width:${Math.max(2, item.pct).toFixed(1)}%"></div>
            </div>
            <span class="candidate-pct">${item.pct.toFixed(1)}%</span>
          </div>`
        )
        .join('')}</div>`;
    } else {
      detailTitle.textContent = `자리별 정확도 (총 ${predictions.length}자리)`;
      detailContent.innerHTML = `<div class="digit-chips">${predictions
        .map(
          p => `
          <div class="digit-chip">
            <strong>${p.digit}</strong>
            <span>${(p.confidence * 100).toFixed(0)}%</span>
          </div>`
        )
        .join('')}</div>`;
    }

    copyBtn.disabled = false;
    saveHistoryBtn.disabled = false;
  }

  function resetResultUI() {
    resultInput.value = '';
    resultInput.classList.remove('multi-digit', 'long-digit');
    accuracyBadge.className = 'accuracy-badge idle';
    accuracyValue.textContent = '--%';
    accuracyBarFill.style.width = '0%';
    resultHint.textContent = '왼쪽에 숫자를 쓰면 여기에 크게 표시돼요';
    detailPanel.hidden = true;
    detailContent.innerHTML = '';
    copyBtn.disabled = true;
    saveHistoryBtn.disabled = true;
    lastRecognition = null;
  }

  // =============================
  // 사진 올리기 (종이에 쓴 숫자 자동 추출)
  // =============================

  function handlePhotoUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const img = new Image();
      img.onload = function () {
        pushUndoState();
        extractInkFromPhotoToCanvas(img);
        updateInkPresence();
        if (hasInk) {
          runRecognition(true);
          showToast('사진에서 숫자를 읽어왔어요!');
        } else {
          showToast('사진에서 진한 숫자를 찾지 못했어요. 밝은 배경의 사진을 올려보세요.');
        }
      };
      img.onerror = function () {
        showToast('사진을 열지 못했어요. 다른 이미지 파일로 시도해 주세요.');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // 오츠(Otsu) 임계값으로 종이 배경을 제거하고 어두운 글씨만 잉크로 추출
  function extractInkFromPhotoToCanvas(img) {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // 사진 비율을 유지하며 캔버스 안에 여유 있게 배치
    const pad = Math.min(W, H) * 0.08;
    const availW = W - pad * 2;
    const availH = H - pad * 2;
    const scale = Math.min(availW / img.width, availH / img.height);
    const dw = Math.max(1, Math.round(img.width * scale));
    const dh = Math.max(1, Math.round(img.height * scale));
    const dx = Math.round((W - dw) / 2);
    const dy = Math.round((H - dh) / 2);

    const off = document.createElement('canvas');
    off.width = dw;
    off.height = dh;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, 0, 0, dw, dh);

    const imgData = octx.getImageData(0, 0, dw, dh);
    const data = imgData.data;
    const total = dw * dh;
    const gray = new Uint8Array(total);
    const hist = new Int32Array(256);

    for (let i = 0; i < total; i++) {
      const p = i * 4;
      const g = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
      gray[i] = g;
      hist[g]++;
    }

    // Otsu 임계값 계산
    let sumAll = 0;
    for (let t = 0; t < 256; t++) sumAll += t * hist[t];
    let sumB = 0, wB = 0, maxVar = -1, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) {
        maxVar = between;
        threshold = t;
      }
    }

    // 배경이 어두운 이미지인지 밝은 종이인지 자동 판단
    let darkCount = 0;
    for (let i = 0; i < total; i++) {
      if (gray[i] < threshold) darkCount++;
    }
    const darkBackground = darkCount > total * 0.55;

    // 현재 테마 잉크 색상의 RGB 파싱
    const inkColor = getInkColor();
    const inkR = inkColor === '#f8fafc' ? 248 : 17;
    const inkG = inkColor === '#f8fafc' ? 250 : 24;
    const inkB = inkColor === '#f8fafc' ? 252 : 39;

    const cutoff = darkBackground ? threshold + 15 : Math.max(30, threshold - 15);
    for (let i = 0; i < total; i++) {
      const p = i * 4;
      const isInk = darkBackground ? gray[i] > cutoff : gray[i] < cutoff;
      if (isInk) {
        const strength = darkBackground
          ? Math.min(255, Math.round(((gray[i] - cutoff) / Math.max(1, 255 - cutoff)) * 255 * 2.2))
          : Math.min(255, Math.round(((cutoff - gray[i]) / Math.max(1, cutoff)) * 255 * 2.2));
        data[p] = inkR;
        data[p + 1] = inkG;
        data[p + 2] = inkB;
        data[p + 3] = Math.max(160, strength);
      } else {
        data[p + 3] = 0;
      }
    }

    octx.putImageData(imgData, 0, 0);
    ctx.drawImage(off, dx, dy);
  }

  // =============================
  // 최근 기록 관리 & 복사
  // =============================

  function addToHistory(text, accuracyPct) {
    if (!text) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    historyItems.unshift({ text, accuracyPct, timeStr });
    if (historyItems.length > 20) historyItems.pop();
    renderHistory();
  }

  function renderHistory() {
    clearHistoryBtn.hidden = historyItems.length === 0;
    if (historyItems.length === 0) {
      historyList.innerHTML =
        '<p class="history-empty">아직 인식한 숫자가 없어요. 숫자를 쓰면 기록이 여기에 쌓여요.</p>';
      return;
    }

    historyList.innerHTML = historyItems
      .map((item, idx) => {
        const tier = getAccuracyTier(item.accuracyPct);
        const pctLabel = item.accuracyPct != null ? `${item.accuracyPct.toFixed(0)}%` : '직접수정';
        return `
          <button type="button" class="history-item" data-index="${idx}" title="클릭하면 숫자가 복사돼요">
            <span class="history-num">${escapeHtml(item.text)}</span>
            <span class="history-acc ${tier}">${pctLabel}</span>
            <span class="history-time">${item.timeStr}</span>
          </button>`;
      })
      .join('');
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  async function copyText(text) {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const tmp = document.createElement('textarea');
        tmp.value = text;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
      }
      showToast(`"${text}" 복사되었어요!`);
    } catch {
      showToast('복사에 실패했어요. 숫자를 직접 선택해 복사해 주세요.');
    }
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2200);
  }

  // =============================
  // 이벤트 연결
  // =============================

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  thicknessBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      thicknessBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      penSize = Number(btn.dataset.size);
      // 펜 굵기 선택 시 지우개 모드 해제
      isEraser = false;
      eraserBtn.classList.remove('active');
      eraserBtn.setAttribute('aria-pressed', 'false');
      canvas.classList.remove('eraser-cursor');
    });
  });

  eraserBtn.addEventListener('click', () => {
    isEraser = !isEraser;
    eraserBtn.classList.toggle('active', isEraser);
    eraserBtn.setAttribute('aria-pressed', String(isEraser));
    canvas.classList.toggle('eraser-cursor', isEraser);
  });

  undoBtn.addEventListener('click', () => {
    if (undoStack.length === 0) return;
    clearTimeout(autoTimer);
    const prev = undoStack.pop();
    ctx.putImageData(prev, 0, 0);
    undoBtn.disabled = undoStack.length === 0;
    updateInkPresence();
    if (!hasInk) {
      resetResultUI();
    } else if (autoRecognizeToggle.checked) {
      runRecognition(false);
    }
  });

  clearBtn.addEventListener('click', () => {
    clearTimeout(autoTimer);
    if (hasInk) pushUndoState();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
    canvasPlaceholder.classList.remove('hidden');
    resetResultUI();
  });

  recognizeBtn.addEventListener('click', () => {
    runRecognition(true);
    if (lastRecognition) {
      addToHistory(lastRecognition.text, lastRecognition.accuracyPct);
    }
  });

  resultInput.addEventListener('input', () => {
    // 숫자만 남기도록 부드럽게 정리
    const cleaned = resultInput.value.replace(/[^0-9]/g, '');
    if (cleaned !== resultInput.value) resultInput.value = cleaned;
    copyBtn.disabled = cleaned.length === 0;
    saveHistoryBtn.disabled = cleaned.length === 0;
  });

  copyBtn.addEventListener('click', () => {
    const val = resultInput.value.trim();
    if (val) copyText(val);
  });

  saveHistoryBtn.addEventListener('click', () => {
    const val = resultInput.value.trim();
    if (!val) return;
    const acc = lastRecognition && lastRecognition.text === val ? lastRecognition.accuracyPct : null;
    addToHistory(val, acc);
    showToast(`"${val}" 기록에 저장했어요!`);
  });

  historyList.addEventListener('click', e => {
    const itemBtn = e.target.closest('.history-item');
    if (!itemBtn) return;
    const idx = Number(itemBtn.dataset.index);
    if (historyItems[idx]) copyText(historyItems[idx].text);
  });

  clearHistoryBtn.addEventListener('click', () => {
    historyItems = [];
    renderHistory();
    showToast('기록을 모두 비웠어요.');
  });

  photoInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (file) handlePhotoUpload(file);
    photoInput.value = '';
  });

  // 다크 모드
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      iconMoon.hidden = false;
      iconSun.hidden = true;
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      iconMoon.hidden = true;
      iconSun.hidden = false;
    }
    recolorInkOnCanvas();
  });

  // 초기화
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  resetResultUI();
})();
