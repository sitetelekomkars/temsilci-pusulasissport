// --- PENALTY GAME ---
// Tasarım/Güncelleme: Tekrarlayan soru engeli, akıllı 50:50, double rozet, daha net maç sonu ekranı

let pScore = 0, pBalls = 10, pCurrentQ = null;
let pQuestionQueue = [];        // oturum boyunca sorulacak soru indeksleri (karıştırılmış)
let pAskedCount = 0;            // kaç soru soruldu
let pCorrectCount = 0;          // kaç doğru
let pWrongCount = 0;            // kaç yanlış

function setDoubleIndicator(isActive) {
    const el = document.getElementById('double-indicator');
    if (!el) return;
    el.style.display = isActive ? 'inline-flex' : 'none';
}

function updateJokerButtons() {
    const callBtn = document.getElementById('joker-call');
    const halfBtn = document.getElementById('joker-half');
    const doubleBtn = document.getElementById('joker-double');

    if (callBtn) callBtn.disabled = jokers.call === 0;
    if (halfBtn) halfBtn.disabled = jokers.half === 0;
    if (doubleBtn) doubleBtn.disabled = jokers.double === 0 || firstAnswerIndex !== -1;

    // Double aktifken diğerleri kilitlensin
    if (firstAnswerIndex !== -1) {
        if (callBtn) callBtn.disabled = true;
        if (halfBtn) halfBtn.disabled = true;
        if (doubleBtn) doubleBtn.disabled = true;
    }
}

function useJoker(type) {
    if (!pCurrentQ) return;
    if (jokers[type] === 0) return;
    if (firstAnswerIndex !== -1 && type !== 'double') return;

    jokers[type] = 0;
    updateJokerButtons();

    const currentQ = pCurrentQ;
    const correctAns = currentQ.a;
    const btns = document.querySelectorAll('.penalty-btn');

    if (type === 'call') {
        const experts = ["Umut Bey", "Doğuş Bey", "Deniz Bey", "Esra Hanım"];
        const expert = experts[Math.floor(Math.random() * experts.length)];

        let guess = correctAns;
        // %80 doğru, %20 yanlış tahmin
        if (Math.random() > 0.8 && currentQ.opts.length > 1) {
            const incorrect = currentQ.opts.map((_, i) => i).filter(i => i !== correctAns);
            guess = incorrect[Math.floor(Math.random() * incorrect.length)] ?? correctAns;
        }

        Swal.fire({
            icon: 'info',
            title: ' 📞 Telefon Jokeri',
            html: `${expert} soruyu cevaplıyor...<br><br>"Benim tahminim **${String.fromCharCode(65 + guess)}** şıkkı. Bundan ${Math.random() < 0.8 ? "çok eminim" : "emin değilim"}."`,
            confirmButtonText: 'Kapat'
        });

    } else if (type === 'half') {
        const optLen = Array.isArray(currentQ.opts) ? currentQ.opts.length : 0;
        if (optLen <= 2) {
            Swal.fire({ icon: 'info', title: '✂️ 50:50', text: 'Bu soruda 50:50 uygulanamaz.', toast: true, position: 'top', showConfirmButton: false, timer: 1800 });
            return;
        }

        // 4+ şıkta 2 yanlış, 3 şıkta 1 yanlış ele
        const removeCount = optLen >= 4 ? 2 : 1;
        const incorrect = currentQ.opts.map((_, i) => i).filter(i => i !== correctAns);
        incorrect.sort(() => Math.random() - 0.5).slice(0, removeCount).forEach(idx => {
            const b = btns[idx];
            if (!b) return;
            b.disabled = true;
            b.style.textDecoration = 'line-through';
            b.style.opacity = '0.4';
        });

        Swal.fire({
            icon: 'success',
            title: ' ✂️ 50:50',
            text: removeCount === 2 ? 'İki yanlış şık elendi!' : 'Bir yanlış şık elendi!',
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 1400
        });

    } else if (type === 'double') {
        doubleChanceUsed = true;
        setDoubleIndicator(true);
        Swal.fire({
            icon: 'warning',
            title: '2️ ⃣ Çift Cevap',
            text: 'Bir kez yanlış cevap hakkın var.',
            toast: true,
            position: 'top',
            showConfirmButton: false,
            timer: 2200
        });
    }
}


function openGameHub() {
    document.getElementById('game-hub-modal').style.display = 'flex';
}

function openQuickDecisionGame() {
    try { closeModal('game-hub-modal'); } catch (e) { }
    document.getElementById('quick-modal').style.display = 'flex';

    // Lobby ekranı
    const lobby = document.getElementById('qd-lobby');
    const game = document.getElementById('qd-game');
    if (lobby) lobby.style.display = 'block';
    if (game) game.style.display = 'none';

    // Reset göstergeler
    const t = document.getElementById('qd-time'); if (t) t.innerText = '30';
    const s = document.getElementById('qd-score'); if (s) s.innerText = '0';
    const st = document.getElementById('qd-step'); if (st) st.innerText = '0';
}

// --- HIZLI KARAR OYUNU ---
let qdTimer = null;
let qdTimeLeft = 30;
let qdScore = 0;
let qdStep = 0;
let qdQueue = [];

const QUICK_DECISION_BANK = [
    {
        q: 'Müşteri: "Fiyat pahalı, iptal edeceğim." İlk yaklaşımın ne olmalı?',
        opts: [
            'Hemen iptal işlemini başlatalım.',
            'Haklısınız, sizi anlıyorum. Paket/avantajlara göre alternatif sunayım mı?',
            'Kampanya yok, yapacak bir şey yok.'
        ],
        a: 1,
        exp: 'Empati + ihtiyaç analizi itirazı yumuşatır ve iknayı artırır.'
    },
    {
        q: 'Müşteri: "Uygulama açılmıyor." En hızlı ilk kontrol ne?',
        opts: [
            'Şifreyi sıfırlat.',
            'İnternet bağlantısı / VPN / DNS kontrolü yaptır.',
            'Hemen cihazı fabrika ayarlarına döndür.'
        ],
        a: 1,
        exp: 'Önce kök nedeni daralt: bağlantı mı uygulama mı? Büyük adımları sona bırak.'
    },
    {
        q: 'Müşteri: "Yayın donuyor." Teknikte doğru soru hangisi?',
        opts: [
            'Hangi cihazda (TV/telefon) ve hangi ağda (Wi‑Fi/kablo) oluyor?',
            'Kaç gündür böyle?',
            'Şimdi kapatıp açın.'
        ],
        a: 0,
        exp: 'Cihaz + ağ bilgisi, sorunu hızlı izole etmeyi sağlar.'
    },
    {
        q: 'Müşteri: "İade istiyorum." En doğru yönlendirme?',
        opts: [
            'Hemen kapatalım.',
            'İade koşulları ve adımları net anlat, doğru kanala yönlendir (asistan/rehber).',
            'Tekrar arayın.'
        ],
        a: 1,
        exp: 'Net süreç + doğru kanal = memnuniyet + tekrar aramayı azaltır.'
    },
    {
        q: 'Müşteri: "Kampanyadan yararlanamıyorum." İlk adım?',
        opts: [
            'Kampanya koşulları (tarih/paket/cihaz) uygun mu kontrol et.',
            'Direkt kampanyayı tanımla.',
            'Sorun yok deyip kapat.'
        ],
        a: 0,
        exp: 'Uygunluk kontrolü yapılmadan işlem yapmak hataya sürükler.'
    },
    {
        q: 'Müşteri sinirli: "Kimse çözmedi!" Ne yaparsın?',
        opts: [
            'Sakinleştirici bir cümle + özet + net aksiyon planı.',
            'Sıraya alalım.',
            'Ses yükselt.'
        ],
        a: 0,
        exp: 'Kontrolü geri almak için empati + özet + plan üçlüsü çalışır.'
    }
];

function resetQuickDecision() {
    if (qdTimer) { clearInterval(qdTimer); qdTimer = null; }
    qdTimeLeft = 30; qdScore = 0; qdStep = 0; qdQueue = [];
    openQuickDecisionGame();
}

// --- REKABET VE OYUN LOGIĞİ (Gamer Modu) ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getGameQuestionQueue(pool, storageKey, count) {
    if (!pool || pool.length === 0) return [];

    // LocalStorage'dan son görülenleri al
    let seenIds = [];
    try {
        seenIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch (e) { seenIds = []; }

    // Soruları index bazlı filtrele (Title veya text bazlı unique ID varsayıyoruz)
    let availableIndices = pool.map((_, i) => i);

    // Eğer pool yeterince büyükse (istenen sayının 2 katı kadar), görülenleri ele
    if (pool.length > count * 2) {
        availableIndices = availableIndices.filter(idx => {
            const q = pool[idx];
            const qId = q.q || q.title || idx.toString();
            return !seenIds.includes(qId);
        });
    }

    // Eğer kalan soru yoksa veya çok azsa temizle (döngüye girsin)
    if (availableIndices.length < count) {
        availableIndices = pool.map((_, i) => i);
    }

    shuffleArray(availableIndices);
    const resultIndices = availableIndices.slice(0, count);

    // Yeni seçilenleri "seen" listesine ekle (en fazla 30 tane sakla)
    resultIndices.forEach(idx => {
        const q = pool[idx];
        const qId = q.q || q.title || idx.toString();
        if (!seenIds.includes(qId)) seenIds.push(qId);
    });
    if (seenIds.length > 30) seenIds = seenIds.slice(-30);
    localStorage.setItem(storageKey, JSON.stringify(seenIds));

    return resultIndices;
}

function startQuickDecision() {
    const bank = (Array.isArray(quickDecisionQuestions) && quickDecisionQuestions.length) ? quickDecisionQuestions : QUICK_DECISION_BANK;
    if (!bank.length) {
        Swal.fire('Hata', 'Hızlı Karar verisi yok.', 'warning');
        return;
    }

    // Modal UI
    const lobby = document.getElementById('qd-lobby');
    const game = document.getElementById('qd-game');
    if (lobby) lobby.style.display = 'none';
    if (game) game.style.display = 'block';

    // Skor ve Soru Sıfırla
    qdScore = 0; qdStep = 0; qdTimeLeft = 30;

    // Rastgele 5 soru seç (Unseen tracking ile)
    const indices = getGameQuestionQueue(bank, 'seenQuickQuestions', 5);
    qdQueue = indices.map(idx => bank[idx]);

    updateQuickHud();
    if (qdTimer) clearInterval(qdTimer);
    qdTimer = setInterval(() => {
        qdTimeLeft--;
        if (qdTimeLeft <= 0) {
            qdTimeLeft = 0;
            finishQuickDecision(true);
        }
    }, 1000);

    renderQuickQuestion();
}

function updateQuickHud() {
    const t = document.getElementById('qd-time'); if (t) t.innerText = String(Math.max(0, qdTimeLeft));
    const s = document.getElementById('qd-score'); if (s) s.innerText = String(qdScore);
    const st = document.getElementById('qd-step'); if (st) st.innerText = String(qdStep);
}

function renderQuickQuestion() {
    const q = qdQueue[qdStep];
    const qEl = document.getElementById('qd-question');
    const optEl = document.getElementById('qd-options');
    if (!qEl || !optEl || !q) return;

    qEl.innerText = q.q;
    optEl.innerHTML = '';

    q.opts.forEach((txt, i) => {
        const b = document.createElement('button');
        b.className = 'quick-opt';
        b.innerText = txt;
        b.onclick = () => answerQuick(i);
        optEl.appendChild(b);
    });
}

function answerQuick(idx) {
    const q = qdQueue[qdStep];
    const optEl = document.getElementById('qd-options');
    if (!q || !optEl) return;

    const btns = Array.from(optEl.querySelectorAll('button'));
    btns.forEach(b => b.disabled = true);

    const correct = (idx === q.a);

    // Görsel Feedback
    if (btns[idx]) {
        btns[idx].style.borderColor = correct ? "#00f2ff" : "#ff5252";
        btns[idx].style.background = correct ? "rgba(0, 242, 255, 0.2)" : "rgba(255, 82, 82, 0.2)";
        btns[idx].style.boxShadow = correct ? "0 0 15px #00f2ff" : "0 0 15px #ff5252";
    }
    if (!correct && btns[q.a]) {
        btns[q.a].style.borderColor = "#00f2ff";
        btns[q.a].style.boxShadow = "0 0 10px #00f2ff";
    }

    // Puanlama: doğru +10, yanlış -5 (Gamer puanlama daha tatmin edicidir)
    qdScore += correct ? 10 : -5;
    if (qdScore < 0) qdScore = 0;
    updateQuickHud();

    Swal.fire({
        toast: true,
        position: 'top',
        icon: correct ? 'success' : 'warning',
        title: correct ? 'DOĞRU!' : 'YANLIŞ!',
        text: q.exp,
        showConfirmButton: false,
        background: '#0a1428',
        color: '#fff',
        timer: 1500
    });

    setTimeout(() => {
        qdStep += 1;
        updateQuickHud();
        if (qdStep >= qdQueue.length) finishQuickDecision(false);
        else renderQuickQuestion();
    }, 1200);
}

function finishQuickDecision(timeout) {
    if (qdTimer) { clearInterval(qdTimer); qdTimer = null; }

    const msg = timeout ? 'SÜRE BİTTİ!' : 'TAMAMLANDI!';
    const scoreColor = qdScore >= 40 ? "#00f2ff" : (qdScore >= 20 ? "#ffcc00" : "#ff5252");

    Swal.fire({
        icon: 'info',
        title: msg,
        background: '#0a1428',
        color: '#fff',
        html: `
            <div style="text-align:center; padding: 10px;">
                <div style="font-size:1.2rem; color:#fff; margin-bottom:15px; font-weight:bold;">🧠 Hızlı Karar Sonucu</div>
                <div style="font-size:3rem; font-weight:900; color:${scoreColor}; text-shadow: 0 0 15px ${scoreColor}cc;">${qdScore}</div>
                <div style="margin-top:10px; color:#fff; font-weight:600;">TOPLAM PUAN</div>
                <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:20px 0;">
                <div style="color:#00f2ff; font-size:1rem; font-weight:600;">Daha hızlı karar vererek rekorunu geliştirebilirsin!</div>
            </div>`,
        confirmButtonText: '<i class="fas fa-redo"></i> Tekrar Oyna',
        confirmButtonColor: '#00f2ff',
        showCancelButton: true,
        cancelButtonText: 'Kapat',
        cancelButtonColor: '#444'
    }).then((r) => {
        if (r.isConfirmed) resetQuickDecision();
        else closeModal('quick-modal');
    });
}

function openPenaltyGame() {
    try { closeModal('game-hub-modal'); } catch (e) { }
    document.getElementById('penalty-modal').style.display = 'flex';
    showLobby();
}

function showLobby() {
    document.getElementById('penalty-lobby').style.display = 'flex';
    document.getElementById('penalty-game-area').style.display = 'none';
    fetchLeaderboard();
}

function startGameFromLobby() {
    document.getElementById('penalty-lobby').style.display = 'none';
    document.getElementById('penalty-game-area').style.display = 'block';
    startPenaltySession();
}

async function fetchLeaderboard(targetTbodyId = 'leaderboard-body', targetLoaderId = 'leaderboard-loader', targetTableId = 'leaderboard-table') {
    const tbody = document.getElementById(targetTbodyId);
    const loader = document.getElementById(targetLoaderId);
    const table = document.getElementById(targetTableId);

    if (!tbody) return;

    if (loader) loader.style.display = 'block';
    if (table) table.style.display = 'none';
    tbody.innerHTML = '';

    try {
        // TABLO İSMİ DÜZELTME: Scoreboard -> QuizResults (Ekran görüntüsünden teyit edildi)
        const { data, error } = await sb.from('QuizResults').select('*').order('Score', { ascending: false }).limit(20);

        if (loader) loader.style.display = 'none';
        if (error) throw error;

        if (table) table.style.display = 'table';
        let html = '';

        if (!data || data.length === 0) {
            html = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#999;">Henüz maç yapılmadı.</td></tr>`;
        } else {
            const normalizedData = normalizeKeys(data);

            // Kullanıcı bazlı istatistikleri ayıkla
            const userStats = {};
            normalizedData.forEach(u => {
                const name = u.username || u.agent || u.name || 'Anonim';
                const score = parseInt(u.score || 0);
                if (!userStats[name]) {
                    userStats[name] = { maxScore: 0, games: 0, bestRate: '%0' };
                }
                userStats[name].games++;
                if (score > userStats[name].maxScore) {
                    userStats[name].maxScore = score;
                    userStats[name].bestRate = u.average || u.successrate || '%0';
                }
            });

            // En iyiden en kötüye sırala
            const sortedUsers = Object.keys(userStats)
                .map(name => ({ name, ...userStats[name] }))
                .sort((a, b) => b.maxScore - a.maxScore)
                .slice(0, targetTbodyId === 'home-leaderboard-body' ? 5 : 10);

            sortedUsers.forEach((u, i) => {
                const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `<span class="rank-badge">${i + 1}</span>`));
                const name = u.name;
                const score = u.maxScore;
                const games = u.games;
                const rate = u.bestRate;
                const isMe = (name === currentUser);
                const bgStyle = isMe ? 'background:rgba(250, 187, 0, 0.15);' : '';
                const textColor = isMe ? '#fabb00' : (targetTbodyId === 'home-leaderboard-body' ? '#333' : '#eee');

                html += `<tr style="${bgStyle} border-bottom:1px solid rgba(0,0,0,0.05);">
                    <td style="padding:8px 5px; text-align:center;">${medal}</td>
                    <td style="padding:8px 5px; font-weight:${isMe ? '800' : '600'}; color:${textColor}">${escapeHtml(name)}</td>
                    <td style="padding:8px 5px; text-align:center; color:${textColor}">${games}</td>
                    <td style="padding:8px 5px; text-align:center; font-weight:800; color:${textColor}">${rate}</td>
                </tr>`;
            });
        }
        tbody.innerHTML = html;
    } catch (err) {
        console.warn("Leaderboard fetch error:", err);
        if (loader) {
            loader.innerText = "Yüklenemedi.";
            loader.style.display = 'block';
        }
    }
}

function renderHomeLeaderboard() {
    fetchLeaderboard('home-leaderboard-body', 'home-leaderboard-loader', 'home-leaderboard-table');
}

function buildQuestionQueue() {
    return getGameQuestionQueue(quizQuestions, 'seenArenaQuestions', 10);
}

function startPenaltySession() {
    // Session reset
    pScore = 0;
    pBalls = 10;
    pAskedCount = 0;
    pCorrectCount = 0;
    pWrongCount = 0;

    jokers = { call: 1, half: 1, double: 1 };
    doubleChanceUsed = false;
    firstAnswerIndex = -1;
    setDoubleIndicator(false);

    // Soru kuyruğu
    pQuestionQueue = buildQuestionQueue();

    updateJokerButtons();
    document.getElementById('p-score').innerText = pScore;
    document.getElementById('p-balls').innerText = pBalls;

    const restartBtn = document.getElementById('p-restart-btn');
    const optionsEl = document.getElementById('p-options');
    if (restartBtn) restartBtn.style.display = 'none';
    if (optionsEl) optionsEl.style.display = 'grid';

    resetField();
    loadPenaltyQuestion();
}

function pickNextQuestion() {
    if (quizQuestions.length === 0) return null;

    // Önce kuyruktan tüket
    if (pQuestionQueue.length > 0) {
        const i = pQuestionQueue.shift();
        return quizQuestions[i];
    }

    // Kuyruk bitti ama top devam ediyor: artık random (soru azsa)
    return quizQuestions[Math.floor(Math.random() * quizQuestions.length)];
}

function loadPenaltyQuestion() {
    if (pBalls <= 0) { finishPenaltyGame(); return; }
    if (!Array.isArray(quizQuestions) || quizQuestions.length === 0) {
        Swal.fire('Hata', 'Soru yok!', 'warning');
        return;
    }

    pCurrentQ = pickNextQuestion();
    if (!pCurrentQ || !pCurrentQ.opts || pCurrentQ.opts.length < 2) {
        Swal.fire('Hata', 'Bu soru hatalı formatta (şık yok).', 'error');
        // bir sonraki soruyu dene
        pCurrentQ = pickNextQuestion();
        if (!pCurrentQ) return;
    }

    pAskedCount++;
    doubleChanceUsed = false;
    firstAnswerIndex = -1;
    setDoubleIndicator(false);
    updateJokerButtons();

    const qEl = document.getElementById('p-question-text');
    if (qEl) qEl.innerText = pCurrentQ.q || "Soru";

    let html = '';
    pCurrentQ.opts.forEach((opt, index) => {
        const letter = String.fromCharCode(65 + index);
        html += `<button class="penalty-btn" onclick="shootBall(${index})">${letter}: ${opt}</button>`;
    });

    const optionsEl = document.getElementById('p-options');
    if (optionsEl) optionsEl.innerHTML = html;
}

function shootBall(idx) {
    const btns = document.querySelectorAll('.penalty-btn');
    const isCorrect = (idx === pCurrentQ.a);

    // Double joker: ilk yanlışta bir hak daha
    if (!isCorrect && doubleChanceUsed && firstAnswerIndex === -1) {
        firstAnswerIndex = idx;
        if (btns[idx]) {
            btns[idx].classList.add('wrong-first-try');
            btns[idx].disabled = true;
        }
        Swal.fire({ toast: true, position: 'top', icon: 'info', title: 'İlk Hata! Kalan Hakkın: 1', showConfirmButton: false, timer: 1400, background: '#ffc107' });
        updateJokerButtons();
        return;
    }

    // Artık atış kesinleşti
    btns.forEach(b => b.disabled = true);

    const ballWrap = document.getElementById('ball-wrap');
    const keeperWrap = document.getElementById('keeper-wrap');
    const shooterWrap = document.getElementById('shooter-wrap');
    const goalMsg = document.getElementById('goal-msg');

    const shotDir = Math.floor(Math.random() * 4);
    if (shooterWrap) shooterWrap.classList.add('shooter-run');

    setTimeout(() => {
        if (keeperWrap) {
            if (isCorrect) {
                if (shotDir === 0 || shotDir === 2) keeperWrap.classList.add('keeper-dive-right');
                else keeperWrap.classList.add('keeper-dive-left');
            } else {
                if (shotDir === 0 || shotDir === 2) keeperWrap.classList.add('keeper-dive-left');
                else keeperWrap.classList.add('keeper-dive-right');
            }
        }

        if (isCorrect) {
            if (ballWrap) {
                if (shotDir === 0) ballWrap.classList.add('ball-shoot-left-top');
                else if (shotDir === 1) ballWrap.classList.add('ball-shoot-right-top');
                else if (shotDir === 2) ballWrap.classList.add('ball-shoot-left-low');
                else ballWrap.classList.add('ball-shoot-right-low');
            }

            setTimeout(() => {
                if (goalMsg) {
                    goalMsg.innerText = "GOOOOL!";
                    goalMsg.style.color = "#00f2ff";
                    goalMsg.style.textShadow = "0 0 20px #00f2ff";
                    goalMsg.classList.add('show');
                }
                pScore += (doubleChanceUsed ? 2 : 1);
                pCorrectCount++;
                document.getElementById('p-score').innerText = pScore;

                Swal.fire({
                    toast: true,
                    position: 'top',
                    icon: 'success',
                    title: 'MÜKEMMEL ŞUT!',
                    showConfirmButton: false,
                    timer: 1200,
                    background: '#0e1b42',
                    color: '#00f2ff'
                });
            }, 500);

        } else {
            pWrongCount++;

            const showWrong = () => {
                if (goalMsg) {
                    goalMsg.style.color = "#ff5252";
                    goalMsg.style.textShadow = "0 0 20px #ff5252";
                    goalMsg.classList.add('show');
                }
                Swal.fire({
                    icon: 'error',
                    title: 'KAÇIRDIN!',
                    text: `Doğru Cevap: ${String.fromCharCode(65 + pCurrentQ.a)}`,
                    showConfirmButton: true,
                    background: '#0a1428',
                    color: '#fff',
                    confirmButtonColor: '#ff5252'
                });
            };

            if (Math.random() > 0.5) {
                if (ballWrap) {
                    ballWrap.style.bottom = "160px";
                    ballWrap.style.left = (shotDir === 0 || shotDir === 2) ? "40%" : "60%";
                    ballWrap.style.transform = "scale(0.6)";
                }
                setTimeout(() => { if (goalMsg) goalMsg.innerText = "KURTARDI!"; showWrong(); }, 500);
            } else {
                if (ballWrap) ballWrap.classList.add(Math.random() > 0.5 ? 'ball-miss-left' : 'ball-miss-right');
                setTimeout(() => { if (goalMsg) goalMsg.innerText = "DIŞARI!"; showWrong(); }, 500);
            }
        }
    }, 400);

    // top azalt
    pBalls--;
    document.getElementById('p-balls').innerText = pBalls;

    setTimeout(() => { resetField(); loadPenaltyQuestion(); }, 3200);
}

function resetField() {
    const ballWrap = document.getElementById('ball-wrap');
    const keeperWrap = document.getElementById('keeper-wrap');
    const shooterWrap = document.getElementById('shooter-wrap');
    const goalMsg = document.getElementById('goal-msg');

    if (ballWrap) { ballWrap.className = 'ball-wrapper'; ballWrap.style = ""; }
    if (keeperWrap) keeperWrap.className = 'keeper-wrapper';
    if (shooterWrap) shooterWrap.className = 'shooter-wrapper';
    if (goalMsg) goalMsg.classList.remove('show');

    document.querySelectorAll('.penalty-btn').forEach(b => {
        b.classList.remove('wrong-first-try');
        b.style.textDecoration = '';
        b.style.opacity = '';
        b.style.background = '';
        b.style.color = '';
        b.style.borderColor = '';
        b.style.boxShadow = '';
        b.disabled = false;
    });
}

function finishPenaltyGame() {
    const totalShots = 10;
    const title = pScore >= 8 ? "EFSANE! 🏆" : (pScore >= 5 ? "İyi Maçtı! 👏" : "Antrenman Lazım 🤕");
    const acc = Math.round((pCorrectCount / Math.max(1, (pCorrectCount + pWrongCount))) * 100);
    const scoreColor = pScore >= 8 ? "#00f2ff" : (pScore >= 5 ? "#ffcc00" : "#ff5252");

    const qEl = document.getElementById('p-question-text');
    if (qEl) {
        qEl.innerHTML = `
            <div style="text-align:center; padding:15px; background:rgba(0,0,0,0.3); border-radius:12px; border:1px solid #333;">
                <div style="font-size:1.8rem; color:#00f2ff; font-weight:900; text-shadow:0 0 10px #00f2ff66;">MAÇ BİTTİ!</div>
                <div style="margin-top:8px; font-size:1.2rem; color:#fff; font-weight:600;">${title}</div>
                <div style="display:flex; justify-content:center; gap:20px; margin-top:20px;">
                    <div style="text-align:center;">
                        <div style="font-size:0.8rem; color:#888; text-transform:uppercase;">Skor</div>
                        <div style="font-size:2rem; font-weight:900; color:${scoreColor};">${pScore}/${totalShots}</div>
                    </div>
                    <div style="text-align:center; border-left:1px solid #333; padding-left:20px;">
                        <div style="font-size:0.8rem; color:#888; text-transform:uppercase;">Doğruluk</div>
                        <div style="font-size:2rem; font-weight:900; color:#fff;">${acc}%</div>
                    </div>
                </div>
                <div style="margin-top:15px; font-size:0.9rem; color:#aaa;">
                    Doğru: <span style="color:#00f2ff">${pCorrectCount}</span> &nbsp; | &nbsp; Yanlış: <span style="color:#ff5252">${pWrongCount}</span>
                </div>
            </div>
        `;
    }

    const optionsEl = document.getElementById('p-options');
    const restartBtn = document.getElementById('p-restart-btn');
    if (optionsEl) optionsEl.style.display = 'none';
    if (restartBtn) restartBtn.style.display = 'block';

    // Leaderboard log
    apiCall('logQuiz', {
        username: currentUser,
        score: pScore * 10,
        total: 10,
        successRate: acc + '%'
    }).finally(() => {
        setTimeout(fetchLeaderboard, 600);
    });
}


// --- WIZARD FUNCTIONS ---
const wizardState = { currentStep: 'start', history: [] };

function openWizard() {
    wizardState.currentStep = 'start';
    wizardState.history = [];
    document.getElementById('wizard-modal').style.display = 'flex';
    if (Object.keys(wizardStepsData).length === 0) {
        Swal.fire({ title: 'İade Asistanı Verisi Yükleniyor...', didOpen: () => Swal.showLoading() });
        loadWizardData().then(() => { Swal.close(); if (wizardStepsData['start']) changeWizardStep('start', true); else document.getElementById('wizard-body').innerHTML = '<h2 style="color:red;">Asistan verisi eksik.</h2>'; })
            .catch(() => { Swal.close(); document.getElementById('wizard-body').innerHTML = '<h2 style="color:red;">Veri çekme hatası.</h2>'; });
    } else { changeWizardStep('start', true); }
}

function changeWizardStep(k, isReset = false, isBack = false) {
    if (isReset) {
        wizardState.history = [];
    } else if (!isBack) {
        if (wizardState.currentStep !== k) wizardState.history.push(wizardState.currentStep);
    }
    wizardState.currentStep = k;
    renderStep(k);
}

function wizardGoBack() {
    if (wizardState.history.length > 0) {
        const prev = wizardState.history.pop();
        changeWizardStep(prev, false, true);
    }
}

function renderStep(k) {
    const s = wizardStepsData[k];
    if (!s) {
        document.getElementById('wizard-body').textContent = `HATA: Adım ID (${k}) bulunamadı.`;
        return;
    }
    const b = document.getElementById('wizard-body');

    let editBtn = (isAdminMode && isEditingActive) ? `<button class="btn-edit-wizard" onclick="openWizardEditor('WizardSteps', '${k}')" style="float:right; background:none; border:none; color:#999; cursor:pointer;" title="Bu adımı düzenle"><i class="fas fa-edit"></i></button>` : '';

    let h = `<div style="animation: formGoster 0.3s ease;">${editBtn}<h2 style="color:var(--primary); font-size:1.6rem; font-weight:800; border-bottom:2px dashed #e1e8ed; padding-bottom:12px; margin-bottom:20px;">${escapeHtml(s.title || '')}</h2>`;
    const formatText = (txt) => escapeHtml(txt).replace(/&lt;br\s*\/?&gt;/gi, '<br>').replace(/&lt;b&gt;/gi, '<b>').replace(/&lt;\/b&gt;/gi, '</b>');

    const btnContainerHtml = `
        <div style="display:flex; gap:12px; margin-top:25px;">
            ${wizardState.history.length > 0 ? `<button class="x-btn" style="flex:1; background:#f0f2f5; border:1px solid #dce1e6; color:#4a5568; font-weight:600; padding:12px; border-radius:10px; transition:all 0.2s; display:flex; justify-content:center; align-items:center; gap:8px; box-shadow:0 2px 4px rgba(0,0,0,0.02);" onmouseover="this.style.background='#e2e8f0'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='#f0f2f5'; this.style.transform='translateY(0)';" onclick="wizardGoBack()"><i class="fas fa-arrow-left"></i> Geri Dön</button>` : ''}
            ${k !== 'start' ? `<button class="x-btn" style="flex:1; background:#fff5f5; border:1px solid #fed7d7; color:#e53e3e; font-weight:600; padding:12px; border-radius:10px; transition:all 0.2s; display:flex; justify-content:center; align-items:center; gap:8px; box-shadow:0 2px 4px rgba(0,0,0,0.02);" onmouseover="this.style.background='#fed7d7'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='#fff5f5'; this.style.transform='translateY(0)';" onclick="changeWizardStep('start', true)"><i class="fas fa-redo-alt"></i> Başa Dön</button>` : ''}
        </div>
    `;

    if (s.result) {
        let i = s.result === 'red' ? '<i class="fas fa-times-circle" style="color:#e53e3e;"></i>' : (s.result === 'green' ? '<i class="fas fa-check-circle" style="color:#48bb78;"></i>' : '<i class="fas fa-exclamation-triangle" style="color:#ecc94b;"></i>');
        let c = s.result === 'red' ? 'res-red' : (s.result === 'green' ? 'res-green' : 'res-yellow');
        h += `<div class="result-box ${c}" style="border-radius:16px; padding:30px; box-shadow:0 10px 25px rgba(0,0,0,0.05); text-align:center; background:#fff; border:1px solid rgba(0,0,0,0.03);">
            <div style="font-size:4rem; margin-bottom:15px; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">${i}</div>
            <h3 style="font-size:1.5rem; color:#2d3748; font-weight:800; margin-bottom:12px;">${escapeHtml(s.title)}</h3>
            <p style="font-size:1.1rem; color:#4a5568; line-height:1.6; max-width:90%; margin:0 auto;">${formatText(s.text)}</p>
            ${s.script ? `<div class="script-box" style="margin-top:20px; font-family:monospace; background:#f7fafc; border:1px solid #e2e8f0; color:#2d3748; padding:15px; border-radius:12px; text-align:left; font-size:0.95rem; box-shadow:inset 0 2px 4px rgba(0,0,0,0.02);"><div style="font-weight:700; color:#a0aec0; margin-bottom:6px; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px;">Müşteriye İletilecek:</div>${escapeHtml(s.script)}</div>` : ''}
        </div>
        ${btnContainerHtml}
        </div>`;
    } else {
        h += `<p style="font-size:1.05rem; line-height:1.6; color:#4a5568; margin-bottom:20px; padding:15px; background:#f7fafc; border-left:4px solid var(--accent); border-radius:8px;">${formatText(s.text)}</p>
        <div class="wizard-options" style="display:flex; flex-direction:column; gap:12px;">`;
        s.options.forEach(o => {
            h += `<button class="option-btn" style="background:#fff; border:2px solid transparent; padding:15px 20px; border-radius:12px; font-size:1.05rem; font-weight:600; color:#2d3748; text-align:left; cursor:pointer; transition:all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1); box-shadow:0 4px 6px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02); display:flex; align-items:center; justify-content:space-between; position:relative;" onmouseover="this.style.borderColor='var(--accent)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 15px rgba(0,0,0,0.08)';" onmouseout="this.style.borderColor='transparent'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)';" onclick="changeWizardStep('${o.next}')">
            <span>${escapeHtml(o.text)}</span> 
            <i class="fas fa-chevron-right" style="opacity:0.4; font-size:0.9rem; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.4'"></i>
            </button>`;
        });
        h += `</div>
        ${btnContainerHtml}
        </div>`;
    }
    b.innerHTML = h; // escapeHtml sayesinde artık güvenli
}
// --- TECH WIZARD ---
const twState = { currentStep: 'start', history: [] };
function openTechWizard() {
    // Teknik Sihirbaz artık Teknik (tam ekran) içinde
    openTechArea('wizard');
}
function twRenderStep() {
    const contentDiv = document.getElementById('tech-wizard-content') || document.getElementById('x-wizard');
    const backBtn = document.getElementById('tw-btn-back');
    if (!contentDiv) return;
    const stepData = techWizardData[twState.currentStep];
    if (twState.history.length > 0) backBtn.style.display = 'block'; else backBtn.style.display = 'none';
    if (!stepData) { contentDiv.innerHTML = `<div class="alert" style="color:red;">Hata: Adım bulunamadı (${twState.currentStep}).</div>`; return; }
    let editBtn = (isAdminMode && isEditingActive) ? `<button class="btn-edit-wizard" onclick="openWizardEditor('TechWizardSteps', '${twState.currentStep}')" style="float:right; background:none; border:none; color:#eee; cursor:pointer;" title="Bu adımı düzenle"><i class="fas fa-edit"></i></button>` : '';
    let html = `${editBtn}<div class="tech-step-title">${stepData.title || ''}</div>`;
    if (stepData.text) html += `<p style="font-size:1rem; margin-bottom:15px;">${stepData.text}</p>`;
    if (stepData.script) {
        const safeScript = encodeURIComponent(stepData.script);
        html += `<div class="tech-script-box"><span class="tech-script-label">Müşteriye iletilecek:</span>"${stepData.script}"<div style="margin-top:10px; text-align:right;"><button class="btn btn-copy" style="font-size:0.8rem; padding:5px 10px;" onclick="copyScriptContent('${safeScript}')"><i class="fas fa-copy"></i> Kopyala</button></div></div>`;
    }
    if (stepData.alert) html += `<div class="tech-alert">${stepData.alert}</div>`;
    if (stepData.buttons && stepData.buttons.length > 0) {
        html += `<div class="tech-buttons-area">`;
        stepData.buttons.forEach(btn => { let btnClass = btn.style === 'option' ? 'tech-btn-option' : 'tech-btn-primary'; html += `<button class="tech-btn ${btnClass}" onclick="twChangeStep('${btn.next}')">${btn.text}</button>`; });
        html += `</div>`;
    }
    contentDiv.innerHTML = html;
}
function twChangeStep(newStep) { twState.history.push(twState.currentStep); twState.currentStep = newStep; twRenderStep(); }
function twGoBack() { if (twState.history.length > 0) { twState.currentStep = twState.history.pop(); twRenderStep(); } }
function twResetWizard() { twState.currentStep = 'start'; twState.history = []; twRenderStep(); }
// ==========================================================
