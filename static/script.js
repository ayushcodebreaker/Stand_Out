/* =========================================
   1. INITIALIZATION & HELPERS
   ========================================= */
document.addEventListener('DOMContentLoaded', () => {
    const toggleSwitch = document.querySelector('#checkbox');
    const body = document.body;

    // Theme Logic
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme) {
        body.classList.add(currentTheme);
        if (currentTheme === 'dark-mode' && toggleSwitch) toggleSwitch.checked = true;
    }

    if (toggleSwitch) {
        toggleSwitch.addEventListener('change', function(e) {
            if (e.target.checked) {
                body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark-mode');
            } else {
                body.classList.remove('dark-mode');
                localStorage.setItem('theme', 'light');
            }
        });
    }

    // Helper to close modals
    window.closeModal = function(id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    }

    /* =========================================
       2. CORE IMAGE PROCESSING
       ========================================= */
    const fileInput = document.getElementById('fileInput');
    const uploadView = document.getElementById('upload-view');
    const uploadContent = document.getElementById('upload-content');
    const loadingOverlay = document.getElementById('loading-overlay');
    const resultView = document.getElementById('result-view');
    const downloadBtn = document.getElementById('download-btn');
    const bgPreview = document.querySelector('.bg-preview');

    const compOriginal = document.getElementById('comp-original');
    const compResult = document.getElementById('comp-result');

    let currentOriginalUrl = "";
    let currentResultUrl = "";

    if (fileInput) {
        fileInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) processImage(file);
        });
    }

    function processImage(file) {
        if (bgPreview) {
            bgPreview.src = "/static/images/car.jpg"; 
            bgPreview.style.opacity = '0.4';
        }
        if (uploadContent) uploadContent.style.display = 'none';
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        
        const formData = new FormData();
        formData.append('image', file);

        fetch('/remove-bg', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.result_url) {
                currentOriginalUrl = data.original_url;
                currentResultUrl = data.result_url;
                showResult(data.original_url, data.result_url);
            } else {
                alert('Error: ' + (data.error || 'Unknown error'));
                location.reload();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Something went wrong! Check server logs.');
            location.reload();
        });
    }

    function showResult(originalUrl, resultUrl) {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        if (uploadView) uploadView.style.display = 'none';
        if (resultView) {
            resultView.style.display = 'flex';
            resultView.classList.add('fade-in-up');
        }
        
        if (compOriginal) compOriginal.src = originalUrl;
        if (compResult) compResult.src = resultUrl;
        
        const viewBtn = document.getElementById('view-btn');
        if (viewBtn) viewBtn.dataset.url = resultUrl;
        
        if (downloadBtn) downloadBtn.href = resultUrl;

        if (compOriginal) {
            if (compOriginal.complete) {
                initComparisonSlider();
            } else {
                compOriginal.onload = function() {
                    initComparisonSlider();
                }
            }
        }
    }

    /* =========================================
       3. COMPARISON SLIDER LOGIC
       ========================================= */
    function initComparisonSlider() {
        const container = document.getElementById('comparison-container');
        const sliderHandle = document.getElementById('slider-handle');
        const modifiedLayer = document.getElementById('modified-layer');
        const originalImg = document.getElementById('comp-original');
        const resultImg = document.getElementById('comp-result');

        if (!container || !sliderHandle || !modifiedLayer || !originalImg || !resultImg) return;

        function syncImageDimensions() {
            const width = originalImg.offsetWidth;
            const height = originalImg.offsetHeight;
            
            if (width === 0) {
                requestAnimationFrame(syncImageDimensions);
                return;
            }

            container.style.width = width + "px";
            container.style.height = height + "px";
            resultImg.style.width = width + "px";
            resultImg.style.height = height + "px";
        }

        syncImageDimensions();
        window.addEventListener('resize', syncImageDimensions);

        let isDragging = false;
        sliderHandle.style.left = '50%';
        modifiedLayer.style.width = '50%';

        const startDrag = (e) => { isDragging = true; e.preventDefault(); };
        const stopDrag = () => isDragging = false;

        sliderHandle.addEventListener('mousedown', startDrag);
        window.addEventListener('mouseup', stopDrag);
        sliderHandle.addEventListener('touchstart', startDrag);
        window.addEventListener('touchend', stopDrag);

        window.addEventListener('mousemove', moveSlider);
        window.addEventListener('touchmove', moveSlider);

        function moveSlider(e) {
            if (!isDragging) return;
            let clientX = e.clientX || (e.touches && e.touches[0].clientX);
            if (!clientX) return;

            let rect = container.getBoundingClientRect();
            let offsetX = clientX - rect.left;
            
            if (offsetX < 0) offsetX = 0;
            if (offsetX > rect.width) offsetX = rect.width;

            let percentage = (offsetX / rect.width) * 100;
            modifiedLayer.style.width = percentage + "%";
            sliderHandle.style.left = percentage + "%";
        }
    }

    /* =========================================
       4. REFINED EDITOR (FIXED BRUSH)
       ========================================= */
    const editBtn = document.getElementById('edit-btn');
    const editModal = document.getElementById('edit-modal');
    const editCanvas = document.getElementById('edit-canvas');
    const editBgRef = document.getElementById('edit-bg-ref');
    const cursorBrush = document.getElementById('cursor-brush');

    let editCtx = null;
    if (editCanvas) {
        editCtx = editCanvas.getContext('2d', { willReadFrequently: true });
    }

    const toolEraser = document.getElementById('tool-eraser');
    const toolRestore = document.getElementById('tool-restore');
    const sizeEraser = document.getElementById('eraser-size');
    const sizeRestore = document.getElementById('restore-size');

    let currentTool = 'eraser'; 
    let isPainting = false;
    let historyStack = [];
    let historyStep = -1;
    let originalImageObj = new Image(); 

    if (editBtn) {
        editBtn.addEventListener('click', () => {
            if (editModal) editModal.style.display = 'flex';
            initEditor();
        });
    }

    const btnDiscard = document.getElementById('btn-discard');
    if (btnDiscard) {
        btnDiscard.addEventListener('click', () => {
            if(confirm("Discard changes?")) {
                if (editModal) editModal.style.display = 'none';
            }
        });
    }

    function initEditor() {
        if (!editBgRef || !editCanvas || !editCtx) return;

        editBgRef.src = currentOriginalUrl;
        originalImageObj.crossOrigin = "Anonymous";
        originalImageObj.src = currentOriginalUrl;

        const resImg = new Image();
        resImg.crossOrigin = "Anonymous";
        resImg.src = currentResultUrl;
        
        resImg.onload = () => {
            editCanvas.width = resImg.width;
            editCanvas.height = resImg.height;
            editCtx.drawImage(resImg, 0, 0);
            
            historyStack = [];
            historyStep = -1;
            saveState();
        };
    }

    if (toolEraser) {
        toolEraser.addEventListener('click', () => {
            currentTool = 'eraser';
            toolEraser.classList.add('active');
            if (toolRestore) toolRestore.classList.remove('active');
        });
    }

    if (toolRestore) {
        toolRestore.addEventListener('click', () => {
            currentTool = 'restore';
            toolRestore.classList.add('active');
            if (toolEraser) toolEraser.classList.remove('active');
        });
    }

    function getBrushSize() {
        if (currentTool === 'eraser' && sizeEraser) return sizeEraser.value;
        if (currentTool === 'restore' && sizeRestore) return sizeRestore.value;
        return 30;
    }

    if (editCanvas) {
        editCanvas.addEventListener('mousedown', startPaint);
        window.addEventListener('mouseup', stopPaint);
        editCanvas.addEventListener('mousemove', drawPaint);

        editCanvas.addEventListener('mousemove', (e) => {
            if (!cursorBrush) return;
            const rect = editCanvas.getBoundingClientRect();
            const scaleX = editCanvas.width / rect.width;
            const size = getBrushSize();
            
            cursorBrush.style.display = 'block';
            const visualSize = size / scaleX;
            cursorBrush.style.width = visualSize + 'px';
            cursorBrush.style.height = visualSize + 'px';
            cursorBrush.style.left = e.clientX + 'px';
            cursorBrush.style.top = e.clientY + 'px';
            cursorBrush.style.borderColor = currentTool === 'eraser' ? 'red' : '#22c55e';
        });

        editCanvas.addEventListener('mouseleave', () => {
            if (cursorBrush) cursorBrush.style.display = 'none';
        });
    }

    function startPaint(e) {
        isPainting = true;
        const rect = editCanvas.getBoundingClientRect();
        const scaleX = editCanvas.width / rect.width;
        const scaleY = editCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        editCtx.beginPath();
        editCtx.moveTo(x, y);
        drawPaint(e);
    }

    function stopPaint() {
        if (isPainting) {
            isPainting = false;
            saveState();
        }
    }

    function drawPaint(e) {
        if (!isPainting) return;

        const rect = editCanvas.getBoundingClientRect();
        const scaleX = editCanvas.width / rect.width;
        const scaleY = editCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        const size = getBrushSize();

        editCtx.lineCap = 'round';
        editCtx.lineJoin = 'round';
        editCtx.lineWidth = size;

        if (currentTool === 'eraser') {
            editCtx.globalCompositeOperation = 'destination-out';
            editCtx.lineTo(x, y);
            editCtx.stroke();
        } 
        else if (currentTool === 'restore') {
            // RESTORE LOGIC: Use clipping mask + source-over
            editCtx.globalCompositeOperation = 'source-over';
            
            editCtx.save();
            editCtx.beginPath();
            editCtx.arc(x, y, size / 2, 0, Math.PI * 2);
            editCtx.clip();
            
            if(originalImageObj.complete) {
                editCtx.drawImage(originalImageObj, 0, 0, editCanvas.width, editCanvas.height);
            }
            editCtx.restore();
        }
    }

    function saveState() {
        if (historyStep < historyStack.length - 1) {
            historyStack = historyStack.slice(0, historyStep + 1);
        }
        historyStack.push(editCanvas.toDataURL());
        historyStep++;
    }

    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
        btnUndo.addEventListener('click', () => {
            if (historyStep > 0) { historyStep--; loadState(); }
        });
    }

    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) {
        btnRedo.addEventListener('click', () => {
            if (historyStep < historyStack.length - 1) { historyStep++; loadState(); }
        });
    }

    function loadState() {
        const img = new Image();
        img.src = historyStack[historyStep];
        img.onload = () => {
            editCtx.globalCompositeOperation = 'source-over';
            editCtx.clearRect(0, 0, editCanvas.width, editCanvas.height);
            editCtx.drawImage(img, 0, 0);
        };
    }

    const btnSaveRefine = document.getElementById('btn-save-refine');
    if (btnSaveRefine) {
        btnSaveRefine.addEventListener('click', () => {
            const newDataUrl = editCanvas.toDataURL('image/png');
            currentResultUrl = newDataUrl;
            if (compResult) compResult.src = newDataUrl;
            const viewBtn = document.getElementById('view-btn');
            if (viewBtn) viewBtn.dataset.url = newDataUrl;
            if (downloadBtn) downloadBtn.href = newDataUrl;
            
            if (editModal) editModal.style.display = 'none';
        });
    }


    /* =========================================
       5. BACKGROUND STUDIO (REAL SAVING)
       ========================================= */
    const bgBtn = document.getElementById('bg-btn');
    const bgModal = document.getElementById('bg-modal');
    const compSubjectLayer = document.getElementById('comp-subject-layer');
    const compBgLayer = document.getElementById('comp-bg-layer');
    const compositionContainer = document.getElementById('composition-container');

    let bgState = {
        type: 'transparent',
        value: '',
    };

    if (bgBtn) {
        bgBtn.addEventListener('click', () => {
            if (bgModal) bgModal.style.display = 'flex';
            initBgStudio();
        });
    }

    function initBgStudio() {
        if (compSubjectLayer) compSubjectLayer.src = currentResultUrl;
        resetBgSettings();
        
        
    }

    window.switchBgTab = function(tabName) {
        document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        const targetTab = document.getElementById('tab-' + tabName);
        if (targetTab) targetTab.style.display = 'block';
        
        const buttons = document.querySelectorAll('.tab-btn');
        if(buttons.length >= 3) {
            if(tabName === 'color') buttons[0].classList.add('active');
            else if(tabName === 'upload') buttons[1].classList.add('active');
        
        }
    }

    function setBackground(type, value) {
        bgState.type = type;
        bgState.value = value;
        
        if (!compBgLayer) return;

        if (type === 'color') {
            compBgLayer.style.backgroundImage = 'none';
            compBgLayer.style.backgroundColor = value;
        } else if (type === 'image') {
            compBgLayer.style.backgroundColor = 'transparent';
            compBgLayer.style.backgroundImage = `url('${value}')`;
        } else if (type === 'transparent') {
            compBgLayer.style.backgroundImage = 'none';
            compBgLayer.style.backgroundColor = 'transparent';
        }
    }

    const colorPicker = document.getElementById('bg-color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => setBackground('color', e.target.value));
    }

    const bgFileInput = document.getElementById('bg-file-input');
    if (bgFileInput) {
        bgFileInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                setBackground('image', url);
            }
        });
    }

    // REMOVE BACKGROUND BUTTON LOGIC
    const btnRemoveBgUpload = document.getElementById('btn-remove-bg-upload');
    if (btnRemoveBgUpload) {
        btnRemoveBgUpload.addEventListener('click', () => setBackground('transparent', ''));
    }




    // Draggable Logic
    let isDraggingSubject = false;
    let dragStartX, dragStartY;

    if (compSubjectLayer) {
        compSubjectLayer.addEventListener('mousedown', (e) => {
            isDraggingSubject = true;
            dragStartX = e.clientX - compSubjectLayer.offsetLeft;
            dragStartY = e.clientY - compSubjectLayer.offsetTop;
            compSubjectLayer.style.cursor = 'grabbing';
        });

        window.addEventListener('mouseup', () => {
            isDraggingSubject = false;
            if(compSubjectLayer) compSubjectLayer.style.cursor = 'grab';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingSubject) return;
            e.preventDefault();
            let newLeft = e.clientX - dragStartX;
            let newTop = e.clientY - dragStartY;
            compSubjectLayer.style.left = newLeft + 'px';
            compSubjectLayer.style.top = newTop + 'px';
        });
    }

    // Filters
    const adjInputs = ['adj-bg-blur', 'adj-softness', 'adj-scale', 
                       'br-global', 'br-subject', 'br-bg', 
                       'ct-global', 'ct-subject', 'ct-bg', 
                       'st-global', 'st-subject', 'st-bg'];
                       
    adjInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateFilters);
    });

    function updateFilters() {
        // Helper to safely get value
        const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : (id.includes('scale') ? 1 : (id.includes('softness') || id.includes('blur') ? 0 : 100));

        const bG = getVal('br-global');
        const cG = getVal('ct-global');
        const sG = getVal('st-global');

        const bS = getVal('br-subject');
        const cS = getVal('ct-subject');
        const sS = getVal('st-subject');

        const bB = getVal('br-bg');
        const cB = getVal('ct-bg');
        const sB = getVal('st-bg');

        const softness = getVal('adj-softness');
        const scale = getVal('adj-scale');
        const bgBlur = getVal('adj-bg-blur');

        // Apply to GLOBAL CONTAINER
        if (compositionContainer) {
            compositionContainer.style.filter = `brightness(${bG}%) contrast(${cG}%) saturate(${sG}%)`;
        }
        
        // Apply to SUBJECT (Plus Scale and Blur)
        if (compSubjectLayer) {
            compSubjectLayer.style.transform = `translate(-50%, -50%) scale(${scale})`;
            compSubjectLayer.style.filter = `brightness(${bS}%) contrast(${cS}%) saturate(${sS}%) blur(${softness}px)`; 
        }

        // Apply to BACKGROUND
        if (compBgLayer) {
            compBgLayer.style.filter = `brightness(${bB}%) contrast(${cB}%) saturate(${sB}%) blur(${bgBlur}px)`;
        }
    }

    const btnResetAdj = document.getElementById('btn-reset-adj');
    if (btnResetAdj) {
        btnResetAdj.addEventListener('click', resetBgSettings);
    }

    function resetBgSettings() {
        // Reset all sliders to 100
        document.querySelectorAll('.sub-slider input').forEach(el => el.value = 100);
        
        const soft = document.getElementById('adj-softness'); if(soft) soft.value = 0;
        const sc = document.getElementById('adj-scale'); if(sc) sc.value = 1;
        const bgBlur = document.getElementById('adj-bg-blur'); if(bgBlur) bgBlur.value = 0;
        
        updateFilters();
        if (compSubjectLayer) {
            compSubjectLayer.style.left = '50%';
            compSubjectLayer.style.top = '50%';
        }
    }

    // === REAL SAVE LOGIC (CLIENT SIDE) ===
    const btnSaveBg = document.getElementById('btn-save-bg');
    if (btnSaveBg) {
        btnSaveBg.addEventListener('click', async () => {
            if (!compositionContainer) return;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const w = compositionContainer.offsetWidth;
            const h = compositionContainer.offsetHeight;
            canvas.width = w;
            canvas.height = h;
            
            // 1. Draw Background
            // Apply BG Filters to context
            const bG = document.getElementById('br-global') ? document.getElementById('br-global').value : 100;
            const cG = document.getElementById('ct-global') ? document.getElementById('ct-global').value : 100;
            const sG = document.getElementById('st-global') ? document.getElementById('st-global').value : 100;
            
            const bB = document.getElementById('br-bg') ? document.getElementById('br-bg').value : 100;
            const cB = document.getElementById('ct-bg') ? document.getElementById('ct-bg').value : 100;
            const sB = document.getElementById('st-bg') ? document.getElementById('st-bg').value : 100;
            const bgBlur = document.getElementById('adj-bg-blur') ? document.getElementById('adj-bg-blur').value : 0;

            ctx.filter = `brightness(${bG}%) contrast(${cG}%) saturate(${sG}%) brightness(${bB}%) contrast(${cB}%) saturate(${sB}%) blur(${bgBlur}px)`;
            
            if (bgState.type === 'color') {
                ctx.fillStyle = bgState.value || '#ffffff';
                ctx.fillRect(0, 0, w, h);
            } else if (bgState.type === 'image' && bgState.value) {
                const bgImg = new Image();
                bgImg.crossOrigin = "Anonymous";
                bgImg.src = bgState.value;
                await new Promise(r => bgImg.onload = r);
                
                const ratio = Math.max(w / bgImg.width, h / bgImg.height);
                const centerShift_x = (w - bgImg.width * ratio) / 2;
                const centerShift_y = (h - bgImg.height * ratio) / 2;
                ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height, centerShift_x, centerShift_y, bgImg.width * ratio, bgImg.height * ratio);
            }
            
            // 2. Draw Subject
            const subjectImg = new Image();
            subjectImg.crossOrigin = "Anonymous";
            subjectImg.src = currentResultUrl;
            await new Promise(r => subjectImg.onload = r);
            
            const scale = parseFloat(document.getElementById('adj-scale') ? document.getElementById('adj-scale').value : 1);
            const blur = document.getElementById('adj-softness') ? document.getElementById('adj-softness').value : 0;
            
            const bS = document.getElementById('br-subject') ? document.getElementById('br-subject').value : 100;
            const cS = document.getElementById('ct-subject') ? document.getElementById('ct-subject').value : 100;
            const sS = document.getElementById('st-subject') ? document.getElementById('st-subject').value : 100;

            // Reset filter stack for subject pass
            ctx.filter = `brightness(${bG}%) contrast(${cG}%) saturate(${sG}%) brightness(${bS}%) contrast(${cS}%) saturate(${sS}%) blur(${blur}px)`;
            
            const rect = compSubjectLayer.getBoundingClientRect();
            const containerRect = compositionContainer.getBoundingClientRect();
            
            const x = rect.left - containerRect.left;
            const y = rect.top - containerRect.top;
            
            ctx.drawImage(subjectImg, x, y, rect.width, rect.height);
            
            // 4. Export
            const finalUrl = canvas.toDataURL('image/png');
            currentResultUrl = finalUrl;
            if (compResult) compResult.src = finalUrl;
            const viewBtn = document.getElementById('view-btn');
            if (viewBtn) viewBtn.dataset.url = finalUrl;
            if (downloadBtn) downloadBtn.href = finalUrl;
            
            if (bgModal) bgModal.style.display = 'none';
        });
    }

    /* =========================================
       6. VIEW/ZOOM MODAL LOGIC
       ========================================= */
    const viewBtn = document.getElementById('view-btn');
    const modal = document.getElementById('view-modal');
    const canvas = document.getElementById('zoom-canvas');
    let ctx = null;
    if (canvas) ctx = canvas.getContext('2d');

    let viewImg = new Image();
    let scale = 1;
    let pX = 0, pY = 0;
    let isPanning = false, startX = 0, startY = 0;

    if (viewBtn) {
        viewBtn.addEventListener('click', () => {
            const url = viewBtn.dataset.url;
            viewImg.src = url;
            if (modal) modal.style.display = 'flex';
            
            viewImg.onload = () => {
                scale = 1; pX = 0; pY = 0;
                resizeCanvas();
                draw();
            };
        });
    }

    function resizeCanvas() {
        if (!canvas) return;
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    }

    function draw() {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2 + pX, canvas.height / 2 + pY);
        ctx.scale(scale, scale);
        ctx.drawImage(viewImg, -viewImg.width / 2, -viewImg.height / 2);
        ctx.restore();
    }

    if (canvas) {
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.1;
            if (e.deltaY < 0) scale *= (1 + zoomSpeed);
            else scale /= (1 + zoomSpeed);
            draw();
        });

        canvas.addEventListener('mousedown', (e) => {
            isPanning = true;
            startX = e.clientX - pX;
            startY = e.clientY - pY;
        });

        window.addEventListener('mouseup', () => isPanning = false);

        window.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            pX = e.clientX - startX;
            pY = e.clientY - startY;
            draw();
        });

        window.addEventListener('resize', () => {
            if (modal && modal.style.display === 'flex') {
                resizeCanvas();
                draw();
            }
        });
    }
});