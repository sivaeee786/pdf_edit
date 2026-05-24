import React from 'react';
import { useEditor } from '../context/EditorContext';
import type { NewTextBox, NativeTextEdit } from '../context/EditorContext';
import { 
  Sliders, Bold, Italic, AlignLeft, AlignCenter, AlignRight, 
  Trash2, TextCursorInput, HelpCircle, Square, Circle as CircleIcon, 
  TrendingUp, Image as ImageIcon 
} from 'lucide-react';

export const FormatPanel: React.FC = () => {
  const {
    selectedTextId,
    selectedTextType,
    newTextBoxes,
    nativeEdits,
    currentPage,
    updateTextBox,
    deleteTextBox,
    updateNativeEdit,
    saveHistorySnapshot,
  } = useEditor();

  // Find active selected target
  let activeNewBox: NewTextBox | undefined;
  let activeNativeEdit: NativeTextEdit | undefined;

  if (selectedTextId && selectedTextType === 'new') {
    activeNewBox = newTextBoxes.find(b => b.id === selectedTextId);
  } else if (selectedTextId && selectedTextType === 'native') {
    const editKey = `${currentPage}_${selectedTextId}`;
    activeNativeEdit = nativeEdits[editKey];
  }

  const isSelected = !!(activeNewBox || activeNativeEdit);

  // Styling properties
  const fontSize = activeNewBox?.fontSize ?? activeNativeEdit?.fontSize ?? 14;
  const fontFamily = activeNewBox?.fontFamily ?? activeNativeEdit?.fontFamily ?? 'Helvetica';
  const color = activeNewBox?.color ?? activeNativeEdit?.color ?? '#000000';
  const bold = activeNewBox?.bold ?? activeNativeEdit?.bold ?? false;
  const italic = activeNewBox?.italic ?? activeNativeEdit?.italic ?? false;
  const alignment = activeNewBox?.alignment ?? activeNativeEdit?.alignment ?? 'left';

  const triggerChange = (updates: any) => {
    // Save state snapshot for structural styling updates (e.g. bold toggle, color click, font family change)
    saveHistorySnapshot();

    if (selectedTextType === 'new' && selectedTextId) {
      updateTextBox(selectedTextId, updates);
    } else if (selectedTextType === 'native' && selectedTextId && activeNativeEdit) {
      updateNativeEdit(currentPage, parseInt(selectedTextId), activeNativeEdit.originalText, updates);
    }
  };

  const handleDelete = () => {
    if (selectedTextType === 'new' && selectedTextId) {
      deleteTextBox(selectedTextId);
    }
  };

  const presetColors = [
    '#000000', '#4b5563', '#9ca3af', '#ef4444', 
    '#f97316', '#eab308', '#22c55e', '#06b6d4', 
    '#3b82f6', '#6366f1', '#a855f7', '#ec4899'
  ];

  // Render based on selected type
  const renderInspectorContent = () => {
    if (activeNewBox?.type === 'shape') {
      const strokeWidth = activeNewBox.strokeWidth ?? 3;
      const fill = activeNewBox.fill ?? false;
      const isClosedShape = activeNewBox.shapeType === 'rectangle' || activeNewBox.shapeType === 'circle';

      return (
        <div className="p-4 flex flex-col gap-6 animate-fade-in">
          {/* Info Banner */}
          <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-center gap-2">
            {activeNewBox.shapeType === 'rectangle' ? (
              <Square size={14} className="text-accent-primary shrink-0" />
            ) : activeNewBox.shapeType === 'circle' ? (
              <CircleIcon size={14} className="text-accent-primary shrink-0" />
            ) : (
              <TrendingUp size={14} className="text-accent-primary shrink-0 animate-pulse" />
            )}
            <span className="text-[11px] font-bold text-indigo-500 dark:text-indigo-400 capitalize">
              Selected Shape: {activeNewBox.shapeType}
            </span>
          </div>

          {/* Border / Stroke Color Picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Stroke Color
            </label>
            <div className="grid grid-cols-4 gap-2">
              {presetColors.map((hex) => {
                const isSelectedColor = color.toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={`shape_col_${hex}`}
                    onClick={() => triggerChange({ color: hex })}
                    className={`w-8 h-8 rounded-full border transition-all cursor-pointer ${
                      isSelectedColor
                        ? 'border-accent-primary ring-2 ring-accent-primary/20 scale-110 shadow-premium'
                        : 'border-slate-200 dark:border-slate-800 hover:scale-105'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                );
              })}
            </div>
            
            {/* Custom Hex Input */}
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                value={color}
                onChange={(e) => triggerChange({ color: e.target.value })}
                className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-0 outline-none shrink-0"
              />
              <input
                type="text"
                maxLength={7}
                value={color}
                onChange={(e) => triggerChange({ color: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-border-light dark:border-border-dark rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-accent-primary"
              />
            </div>
          </div>

          {/* Stroke Width Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                Line Thickness
              </label>
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-border-light dark:border-border-dark">
                {strokeWidth}px
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="20"
                value={strokeWidth}
                onChange={(e) => triggerChange({ strokeWidth: parseInt(e.target.value) })}
                className="flex-1 accent-accent-primary cursor-ew-resize h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none"
              />
              <input
                type="number"
                min="1"
                max="30"
                value={strokeWidth}
                onChange={(e) => triggerChange({ strokeWidth: Math.max(1, parseInt(e.target.value) || 2) })}
                className="w-12 bg-slate-50 dark:bg-slate-900 border border-border-light dark:border-border-dark rounded-lg p-1 text-center text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
              />
            </div>
          </div>

          {/* Fill shape toggler */}
          {isClosedShape && (
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/40 border border-border-light dark:border-border-dark rounded-2xl">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Fill Shape
                </span>
                <span className="text-[10px] text-slate-400">
                  Apply semi-transparent color fill
                </span>
              </div>
              <button
                onClick={() => triggerChange({ fill: !fill })}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none flex items-center cursor-pointer ${
                  fill ? 'bg-accent-primary justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md transition-transform" />
              </button>
            </div>
          )}

          <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1" />

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-red-500/10 border border-red-500/20 hover:bg-red-500 text-red-500 hover:text-white text-xs font-extrabold rounded-xl transition-all hover-scale cursor-pointer"
          >
            <Trash2 size={13} /> Delete Shape
          </button>
        </div>
      );
    }

    if (activeNewBox?.type === 'image') {
      return (
        <div className="p-4 flex flex-col gap-6 animate-fade-in">
          {/* Info Banner */}
          <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-center gap-2">
            <ImageIcon size={14} className="text-accent-primary shrink-0" />
            <span className="text-[11px] font-bold text-indigo-500 dark:text-indigo-400 truncate">
              Selected Image
            </span>
          </div>

          {/* Image properties details */}
          <div className="flex flex-col gap-3 bg-slate-50 dark:bg-slate-900/40 p-4 border border-border-light dark:border-border-dark rounded-2xl">
            <h5 className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Asset Properties
            </h5>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Width:</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{Math.round(activeNewBox.width)} pt</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Height:</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{Math.round(activeNewBox.height)} pt</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Type:</span>
              <span className="font-bold text-emerald-500">Image Asset</span>
            </div>
          </div>

          <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1" />

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-red-500/10 border border-red-500/20 hover:bg-red-500 text-red-500 hover:text-white text-xs font-extrabold rounded-xl transition-all hover-scale cursor-pointer"
          >
            <Trash2 size={13} /> Delete Image
          </button>
        </div>
      );
    }

    // Default Text block editor
    return (
      <div className="p-4 flex flex-col gap-6 animate-fade-in">
        
        {/* Info Banner */}
        <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-center gap-2">
          <TextCursorInput size={14} className="text-accent-primary animate-pulse shrink-0" />
          <span className="text-[11px] font-bold text-indigo-500 dark:text-indigo-400 truncate">
            {selectedTextType === 'native' ? 'Editing native PDF line' : 'Selected new text box'}
          </span>
        </div>

        {/* Font Family Selection */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Font Family
          </label>
          <select
            value={fontFamily}
            onChange={(e) => triggerChange({ fontFamily: e.target.value })}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-border-light dark:border-border-dark rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-accent-primary transition-colors cursor-pointer"
          >
            <option value="Helvetica">Helvetica (Standard)</option>
            <option value="Courier">Courier (Monospace)</option>
            <option value="TimesRoman">Times New Roman (Serif)</option>
          </select>
        </div>

        {/* Font Size Selector */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Font Size
            </label>
            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-border-light dark:border-border-dark">
              {fontSize}px
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="8"
              max="72"
              value={fontSize}
              onChange={(e) => triggerChange({ fontSize: parseInt(e.target.value) })}
              className="flex-1 accent-accent-primary cursor-ew-resize h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none"
            />
            <input
              type="number"
              min="8"
              max="120"
              value={fontSize}
              onChange={(e) => triggerChange({ fontSize: Math.max(8, parseInt(e.target.value) || 12) })}
              className="w-12 bg-slate-50 dark:bg-slate-900 border border-border-light dark:border-border-dark rounded-lg p-1 text-center text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-accent-primary"
            />
          </div>
        </div>

        {/* Bold, Italic & Alignment Toggles */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* Weight Group */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Text Weight
            </label>
            <div className="flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-border-light dark:border-border-dark transition-theme">
              <button
                onClick={() => triggerChange({ bold: !bold })}
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  bold
                    ? 'bg-white dark:bg-panel-dark text-accent-primary shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title="Toggle Bold"
              >
                <Bold size={13} />
              </button>
              <button
                onClick={() => triggerChange({ italic: !italic })}
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  italic
                    ? 'bg-white dark:bg-panel-dark text-accent-primary shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title="Toggle Italic"
              >
                <Italic size={13} />
              </button>
            </div>
          </div>

          {/* Align Group */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Alignment
            </label>
            <div className="flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-border-light dark:border-border-dark transition-theme">
              <button
                onClick={() => triggerChange({ alignment: 'left' })}
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  alignment === 'left'
                    ? 'bg-white dark:bg-panel-dark text-accent-primary shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title="Align Left"
              >
                <AlignLeft size={13} />
              </button>
              <button
                onClick={() => triggerChange({ alignment: 'center' })}
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  alignment === 'center'
                    ? 'bg-white dark:bg-panel-dark text-accent-primary shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title="Align Center"
              >
                <AlignCenter size={13} />
              </button>
              <button
                onClick={() => triggerChange({ alignment: 'right' })}
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  alignment === 'right'
                    ? 'bg-white dark:bg-panel-dark text-accent-primary shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title="Align Right"
              >
                <AlignRight size={13} />
              </button>
            </div>
          </div>

        </div>

        {/* Color Palette Picker */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Text Color
          </label>
          <div className="grid grid-cols-4 gap-2">
            {presetColors.map((hex) => {
              const isSelectedColor = color.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={`col_${hex}`}
                  onClick={() => triggerChange({ color: hex })}
                  className={`w-8 h-8 rounded-full border transition-all cursor-pointer ${
                    isSelectedColor
                      ? 'border-accent-primary ring-2 ring-accent-primary/20 scale-110 shadow-premium'
                      : 'border-slate-200 dark:border-slate-800 hover:scale-105'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              );
            })}
          </div>
          
          {/* Custom Hex Input */}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="color"
              value={color}
              onChange={(e) => triggerChange({ color: e.target.value })}
              className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-0 outline-none shrink-0"
            />
            <input
              type="text"
              maxLength={7}
              value={color}
              onChange={(e) => triggerChange({ color: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-border-light dark:border-border-dark rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-accent-primary"
            />
          </div>
        </div>

        <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1" />

        {/* Textbox Deletion */}
        {selectedTextType === 'new' && (
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-red-500/10 border border-red-500/20 hover:bg-red-500 text-red-500 hover:text-white text-xs font-extrabold rounded-xl transition-all hover-scale cursor-pointer"
          >
            <Trash2 size={13} /> Delete Textbox
          </button>
        )}

      </div>
    );
  };

  return (
    <aside className="w-[200px] md:w-[260px] h-full flex flex-col bg-white dark:bg-panel-dark border-l border-border-light dark:border-border-dark select-none shrink-0 transition-theme overflow-y-auto">
      
      {/* Header */}
      <div className="h-12 border-b border-border-light dark:border-border-dark flex items-center px-4 gap-2 text-slate-500 dark:text-slate-400">
        <Sliders size={14} className="text-accent-primary" />
        <span className="text-xs font-extrabold tracking-wider uppercase text-slate-700 dark:text-slate-300">
          Format Inspector
        </span>
      </div>

      {isSelected ? renderInspectorContent() : (
        /* Empty State Instructions Panel (Figma style) */
        <div className="p-6 flex flex-col items-center justify-center text-center gap-4 h-[60%] select-none animate-pulse">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400 shadow-inner">
            <HelpCircle size={20} />
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
              No Selection
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed px-4">
              Select or click on an annotation, shape, or text block on the page to customize its styles, sizes, and colors.
            </p>
          </div>
        </div>
      )}

    </aside>
  );
};
