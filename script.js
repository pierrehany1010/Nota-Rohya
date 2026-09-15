if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');
  });
}

let chart;
let currentWeekKey = null;    // e.g. "week_2026-01-02"
let currentWeekLabel = "";    // e.g. "2 Jan - 8 Jan 2026"
let calendarYear = new Date().getFullYear();

const DAY_LABELS = ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"];
const TASKS = ["باكر", "غروب", "نوم", "قداس", "قراءة الكتاب المقدس", "صوم"];
const MONTH_NAMES = ["January","February","March","April","May","June","July",
                      "August","September","October","November","December"];

function pad(n) { return n.toString().padStart(2, '0'); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// ---- Real week calculation -------------------------------------------------
// Builds every Friday-to-Thursday week that overlaps the given year.
// A week can legitimately start in December and end in January, etc.
function getWeeksForYear(year) {
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);

    // JS: Sunday=0 ... Friday=5 ... Saturday=6
    const diffToFriday = (jan1.getDay() - 5 + 7) % 7;
    let weekStart = addDays(jan1, -diffToFriday);

    const weeks = [];
    while (weekStart <= dec31) {
        weeks.push({ start: new Date(weekStart), end: addDays(weekStart, 6) });
        weekStart = addDays(weekStart, 7);
    }
    return weeks;
}

function weekKey(week) {
    return `week_${toISO(week.start)}`;
}

function formatWeekLabel(week) {
    const opts = { day: 'numeric', month: 'short' };
    const s = week.start.toLocaleDateString('en-GB', opts);
    const e = week.end.toLocaleDateString('en-GB', opts);
    return `${s} - ${e} ${week.end.getFullYear()}`;
}

// A week is filed under whichever month owns the majority of its 7 days
function weekOwnerMonth(week) {
    const counts = {};
    for (let i = 0; i < 7; i++) {
        const d = addDays(week.start, i);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        counts[key] = (counts[key] || 0) + 1;
    }
    let best = null, bestCount = -1;
    for (const key in counts) {
        if (counts[key] > bestCount) { bestCount = counts[key]; best = key; }
    }
    const [y, m] = best.split('-').map(Number);
    return { year: y, month: m };
}

function getCurrentWeek() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let weeks = getWeeksForYear(today.getFullYear());
    let found = weeks.find(w => today >= w.start && today <= w.end);

    if (!found) {
        // safety net for edge cases right around New Year's
        weeks = getWeeksForYear(today.getFullYear() - 1);
        found = weeks.find(w => today >= w.start && today <= w.end);
    }
    return found;
}

// ---- Page setup -------------------------------------------------------------
window.addEventListener("DOMContentLoaded", function () {
    document.querySelector('.refresh').addEventListener('click', clearCheckboxes);

    document.querySelector('.progress').addEventListener('click', function () {
        const container = document.querySelector('.chart-container');
        if (container.style.display === 'block') {
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
            showChart();
        }
    });

    document.querySelector('.calendar').addEventListener('click', function () {
        const container = document.querySelector('.calendar-container');
        if (container.style.display === 'block') {
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
            calendarYear = currentWeekKey
                ? parseInt(currentWeekKey.split('_')[1].split('-')[0], 10)
                : new Date().getFullYear();
            generateWeeks();
        }
    });

    // Load the real current week automatically on page open
    bindTableToWeek(getCurrentWeek());
});

// ---- Table binding ------------------------------------------------------------
function bindTableToWeek(week) {
    currentWeekKey = weekKey(week);
    currentWeekLabel = formatWeekLabel(week);
    document.getElementById("current-week").innerText = currentWeekLabel;

    const tableContainer = document.querySelector('.table-container');
    let table = tableContainer.querySelector('table');
    if (!table) {
        table = buildDefaultTable();
        tableContainer.appendChild(table);
    }

    const savedMatrix = JSON.parse(localStorage.getItem(currentWeekKey)) || [];
    const rows = table.querySelectorAll("tr:not(:first-child)");
    rows.forEach((row, rowIndex) => {
        const checkboxes = row.querySelectorAll("input[type='checkbox']");
        checkboxes.forEach((cb, colIndex) => {
            cb.checked = !!(savedMatrix[rowIndex] && savedMatrix[rowIndex][colIndex] === 1);
            cb.onchange = () => {
                saveWeek(currentWeekKey);
                if (chart) showChart();
            };
        });
    });

    if (document.querySelector('.chart-container').style.display === 'block') {
        showChart();
    }
}

function buildDefaultTable() {
    const table = document.createElement('table');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const emptyTh = document.createElement('th');
    emptyTh.innerText = "Days | Tasks";
    headerRow.appendChild(emptyTh);
    DAY_LABELS.forEach(day => {
        const th = document.createElement('th');
        th.innerText = day;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    TASKS.forEach(task => {
        const tr = document.createElement('tr');
        const tdTask = document.createElement('td');
        tdTask.innerHTML = `<b>${task}</b>`;
        tr.appendChild(tdTask);
        DAY_LABELS.forEach(() => {
            const td = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = "checkbox";
            td.appendChild(checkbox);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
}

// ---- Clear / progress chart ----------------------------------------------------
function clearCheckboxes() {
    if (!currentWeekKey) return;

    const checkboxes = document.querySelectorAll('.table-container input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    localStorage.removeItem(currentWeekKey);

    if (chart) {
        chart.destroy();
        chart = null;
        document.querySelector('.chart-container').style.display = "none";
    }
}

function getMatrixData() {
    const rows = document.querySelectorAll(".table-container table tr:not(:first-child)");
    const matrix = [];
    rows.forEach(row => {
        const checkboxes = row.querySelectorAll("input[type='checkbox']");
        const rowData = [];
        checkboxes.forEach(cb => rowData.push(cb.checked ? 1 : 0));
        matrix.push(rowData);
    });
    return matrix;
}

const separatorPlugin = {
    id: 'separatorPlugin',
    afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const xScale = scales.x;
        if (!xScale) return;

        const totalTicks = xScale.ticks.length;
        ctx.save();
        ctx.strokeStyle = "#795757";
        ctx.lineWidth = 2;

        for (let i = 0; i < totalTicks - 1; i++) {
            const current = xScale.getPixelForTick(i);
            const next = xScale.getPixelForTick(i + 1);
            const xPos = (current + next) / 2;

            ctx.beginPath();
            ctx.moveTo(xPos, chartArea.top);
            ctx.lineTo(xPos, chartArea.bottom);
            ctx.stroke();
        }
        ctx.restore();
    }
};

const chartBorderPlugin = {
    id: 'chartBorderPlugin',
    afterDraw(chart) {
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.strokeStyle = "#795757";
        ctx.lineWidth = 3;
        ctx.strokeRect(
            chartArea.left,
            chartArea.top,
            chartArea.right - chartArea.left,
            chartArea.bottom - chartArea.top
        );
        ctx.restore();
    }
};

function showChart() {
    const matrix = getMatrixData();
    const taskLabels = Array.from(
        document.querySelectorAll(".table-container table tr:not(:first-child) td:first-child")
    ).map(td => td.innerText.trim());

    const dayLabels = DAY_LABELS;
    const ctx = document.getElementById('progressChart').getContext('2d');

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: taskLabels,
            datasets: dayLabels.map((day, dayIndex) => ({
                label: day,
                data: matrix.map(task => task[dayIndex]),
                borderRadius: 8,
                barThickness: window.innerWidth < 768 ? 8 : 18,
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: 20 },
            plugins: {
                title: {
                    display: true,
                    text: ["Weekly Progress", currentWeekLabel || ""],
                    color: "#795757",
                    font: {
                        size: window.innerWidth < 768 ? 16 : 24,
                        weight: 'bold'
                    },
                    padding: { top: 10, bottom: 30 }
                },
                legend: {
                    position: 'top',
                    labels: {
                        font: { size: window.innerWidth < 768 ? 10 : 16 },
                        padding: window.innerWidth < 768 ? 8 : 20
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: window.innerWidth < 768 ? 12 : 18 } }
                },
                y: { beginAtZero: true, max: 1, ticks: { stepSize: 1 } }
            }
        },
        plugins: [separatorPlugin, chartBorderPlugin]
    });
}

function saveWeek(key) {
    const matrix = getMatrixData();
    localStorage.setItem(key, JSON.stringify(matrix));
}

// ---- Calendar -------------------------------------------------------------------
function generateWeeks() {
    const container = document.querySelector('.weeks-container');
    container.innerHTML = "";

    // Year navigation
    const yearNav = document.createElement('div');
    yearNav.style.display = 'flex';
    yearNav.style.justifyContent = 'space-between';
    yearNav.style.alignItems = 'center';
    yearNav.style.marginBottom = '12px';

    const prevBtn = document.createElement('button');
    prevBtn.innerText = '◀';
    styleNavBtn(prevBtn);
    prevBtn.addEventListener('click', () => { calendarYear--; generateWeeks(); });

    const yearLabel = document.createElement('h3');
    yearLabel.innerText = calendarYear;
    yearLabel.style.color = '#795757';
    yearLabel.style.margin = '0';

    const todayBtn = document.createElement('button');
    todayBtn.innerText = 'Today';
    styleNavBtn(todayBtn);
    todayBtn.style.fontSize = '12px';
    todayBtn.addEventListener('click', () => {
        const week = getCurrentWeek();
        bindTableToWeek(week);
        calendarYear = week.start.getFullYear();
        generateWeeks();
    });

    const nextBtn = document.createElement('button');
    nextBtn.innerText = '▶';
    styleNavBtn(nextBtn);
    nextBtn.addEventListener('click', () => { calendarYear++; generateWeeks(); });

    yearNav.appendChild(prevBtn);
    yearNav.appendChild(yearLabel);
    yearNav.appendChild(todayBtn);
    yearNav.appendChild(nextBtn);
    container.appendChild(yearNav);

    // Group real weeks by the month that owns most of their days
    const weeks = getWeeksForYear(calendarYear);
    const monthsMap = {};
    weeks.forEach(week => {
        const owner = weekOwnerMonth(week);
        if (owner.year !== calendarYear) return;
        if (!monthsMap[owner.month]) monthsMap[owner.month] = [];
        monthsMap[owner.month].push(week);
    });

    const monthIndexes = Object.keys(monthsMap).map(Number).sort((a, b) => a - b);

    for (let rowIndex = 0; rowIndex < Math.ceil(monthIndexes.length / 3); rowIndex++) {
        const rowDiv = document.createElement('div');
        rowDiv.style.display = "flex";
        rowDiv.style.justifyContent = "space-between";
        rowDiv.style.gap = "12px";

        for (let colIndex = 0; colIndex < 3; colIndex++) {
            const idx = rowIndex * 3 + colIndex;
            if (idx >= monthIndexes.length) break;
            const monthIndex = monthIndexes[idx];

            const monthDiv = document.createElement('div');
            monthDiv.style.background = "#FFEBC2";
            monthDiv.style.borderRadius = "12px";
            monthDiv.style.padding = "8px";
            monthDiv.style.margin = "8px";
            monthDiv.style.flex = "1";
            monthDiv.style.minWidth = "120px";
            monthDiv.style.display = "flex";
            monthDiv.style.flexDirection = "column";
            monthDiv.style.alignItems = "center";

            const title = document.createElement('h4');
            title.innerText = MONTH_NAMES[monthIndex];
            title.style.textAlign = "center";
            title.style.marginBottom = "6px";
            title.style.color = "#795757";
            monthDiv.appendChild(title);

            const ul = document.createElement('ul');
            ul.style.listStyle = "none";
            ul.style.padding = "0";
            ul.style.margin = "0";
            ul.style.fontSize = "14px";
            ul.style.color = "#795757";
            ul.style.textAlign = "center";
            ul.style.width = "100%";

            monthsMap[monthIndex].forEach(week => {
                const li = document.createElement('li');
                li.innerText = formatWeekLabel(week);
                li.style.marginBottom = "4px";
                li.style.cursor = "pointer";
                li.style.padding = "3px 6px";
                li.style.borderRadius = "6px";

                if (currentWeekKey === weekKey(week)) {
                    li.style.background = "#795757";
                    li.style.color = "#FFF0D1";
                    li.style.fontWeight = "bold";
                }

                li.addEventListener('click', () => {
                    bindTableToWeek(week);
                    document.querySelector('.calendar-container').style.display = 'none';
                });

                ul.appendChild(li);
            });

            monthDiv.appendChild(ul);
            rowDiv.appendChild(monthDiv);
        }

        container.appendChild(rowDiv);
    }
}

function styleNavBtn(btn) {
    btn.style.background = '#795757';
    btn.style.color = '#FFF0D1';
    btn.style.border = 'none';
    btn.style.borderRadius = '8px';
    btn.style.padding = '4px 12px';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = 'bold';
}