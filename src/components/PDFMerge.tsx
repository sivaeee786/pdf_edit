import React, { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { 
  ArrowLeft, FileText, ChevronUp, ChevronDown, Trash2, 
  UploadCloud, GitMerge, CheckCircle2, Download, RefreshCw 
} from 'lucide-react';

interface PDFMergeProps {
  onBackToHome: () => void;
}

interface MergeItem {
  id: string;
  file: File;
  pageCount: number;
  sizeMB: number;
}

export const PDFMerge: React.FC<PDFMergeProps> = ({ onBackToHome }) => {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'merging' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [mergedBlobUrl, setMergedBlobUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const addedFiles = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf')
      );
      if (addedFiles.length > 0) {
        await addFiles(addedFiles);
      }
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await addFiles(Array.from(e.target.files));
    }
  };

  // Parse page counts and add to queue
  const addFiles = async (files: File[]) => {
    setStatus('idle');
    setErrorMessage('');
    const newItems: MergeItem[] = [];

    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const pageCount = pdfDoc.getPageCount();
        
        newItems.push({
          id: `${file.name}_${Date.now()}_${Math.random()}`,
          file,
          pageCount,
          sizeMB: file.size / (1024 * 1024),
        });
      } catch (err) {
        console.error('Failed to parse PDF metadata:', err);
        // Add item even if parse fails, fallback page count
        newItems.push({
          id: `${file.name}_${Date.now()}_${Math.random()}`,
          file,
          pageCount: 0,
          sizeMB: file.size / (1024 * 1024),
        });
      }
    }

    setItems((prev) => [...prev, ...newItems]);
  };

  const removeFile = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Reordering helpers
  const moveFile = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updatedItems = [...items];
    const temp = updatedItems[index];
    updatedItems[index] = updatedItems[newIndex];
    updatedItems[newIndex] = temp;
    setItems(updatedItems);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Multi-File pdf-lib Merge compiler
  const handleMerge = async () => {
    if (items.length < 2) {
      setErrorMessage('Please add at least two PDF documents to merge.');
      setStatus('error');
      return;
    }

    setStatus('merging');
    setErrorMessage('');

    try {
      const mergedPdf = await PDFDocument.create();

      for (const item of items) {
        try {
          const fileBytes = await item.file.arrayBuffer();
          const doc = await PDFDocument.load(fileBytes);
          const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        } catch (err) {
          console.error(`Error loading file: ${item.file.name}`, err);
          throw new Error(`Failed to load or decrypt "${item.file.name}". Secure/password PDFs cannot be merged directly.`);
        }
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes as any], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      setMergedBlobUrl(blobUrl);
      setStatus('success');
    } catch (err: any) {
      console.error('Merge failed:', err);
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred while merging your PDF documents.');
    }
  };

  const resetState = () => {
    setItems([]);
    setStatus('idle');
    setErrorMessage('');
    if (mergedBlobUrl) {
      URL.revokeObjectURL(mergedBlobUrl);
      setMergedBlobUrl(null);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-workspace-light dark:bg-workspace-dark flex flex-col p-6 transition-colors duration-300 relative overflow-y-auto">
      
      {/* Background glow decorator */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Navigation Header */}
      <div className="w-full max-w-3xl mx-auto flex items-center justify-between z-10 mb-8 select-none">
        <button 
          onClick={onBackToHome}
          className="flex items-center gap-2 text-xs font-extrabold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white bg-white/80 dark:bg-panel-dark/80 px-4 py-2 rounded-xl border border-slate-200 dark:border-border-dark backdrop-blur-sm cursor-pointer shadow-premium hover-scale"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
        <div className="flex items-center gap-2 text-accent-primary font-extrabold text-xs tracking-wider uppercase bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl">
          <GitMerge size={12} className="animate-pulse" /> AcroFlow Merger
        </div>
      </div>

      {/* Merger workspace */}
      <div className="w-full max-w-2xl mx-auto z-10 flex flex-col gap-6 select-none">
        
        {/* Main Card */}
        <div className="bg-white/95 dark:bg-panel-dark/95 border border-slate-200 dark:border-border-dark backdrop-blur-md rounded-3xl p-8 shadow-panel flex flex-col gap-6">
          
          <div className="text-center flex flex-col gap-1">
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">
              Merge PDF Files
            </h2>
            <p className="text-xs text-slate-400">
              Stitch multiple PDF files together locally in your browser cache.
            </p>
          </div>

          {status !== 'success' && (
            <div className="flex flex-col gap-6">
              
              {/* File Upload Drop Target */}
              <div 
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={triggerFileInput}
                className={`border-2 border-dashed rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                  isDragActive 
                    ? 'border-accent-primary bg-accent-primary/5 shadow-glow scale-[1.005]' 
                    : 'border-slate-300 dark:border-border-dark hover:border-accent-primary/70 hover:bg-slate-50/50 dark:hover:bg-slate-900/30'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileInput} 
                  accept=".pdf" 
                  multiple
                  className="hidden" 
                />
                <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-accent-primary border border-indigo-500/20">
                  <UploadCloud size={24} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Drag & drop PDF files to combine
                  </span>
                  <span className="text-[10px] text-slate-400">
                    or click to upload from folder
                  </span>
                </div>
              </div>

              {/* Error Box */}
              {status === 'error' && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-500 text-xs">
                  <Trash2 size={14} className="shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* PDF Queue List */}
              {items.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                    Files Queue ({items.length})
                  </h3>
                  
                  <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                    {items.map((item, index) => (
                      <div 
                        key={item.id} 
                        className="p-3.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-border-dark rounded-xl flex items-center gap-3 animate-fade-in group hover:border-slate-300 dark:hover:border-slate-800 transition-colors"
                      >
                        <div className="w-9 h-9 bg-indigo-500/10 rounded-lg flex items-center justify-center text-accent-primary shrink-0">
                          <FileText size={18} />
                        </div>
                        
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {item.file.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {item.pageCount > 0 ? `${item.pageCount} pages` : 'Reading details...'} • {item.sizeMB.toFixed(2)} MB
                          </span>
                        </div>

                        {/* Reordering and removal Actions */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => moveFile(index, 'up')}
                            disabled={index === 0}
                            className="p-1 rounded bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-white border border-slate-200 dark:border-border-dark hover:scale-105 transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                            title="Move Up"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            onClick={() => moveFile(index, 'down')}
                            disabled={index === items.length - 1}
                            className="p-1 rounded bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-white border border-slate-200 dark:border-border-dark hover:scale-105 transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                            title="Move Down"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            onClick={() => removeFile(item.id)}
                            className="p-1 rounded bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/10 hover:scale-105 transition-all cursor-pointer"
                            title="Remove File"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Trigger compiler button */}
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={resetState}
                      className="flex-1 py-3 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-border-dark text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-2xl transition-all hover-scale cursor-pointer"
                    >
                      Clear Queue
                    </button>
                    
                    <button
                      onClick={handleMerge}
                      disabled={items.length < 2 || status === 'merging'}
                      className="flex-1 py-3 bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-white font-extrabold text-xs tracking-wider uppercase rounded-2xl transition-all shadow-premium hover-scale cursor-pointer flex items-center justify-center gap-2"
                    >
                      {status === 'merging' ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Merging Pages...
                        </>
                      ) : (
                        <>
                          <GitMerge size={14} /> Merge PDFs
                        </>
                      )}
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* Success stage */}
          {status === 'success' && mergedBlobUrl && (
            <div className="flex flex-col gap-6 items-center text-center animate-fade-in pr-1 pr-1">
              
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-premium animate-bounce">
                <CheckCircle2 size={32} />
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-white">
                  PDFs Merged Successfully!
                </h3>
                <p className="text-[11px] text-slate-400 px-4 leading-relaxed">
                  Stitched all documents into a single high-fidelity file using local client-side memory.
                </p>
              </div>

              <div className="w-full flex flex-col gap-3 mt-2">
                <a 
                  href={mergedBlobUrl}
                  download="merged_document.pdf"
                  className="w-full py-3.5 bg-gradient-to-r from-accent-primary to-accent-secondary hover:from-accent-hover active:scale-[0.99] text-white font-extrabold text-xs tracking-wider uppercase rounded-2xl transition-all shadow-premium hover-scale cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download size={14} /> Download Merged PDF
                </a>

                <button 
                  onClick={resetState}
                  className="w-full py-3 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-border-dark text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-2xl transition-all hover-scale cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw size={13} /> Merge More Files
                </button>
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
};
