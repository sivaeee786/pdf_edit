import React, { useEffect, useRef, useState } from 'react';
import { useEditor } from '../context/EditorContext';
import type { NewTextBox } from '../context/EditorContext';
import * as pdfjsLib from 'pdfjs-dist';

interface PDFPageEditorProps {
  pageIndex: number;
}

// Convert CSS RGB color string to Hex
function rgbToHex(rgbStr: string): string {
  const match = rgbStr.match(/\d+/g);
  if (!match) return '#000000';
  const r = parseInt(match[0]);
  const g = parseInt(match[1]);
  const b = parseInt(match[2]);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Map custom computed font-family name to standard TrueType PDF counterparts
function mapFontFamily(fontStr: string): 'Helvetica' | 'Courier' | 'TimesRoman' {
  const lower = fontStr.toLowerCase();
  if (lower.includes('courier') || lower.includes('mono') || lower.includes('consolas')) {
    return 'Courier';
  }
  if (lower.includes('times') || lower.includes('serif') || lower.includes('georgia')) {
    return 'TimesRoman';
  }
  return 'Helvetica';
}

export const PDFPageEditor: React.FC<PDFPageEditorProps> = ({ pageIndex }) => {
  const {
    pdfDoc,
    zoom,
    toolMode,
    selectedTextId,
    selectedTextType,
    nativeEdits,
    newTextBoxes,
    setSelectedTextId,
    addTextBox,
    updateTextBox,
    updateNativeEdit,
    saveHistorySnapshot,
  } = useEditor();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const textContentRef = useRef<any>(null);
  
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [rendering, setRendering] = useState<boolean>(false);
  const [activeInputId, setActiveInputId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  // Dragger snaps coordinate
  const dragInfoRef = useRef<{
    boxId: string;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    isDragging: boolean;
  } | null>(null);

  const resizeInfoRef = useRef<{
    boxId: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    isResizing: boolean;
  } | null>(null);

  // 1. Retina DPI Canvas & Native TextLayer Rendering
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let active = true;
    let renderTask: any = null;
    let textLayerRenderTask: any = null;

    const renderPageAndLayer = async () => {
      setRendering(true);
      try {
        const page = await pdfDoc.getPage(pageIndex + 1);
        if (!active) return;

        // original PDF points (1/72 inch)
        const originalViewport = page.getViewport({ scale: 1.0 });
        setPageSize({ width: originalViewport.width, height: originalViewport.height });

        // scaled viewport for zoom rendering
        const viewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // DPI adjustment for razor-sharp canvas rendering
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.scale(dpr, dpr);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
        
        if (!active) return;

        // Render PDF.js native transparent TextLayer DOM on top
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;

          const textContent = await page.getTextContent();
          if (!active) return;
          textContentRef.current = textContent;

          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
          });

          await textLayer.render();
          
          if (active) {
            setRendering(false);
            syncSpanVisibilities();
          }
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Error drawing PDF Page canvas & TextLayer:', err);
        }
      }
    };

    renderPageAndLayer();

    return () => {
      active = false;
      if (renderTask) renderTask.cancel();
      if (textLayerRenderTask) textLayerRenderTask.cancel();
    };
  }, [pdfDoc, pageIndex, zoom]);

  // 2. Hide PDF.js original spans that have active user edits
  const syncSpanVisibilities = () => {
    const textLayerDiv = textLayerRef.current;
    if (!textLayerDiv) return;

    const spans = textLayerDiv.children;
    for (let i = 0; i < spans.length; i++) {
      const editKey = `${pageIndex}_${i}`;
      const span = spans[i] as HTMLElement;
      if (nativeEdits[editKey]) {
        span.style.visibility = 'hidden';
      } else {
        span.style.visibility = 'visible';
      }
    }
  };

  useEffect(() => {
    syncSpanVisibilities();
  }, [nativeEdits, pageIndex, rendering]);

  // 3. Single-Click TextLayer Delegate (Captures Computed CSS Elements!)
  const handleTextLayerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode !== 'edit-text') return;

    const span = e.target as HTMLElement;
    if (span.tagName !== 'SPAN' || !span.textContent) return;

    e.stopPropagation();

    // Capture precise computed styles in-browser
    const computed = window.getComputedStyle(span);
    const originalText = span.textContent;

    const spanRect = span.getBoundingClientRect();
    const containerRect = containerRef.current!.getBoundingClientRect();

    // Map percentage coordinates
    const leftPct = ((spanRect.left - containerRect.left) / containerRect.width) * 100;
    const topPct = ((spanRect.top - containerRect.top) / containerRect.height) * 100;
    const widthPct = (spanRect.width / containerRect.width) * 100;
    const heightPct = (spanRect.height / containerRect.height) * 100;

    const fontSizePx = parseFloat(computed.fontSize);
    const color = computed.color; // e.g. "rgb(0,0,0)"
    const fontFamily = computed.fontFamily;
    const fontWeight = computed.fontWeight;
    const fontStyle = computed.fontStyle;
    const letterSpacing = computed.letterSpacing;
    const transformMatrix = computed.transform;
    const originalClassName = span.className;

    // Convert back to original PDF points coordinates
    const pageWidth = pageSize.width;
    const pageHeight = pageSize.height;
    
    const pdfX = (leftPct / 100) * pageWidth;
    const pdfWidth = (widthPct / 100) * pageWidth;
    const pdfHeight = (heightPct / 100) * pageHeight;
    const pdfY = pageHeight - ((topPct / 100) * pageHeight) - pdfHeight;

    // Get span index in DOM
    const spanIndex = Array.from(span.parentNode?.children || []).indexOf(span);
    const editId = `${pageIndex}_${spanIndex}`;
    const activeEdit = nativeEdits[editId];

    // Hide original span visually
    span.style.visibility = 'hidden';

    // Lock inputs
    setActiveInputId(editId);
    setEditingText(activeEdit ? activeEdit.text : originalText);
    setSelectedTextId(spanIndex.toString(), 'native');

    // Retrieve precise fontName from PDF.js items to match browser @font-face injection
    let originalFont = fontFamily;
    const textContent = textContentRef.current;
    if (textContent && textContent.items && textContent.items[spanIndex]) {
      const textItem = textContent.items[spanIndex] as any;
      if (textItem.fontName) {
        originalFont = `${textItem.fontName}, ${fontFamily}`;
      }
    }

    // Register active metadata in global context state
    updateNativeEdit(pageIndex, spanIndex, originalText, {
      x: pdfX,
      y: pdfY,
      width: pdfWidth,
      height: pdfHeight,
      text: activeEdit ? activeEdit.text : originalText,
      fontSize: fontSizePx / zoom, // base font size in PDF points
      color: rgbToHex(color),
      fontFamily: mapFontFamily(fontFamily),
      bold: fontWeight === 'bold' || parseInt(fontWeight) >= 700,
      italic: fontStyle === 'italic',
      alignment: 'left',
      
      // Preservation channels
      leftPct,
      topPct,
      widthPct,
      heightPct,
      originalFontFamily: originalFont,
      originalFontWeight: fontWeight,
      originalLetterSpacing: letterSpacing,
      originalColor: color,
      originalWidth: pdfWidth,
      originalWidthPct: widthPct,
      transformMatrix,
      originalClassName,
    });
  };

  // 4. Input Changes & Auto-Resize Spacing Guard (Real-Time Container Width Growing!)
  const handleNativeInputChange = (editVal: any, val: string) => {
    setEditingText(val);

    const originalWidth = editVal.originalWidth || editVal.width || 50;
    const originalLen = editVal.originalText.length || 1;
    
    // Exact average character width of the original text
    const avgCharWidth = originalWidth / originalLen;

    // Calculate new width, ensuring it doesn't shrink below original mask bounds
    const newWidth = Math.max(originalWidth, val.length * avgCharWidth);
    
    // Map width back to percentage
    const pageWidth = pageSize.width || 595;
    const newWidthPct = (newWidth / pageWidth) * 100;

    // Update native edit state - keeping the font size constant!
    updateNativeEdit(pageIndex, editVal.textIndex, editVal.originalText, {
      text: val,
      width: newWidth,
      widthPct: newWidthPct,
      fontSize: editVal.fontSize // keep font size constant (no shrinking!)
    });
  };

  const handleNativeInputBlur = (editVal: any) => {
    const trimmed = editingText.trim();
    
    if (trimmed !== editVal.text) {
      saveHistorySnapshot();
      updateNativeEdit(pageIndex, editVal.textIndex, editVal.originalText, { text: trimmed });
    }
    
    setActiveInputId(null);
    syncSpanVisibilities();
  };

  // 5. Page Click handlers (custom placed textbox)
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode !== 'add-text' || !containerRef.current) return;

    const target = e.target as HTMLElement;
    if (target.closest('.draggable-text-box') || target.closest('textarea') || target.closest('.textLayer span')) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const xClick = e.clientX - rect.left;
    const yClick = e.clientY - rect.top;

    const xPct = (xClick / rect.width) * 100;
    const yPct = (yClick / rect.height) * 100;

    const boxId = addTextBox(pageIndex, xPct, yPct);
    
    setActiveInputId(boxId);
    setEditingText('Double click to edit');
    setSelectedTextId(boxId, 'new');
  };

  // 6. Custom Draggable textbox events
  const handleNewTextBoxDoubleClick = (box: NewTextBox, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveInputId(box.id);
    setEditingText(box.text);
    setSelectedTextId(box.id, 'new');
  };

  const handleNewTextBoxBlur = (box: NewTextBox) => {
    const trimmed = editingText.trim();
    if (trimmed !== box.text) {
      saveHistorySnapshot();
      updateTextBox(box.id, { text: trimmed || 'Text box' });
    }
    setActiveInputId(null);
  };

  const startDrag = (box: NewTextBox, e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'select' || activeInputId === box.id) return;
    
    e.preventDefault();
    setSelectedTextId(box.id, 'new');

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragInfoRef.current = {
      boxId: box.id,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: box.x,
      startTop: box.y,
      isDragging: false,
    };

    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handleDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragInfoRef.current;
    if (!drag || drag.boxId === '') return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const deltaX = e.clientX - drag.startX;
    const deltaY = e.clientY - drag.startY;

    const pctDeltaX = (deltaX / rect.width) * 100;
    const pctDeltaY = (deltaY / rect.height) * 100;

    if (!drag.isDragging && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
      saveHistorySnapshot();
      drag.isDragging = true;
    }

    const nextX = Math.min(Math.max(0, drag.startLeft + pctDeltaX), 90);
    const nextY = Math.min(Math.max(0, drag.startTop + pctDeltaY), 95);

    updateTextBox(drag.boxId, { x: nextX, y: nextY });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragInfoRef.current;
    if (!drag) return;

    if (drag.boxId !== '') {
      containerRef.current?.releasePointerCapture(e.pointerId);
    }
    dragInfoRef.current = null;
  };

  const startResize = (box: NewTextBox, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); // prevent drag
    e.preventDefault();
    setSelectedTextId(box.id, 'new');

    resizeInfoRef.current = {
      boxId: box.id,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: box.width,
      startHeight: box.height,
      isResizing: false,
    };

    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handleResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeInfoRef.current;
    if (!resize || resize.boxId === '') return;

    const deltaX = e.clientX - resize.startX;
    const deltaY = e.clientY - resize.startY;

    const pageDeltaX = deltaX / zoom;
    const pageDeltaY = deltaY / zoom;

    if (!resize.isResizing && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
      saveHistorySnapshot();
      resize.isResizing = true;
    }

    const nextWidth = Math.max(20, resize.startWidth + pageDeltaX);
    const nextHeight = Math.max(20, resize.startHeight + pageDeltaY);

    updateTextBox(resize.boxId, { width: nextWidth, height: nextHeight });
  };

  const endResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeInfoRef.current;
    if (!resize) return;

    if (resize.boxId !== '') {
      containerRef.current?.releasePointerCapture(e.pointerId);
    }
    resizeInfoRef.current = null;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragInfoRef.current) {
      handleDrag(e);
    } else if (resizeInfoRef.current) {
      handleResize(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragInfoRef.current) {
      endDrag(e);
    } else if (resizeInfoRef.current) {
      endResize(e);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 min-h-full">
      <div 
        ref={containerRef}
        onClick={handlePageClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`canvas-container relative select-none cursor-default ${
          toolMode === 'add-text' ? 'cursor-crosshair ring-2 ring-indigo-500/20' : ''
        } ${rendering ? 'opacity-85' : ''}`}
        style={{
          width: pageSize.width ? `${pageSize.width * zoom}px` : 'auto',
          height: pageSize.height ? `${pageSize.height * zoom}px` : 'auto',
        }}
      >
        
        {/* Visual PDF page canvas */}
        <canvas ref={canvasRef} className="block pointer-events-none" />

        {/* Dynamic PDF.js HTML transparent TextLayer */}
        <div 
          ref={textLayerRef}
          onClick={handleTextLayerClick}
          className={`textLayer ${toolMode === 'edit-text' ? 'edit-mode-active' : ''}`}
        />

        {/* 1. Coordinate-Aligned Native Text Editors Overlay */}
        <div className="pdf-overlay-layer z-20">
          {Object.keys(nativeEdits)
            .filter((key) => nativeEdits[key].pageIndex === pageIndex)
            .map((key) => {
              const editVal = nativeEdits[key];
              const isEditingThisLine = activeInputId === key;
              const isSelected = selectedTextId === editVal.textIndex.toString() && selectedTextType === 'native';

              return (
                <div key={`edit_wrapper_${key}`}>
                  
                  {/* Opaque solid white masking block covers original canvas letters */}
                  {editVal.leftPct !== undefined && (
                    <div
                      className="text-mask-block"
                      style={{
                        left: `calc(${editVal.leftPct}% - 2px)`,
                        top: `calc(${editVal.topPct}% - 2px)`,
                        width: `calc(${editVal.widthPct}% + 4px)`,
                        height: `calc(${editVal.heightPct}% + 4px)`,
                        backgroundColor: '#ffffff',
                      }}
                    />
                  )}

                  {/* Render replacement text inheriting exact styles */}
                  {!isEditingThisLine && editVal.leftPct !== undefined && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTextId(editVal.textIndex.toString(), 'native');
                        if (toolMode === 'edit-text') {
                          setActiveInputId(key);
                          setEditingText(editVal.text);
                        }
                      }}
                      className={`absolute select-none cursor-pointer whitespace-nowrap overflow-visible pointer-events-auto z-20 ${
                        toolMode === 'edit-text' ? 'edit-mode-active-overlay' : ''
                      } ${
                        isSelected && toolMode === 'edit-text' ? 'ring-2 ring-accent-primary rounded' : ''
                      } ${editVal.originalClassName || ''}`}
                      style={{
                        left: `${editVal.leftPct}%`,
                        top: `${editVal.topPct}%`,
                        fontSize: `${editVal.fontSize * zoom}px`,
                        fontFamily: editVal.originalFontFamily || 'sans-serif',
                        fontWeight: editVal.bold ? 'bold' : (editVal.originalFontWeight || 'normal'),
                        fontStyle: editVal.italic ? 'italic' : 'normal',
                        color: editVal.color || '#000000',
                        letterSpacing: editVal.originalLetterSpacing || 'normal',
                        transform: editVal.transformMatrix,
                        transformOrigin: '0% 0%',
                        lineHeight: 1,
                      }}
                    >
                      {editVal.text}
                    </div>
                  )}

                  {/* Active inline text editing input (replaces textarea) */}
                  {isEditingThisLine && editVal.leftPct !== undefined && (
                    <input
                      type="text"
                      autoFocus
                      value={editingText}
                      onChange={(e) => handleNativeInputChange(editVal, e.target.value)}
                      onBlur={() => handleNativeInputBlur(editVal)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      className={`text-edit-input ${editVal.originalClassName || ''}`}
                      style={{
                        left: `${editVal.leftPct}%`,
                        top: `${editVal.topPct}%`,
                        width: `calc(${editVal.widthPct || 0}% + 20px)`,
                        height: `calc(${editVal.heightPct || 0}% + 4px)`,
                        fontSize: `${editVal.fontSize * zoom}px`,
                        fontFamily: editVal.originalFontFamily || 'sans-serif',
                        fontWeight: editVal.bold ? 'bold' : (editVal.originalFontWeight || 'normal'),
                        fontStyle: editVal.italic ? 'italic' : 'normal',
                        color: editVal.color || '#000000',
                        letterSpacing: editVal.originalLetterSpacing || 'normal',
                        transform: editVal.transformMatrix,
                        transformOrigin: '0% 0%',
                        lineHeight: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        padding: 0,
                        margin: 0,
                        boxShadow: 'none',
                      }}
                    />
                  )}

                </div>
              );
            })}
        </div>

        {/* 2. Custom added textboxes layer */}
        <div className="pdf-overlay-layer z-25">
          {newTextBoxes
            .filter((box) => box.pageIndex === pageIndex)
            .map((box) => {
              const isSelected = selectedTextId === box.id && selectedTextType === 'new';
              const isEditing = activeInputId === box.id && (!box.type || box.type === 'text');
              const hasCustomHeight = box.type === 'image' || box.type === 'shape';

              return (
                <div
                  key={`new_box_${box.id}`}
                  onPointerDown={(e) => startDrag(box, e)}
                  onDoubleClick={(e) => {
                    if (!box.type || box.type === 'text') {
                      handleNewTextBoxDoubleClick(box, e);
                    }
                  }}
                  className={`draggable-text-box ${isSelected ? 'selected' : ''}`}
                  style={{
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: isEditing ? 'auto' : `${box.width * zoom}px`,
                    height: hasCustomHeight ? `${box.height * zoom}px` : 'auto',
                    minWidth: box.type ? 'auto' : '60px',
                  }}
                >
                  {box.type === 'image' ? (
                    <img 
                      src={box.imageBase64} 
                      className="w-full h-full object-contain pointer-events-none select-none" 
                      alt="Annotation Asset"
                    />
                  ) : box.type === 'shape' ? (
                    box.shapeType === 'rectangle' ? (
                      <div 
                        className="w-full h-full" 
                        style={{ 
                          backgroundColor: box.fill ? `${box.color}15` : 'transparent',
                          border: `${box.strokeWidth}px solid ${box.color}`, 
                          borderRadius: '2px' 
                        }} 
                      />
                    ) : box.shapeType === 'circle' ? (
                      <div 
                        className="w-full h-full rounded-full" 
                        style={{ 
                          backgroundColor: box.fill ? `${box.color}15` : 'transparent', 
                          border: `${box.strokeWidth}px solid ${box.color}` 
                        }} 
                      />
                    ) : (
                      /* Line & Arrow SVG */
                      <svg className="w-full h-full overflow-visible" style={{ color: box.color }}>
                        <line x1="0" y1="100%" x2="100%" y2="0" stroke="currentColor" strokeWidth={box.strokeWidth} />
                        {box.shapeType === 'arrow' && (
                          <circle cx="100%" cy="0" r={(box.strokeWidth || 3) * 1.5} fill="currentColor" />
                        )}
                      </svg>
                    )
                  ) : isEditing ? (
                    <textarea
                      autoFocus
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onBlur={() => handleNewTextBoxBlur(box)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) e.currentTarget.blur(); }}
                      className="w-full h-full p-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded border border-accent-secondary text-xs outline-none resize-none"
                      style={{
                        fontSize: `${box.fontSize * zoom}px`,
                      }}
                    />
                  ) : (
                    <div
                      className="whitespace-normal break-words p-0.5 select-none"
                      style={{
                        fontSize: `${box.fontSize * zoom}px`,
                        color: box.color,
                        fontFamily: box.fontFamily === 'Courier' ? 'monospace' : box.fontFamily === 'TimesRoman' ? 'serif' : 'sans-serif',
                        fontWeight: box.bold ? 'bold' : 'normal',
                        fontStyle: box.italic ? 'italic' : 'normal',
                        textAlign: box.alignment,
                        lineHeight: 1.2,
                      }}
                    >
                      {box.text}
                    </div>
                  )}

                  {/* Resize Drag Handles when select tool is active */}
                  {isSelected && toolMode === 'select' && (
                    <div 
                      onPointerDown={(e) => startResize(box, e)}
                      className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-accent-secondary hover:scale-125 rounded-full cursor-se-resize pointer-events-auto z-30 transition-transform" 
                    />
                  )}
                </div>
              );
            })}
        </div>

        {/* Syncing/Rendering Spinner overlay */}
        {rendering && (
          <div className="absolute inset-0 bg-slate-100/30 dark:bg-panel-dark/30 backdrop-blur-[1px] flex items-center justify-center pointer-events-none z-30 transition-opacity">
            <div className="flex items-center gap-2.5 px-4 py-2 bg-white/90 dark:bg-slate-900/90 shadow-premium rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold animate-pulse">
              <div className="w-3.5 h-3.5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin shrink-0" />
              Syncing textLayer metrics...
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
