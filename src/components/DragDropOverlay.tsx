import React, { useState, useRef } from 'react';
import { useEditor } from '../context/EditorContext';
import { UploadCloud, FileText, Lock, Edit3, Type, Download, Sun, Moon } from 'lucide-react';

interface DragDropOverlayProps {
  onBack?: () => void;
}

export const DragDropOverlay: React.FC<DragDropOverlayProps> = ({ onBack }) => {
  const { loadFile, darkMode, toggleDarkMode } = useEditor();
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setError('Please upload a valid PDF document.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await loadFile(file);
    } catch (err: any) {
      setError(err.message || 'Failed to read PDF.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-workspace-light to-slate-200 dark:from-workspace-dark dark:to-slate-950 transition-theme overflow-y-auto relative">
      
      {/* Top Floating Glass Banner */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-40">
        {onBack ? (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-extrabold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white bg-white/80 dark:bg-panel-dark/80 px-4 py-2.5 rounded-full border border-slate-200 dark:border-border-dark backdrop-blur-sm cursor-pointer shadow-premium hover-scale"
          >
            &larr; Back to Dashboard
          </button>
        ) : <div />}
        <button
          onClick={toggleDarkMode}
          className="p-2.5 rounded-full glass-panel hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover-scale"
          aria-label="Toggle theme"
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div className="max-w-4xl w-full flex flex-col items-center gap-8 py-10 z-10">
        
        {/* Logo and Intro */}
        <div className="text-center flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-accent-primary to-accent-secondary flex items-center justify-center shadow-premium shadow-accent-primary/20 mb-2 hover-scale cursor-pointer">
            <Edit3 className="text-white" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-400 bg-clip-text text-transparent">
            AcroFlow
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 font-medium">
            The lightweight, browser-first PDF Text Editor. 100% Private & Fast.
          </p>
        </div>

        {/* Drag Drop Area */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={`w-full max-w-2xl min-h-[340px] rounded-3xl border-2 border-dashed flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all duration-300 relative group overflow-hidden ${
            isDragActive
              ? 'border-accent-primary bg-accent-primary/5 scale-[1.01] ring-4 ring-accent-primary/10'
              : 'border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-panel-dark/50 hover:border-slate-400 dark:hover:border-slate-700 hover:bg-white/80 dark:hover:bg-panel-dark/80 hover:scale-[1.005]'
          } glass-panel`}
        >
          {/* Subtle Glow Overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-accent-primary/5 to-accent-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf"
            className="hidden"
          />

          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-600 dark:text-slate-300 font-semibold text-lg animate-pulse">
                Parsing PDF structures...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900/60 flex items-center justify-center text-slate-400 group-hover:text-accent-primary group-hover:scale-110 transition-all duration-300 shadow-inner">
                <UploadCloud size={30} className="transition-transform group-hover:-translate-y-0.5" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xl font-bold text-slate-800 dark:text-slate-200">
                  Drag and drop your PDF here
                </p>
                <p className="text-sm text-slate-400">
                  or click to browse local files
                </p>
              </div>
              
              {error && (
                <div className="mt-2 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-sm font-semibold rounded-xl">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-6 mt-2 text-xs text-slate-400 dark:text-slate-500 font-medium">
                <span className="flex items-center gap-1.5">
                  <Lock size={13} /> Private (Runs in Browser)
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-800" />
                <span className="flex items-center gap-1.5">
                  <FileText size={13} /> Max size: 50MB
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mt-4 px-4">
          
          <div className="glass-panel rounded-2xl p-6 flex items-start gap-4 hover:bg-white/95 dark:hover:bg-panel-dark/95 transition-all">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
              <Edit3 size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-1 text-sm">
                Edit Existing Text
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Click directly on original sentences to rewrite them, maintaining font placements and bounds.
              </p>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 flex items-start gap-4 hover:bg-white/95 dark:hover:bg-panel-dark/95 transition-all">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 shrink-0">
              <Type size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-1 text-sm">
                Add Text & Formatting
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Add new blocks anywhere. Change font size, colors, alignments, and toggle bold or italics.
              </p>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 flex items-start gap-4 hover:bg-white/95 dark:hover:bg-panel-dark/95 transition-all">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
              <Download size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-1 text-sm">
                High-Quality Export
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Download fully optimized, original PDFs with edits baked in cleanly. Works instantly.
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
