import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Define the shape of a custom placed textbox
export interface NewTextBox {
  id: string;
  pageIndex: number;
  x: number; // percentage coordinate relative to page width (0 to 100)
  y: number; // percentage coordinate relative to page height (0 to 100)
  text: string;
  fontSize: number; // in pixels (corresponds to points on export)
  color: string; // hex color string
  fontFamily: 'Helvetica' | 'Courier' | 'TimesRoman';
  bold: boolean;
  italic: boolean;
  alignment: 'left' | 'center' | 'right';
  width: number; // estimated width in pixels
  height: number; // estimated height in pixels
  
  // Annotation extensions
  type?: 'text' | 'image' | 'shape';
  shapeType?: 'rectangle' | 'circle' | 'line' | 'arrow';
  imageBase64?: string;
  strokeWidth?: number;
  fill?: boolean;
}

// Define the shape of a native text edit
export interface NativeTextEdit {
  pageIndex: number;
  textIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  originalText: string;
  text: string;
  fontSize: number;
  color: string;
  fontFamily: 'Helvetica' | 'Courier' | 'TimesRoman';
  bold: boolean;
  italic: boolean;
  alignment: 'left' | 'center' | 'right';
  
  // High fidelity original styling preservation
  originalFontFamily?: string;
  originalFontWeight?: string;
  originalLetterSpacing?: string;
  originalColor?: string;
  transformMatrix?: string;
  originalClassName?: string;
  leftPct?: number;
  topPct?: number;
  widthPct?: number;
  heightPct?: number;
  originalWidth?: number;
  originalWidthPct?: number;
}

export type ToolMode = 'select' | 'edit-text' | 'add-text';

// Memento structure for Undo/Redo
interface StateSnapshot {
  nativeEdits: Record<string, NativeTextEdit>;
  newTextBoxes: NewTextBox[];
}

interface EditorContextType {
  file: File | null;
  pdfBytes: ArrayBuffer | null;
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  pageCount: number;
  currentPage: number;
  zoom: number;
  toolMode: ToolMode;
  darkMode: boolean;
  selectedTextId: string | null;
  selectedTextType: 'native' | 'new' | null;
  
  // States
  nativeEdits: Record<string, NativeTextEdit>;
  newTextBoxes: NewTextBox[];
  
  // History checks
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  loadFile: (file: File) => Promise<void>;
  closeFile: () => void;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setToolMode: (mode: ToolMode) => void;
  toggleDarkMode: () => void;
  setSelectedTextId: (id: string | null, type: 'native' | 'new' | null) => void;
  
  // Editing & adding box mutations
  addTextBox: (pageIndex: number, x: number, y: number) => string;
  addImageBox: (pageIndex: number, base64: string, width: number, height: number) => string;
  addShapeBox: (pageIndex: number, shape: 'rectangle' | 'circle' | 'line' | 'arrow') => string;
  updateTextBox: (id: string, updates: Partial<NewTextBox>) => void;
  deleteTextBox: (id: string) => void;
  
  updateNativeEdit: (pageIndex: number, textIndex: number, originalText: string, updates: Partial<NativeTextEdit>) => void;
  
  // History Actions
  undo: () => void;
  redo: () => void;
  saveHistorySnapshot: () => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [currentPage, setPage] = useState<number>(0);
  const [zoom, setZoomState] = useState<number>(1.0);
  const [toolMode, setToolModeState] = useState<ToolMode>('select');
  const [darkMode, setDarkMode] = useState<boolean>(true); // default darkmode for Figma aesthetic
  const [selectedTextId, setSelectedTextIdState] = useState<string | null>(null);
  const [selectedTextType, setSelectedTextType] = useState<'native' | 'new' | null>(null);

  // User modifications
  const [nativeEdits, setNativeEdits] = useState<Record<string, NativeTextEdit>>({});
  const [newTextBoxes, setNewTextBoxes] = useState<NewTextBox[]>([]);

  // Undo / Redo Stacks
  const [historyPast, setHistoryPast] = useState<StateSnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<StateSnapshot[]>([]);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  // Deep clone helper
  const cloneState = useCallback((edits: Record<string, NativeTextEdit>, boxes: NewTextBox[]): StateSnapshot => {
    return {
      nativeEdits: JSON.parse(JSON.stringify(edits)),
      newTextBoxes: JSON.parse(JSON.stringify(boxes)),
    };
  }, []);

  // Saves current snapshot to the undo history stack
  const saveHistorySnapshot = useCallback(() => {
    setHistoryPast((prev) => [...prev, cloneState(nativeEdits, newTextBoxes)]);
    setHistoryFuture([]); // clear redo stack on new action
  }, [nativeEdits, newTextBoxes, cloneState]);

  const undo = () => {
    if (historyPast.length === 0) return;
    
    // Get the previous snapshot
    const prev = historyPast[historyPast.length - 1];
    setHistoryPast((past) => past.slice(0, past.length - 1));
    
    // Put current state on redo stack
    setHistoryFuture((future) => [cloneState(nativeEdits, newTextBoxes), ...future]);
    
    // Apply previous state
    setNativeEdits(prev.nativeEdits);
    setNewTextBoxes(prev.newTextBoxes);
    setSelectedTextIdState(null);
    setSelectedTextType(null);
  };

  const redo = () => {
    if (historyFuture.length === 0) return;
    
    // Get the next snapshot
    const next = historyFuture[0];
    setHistoryFuture((future) => future.slice(1));
    
    // Put current state on undo stack
    setHistoryPast((past) => [...past, cloneState(nativeEdits, newTextBoxes)]);
    
    // Apply next state
    setNativeEdits(next.nativeEdits);
    setNewTextBoxes(next.newTextBoxes);
    setSelectedTextIdState(null);
    setSelectedTextType(null);
  };

  const setZoom = (val: number | ((prev: number) => number)) => {
    setZoomState((prev) => {
      const nextZoom = typeof val === 'function' ? val(prev) : val;
      return Math.min(Math.max(nextZoom, 0.4), 2.5); // zoom bounds
    });
  };

  const loadFile = async (selectedFile: File) => {
    try {
      const bytes = await selectedFile.arrayBuffer();
      
      // Load using PDF.js
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      
      setFile(selectedFile);
      setPdfBytes(bytes);
      setPdfDoc(doc);
      setPageCount(doc.numPages);
      setPage(0);
      setZoomState(1.0);
      setToolModeState('select');
      
      // Reset user edits & stacks
      setNativeEdits({});
      setNewTextBoxes([]);
      setHistoryPast([]);
      setHistoryFuture([]);
      setSelectedTextIdState(null);
      setSelectedTextType(null);
    } catch (err) {
      console.error('Error loading PDF:', err);
      throw new Error('Unsupported or corrupt PDF file.');
    }
  };

  const closeFile = () => {
    setFile(null);
    setPdfBytes(null);
    setPdfDoc(null);
    setPageCount(0);
    setPage(0);
    setZoomState(1.0);
    setNativeEdits({});
    setNewTextBoxes([]);
    setHistoryPast([]);
    setHistoryFuture([]);
    setSelectedTextIdState(null);
    setSelectedTextType(null);
  };

  const setCurrentPage = (pageIdx: number) => {
    if (pageIdx >= 0 && pageIdx < pageCount) {
      setPage(pageIdx);
      setSelectedTextIdState(null);
      setSelectedTextType(null);
    }
  };

  const setToolMode = (mode: ToolMode) => {
    setToolModeState(mode);
    setSelectedTextIdState(null);
    setSelectedTextType(null);
  };

  const setSelectedTextId = (id: string | null, type: 'native' | 'new' | null) => {
    setSelectedTextIdState(id);
    setSelectedTextType(type);
  };

  // Add textbox action
  const addTextBox = (pageIdx: number, xPct: number, yPct: number): string => {
    saveHistorySnapshot();
    const id = `textbox_${Date.now()}`;
    const newBox: NewTextBox = {
      id,
      pageIndex: pageIdx,
      x: xPct,
      y: yPct,
      text: 'Double click to edit',
      fontSize: 16,
      color: '#000000',
      fontFamily: 'Helvetica',
      bold: false,
      italic: false,
      alignment: 'left',
      width: 160,
      height: 32
    };
    setNewTextBoxes((prev) => [...prev, newBox]);
    setSelectedTextIdState(id);
    setSelectedTextType('new');
    return id;
  };

  // Add image box action
  const addImageBox = (pageIdx: number, base64: string, w: number, h: number): string => {
    saveHistorySnapshot();
    const id = `image_${Date.now()}`;
    const newBox: NewTextBox = {
      id,
      pageIndex: pageIdx,
      x: 35, // default center left
      y: 35, // default center top
      text: '', // no text for image
      fontSize: 12,
      color: '#000000',
      fontFamily: 'Helvetica',
      bold: false,
      italic: false,
      alignment: 'left',
      width: w || 180,
      height: h || 120,
      type: 'image',
      imageBase64: base64,
    };
    setNewTextBoxes((prev) => [...prev, newBox]);
    setSelectedTextIdState(id);
    setSelectedTextType('new');
    return id;
  };

  // Add shape box action
  const addShapeBox = (pageIdx: number, shape: 'rectangle' | 'circle' | 'line' | 'arrow'): string => {
    saveHistorySnapshot();
    const id = `shape_${Date.now()}`;
    const newBox: NewTextBox = {
      id,
      pageIndex: pageIdx,
      x: 40,
      y: 40,
      text: '',
      fontSize: 12,
      color: '#4f46e5', // standard default indigo stroke color
      fontFamily: 'Helvetica',
      bold: false,
      italic: false,
      alignment: 'left',
      width: shape === 'line' || shape === 'arrow' ? 120 : 100,
      height: shape === 'line' || shape === 'arrow' ? 40 : 80,
      type: 'shape',
      shapeType: shape,
      strokeWidth: 3,
      fill: shape === 'line' || shape === 'arrow' ? false : true,
    };
    setNewTextBoxes((prev) => [...prev, newBox]);
    setSelectedTextIdState(id);
    setSelectedTextType('new');
    return id;
  };

  // Update textbox details
  const updateTextBox = (id: string, updates: Partial<NewTextBox>) => {
    // Only save snapshot for structural/permanent changes like finishing text or colors,
    // not raw continuous drag movements (we trigger saveHistorySnapshot before dragging or input blurs!).
    setNewTextBoxes((prev) =>
      prev.map((box) => (box.id === id ? { ...box, ...updates } : box))
    );
  };

  // Delete textbox
  const deleteTextBox = (id: string) => {
    saveHistorySnapshot();
    setNewTextBoxes((prev) => prev.filter((box) => box.id !== id));
    if (selectedTextId === id) {
      setSelectedTextIdState(null);
      setSelectedTextType(null);
    }
  };

  // Modify original document text edits
  const updateNativeEdit = (
    pageIdx: number,
    textIdx: number,
    originalText: string,
    updates: Partial<NativeTextEdit>
  ) => {
    const editKey = `${pageIdx}_${textIdx}`;
    
    setNativeEdits((prev) => {
      const existing = prev[editKey];
      
      const newEdit: NativeTextEdit = existing 
        ? { ...existing, ...updates }
        : {
            pageIndex: pageIdx,
            textIndex: textIdx,
            x: updates.x || 0,
            y: updates.y || 0,
            width: updates.width || 0,
            height: updates.height || 0,
            originalText,
            text: updates.text || '',
            fontSize: updates.fontSize || 12,
            color: updates.color || '#000000',
            fontFamily: updates.fontFamily || 'Helvetica',
            bold: updates.bold || false,
            italic: updates.italic || false,
            alignment: updates.alignment || 'left',
            ...updates
          };
          
      return {
        ...prev,
        [editKey]: newEdit
      };
    });
  };

  return (
    <EditorContext.Provider
      value={{
        file,
        pdfBytes,
        pdfDoc,
        pageCount,
        currentPage,
        zoom,
        toolMode,
        darkMode,
        selectedTextId,
        selectedTextType,
        nativeEdits,
        newTextBoxes,
        canUndo: historyPast.length > 0,
        canRedo: historyFuture.length > 0,
        loadFile,
        closeFile,
        setCurrentPage,
        setZoom,
        setToolMode,
        toggleDarkMode,
        setSelectedTextId,
        addTextBox,
        addImageBox,
        addShapeBox,
        updateTextBox,
        deleteTextBox,
        updateNativeEdit,
        undo,
        redo,
        saveHistorySnapshot,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
};
