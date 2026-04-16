// v8.5 "Düğüm Çözücü" - Saf TSV Motoru (Supbase mod için özel)
async function fetchGSheetRawTSV(url) {
    return new Promise(async (resolve, reject) => {
        console.log("[Pusula] v8.5 Scraper Aktif (Supbase Mod)");
        const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!idMatch) return reject(new Error("Geçersiz link"));
        
        const sheetId = idMatch[1];
        const gidMatch = url.match(/gid=([0-9]+)/);
        const gid = gidMatch ? gidMatch[1] : 0;
        
        const targetTsvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=tsv&gid=${gid}`;
        const proxies = [
            `https://corsproxy.io/?${encodeURIComponent(targetTsvUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(targetTsvUrl)}&t=${Date.now()}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetTsvUrl)}`
        ];

        const tryProxy = async (pIdx) => {
            if (pIdx >= proxies.length) throw new Error("Tüm proxy servisleri başarısız oldu.");
            try {
                const response = await fetch(proxies[pIdx]);
                const text = await response.text();
                if (!text || text.length < 50) throw new Error("Boş veri");
                return text;
            } catch (err) { return tryProxy(pIdx + 1); }
        };

        try {
            const tsvText = await tryProxy(0);
            const lines = tsvText.replace(/\r/g, "").split('\n').filter(l => l.trim());
            const tsvRows = lines.map(line => line.split('\t').map(c => c.trim()));

            // 🕵️‍♂️ ULTIMATE SCRAPER v7.1 (Sınırsız Başlık ve Saat Avcısı)
            let idxTitle = 1, idxTime = 3, idxNote = 4, idxSpiker = 5;

            for (let i = 0; i < Math.min(tsvRows.length, 100); i++) {
                const rowStr = (tsvRows[i] || []).join(' ').toLowerCase();
                if (rowStr.includes('event') || rowStr.includes('karşılaşma') || rowStr.includes('tsi')) {
                    const h = tsvRows[i].map(t => t.toLowerCase());
                    idxTitle = h.findIndex(t => t.includes('event') || t.includes('karşılaşma')) || 1;
                    idxTime = h.findIndex(t => t.includes('ko/') || t.includes('ko start') || t.includes('tsi')) || 3;
                    idxNote = h.findIndex(t => t.includes('end time') || t.includes('notlar')) || 4;
                    idxSpiker = h.findIndex(t => t.includes('announcer') || h.includes('spiker')) || 5;
                    break;
                }
            }

            const excelTimeToString = (val) => {
                const num = parseFloat(val);
                if (isNaN(num) || num < 0 || num > 1 || String(val).includes(':')) return String(val).trim();
                const totalMinutes = Math.round(num * 1440);
                const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
                const m = String(totalMinutes % 60).padStart(2, '0');
                return `${h}:${m}`;
            };

            let lastDate = "";
            const rows = tsvRows.map((cells, rIdx) => {
                if (cells[0] && cells[0].match(/\d+/)) lastDate = cells[0];
                
                const normalizedCells = cells.map(excelTimeToString);
                const timeCells = normalizedCells.filter(c => /^\d{1,2}[:.]\d{2}([:.]\d{2})?$/.test(c.trim()));
                
                const foundStart = timeCells[0] || normalizedCells[idxTime] || "";
                let foundEnd = (timeCells.length > 1 ? timeCells[timeCells.length - 1] : normalizedCells[idxNote]) || "";

                return {
                    col_0: (cells[0] || lastDate),
                    col_1: (cells[idxTitle] || "").trim(),
                    col_3: foundStart,
                    col_4: String(foundEnd).trim(),
                    details: String(foundEnd).trim(),
                    broadcastEnd: String(foundEnd).trim(), // 🚀 SAF VERİ MÜHRÜ v8.5
                    _isSheet: true
                };
            }).filter(r => r.col_1 && r.col_1.length > 2 && r.col_3);

            console.log(`[Pusula] v8.5 Başarılı: ${rows.length} kayıt (Supbase Mod).`);
            resolve(rows);
        } catch (err) { reject(err); }
    });
}
