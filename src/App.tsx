import React, { useState } from 'react';
import { EditorProvider, useEditor } from './context/EditorContext';
import { DragDropOverlay } from './components/DragDropOverlay';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { FormatPanel } from './components/FormatPanel';
import { Home } from './components/Home';
import { PDFUnlocker } from './components/PDFUnlocker';
import { PDFMerge } from './components/PDFMerge';
import { PDFCompress } from './components/PDFCompress';
import { PDFToWord } from './components/PDFToWord';
import * as pdfjsLib from 'pdfjs-dist';

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Bind PDF.js global worker to the local ESM worker bundle compiled by Vite.
// This is 100% offline compatible, fast, and matches version 5 ESM specs.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface MainEditorLayoutProps {
  onBack: () => void;
}

const MainEditorLayout: React.FC<MainEditorLayoutProps> = ({ onBack }) => {
  const { file } = useEditor();

  if (!file) {
    return <DragDropOverlay onBack={onBack} />;
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Top Application Toolbar */}
      <Toolbar />

      {/* Main Panel Flex Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side Thumbnail Sidebar */}
        <Sidebar />

        {/* Centered Scrollable Workspace */}
        <Workspace />

        {/* Right Styling Inspector */}
        <FormatPanel />
      </div>
    </div>
  );
};

function App() {
  const [route, setRoute] = useState<'home' | 'editor' | 'unlocker' | 'merge' | 'compress' | 'word'>('home');

  return (
    <EditorProvider>
      {route === 'home' ? (
        <Home onSelectUtility={(utility) => setRoute(utility)} />
      ) : route === 'unlocker' ? (
        <PDFUnlocker onBackToHome={() => setRoute('home')} />
      ) : route === 'merge' ? (
        <PDFMerge onBackToHome={() => setRoute('home')} />
      ) : route === 'compress' ? (
        <PDFCompress onBackToHome={() => setRoute('home')} />
      ) : route === 'word' ? (
        <PDFToWord onBackToHome={() => setRoute('home')} />
      ) : (
        <MainEditorLayout onBack={() => setRoute('home')} />
      )}
    </EditorProvider>
  );
}

export default App;
