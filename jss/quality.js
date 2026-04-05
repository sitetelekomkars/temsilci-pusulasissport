// --- YENİ KALİTE LMS MODÜLÜ (TAM EKRAN ENTEGRASYONU) ---
// ==========================================================
// Modülü Aç
// Redundant Quality functions removed.
function populateFeedbackMonthFilter() {
    const el = document.getElementById('q-feedback-month');
    if (!el) return;
    // if (el.innerHTML !== '') return; // Her ihtimale karşı doldur

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    el.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        let month = (currentMonth - i + 12) % 12;
        let year = currentYear - (currentMonth - i < 0 ? 1 : 0);
        const value = `${String(month + 1).padStart(2, '0')}.${year}`;
        const text = `${MONTH_NAMES[month]} ${year}`;
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        if (i === 0) opt.selected = true;
        el.appendChild(opt);
    }
}
// --- DASHBOARD FONKSİYONLARI ---
function populateMonthFilterFull() {
    const selectIds = ['q-dash-month', 'q-eval-month', 'q-feedback-month']; // Tüm ay filtrelerini doldur
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    selectIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            let month = (currentMonth - i + 12) % 12;
            let year = currentYear - (currentMonth - i < 0 ? 1 : 0);
            const value = `${String(month + 1).padStart(2, '0')}.${year}`;
            const text = `${MONTH_NAMES[month]} ${year}`;
            const opt = document.createElement('option');
            opt.value = value; opt.textContent = text;
            if (i === 0) opt.selected = true;
            el.appendChild(opt);
        }
    });
}
// YENİ: Dashboard Filtrelerini Doldurma
// ✅ Tüm admin filtrelerini (Dashboard + Geçmiş) dolduran merkezi fonksiyon
function populateAllAdminFilters() {
    // HERKES İÇİN (Admin olmasa bile) tarih filtrelerini doldur
    populateMonthFilterFull();

    if (!isAdminMode) return;

    // 1. Dashboard Filtreleri
    populateDashboardFilters();

    // 2. Değerlendirme Geçmişi Filtreleri
    const groupSelect = document.getElementById('q-admin-group');
    if (groupSelect && adminUserList.length > 0) {
        const groups = [...new Set(adminUserList.map(u => u.group).filter(g => g))].sort();
        groupSelect.innerHTML = `<option value="all">Tüm Gruplar</option>` + groups.map(g => `<option value="${g}">${g}</option>`).join('');
        updateAgentListBasedOnGroup();
    }

    // 3. Geri Bildirim Filtreleri
    populateFeedbackFilters();
}

function populateDashboardFilters() {
    const groupSelect = document.getElementById('q-dash-group');
    const agentSelect = document.getElementById('q-dash-agent');
    const channelSelect = document.getElementById('q-dash-channel');
    if (!isAdminMode) {
        if (groupSelect) groupSelect.style.display = 'none';
        if (agentSelect) agentSelect.style.display = 'none';
        return;
    } else {
        if (groupSelect) groupSelect.style.display = 'block';
        if (agentSelect) agentSelect.style.display = 'block';
    }

    if (!groupSelect) return;

    // ✅ İstek: Sadece belirli takımlar gözüksün (Yönetim vs. gizli)
    const allowedWords = ['chat', 'istchat', 'satış', 'satis'];
    const groups = [...new Set(adminUserList.map(u => u.group).filter(g => {
        if (!g) return false;
        const low = g.toLowerCase();
        return allowedWords.some(word => low.includes(word));
    }))].sort();

    groupSelect.innerHTML = '<option value="all">Tüm Gruplar</option>';
    groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g; opt.innerText = g;
        groupSelect.appendChild(opt);
    });
    // İlk yüklemede tüm agentları listele
    updateDashAgentList();
}
// YENİ: Dashboard Agent Listesini Güncelleme
function updateDashAgentList() {
    const groupSelect = document.getElementById('q-dash-group');
    const agentSelect = document.getElementById('q-dash-agent');
    if (!agentSelect) return;
    const selectedGroup = groupSelect.value;
    agentSelect.innerHTML = '<option value="all">Tüm Temsilciler</option>';

    let filteredUsers = adminUserList.filter(u => String(u.role).toLowerCase() === 'user');
    if (selectedGroup !== 'all') {
        filteredUsers = filteredUsers.filter(u => u.group === selectedGroup);
    }
    filteredUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.name;
        opt.innerText = u.name;
        agentSelect.appendChild(opt);
    });

    updateDashRingTitle();
    refreshQualityData();
}

// ✅ Dashboard ring başlığı + admin temsilci ortalamaları
function updateDashRingTitle() {
    const titleEl = document.getElementById('q-dash-ring-title') || document.getElementById('q-dash-ring-title'.replace('title', 'title'));
    // (id kesin: q-dash-ring-title)
    const tEl = document.getElementById('q-dash-ring-title');
    if (!tEl) return;

    if (!isAdminMode) {
        tEl.textContent = 'Puan Durumu';
        return;
    }

    const gSel = document.getElementById('q-dash-group');
    const aSel = document.getElementById('q-dash-agent');
    const g = gSel ? gSel.value : 'all';
    const a = aSel ? aSel.value : 'all';

    if (a && a !== 'all') {
        tEl.textContent = `${a} Puan Durumu`;
    } else if (g && g !== 'all') {
        tEl.textContent = `${g} Takım Ortalaması`;
    } else {
        tEl.textContent = 'Genel Puan Ortalaması';
    }
}

// Admin için: temsilci ortalamaları listesini bas
function renderDashAgentScores(evals) {
    const box = document.getElementById('q-dash-agent-scores');
    if (!box) return;

    // Sadece admin + agent=all iken göster (yoksa gereksiz kalabalık)
    if (!isAdminMode) { box.style.display = 'none'; return; }

    const gSel = document.getElementById('q-dash-group');
    const aSel = document.getElementById('q-dash-agent');
    const g = gSel ? gSel.value : 'all';
    const a = aSel ? aSel.value : 'all';

    if (a && a !== 'all') { box.style.display = 'none'; return; }

    // evals -> agent bazlı ortalama
    const byAgent = {};
    (evals || []).forEach(e => {
        const agent = e.agent || 'N/A';
        const group = e.group || '';
        const score = parseFloat(e.score) || 0;
        if (!byAgent[agent]) byAgent[agent] = { total: 0, count: 0, group: group };
        byAgent[agent].total += score;
        byAgent[agent].count += 1;
        // group boşsa son görüleni yaz
        if (!byAgent[agent].group && group) byAgent[agent].group = group;
    });

    const rows = Object.keys(byAgent).map(name => {
        const o = byAgent[name];
        return { name, group: o.group || (g !== 'all' ? g : ''), avg: o.count ? (o.total / o.count) : 0, count: o.count };
    });

    // Eğer group seçiliyse sadece o grubun kullanıcıları zaten geliyor; ama garanti olsun
    const filteredRows = (g && g !== 'all') ? rows.filter(r => (r.group || '') === g) : rows;

    // Sırala: en düşük ortalama üstte (iyileştirme alanı)
    filteredRows.sort((x, y) => x.avg - y.avg);

    if (filteredRows.length === 0) { box.style.display = 'none'; return; }

    // Tüm kişileri göster (CSS ile gerekirse kaydırılabilir)
    const top = filteredRows;

    box.innerHTML = top.map(r => `
        <div class="das-item">
            <div class="das-left">
                <span class="das-name">${escapeHtml(r.name)}</span>
                ${r.group ? `<span class="das-group">${escapeHtml(r.group)}</span>` : ``}
            </div>
            <div class="das-score">${(r.avg || 0).toFixed(1)}</div>
        </div>
    `).join('');

    box.style.display = 'grid';
}

// Detay alanını toleranslı parse et
function deriveChannelFromGroup(group) {
    const g = String(group || '').toLowerCase();
    if (!g) return 'other';
    if (g.includes('telesat') || g.includes('telesatış') || g === 'telesales') return 'sales';
    if (g.includes('chat')) return 'chat';
    return 'other';
}

function safeParseDetails(details) {
    if (!details) return null;
    if (Array.isArray(details)) return details;
    if (typeof details === 'object') return details;
    if (typeof details === 'string') {
        const s = details.trim();
        if (!s) return null;
        // Bazı eski kayıtlar çift tırnak kaçışlı gelebilir
        const tryList = [s, s.replace(/\"/g, '"'), s.replace(/'/g, '"')];
        for (const cand of tryList) {
            try {
                const parsed = JSON.parse(cand);
                if (Array.isArray(parsed)) return parsed;
            } catch (e) { }
        }
    }
    return null;
}

// ✅ YENİ: Feedback (Geri Bildirimler) Filtrelerini Doldurma
function populateFeedbackFilters() {
    const groupSelect = document.getElementById('q-feedback-group');
    const agentSelect = document.getElementById('q-feedback-agent');
    if (!groupSelect || !agentSelect) return;

    if (!isAdminMode) {
        groupSelect.style.display = 'none';
        agentSelect.style.display = 'none';
        return;
    } else {
        groupSelect.style.display = 'block';
        agentSelect.style.display = 'block';
    }

    const groups = [...new Set(adminUserList.map(u => u.group).filter(g => g))].sort();
    groupSelect.innerHTML = '<option value="all">Tüm Gruplar</option>';
    groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        groupSelect.appendChild(opt);
    });

    // İlk yüklemede tüm agentları listele
    updateFeedbackAgentList(false);
}

function updateFeedbackAgentList(shouldRefresh = true) {
    const groupSelect = document.getElementById('q-feedback-group');
    const agentSelect = document.getElementById('q-feedback-agent');
    if (!groupSelect || !agentSelect) return;

    const selectedGroup = groupSelect.value;

    // seçilen gruba göre kullanıcıları filtrele
    const filteredUsers = adminUserList.filter(u => {
        if (!u || !u.username) return false;
        // Strict Filter: Only 'user' role
        if (String(u.role).toLowerCase() !== 'user') return false;

        if (selectedGroup === 'all') return true;
        return u.group === selectedGroup;
    });

    const agents = filteredUsers
        .map(u => u.name) // BUG FIX: Feedback tabinda da name (Full Name) kullanmaliyiz, Evaluations tablosu ile eslesmesi icin.
        .filter(a => a)
        .sort((a, b) => a.localeCompare(b, 'tr'));

    agentSelect.innerHTML = '<option value="all">Tüm Temsilciler</option>';
    agents.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        agentSelect.appendChild(opt);
    });

    if (shouldRefresh) refreshFeedbackData();
}

async function fetchEvaluationsForFeedback() {
    const groupSelect = document.getElementById('q-feedback-group');
    const agentSelect = document.getElementById('q-feedback-agent');

    let targetAgent = currentUser;
    let targetGroup = 'all';

    if (isAdminMode) {
        targetAgent = agentSelect ? agentSelect.value : 'all';
        targetGroup = groupSelect ? groupSelect.value : 'all';
    }

    try {
        const d = await apiCall("fetchEvaluations", { targetAgent, targetGroup });
        if (d.result === "success") {
            allEvaluationsData = d.evaluations || []; // Ya reverse() ya da order DESC
        } else {
            allEvaluationsData = [];
        }
    } catch (e) {
        allEvaluationsData = [];
    }
}

async function refreshFeedbackData() {
    // Feedback ekranı için (admin filtrelerine göre) değerlendirmeleri + logları çek, sonra listeyi bas
    await fetchEvaluationsForFeedback();
    await fetchFeedbackLogs();
    loadFeedbackList();
}


function refreshQualityData() {
    loadQualityDashboard();
}
async function fetchEvaluationsForDashboard() {
    // Dashboard filtrelerine göre değerlendirmeleri çek (admin ise seçilen grup/temsilciye göre)
    const groupSelect = document.getElementById('q-dash-group');
    const agentSelect = document.getElementById('q-dash-agent');

    let targetAgent = currentUser;
    let targetGroup = 'all';

    if (isAdminMode) {
        targetAgent = agentSelect ? agentSelect.value : 'all';
        targetGroup = groupSelect ? groupSelect.value : 'all';
    }

    try {
        console.log("[Pusula] Fetching evaluations from Supabase...");
        const d = await apiCall("fetchEvaluations", { targetAgent, targetGroup });

        if (d.result === 'success') {
            allEvaluationsData = d.evaluations || [];
            console.log(`[Pusula] ${allEvaluationsData.length} evaluations loaded.`);
        } else {
            throw new Error(d.message);
        }
    } catch (err) {
        console.error("[Pusula] Evaluations Fetch Error:", err);
        allEvaluationsData = [];
    }
}

// safeParseDetails removed (using the one at 3259)
function loadQualityDashboard() {
    // Verileri çek (silent mode), veri gelince grafikleri çiz
    fetchEvaluationsForDashboard().then(() => {
        const monthSelect = document.getElementById('q-dash-month');
        const groupSelect = document.getElementById('q-dash-group');
        const agentSelect = document.getElementById('q-dash-agent');
        const selectedMonth = monthSelect ? monthSelect.value : '';
        const selectedGroup = groupSelect ? groupSelect.value : 'all';
        const selectedAgent = agentSelect ? agentSelect.value : 'all';
        const selectedChannel = "all";
        let filtered = allEvaluationsData.filter(e => {
            const rawDate = (e.callDate && e.callDate !== 'N/A') ? e.callDate : e.date;
            if (!rawDate || typeof rawDate !== 'string') return false;
            const eDate = rawDate.substring(3); // dd.MM.yyyy -> MM.yyyy
            const matchMonth = (eDate === selectedMonth);

            let matchGroup = true;
            let matchAgent = true;
            // Admin filtreleme mantığı
            if (isAdminMode) {
                // Eğer veri içinde grup bilgisi varsa onu kullan, yoksa adminUserList'ten bakmak gerekir.
                if (selectedGroup !== 'all') {
                    if (e.group) {
                        matchGroup = (e.group === selectedGroup);
                    } else {
                        const user = adminUserList.find(u => u.name === e.agent);
                        matchGroup = (user && user.group === selectedGroup);
                    }
                }

                if (selectedAgent !== 'all' && e.agent !== selectedAgent) matchAgent = false;
            } else {
                // Admin değilse sadece kendi verisi
                if (e.agent !== currentUser) matchAgent = false;
            }
            // MANUEL kayıtları dashboard'da gösterme
            const isManual = e.callId && String(e.callId).toUpperCase().startsWith('MANUEL-');
            return matchMonth && matchGroup && matchAgent && !isManual;
        });
        const total = filtered.reduce((acc, curr) => acc + (parseInt(curr.score) || 0), 0);
        const count = filtered.length;
        const avg = count > 0 ? (total / count).toFixed(1) : 0;
        const targetHit = filtered.filter(e => e.score >= 90).length;
        const rate = count > 0 ? Math.round((targetHit / count) * 100) : 0;
        // En zayıf kriter (detay varsa)
        let worstLabel = '-';
        try {
            const qs = {};
            filtered.forEach(item => {
                const details = safeParseDetails(item.details);
                if (!Array.isArray(details)) return;
                details.forEach(d => {
                    const key = String(d.q || '').trim();
                    if (!key) return;
                    const earned = parseFloat(d.score || 0) || 0;
                    const maxv = parseFloat(d.max || 0) || 0;
                    if (!qs[key]) qs[key] = { earned: 0, max: 0 };
                    qs[key].earned += earned;
                    qs[key].max += maxv;
                });
            });
            const arr = Object.keys(qs).map(k => {
                const o = qs[k];
                const pct = o.max > 0 ? (o.earned / o.max) * 100 : 100;
                return { k, pct };
            }).sort((a, b) => a.pct - b.pct);
            if (arr.length) {
                const k = arr[0].k;
                worstLabel = k.length > 28 ? (k.substring(0, 28) + '…') : k;
            }
        } catch (e) { }
        const worstEl = document.getElementById('q-dash-worst');
        if (worstEl) worstEl.innerText = worstLabel;

        // UI Güncelle
        document.getElementById('q-dash-score').innerText = avg;
        document.getElementById('q-dash-count').innerText = count;
        document.getElementById('q-dash-target').innerText = `%${rate}`;

        // Ring Chart Rengi
        const ring = document.getElementById('q-dash-ring');
        let color = '#2e7d32';
        if (avg < 70) color = '#d32f2f'; else if (avg < 85) color = '#ed6c02';
        const ratio = (avg / 100) * 100;
        if (ring) ring.style.background = `conic-gradient(${color} ${ratio}%, #eee ${ratio}%)`;
        if (document.getElementById('q-dash-ring-text')) document.getElementById('q-dash-ring-text').innerText = Math.round(avg);
        updateDashRingTitle();
        // Admin için: temsilci ortalamaları
        renderDashAgentScores(filtered);
        // Grafik Çizdir
        renderDashboardCharts(filtered);
    });
}
function renderDashboardChart(data) {
    const ctx = document.getElementById('q-breakdown-chart');
    if (!ctx) return;
    if (dashboardChart) {
        dashboardChart.destroy();
    }
    // --- KRİTER BAZLI ANALİZ ---
    let questionStats = {};
    if (data.length > 0) {
        data.forEach(item => {
            try {
                // Detay verisini kontrol et, string ise parse et
                let details = safeParseDetails(item.details);

                if (Array.isArray(details)) {
                    details.forEach(d => {
                        let qFullText = d.q; // Tam metin
                        // Soruyu anahtar olarak kullan (kısaltılmış versiyonu)
                        let qShortText = qFullText.length > 25 ? qFullText.substring(0, 25) + '...' : qFullText;

                        if (!questionStats[qShortText]) {
                            // fullText'i tutuyoruz ki tooltip'te gösterebilelim
                            questionStats[qShortText] = { earned: 0, max: 0, fullText: qFullText };
                        }

                        questionStats[qShortText].earned += parseInt(d.score || 0);
                        questionStats[qShortText].max += parseInt(d.max || 0);
                    });
                }
            } catch (e) {
                // JSON parse hatası veya eski veri formatı
                console.log("Detay verisi işlenemedi", e);
            }
        });
    }
    // İstatistikleri diziye çevirip başarı oranına göre sırala
    let statsArray = Object.keys(questionStats).map(key => {
        let s = questionStats[key];
        // Başarı oranı %
        let percentage = s.max > 0 ? (s.earned / s.max) * 100 : 0;
        return { label: key, fullLabel: s.fullText, value: percentage };
    });

    // Başarı oranına göre artan sıralama (En düşük başarı en başta)
    statsArray.sort((a, b) => a.value - b.value);

    // Eğer detay kırılımı yoksa (eski/boş kayıtlar), temsilci ortalamasına göre kırılım göster
    if (statsArray.length === 0) {
        const byAgent = {};
        data.forEach(it => {
            const a = it.agent || 'N/A';
            const s = parseFloat(it.score) || 0;
            if (!byAgent[a]) byAgent[a] = { total: 0, count: 0 };
            byAgent[a].total += s;
            byAgent[a].count += 1;
        });
        const aArr = Object.keys(byAgent).map(name => ({
            label: name.length > 25 ? name.substring(0, 25) + '...' : name,
            fullLabel: name,
            value: byAgent[name].count ? (byAgent[name].total / byAgent[name].count) : 0
        }));
        aArr.sort((x, y) => x.value - y.value);
        let topIssues = aArr.slice(0, 6);
        let chartLabels = topIssues.map(i => i.label);
        let chartData = topIssues.map(i => i.value.toFixed(1));

        dashboardChart = new Chart(ctx, {
            type: 'bar',
            plugins: [valueLabelPlugin],
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Ortalama Puan',
                    data: chartData,
                    backgroundColor: (ctx) => {
                        const v = ctx.raw;
                        return v < 70 ? 'rgba(231, 76, 60, 0.8)' : (v < 85 ? 'rgba(241, 196, 15, 0.8)' : 'rgba(46, 204, 113, 0.8)');
                    },
                    borderRadius: 6,
                    borderWidth: 0,
                    barThickness: 24
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                layout: { padding: { top: 45, right: 45, bottom: 10, left: 10 } },
                scales: {
                    x: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.03)' }, ticks: { font: { size: 10 } } },
                    y: { grid: { display: false }, ticks: { font: { weight: '600', size: 11 } } }
                },
                plugins: {
                    legend: { display: false },
                    valueLabelPlugin: { formatter: (v) => `${Number(v).toFixed(1)}` },
                    tooltip: {
                        backgroundColor: 'rgba(14, 27, 66, 0.95)',
                        padding: 12,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        cornerRadius: 8,
                        callbacks: {
                            title: (context) => topIssues[context[0].dataIndex].fullLabel,
                            label: (context) => `Ortalama: ${context.parsed.x} Puan`
                        }
                    }
                }
            }
        });
        return;
    }

    // Sadece en düşük 6 kriteri göster
    let topIssues = statsArray.slice(0, 6);
    let chartLabels = topIssues.map(i => i.label);
    let chartData = topIssues.map(i => i.value.toFixed(1));

    dashboardChart = new Chart(ctx, {
        type: 'bar',
        plugins: [valueLabelPlugin],
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Başarı Oranı (%)',
                data: chartData,
                backgroundColor: (ctx) => {
                    const v = ctx.raw;
                    return v < 70 ? 'rgba(231, 76, 60, 0.85)' : (v < 90 ? 'rgba(241, 196, 15, 0.85)' : 'rgba(46, 204, 113, 0.85)');
                },
                borderRadius: 8,
                barThickness: 26
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            layout: { padding: { top: 45, right: 75, bottom: 10, left: 10 } },
            scales: {
                x: { beginAtZero: true, max: 135, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { display: false } },
                y: { grid: { display: false }, ticks: { font: { weight: '700', size: 12 } } }
            },
            plugins: {
                legend: { display: false },
                valueLabelPlugin: { formatter: (v) => `${Number(v).toFixed(1)}%` },
                tooltip: {
                    backgroundColor: 'rgba(14, 27, 66, 0.95)',
                    callbacks: {
                        title: (context) => topIssues[context[0].dataIndex].fullLabel,
                        label: (context) => `Başarı: ${context.parsed.x}%`
                    }
                }
            }
        }
    });
}


function destroyIfExists(chart) {
    try { if (chart) chart.destroy(); } catch (e) { }
}

// --- Chart veri etiketleri (harici plugin gerektirmez) ---
// Chart.js v3+ uyumlu, bar/line/doughnut üzerinde değerleri yazar.
const valueLabelPlugin = {
    id: 'valueLabelPlugin',
    afterDatasetsDraw(chart, args, pluginOptions) {
        const opt = pluginOptions || {};
        if (opt.display === false) return;
        const ctx = chart.ctx;
        const type = chart.config.type;
        const datasets = chart.data && chart.data.datasets ? chart.data.datasets : [];

        ctx.save();
        ctx.font = opt.font || '700 13px "Inter", sans-serif';
        ctx.fillStyle = opt.color || '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const format = typeof opt.formatter === 'function'
            ? opt.formatter
            : (v) => (v === null || typeof v === 'undefined' ? '' : String(v));

        if (type === 'doughnut' || type === 'pie') {
            const total = (datasets[0] && Array.isArray(datasets[0].data))
                ? datasets[0].data.reduce((a, b) => a + (parseFloat(b) || 0), 0)
                : 0;
            const meta = chart.getDatasetMeta(0);
            meta.data.forEach((arc, i) => {
                const raw = (datasets[0].data || [])[i];
                const val = parseFloat(raw) || 0;
                if (!val || !total) return;
                const pct = (val / total) * 100;
                if (pct < (opt.minPercentToShow || 4)) return;
                const p = arc.tooltipPosition();
                ctx.fillText((opt.showPercent ? `${pct.toFixed(0)}%` : format(raw, i, chart)), p.x, p.y);
            });
            ctx.restore();
            return;
        }

        datasets.forEach((ds, di) => {
            const meta = chart.getDatasetMeta(di);
            if (meta.hidden) return;
            meta.data.forEach((el, i) => {
                const raw = Array.isArray(ds.data) ? ds.data[i] : null;
                const txt = format(raw, i, chart);
                if (!txt) return;
                const pos = el.tooltipPosition();
                const isHorizontal = chart.config.options.indexAxis === 'y';
                if (isHorizontal && type === 'bar') {
                    ctx.textAlign = 'right';
                    ctx.fillText(txt, pos.x - 10, pos.y);
                } else {
                    const dy = (type === 'bar') ? -10 : -12;
                    ctx.fillText(txt, pos.x, pos.y + dy);
                }
            });
        });

        ctx.restore();
    }
};

function renderDashboardCharts(filtered) {
    renderDashboardChart(filtered); // mevcut: kriter bazlı bar
    renderDashboardTrendChart(filtered);
    renderDashboardChannelChart(filtered);
    renderDashboardScoreDistributionChart(filtered);
    renderDashboardGroupAvgChart(filtered);
}

function renderDashboardTrendChart(data) {
    const canvas = document.getElementById('q-trend-chart');
    if (!canvas) return;
    destroyIfExists(dashTrendChart);

    // Günlük ortalama (dd.MM.yyyy)
    const byDay = {};
    (data || []).forEach(e => {
        const day = String(e.callDate || e.date || '').trim();
        if (!day) return;
        const s = parseFloat(e.score) || 0;
        if (!byDay[day]) byDay[day] = { total: 0, count: 0 };
        byDay[day].total += s;
        byDay[day].count += 1;
    });

    const days = Object.keys(byDay).sort((a, b) => {
        // dd.MM.yyyy
        const pa = a.split('.'); const pb = b.split('.');
        const da = new Date(Number(pa[2]), Number(pa[1]) - 1, Number(pa[0]));
        const db = new Date(Number(pb[2]), Number(pb[1]) - 1, Number(pb[0]));
        return da - db;
    });

    const labels = days.map(d => d.substring(0, 5)); // dd.MM
    const values = days.map(d => (byDay[d].count ? (byDay[d].total / byDay[d].count) : 0).toFixed(1));

    const sub = document.getElementById('q-trend-sub');
    if (sub) {
        sub.textContent = days.length ? `${days.length} gün • günlük ortalama` : 'Veri yok';
    }

    dashTrendChart = new Chart(canvas, {
        type: 'line',
        plugins: [valueLabelPlugin],
        data: {
            labels,
            datasets: [{
                label: 'Günlük Ortalama',
                data: values,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#3498db',
                pointBorderWidth: 2,
                borderWidth: 3
            }]
        },
        options: {
            layout: { padding: { top: 45, right: 25, left: 10 } },
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 120, grid: { color: 'rgba(0,0,0,0.03)' } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                valueLabelPlugin: { formatter: (v) => `${Number(v).toFixed(1)}` },
                tooltip: {
                    backgroundColor: 'rgba(14, 27, 66, 0.95)',
                    callbacks: { label: (ctx) => `Ortalama: ${ctx.parsed.y}` }
                }
            }
        }
    });
}

function renderDashboardChannelChart(data) {
    const canvas = document.getElementById('q-channel-chart');
    if (!canvas) return;
    destroyIfExists(dashChannelChart);

    const gSel = document.getElementById('q-dash-group');
    const aSel = document.getElementById('q-dash-agent');
    const chSel = document.getElementById('q-dash-channel');
    const g = gSel ? gSel.value : 'all';
    const a = aSel ? aSel.value : 'all';
    const ch = chSel ? chSel.value : 'all';

    let mode = 'channel';
    // Daraltılmış görünümde kanal dağılımı anlamlı değilse, feedbackType dağılımına dön
    if (ch !== 'all' || (a && a !== 'all')) mode = 'feedbackType';

    const buckets = {};
    (data || []).forEach(e => {
        const key = mode === 'channel' ? deriveChannelFromGroup(e.group) : String(e.feedbackType || 'Yok');
        if (!buckets[key]) buckets[key] = 0;
        buckets[key] += 1;
    });

    const labels = Object.keys(buckets);
    const values = labels.map(k => buckets[k]);

    const sub = document.getElementById('q-channel-sub');
    if (sub) {
        if (mode === 'channel') sub.textContent = 'Satış / Chat / Diğer';
        else sub.textContent = 'Feedback Type dağılımı';
    }

    dashChannelChart = new Chart(canvas, {
        type: 'doughnut',
        plugins: [valueLabelPlugin],
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: ['#3498db', '#9b59b6', '#2ecc71', '#f1c40f', '#e67e22', '#e74c3c'],
                borderWidth: 2,
                borderColor: '#fff',
                hoverOffset: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
                valueLabelPlugin: { showPercent: true, minPercentToShow: 5, color: '#fff' },
                tooltip: {
                    backgroundColor: 'rgba(14, 27, 66, 0.95)',
                    callbacks: { label: (ctx) => `${ctx.label}: ${ctx.formattedValue} Adet` }
                }
            }
        }
    });
}

function renderDashboardScoreDistributionChart(data) {
    const canvas = document.getElementById('q-score-dist-chart');
    if (!canvas) return;
    destroyIfExists(dashScoreDistChart);

    const ranges = [
        { label: '0-59', min: 0, max: 59 },
        { label: '60-69', min: 60, max: 69 },
        { label: '70-79', min: 70, max: 79 },
        { label: '80-89', min: 80, max: 89 },
        { label: '90-100', min: 90, max: 100 },
    ];
    const counts = ranges.map(() => 0);
    (data || []).forEach(e => {
        const s = Math.round(parseFloat(e.score) || 0);
        for (let i = 0; i < ranges.length; i++) {
            if (s >= ranges[i].min && s <= ranges[i].max) { counts[i]++; break; }
        }
    });

    dashScoreDistChart = new Chart(canvas, {
        type: 'bar',
        plugins: [valueLabelPlugin],
        data: {
            labels: ranges.map(r => r.label),
            datasets: [{
                label: 'Adet',
                data: counts,
                backgroundColor: ['#e74c3c', '#e67e22', '#f1c40f', '#3498db', '#2ecc71'],
                borderWidth: 0,
                borderRadius: 4,
                barThickness: 30
            }]
        },
        options: {
            layout: { padding: { top: 45 } },
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 120, grid: { color: 'rgba(0,0,0,0.03)' }, ticks: { precision: 0 } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                valueLabelPlugin: { formatter: (v) => `${v}` },
                tooltip: {
                    backgroundColor: 'rgba(14, 27, 66, 0.95)',
                    callbacks: { label: (ctx) => `${ctx.parsed.y} Kayıt` }
                }
            }
        }
    });
}

function renderDashboardGroupAvgChart(data) {
    const canvas = document.getElementById('q-group-avg-chart');
    if (!canvas) return;
    destroyIfExists(dashGroupAvgChart);

    // Grup ortalamaları (admin için anlamlı)
    const byGroup = {};
    (data || []).forEach(e => {
        const g = String(e.group || 'Genel');
        const s = parseFloat(e.score) || 0;
        if (!byGroup[g]) byGroup[g] = { total: 0, count: 0 };
        byGroup[g].total += s;
        byGroup[g].count += 1;
    });

    const rows = Object.keys(byGroup).map(g => ({
        g,
        avg: byGroup[g].count ? (byGroup[g].total / byGroup[g].count) : 0,
        count: byGroup[g].count
    })).sort((a, b) => a.avg - b.avg);

    const labels = rows.map(r => r.g.length > 22 ? (r.g.substring(0, 22) + '…') : r.g);
    const values = rows.map(r => r.avg.toFixed(1));

    const sub = document.getElementById('q-group-sub');
    if (sub) {
        sub.textContent = rows.length ? `${rows.length} takım • en düşükten en yükseğe` : 'Veri yok';
    }

    dashGroupAvgChart = new Chart(canvas, {
        type: 'bar',
        plugins: [valueLabelPlugin],
        data: {
            labels,
            datasets: [{
                label: 'Ortalama',
                data: values,
                backgroundColor: '#1e293b',
                hoverBackgroundColor: '#CF0A2C',
                borderRadius: 4,
                barThickness: 18
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: { padding: { top: 35, right: 90, bottom: 5, left: 10 } },
            scales: {
                x: { beginAtZero: true, max: 140, grid: { display: false }, ticks: { display: false } },
                y: { grid: { display: false }, ticks: { font: { weight: '800', size: 13, family: '"Inter", sans-serif' }, color: '#1e293b' } }
            },
            plugins: {
                legend: { display: false },
                valueLabelPlugin: {
                    formatter: (v) => `${Number(v).toFixed(1)}`,
                    color: '#ffffff',
                    font: '900 13px "Inter", sans-serif'
                },
                tooltip: {
                    backgroundColor: 'rgba(14, 27, 66, 0.95)',
                    callbacks: {
                        title: (ctx) => rows[ctx[0].dataIndex].g,
                        label: (ctx) => `Ortalama: ${ctx.parsed.x} (${rows[ctx.dataIndex].count} Kayıt)`
                    }
                }
            }
        }
    });
}
// --- EĞİTİM MODÜLÜ (YENİ) ---
let allTrainingsData = []; // Global cache for filtering

function loadTrainingData() {
    const listEl = document.getElementById('training-list');
    listEl.innerHTML = '<div style="grid-column:1/-1; text-align:center;">Yükleniyor...</div>';

    apiCall("getTrainings", { asAdmin: isAdminMode }).then(data => {
        if (data.result === 'success') {
            allTrainingsData = data.trainings || [];
            renderTrainingList(allTrainingsData);
        } else {
            listEl.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#888;">Hata oluştu veya veri yok.</div>';
        }
    });
}

function renderTrainingList(trainings) {
    const listEl = document.getElementById('training-list');
    listEl.innerHTML = '';

    if (!trainings || trainings.length === 0) {
        listEl.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#888;">Görüntülenecek eğitim bulunmuyor.</div>';
        return;
    }

    trainings.forEach(t => {
        let statusHtml = t.isCompleted
            ? `<button class="t-btn t-btn-done"><i class="fas fa-check"></i> Tamamlandı</button>`
            : `<button class="t-btn t-btn-start" onclick="openTrainingLink('${t.id}', '${t.link}')">Eğitime Git</button>`;

        let docHtml = t.docLink && t.docLink !== 'N/A'
            ? `<a href="${t.docLink}" target="_blank" class="t-doc-link"><i class="fas fa-file-download"></i> Dökümanı İndir</a>`
            : '';

        listEl.innerHTML += `
        <div class="t-card">
            <div class="t-card-header">
                <span>${t.title}${isAdminMode ? ` <span style="font-weight:600; opacity:.8; font-size:.75rem">(${t.target}${t.target === 'Individual' && t.targetUser ? ' • ' + t.targetUser : ''})</span>` : ''}</span>
                <span class="t-status-badge">Atanma: ${t.date}</span>
            </div>
            <div class="t-card-body">
                ${t.desc}
                ${docHtml}
                <div style="margin-top:10px; display:flex; justify-content:space-between; font-size:0.8rem; color:#666; padding-top:10px; border-top:1px dashed #eee;">
                    <div><strong>Süre:</strong> ${t.duration || 'Belirtilmedi'}</div>
                    <div><strong>Başlangıç:</strong> ${t.startDate || 'N/A'} - <strong>Bitiş:</strong> ${t.endDate || 'N/A'}</div>
                </div>
                <div style="font-size:0.8rem; color:#999; margin-top:5px;">Atayan: ${t.creator}</div>
            </div>
            <div class="t-card-footer">
                ${statusHtml}
            </div>
        </div>`;
    });
}

function filterTrainingList() {
    const query = (document.getElementById('q-training-search').value || '').toLowerCase().trim();
    const type = document.getElementById('q-training-filter-type').value;

    const filtered = allTrainingsData.filter(t => {
        const matchType = (type === 'all' || t.target === type);
        const matchSearch = !query ||
            (t.title && t.title.toLowerCase().includes(query)) ||
            (t.desc && t.desc.toLowerCase().includes(query)) ||
            (t.targetUser && t.targetUser.toLowerCase().includes(query));

        return matchType && matchSearch;
    });

    renderTrainingList(filtered);
}
function startTraining(id) {
    apiCall("startTraining", { trainingId: id });
}

function openTrainingLink(id, link) {
    startTraining(id);
    if (link && link !== 'N/A') {
        window.open(link, '_blank');
    } else {
        Swal.fire('Uyarı', 'Bu eğitim için geçerli bir link bulunmamaktadır.', 'warning');
    }

    // Linke tıkladıktan sonra onay sor
    Swal.fire({
        title: 'Eğitimi Tamamladın mı?',
        text: "Eğitim içeriğini inceleyip anladıysan onayla.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Evet, Tamamladım',
        cancelButtonText: 'Daha Sonra'
    }).then((result) => {
        if (result.isConfirmed) {
            completeTraining(id);
        }
    });
}
function completeTraining(id) {
    apiCall("completeTraining", { trainingId: id }).then(d => {
        if (d.result === 'success') {
            Swal.fire('Harika!', 'Eğitim tamamlandı olarak işaretlendi.', 'success');
            loadTrainingData();
        } else {
            Swal.fire('Hata', d.message, 'error');
        }
    });
}
async function assignTrainingPopup() {
    const { value: formValues } = await Swal.fire({
        title: 'Yeni Eğitim & Döküman Ata',
        html: `
            <div class="t-modal-grid">
                <input id="swal-t-title" class="swal2-input" placeholder="Eğitim Başlığı" style="grid-column: 1 / 4;">
                <textarea id="swal-t-desc" class="swal2-textarea" style="height:100px; grid-column: 1 / 4;" placeholder="Eğitim açıklaması veya talimatlar..."></textarea>
                <input id="swal-t-link" class="swal2-input" placeholder="Video/Eğitim Linki (URL)" style="grid-column: 1 / 4;">
                <input id="swal-t-doc" class="swal2-input" placeholder="Döküman Linki (PDF/URL) (İsteğe Bağlı)" style="grid-column: 1 / 4;">
                <input id="swal-t-file" type="file" class="swal2-file" style="grid-column: 1 / 4; margin-top:6px;" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg">
                <div style="grid-column:1/4; font-size:0.78rem; color:#6b7280; margin-top:-4px;">
                  İstersen dosyayı buradan yükle (PDF/Word/PowerPoint...). Yüklenen dosya eğitim kartında “Dökümanı İndir” olarak görünür.
                </div>
                <input type="date" id="swal-t-start" class="swal2-input" value="${new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().substring(0, 10)}">
                <input type="date" id="swal-t-end" class="swal2-input">
                <input id="swal-t-duration" class="swal2-input" placeholder="Süre (Örn: 20dk)">
            </div>
            <select id="swal-t-target" class="swal2-input" onchange="updateTrainingTarget(this.value)" style="margin-top:10px;">
                <option value="Genel">Herkese (Tüm Ekip)</option>
                <option value="Telesatış">Telesatış Ekibi</option>
                <option value="Chat">Chat Ekibi</option>
                <option value="Individual">Kişiye Özel</option>
            </select>
            <select id="swal-t-agent" class="swal2-input" style="display:none; width:100%;"></select>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Ata',
        didOpen: () => {
            // Dosya upload (base64)
            window.__trainingUpload = { name: '', mime: '', b64: '' };
            const fileInp = document.getElementById('swal-t-file');
            if (fileInp) {
                fileInp.addEventListener('change', (ev) => {
                    const f = ev.target.files && ev.target.files[0];
                    if (!f) { window.__trainingUpload = { name: '', mime: '', b64: '' }; return; }
                    const reader = new FileReader();
                    reader.onload = () => {
                        const res = String(reader.result || '');
                        const b64 = res.includes(',') ? res.split(',')[1] : '';
                        window.__trainingUpload = { name: f.name, mime: f.type || 'application/octet-stream', b64 };
                    };
                    reader.readAsDataURL(f);
                });
            }
            window.updateTrainingTarget = function (val) {
                const agentSelect = document.getElementById('swal-t-agent');
                agentSelect.style.display = val === 'Individual' ? 'block' : 'none';
                if (val === 'Individual') {
                    agentSelect.innerHTML = adminUserList.map(u => `<option value="${u.name}">${u.name}</option>`).join('');
                }
            };
            updateTrainingTarget('Genel');
        },
        preConfirm: () => {
            const target = document.getElementById('swal-t-target').value;
            const agent = target === 'Individual' ? document.getElementById('swal-t-agent').value : '';
            if (!document.getElementById('swal-t-title').value || (!target && !agent)) {
                Swal.showValidationMessage('Başlık ve Atama Alanı boş bırakılamaz');
                return false;
            }
            return {
                title: document.getElementById('swal-t-title').value,
                desc: document.getElementById('swal-t-desc').value,
                link: document.getElementById('swal-t-link').value,
                docLink: document.getElementById('swal-t-doc').value || 'N/A',
                docFile: (window.__trainingUpload && window.__trainingUpload.b64) ? window.__trainingUpload : null,
                target: target,
                targetAgent: agent, // Kişiye özel atama için
                creator: currentUser,
                startDate: document.getElementById('swal-t-start').value, // YYYY-MM-DD (raw)
                endDate: document.getElementById('swal-t-end').value,   // YYYY-MM-DD (raw)
                duration: document.getElementById('swal-t-duration').value
            }
        }
    });
    if (formValues) {
        try {
            Swal.fire({ title: 'Atanıyor...', didOpen: () => Swal.showLoading() });
            // Dosya seçildiyse önce Drive'a yükle
            if (formValues.docFile) {
                const up = await apiCall('uploadTrainingDoc', { fileName: formValues.docFile.name, mimeType: formValues.docFile.mime, base64: formValues.docFile.b64 });
                formValues.docLink = (up && up.url) ? up.url : formValues.docLink;
            }
            const d = await apiCall('assignTraining', { ...formValues });
            if (d && d.result === 'success') {
                Swal.fire('Başarılı', 'Eğitim atandı.', 'success');
                loadTrainingData();
            } else {
                Swal.fire('Hata', (d && d.message) || 'İşlem başarısız', 'error');
            }
        } catch (e) {
            Swal.fire('Hata', e.message || 'İşlem başarısız', 'error');
        }
    }
}
// --- FEEDBACK MODÜLÜ ---

// YENİ FONKSİYON: Feedback_Logs'u çekmek için
async function fetchFeedbackLogs() {
    try {
        const data = await apiCall("fetchFeedbackLogs", {});
        if (data.result === "success") {
            feedbackLogsData = data.feedbackLogs || [];
        } else {
            feedbackLogsData = [];
        }
    } catch (error) {
        console.error("Feedback Logs çekilirken hata oluştu:", error);
        feedbackLogsData = [];
    }
}

// YARDIMCI FONKSİYON: Dönem bilgisini MM.YYYY formatında döndürür
function formatPeriod(periodString) {
    if (!periodString || periodString === 'N/A') return 'N/A';

    // Zaten MM.YYYY formatındaysa direkt döndür
    if (periodString.match(/^\d{2}\.\d{4}$/)) {
        return periodString;
    }

    // Eğer uzun bir Date string'i ise (ör: Wed Oct 01 2025...) tarih nesnesine çevir
    try {
        const date = new Date(periodString);
        if (!isNaN(date.getTime())) {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${month}.${year}`;
        }
    } catch (e) {
        // Hata oluşursa olduğu gibi bırak veya N/A döndür
        console.error("Dönem formatlama hatası:", e);
    }

    return periodString; // Başka formatta gelirse yine de olduğu gibi döndür
}

function loadFeedbackList() {
    const listEl = document.getElementById('feedback-list');
    listEl.innerHTML = '';

    // Admin butonunu göster/gizle
    const manualBtn = document.getElementById('manual-feedback-admin-btn');
    if (manualBtn) manualBtn.style.display = isAdminMode ? 'flex' : 'none';

    // YENİ FİLTRELEME MANTIĞI: Seçili dönem + (Mail veya Manuel)
    const monthSelect = document.getElementById('q-feedback-month');
    const selectedMonth = monthSelect ? monthSelect.value : null;

    const feedbackItems = allEvaluationsData.filter(e => {
        // feedbackType kontrolü
        const isMailFeedback = e.feedbackType && e.feedbackType.toLowerCase() === 'mail';
        // Manuel kontrolü
        const isManualFeedback = e.callId && String(e.callId).toUpperCase().startsWith('MANUEL-');

        if (!isMailFeedback && !isManualFeedback) return false;

        // Dönem kontrolü
        if (selectedMonth) {
            const rawDate = (e.callDate && e.callDate !== 'N/A') ? e.callDate : e.date;
            if (!rawDate) return false;

            let eMonthYear = "";
            if (String(rawDate).includes('.')) {
                const parts = rawDate.split('.');
                if (parts.length >= 3) {
                    eMonthYear = `${parts[1].padStart(2, '0')}.${parts[2].substring(0, 4)}`;
                }
            } else {
                // ISO / Diğer formatlar için Date objesi üzerinden MM.YYYY üret
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                    eMonthYear = `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
                }
            }
            return eMonthYear === selectedMonth;
        }
        return true;
    });
    if (feedbackItems.length === 0) {
        listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">Görüntülenecek filtrelenmiş geri bildirim yok (Sadece Mail veya Manuel).</div>';
        return;
    }

    feedbackItems.forEach(e => {
        // Geliştirme: Çağrı Tarihi ve ID eklendi (Gelişmiş Kart Tasarımı)
        const feedbackClass = e.feedbackType === 'Sözlü' ? '#2196f3' : (e.feedbackType === 'Mail' ? '#e65100' : (e.feedbackType === 'Bilgilendirme' ? '#0288d1' : (e.feedbackType === 'Feedback' ? '#2e7d32' : '#10b981')));

        // MANUEL CallID'den ön eki temizle
        const cleanCallId = String(e.callId).toUpperCase().startsWith('MANUEL-') ? String(e.callId).substring(7) : e.callId;

        // Konu/Başlık bilgisi 'details' alanından gelir (Manuel geri bildirim için)
        // Eğer detay alanı JSON ise (yani normal değerlendirme) veya boşsa varsayılan metin kullan
        const isEvaluationDetail = String(e.details).startsWith('[');
        const feedbackTopic = isEvaluationDetail ? 'Değerlendirme Konusu' : (e.details || 'Belirtilmemiş');

        // Dönem, Kanal ve Tipi belirle (Manuel kayıtlarda bu bilgileri Evaluations'tan değil, Feedback_Logs'tan çekiyoruz)
        const isManual = String(e.callId).toUpperCase().startsWith('MANUEL-');

        let period = e.period || e.date.substring(3);
        let channel = (e.channel && String(e.channel).trim()) ? String(e.channel).trim() : 'Yok';
        const infoType = e.feedbackType || 'Yok';

        // DÜZELTME MANTIĞI: Eğer kayıt Manuel ise, detaylı bilgiyi feedbackLogsData'dan çek.
        if (isManual) {
            // CallId'deki MANUEL- ön ekini atarak Feedback_Logs'taki Call_ID ile eşleştirme
            const logRow = feedbackLogsData.find(x => String(x.callId) === String(cleanCallId));
            if (logRow) {
                // Apps Script'ten gelen period değerini formatla (Tarih Nesnesi/String olma ihtimaline karşı)
                period = formatPeriod(logRow.period) || period;
                channel = logRow.channel && logRow.channel !== 'N/A' ? logRow.channel : 'Yok';
            }
        }

        listEl.innerHTML += `
            <div class="feedback-card" style="border-left-color: ${feedbackClass};">
                <div class="feedback-header">
                    <div style="font-weight:bold; color:#0e1b42; font-size:1.1rem;">${e.agent}</div>
                    <div class="feedback-info-right">
                        <span><i class="fas fa-user-check"></i> Değerleyen: ${e.evaluator}</span>
                        <span><i class="fas fa-id-badge"></i> Çağrı ID: ${cleanCallId}</span>
                        <span><i class="fas fa-calendar-alt"></i> Tarih: ${e.callDate}</span>
                    </div>
                </div>
                <div class="feedback-body">
                    <div style="font-weight:bold; color:#333; margin-bottom:5px;">Konu/Açıklama: ${feedbackTopic}</div>
                    <div style="color:#555; line-height:1.5; font-size:0.95rem;">${e.feedback}</div>
                </div>
                <div class="feedback-footer">
                     <div style="display:flex; gap:10px; font-size:0.7rem; color:#666; font-weight:600; margin-right:10px;">
                        <span><i class="fas fa-calendar-week"></i> Dönem: ${period}</span>
                        <span><i class="fas fa-comment-alt"></i> Kanal: ${channel}</span>
                        <span><i class="fas fa-tag"></i> Tip: ${infoType}</span>
                     </div>
                     
            </div>`;
    });
}
// Adminler için manuel geri bildirim ekleme (Çağrı dışı konular için)
async function addManualFeedbackPopup() {
    if (!isAdminMode) return;

    // Admin user listesi yoksa yükle
    if (adminUserList.length === 0) {
        Swal.fire({ title: 'Kullanıcı Listesi Yükleniyor...', didOpen: () => Swal.showLoading() });
        await fetchUserListForAdmin();
        Swal.close();
    }
    // Dönem filtre seçeneklerini oluştur
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let monthOptions = '';
    for (let i = 0; i < 6; i++) {
        let month = (currentMonth - i + 12) % 12;
        let year = currentYear - (currentMonth - i < 0 ? 1 : 0);
        const text = `${MONTH_NAMES[month]} ${year}`;
        const value = `${String(month + 1).padStart(2, '0')}.${year}`; // Backend'in beklediği MM.YYYY formatı
        const isCurrent = (i === 0);
        monthOptions += `<option value="${value}" ${isCurrent ? 'selected' : ''}>${text}</option>`;
    }

    // YENİ HTML TASARIMI: Daha düzenli ve etiketli form
    const newHtmlContent = `
        <div class="manual-feedback-form">
            <div class="form-group">
                <label for="manual-q-agent">Temsilci Adı <span class="required">*</span></label>
                <select id="manual-q-agent" class="swal2-input"></select>
            </div>
            <div class="form-group">
                <label for="manual-q-topic">Konu / Başlık <span class="required">*</span></label>
                <input id="manual-q-topic" class="swal2-input" placeholder="Geri bildirim konusu (Örn: Yeni Kampanya Bilgilendirmesi)">
            </div>
            
            <div class="grid-2-cols">
                <div class="form-group">
                    <label for="manual-q-callid">Çağrı/Etkileşim ID <span class="required">*</span></label>
                    <input id="manual-q-callid" class="swal2-input" placeholder="ID (Örn: 123456)">
                </div>
                <div class="form-group">
                    <label for="manual-q-date">Tarih <span class="required">*</span></label>
                    <input type="date" id="manual-q-date" class="swal2-input" value="${new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().substring(0, 10)}">
                </div>
            </div>
            <div class="grid-3-cols">
                <div class="form-group">
                    <label for="manual-q-channel">Kanal</label>
                    <select id="manual-q-channel" class="swal2-input">
                        <option value="Telefon">Telefon</option>
                        <option value="Canlı Destek">Canlı Destek</option>
                        <option value="E-posta">E-posta</option>
                        <option value="Sosyal Medya">Sosyal Medya</option>
                        <option value="Yok">Yok/Diğer</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="manual-q-period">Dönem</label>
                    <select id="manual-q-period" class="swal2-input">${monthOptions}</select>
                </div>
                <div class="form-group">
                    <label for="manual-q-type">Tip</label>
                    <select id="manual-q-type" class="swal2-input">
                        <option value="Feedback">Feedback</option>
                        <option value="Bilgilendirme">Bilgilendirme</option>
                        <option value="Sözlü">Sözlü</option>
                        <option value="Mail">Mail</option>
                        <option value="Özel">Özel Konu</option>
                    </select>
                </div>
            </div>
            
            <div class="form-group">
                <label for="manual-q-feedback">Geri Bildirim Detayları <span class="required">*</span></label>
                <textarea id="manual-q-feedback" class="swal2-textarea" placeholder="Buraya geri bildirimin detaylı metnini giriniz..."></textarea>
            </div>
        </div>
        <style>
            /* Manuel Geri Bildirim Formu Stil İyileştirmeleri */
            .manual-feedback-form {
                text-align: left;
                padding: 10px;
                background: #fcfcfc;
                border-radius: 8px;
                border: 1px solid #eee;
            }
            .form-group {
                margin-bottom: 12px;
            }
            .form-group label {
                font-size: 0.85rem;
                font-weight: 600;
                color: var(--primary);
                display: block;
                margin-bottom: 4px;
            }
            .grid-2-cols {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
            }
            .grid-3-cols {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 15px;
            }
            .required {
                color: var(--accent);
                font-size: 0.9rem;
            }
            /* Input/Select/Textarea stillerini genel swal2-input stilinden devraldık */
            .manual-feedback-form .swal2-input, .manual-feedback-form .swal2-textarea {
                width: 100% !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: 10px 12px !important;
                border: 1px solid #dcdcdc !important;
                border-radius: 6px !important;
                font-size: 0.95rem !important;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .manual-feedback-form .swal2-input:focus, .manual-feedback-form .swal2-textarea:focus {
                border-color: var(--secondary) !important;
                box-shadow: 0 0 0 2px rgba(250, 187, 0, 0.2) !important;
            }
            .manual-feedback-form .swal2-textarea {
                min-height: 100px;
                resize: vertical;
            }
        </style>
    `;

    // Modalı görüntüdeki gibi düzenledik (Agent Select ve sade alanlar)
    const { value: formValues } = await Swal.fire({
        title: 'Manuel Geri Bildirim Yaz',
        html: newHtmlContent,
        width: '600px', // Modal genişliğini artırdık
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save"></i> Kaydet',
        didOpen: () => {
            const sel = document.getElementById('manual-q-agent');
            adminUserList.forEach(u => sel.innerHTML += `<option value="${u.name}">${u.name}</option>`);
        },
        preConfirm: () => {
            const agentName = document.getElementById('manual-q-agent').value;
            const topic = document.getElementById('manual-q-topic').value;
            const feedback = document.getElementById('manual-q-feedback').value;
            const feedbackType = document.getElementById('manual-q-type').value;

            // YENİ ALANLAR
            const channel = document.getElementById('manual-q-channel').value;
            const period = document.getElementById('manual-q-period').value; // MM.YYYY formatında

            // YENİ ZORUNLU KONTROLLER
            const callId = document.getElementById('manual-q-callid').value.trim();
            const rawCallDate = document.getElementById('manual-q-date').value;
            const callDate = rawCallDate ? `${rawCallDate}T00:00:00` : new Date().toISOString();
            if (!agentName || !feedback || !callId || !rawCallDate || !topic) { // Konu/Başlık da zorunlu yapıldı
                Swal.showValidationMessage('Tüm (*) işaretli alanlar zorunludur!');
                return false;
            }

            // Konu sadece başlık olarak gönderiliyor. Dönem ve Kanal ayrı alanlar olarak gönderilecek.
            return {
                agentName,
                // Backend'de ayrı loglama için CallID'yi MANUEL ile başlatıyoruz.
                callId: "MANUEL-" + callId,
                callDate: callDate,
                score: null, // BUG FIX: Manuel geri bildirimler puan ortalamasını ETKİLEMESİN (User request)
                details: topic, // Sadece konuyu gönderiyoruz
                feedback,
                feedbackType,
                agentGroup: "Genel", // Manuel olduğu için Genel Grup olarak kaydedilir.
                // ÇÖZÜM: Yeni alanları ekliyoruz
                channel: channel,
                period: period
            };
        }
    });
    if (formValues) {
        // MÜKERRER KONTROL: Aynı temsilci + aynı Call ID daha önce kaydedildiyse uyar
        try {
            const normAgent = String(formValues.agentName || '').trim().toLowerCase();
            const normCallId = String(formValues.callId || '').trim();
            const isDup = Array.isArray(allEvaluationsData) && allEvaluationsData.some(e =>
                String(e.agent || e.agentName || '').trim().toLowerCase() === normAgent &&
                String(e.callId || '').trim() === normCallId
            );

            if (isDup) {
                const decision = await Swal.fire({
                    icon: 'warning',
                    title: 'Mükerrer Dinleme',
                    html: `<div style="text-align:left; line-height:1.4;">
                            <b>${formValues.agentName}</b> için <b>Call ID: ${escapeHtml(formValues.callId)}</b> daha önce kaydedilmiş görünüyor.<br>
                            <span style="color:#666; font-size:0.9rem;">Yine de yeni kayıt oluşturmak istiyor musun?</span>
                           </div>`,
                    showCancelButton: true,
                    confirmButtonText: 'Evet, kaydet',
                    cancelButtonText: 'Vazgeç',
                    reverseButtons: true
                });
                if (!decision.isConfirmed) return;
            }
        } catch (e) {
            console.warn('Duplicate check failed', e);
        }

        Swal.fire({ title: 'Kaydediliyor...', didOpen: () => Swal.showLoading() });
        apiCall("logEvaluation", { ...formValues }).then(async d => {
            if (d.result === "success") {
                Swal.fire({ icon: 'success', title: 'Kaydedildi', timer: 1500, showConfirmButton: false });

                fetchEvaluationsForAgent(formValues.agentName);
                fetchFeedbackLogs().then(() => { loadFeedbackList(); });
            } else {
                Swal.fire('Hata', d.message, 'error');
            }
        });
    }
}
async function fetchEvaluationsForAgent(forcedName, silent = false) {
    const listEl = document.getElementById('evaluations-list');
    if (!silent) listEl.innerHTML = 'Yükleniyor...';
    const groupSelect = document.getElementById('q-admin-group');
    const agentSelect = document.getElementById('q-admin-agent');

    let targetAgent = forcedName || currentUser;
    let targetGroup = 'all';

    if (isAdminMode && agentSelect) {
        targetAgent = forcedName || agentSelect.value;
        targetGroup = groupSelect ? groupSelect.value : 'all';
    }
    try {
        const periodSelect = document.getElementById('q-eval-month');
        const selectedPeriod = periodSelect ? periodSelect.value : null;

        const data = await apiCall("fetchEvaluations", {
            targetAgent: targetAgent,
            targetGroup: targetGroup,
            period: selectedPeriod
        });

        if (data.result === "success") {
            // Server'dan zaten descending (en yeni en üstte) geliyor, reverse() gereksiz veya hataya sebep olabilir
            allEvaluationsData = data.evaluations;
            if (silent) return; // Silent mode ise burada bitir (veri yüklendi)
            listEl.innerHTML = '';

            // Sadece normal değerlendirmeleri filtrele ve göster
            const normalEvaluations = allEvaluationsData.filter(e => !String(e.callId).toUpperCase().startsWith('MANUEL-'));

            // Dönem filtresini uygula (seçili ay / yıl)
            let filteredEvaluations = normalEvaluations;
            const periodSelectForList = document.getElementById('q-eval-month');
            const selectedPeriodForList = periodSelectForList ? periodSelectForList.value : null;
            if (selectedPeriodForList) {
                filteredEvaluations = normalEvaluations.filter(e => {
                    const dateVal = e.callDate || e.date; // CallDate'e öncelik verilmeli (Bug 5 Fix)
                    if (!dateVal) return false;
                    const parts = String(dateVal).split('.');
                    if (parts.length < 3) {
                        // ISO format fallback (YYYY-MM-DD ...)
                        const d = new Date(dateVal);
                        if (!isNaN(d)) {
                            const m = String(d.getMonth() + 1).padStart(2, '0');
                            const y = d.getFullYear();
                            return `${m}.${y}` === selectedPeriodForList;
                        }
                        return false;
                    }
                    const monthYear = `${parts[1].padStart(2, '0')}.${parts[2].split(' ')[0]}`;
                    return monthYear === selectedPeriodForList;
                });
            }


            // Dinleme tarihine göre kronolojik (DESC) sırala
            const parseEvalDate = (e) => {
                const v = (e.date || e.callDate || '').toString().trim();
                if (!v) return 0;
                // dd.MM.yyyy
                const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
                if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`).getTime();
                const d = new Date(v);
                return isNaN(d) ? 0 : d.getTime();
            };
            filteredEvaluations.sort((a, b) => parseEvalDate(b) - parseEvalDate(a));

            if (filteredEvaluations.length === 0) {
                listEl.innerHTML = '<p style="padding:20px; text-align:center; color:#666;">Kayıt yok.</p>';
                return;
            }

            let listElBuffer = "";
            filteredEvaluations.forEach((evalItem, index) => {
                const scoreColor = evalItem.score >= 90 ? '#2f855a' : (evalItem.score >= 70 ? '#ed8936' : '#e53e3e');
                const scoreBg = evalItem.score >= 90 ? '#f0fff4' : (evalItem.score >= 70 ? '#fffaf0' : '#fff5f5');
                const scoreCircleColor = evalItem.score >= 90 ? '#48bb78' : (evalItem.score >= 70 ? '#ed8936' : '#f56565');

                let editBtn = isAdminMode ? `<i class="fas fa-pen" style="font-size:0.9rem; color:#718096; cursor:pointer; transition:0.2s;" onmouseover="this.style.color='#3182ce'" onmouseout="this.style.color='#718096'" onclick="event.stopPropagation(); editEvaluation('${evalItem.callId}')"></i>` : '';

                const baseAgent = escapeHtml(evalItem.agent || '');
                const altNameRaw = (evalItem.agentName != null) ? String(evalItem.agentName).trim() : '';
                const showAltName = altNameRaw && altNameRaw !== String(evalItem.agent || '').trim();
                let agentNameDisplay = (targetAgent === 'all' || targetAgent === targetGroup) && showAltName
                    ? `<span style="font-size:0.75rem; font-weight:700; color:#4a5568; background:#edf2f7; padding:2px 8px; border-radius:12px; margin-left:8px;">${escapeHtml(altNameRaw)}</span>`
                    : '';

                // Detay HTML oluşturma (V2 Compact Grid)
                let detailTableHtml = '';
                try {
                    let detailObj = evalItem.details;
                    if (typeof detailObj === 'string') {
                        detailObj = JSON.parse(detailObj);
                    }
                    if (Array.isArray(detailObj)) {
                        detailTableHtml = '<div class="eval-row-grid-v2">';
                        detailObj.forEach(item => {
                            let isFailed = item.score < item.max;
                            let noteDisplay = item.note ? `<div class="eval-note-v2" style="margin-top:4px; font-size:0.75rem;"><i class="fas fa-sticky-note"></i> ${item.note}</div>` : '';
                            detailTableHtml += `
                            <div class="eval-crit-card-v2 ${isFailed ? 'failed' : 'success'}">
                                <div class="eval-crit-text-v2">
                                    ${escapeHtml(item.q)}
                                    ${noteDisplay}
                                </div>
                                <div class="eval-crit-val-v2" style="color: ${isFailed ? '#ef4444' : '#10b981'}">
                                    ${item.score} / ${item.max}
                                </div>
                            </div>`;
                        });
                        detailTableHtml += '</div>';
                    } else {
                        detailTableHtml = `<div class="eval-feedback-box-v2">${(typeof evalItem.details === "object" ? escapeHtml(JSON.stringify(evalItem.details)) : escapeHtml(String(evalItem.details)))}</div>`;
                    }
                } catch (e) {
                    console.error("Detail parse error:", e);
                    detailTableHtml = `<div class="eval-feedback-box-v2">${(typeof evalItem.details === "object" ? escapeHtml(JSON.stringify(evalItem.details)) : escapeHtml(String(evalItem.details)))}</div>`;
                }

                const callDateDisplay = evalItem.callDate && evalItem.callDate !== 'N/A' ? evalItem.callDate : 'N/A';
                const listenDateDisplay = evalItem.date || evalItem.callDate || 'N/A';

                const isSeen = evalItem.isSeen;
                const agentNote = evalItem.agentNote || '';
                const managerReply = evalItem.managerReply || '';
                const status = evalItem.status || 'Tamamlandı';

                // Interaction HTML (V2)
                let interactionHtml = '';
                if (!isAdminMode) {
                    if (status !== 'Kapatıldı') {
                        interactionHtml += `
                         <div style="margin-top:20px; display:flex; justify-content:flex-end;">
                            <button class="eval-action-btn-v2 btn-warning-v2" 
                               onclick='event.stopPropagation(); openAgentNotePopup(${JSON.stringify(evalItem.callId)}, ${JSON.stringify(scoreCircleColor)})'>
                               <i class="fas fa-comment-dots"></i> Görüş / Not Ekle
                            </button>
                         </div>`;
                    }
                } else {
                    // Sadece Yönetici veya LocAdmin yanıtlayabilir
                    if (agentNote && status !== 'Kapatıldı') {
                        interactionHtml += `
                         <div style="margin-top:20px; display:flex; justify-content:flex-end;">
                            <button class="eval-action-btn-v2 btn-primary-v2" 
                               onclick='event.stopPropagation(); openAdminReplyPopup(${JSON.stringify(evalItem.id)}, ${JSON.stringify(evalItem.callId)}, ${JSON.stringify(evalItem.agent || "")}, ${JSON.stringify(agentNote || "")})'>
                               <i class="fas fa-reply"></i> Yanıtla / Kapat
                            </button>
                         </div>`;
                    }
                }

                // Interaction Bubbles (V2)
                let notesDisplay = '';
                if (agentNote || managerReply) {
                    notesDisplay += `<div class="eval-section-v2">
                        <div class="eval-section-title-v2"><i class="fas fa-comments"></i> Mesajlaşma</div>
                        <div class="eval-interaction-pane">`;
                    if (agentNote) {
                        notesDisplay += `<div class="eval-interaction-bubble bubble-agent">
                            <div class="bubble-header"><i class="fas fa-user-edit"></i> Temsilci Notu</div>
                            ${escapeHtml(agentNote)}
                        </div>`;
                    }
                    if (managerReply) {
                        notesDisplay += `<div class="eval-interaction-bubble bubble-manager" style="align-self: flex-end; border-bottom-left-radius: 12px;">
                            <div class="bubble-header"><i class="fas fa-user-shield"></i> Yönetici Cevabı</div>
                            ${escapeHtml(managerReply)}
                        </div>`;
                    }
                    notesDisplay += `</div></div>`;
                }

                const statusIconClass = isSeen ? 'seen' : 'unseen';
                const statusIcon = isSeen ? '<i class="fas fa-check-double"></i>' : '<i class="fas fa-eye-slash"></i>';
                const statusTitle = isSeen ? 'Görüldü' : 'Henüz Görülmedi';

                const statusBadge = status === 'Bekliyor'
                    ? `<span style="background:#fff3e0; color:#e65100; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:10px; margin-left:8px; border:1px solid #ffe0b2;">${status}</span>`
                    : '';

                listElBuffer += `
                <div class="eval-card-v2" id="eval-card-${index}" onclick="newToggleEvaluationDetail(${index}, '${evalItem.callId}', ${isSeen}, this)">
                    <div class="eval-card-main">
                        <div class="eval-card-left">
                            <div class="eval-score-orb" style="background:${scoreCircleColor}">
                                <span class="score-val">${evalItem.score}</span>
                                <span class="score-label">Puan</span>
                            </div>
                            <div class="eval-info-block">
                                <div class="eval-agent-name">
                                    ${baseAgent} ${agentNameDisplay} ${statusBadge}
                                </div>
                                <div class="eval-meta-row">
                                    <div class="eval-meta-item"><i class="fas fa-phone"></i> ${callDateDisplay}</div>
                                    <div class="eval-meta-item"><i class="fas fa-headphones"></i> ${listenDateDisplay}</div>
                                    <div class="eval-id-pill" onclick="event.stopPropagation(); copyText('${escapeHtml(evalItem.callId || '')}')" title="Kopyala">
                                        <i class="fas fa-hashtag"></i> ${escapeHtml(evalItem.callId || '')}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="eval-card-right">
                             ${editBtn}
                             <div class="eval-status-icon ${statusIconClass}" title="${statusTitle}">
                                ${statusIcon}
                             </div>
                        </div>
                    </div>
                    <div class="eval-details-pane-v2" id="eval-details-${index}">
                        <div class="eval-details-inner">
                            <div class="eval-grid-v2">
                                <div class="eval-left-col">
                                    <div class="eval-section-v2">
                                        <div class="eval-section-title-v2"><i class="fas fa-tasks"></i> Değerlendirme Kriterleri</div>
                                        ${detailTableHtml}
                                    </div>
                                </div>
                                <div class="eval-right-col">
                                    <div class="eval-section-v2">
                                        <div class="eval-section-title-v2"><i class="fas fa-bullhorn"></i> Feedback</div>
                                        <div class="eval-feedback-box-v2">
                                            ${evalItem.feedback || 'Geri bildirim belirtilmemiş.'}
                                        </div>
                                    </div>
                                    ${notesDisplay}
                                    ${interactionHtml}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            });
            listEl.innerHTML = listElBuffer;
        }
    } catch (err) {
        console.error(err);
        if (!silent) {
            listEl.innerHTML = `
            <div style="text-align:center; padding:40px; color:#666;">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; color:#e53e3e; margin-bottom:15px;"></i>
                <p style="font-weight:600;">Bağlantı Sorunu</p>
                <p style="font-size:0.9rem; margin-bottom:15px;">Veriler alınırken bir hata oluştu. Lütfen tekrar deneyin.</p>
                <button onclick="fetchEvaluationsForAgent()" class="q-btn-v2" style="background:var(--primary); color:white; border:none; padding:8px 20px; border-radius:6px; cursor:pointer;">
                    <i class="fas fa-sync"></i> Yeniden Dene
                </button>
            </div>`;
        }
    }
}

// Yeni Toggle Fonksiyonu (V2)
function newToggleEvaluationDetail(index, callId, isAlreadySeen, element) {
    const detailEl = document.getElementById(`eval-details-${index}`);
    const cardEl = document.getElementById(`eval-card-${index}`);

    const isExpanding = !cardEl.classList.contains('expanded');

    // Tüm diğerlerini kapat (Opsiyonel: Akordeon etkisi için)
    // document.querySelectorAll('.eval-card-v2.expanded').forEach(el => {
    //    if(el !== cardEl) { ... }
    // });

    if (isExpanding) {
        cardEl.classList.add('expanded');
        detailEl.style.maxHeight = detailEl.scrollHeight + "px";

        // OTOMATİK OKUNDU İŞARETLEME
        if (!isAlreadySeen && callId && !isAdminMode) {
            apiCall("markEvaluationSeen", { callId: callId });
            const statusIcon = cardEl.querySelector('.eval-status-icon');
            if (statusIcon) {
                statusIcon.classList.remove('unseen');
                statusIcon.classList.add('seen');
                statusIcon.innerHTML = '<i class="fas fa-check-double"></i>';
                statusIcon.title = 'Görüldü';
            }
        }
    } else {
        cardEl.classList.remove('expanded');
        detailEl.style.maxHeight = "0px";
    }
}

function updateAgentListBasedOnGroup() {
    const groupSelect = document.getElementById('q-admin-group');
    const agentSelect = document.getElementById('q-admin-agent');
    if (!groupSelect || !agentSelect) return;
    const selectedGroup = groupSelect.value;
    agentSelect.innerHTML = '';

    // STRICT: Sadece role='user' olanları al (Yönetici/LocAdmin gizle)
    let baseList = adminUserList.filter(u => String(u.role).toLowerCase() === 'user');
    let filteredUsers = baseList;

    if (selectedGroup !== 'all') {
        filteredUsers = baseList.filter(u => u.group === selectedGroup);
        agentSelect.innerHTML = `<option value="all">-- Tüm ${selectedGroup} Ekibi --</option>`;
    } else {
        agentSelect.innerHTML = `<option value="all">-- Tüm Temsilciler --</option>`;
    }
    filteredUsers.forEach(u => { agentSelect.innerHTML += `<option value="${u.name}">${u.name}</option>`; });
    fetchEvaluationsForAgent();
}
function fetchUserListForAdmin() {
    return new Promise((resolve) => {
        apiCall("getUserList", {}).then(data => {
            if (data.result === "success") {
                // Sadece rütbesi 'user' veya 'qusers' olanları (temsilcileri) göster
                // Yönetim grubunu ve Admin/LocAdmin rütbelerini listeden temizle
                const allowedWords = ['chat', 'istchat', 'satış', 'satis', 'telesatis', 'telesatış'];
                adminUserList = data.users.filter(u => {
                    if (!u.group) return false;
                    const r = String(u.role || '').toLowerCase().trim();
                    const g = String(u.group).toLowerCase().trim();
                    const isStaff = (r === 'user');
                    const isAllowedGroup = allowedWords.some(w => g.includes(w));
                    return isStaff && isAllowedGroup;
                });
                resolve(adminUserList);
            }
            else resolve([]);
        }).catch(err => resolve([]));
    });
}
function fetchCriteria(groupName) {
    return new Promise((resolve) => {
        apiCall("getCriteria", { group: groupName }).then(data => {
            if (data.result === "success") resolve(data.criteria || []); else resolve([]);
        }).catch(err => resolve([]));
    });
}
function toggleEvaluationDetail(index, callId, isAlreadySeen, element) {
    const detailEl = document.getElementById(`eval-details-${index}`);

    // Aç/Kapa Mantığı
    if (detailEl.style.maxHeight && detailEl.style.maxHeight !== '0px') {
        detailEl.style.maxHeight = '0px';
        detailEl.style.marginTop = '0';
    } else {
        detailEl.style.maxHeight = detailEl.scrollHeight + 500 + 'px';
        detailEl.style.marginTop = '10px';

        // OTOMATİK OKUNDU İŞARETLEME
        // Eğer daha önce görülmemişse, şu an açılıyorsa ve ADMİN DEĞİLSE
        if (!isAlreadySeen && callId && !isAdminMode) {
            // Backend'e hissettirmeden istek at
            apiCall("markEvaluationSeen", { callId: callId });

            // Görsel olarak 'Yeni' etiketini kaldır (Varsa)
            const badge = document.getElementById(`badge-new-${index}`);
            if (badge) badge.style.display = 'none';

            // HTML içindeki onclick parametresini güncelle (tekrar istek atmasın diye)
            // element (tıklanan satır) üzerinden yapılabilir ama basitlik için global state veya reload beklenir.
            // En temiz yöntem: Bu oturumda tekrar tetiklenmemesi için flag koymak ama isAlreadySeen parametresi sabit string geliyor.
            // Neyse, mükerrer istek backende gitse de sorun değil, backend handle eder.
        }
    }
}
async function exportEvaluations() {
    if (!isAdminMode) return;

    // Son 12 ayın listesini oluştur
    let periodOptions = `<option value="all">Tüm Zamanlar</option>`;
    const d = new Date();
    for (let i = 0; i < 12; i++) {
        let title = d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
        let val = (d.getMonth() + 1).toString().padStart(2, '0') + "-" + d.getFullYear(); // "01-2026"
        periodOptions += `<option value="${val}">${title}</option>`;
        d.setMonth(d.getMonth() - 1);
    }

    const { value: selectedPeriod } = await Swal.fire({
        title: 'Rapor İndir',
        html: `
            <p style="font-size:0.9rem; color:#666; margin-bottom:15px;">Hangi dönem için rapor almak istersiniz?</p>
            <select id="swal-export-period" class="swal2-input" style="width:80%; margin:0 auto;">
                ${periodOptions}
            </select>
        `,
        showCancelButton: true,
        confirmButtonText: 'İndir',
        cancelButtonText: 'Vazgeç',
        preConfirm: () => {
            return document.getElementById('swal-export-period').value;
        }
    });

    if (!selectedPeriod) return; // Vazgeçildi

    const groupSelect = document.getElementById('q-admin-group');
    const agentSelect = document.getElementById('q-admin-agent');

    Swal.fire({ title: 'Rapor Hazırlanıyor...', html: 'Veriler işleniyor, lütfen bekleyin.<br>Bu işlem veri yoğunluğuna göre biraz sürebilir.', didOpen: () => Swal.showLoading() });

    Swal.fire({ title: 'Rapor Hazırlanıyor...', html: 'Veriler işleniyor, lütfen bekleyin.<br>Bu işlem veri yoğunluğuna göre biraz sürebilir.', didOpen: () => Swal.showLoading() });

    apiCall("exportEvaluations", {
        targetAgent: agentSelect ? agentSelect.value : 'all',
        targetGroup: groupSelect ? groupSelect.value : 'all',
        targetPeriod: selectedPeriod
    }).then(data => {
        if (data.result === "success" && data.data) {

            // --- EXCEL OLUŞTURUCU (HTML TABLE YÖNTEMİ) ---
            const headers = data.headers;
            const rows = data.data;

            // 1. İstatistik Hesapla
            let totalScore = 0;
            let count = rows.length;
            let maxScore = 0;
            let minScore = 100;

            rows.forEach(r => {
                let s = parseFloat(r[5]) || 0; // 5. index Puan
                totalScore += s;
                if (s > maxScore) maxScore = s;
                if (s < minScore) minScore = s;
            });
            let avg = count > 0 ? (totalScore / count).toFixed(2) : 0;

            // 2. Özet Tablosu HTML
            let excelHtml = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="utf-8"></head>
            <body>
            <h2 style="font-family:Arial">Kalite Değerlendirme Raporu</h2>
            <table border="1" style="border-collapse:collapse; font-family:Arial; font-size:12px; margin-bottom:20px;">
                <tr style="background-color:#E0E0E0; font-weight:bold;">
                    <td colspan="2" style="padding:10px; font-size:14px;">Yönetici Özeti</td>
                </tr>
                <tr><td><strong>Rapor Tarihi:</strong></td><td>${new Date().toLocaleDateString()}</td></tr>
                <tr><td><strong>Toplam Kayıt:</strong></td><td>${count}</td></tr>
                <tr><td><strong>Genel Ortalama:</strong></td><td style="font-size:14px; font-weight:bold; color:${avg >= 85 ? 'green' : (avg < 70 ? 'red' : 'orange')}">${avg}</td></tr>
                <tr><td><strong>En Yüksek Puan:</strong></td><td>${maxScore}</td></tr>
                <tr><td><strong>En Düşük Puan:</strong></td><td>${minScore}</td></tr>
            </table>

            <br>

            <table border="1" style="border-collapse:collapse; font-family:Arial; font-size:11px;">
                <thead>
                    <tr style="background-color:#2c3e50; color:white; height:30px;">
                        ${headers.map(h => `<th style="padding:5px; white-space:nowrap;">${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
            `;

            // 3. Detay Satırları
            rows.forEach(r => {
                // Puan Renklendirme (Index 5)
                let score = r[5];
                let scoreStyle = "";
                if (score >= 90) scoreStyle = "background-color:#C6EFCE; color:#006100; font-weight:bold;";
                else if (score < 70) scoreStyle = "background-color:#FFC7CE; color:#9C0006; font-weight:bold;";
                else scoreStyle = "background-color:#FFEB9C; color:#9C6500;";

                // Durum Renklendirme (Index 7: Durum)
                let status = r[7];
                let statusStyle = "";
                if (status === "İncelemede") statusStyle = "background-color:#FFF2CC; font-weight:bold;";

                // Satır Oluştur
                excelHtml += `<tr>`;
                r.forEach((cell, idx) => {
                    let cellStyle = "padding:5px; vertical-align:top;";
                    if (idx === 5) cellStyle += scoreStyle; // Puan
                    if (idx === 7) cellStyle += statusStyle; // Durum

                    // Metin Hücreleri (Notlar, Cevaplar)
                    let val = (cell === null || cell === undefined) ? "" : String(cell);
                    excelHtml += `<td style="${cellStyle} mso-number-format:'\@';">${val}</td>`;
                });
                excelHtml += `</tr>`;
            });

            excelHtml += `</tbody></table></body></html>`;

            // 4. İndirme Tetikle
            const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", data.fileName || "Rapor.xls");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            Swal.fire({ icon: 'success', title: 'Rapor İndirildi', text: 'Excel dosyası hazırlandı.', timer: 1500, showConfirmButton: false });

        } else { Swal.fire('Hata', data.message || 'Veri alınamadı.', 'error'); }
    }).catch(e => {
        console.error(e);
        Swal.fire('Hata', 'Sunucu hatası oluştu.', 'error');
    });
}
// --- EVALUATION POPUP & EDIT ---
async function logEvaluationPopup() {
    const agentSelect = document.getElementById('q-admin-agent');
    const agentName = agentSelect ? agentSelect.value : "";

    if (!agentName || agentName === 'all') { Swal.fire('Uyarı', 'Lütfen listeden bir temsilci seçiniz.', 'warning'); return; }

    let agentGroup = 'Genel';
    const foundUser = adminUserList.find(u => u.name.toLowerCase() === agentName.toLowerCase());
    if (foundUser && foundUser.group) { agentGroup = foundUser.group; }

    // Güçlü Normalizasyon
    const cleanGroup = agentGroup.toLowerCase()
        .replace(/i̇/g, 'i').replace(/ı/g, 'i').replace(/ş/g, 's')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();

    const isChat = cleanGroup.includes('chat') || cleanGroup === 'ob' || cleanGroup.includes('canli');
    const isTelesatis = cleanGroup.includes('telesat') || cleanGroup.includes('satis') || cleanGroup.includes('sales');

    let criteriaGroup = agentGroup;
    if (isChat) criteriaGroup = 'Chat';
    else if (isTelesatis) criteriaGroup = 'Telesatış';

    Swal.fire({ title: 'Hazırlanıyor...', didOpen: () => Swal.showLoading() });
    let criteriaList = [];
    if (criteriaGroup && criteriaGroup !== 'Genel') { criteriaList = await fetchCriteria(criteriaGroup); }
    Swal.close();

    const isCriteriaBased = criteriaList.length > 0;
    let criteriaFieldsHtml = '';

    if (isCriteriaBased) {
        criteriaFieldsHtml += `<div class="criteria-list-v2">`;
        criteriaList.forEach((c, i) => {
            let pts = parseInt(c.points) || 0;
            if (pts === 0) return;
            const fullText = escapeForJsString(c.text);

            if (isChat) {
                let mPts = parseInt(c.mediumScore) || 0; let bPts = parseInt(c.badScore) || 0;
                criteriaFieldsHtml += `
                    <div class="criteria-item-v2" id="criteria-${i}" data-max-score="${pts}" data-current-score="${pts}">
                        <div class="criteria-top">
                            <span class="criteria-name" title="${fullText}">${i + 1}. ${c.text}</span>
                            <span class="criteria-max">Maks: ${pts} Puan</span>
                        </div>
                        <div class="criteria-actions">
                            <div class="eval-btn-group-v2">
                                <button class="eval-btn-v2 active good" data-score="${pts}" onclick="v2_setScore(${i}, ${pts}, ${pts}, 'good')">İyi</button>
                                ${mPts > 0 ? `<button class="eval-btn-v2 medium" data-score="${mPts}" onclick="v2_setScore(${i}, ${mPts}, ${pts}, 'medium')">Orta</button>` : ''}
                                <button class="eval-btn-v2 bad" data-score="${bPts}" onclick="v2_setScore(${i}, ${bPts}, ${pts}, 'bad')">Kötü</button>
                            </div>
                        </div>
                        <div class="criteria-note-row" id="note-row-${i}" style="display:none; margin-top:8px;">
                            <input type="text" id="note-${i}" class="eval-input-v2" placeholder="Durum notu ekleyin..." style="width:100%; height:34px; font-size:0.85rem;">
                        </div>
                    </div>`;
            } else if (isTelesatis) {
                criteriaFieldsHtml += `
                    <div class="criteria-item-v2" id="criteria-${i}" data-max-score="${pts}" data-current-score="${pts}">
                        <div class="criteria-top">
                            <span class="criteria-name" title="${fullText}">${i + 1}. ${c.text}</span>
                            <span class="criteria-max" id="val-${i}">${pts} / ${pts}</span>
                        </div>
                        <div class="criteria-actions">
                            <input type="range" class="custom-range" id="slider-${i}" min="0" max="${pts}" value="${pts}" 
                                   oninput="v2_updateSlider(${i}, ${pts})" style="width:100%;">
                        </div>
                        <div class="criteria-note-row" id="note-row-${i}" style="display:none; margin-top:8px;">
                            <input type="text" id="note-${i}" class="eval-input-v2" placeholder="Eksik/Gelişim notu..." style="width:100%; height:34px; font-size:0.85rem;">
                        </div>
                    </div>`;
            }
        });
        criteriaFieldsHtml += `</div>`;
    }

    const contentHtml = `
        <div class="eval-modal-v2">
            <div class="eval-form-header">
                <div class="eval-form-user">
                    <div class="eval-form-avatar">${agentName.charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="font-size:0.8rem; color:#718096; font-weight:700;">DEĞERLENDİRİLEN</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#2d3748;">${agentName}</div>
                    </div>
                </div>
                <div class="eval-form-score-box">
                    <div class="eval-form-score-val" id="v2-live-score">100</div>
                    <div class="eval-form-score-label">TOPLAM PUAN</div>
                </div>
            </div>

            <div class="eval-form-grid">
                <div class="eval-input-group">
                    <label>Call ID <span style="color:#e53e3e">*</span></label>
                    <input id="eval-callid" class="eval-input-v2" placeholder="Örn: 123456">
                </div>
                <div class="eval-input-group">
                    <label>Çağrı Tarihi</label>
                    <input type="date" id="eval-calldate" class="eval-input-v2" value="${new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().substring(0, 10)}">
                </div>
            </div>

            ${isCriteriaBased ? criteriaFieldsHtml : `
                <div style="padding:20px; background:#f8fafc; border:1px dashed #cbd5e0; border-radius:12px; text-align:center; margin-bottom:20px;">
                    <label style="display:block; margin-bottom:8px; font-weight:700;">Manuel Puan</label>
                    <input id="eval-manual-score" type="number" class="eval-input-v2" value="100" min="0" max="100" style="width:80px; text-align:center; font-size:1.2rem; font-weight:800;">
                </div>
                <div class="eval-input-group" style="margin-bottom:20px;">
                    <label>Değerlendirme Detayları</label>
                    <textarea id="eval-details" class="eval-input-v2" style="height:100px;" placeholder="Detaylı analizlerinizi buraya yazın..."></textarea>
                </div>
            `}

            <div class="eval-form-grid" style="margin-bottom:15px;">
                <div class="eval-input-group">
                    <label>Geri Bildirim Tipi</label>
                    <select id="feedback-type" class="eval-input-v2">
                        <option value="Yok" selected>Yok</option>
                        <option value="Sözlü">Sözlü</option>
                        <option value="Mail">Mail</option>
                    </select>
                </div>
            </div>

            <div class="eval-input-group">
                <label>Genel Geri Bildirim / Koçluk Notu</label>
                <textarea id="eval-feedback" class="eval-input-v2" style="height:80px;" placeholder="Temsilciye iletilecek gelişim mesajı..."></textarea>
            </div>
        </div>`;


    const { value: formValues } = await Swal.fire({
        html: contentHtml,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: ' 💾  Kaydet',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
            if (isTelesatis) window.recalcTotalSliderScore();
            else if (isChat) window.recalcTotalScore();
        },
        preConfirm: () => {
            const callId = document.getElementById('eval-callid').value.trim();
            if (!callId) {
                Swal.showValidationMessage('Call ID alanı boş bırakılamaz!');
                return false;
            }

            const callDateRaw = document.getElementById('eval-calldate').value;
            // DÜZELTME: Backend TIMESTAMP bekliyor. DD.MM.YYYY'ye ÇEVİRME!
            // Input'tan gelen YYYY-MM-DD formatını direkt kullan ve saat ekle.
            const formattedCallDate = callDateRaw ? `${callDateRaw}T00:00:00` : new Date().toISOString();

            if (isCriteriaBased) {
                let total = 0; let detailsArr = [];
                for (let i = 0; i < criteriaList.length; i++) {
                    const c = criteriaList[i]; if (parseInt(c.points) === 0) continue;
                    let val = 0; let note = document.getElementById(`note-${i}`).value;

                    const itemEl = document.getElementById(`criteria-${i}`);
                    if (isChat) {
                        const activeBtn = itemEl.querySelector('.eval-btn-v2.active');
                        val = activeBtn ? parseInt(activeBtn.getAttribute('data-score')) : 0;
                    } else if (isTelesatis) {
                        val = parseInt(document.getElementById(`slider-${i}`).value) || 0;
                    }
                    total += val; detailsArr.push({ q: c.text, max: parseInt(c.points), score: val, note: note });
                }
                return { agentName, agentGroup, callId, callDate: formattedCallDate, score: total, details: JSON.stringify(detailsArr), feedback: document.getElementById('eval-feedback').value, feedbackType: document.getElementById('feedback-type').value, status: 'Tamamlandı' };
            } else {
                return { agentName, agentGroup, callId, callDate: formattedCallDate, score: parseInt(document.getElementById('eval-manual-score').value), details: document.getElementById('eval-details').value, feedback: document.getElementById('eval-feedback').value, feedbackType: document.getElementById('feedback-type').value, status: 'Tamamlandı' };
            }
        }
    });
    if (formValues) {
        Swal.fire({ title: 'Kaydediliyor...', didOpen: () => Swal.showLoading() });
        apiCall("logEvaluation", { ...formValues })
            .then(d => {
                if (d.result === "success") {
                    Swal.fire({ icon: 'success', title: 'Kaydedildi', timer: 1500, showConfirmButton: false });
                    // DÜZELTME: Hem evaluations hem de feedback logs güncellenmeli
                    fetchEvaluationsForAgent(formValues.agentName);
                    fetchFeedbackLogs().then(() => {
                        loadFeedbackList();
                    });
                } else {
                    Swal.fire('Hata', d.message, 'error');
                }
            });
    }
}
async function editEvaluation(targetCallId) {
    const evalData = allEvaluationsData.find(item => String(item.callId).trim() === String(targetCallId).trim());
    if (!evalData) { Swal.fire('Hata', 'Kayıt bulunamadı.', 'error'); return; }

    const agentName = evalData.agent;
    const agentGroup = evalData.group || 'Genel';

    const cleanGroup = agentGroup.toLowerCase()
        .replace(/i̇/g, 'i').replace(/ı/g, 'i').replace(/ş/g, 's')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();

    const isChat = cleanGroup.includes('chat') || cleanGroup === 'ob';
    const isTelesatis = cleanGroup.includes('telesat');

    let criteriaGroup = agentGroup;
    if (isChat) criteriaGroup = 'Chat';
    else if (isTelesatis) criteriaGroup = 'Telesatış';

    Swal.fire({ title: 'İnceleniyor...', didOpen: () => Swal.showLoading() });
    let criteriaList = [];
    if (criteriaGroup && criteriaGroup !== 'Genel') criteriaList = await fetchCriteria(criteriaGroup);
    Swal.close();

    const isCriteriaBased = criteriaList.length > 0;
    let oldDetails = evalData.details;
    if (typeof oldDetails === 'string') {
        try { oldDetails = JSON.parse(oldDetails || "[]"); } catch (e) { oldDetails = []; }
    }
    if (!Array.isArray(oldDetails)) oldDetails = [];

    let safeDateVal = "";
    if (evalData.callDate) {
        // DB'den TIMESTAMP (ISO) gelirse: 2026-01-21T00:00... -> 2026-01-21 al
        if (String(evalData.callDate).includes('T')) {
            safeDateVal = evalData.callDate.split('T')[0];
        }
        // DB'den Text (DD.MM.YYYY) gelirse -> YYYY-MM-DD çevir
        else if (String(evalData.callDate).includes('.')) {
            let parts = evalData.callDate.split('.');
            if (parts.length === 3) safeDateVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else {
            safeDateVal = evalData.callDate;
        }
    }

    let criteriaFieldsHtml = '';
    if (isCriteriaBased) {
        criteriaFieldsHtml += `<div class="criteria-list-v2">`;
        criteriaList.forEach((c, i) => {
            let pts = parseInt(c.points) || 0; if (pts === 0) return;
            const fullText = escapeForJsString(c.text);
            const currentCriterionText = String(c.text || '').trim().toLowerCase();
            let oldItem = oldDetails.find(d => String(d.q || d.text || '').trim().toLowerCase() === currentCriterionText)
                || (oldDetails[i] ? oldDetails[i] : { score: pts, note: '' });

            // cVal'ın sayı olduğundan emin olalım, eğer bulunamazsa veya hatalıysa varsayılan (max) puanı verelim
            let savedScore = oldItem.score !== undefined ? oldItem.score : (oldItem.points !== undefined ? oldItem.points : pts);
            let cVal = parseInt(savedScore);
            if (isNaN(cVal)) cVal = pts;
            let cNote = oldItem.note || '';

            if (isChat) {
                let mPts = parseInt(c.mediumScore) || 0; let bPts = parseInt(c.badScore) || 0;
                let gAct = cVal === pts ? 'active' : '';
                let mAct = (cVal === mPts && mPts !== 0) ? 'active' : '';
                let bAct = (cVal === bPts || (cVal === 0 && bPts === 0)) ? 'active' : '';
                criteriaFieldsHtml += `
                    <div class="criteria-item-v2 ${cVal < pts ? 'failed' : ''}" id="criteria-${i}" data-max-score="${pts}">
                        <div class="criteria-top"><span class="criteria-name" title="${fullText}">${i + 1}. ${c.text}</span><span class="criteria-max">Maks: ${pts} Puan</span></div>
                        <div class="criteria-actions">
                            <div class="eval-btn-group-v2">
                                <button type="button" class="eval-btn-v2 ${gAct} good" data-score="${pts}" onclick="v2_setScore(${i}, ${pts}, ${pts}, 'good')">İyi</button>
                                ${mPts > 0 ? `<button type="button" class="eval-btn-v2 ${mAct} medium" data-score="${mPts}" onclick="v2_setScore(${i}, ${mPts}, ${pts}, 'medium')">Orta</button>` : ''}
                                <button type="button" class="eval-btn-v2 ${bAct} bad" data-score="${bPts}" onclick="v2_setScore(${i}, ${bPts}, ${pts}, 'bad')">Kötü</button>
                            </div>
                        </div>
                        <div class="criteria-note-row" id="note-row-${i}" style="display:${cVal < pts ? 'block' : 'none'}; margin-top:8px;">
                             <input type="text" id="note-${i}" class="eval-input-v2" value="${cNote}" placeholder="Not ekle..." style="width:100%; height:32px; padding:4px 10px; font-size:0.8rem;">
                        </div>
                    </div>`;
            } else if (isTelesatis) {
                criteriaFieldsHtml += `
                    <div class="criteria-item-v2 ${cVal < pts ? 'failed' : ''}" id="criteria-${i}" data-max-score="${pts}">
                        <div class="criteria-top"><span class="criteria-name" title="${fullText}">${i + 1}. ${c.text}</span><span class="criteria-max" id="val-${i}">${cVal} / ${pts}</span></div>
                        <div class="criteria-actions" style="flex-wrap: wrap;">
                            <input type="range" class="custom-range" id="slider-${i}" min="0" max="${pts}" value="${cVal}" oninput="v2_updateSlider(${i}, ${pts})" style="width:100%;">
                        </div>
                        <div class="criteria-note-row" id="note-row-${i}" style="display:${cVal < pts ? 'block' : 'none'}; margin-top:8px; width: 100%;">
                            <input type="text" id="note-${i}" class="eval-input-v2" value="${cNote}" placeholder="Not..." style="width:100%; height:32px; padding:4px 10px; font-size:0.8rem;">
                        </div>
                    </div>`;
            }
        });
        criteriaFieldsHtml += `</div>`;
    }

    const contentHtml = `
        <div class="eval-modal-v2">
            <div class="eval-form-header" style="border-bottom-color:#1976d2;"><div class="eval-form-user"><div class="eval-form-avatar" style="background:#1976d2;">${agentName.charAt(0).toUpperCase()}</div><div><div style="font-size:0.8rem; color:#718096; font-weight:700;">DÜZENLENEN</div><div style="font-size:1.1rem; font-weight:800; color:#1976d2;">${agentName}</div></div></div><div class="eval-form-score-box"><div class="eval-form-score-val" id="v2-live-score">${evalData.score}</div><div class="eval-form-score-label">MEVCUT PUAN</div></div></div>
            <div class="eval-form-grid" style="background:#f0f7ff; border:1px solid #cde4ff;"><div class="eval-input-group"><label>Call ID</label><input id="eval-callid" class="eval-input-v2" value="${evalData.callId}"></div><div class="eval-input-group"><label>Çağrı Tarihi</label><input type="date" id="eval-calldate" class="eval-input-v2" value="${safeDateVal}"></div></div>
            <div style="margin:15px 0; font-weight:800; font-size:0.9rem; color:#4a5568;"><i class="fas fa-edit" style="color:#1976d2;"></i> KRİTERLERİ GÜNCELLE</div>
            ${isCriteriaBased ? criteriaFieldsHtml : `<div style="padding:20px; background:#f8fafc; border:1px dashed #cbd5e0; border-radius:12px; text-align:center; margin-bottom:20px;"><label style="display:block; margin-bottom:8px; font-weight:700;">Manuel Puan</label><input id="eval-manual-score" type="number" class="eval-input-v2" value="${evalData.score}" min="0" max="100" style="width:80px; text-align:center;"></div><textarea id="eval-details" class="eval-input-v2" style="height:100px;">${typeof evalData.details === 'string' ? evalData.details : ''}</textarea>`}
            <div class="eval-input-group"><label>Revize Feedback / Notlar</label><textarea id="eval-feedback" class="eval-input-v2" style="height:100px;">${evalData.feedback || ''}</textarea></div>
        </div>`;

    const { value: formValues } = await Swal.fire({
        html: contentHtml, width: '600px', showCancelButton: true, confirmButtonText: ' 💾  Değişiklikleri Kaydet', allowOutsideClick: false, allowEscapeKey: false,
        didOpen: () => { window.v2_recalc(); },
        preConfirm: () => {
            const callId = document.getElementById('eval-callid').value;
            const rawDate = document.getElementById('eval-calldate').value;
            let callDate = rawDate;

            // Güvenlik: YYYY-MM-DD gelirse, sonuna saat ekleyip tam Timestamp yapalım
            if (callDate && callDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                callDate = `${callDate}T00:00:00`;
            }
            // Yedek: Eğer DD.MM.YYYY formatındaysa (bazı tarayıcılar vs.) çevir
            else if (callDate && callDate.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                const p = callDate.split('.');
                callDate = `${p[2]}-${p[0]}-${p[1]}T00:00:00`; // YYYY-MM-DD
            }
            const feedback = document.getElementById('eval-feedback').value;
            if (isCriteriaBased) {
                let total = 0; let detailsArr = [];
                for (let i = 0; i < criteriaList.length; i++) {
                    const c = criteriaList[i]; if (parseInt(c.points) === 0) continue;
                    let val = 0; let note = document.getElementById(`note-${i}`).value;
                    const itemEl = document.getElementById(`criteria-${i}`);
                    const slider = itemEl.querySelector('input[type="range"]');
                    if (slider) val = parseInt(slider.value) || 0;
                    else { const activeBtn = itemEl.querySelector('.eval-btn-v2.active'); val = activeBtn ? parseInt(activeBtn.getAttribute('data-score')) : 0; }
                    total += val; detailsArr.push({ q: c.text, max: parseInt(c.points), score: val, note: note });
                }
                return { id: evalData.id, agentName, callId, callDate, score: total, details: JSON.stringify(detailsArr), feedback, status: evalData.status || 'Tamamlandı' };
            } else {
                return { id: evalData.id, agentName, callId, callDate, score: parseInt(document.getElementById('eval-manual-score').value), details: document.getElementById('eval-details').value, feedback, status: evalData.status || 'Tamamlandı' };
            }
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Güncelleniyor...', didOpen: () => Swal.showLoading() });
        apiCall("updateEvaluation", { ...formValues }).then(d => {
            if (d.result === "success") {
                Swal.fire({ icon: 'success', title: 'Güncellendi', timer: 1500, showConfirmButton: false });
                fetchEvaluationsForAgent(agentName);
                fetchFeedbackLogs().then(() => { loadFeedbackList(); });
            } else { Swal.fire('Hata', d.message, 'error'); }
        });
    }
}




/* =========================================================
   ANA SAYFA + TEKNİK + TELESATIŞ (FULLSCREEN) GÜNCELLEMESİ
   ========================================================= */

const TELESales_OFFERS_FALLBACK = [{ "offer": "YILLIK - 1299 TL", "segment": "WİNBACK", "description": "Kullanıcı daha önce aylık ya da yıllık herhangi bir paket kullanmış, ardından paket sonlanmış ve şu anda aktif paketi olmayan kullanıcıları aradığımız bir data", "note": "Kullanıcının izleme geçmişi olabilir." }, { "offer": "AYLIK  - 6 AY 109 TL", "segment": "WİNBACK", "description": "Kullanıcı daha önce aylık ya da yıllık herhangi bir paket kullanmış, ardından paket sonlanmış ve şu anda aktif paketi olmayan kullanıcıları aradığımız bir data", "note": "Kullanıcının izleme geçmişi olabilir." }, { "offer": "YILLIK - 1399 TL", "segment": "CANCELLİNG", "description": "Aboneliğinde iptal talebinde bulunmuş, paket süresi bitimine kadar erişime devam eden, geri kazanım için aradığımız bir data", "note": "Kullanıcının izleme geçmişi olabilir. İndirim oranı yüksek + Kullanıcının bir iptal nedeni olabilir" }, { "offer": "AYLIK  - 6 AY 119 TL", "segment": "CANCELLİNG", "description": "Aboneliğinde iptal talebinde bulunmuş, paket süresi bitimine kadar erişime devam eden, geri kazanım için aradığımız bir data", "note": "Kullanıcının izleme geçmişi olabilir. İndirim oranı yüksek + Kullanıcının bir iptal nedeni olabilir" }, { "offer": "YILLIK - 1499 TL", "segment": "ACTİVE GRACE", "description": "Paket yenileme sürecine giren fakat ücret alınamadığı için paketi yenilenemeyen kullanıcıları aradığımız bir data", "note": "Paket yenileme sürecinden bir ödeme sorunu oluştuğunu bu nedenle aboneliğinin yenilenmediğini, kullanıcıya hem bu sorunu çözmek hem de indirimli fiyatlar üzerinden yardımcı olmak +İçerik" }, { "offer": "AYLIK  - 6 AY 109 TL", "segment": "ACTİVE GRACE", "description": "Paket yenileme sürecine giren fakat ücret alınamadığı için paketi yenilenemeyen kullanıcıları aradığımız bir data", "note": "Paket yenileme sürecinden bir ödeme sorunu oluştuğunu bu nedenle aboneliğinin yenilenmediğini, kullanıcıya hem bu sorunu çözmek hem de indirimli fiyatlar üzerinden yardımcı olmak +İçerik" }, { "offer": "YILLIK - 1499 TL", "segment": "INBOUND", "description": "Inbound üzerinden gelen satın alma talepleri ya da satışa ikna edilen kullanıcılar için sunulan teklif", "note": "" }, { "offer": "AYLIK - 6 AY 139,5 TL", "segment": "INBOUND", "description": "Inbound üzerinden gelen satın alma talepleri ya da satışa ikna edilen kullanıcılar için sunulan teklif", "note": "" }];
const SPORTS_RIGHTS_FALLBACK = [{ "item": "Euroleague maçları ve stüdyo programları", "period": "2025-2026 / 2026- 2027 / 2027-2028 / 2028-2029", "note": "" }, { "item": "Bundesliga", "period": "2025-2026 / 2026- 2027 / 2027-2028 / 2028-2029", "note": "" }, { "item": "Bundesliga 2", "period": "2025-2026 / 2026- 2027 / 2027-2028 / 2028-2029", "note": "" }, { "item": "İspanya LaLiga önemli maçları", "period": "2025 - 2026 / 2026 - 2027", "note": "" }, { "item": "LaLiga 2 önemli maçları", "period": "2025 - 2026 / 2026 - 2027", "note": "" }, { "item": "İtalya Serie A önemli maçları", "period": "2025 - 2026 / 2026 - 2027", "note": "" }, { "item": "Portekiz Liga Portugal önemli maçları", "period": "2025 - 2026", "note": "" }, { "item": "Suudi Arabistan Pro Lig önemli maçları", "period": "2025-2026 / 2026- 2027 / 2027-2028 / 2028-2029", "note": "" }, { "item": "Hollanda Ligi", "period": "2025-2026 / 2026- 2027 / 2027-2028 / 2028-2029", "note": "" }, { "item": "İskoçya Premiership önemli maçları", "period": "2025 - 2026 / 2026 - 2027", "note": "" }, { "item": "NCAA Amerikan Futbol", "period": "2025 - 2026 / 2026 - 2027", "note": "" }, { "item": "NCAA Basketbol", "period": "2025 - 2026 / 2026 - 2027", "note": "" }, { "item": "NFL", "period": "2025 - 2026", "note": "" }, { "item": "NBA", "period": "2025-2026 / 2026- 2027 / 2027-2028 / 2028-2029", "note": "" }, { "item": "EuroCup", "period": "2025-2026 / 2026- 2027 / 2027-2028 / 2028-2029", "note": "" }, { "item": "Yunanistan Basketbol Ligi önemli maçları", "period": "2025 - 2026 Sezon belirsiz", "note": "" }, { "item": "NCAA", "period": "2025 - 2026 / 2026 - 2027", "note": "" }, { "item": "Libertadores Kupası", "period": "2027, 2028, 2029, 2030 (4 seasons)", "note": "" }, { "item": "Copa Sudamericana", "period": "2027, 2028, 2029, 2030 (4 seasons)", "note": "" }, { "item": "WRC", "period": "2025", "note": "2026 da alınabilir net değil" }, { "item": "Nascar", "period": "2025 - 2026 - 2027 - 2028 ve 2029", "note": "" }, { "item": "IndyCar", "period": "2025 - 2026 - 2027", "note": "" }, { "item": "MotoGP - Moto2 - Moto3", "period": "2025 - 2026 - 2027", "note": "" }, { "item": "ATP Tenis Turnuvaları önemli maçlar", "period": "2025 - 2026 - 2027 and 2028", "note": "" }, { "item": "Wimbledon Tenis önemli maçlar", "period": "2025 - 2026 - 2027", "note": "" }, { "item": "UFC Dövüş Gecesi yayınları", "period": "2027 sonuna kadar bizde", "note": "" }, { "item": "Oktagon", "period": "2025", "note": "" }, { "item": "PFL MMA", "period": "2025", "note": "" }, { "item": "Cage Warriors Boks Maçları", "period": "2025", "note": "" }, { "item": "BKFC", "period": "Kaldırıldı", "note": "" }];

function setActiveFilterButton(btn) {
    try {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
    } catch (e) { }
}

function showHomeScreen() {
    const home = document.getElementById('home-screen');
    const grid = document.getElementById('cardGrid');
    const empty = document.getElementById('emptyMessage');
    if (home) home.style.display = 'block';
    if (grid) grid.style.display = 'none';
    if (empty) empty.style.display = 'none';

    // Smooth fade-in
    if (home) {
        home.style.opacity = '0';
        home.style.transition = 'opacity 0.5s ease';
        setTimeout(() => home.style.opacity = '1', 10);
    }
    renderHomePanels();
}

function hideHomeScreen() {
    const home = document.getElementById('home-screen');
    if (home) home.style.display = 'none';
    const grid = document.getElementById('cardGrid');
    if (grid) grid.style.display = 'grid';
}

function renderHomePanels() {
    // --- DİNAMİK SELAMLAMA ---
    const welcomeUser = document.getElementById('home-welcome-user');
    if (welcomeUser) {
        const hour = new Date().getHours();
        let greet = "Hoş Geldin";
        if (hour >= 5 && hour < 12) greet = "Günaydın";
        else if (hour >= 12 && hour < 18) greet = "Tünaydın";
        else if (hour >= 18 && hour < 23) greet = "İyi Akşamlar";
        else greet = "İyi Geceler";

        welcomeUser.innerHTML = `${greet}, <strong>${currentUser || 'Misafir'}</strong>`;
    }

    // --- BUGÜN NELER VAR? (Yayın Akışı / bugünün maçları) ---
    const todayEl = document.getElementById('home-today');
    if (todayEl) {
        todayEl.innerHTML = '<div class="home-mini-item">Yayın akışı yükleniyor...</div>';
        (async () => {
            try {
                const items = await fetchBroadcastFlow();
                const d = new Date();
                const todayISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;


                const toISO = (val) => {
                    const s = String(val || '').trim();
                    if (!s) return '';
                    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
                    // dd.MM.yyyy
                    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
                    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
                    return '';
                };

                const todays = (items || []).filter(it => {
                    const iso = toISO(it.dateISO || it.date);
                    if (iso !== todayISO) return false;

                    // Mantık Güncellemesi: Sadece gelecekti olanları değil, devam edenleri de göster (Son 3 saat)
                    const now = Date.now();
                    const startTimeStr = String(it.time || '').trim();
                    const m = startTimeStr.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
                    if (!m) return true; // saat formatı yoksa göster
                    
                    const hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
                    const dt = new Date();
                    dt.setHours(hh, mm, 0, 0);

                    const startTime = dt.getTime();
                    // Başlamasına 10 dk kala listeye girsin, 2 saat sonrasına kadar 'Bugün' listesinde kalsın
                    return now >= (startTime - 10 * 60000) ? (now < startTime + 120 * 60000) : true;
                }).sort((a, b) => {
                    const tA = String(a.time || '00:00');
                    const tB = String(b.time || '00:00');
                    return tA.localeCompare(tB);
                });

                if (!todays.length) {
                    todayEl.innerHTML = `
                        <div style="text-align:center; padding:30px 10px; color:#cbd5e1;">
                            <i class="fas fa-calendar-times" style="font-size:3rem; margin-bottom:15px; opacity:0.3;"></i>
                            <div style="font-size:0.95rem; font-weight:600;">Bugün için yayın akışı kaydı bulunamadı.</div>
                            <div style="font-size:0.85rem; margin-top:5px; opacity:0.7;">Yarınki karşılaşmaları kontrol edebilirsin.</div>
                        </div>
                    `;
                } else {
                    const now = Date.now();
                    const shown = todays.slice(0, 5); // 5 tane gösterelim
                    todayEl.innerHTML = shown.map(it => {
                        const timeStr = String(it.time || '').trim();
                        const title = escapeHtml(it.match || it.title || it.event || '');
                        const ch = escapeHtml(it.channel || it.platform || '');
                        const league = escapeHtml(it.league || it.category || '');
                        
                        // Canlılık Kontrolü
                        const m = timeStr.match(/^(\d{2}):(\d{2})/);
                        let isLive = false;
                        if (m) {
                            const hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
                            const dt = new Date(); dt.setHours(hh, mm, 0, 0);
                            const st = dt.getTime();
                            // Başlamasına 5 dk kaladan başlayıp 100 dk (maç süresi) sürene kadar "CANLI" de
                            isLive = (now >= st - 5*60000 && now < st + 100*60000);
                        }

                        return `
                          <div class="home-mini-item ${isLive ? 'is-live-match' : ''}" style="${isLive ? 'border-left: 3px solid #ef4444; background: #fff1f2;' : ''}">
                            <div class="home-mini-date" style="display:flex; align-items:center; gap:6px;">
                                ${isLive ? '<span class="live-pulse" style="width:8px; height:8px; background:#ef4444; border-radius:50%; display:inline-block; animation: pulse 1.5s infinite;"></span><span style="color:#ef4444; font-weight:800; font-size:0.7rem;">CANLI</span> • ' : ''}
                                ${timeStr}${league ? ` • ${league}` : ''}${ch ? ` • ${ch}` : ''}
                            </div>
                            <div class="home-mini-title" style="${isLive ? 'color:#9f1239; font-weight:800;' : ''}">${title || 'Maç'}</div>
                          </div>
                        `;
                    }).join('') + (todays.length > shown.length ? `<div style="color:#666;font-size:.8rem;margin-top:8px;text-align:center;font-weight:600;">+${todays.length - shown.length} yayın daha bulunuyor…</div>` : '');
                }


                // kartı tıklayınca yayın akışına git
                const card = todayEl.closest('.home-card');
                if (card) {
                    card.classList.add('clickable');
                    card.onclick = () => openBroadcastFlow();
                }
            } catch (e) {
                todayEl.innerHTML = '<div class="home-mini-item">Yayın akışı alınamadı.</div>';
            }
        })();
    }

    // --- DUYURULAR (son 3 duyuru) ---
    const annEl = document.getElementById('home-ann');
    if (annEl) {
        const latest = (newsData || []).slice(0, 3);
        if (latest.length === 0) {
            annEl.innerHTML = '<div class="home-mini-item">Henüz duyuru yok.</div>';
        } else {
            annEl.innerHTML = latest.map(n => `
                <div class="home-mini-item">
                  <div class="home-mini-date">${escapeHtml(n.date || '')}</div>
                  <div class="home-mini-title">${escapeHtml(n.title || '')}</div>
                  <div class="home-mini-desc" style="white-space: pre-line">${escapeHtml(String(n.desc || '').slice(0, 160))}${(n.desc || '').length > 160 ? '...' : ''}</div>
                </div>
            `).join('');
        }
        const card = annEl.closest('.home-card');
        if (card) {
            card.classList.add('clickable');
            card.onclick = () => openNews();
        }
    }

    // --- GÜNÜN SÖZÜ (HomeBlocks -> e-tabla) ---
    const quoteEl = document.getElementById('home-quote');
    if (quoteEl) {
        // blockId veya key farketmeksizin "quote" olarak indexliyoruz
        const qObj = homeBlocks['quote'];
        const content = (qObj?.content || qObj?.text || localStorage.getItem('homeQuote') || '').trim();
        const author = qObj?.title || qObj?.head || '';

        if (content) {
            quoteEl.innerHTML = `
                <div class="home-quote-container">
                    <div class="home-quote-icon">
                        <i class="fas fa-quote-left"></i>
                    </div>
                    <p class="home-quote-text">
                        ${escapeHtml(content)}
                    </p>
                    ${author ? `<div class="home-quote-author">— ${escapeHtml(author)}</div>` : ''}
                </div>
            `;
            quoteEl.style.display = '';
        } else {
            quoteEl.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8; font-style:italic;">Günün sözü henüz eklenmemiş.</div>';
            // Fallback: cache boşsa Supabase'den tekil çekmeyi bir kez dene
            try {
                if (sb) {
                    sb.from('HomeBlocks').select('*').eq('Key', 'quote').single().then(({ data, error }) => {
                        if (!error && data) {
                            const qn = normalizeKeys(data);
                            homeBlocks = homeBlocks || {};
                            homeBlocks.quote = qn;
                            try { localStorage.setItem('homeBlocksCache', JSON.stringify(homeBlocks || {})); } catch (e) { }
                            try { renderHomePanels(); } catch (e) { }
                        }
                    });
                }
            } catch (e) { }
        }
    }

    // --- LİDERLİK TABLOSU (Home-Screen) ---
    try { renderHomeLeaderboard(); } catch (e) { }

    // Admin: edit butonlarını aç
    try {
        const b1 = document.getElementById('home-edit-today');
        const b2 = document.getElementById('home-edit-ann');
        const b3 = document.getElementById('home-edit-quote');
        if (b1) b1.style.display = 'none'; // artık dinamik
        if (b2) b2.style.display = 'none'; // duyuru dinamik
        if (b3) b3.style.display = (isAdminMode && isEditingActive ? 'inline-flex' : 'none');
    } catch (e) { }
}



// Ana Sayfa - Günün Sözü düzenleme (sadece admin mod + düzenleme açıkken)
function editHomeBlock(kind) {
    if (!isAdminMode) {
        Swal.fire("Yetkisiz", "Bu işlem için admin yetkisi gerekli.", "warning");
        return;
    }
    if (!isEditingActive) {
        Swal.fire("Kapalı", "Düzenleme modu kapalı. Önce 'Düzenlemeyi Aç' demelisin.", "info");
        return;
    }
    const curContent = String((homeBlocks && homeBlocks.quote && homeBlocks.quote.content) ? homeBlocks.quote.content : (localStorage.getItem('homeQuote') || '')).trim();
    const curAuthor = String((homeBlocks && homeBlocks.quote && homeBlocks.quote.title) ? homeBlocks.quote.title : '').trim();

    Swal.fire({
        title: "Günün Sözü Düzenle",
        html: `
            <div style="text-align:left; margin-bottom:10px;">
                <label style="font-weight:bold; display:block; margin-bottom:5px;">Söz İçeriği:</label>
                <textarea id="edit-quote-content" class="swal2-textarea" style="margin:0; width:100%; height:100px;">${escapeHtml(curContent)}</textarea>
            </div>
            <div style="text-align:left;">
                <label style="font-weight:bold; display:block; margin-bottom:5px;">Yazar / Kaynak:</label>
                <input id="edit-quote-author" class="swal2-input" style="margin:0; width:100%;" value="${escapeHtml(curAuthor)}">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Kaydet",
        cancelButtonText: "Vazgeç",
        preConfirm: () => {
            return {
                content: (document.getElementById('edit-quote-content').value || '').trim(),
                author: (document.getElementById('edit-quote-author').value || '').trim()
            };
        }
    }).then(res => {
        if (!res.isConfirmed) return;
        const { content, author } = res.value;

        // e-tabla (HomeBlocks)
        apiCall('updateHomeBlock', { key: 'quote', title: author, content: content, visibleGroups: '' })
            .then(() => {
                homeBlocks = homeBlocks || {};
                homeBlocks.quote = { key: 'quote', title: author, content: content, visibleGroups: '' };
                try { localStorage.setItem('homeBlocksCache', JSON.stringify(homeBlocks || {})); } catch (e) { }
                renderHomePanels();
                Swal.fire("Kaydedildi", "Günün sözü güncellendi.", "success");
            })
            .catch(err => {
                console.error("Home block update error:", err);
                Swal.fire("Hata", "Veritabanı güncellenemedi.", "error");
            });
    });
}

// Kart detayını doğrudan açmak için küçük bir yardımcı
function openCardDetail(cardId) {
    const card = (database || []).find(x => String(x.id) === String(cardId));
    if (!card) { Swal.fire('Hata', 'Kart bulunamadı.', 'error'); return; }
    showCardDetail(card);
}

/* -------------------------
   TELE SATIŞ FULLSCREEN
--------------------------*/

let telesalesOffers = [];
let telesalesScriptsLoaded = false;
function safeGetToken() {
    try { return (typeof getToken === 'function') ? getToken() : ''; } catch (e) { return ''; }
}
async function fetchSheetObjects(actionName) {
    const d = await apiCall(actionName);
    // backend handleFetchData returns {data:[...]} ; other handlers may use {items:[...]}
    return d.data || d.items || [];
}

async function maybeLoadTelesalesScriptsFromSheet() {
    if (telesalesScriptsLoaded) return;
    telesalesScriptsLoaded = true;
    // Eğer kullanıcı local override yaptıysa sheet'ten ezmeyelim
    try {
        const ov = JSON.parse(localStorage.getItem('telesalesScriptsOverride') || '[]');
        if (Array.isArray(ov) && ov.length) return;
    } catch (e) { }
    try {
        const loaded = await fetchSheetObjects('getTelesalesScripts');
        if (Array.isArray(loaded) && loaded.length) {
            // Sheet kolon adlarını normalize et
            window.salesScripts = loaded.map(s => ({
                id: s.id || s.ID || s.Id || '',
                title: s.title || s.Başlık || s.Baslik || s.Script || s['Script Başlığı'] || 'Script',
                text: s.text || s.Metin || s['Script Metni'] || s.content || ''
            })).filter(x => x.text);
        }
    } catch (e) {
        // sessiz fallback
    }
}

async function syncTelesalesScriptsToSheet(arr) {
    // Backend desteği varsa Sheets'e yaz; yoksa sessizce local'de kalsın.
    try {
        await apiCall('saveTelesalesScripts', { scripts: arr || [] });
    } catch (e) {
        // sessiz fallback
    }
}

// --- KALİTE YÖNETİMİ ALANI ---
async function openQualityArea() {
    const wrap = document.getElementById('quality-fullscreen');
    if (!wrap) return;

    // Menü yetkisi: quality
    try {
        const perm = (typeof menuPermissions !== "undefined" && menuPermissions) ? menuPermissions["quality"] : null;
        if (perm && !isAllowedByPerm(perm)) {
            Swal.fire("Yetkisiz", "Kalite ekranına erişimin yok.", "warning");
            return;
        }
    } catch (e) { }

    wrap.style.display = 'flex';
    document.body.classList.add('fs-open');
    document.body.style.overflow = 'hidden';

    // Sidebar profil
    const av = document.getElementById('q-side-avatar');
    const nm = document.getElementById('q-side-name');
    const rl = document.getElementById('q-side-role');
    if (av) av.innerText = (currentUser || 'U').trim().slice(0, 1).toUpperCase();
    if (nm) nm.innerText = currentUser || 'Kullanıcı';
    if (rl) rl.innerText = isAdminMode ? 'Yönetici' : 'Temsilci';
    // Yetki kontrolü (Admin butonlarını göster/gizle)
    const adminFilters = document.getElementById('q-admin-filters');
    const assignBtn = document.getElementById('assign-training-btn');
    const manualFeedbackBtn = document.getElementById('manual-feedback-admin-btn');

    if (isAdminMode) {
        if (adminFilters) {
            adminFilters.style.display = 'flex';
            // Buton bazlı yetki kontrolü
            const rptBtn = adminFilters.querySelector('.admin-btn');
            if (rptBtn) {
                if (isLocAdmin || hasPerm('Reports')) rptBtn.style.display = '';
                else rptBtn.style.display = 'none';
            }
            const addBtn = adminFilters.querySelector('.add-btn');
            if (addBtn) {
                if (isLocAdmin || hasPerm('AddContent')) addBtn.style.display = '';
                else addBtn.style.display = 'none';
            }
        }
        if (assignBtn) assignBtn.style.display = 'block';
        if (manualFeedbackBtn) manualFeedbackBtn.style.display = 'flex';

        // Grup filtresi dropdown'u admin kullanıcı listesi gelince dolacak
        if (adminUserList.length) {
            const groupSelect = document.getElementById('q-admin-group');
            if (groupSelect) {
                const allowedWords = ['chat', 'istchat', 'satış', 'satis'];
                const groups = [...new Set(adminUserList.map(u => u.group).filter(g => {
                    if (!g) return false;
                    const low = g.toLowerCase();
                    return allowedWords.some(w => low.includes(w));
                }))].sort();
                groupSelect.innerHTML = `<option value="all">Tüm Gruplar</option>` + groups.map(g => `<option value="${g}">${g}</option>`).join('');
                try { updateAgentListBasedOnGroup(); } catch (e) { }
            }
        }
    } else {
        if (adminFilters) adminFilters.style.display = 'none';
        if (assignBtn) assignBtn.style.display = 'none';
        if (manualFeedbackBtn) manualFeedbackBtn.style.display = 'none';
    }


    if (adminUserList.length === 0) {
        Swal.fire({ title: 'Temsilci Listesi Yükleniyor...', didOpen: () => Swal.showLoading(), showConfirmButton: false });
        await fetchUserListForAdmin();
        Swal.close();
    }

    // Filtreleri doldur
    populateDashboardFilters();
    populateFeedbackFilters();
    populateFeedbackMonthFilter();
    populateMonthFilterFull();

    switchQualityTab('dashboard');
}

// Modülü Kapat
function closeFullQuality() {
    document.getElementById('quality-fullscreen').style.display = 'none';
    document.body.classList.remove('fs-open');
    document.body.style.overflow = '';
    // Eğer qusers ise (sadece kalite yetkisi varsa) logout yapmalı veya uyarı vermeli
    if (localStorage.getItem("sSportRole") === 'qusers') {
        logout();
    }
}

// Sekme Değiştirme
function switchQualityTab(tabName, element) {
    // Menu active class
    document.querySelectorAll('#quality-fullscreen .q-nav-item').forEach(item => item.classList.remove('active'));

    // Element varsa onu aktif yap, yoksa nav içerisinden bul
    if (element) {
        element.classList.add('active');
    } else {
        const navItem = document.querySelector(`#quality-fullscreen .q-nav-item[onclick*="${tabName}"]`);
        if (navItem) navItem.classList.add('active');
    }

    // View active class
    document.querySelectorAll('#quality-fullscreen .q-view-section').forEach(section => section.classList.remove('active'));
    const targetView = document.getElementById(`view-${tabName}`);
    if (targetView) targetView.classList.add('active');

    // Veri Yükleme
    if (tabName === 'dashboard') loadQualityDashboard();
    else if (tabName === 'evaluations') fetchEvaluationsForAgent();
    else if (tabName === 'feedback') {
        populateFeedbackFilters();
        populateFeedbackMonthFilter();
        refreshFeedbackData();
    }
    else if (tabName === 'training') loadTrainingData();
}


