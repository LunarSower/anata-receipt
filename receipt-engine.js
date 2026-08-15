/* ===================================================================
 * ANATA RECEIPT — Receipt Engine
 * Thermal printer simulation: receipt rendering, barcode, QR code,
 * halftone photo processing, paper texture
 * =================================================================== */

const ReceiptEngine = (function () {
    'use strict';

    /* ===== Paper Colors ===== */
    const PAPER = {
        bg:    '#fdfbf6',
        text:  '#2a2a2a',
        light: '#888888',
        line:  '#cccccc',
    };

    /* ===== Fonts ===== */
    const FONT_MONO = '"JetBrains Mono", "SF Mono", "Courier New", monospace';
    const FONT_SANS = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    /* ===== Utility ===== */
    function getTimestamp() {
        const d = new Date();
        const Y = d.getFullYear();
        const M = String(d.getMonth() + 1).padStart(2, '0');
        const D = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return { date: `${Y}/${M}/${D}`, time: `${h}:${m}`, full: `${Y}-${M}-${D} ${h}:${m}` };
    }

    function generateReceiptNo() {
        let no = '';
        for (let i = 0; i < 4; i++) no += Math.floor(Math.random() * 10);
        return no;
    }

    function formatCurrency(amount, symbol) {
        const num = Math.round(amount);
        return symbol + num.toLocaleString();
    }

    /* ===== Jagged Bottom Edge (receipt tear-off) ===== */
    function drawJaggedEdge(ctx, y, width, height) {
        const toothWidth = 6;
        const teeth = Math.floor(width / toothWidth);
        const canvasH = ctx.canvas.height;

        // Build jagged path points - ensure last point reaches full width
        const points = [];
        for (let i = 0; i <= teeth; i++) {
            const x = i * toothWidth;
            const py = (i % 2 === 0) ? y + height : y;
            points.push({ x, y: py });
        }
        // Force the final point to exactly the full width
        const lastPt = points[points.length - 1];
        if (lastPt.x < width) {
            // Extend the jagged pattern to the exact right edge
            const lastY = (teeth % 2 === 0) ? y : y + height;
            points.push({ x: width, y: lastY });
        }

        // Erase everything below the jagged line (make it transparent)
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (const pt of points) {
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.lineTo(width, canvasH);
        ctx.lineTo(0, canvasH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Draw a thin line along the jagged edge for definition
        ctx.strokeStyle = PAPER.line;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (const pt of points) {
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
    }

    /* ===== Barcode (CODE128-like) ===== */
    function drawBarcode(ctx, x, y, width, height) {
        const quietZone = 8;
        const availWidth = width - quietZone * 2;

        // Generate pattern: array of [width_units, is_bar]
        // Alternating bar (black) and space (white)
        const pattern = [];
        let seed = (Date.now() % 100000) + 1;
        const rand = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        // Start guard pattern (CODE B start): 2,1,1,2,1,2
        const startPattern = [2, 1, 1, 2, 1, 2];
        for (let i = 0; i < startPattern.length; i++) {
            pattern.push([startPattern[i], i % 2 === 0]);
        }

        // Data characters: each 6 elements (3 bars + 3 spaces), widths 1-4
        const numChars = 10 + Math.floor(rand() * 4);
        for (let c = 0; c < numChars; c++) {
            for (let i = 0; i < 6; i++) {
                pattern.push([1 + Math.floor(rand() * 3), i % 2 === 0]);
            }
        }

        // Checksum character
        for (let i = 0; i < 6; i++) {
            pattern.push([1 + Math.floor(rand() * 3), i % 2 === 0]);
        }

        // Stop pattern: 2,3,3,1,1,1,2
        const stopPattern = [2, 3, 3, 1, 1, 1, 2];
        for (let i = 0; i < stopPattern.length; i++) {
            pattern.push([stopPattern[i], i % 2 === 0]);
        }

        // Calculate unit width
        const totalUnits = pattern.reduce((sum, p) => sum + p[0], 0);
        const unitW = availWidth / totalUnits;

        // Draw bars
        ctx.fillStyle = PAPER.text;
        let curX = x + quietZone;
        for (const [w, isBar] of pattern) {
            if (isBar) {
                const barWidth = Math.max(0.5, w * unitW);
                ctx.fillRect(curX, y, barWidth, height);
            }
            curX += w * unitW;
        }

        // Draw number below barcode
        ctx.fillStyle = PAPER.text;
        ctx.font = `8px ${FONT_MONO}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        let numStr = '';
        let s2 = seed;
        for (let i = 0; i < 13; i++) {
            s2 = (s2 * 9301 + 49297) % 233280;
            numStr += Math.floor((s2 / 233280) * 10);
        }
        ctx.fillText(numStr, x + width / 2, y + height + 2);
    }

    /* ===== QR Code (simplified pattern) ===== */
    function drawQRCode(ctx, x, y, size) {
        const modules = 21;
        const cellSize = size / modules;

        // Generate a deterministic pattern
        const pattern = [];
        let seed = Math.floor(Date.now() / 1000) % 1000000;
        for (let i = 0; i < modules * modules; i++) {
            seed = (seed * 9301 + 49297) % 233280;
            pattern.push(seed / 233280 > 0.5);
        }

        // Draw modules
        ctx.fillStyle = PAPER.text;
        for (let row = 0; row < modules; row++) {
            for (let col = 0; col < modules; col++) {
                if (pattern[row * modules + col]) {
                    ctx.fillRect(
                        x + col * cellSize,
                        y + row * cellSize,
                        cellSize + 0.5,
                        cellSize + 0.5
                    );
                }
            }
        }

        // Position detection patterns (corners)
        const drawFinder = (fx, fy) => {
            // Outer square
            ctx.fillStyle = PAPER.text;
            ctx.fillRect(fx, fy, cellSize * 7, cellSize * 7);
            // Inner white
            ctx.fillStyle = PAPER.bg;
            ctx.fillRect(fx + cellSize, fy + cellSize, cellSize * 5, cellSize * 5);
            // Inner black
            ctx.fillStyle = PAPER.text;
            ctx.fillRect(fx + cellSize * 2, fy + cellSize * 2, cellSize * 3, cellSize * 3);
        };

        drawFinder(x, y);
        drawFinder(x + cellSize * 14, y);
        drawFinder(x, y + cellSize * 14);

        // Clear data under finders
        ctx.fillStyle = PAPER.bg;
        // Already handled by drawFinder
    }

    /* ===== Stamp ===== */
    function drawStamp(ctx, cx, cy, radius, text) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.15);

        // Outer circle
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner circle
        ctx.beginPath();
        ctx.arc(0, 0, radius - 4, 0, Math.PI * 2);
        ctx.stroke();

        // Text
        ctx.fillStyle = '#c0392b';
        ctx.font = `bold 10px ${FONT_SANS}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text || 'RECEIVED', 0, 0);

        ctx.restore();
    }

    /* ===== Paper Texture ===== */
    function applyPaperTexture(ctx, w, h, intensity) {
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        let seed = 98765;
        for (let i = 0; i < d.length; i += 4) {
            seed = (seed * 9301 + 49297) % 233280;
            const n = (seed / 233280 - 0.5) * intensity;
            d[i]     = Math.max(0, Math.min(255, d[i] + n));
            d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
            d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
        }
        ctx.putImageData(imgData, 0, 0);
    }

    /* ===== Torn Edge (perforated line) ===== */
    function drawTornEdge(ctx, y, width) {
        ctx.fillStyle = PAPER.line;
        ctx.fillRect(0, y, width, 1);

        // Dashed line
        ctx.strokeStyle = PAPER.light;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(width - 10, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /* ===== Halftone Photo Processing (B&W only) ===== */
    function processHalftonePhoto(image, targetW, targetH) {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        // Draw image
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(image, 0, 0, targetW, targetH);

        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        const data = imageData.data;

        const black = [42, 42, 42];
        const gray = [120, 120, 120];

        // Halftone: convert to B&W halftone
        const cellSize = 4;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = targetW;
        outCanvas.height = targetH;
        const outCtx = outCanvas.getContext('2d');
        outCtx.fillStyle = '#ffffff';
        outCtx.fillRect(0, 0, targetW, targetH);

        for (let y = 0; y < targetH; y += cellSize) {
            for (let x = 0; x < targetW; x += cellSize) {
                // Average brightness in cell
                let sumR = 0, sumG = 0, sumB = 0, count = 0;
                for (let dy = 0; dy < cellSize && y + dy < targetH; dy++) {
                    for (let dx = 0; dx < cellSize && x + dx < targetW; dx++) {
                        const idx = ((y + dy) * targetW + (x + dx)) * 4;
                        sumR += data[idx];
                        sumG += data[idx + 1];
                        sumB += data[idx + 2];
                        count++;
                    }
                }

                const avgR = sumR / count;
                const avgG = sumG / count;
                const avgB = sumB / count;
                const luminance = (0.299 * avgR + 0.587 * avgG + 0.114 * avgB) / 255;
                const darkness = 1 - luminance;

                const dotR = darkness * cellSize * 0.55;
                if (dotR < 0.3) continue;

                // B&W: dark areas use black, mid-tones use gray
                const ink = darkness > 0.5 ? black : gray;

                // Draw dot
                outCtx.fillStyle = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
                outCtx.beginPath();
                outCtx.arc(x + cellSize / 2, y + cellSize / 2, dotR, 0, Math.PI * 2);
                outCtx.fill();
            }
        }

        return outCanvas;
    }

    /* ===== Draw Dashed Separator ===== */
    function drawSeparator(ctx, y, width) {
        ctx.strokeStyle = PAPER.light;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(8, y);
        ctx.lineTo(width - 8, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /* ===== Text Helpers ===== */
    function text(ctx, str, x, y, font, color, align) {
        ctx.font = font;
        ctx.fillStyle = color || PAPER.text;
        ctx.textAlign = align || 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(str, x, y);
    }

    function textCenter(ctx, str, x, y, font, color) {
        text(ctx, str, x, y, font, color, 'center');
    }

    function textRight(ctx, str, x, y, font, color) {
        text(ctx, str, x, y, font, color, 'right');
    }

    /* ===== Build Snap Receipt ===== */
    function buildSnapReceipt(image, caption, options) {
        const W = options.width || 320;
        const padding = 16;
        const ts = getTimestamp();
        const receiptNo = generateReceiptNo();

        // Calculate photo area - match original aspect ratio
        const photoW = W - padding * 2;
        const imgRatio = (image.naturalWidth || image.width) / (image.naturalHeight || image.height);
        const photoH = Math.round(photoW / Math.max(0.5, Math.min(2, imgRatio)));

        // Pre-render halftone photo (B&W)
        const halftoneCanvas = processHalftonePhoto(image, photoW, photoH);

        // Calculate total height
        let y = 0;
        const headerH = 70;
        const photoSectionH = photoH + 20;
        const footerH = 195;
        const totalH = headerH + photoSectionH + footerH;

        // Create receipt canvas
        const canvas = document.createElement('canvas');
        const scale = 2; // High DPI
        canvas.width = W * scale;
        canvas.height = totalH * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        // Background
        ctx.fillStyle = PAPER.bg;
        ctx.fillRect(0, 0, W, totalH);

        // Apply paper texture
        applyPaperTexture(ctx, W, totalH, 8);

        // ===== Header =====
        y = 14;
        textCenter(ctx, 'ANATA RECEIPT', W / 2, y, `bold 14px ${FONT_MONO}`, PAPER.text);
        y += 20;
        textCenter(ctx, 'SNAP RECEIPT', W / 2, y, `10px ${FONT_MONO}`, PAPER.light);
        y += 16;
        drawSeparator(ctx, y, W);
        y += 10;
        text(ctx, `${ts.date}`, padding, y, `10px ${FONT_MONO}`, PAPER.light);
        textRight(ctx, `${ts.time}`, W - padding, y, `10px ${FONT_MONO}`, PAPER.light);
        y += 14;

        // ===== Photo =====
        ctx.drawImage(halftoneCanvas, padding, y, photoW, photoH);
        y += photoH + 8;

        // Caption
        if (caption) {
            textCenter(ctx, caption, W / 2, y, `11px ${FONT_SANS}`, PAPER.text);
            y += 16;
        } else {
            y += 8;
        }

        drawSeparator(ctx, y, W);
        y += 10;

        // ===== Footer =====
        text(ctx, `No. ${receiptNo}`, padding, y, `10px ${FONT_MONO}`, PAPER.light);
        textRight(ctx, `**** ${ts.date.replace(/\//g, '').slice(-4)} ****`, W - padding, y, `10px ${FONT_MONO}`, PAPER.light);
        y += 16;

        // Barcode
        if (options.barcode !== false) {
            drawBarcode(ctx, padding, y, W - padding * 2, 26);
            y += 42;
        }

        // QR Code
        if (options.qrcode !== false) {
            const qrSize = 56;
            drawQRCode(ctx, (W - qrSize) / 2, y, qrSize);
            y += qrSize + 8;
        }

        // Stamp
        if (options.stamp) {
            drawStamp(ctx, W - 32, y - 20, 18, 'OK');
        }

        // Thank you
        textCenter(ctx, 'THANK YOU FOR COMING', W / 2, y, `bold 10px ${FONT_MONO}`, PAPER.text);
        y += 14;
        textCenter(ctx, 'ANATA RECEIPT', W / 2, y, `8px ${FONT_MONO}`, PAPER.light);
        y += 20;

        // Jagged bottom edge
        drawJaggedEdge(ctx, y, W, 5);

        return canvas;
    }

    /* ===== Build Custom Receipt ===== */
    function buildCustomReceipt(data, options) {
        const W = options.width || 320;
        const padding = 16;
        const ts = getTimestamp();
        const receiptNo = generateReceiptNo();
        const symbol = data.currency || '\u00a5';
        const storeName = data.storeName || 'ANATA RECEIPT';
        const title = data.title || 'CUSTOM RECEIPT';

        // Calculate items height
        const items = data.items.filter(i => i.name || i.amount);
        const itemLineH = 18;
        const itemsH = Math.max(itemLineH, items.length * itemLineH) + 10;

        // Photo height
        let photoH = 0;
        if (data.photo) {
            const photoW = W - padding * 2;
            const imgRatio = (data.photo.naturalWidth || data.photo.width) / (data.photo.naturalHeight || data.photo.height);
            photoH = Math.round(photoW / Math.max(0.5, Math.min(2, imgRatio))) + 10;
        }

        // Total height
        const headerH = 80;
        const totalSectionH = 50;
        const footerH = 150;
        const totalH = headerH + itemsH + photoH + totalSectionH + footerH;

        // Create canvas
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = W * scale;
        canvas.height = totalH * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        // Background
        ctx.fillStyle = PAPER.bg;
        ctx.fillRect(0, 0, W, totalH);
        applyPaperTexture(ctx, W, totalH, 8);

        // ===== Header =====
        let y = 14;
        textCenter(ctx, storeName, W / 2, y, `bold 14px ${FONT_MONO}`, PAPER.text);
        y += 20;
        textCenter(ctx, title, W / 2, y, `11px ${FONT_SANS}`, PAPER.text);
        y += 18;
        drawSeparator(ctx, y, W);
        y += 8;
        text(ctx, `${ts.date} ${ts.time}`, padding, y, `10px ${FONT_MONO}`, PAPER.light);
        textRight(ctx, `No. ${receiptNo}`, W - padding, y, `10px ${FONT_MONO}`, PAPER.light);
        y += 16;
        drawSeparator(ctx, y, W);
        y += 8;

        // ===== Items =====
        let total = 0;
        for (const item of items) {
            const name = item.name || '';
            const amount = parseFloat(item.amount) || 0;
            total += amount;

            text(ctx, name, padding, y, `11px ${FONT_SANS}`, PAPER.text);
            if (amount > 0) {
                textRight(ctx, formatCurrency(amount, symbol), W - padding, y, `11px ${FONT_MONO}`, PAPER.text);
            }
            y += itemLineH;
        }

        y += 4;
        drawSeparator(ctx, y, W);
        y += 10;

        // ===== Photo =====
        if (data.photo && photoH > 0) {
            const photoW = W - padding * 2;
            const drawH = photoH - 10;
            // Draw photo with simple halftone
            const halftone = processHalftonePhoto(data.photo, photoW, drawH);
            ctx.drawImage(halftone, padding, y, photoW, drawH);
            y += photoH;
            drawSeparator(ctx, y, W);
            y += 10;
        }

        // ===== Total =====
        text(ctx, 'TOTAL', padding, y, `bold 12px ${FONT_MONO}`, PAPER.text);
        textRight(ctx, formatCurrency(total, symbol), W - padding, y, `bold 14px ${FONT_MONO}`, PAPER.text);
        y += 24;

        // Tax line
        const tax = Math.round(total * 0.1);
        text(ctx, '(Tax 10%)', padding, y, `9px ${FONT_MONO}`, PAPER.light);
        textRight(ctx, formatCurrency(tax, symbol), W - padding, y, `9px ${FONT_MONO}`, PAPER.light);
        y += 16;
        drawSeparator(ctx, y, W);
        y += 10;

        // ===== Footer =====
        if (options.barcode !== false) {
            drawBarcode(ctx, padding, y, W - padding * 2, 26);
            y += 42;
        }

        if (options.qrcode !== false) {
            const qrSize = 50;
            drawQRCode(ctx, (W - qrSize) / 2, y, qrSize);
            y += qrSize + 6;
        }

        if (options.stamp) {
            drawStamp(ctx, W - 30, y - 16, 16, 'OK');
        }

        textCenter(ctx, 'THANK YOU FOR COMING', W / 2, y, `bold 10px ${FONT_MONO}`, PAPER.text);
        y += 14;
        textCenter(ctx, 'ANATA RECEIPT', W / 2, y, `8px ${FONT_MONO}`, PAPER.light);
        y += 20;

        // Jagged bottom edge
        drawJaggedEdge(ctx, y, W, 5);

        return canvas;
    }

    /* ===== Public API ===== */
    return {
        PAPER,
        FONT_MONO,
        FONT_SANS,
        buildSnapReceipt,
        buildCustomReceipt,
        processHalftonePhoto,
        drawBarcode,
        drawQRCode,
        drawStamp,
        applyPaperTexture,
        getTimestamp,
        generateReceiptNo,
    };
})();
