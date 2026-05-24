import React, { useState, useRef, useEffect } from 'react';
import { useEditor } from '../context/EditorContext';
import { exportEditedPDF } from '../utils/pdfHelper';
import { 
  ArrowLeft, MousePointer, Type, Edit3, 
  Undo2, Redo2, ZoomOut, ZoomIn, 
  Download, Sun, Moon, 
  Image as ImageIcon, Square, Circle as CircleIcon, 
  TrendingUp, PenTool, Check, X
} from 'lucide-react';

export const Toolbar: React.FC = () => {
  const {
    file,
    pdfBytes,
    currentPage,
    zoom,
    toolMode,
    darkMode,
    nativeEdits,
    newTextBoxes,
    canUndo,
    canRedo,
    closeFile,
    setZoom,
    setToolMode,
    toggleDarkMode,
    addTextBox,
    addImageBox,
    addShapeBox,
    undo,
    redo,
  } = useEditor();

  const [exporting, setExporting] = useState<boolean>(false);
  const [showSigModal, setShowSigModal] = useState<boolean>(false);
  const [sigType, setSigType] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState<string>('');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef<boolean>(false);

  // Re-draw canvas for signature manual writing
  useEffect(() => {
    if (showSigModal && sigType === 'draw' && sigCanvasRef.current) {
      const canvas = sigCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = darkMode ? '#ffffff' : '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [showSigModal, sigType, darkMode]);

  const handleExport = async () => {
    if (!pdfBytes || !file) return;
    setExporting(true);
    try {
      await exportEditedPDF(pdfBytes, nativeEdits, newTextBoxes, file.name);
      
      const notify = document.createElement('div');
      notify.className = "fixed bottom-8 right-8 px-6 py-4 bg-emerald-500 text-white rounded-2xl shadow-panel z-50 flex items-center gap-3 animate-bounce font-semibold";
      notify.innerHTML = `<span>✨ Export Completed Successfully!</span>`;
      document.body.appendChild(notify);
      setTimeout(() => document.body.removeChild(notify), 3000);
    } catch (err) {
      alert('Error rendering PDF edits: ' + err);
    } finally {
      setExporting(false);
    }
  };

  const handleZoomPercent = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setZoom(parseFloat(e.target.value));
  };

  // Image upload handler
  const triggerImageUpload = () => {
    imageInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const imgFile = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64 = event.target.result as string;
          // Drop centered
          addImageBox(currentPage, base64, 180, 120);
        }
      };
      reader.readAsDataURL(imgFile);
    }
  };

  // Signature canvas manual drag actions
  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startSigDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true;
    const ctx = sigCanvasRef.current?.getContext('2d');
    const pos = getCanvasPos(e);
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const drawSig = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = sigCanvasRef.current?.getContext('2d');
    const pos = getCanvasPos(e);
    if (ctx) {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const stopSigDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearSigCanvas = () => {
    const canvas = sigCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Save Signature
  const saveSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;

    let base64 = '';
    if (sigType === 'draw') {
      base64 = canvas.toDataURL('image/png');
    } else {
      // Type signature on hidden canvas to capture typed cursive fonts
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 400;
      tempCanvas.height = 160;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.fillStyle = darkMode ? '#18191e' : '#ffffff';
        tempCtx.fillRect(0, 0, 400, 160);
        tempCtx.fillStyle = darkMode ? '#ffffff' : '#000000';
        tempCtx.font = "italic bold 44px 'Georgia', cursive";
        tempCtx.textAlign = 'center';
        tempCtx.textBaseline = 'middle';
        tempCtx.fillText(typedName || 'Signature', 200, 80);
        base64 = tempCanvas.toDataURL('image/png');
      }
    }

    if (base64) {
      // Drop centered signature
      addImageBox(currentPage, base64, 150, 60);
      setShowSigModal(false);
      setTypedName('');
    }
  };

  return (
    <header className="h-16 w-full flex items-center justify-between px-4 glass-toolbar border-b border-border-light dark:border-border-dark z-30 select-none transition-theme">
      
      {/* Left: Return & Details */}
      <div className="flex items-center gap-3">
        <button
          onClick={closeFile}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hover-scale"
          title="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800" />
        <div className="flex flex-col">
          <span className="text-xs text-slate-400 font-medium">Document</span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200 max-w-[140px] md:max-w-[240px] truncate" title={file?.name}>
            {file?.name}
          </span>
        </div>
      </div>

      {/* Center: Replicated iLovePDF Tool Suite */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-900/80 p-1.5 rounded-2xl border border-border-light dark:border-border-dark transition-theme gap-0.5 md:gap-1.5">
        
        {/* Cursor Move */}
        <button
          onClick={() => setToolMode('select')}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
            toolMode === 'select'
              ? 'bg-white dark:bg-panel-dark text-accent-primary shadow-premium'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          title="Move and select annotations"
        >
          <MousePointer size={14} /> <span className="hidden sm:inline">Move</span>
        </button>
        
        {/* Overwrite Text */}
        <button
          onClick={() => setToolMode('edit-text')}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
            toolMode === 'edit-text'
              ? 'bg-white dark:bg-panel-dark text-accent-primary shadow-premium'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          title="Click text to edit it"
        >
          <Edit3 size={14} /> <span className="hidden sm:inline">Edit Text</span>
        </button>

        {/* Add Textbox */}
        <button
          onClick={() => addShapeBox(currentPage, 'rectangle')} // quick template or drop
          className="hidden" // hide raw shape dropping here
        />
        
        <button
          onClick={() => addImageBox(currentPage, '', 0, 0)}
          className="hidden" // hidden base ref
        />

        <button
          onClick={() => addImageBox(currentPage, '', 0, 0)}
          className="hidden" // hidden base ref
        />

        {/* Add new Text Box centered */}
        <button
          onClick={() => addTextBox(currentPage, 42, 42)}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200`}
          title="Insert a custom text box"
        >
          <Type size={14} /> <span className="hidden sm:inline">Add Text</span>
        </button>

        <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden md:block" />

        {/* Add Image Actions */}
        <button
          onClick={triggerImageUpload}
          className="px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all hover-scale"
          title="Add JPG/PNG image overlay"
        >
          <ImageIcon size={14} /> <span className="hidden md:inline">Add Image</span>
          <input
            type="file"
            ref={imageInputRef}
            onChange={handleImageChange}
            accept="image/*"
            className="hidden"
          />
        </button>

        {/* Shapes Dropdowns */}
        <div className="relative group">
          <button
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all cursor-pointer"
            title="Insert standard shapes"
          >
            <Square size={13} /> <span className="hidden md:inline">Shapes</span>
          </button>
          
          {/* Shapes hover dropdown panel */}
          <div className="absolute top-8 left-0 hidden group-hover:flex flex-col bg-white dark:bg-panel-dark border border-border-light dark:border-border-dark p-1.5 rounded-xl shadow-panel z-50 min-w-[120px] transition-all">
            <button
              onClick={() => addShapeBox(currentPage, 'rectangle')}
              className="px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-xs font-bold flex items-center gap-2 text-slate-700 dark:text-slate-200 text-left w-full"
            >
              <Square size={13} className="text-accent-primary" /> Rectangle
            </button>
            <button
              onClick={() => addShapeBox(currentPage, 'circle')}
              className="px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-xs font-bold flex items-center gap-2 text-slate-700 dark:text-slate-200 text-left w-full"
            >
              <CircleIcon size={13} className="text-accent-primary" /> Circle
            </button>
            <button
              onClick={() => addShapeBox(currentPage, 'line')}
              className="px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-xs font-bold flex items-center gap-2 text-slate-700 dark:text-slate-200 text-left w-full"
            >
              <TrendingUp size={13} className="text-accent-primary" /> Line
            </button>
            <button
              onClick={() => addShapeBox(currentPage, 'arrow')}
              className="px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-xs font-bold flex items-center gap-2 text-slate-700 dark:text-slate-200 text-left w-full"
            >
              <TrendingUp size={13} className="rotate-45 text-accent-primary" /> Arrow
            </button>
          </div>
        </div>

        {/* Signature Action */}
        <button
          onClick={() => setShowSigModal(true)}
          className="px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all hover-scale"
          title="Sign your PDF"
        >
          <PenTool size={14} /> <span className="hidden md:inline">Sign</span>
        </button>

      </div>

      {/* Right side Pagination & Zooms */}
      <div className="flex items-center gap-2 md:gap-3">
        
        {/* Undo/Redo */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-xl border border-border-light dark:border-border-dark transition-theme">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`p-1.5 rounded-lg transition-colors ${
              canUndo
                ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
                : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
            }`}
            title="Undo"
          >
            <Undo2 size={14} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`p-1.5 rounded-lg transition-colors ${
              canRedo
                ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
                : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
            }`}
            title="Redo"
          >
            <Redo2 size={14} />
          </button>
        </div>

        {/* Zooms */}
        <div className="hidden md:flex items-center bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-xl border border-border-light dark:border-border-dark transition-theme">
          <button
            onClick={() => setZoom(z => z - 0.1)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200"
          >
            <ZoomOut size={13} />
          </button>
          <select
            value={zoom.toFixed(1)}
            onChange={handleZoomPercent}
            className="bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer border-none px-1"
          >
            <option value="0.5">50%</option>
            <option value="0.7">70%</option>
            <option value="0.9">90%</option>
            <option value="1.0">100%</option>
            <option value="1.2">120%</option>
            <option value="1.5">150%</option>
            <option value="2.0">200%</option>
          </select>
          <button
            onClick={() => setZoom(z => z + 0.1)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200"
          >
            <ZoomIn size={13} />
          </button>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Export Trigger */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold rounded-xl shadow-premium text-white bg-gradient-to-r from-accent-primary to-accent-secondary hover:brightness-110 transition-all ${
            exporting ? 'opacity-80 animate-pulse cursor-wait' : 'hover-scale'
          }`}
        >
          {exporting ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Download size={13} /> Export
            </>
          )}
        </button>

      </div>

      {/* 5. Replicated iLovePDF Signature Modal Drawer */}
      {showSigModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-panel-dark border border-border-light dark:border-border-dark shadow-panel max-w-lg w-full rounded-3xl p-6 flex flex-col gap-6 animate-scale-up select-none">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                  Create Signature
                </h3>
                <span className="text-xs text-slate-400">
                  Select a method to sign your PDF document
                </span>
              </div>
              <button
                onClick={() => { setShowSigModal(false); setTypedName(''); }}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Selector Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-2xl border border-border-light dark:border-border-dark">
              <button
                onClick={() => setSigType('draw')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                  sigType === 'draw'
                    ? 'bg-white dark:bg-panel-dark text-accent-primary shadow-premium'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                ✍️ Draw Signature
              </button>
              <button
                onClick={() => setSigType('type')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                  sigType === 'type'
                    ? 'bg-white dark:bg-panel-dark text-accent-primary shadow-premium'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                ⌨️ Type Signature
              </button>
            </div>

            {/* Modal View Bodies */}
            {sigType === 'draw' ? (
              <div className="flex flex-col gap-3">
                <canvas
                  ref={sigCanvasRef}
                  width="448"
                  height="160"
                  onMouseDown={startSigDrawing}
                  onMouseMove={drawSig}
                  onMouseUp={stopSigDrawing}
                  onMouseLeave={stopSigDrawing}
                  className="w-full h-40 bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl cursor-pointer"
                />
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Draw with your cursor or touch pad</span>
                  <button
                    onClick={clearSigCanvas}
                    className="font-bold text-red-500 hover:text-red-600"
                  >
                    Clear Board
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <input
                  type="text"
                  maxLength={25}
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Type your name..."
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-border-light dark:border-border-dark rounded-xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-accent-primary transition-theme"
                />
                
                {/* Typing cursive visual template block */}
                <div className="w-full h-24 bg-slate-50 dark:bg-slate-900 border border-border-light dark:border-border-dark rounded-2xl flex items-center justify-center select-none overflow-hidden">
                  <span className="text-3xl font-bold italic tracking-wide text-slate-800 dark:text-white font-serif font-handwriting">
                    {typedName || 'Your Signature'}
                  </span>
                </div>
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setShowSigModal(false); setTypedName(''); }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 rounded-2xl text-xs font-extrabold text-slate-600 dark:text-slate-400 hover-scale"
              >
                Cancel
              </button>
              <button
                onClick={saveSignature}
                className="flex-1 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary hover:brightness-110 text-white rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 hover-scale shadow-premium"
              >
                <Check size={14} /> Add to PDF
              </button>
            </div>

          </div>
        </div>
      )}

    </header>
  );
};
