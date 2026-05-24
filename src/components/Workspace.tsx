import React, { useEffect } from 'react';
import { useEditor } from '../context/EditorContext';
import { PDFPageEditor } from './PDFPageEditor';
import { MousePointer, Edit3, Type } from 'lucide-react';

export const Workspace: React.FC = () => {
  const {
    currentPage,
    toolMode,
    selectedTextId,
    selectedTextType,
    deleteTextBox,
    undo,
    redo,
    setZoom,
    setToolMode,
    setSelectedTextId,
  } = useEditor();

  // Wire up professional Figma-style keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      
      // Ignore key events when user is actively writing in a textarea or input box
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      // 1. Backspace / Delete -> Delete custom textbox
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedTextId && selectedTextType === 'new') {
        e.preventDefault();
        deleteTextBox(selectedTextId);
      }

      // 2. Cmd + Z -> Undo
      if (isCmdOrCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // 3. Cmd + Shift + Z / Cmd + Y -> Redo
      if ((isCmdOrCtrl && e.key.toLowerCase() === 'z' && e.shiftKey) || (isCmdOrCtrl && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
      }

      // 4. Zoom bounds keys (+ / -)
      if (isCmdOrCtrl && e.key === '=') {
        e.preventDefault();
        setZoom((z) => z + 0.1);
      }
      if (isCmdOrCtrl && e.key === '-') {
        e.preventDefault();
        setZoom((z) => z - 0.1);
      }

      // 5. Tool togglers: V (Select), T (Add Text), E (Edit Original)
      if (e.key.toLowerCase() === 'v' && !isCmdOrCtrl) {
        setToolMode('select');
      }
      if (e.key.toLowerCase() === 't' && !isCmdOrCtrl) {
        setToolMode('add-text');
      }
      if (e.key.toLowerCase() === 'e' && !isCmdOrCtrl) {
        setToolMode('edit-text');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedTextId, selectedTextType, deleteTextBox, undo, redo, setZoom, setToolMode]);

  const handleWorkspaceClick = (e: React.MouseEvent) => {
    // Clear selection if clicking on blank workspace scroll bars
    const target = e.target as HTMLElement;
    if (target.classList.contains('workspace-scroll-container') || target.classList.contains('page-centering-container')) {
      setSelectedTextId(null, null);
    }
  };

  return (
    <div
      onClick={handleWorkspaceClick}
      className="flex-1 overflow-auto workspace-scroll-container bg-slate-100 dark:bg-workspace-dark/95 border-b border-border-light dark:border-border-dark select-none relative focus:outline-none transition-theme"
    >
      
      {/* Floating Canvas Mode Helper Tip */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none hidden md:flex items-center gap-2 px-3 py-1.5 glass-panel text-[11px] font-bold text-slate-500 dark:text-slate-400 rounded-xl shadow-premium animate-pulse">
        {toolMode === 'select' && (
          <>
            <MousePointer size={12} className="text-accent-primary" />
            <span>Select Mode: Click new box to drag & edit. [Delete] to remove.</span>
          </>
        )}
        {toolMode === 'edit-text' && (
          <>
            <Edit3 size={12} className="text-accent-primary" />
            <span>Edit Native Text Mode: Hover & click original sentences to overwrite.</span>
          </>
        )}
        {toolMode === 'add-text' && (
          <>
            <Type size={12} className="text-accent-primary" />
            <span>Add Text Mode: Click anywhere on PDF page to drop custom textbox.</span>
          </>
        )}
      </div>

      {/* Centering Layout */}
      <div className="min-w-full min-h-full flex items-center justify-center page-centering-container">
        <PDFPageEditor pageIndex={currentPage} />
      </div>

    </div>
  );
};
