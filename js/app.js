// --- YARDIMCI FONKSİYONLAR ---

/**
 * Bir JavaScript nesnesini JSON formatında yanıt olarak döndürür.
 * @param {Object} content - Yanıt içeriği.
 * @returns {GoogleAppsScript.Content.TextOutput} JSON formatında yanıt.
 */
function responseJSON(content) {
    return ContentService.createTextOutput(JSON.stringify(content)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Kullanıcı adı ve token'a göre kullanıcının rolünü (yetkisini) kontrol eder.
 * @param {string} user - Kullanıcı adı.
 * @param {string} token - Kullanıcının oturum token'ı.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} tokensSheet - Token'ların tutulduğu sayfa.
 * @returns {string|null} Rolü (admin, user vb.) veya geçersizse null.
 */
function getRoleFromToken(user, token, tokensSheet) {
    if (!user || !token) return null;
    var lastRow = tokensSheet.getLastRow();
    if (lastRow < 2) return null;
    // Performans için son 500 satırda ara
    var startRow = Math.max(2, lastRow - 500);
    var data = tokensSheet.getRange(startRow, 1, lastRow - startRow + 1, 4).getValues();
    for (var i = data.length - 1; i >= 0; i--) {
        // 1: Username, 2: Token, 3: Role
        if (data[i][1] == user && data[i][2] == token) return data[i][3];
    }
    return null;
}

// ----------------------------------------------------------------------
// --- GÜVENLİ VERİ ÇEKME FONKSİYONU (YENİ) ---
// ----------------------------------------------------------------------

/**
 * Tüm içeriği (kartlar, duyurular, quiz vb.) Apps Script'in bağlı olduğu
 * Sheets dosyasındaki "Data" sayfasından çeker.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} dataSheet - "Data" sayfası objesi.
 */
function handleFetchData(dataSheet) {
    try {
        if (!dataSheet) return responseJSON({ result: "error", message: "Data sayfası bulunamadı." });

        // A2 hücresinden itibaren tüm veriyi çek
        const allData = dataSheet.getDataRange().getValues();
        
        if (allData.length < 2) return responseJSON({ result: "success", data: [] });
        
        const headers = allData[0]; 
        const results = [];

        // Başlıkları atla (i=1)
        for (let i = 1; i < allData.length; i++) {
            const row = allData[i]; 
            const obj = {};
            for (let j = 0; j < headers.length && j < row.length; j++) {
                // Sütun başlığını küçük harf yap
                obj[headers[j].trim()] = row[j];
            }
            results.push(obj);
        }

        return responseJSON({ result: "success", data: results });

    } catch (e) { 
        return responseJSON({ result: "error", message: "Veri çekme hatası (Yerel Sheets): " + e.toString() }); 
    }
}


// ----------------------------------------------------------------------
// --- ANA İŞLEM (doPost) ---
// ----------------------------------------------------------------------

function doPost(e) {
    var lock = LockService.getScriptLock();
    // 10 saniye bekleme süresi
    if (!lock.tryLock(10000)) return responseJSON({ result: "error", message: "Sunucu yoğun." });

    try {
        if (!e || !e.postData) return responseJSON({ result: "error", message: "Veri yok." });
        var data = JSON.parse(e.postData.contents);
        var action = data.action;
        var ss = SpreadsheetApp.getActiveSpreadsheet();

        // --- SAYFA TANIMLAMALARI ---
        var sheet = ss.getSheetByName("Data");
        var usersSheet = ss.getSheetByName("Users");
        var logsSheet = ss.getSheetByName("Logs");

        var tokensSheet = ss.getSheetByName("Tokens");
        if (!tokensSheet) { tokensSheet = ss.insertSheet("Tokens"); tokensSheet.appendRow(["Date", "Username", "Token", "Role"]); }

        var quizSheet = ss.getSheetByName("QuizResults");
        if (!quizSheet) { quizSheet = ss.insertSheet("QuizResults"); quizSheet.appendRow(["Date", "Username", "Score", "TotalQuestions", "SuccessRate"]); }

        var evalSheet = ss.getSheetByName("Evaluations");
        if (!evalSheet) { evalSheet = ss.insertSheet("Evaluations"); evalSheet.appendRow(["Date", "Evaluator", "AgentName", "Group", "CallID", "Score", "Details", "Feedback", "CallDate"]); }

        var settingsSheet = ss.getSheetByName("Settings");
        if (!settingsSheet) { settingsSheet = ss.insertSheet("Settings"); settingsSheet.appendRow(["Grup", "Soru", "Puan", "Sira"]); }

        var telesatisSheet = ss.getSheetByName("Telesatis_Logs");
        if (!telesatisSheet) { telesatisSheet = ss.insertSheet("Telesatis_Logs"); }

        var chatSheet = ss.getSheetByName("Chat_Logs");
        if (!chatSheet) { chatSheet = ss.insertSheet("Chat_Logs"); }

        // --- İŞLEM YÖNLENDİRMELERİ (Ön Yetkilendirme Gerektirmeyenler) ---

        // GÜNCELLEME: handleFetchData artık Sheets objesini alıyor.
        if (action == "fetchData") return handleFetchData(sheet);
        if (action == "login") return handleLogin(data, usersSheet, tokensSheet, logsSheet);
        if (action == "getLeaderboard") return handleGetLeaderboard(quizSheet);

        // Yetki Kontrolü
        var username = data.username;
        var userToken = data.token;
        var activeRole = getRoleFromToken(username, userToken, tokensSheet);
        if (!activeRole) return responseJSON({ result: "error", message: "Oturum geçersiz." });

        // --- KULLANICI LİSTESİ (GRUPLARIYLA BERABER) ---
        if (action == "getUserList") {
            if (activeRole !== "admin") return responseJSON({ result: "error", message: "Yetkiniz yok!" });
            var usersData = usersSheet.getDataRange().getValues();
            var userList = usersData.length > 1 ? usersData.slice(1).map(function(r){
                return { name: r[0], group: r[3] || 'Genel' };
            }) : [];
            return responseJSON({ result: "success", users: userList });
        }

        // --- KRİTERLERİ (SORULARI) AYARLARDAN ÇEKME ---
        if (action == "getCriteria") {
            var allSettings = settingsSheet.getDataRange().getValues();
            var criteriaList = [];
            for(var i=1; i<allSettings.length; i++) {
                if(data.group === 'all' || allSettings[i][0] === data.group) {
                    criteriaList.push({
                        group: allSettings[i][0],
                        text: allSettings[i][1],
                        points: allSettings[i][2],
                        order: allSettings[i][3]
                    });
                }
            }
            criteriaList.sort(function(a, b){ return a.order - b.order });
            return responseJSON({ result: "success", criteria: criteriaList });
        }

        // --- DEĞERLENDİRME KAYDETME (ÇAĞRI TARİHİ EKLENDİ) ---
        if (action == "logEvaluation") {
            if (activeRole !== "admin") return responseJSON({ result: "error", message: "Yetkiniz yok!" });
            var evalDate = Utilities.formatDate(new Date(), "GMT+3", "dd.MM.yyyy");
            var callDate = data.callDate || '';
            var detailsObj;
            try { detailsObj = JSON.parse(data.details); } catch (e) { detailsObj = []; }
            var scoresAndNotes = [];
            if (Array.isArray(detailsObj)) {
                for (var i = 0; i < detailsObj.length; i++) {
                    scoresAndNotes.push(detailsObj[i].score);
                    scoresAndNotes.push(detailsObj[i].note || "");
                }
            }

            // A) TELESATIŞ & CHAT LOGLAMA
            if (data.agentGroup === 'Telesatış' && telesatisSheet) {
                var rowData = [evalDate, data.agentName, data.callId, callDate];
                rowData = rowData.concat(scoresAndNotes);
                rowData.push(data.score); rowData.push(username); rowData.push(data.feedback);
                telesatisSheet.appendRow(rowData);
            } else if (data.agentGroup === 'Chat' && chatSheet) {
                var rowData = [evalDate, data.agentName, data.callId, callDate];
                rowData = rowData.concat(scoresAndNotes);
                rowData.push(data.score); rowData.push(username); rowData.push(data.feedback);
                chatSheet.appendRow(rowData);
            }

            // C) GENEL YEDEK (Evaluations sayfasına kaydet)
            evalSheet.appendRow([
                new Date(), username, data.agentName, data.agentGroup, data.callId,
                data.score, data.details, data.feedback, callDate
            ]);

            if(logsSheet) logsSheet.appendRow([new Date(), username, "Kalite Değerlendirme", data.agentName]);
            return responseJSON({ result: "success", message: "Değerlendirme başarıyla kaydedildi." });
        }

        // --- DİĞER STANDART İŞLEMLER ---
        if (action == "fetchEvaluations") return handleFetchEvaluations(data, username, activeRole, evalSheet);

        if (action == "logQuiz") {
            var totalQ = data.total || 10;
            var rate = "%" + Math.round((data.score / (totalQ * 10)) * 100);
            quizSheet.appendRow([new Date(), username, data.score, totalQ, rate]);
            return responseJSON({ result: "success" });
        }
        if (action == "changePassword") return handleChangePassword(data, usersSheet, logsSheet, username);

        if (action == "addCard") {
            if (activeRole !== "admin") return responseJSON({ result: "error", message: "Yetki yok." });
            sheet.appendRow([data.cardType, data.category, data.title, data.text, data.script, "", data.code || "", data.link || "", "'" + data.date, "", data.tip || "", data.detail || "", data.pronunciation || "", "", "", data.status || ""]);
            return responseJSON({ result: "success" });
        }

        if (action == "updateContent") {
            if (activeRole !== "admin") return responseJSON({ result: "error", message: "Yetki yok." });
            return handleUpdateContent(data, sheet, username, logsSheet);
        }

        return responseJSON({ result: "error", message: "Geçersiz işlem." });

    } catch (err) { return responseJSON({ result: "error", error: err.toString() }); } finally { lock.releaseLock(); }
}

// ----------------------------------------------------------------------
// --- ALT FONKSİYONLAR ---
// ----------------------------------------------------------------------

function handleLogin(data, usersSheet, tokensSheet, logsSheet) {
    var inputUser = data.username; var inputPass = data.password;
    var users = usersSheet.getDataRange().getValues();
    var defaultHashes = ["03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", "ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f"];
    for (var i = 1; i < users.length; i++) {
        if (users[i][0] == inputUser && users[i][1] == inputPass) {
            var token = Utilities.getUuid();
            tokensSheet.appendRow([new Date(), inputUser, token, users[i][2]]);
            if(logsSheet) logsSheet.appendRow([new Date(), inputUser, "Giriş", users[i][2]]);
            return responseJSON({
                result: "success",
                username: inputUser,
                token: token,
                role: users[i][2],
                forceChange: defaultHashes.includes(inputPass)
            });
        }
    }
    return responseJSON({ result: "error", message: "Hatalı giriş." });
}

/**
 * Kullanıcının aldığı değerlendirmeleri (evaluasyonları) getirir.
 */
function handleFetchEvaluations(data, username, activeRole, evalSheet) {
    var targetAgent = data.targetAgent;
    // Güvenlik Kontrolü:
    if (activeRole !== "admin" && targetAgent !== username) return responseJSON({ result: "error", message: "Yetkisiz erişim." });
    
    var d = evalSheet.getDataRange().getValues();
    var filtered = [];
    for (var i = 1; i < d.length; i++) {
        if (d[i][2] === targetAgent) {
            filtered.push({
                date: d[i][0] ? Utilities.formatDate(new Date(d[i][0]), "GMT+3", "dd.MM.yyyy") : 'N/A',
                evaluator: d[i][1],
                group: d[i][3],
                callId: d[i][4],
                score: d[i][5],
                details: d[i][6],
                feedback: d[i][7],
                callDate: d[i][8] || 'N/A' 
            });
        }
    }
    return responseJSON({ result: "success", evaluations: filtered });
}

/**
 * Quiz sonuçlarına göre liderlik tablosunu (top 5) hesaplar. 🏆
 */
function handleGetLeaderboard(quizSheet) {
    if (!quizSheet) return responseJSON({ result: "success", leaderboard: [] });

    var d = quizSheet.getDataRange().getValues();
    if (d.length < 2) return responseJSON({ result: "success", leaderboard: [] });

    var rawRows = d.slice(1);
    var userStats = {};

    for (var i = 0; i < rawRows.length; i++) {
        var u = rawRows[i][1];
        var s = parseInt(rawRows[i][2]);
        if (isNaN(s)) continue;
        if (!userStats[u]) {
            userStats[u] = { totalScore: 0, games: 0 };
        }
        userStats[u].totalScore += s;
        userStats[u].games += 1;
    }

    var leaderboard = [];
    for (var user in userStats) {
        var avg = Math.round(userStats[user].totalScore / userStats[user].games);
        leaderboard.push({ username: user, average: avg, games: userStats[user].games });
    }

    leaderboard.sort(function(a, b) { return b.average - a.average; });

    var top5 = leaderboard.slice(0, 5);

    return responseJSON({ result: "success", leaderboard: top5 });
}


function handleChangePassword(data, usersSheet, logsSheet, username) {
    var rows = usersSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] == username && rows[i][1] == data.oldPass) {
            usersSheet.getRange(i + 1, 2).setValue(data.newPass);
            if(logsSheet) logsSheet.appendRow([new Date(), username, "Şifre Değişimi", "Başarılı"]);
            return responseJSON({ result: "success" });
        }
    }
    return responseJSON({ result: "error", message: "Eski şifre hatalı." });
}

function handleUpdateContent(data, sheet, username, logsSheet) {
    var rows = sheet.getDataRange().getValues();
    var colMap = { "Category": 2, "Title": 3, "Text": 4, "Script": 5, "Code": 7, "Link": 8, "Date": 9, "Tip": 11, "Detail": 12, "Pronunciation": 13, "QuizOptions": 14, "QuizAnswer": 15, "Status": 16 };
    var colIndex = colMap[data.column];
    var searchKey = data.originalText || data.title;

    for (var r = 1; r < rows.length; r++) {
        if (rows[r][2] == searchKey) {
            sheet.getRange(r + 1, colIndex).setValue(data.value);
            if(logsSheet) logsSheet.appendRow([new Date(), username, "Düzenleme", data.column]);
            return responseJSON({ result: "success" });
        }
    }
    return responseJSON({ result: "error", message: "İçerik bulunamadı." });
}
