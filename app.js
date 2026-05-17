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
let currentMode = "pdf";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    currentMode = button.dataset.mode;
    document.querySelectorAll(".mode-button").forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("is-hidden", panel.dataset.panel !== currentMode);
    });
    setStatus("");
  });
});

marginInput.addEventListener("input", () => {
  marginValue.value = `${marginInput.value} pt`;
});

pdfFileInput.addEventListener("change", () => updateFileName(pdfFileInput, "#pdf-name", "Seleziona PDF"));
frontFileInput.addEventListener("change", () =>
  updateFileName(frontFileInput, "#front-name", "Seleziona foto fronte"),
);
backFileInput.addEventListener("change", () =>
  updateFileName(backFileInput, "#back-name", "Seleziona foto retro"),
);

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
  const front = frontFileInput.files[0];
  const back = backFileInput.files[0];
  if (!front || !back) {
    throw new Error("Seleziona fronte e retro.");
  }

  const frontImage = await embedImage(outputPdf, front);
  const backImage = await embedImage(outputPdf, back);
  drawEmbeddedImage(page, frontImage, 0, halfHeight, pageWidth, halfHeight, margin);
  drawEmbeddedImage(page, backImage, 0, 0, pageWidth, halfHeight, margin);
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
