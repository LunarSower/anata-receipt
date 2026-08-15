/* ===================================================================
 * ANATA RECEIPT - Application Logic
 * Tab switching, file upload, printer animation, receipt stack,
 * drag-to-tear and double-click-to-tear with left-to-right rip animation
 * =================================================================== */

(function () {
    'use strict';

    /* ===== State ===== */
    const state = {
        receiptType: 'snap',
        snapPhoto: null,
        customPhoto: null,
        currency: '\u00a5',
        width: 320,
        options: { barcode: true, qrcode: true, stamp: false },
        stack: [],
        currentReceipt: null,
        isPrinting: false,
        isTearing: false,
    };

    /* ===== DOM ===== */
    const $ = (id) => document.getElementById(id);
    const dom = {
        tabs: document.querySelectorAll('.tab-btn'),
        snapInput: $('snap-input'),
        customInput: $('custom-input'),
        snapUploadZone: $('snap-upload-zone'),
        snapFileInput: $('snap-file-input'),
        snapPlaceholder: $('snap-placeholder'),
        snapPreview: $('snap-preview'),
        snapCaptionRow: $('snap-caption-row'),
        snapCaption: $('snap-caption'),
        tearHint: $('tear-hint'),
        customTitle: $('custom-title'),
        customStore: $('custom-store'),
        itemsList: $('items-list'),
        addItemBtn: $('add-item-btn'),
        customUploadZone: $('custom-upload-zone'),
        customFileInput: $('custom-file-input'),
        customPlaceholder: $('custom-placeholder'),
        customPreview: $('custom-preview'),
        currencyBtns: document.querySelectorAll('.currency-btn'),
        widthBtns: document.querySelectorAll('.width-btn'),
        barcodeCheckbox: $('barcode-checkbox'),
        qrcodeCheckbox: $('qrcode-checkbox'),
        stampCheckbox: $('stamp-checkbox'),
        issueBtn: $('issue-btn'),
        printerLed: $('printer-led'),
        receiptOutput: $('receipt-output'),
        stackBtn: $('stack-btn'),
        stackCount: $('stack-count'),
        stackModal: $('stack-modal'),
        closeStackBtn: $('close-stack-btn'),
        stackList: $('stack-list'),
        clearStackBtn: $('clear-stack-btn'),
        downloadAllBtn: $('download-all-btn'),
        loadingOverlay: $('loading-overlay'),
    };

    /* ===== Tab Switching ===== */
    function initTabs() {
        dom.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const type = tab.dataset.type;
                state.receiptType = type;
                dom.tabs.forEach(t => t.classList.toggle('active', t.dataset.type === type));
                dom.snapInput.style.display = type === 'snap' ? '' : 'none';
                dom.customInput.style.display = type === 'custom' ? '' : 'none';
                updateIssueButton();
            });
        });
    }

    /* ===== File Upload ===== */
    function initFileUpload(zone, input, placeholder, preview, stateKey) {
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) loadPhoto(file, placeholder, preview, stateKey);
        });
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) loadPhoto(file, placeholder, preview, stateKey);
            e.target.value = '';
        });
    }

    function loadPhoto(file, placeholder, preview, stateKey) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                state[stateKey] = img;
                preview.src = e.target.result;
                preview.style.display = 'block';
                placeholder.style.display = 'none';
                if (stateKey === 'snapPhoto') {
                    dom.snapCaptionRow.style.display = '';
                }
                dom.tearHint.style.display = '';
                updateIssueButton();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    /* ===== Custom Receipt: Items ===== */
    function initItems() {
        dom.addItemBtn.addEventListener('click', () => {
            const count = dom.itemsList.children.length;
            const row = document.createElement('div');
            row.className = 'item-row';
            row.dataset.item = count;
            row.innerHTML = `
                <input type="text" class="item-name" placeholder="Item name" maxlength="20">
                <input type="number" class="item-amount" placeholder="0" min="0">
                <button class="item-remove" title="Delete">x</button>
            `;
            dom.itemsList.appendChild(row);
            bindItemRemove(row);
            updateIssueButton();
        });
        document.querySelectorAll('.item-row').forEach(bindItemRemove);
    }

    function bindItemRemove(row) {
        const removeBtn = row.querySelector('.item-remove');
        removeBtn.addEventListener('click', () => {
            if (dom.itemsList.children.length > 1) {
                row.remove();
                updateIssueButton();
            } else {
                row.querySelector('.item-name').value = '';
                row.querySelector('.item-amount').value = '';
            }
        });
    }

    /* ===== Currency Toggle ===== */
    const CURRENCY_MAP = { 'yen': '\u00a5', 'usd': '$', 'eur': '\u20ac' };
    function initCurrency() {
        dom.currencyBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                state.currency = CURRENCY_MAP[btn.dataset.cur] || '\u00a5';
                dom.currencyBtns.forEach(b => b.classList.toggle('active', b === btn));
            });
        });
    }

    /* ===== Width Toggle ===== */
    function initWidth() {
        dom.widthBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                state.width = parseInt(btn.dataset.width);
                dom.widthBtns.forEach(b => b.classList.toggle('active', b === btn));
            });
        });
    }

    /* ===== Options Checkboxes ===== */
    function initOptions() {
        dom.barcodeCheckbox.addEventListener('change', () => { state.options.barcode = dom.barcodeCheckbox.checked; });
        dom.qrcodeCheckbox.addEventListener('change', () => { state.options.qrcode = dom.qrcodeCheckbox.checked; });
        dom.stampCheckbox.addEventListener('change', () => { state.options.stamp = dom.stampCheckbox.checked; });
    }

    /* ===== Issue Button State ===== */
    function updateIssueButton() {
        let enabled = false;
        if (state.receiptType === 'snap') {
            enabled = !!state.snapPhoto;
        } else {
            enabled = !!dom.customTitle.value.trim() ||
                      Array.from(dom.itemsList.children).some(r =>
                          r.querySelector('.item-name').value.trim() ||
                          r.querySelector('.item-amount').value.trim()
                      );
        }
        dom.issueBtn.disabled = !enabled;
    }

    document.addEventListener('input', (e) => {
        if (e.target.closest('#custom-input')) updateIssueButton();
    });

    /* ===== Print Receipt ===== */
    function initIssue() {
        dom.issueBtn.addEventListener('click', printReceipt);
    }

    function printReceipt() {
        if (state.isPrinting) return;
        state.isPrinting = true;
        dom.printerLed.classList.add('printing');
        dom.loadingOverlay.style.display = 'flex';

        setTimeout(() => {
            try {
                let canvas;
                const options = {
                    width: state.width,
                    barcode: state.options.barcode,
                    qrcode: state.options.qrcode,
                    stamp: state.options.stamp,
                };

                if (state.receiptType === 'snap') {
                    canvas = ReceiptEngine.buildSnapReceipt(
                        state.snapPhoto,
                        dom.snapCaption.value.trim(),
                        options
                    );
                } else {
                    const items = Array.from(dom.itemsList.children).map(row => ({
                        name: row.querySelector('.item-name').value.trim(),
                        amount: row.querySelector('.item-amount').value,
                    }));
                    canvas = ReceiptEngine.buildCustomReceipt({
                        title: dom.customTitle.value.trim(),
                        storeName: dom.customStore.value.trim(),
                        items: items,
                        photo: state.customPhoto,
                        currency: state.currency,
                    }, options);
                }

                state.currentReceipt = canvas;
                renderReceipt(canvas);
            } catch (e) {
                console.error('Print error:', e);
            } finally {
                setTimeout(() => {
                    dom.printerLed.classList.remove('printing');
                    dom.loadingOverlay.style.display = 'none';
                    state.isPrinting = false;
                }, 800);
            }
        }, 200);
    }

    function renderReceipt(canvas) {
        dom.receiptOutput.innerHTML = '';
        dom.receiptOutput.classList.add('has-receipt', 'printing', 'vibrating');

        const wrapper = document.createElement('div');
        wrapper.id = 'receipt-canvas-wrapper';
        wrapper.style.position = 'relative';

        const displayCanvas = document.createElement('canvas');
        const maxWidth = 400;
        const scale = Math.min(1, maxWidth / (canvas.width / 2));
        displayCanvas.width = (canvas.width / 2) * scale;
        displayCanvas.height = (canvas.height / 2) * scale;
        displayCanvas.className = 'receipt-canvas';
        displayCanvas.id = 'receipt-display-canvas';
        const dctx = displayCanvas.getContext('2d');
        dctx.drawImage(canvas, 0, 0, displayCanvas.width, displayCanvas.height);

        wrapper.appendChild(displayCanvas);

        const tornLine = document.createElement('div');
        tornLine.className = 'torn-line';
        wrapper.appendChild(tornLine);

        dom.receiptOutput.appendChild(wrapper);

        // Trigger feed-paper animation once
        wrapper.classList.add('animate-in');
        setTimeout(() => { wrapper.classList.remove('animate-in'); }, 1200);

        // Bind tear gestures
        bindTearGestures(wrapper, displayCanvas);

        setTimeout(() => { dom.receiptOutput.classList.remove('vibrating'); }, 1200);
        setTimeout(() => {
            dom.receiptOutput.classList.remove('printing');
            showReceiptActions(wrapper);
            // Scroll to show the full receipt
            setTimeout(() => {
                const printerArea = dom.receiptOutput.closest('.printer-area');
                if (printerArea) {
                    const wrapperRect = wrapper.getBoundingClientRect();
                    const areaRect = printerArea.getBoundingClientRect();
                    const currentScroll = printerArea.scrollTop;
                    const wrapperTop = wrapperRect.top - areaRect.top + currentScroll;
                    const wrapperBottom = wrapperRect.bottom - areaRect.top + currentScroll;
                    const visibleHeight = areaRect.height;
                    // If receipt bottom is below visible area, scroll to show it
                    if (wrapperBottom > currentScroll + visibleHeight) {
                        const targetScroll = wrapperBottom - visibleHeight + 40;
                        printerArea.scrollTo({
                            top: targetScroll,
                            behavior: 'smooth'
                        });
                    }
                }
            }, 200);
        }, 1300);
    }

    function showReceiptActions(wrapper) {
        // Floating tear hint on the receipt
        const tearHintFloat = document.createElement('div');
        tearHintFloat.className = 'tear-hint-float';
        tearHintFloat.innerHTML = '<span>Drag down or double-click to tear</span>';
        wrapper.appendChild(tearHintFloat);

        const actions = document.createElement('div');
        actions.className = 'receipt-actions visible';

        const keepBtn = document.createElement('button');
        keepBtn.className = 'receipt-action-btn primary';
        keepBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
            Tear & Keep
        `;
        keepBtn.addEventListener('click', () => startTearAnimation());

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'receipt-action-btn';
        downloadBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
        `;
        downloadBtn.addEventListener('click', () => downloadReceipt());

        const reprintBtn = document.createElement('button');
        reprintBtn.className = 'receipt-action-btn';
        reprintBtn.textContent = 'Reprint';
        reprintBtn.addEventListener('click', () => {
            if (state.currentReceipt) renderReceipt(state.currentReceipt);
        });

        actions.appendChild(keepBtn);
        actions.appendChild(downloadBtn);
        actions.appendChild(reprintBtn);
        wrapper.appendChild(actions);
    }

    /* ===================================================================
     * TEAR GESTURES: drag down or double-click
     * Left-to-right rip animation with jagged edge
     * =================================================================== */

    // Track active tear gesture state to avoid duplicate document listeners
    let tearGestureState = null;

    function bindTearGestures(wrapper, displayCanvas) {
        let isDragging = false;
        let startY = 0;
        const dragThreshold = 40;

        // --- Double click on wrapper AND canvas ---
        const dblClickHandler = (e) => {
            if (state.isTearing || state.isPrinting) return;
            e.preventDefault();
            e.stopPropagation();
            startTearAnimation();
        };
        wrapper.addEventListener('dblclick', dblClickHandler);
        displayCanvas.addEventListener('dblclick', dblClickHandler);

        // --- Mouse drag ---
        wrapper.addEventListener('mousedown', (e) => {
            if (state.isTearing || state.isPrinting) return;
            // Don't start drag if clicking on action buttons
            if (e.target.closest('.receipt-actions') || e.target.closest('.tear-hint-float')) return;
            isDragging = true;
            startY = e.clientY;
            wrapper.style.cursor = 'grabbing';
        });

        // Clean up previous document listeners
        if (tearGestureState) {
            document.removeEventListener('mousemove', tearGestureState.mousemove);
            document.removeEventListener('mouseup', tearGestureState.mouseup);
        }

        const mouseMoveHandler = (e) => {
            if (!isDragging) return;
            const dy = e.clientY - startY;
            if (dy > 5) {
                wrapper.style.transform = `translateY(${Math.min(dy * 0.3, 15)}px)`;
            }
        };

        const mouseUpHandler = (e) => {
            if (!isDragging) return;
            isDragging = false;
            wrapper.style.cursor = '';
            const dy = e.clientY - startY;
            wrapper.style.transform = '';
            if (dy > dragThreshold) {
                startTearAnimation();
            }
        };

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        tearGestureState = { mousemove: mouseMoveHandler, mouseup: mouseUpHandler };

        // --- Touch events ---
        let touchStartY = 0;
        let isTouchDragging = false;

        wrapper.addEventListener('touchstart', (e) => {
            if (state.isTearing || state.isPrinting) return;
            if (e.target.closest('.receipt-actions') || e.target.closest('.tear-hint-float')) return;
            isTouchDragging = true;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        wrapper.addEventListener('touchmove', (e) => {
            if (!isTouchDragging) return;
            const dy = e.touches[0].clientY - touchStartY;
            if (dy > 5) {
                e.preventDefault();
                wrapper.style.transform = `translateY(${Math.min(dy * 0.3, 15)}px)`;
            }
        }, { passive: false });

        wrapper.addEventListener('touchend', (e) => {
            if (!isTouchDragging) return;
            isTouchDragging = false;
            const dy = e.changedTouches[0].clientY - touchStartY;
            wrapper.style.transform = '';
            if (dy > dragThreshold) {
                startTearAnimation();
            }
        });
    }

    /* ===== Tear Animation: left-to-right rip ===== */
    function startTearAnimation() {
        window._tearDebug = window._tearDebug || [];
        window._tearDebug.push('startTearAnimation called at ' + Date.now());
        if (state.isTearing || !state.currentReceipt) {
            window._tearDebug.push('early return: isTearing=' + state.isTearing + ' hasReceipt=' + !!state.currentReceipt);
            return;
        }
        state.isTearing = true;
        window._tearDebug.push('isTearing set to true');

        const wrapper = $('receipt-canvas-wrapper');
        const displayCanvas = $('receipt-display-canvas');
        if (!wrapper || !displayCanvas) {
            window._tearDebug.push('wrapper or canvas not found!');
            state.isTearing = false;
            return;
        }
        window._tearDebug.push('wrapper found, canvas: ' + displayCanvas.width + 'x' + displayCanvas.height);

        // Remove action buttons, torn line, and tear hint
        const actions = wrapper.querySelector('.receipt-actions');
        if (actions) actions.remove();
        const tornLine = wrapper.querySelector('.torn-line');
        if (tornLine) tornLine.remove();
        const hintFloat = wrapper.querySelector('.tear-hint-float');
        if (hintFloat) hintFloat.remove();

        const receiptW = displayCanvas.width;
        const receiptH = displayCanvas.height;
        // Tear near the very top, just below store name/title header
        const tearY = Math.max(Math.floor(receiptH * 0.12), 50);

        // Get canvas position relative to wrapper
        const canvasRect = displayCanvas.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        const canvasTop = canvasRect.top - wrapperRect.top;
        const canvasLeft = canvasRect.left - wrapperRect.left;

        // --- Create jagged tear line (SVG) ---
        const jaggedPoints = generateJaggedEdge(receiptW, 8, 5);
        let svgPath = `M 0 ${tearY + jaggedPoints[0].offset}`;
        for (const pt of jaggedPoints) {
            svgPath += ` L ${pt.x} ${tearY + pt.offset}`;
        }

        const tearLineSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        tearLineSvg.setAttribute('width', receiptW);
        tearLineSvg.setAttribute('height', receiptH);
        tearLineSvg.style.cssText = [
            'position: absolute',
            `top: ${canvasTop}px`,
            `left: ${canvasLeft}px`,
            'pointer-events: none',
            'z-index: 11',
            'overflow: visible',
        ].join(';');

        const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipRect.setAttribute('id', 'tear-clip');
        const clipRectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        clipRectEl.setAttribute('x', '0');
        clipRectEl.setAttribute('y', '0');
        clipRectEl.setAttribute('width', '0');
        clipRectEl.setAttribute('height', receiptH);
        clipRect.appendChild(clipRectEl);
        tearLineSvg.appendChild(clipRect);

        const shadowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        shadowPath.setAttribute('d', svgPath);
        shadowPath.setAttribute('stroke', 'rgba(0,0,0,0.2)');
        shadowPath.setAttribute('stroke-width', '1.5');
        shadowPath.setAttribute('fill', 'none');
        shadowPath.setAttribute('clip-path', 'url(#tear-clip)');
        tearLineSvg.appendChild(shadowPath);

        let highlightPath = `M 0 ${tearY + jaggedPoints[0].offset - 1.5}`;
        for (const pt of jaggedPoints) {
            highlightPath += ` L ${pt.x} ${tearY + pt.offset - 1.5}`;
        }
        const highlightEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        highlightEl.setAttribute('d', highlightPath);
        highlightEl.setAttribute('stroke', 'rgba(255,255,255,0.5)');
        highlightEl.setAttribute('stroke-width', '0.5');
        highlightEl.setAttribute('fill', 'none');
        highlightEl.setAttribute('clip-path', 'url(#tear-clip)');
        tearLineSvg.appendChild(highlightEl);
        wrapper.appendChild(tearLineSvg);

        // --- Create falling bottom piece ---
        const bottomImg = document.createElement('canvas');
        bottomImg.width = receiptW;
        bottomImg.height = receiptH - tearY;
        bottomImg.style.cssText = [
            'position: absolute',
            `top: ${canvasTop + tearY}px`,
            `left: ${canvasLeft}px`,
            'z-index: 12',
            'pointer-events: none',
            'transform-origin: top center',
        ].join(';');
        const sourceCanvas = state.currentReceipt;
        const sourceW = sourceCanvas.width;
        const sourceH = sourceCanvas.height;
        const srcTearY = (tearY / receiptH) * sourceH;
        const srcBottomH = sourceH - srcTearY;
        const bctx = bottomImg.getContext('2d');
        bctx.drawImage(sourceCanvas,
            0, srcTearY, sourceW, srcBottomH,
            0, 0, receiptW, receiptH - tearY
        );
        wrapper.appendChild(bottomImg);

        // Hide the original canvas's bottom part immediately (static, no animation)
        displayCanvas.style.clipPath = `polygon(0px 0px, ${receiptW}px 0px, ${receiptW}px ${tearY}px, 0px ${tearY}px)`;

        // --- Animate using setInterval (reliable in all browsers) ---
        const duration = 1200;
        const frameDelay = 16;
        const fallDistance = (receiptH - tearY) + 80;
        const startTime = Date.now();
        const animTimer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 2.5);
            const tearX = Math.floor(receiptW * eased);

            // Update SVG clip rect width
            clipRectEl.setAttribute('width', tearX);

            // Animate bottom piece falling (starts after 2% progress)
            if (progress > 0.02) {
                const fallProgress = Math.min((progress - 0.02) / 0.98, 1);
                const fallY = fallProgress * fallProgress * fallDistance;
                const rotation = fallProgress * 4;
                const opacity = 1 - Math.pow(fallProgress, 2.5);
                bottomImg.style.transform = `translateY(${fallY}px) rotate(${rotation}deg)`;
                bottomImg.style.opacity = opacity;
            }

            if (progress >= 1) {
                clearInterval(animTimer);
                finishTear();
            }
        }, frameDelay);

        function finishTear() {
            window._tearDebug.push('finishTear called at ' + Date.now());
            // Save to stack
            const dataUrl = state.currentReceipt.toDataURL('image/png');
            state.stack.push({
                id: Date.now(),
                dataUrl: dataUrl,
                type: state.receiptType,
                timestamp: new Date(),
            });
            saveStack();
            updateStackCount();

            // Fade out wrapper
            wrapper.style.transition = 'opacity 0.4s ease';
            wrapper.style.opacity = '0';

            setTimeout(() => {
                dom.receiptOutput.innerHTML = '';
                dom.receiptOutput.classList.remove('has-receipt', 'printing', 'vibrating');
                state.isTearing = false;
            }, 400);
        }
    }

    /* Generate jagged edge points for the tear line */
    function generateJaggedEdge(width, segmentWidth, maxOffset) {
        const points = [];
        let seed = 12345;
        for (let x = 0; x <= width; x += segmentWidth) {
            seed = (seed * 9301 + 49297) % 233280;
            const offset = ((seed / 233280) - 0.5) * 2 * maxOffset;
            points.push({ x: x, offset: offset });
        }
        return points;
    }

    /* ===== Download ===== */
    function downloadReceipt() {
        if (!state.currentReceipt) return;
        state.currentReceipt.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `anata-receipt-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
    }

    /* ===== Stack Management ===== */
    function initStack() {
        loadStack();
        updateStackCount();
        dom.stackBtn.addEventListener('click', openStack);
        dom.closeStackBtn.addEventListener('click', closeStack);
        dom.stackModal.addEventListener('click', (e) => {
            if (e.target === dom.stackModal) closeStack();
        });
        dom.clearStackBtn.addEventListener('click', () => {
            if (state.stack.length === 0) return;
            if (!confirm('Delete all receipts?')) return;
            state.stack = [];
            saveStack();
            updateStackCount();
            renderStackList();
        });
        dom.downloadAllBtn.addEventListener('click', () => {
            state.stack.forEach((item, i) => {
                setTimeout(() => {
                    const a = document.createElement('a');
                    a.href = item.dataUrl;
                    a.download = `anata-receipt-${i + 1}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }, i * 300);
            });
        });
    }

    function openStack() { renderStackList(); dom.stackModal.style.display = ''; }
    function closeStack() { dom.stackModal.style.display = 'none'; }

    function renderStackList() {
        if (state.stack.length === 0) {
            dom.stackList.innerHTML = '<p class="empty-stack">No receipts yet</p>';
            dom.downloadAllBtn.disabled = true;
            return;
        }
        dom.downloadAllBtn.disabled = false;
        dom.stackList.innerHTML = '';
        state.stack.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'stack-item';
            div.innerHTML = `
                <img src="${item.dataUrl}" alt="Receipt ${idx + 1}">
                <div class="stack-item-actions">
                    <button class="dl-btn">Download</button>
                    <button class="del-btn">Delete</button>
                </div>
            `;
            // Click image to preview
            div.querySelector('img').addEventListener('click', (e) => {
                e.stopPropagation();
                openPreview(item, idx);
            });
            div.querySelector('.dl-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const a = document.createElement('a');
                a.href = item.dataUrl;
                a.download = `anata-receipt-${idx + 1}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
            div.querySelector('.del-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                state.stack.splice(idx, 1);
                saveStack();
                updateStackCount();
                renderStackList();
            });
            dom.stackList.appendChild(div);
        });
    }

    /* ===== Receipt Preview Modal ===== */
    function openPreview(item, idx) {
        // Remove any existing preview
        const existing = document.querySelector('.preview-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'preview-overlay';

        const content = document.createElement('div');
        content.className = 'preview-content';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'preview-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => overlay.remove());

        const img = document.createElement('img');
        img.src = item.dataUrl;
        img.alt = `Receipt ${idx + 1}`;

        const toolbar = document.createElement('div');
        toolbar.className = 'preview-toolbar';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'preview-download-btn';
        downloadBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
        `;
        downloadBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = item.dataUrl;
            a.download = `anata-receipt-${idx + 1}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });

        toolbar.appendChild(downloadBtn);
        content.appendChild(closeBtn);
        content.appendChild(img);
        content.appendChild(toolbar);
        overlay.appendChild(content);

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        // ESC to close
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        document.body.appendChild(overlay);
    }

    function updateStackCount() { dom.stackCount.textContent = state.stack.length; }

    function saveStack() {
        try {
            localStorage.setItem('anata_receipt_stack', JSON.stringify(state.stack));
        } catch (e) {
            if (state.stack.length > 20) state.stack = state.stack.slice(-20);
        }
    }

    function loadStack() {
        try {
            const saved = localStorage.getItem('anata_receipt_stack');
            if (saved) state.stack = JSON.parse(saved);
        } catch (e) { state.stack = []; }
    }

    /* ===== Initialize ===== */
    function init() {
        initTabs();
        initFileUpload(dom.snapUploadZone, dom.snapFileInput, dom.snapPlaceholder, dom.snapPreview, 'snapPhoto');
        initFileUpload(dom.customUploadZone, dom.customFileInput, dom.customPlaceholder, dom.customPreview, 'customPhoto');
        initItems();
        initCurrency();
        initWidth();
        initOptions();
        initIssue();
        initStack();
    }

    // Expose for debugging
    window.__startTear = startTearAnimation;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
