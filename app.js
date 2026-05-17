const { PDFDocument } = window.PDFLib || {};

const pageSizes = {
  a4: [595.2756, 841.8898],
  letter: [612, 792],
};

const form = document.querySelector("#converter-form");
const statusEl = document.querySelector("#status");
const marginInput = document.querySelector("#margin");
const marginValue = document.querySelector("#margin-value");
const convertButton = document.querySelector("#convert-button");
const pdfFileInput = document.querySelector("#pdf-file");
const frontFileInput = document.querySelector("#front-file");
const backFileInput = document.querySelector("#back-file");
const pageSizeInput = document.querySelector("#page-size");
const pdfPrompt = document.querySelector("[data-open-pdf]");
const cameraPrompt = document.querySelector("[data-open-camera]");
const cameraSheet = document.querySelector("[data-camera-sheet]");
const cameraVideo = document.querySelector("[data-camera-video]");
const cameraSample = document.querySelector("[data-camera-sample]");
const cameraOverlay = document.querySelector("[data-camera-overlay]");
const cameraCaptureButton = document.querySelector("[data-camera-capture]");
const cameraCloseButton = document.querySelector("[data-camera-close]");
let currentMode = "images";
let cvReadyPromise;
let activeCameraSide = null;
let cameraStream = null;
let cameraLoopId = null;
let cameraDetecting = false;
let cameraCorners = null;
const previewStates = {
  front: createPreviewState("front"),
  back: createPreviewState("back"),
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

pdfPrompt.addEventListener("click", () => setMode("pdf"));
cameraPrompt.addEventListener("click", () => setMode("images"));
document.querySelectorAll("[data-camera-open]").forEach((button) => {
  button.addEventListener("click", () => openCamera(button.dataset.cameraOpen));
});
cameraCaptureButton.addEventListener("click", captureCameraFrame);
cameraCloseButton.addEventListener("click", closeCamera);

marginInput.addEventListener("input", () => {
  marginValue.value = `${marginInput.value} pt`;
});

pdfFileInput.addEventListener("change", () => updateFileName(pdfFileInput, "#pdf-name", "Seleziona PDF"));
frontFileInput.addEventListener("change", () =>
  handleImageSelection("front", frontFileInput, "#front-name", "Scatta o seleziona il fronte"),
);
backFileInput.addEventListener("change", () =>
  handleImageSelection("back", backFileInput, "#back-name", "Scatta o seleziona il retro"),
);

async function openCamera(side) {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("La fotocamera live richiede un browser moderno e HTTPS.", true);
    return;
  }

  activeCameraSide = side;
  cameraCorners = null;
  cameraSheet.classList.remove("is-hidden");
  setStatus("Apro la fotocamera...");

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    cameraOverlay.innerHTML = "";
    startCameraDetectionLoop();
    setStatus("Inquadra il documento dentro il quadrilatero.");
  } catch (error) {
    closeCamera();
    setStatus("Non riesco ad aprire la fotocamera. Puoi usare il selettore file.", true);
  }
}

function startCameraDetectionLoop() {
  stopCameraDetectionLoop();

  const tick = () => {
    cameraLoopId = window.setTimeout(async () => {
      if (!cameraStream || cameraDetecting || !cameraVideo.videoWidth) {
        tick();
        return;
      }

      cameraDetecting = true;
      try {
        const sample = drawVideoSample();
        const detected = await detectDocumentCorners(sample).catch(() => null);
        cameraCorners = detected || cameraCorners || defaultCorners(sample.width, sample.height);
        renderCameraOverlay(cameraCorners, sample.width, sample.height);
      } finally {
        cameraDetecting = false;
        if (cameraStream) tick();
      }
    }, 420);
  };

  tick();
}

function stopCameraDetectionLoop() {
  if (cameraLoopId) {
    window.clearTimeout(cameraLoopId);
    cameraLoopId = null;
  }
}

function drawVideoSample() {
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(cameraVideo.videoWidth, cameraVideo.videoHeight));
  cameraSample.width = Math.round(cameraVideo.videoWidth * scale);
  cameraSample.height = Math.round(cameraVideo.videoHeight * scale);
  cameraSample
    .getContext("2d", { willReadFrequently: true })
    .drawImage(cameraVideo, 0, 0, cameraSample.width, cameraSample.height);
  return cameraSample;
}

async function captureCameraFrame() {
  if (!activeCameraSide || !cameraVideo.videoWidth) return;

  const side = activeCameraSide;
  const canvas = document.createElement("canvas");
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  canvas.getContext("2d").drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

  const sampleWidth = Math.max(cameraSample.width, 1);
  const sampleHeight = Math.max(cameraSample.height, 1);
  const scaledCorners = (cameraCorners || defaultCorners(sampleWidth, sampleHeight)).map((point) => ({
    x: point.x * (canvas.width / sampleWidth),
    y: point.y * (canvas.height / sampleHeight),
  }));

  const blob = await canvasToJpegBlob(canvas);
  const file = new File([blob], `${side}.jpg`, { type: "image/jpeg" });
  closeCamera();
  applyCapturedImage(side, file, scaledCorners);
}

function closeCamera() {
  stopCameraDetectionLoop();
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
  cameraOverlay.innerHTML = "";
  cameraSheet.classList.add("is-hidden");
  activeCameraSide = null;
}

function applyCapturedImage(side, file, corners) {
  const labelSelector = side === "front" ? "#front-name" : "#back-name";
  document.querySelector(labelSelector).textContent = side === "front" ? "Fronte acquisito" : "Retro acquisito";
  setStatus("Preparo l'anteprima...");
  preparePreview(side, file, corners)
    .then(() => setStatus("Regola gli angoli se serve, poi crea il PDF."))
    .catch((error) => setStatus(error.message || "Non riesco a preparare l'anteprima.", true));
}

function renderCameraOverlay(points, width, height) {
  cameraOverlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
  cameraOverlay.innerHTML = "";
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
  cameraOverlay.append(polygon);
  points.forEach((point) => {
    const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    handle.setAttribute("cx", point.x);
    handle.setAttribute("cy", point.y);
    handle.setAttribute("r", "14");
    cameraOverlay.append(handle);
  });
}

function createPreviewState(side) {
  const card = document.querySelector(`[data-preview="${side}"]`);
  const canvas = document.querySelector(`#${side}-preview`);
  const overlay = document.querySelector(`[data-overlay="${side}"]`);
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  const handles = Array.from({ length: 4 }, (_, index) => {
    const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    handle.dataset.corner = String(index);
    handle.setAttribute("r", "18");
    handle.setAttribute("tabindex", "0");
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", `Angolo ${index + 1}`);
    overlay.append(handle);
    return handle;
  });

  overlay.prepend(polygon);

  const state = {
    side,
    card,
    canvas,
    overlay,
    polygon,
    handles,
    file: null,
    corners: null,
    dragIndex: null,
  };

  overlay.addEventListener("pointerdown", (event) => {
    const corner = event.target.dataset?.corner;
    if (corner === undefined) return;
    state.dragIndex = Number(corner);
    event.target.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  overlay.addEventListener("pointermove", (event) => {
    if (state.dragIndex === null || !state.corners) return;
    const point = svgPointFromEvent(state.overlay, event);
    state.corners[state.dragIndex] = clampPoint(point, state.canvas.width, state.canvas.height);
    renderPreviewOverlay(state);
  });

  overlay.addEventListener("pointerup", () => {
    state.dragIndex = null;
  });
  overlay.addEventListener("pointercancel", () => {
    state.dragIndex = null;
  });

  return state;
}

async function handleImageSelection(side, input, labelSelector, fallback) {
  updateFileName(input, labelSelector, fallback);
  const file = input.files[0];
  if (!file) {
    resetPreview(side);
    return;
  }

  setStatus("Cerco i bordi del documento...");
  try {
    await preparePreview(side, file);
    setStatus("Regola gli angoli se serve, poi crea il PDF.");
  } catch (error) {
    resetPreview(side);
    setStatus(error.message || "Non riesco a preparare l'anteprima.", true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!PDFDocument) {
    setStatus("Libreria PDF non caricata. Riapri l'app con connessione internet.", true);
    return;
  }

  setBusy(true);
  setStatus("Creo il PDF...");

  try {
    const outputPdf = await PDFDocument.create();
    const [pageWidth, pageHeight] = pageSizes[pageSizeInput.value];
    const page = outputPdf.addPage([pageWidth, pageHeight]);
    const margin = Number(marginInput.value);
    const halfHeight = pageHeight / 2;

    if (currentMode === "pdf") {
      await addPdfPages(outputPdf, page, pageWidth, halfHeight, margin);
    } else {
      await addImagePages(outputPdf, page, pageWidth, halfHeight, margin);
    }

    const bytes = await outputPdf.save();
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), "fronte-retro.pdf");
    setStatus("PDF creato.");
  } catch (error) {
    setStatus(error.message || "Non sono riuscito a creare il PDF.", true);
  } finally {
    setBusy(false);
  }
});

async function addPdfPages(outputPdf, page, pageWidth, halfHeight, margin) {
  const file = pdfFileInput.files[0];
  if (!file) {
    throw new Error("Seleziona un PDF.");
  }

  const inputBytes = await file.arrayBuffer();
  const inputPdf = await PDFDocument.load(inputBytes);
  if (inputPdf.getPageCount() < 2) {
    throw new Error("Il PDF deve contenere almeno due pagine.");
  }

  const embeddedPages = await outputPdf.embedPdf(inputBytes, [0, 1]);
  drawEmbeddedPage(page, embeddedPages[0], 0, halfHeight, pageWidth, halfHeight, margin);
  drawEmbeddedPage(page, embeddedPages[1], 0, 0, pageWidth, halfHeight, margin);
}

async function addImagePages(outputPdf, page, pageWidth, halfHeight, margin) {
  const front = frontFileInput.files[0] || previewStates.front.file;
  const back = backFileInput.files[0] || previewStates.back.file;
  if (!front || !back) {
    throw new Error("Seleziona fronte e retro.");
  }

  const frontImage = await embedProcessedImage(outputPdf, front, "front");
  const backImage = await embedProcessedImage(outputPdf, back, "back");
  drawEmbeddedImage(page, frontImage, 0, halfHeight, pageWidth, halfHeight, margin);
  drawEmbeddedImage(page, backImage, 0, 0, pageWidth, halfHeight, margin);
}

async function embedProcessedImage(pdf, file, side) {
  if (!previewStates[side].file) {
    await preparePreview(side, file).catch(() => null);
  }

  const correctedBlob = await cropPreviewToDocument(side).catch(() => null);
  if (correctedBlob) {
    return embedImage(pdf, new File([correctedBlob], `${file.name}.png`, { type: "image/png" }));
  }
  return embedImage(pdf, file);
}

async function embedImage(pdf, file) {
  const bytes = await file.arrayBuffer();
  if (file.type === "image/png") {
    return pdf.embedPng(bytes);
  }
  if (file.type === "image/jpeg" || file.name.toLowerCase().match(/\.(jpg|jpeg)$/)) {
    return pdf.embedJpg(bytes);
  }
  throw new Error("Usa immagini JPG o PNG.");
}

async function preparePreview(side, file, initialCorners = null) {
  const state = previewStates[side];
  const image = await loadImage(file);
  const canvas = state.canvas;
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));

  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  state.file = file;
  state.corners = scaleCornersToCanvas(initialCorners, canvas.width, canvas.height, image.naturalWidth, image.naturalHeight) ||
    (await detectDocumentCorners(canvas).catch(() => null));
  if (!state.corners) {
    state.corners = defaultCorners(canvas.width, canvas.height);
  }

  state.card.classList.remove("is-hidden");
  renderPreviewOverlay(state);
}

async function cropPreviewToDocument(side) {
  const state = previewStates[side];
  if (!state.canvas.width || !state.corners) {
    return null;
  }

  await waitForOpenCv();
  const src = cv.imread(state.canvas);
  try {
    const outputCanvas = warpPerspective(src, state.corners);
    return await canvasToPngBlob(outputCanvas);
  } finally {
    src.delete();
  }
}

async function detectDocumentCorners(canvas) {
  if (!window.cv) {
    return null;
  }

  await waitForOpenCv();

  let edges;
  let contours;
  let hierarchy;

  try {
    edges = makeColorEdgeMap(canvas);
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();

    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel);
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
    kernel.delete();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    return findDocumentCorners(contours, canvas.width, canvas.height);
  } finally {
    [edges, hierarchy].forEach((mat) => mat?.delete());
    contours?.delete();
  }
}

function defaultCorners(width, height) {
  const insetX = width * 0.08;
  const insetY = height * 0.08;
  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY },
  ];
}

function renderPreviewOverlay(state) {
  state.overlay.setAttribute("viewBox", `0 0 ${state.canvas.width} ${state.canvas.height}`);
  state.polygon.setAttribute("points", state.corners.map((point) => `${point.x},${point.y}`).join(" "));
  state.handles.forEach((handle, index) => {
    const point = state.corners[index];
    handle.setAttribute("cx", point.x);
    handle.setAttribute("cy", point.y);
  });
}

function svgPointFromEvent(svg, event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function clampPoint(point, width, height) {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height),
  };
}

function resetPreview(side) {
  const state = previewStates[side];
  state.file = null;
  state.corners = null;
  state.card.classList.add("is-hidden");
}

function scaleCornersToCanvas(corners, width, height, sourceWidth, sourceHeight) {
  if (!corners) return null;
  return corners.map((point) => ({
    x: point.x * (width / sourceWidth),
    y: point.y * (height / sourceHeight),
  }));
}

function makeColorEdgeMap(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const source = imageData.data;
  const edges = new cv.Mat(height, width, cv.CV_8UC1);
  edges.data.fill(0);

  const colorDistance = (leftIndex, rightIndex) =>
    Math.abs(source[leftIndex] - source[rightIndex]) +
    Math.abs(source[leftIndex + 1] - source[rightIndex + 1]) +
    Math.abs(source[leftIndex + 2] - source[rightIndex + 2]);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const horizontal = colorDistance(index - 4, index + 4);
      const vertical = colorDistance(index - width * 4, index + width * 4);
      const diagonalA = colorDistance(index - width * 4 - 4, index + width * 4 + 4);
      const diagonalB = colorDistance(index - width * 4 + 4, index + width * 4 - 4);
      const score = Math.max(horizontal, vertical, diagonalA, diagonalB);
      edges.ucharPtr(y, x)[0] = score > 72 ? 255 : 0;
    }
  }

  return edges;
}

function findDocumentCorners(contours, width, height) {
  const imageArea = width * height;
  let best = null;

  for (let index = 0; index < contours.size(); index += 1) {
    const contour = contours.get(index);
    const perimeter = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.025 * perimeter, true);

    const area = Math.abs(cv.contourArea(approx));
    if (approx.rows === 4 && area > imageArea * 0.08) {
      const points = matToPoints(approx);
      if (isConvexQuad(points) && (!best || area > best.area)) {
        best = { area, points };
      }
    }

    approx.delete();
    contour.delete();
  }

  return best?.points || null;
}

function warpPerspective(src, points) {
  const ordered = orderCorners(points);
  const [topLeft, topRight, bottomRight, bottomLeft] = ordered;
  const targetWidth = Math.round(
    Math.max(distance(bottomRight, bottomLeft), distance(topRight, topLeft)),
  );
  const targetHeight = Math.round(
    Math.max(distance(topRight, bottomRight), distance(topLeft, bottomLeft)),
  );

  const sourceTri = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap((point) => [point.x, point.y]));
  const targetTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    targetWidth,
    0,
    targetWidth,
    targetHeight,
    0,
    targetHeight,
  ]);
  const transform = cv.getPerspectiveTransform(sourceTri, targetTri);
  const output = new cv.Mat();

  cv.warpPerspective(
    src,
    output,
    transform,
    new cv.Size(targetWidth, targetHeight),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar(),
  );

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  cv.imshow(canvas, output);

  sourceTri.delete();
  targetTri.delete();
  transform.delete();
  output.delete();
  return canvas;
}

function matToPoints(mat) {
  const points = [];
  for (let row = 0; row < mat.rows; row += 1) {
    points.push({
      x: mat.intPtr(row, 0)[0],
      y: mat.intPtr(row, 0)[1],
    });
  }
  return points;
}

function orderCorners(points) {
  const sortedBySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const sortedByDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  return [sortedBySum[0], sortedByDiff[0], sortedBySum[3], sortedByDiff[3]];
}

function isConvexQuad(points) {
  const ordered = orderCorners(points);
  let sign = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const a = ordered[index];
    const b = ordered[(index + 1) % ordered.length];
    const c = ordered[(index + 2) % ordered.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross);
      if (sign !== Math.sign(cross)) return false;
    }
  }
  return true;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Non riesco a leggere una delle immagini."));
    };
    image.src = url;
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.96));
}

function canvasToJpegBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92));
}

function waitForOpenCv() {
  if (window.cv?.Mat) {
    return Promise.resolve();
  }
  if (!cvReadyPromise) {
    cvReadyPromise = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("OpenCV non pronto.")), 5000);
      window.cv = window.cv || {};
      window.cv.onRuntimeInitialized = () => {
        window.clearTimeout(timeout);
        resolve();
      };
    });
  }
  return cvReadyPromise;
}

function drawEmbeddedPage(page, item, left, bottom, width, height, margin) {
  const placement = fitIntoArea(item.width, item.height, left, bottom, width, height, margin);
  page.drawPage(item, placement);
}

function drawEmbeddedImage(page, item, left, bottom, width, height, margin) {
  const placement = fitIntoArea(item.width, item.height, left, bottom, width, height, margin);
  page.drawImage(item, placement);
}

function fitIntoArea(sourceWidth, sourceHeight, left, bottom, width, height, margin) {
  const usableWidth = Math.max(width - margin * 2, 1);
  const usableHeight = Math.max(height - margin * 2, 1);
  const scale = Math.min(usableWidth / sourceWidth, usableHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const x = left + (width - drawWidth) / 2;
  const y = bottom + (height - drawHeight) / 2;

  return {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
  };
}

function updateFileName(input, selector, fallback) {
  document.querySelector(selector).textContent = input.files[0]?.name || fallback;
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.panel !== currentMode);
  });
  pdfPrompt.classList.toggle("is-hidden", currentMode === "pdf");
  setStatus("");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setBusy(isBusy) {
  convertButton.disabled = isBusy;
  convertButton.textContent = isBusy ? "Creo..." : "Crea PDF";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9f2d20" : "";
}
