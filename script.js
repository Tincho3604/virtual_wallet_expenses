const STORAGE_KEY = "finanzas-app-v4";

const formatARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

const categoryKeywords = {
  Sueldo: ["sueldo", "haberes", "nomina", "salary"],
  Comida: ["super", "supermercado", "dia", "carrefour", "vea", "coto", "burger", "cafe", "restaurant", "pedidosya", "almacen"],
  Hogar: ["alquiler", "expensa", "hogar", "mueble"],
  Transporte: ["uber", "cabify", "sube", "ypf", "shell", "axion", "peaje", "autopista", "estacionamiento"],
  Servicios: ["luz", "gas", "agua", "internet", "fibertel", "personal", "movistar", "telecom", "edenor", "metrogas", "seguro"],
  Salud: ["farm", "hospital", "medic", "osde", "swiss medical"],
  Streaming: ["youtube", "spotify", "netflix", "primevideo", "disney", "max"],
  Compras: ["mercadolibre", "mercado libre", "compra", "shop"],
  Transferencias: ["transfer", "extraccion", "deposito", "mercadopago", "merpago"],
  "Tarjeta / Pago": ["su pago", "bonif", "devol", "reintegro", "credito", "cashback"],
};

const state = {
  records: [],
  chart: null,
};

const elements = {
  financeForm: document.getElementById("financeForm"),
  type: document.getElementById("type"),
  amount: document.getElementById("amount"),
  category: document.getElementById("category"),
  date: document.getElementById("date"),
  description: document.getElementById("description"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importFile: document.getElementById("importFile"),
  excelInput: document.getElementById("excelInput"),
  exportReportBtn: document.getElementById("exportReportBtn"),
  recordsTableBody: document.getElementById("recordsTableBody"),
  emptyState: document.getElementById("emptyState"),
  recordsInfo: document.getElementById("recordsInfo"),
  incomeTotal: document.getElementById("incomeTotal"),
  expenseTotal: document.getElementById("expenseTotal"),
  balanceTotal: document.getElementById("balanceTotal"),
  financeChart: document.getElementById("financeChart"),
};

init();

function init() {
  loadState();
  setDefaultValues();
  bindEvents();
  render();
}

function bindEvents() {
  elements.financeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addManualRecord();
  });

  elements.clearAllBtn.addEventListener("click", clearAll);
  elements.exportBtn.addEventListener("click", exportTxt);
  elements.importFile.addEventListener("change", importTxt);
  elements.excelInput.addEventListener("change", importExcel);
  elements.exportReportBtn.addEventListener("click", exportReportPdf);
}

function setDefaultValues() {
  if (!elements.date.value) elements.date.value = toInputDate(new Date());
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.records = Array.isArray(parsed.records) ? parsed.records.map(normalizeImportedRecord) : [];
  } catch (error) {
    console.error("No se pudo cargar el estado", error);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ records: state.records }));
}

function addManualRecord() {
  const amount = toNumber(elements.amount.value);
  const description = elements.description.value.trim();

  if (!elements.date.value || !description || amount <= 0) {
    alert("Completa fecha, descripción y monto.");
    return;
  }

  state.records.unshift({
    id: crypto.randomUUID(),
    date: elements.date.value,
    type: elements.type.value,
    category: elements.category.value,
    description,
    amount,
    source: "Manual",
  });

  persistState();
  resetForm();
  render();
}

function clearAll() {
  if (!window.confirm("Esto va a limpiar todos los movimientos y también el formulario. ¿Continuar?")) return;
  state.records = [];
  persistState();
  resetForm();
  render();
}

function resetForm() {
  elements.financeForm.reset();
  elements.type.value = "egreso";
  elements.category.value = "Otros";
  setDefaultValues();
}

function exportTxt() {
  const payload = {
    version: 4,
    exportedAt: new Date().toISOString(),
    records: state.records,
  };

  downloadFile(
    new Blob([JSON.stringify(payload, null, 2)], { type: "text/plain;charset=utf-8" }),
    `finanzas_${new Date().toISOString().slice(0, 10)}.txt`
  );
}

function importTxt(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state.records = Array.isArray(parsed.records) ? parsed.records.map(normalizeImportedRecord) : [];
      persistState();
      render();
      alert("TXT importado correctamente.");
    } catch (error) {
      console.error(error);
      alert("El archivo TXT no tiene un formato válido.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
}

function importExcel(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    try {
      const data = new Uint8Array(loadEvent.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const imported = normalizeExcelRows(rows);
      if (!imported.length) {
        alert("No se encontraron movimientos válidos en ARS dentro del Excel.");
        return;
      }

      state.records = [...imported, ...state.records];
      persistState();
      render();
      alert(`Excel importado: ${imported.length} movimientos en ARS procesados.`);
    } catch (error) {
      console.error(error);
      alert("No se pudo procesar el Excel.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsArrayBuffer(file);
}

function normalizeExcelRows(rows) {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => String(cell).toLowerCase().includes("fecha")) &&
    row.some((cell) => String(cell).toLowerCase().includes("mov")) &&
    row.some((cell) => String(cell).toLowerCase().includes("monto"))
  );

  if (headerIndex === -1) return [];

  const headers = rows[headerIndex].map((value) => String(value).trim().toLowerCase());
  const body = rows.slice(headerIndex + 1);

  const dateIndex = headers.findIndex((h) => h.includes("fecha"));
  const movementIndex = headers.findIndex((h) => h.includes("mov"));
  const amountIndex = headers.findIndex((h) => h.includes("monto"));

  return body
    .filter((row) => row[dateIndex] && row[movementIndex] && row[amountIndex] !== "")
    .map((row) => {
      const description = String(row[movementIndex]).trim();
      const amountInfo = parseSignedAmount(row[amountIndex]);
      const normalizedDate = normalizeExcelDate(row[dateIndex]);
      if (!normalizedDate || amountInfo.currency !== "ARS" || amountInfo.absoluteValue <= 0) return null;

      const type = inferType(description, amountInfo);
      return {
        id: crypto.randomUUID(),
        date: normalizedDate,
        type,
        category: inferCategory(description, type),
        description,
        amount: amountInfo.absoluteValue,
        source: "Excel",
      };
    })
    .filter(Boolean);
}

function parseSignedAmount(rawValue) {
  let text = String(rawValue).trim();
  const currency = /usd|u\$s/i.test(text) ? "USD" : "ARS";
  const isNegative = /-/.test(text);
  text = text.replace(/\s+/g, "").replace(/[A-Za-z$UuSs]/g, "");
  text = text.replace(/[^\d,.-]/g, "");

  if (text.includes(".") && text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",") && !text.includes(".")) {
    text = text.replace(",", ".");
  }

  const numericValue = Number(text) || 0;
  const signedValue = isNegative ? -Math.abs(numericValue) : Math.abs(numericValue);
  return { currency, signedValue, absoluteValue: Math.abs(signedValue) };
}

function inferType(description, amountInfo) {
  const text = description.toLowerCase();
  const incomeHints = ["su pago", "bonif", "devol", "reintegro", "cashback", "credito", "pago en pesos", "acreditacion", "deposito", "transferencia recibida", "sueldo", "haberes"];
  if (amountInfo.signedValue < 0) return "ingreso";
  if (incomeHints.some((hint) => text.includes(hint))) return "ingreso";
  return "egreso";
}

function inferCategory(description, type) {
  const text = description.toLowerCase();
  if (type === "ingreso" && ["pago", "bonif", "devol", "reintegro"].some((hint) => text.includes(hint))) {
    return "Tarjeta / Pago";
  }
  for (const [category, words] of Object.entries(categoryKeywords)) {
    if (words.some((word) => text.includes(word))) return category;
  }
  return type === "ingreso" ? "Tarjeta / Pago" : "Otros";
}

function normalizeImportedRecord(record) {
  return {
    id: record.id || crypto.randomUUID(),
    date: record.date || toInputDate(new Date()),
    type: record.type === "ingreso" ? "ingreso" : "egreso",
    category: record.category || "Otros",
    description: String(record.description || "Sin descripción"),
    amount: Math.abs(toNumber(record.amount)),
    source: record.source || "Importado",
  };
}

function getMetrics(records = state.records) {
  return records.reduce((acc, record) => {
    acc[record.type] += record.amount;
    return acc;
  }, { ingreso: 0, egreso: 0 });
}

function render() {
  const records = [...state.records].sort((a, b) => new Date(b.date) - new Date(a.date));
  const metrics = getMetrics(records);
  const balance = metrics.ingreso - metrics.egreso;

  elements.incomeTotal.textContent = formatARS.format(metrics.ingreso);
  elements.expenseTotal.textContent = formatARS.format(metrics.egreso);
  elements.balanceTotal.textContent = formatARS.format(balance);
  renderTable(records);
  updateChart(metrics);
}

function renderTable(records) {
  elements.recordsInfo.textContent = `${records.length} movimiento${records.length === 1 ? "" : "s"}`;
  elements.emptyState.style.display = records.length ? "none" : "block";

  elements.recordsTableBody.innerHTML = records.map((record) => `
    <tr>
      <td>${formatDate(record.date)}</td>
      <td><span class="type-pill ${record.type}">${record.type}</span></td>
      <td>${escapeHtml(record.category)}</td>
      <td>${escapeHtml(record.description)}</td>
      <td class="amount-${record.type}">${record.type === "ingreso" ? "+" : "-"} ${formatARS.format(record.amount)}</td>
      <td>${escapeHtml(record.source)}</td>
      <td><button class="inline-delete" onclick="removeRecord('${record.id}')">Eliminar</button></td>
    </tr>
  `).join("");
}

function updateChart(metrics) {
  if (state.chart) state.chart.destroy();

  state.chart = new Chart(elements.financeChart, {
    type: "pie",
    data: {
      labels: ["Ingresos", "Egresos"],
      datasets: [{ data: [metrics.ingreso, metrics.egreso], borderWidth: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#e5e7eb" } },
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${formatARS.format(context.raw)}`,
          },
        },
      },
    },
  });
}

async function exportReportPdf() {
  const records = [...state.records].sort((a, b) => new Date(b.date) - new Date(a.date));
  const metrics = getMetrics(records);
  const balance = metrics.ingreso - metrics.egreso;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, 210, 26, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.text("Informe de ingresos y egresos", 14, 16);

  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(10);
  pdf.text(`Generado: ${new Date().toLocaleString("es-AR")}`, 14, 33);

  const cards = [
    { title: "Ingresos actuales", value: formatARS.format(metrics.ingreso) },
    { title: "Egresos actuales", value: formatARS.format(metrics.egreso) },
    { title: "Saldo actual", value: formatARS.format(balance) },
  ];

  let x = 14;
  cards.forEach((card) => {
    pdf.setFillColor(30, 41, 59);
    pdf.roundedRect(x, 40, 58, 26, 4, 4, "F");
    pdf.setTextColor(203, 213, 225);
    pdf.setFontSize(9);
    pdf.text(card.title, x + 4, 48);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(15);
    pdf.text(card.value, x + 4, 59);
    x += 62;
  });

  const chartImage = state.chart?.toBase64Image?.();
  if (chartImage) {
    pdf.setTextColor(31, 41, 55);
    pdf.setFontSize(12);
    pdf.text("Resumen visual", 14, 78);
    pdf.addImage(chartImage, "PNG", 38, 84, 130, 78);
  }

  const rows = records.map((record) => [
    formatDate(record.date),
    record.type,
    record.category,
    truncate(record.description, 42),
    `${record.type === "ingreso" ? "+" : "-"} ${formatARS.format(record.amount)}`,
    record.source,
  ]);

  pdf.autoTable({
    startY: 168,
    theme: "grid",
    head: [["Fecha", "Tipo", "Categoría", "Descripción", "Monto", "Origen"]],
    body: rows.length ? rows : [["-", "-", "-", "Sin movimientos", "-", "-"]],
    styles: { fontSize: 8.5, cellPadding: 2.6 },
    headStyles: { fillColor: [15, 23, 42] },
  });

  pdf.save(`informe_financiero_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function removeRecord(id) {
  state.records = state.records.filter((record) => record.id !== id);
  persistState();
  render();
}

window.removeRecord = removeRecord;

function normalizeExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toInputDate(value);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return "";
  const [, dd, mm, yy] = match;
  const yyyy = yy.length === 2 ? `20${yy}` : yy;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function formatDate(date) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function toInputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toNumber(value) {
  return Number(value) || 0;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncate(text, maxLength) {
  return String(text).length > maxLength ? `${String(text).slice(0, maxLength - 1)}…` : String(text);
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
