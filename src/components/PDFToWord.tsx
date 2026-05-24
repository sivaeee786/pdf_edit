import React, { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  ArrowLeft, FileText, UploadCloud, CheckCircle2, 
  Download, RefreshCw, FileText as WordIcon, ArrowRight, Shield 
} from 'lucide-react';

interface PDFToWordProps {
  onBackToHome: () => void;
}

type ConvertStatus = 'idle' | 'converting' | 'success' | 'error';

export const PDFToWord: React.FC<PDFToWordProps> = ({ onBackToHome }) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ConvertStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [wordBlobUrl, setWordBlobUrl] = useState<string | null>(null);

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf' || droppedFile.name.endsWith('.pdf')) {
        selectFile(droppedFile);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      selectFile(e.target.files[0]);
    }
  };

  const selectFile = (selectedFile: File) => {
    setFile(selectedFile);
    setStatus('idle');
    setErrorMessage('');
    setProgress(0);
    setWordBlobUrl(null);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Baseline Line-Sorting Layout Reconstruction Algorithm
  const handleConvert = async () => {
    if (!file) return;

    setStatus('converting');
    setProgress(10);
    setErrorMessage('');

    try {
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      
      // Load file into PDF.js
      const loadingTask = pdfjsLib.getDocument({ data: fileBytes });
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;

      let htmlContent = '';

      // Loop page-by-page to reconstruct baseline grids
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const items = textContent.items as any[];
        if (items.length === 0) {
          htmlContent += `<h2>Page ${pageNum}</h2><p><i>[No editable text detected on this page]</i></p><br/>`;
          continue;
        }

        // 1. Group items by baseline Y coordinate (tolerance of 4px)
        const lineGroups: { [y: number]: any[] } = {};
        
        items.forEach((item) => {
          if (!item.str || item.str.trim() === '') return;
          
          // Y coordinate is at item.transform[5]
          const yCoord = Math.round(item.transform[5]);
          
          // Find existing group within 4px tolerance
          let matchedY = Object.keys(lineGroups).find(
            (k) => Math.abs(parseInt(k) - yCoord) <= 4
          );
          
          if (matchedY) {
            lineGroups[parseInt(matchedY)].push(item);
          } else {
            lineGroups[yCoord] = [item];
          }
        });

        const sortedYKeys = Object.keys(lineGroups)
          .map((k) => parseInt(k))
          .sort((a, b) => b - a);
        let pageHtml = `<h2>Page ${pageNum}</h2>`;
        let lastY = 0;

        // 3. Loop sorted baselines and merge horizontal coordinates
        sortedYKeys.forEach((yKey) => {
          const lineItems = lineGroups[yKey];
          
          // Sort items in this line left-to-right (X coordinate ascending, item.transform[4])
          lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
          
          // Merge line items with space spacing
          const mergedLineText = lineItems
            .map((item) => item.str)
            .join(' ')
            .replace(/\s+/g, ' '); // remove duplicates

          // Estimate font height from transform scale (item.transform[3] or transform[0])
          const fontHeight = lineItems[0]?.transform[3] || 12;

          // Estimate line spacing gap to reconstruct paragraphs
          const gap = lastY === 0 ? 0 : Math.abs(lastY - yKey);
          
          if (gap > fontHeight * 1.8 && lastY !== 0) {
            // Significant vertical gap starts a new paragraph!
            pageHtml += `</p><p style="margin-top: 12px; margin-bottom: 6px;">${mergedLineText}`;
          } else {
            // Small gap is just a newline in the same paragraph
            if (pageHtml.endsWith('</h2>')) {
              pageHtml += `<p style="margin-bottom: 6px;">${mergedLineText}`;
            } else {
              pageHtml += ` ${mergedLineText}`;
            }
          }

          lastY = yKey;
        });

        if (!pageHtml.endsWith('</h2>')) {
          pageHtml += `</p><br/>`;
        }

        htmlContent += pageHtml;

        // Update progress dynamically
        const progressPct = 10 + Math.round((pageNum / totalPages) * 80);
        setProgress(progressPct);
      }

      // 4. Wrap HTML in Word Document Envelope
      const wordEnvelope = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><title>Converted PDF Document</title>
        <!--[if gte mso 9]><xml>
        <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
        </xml><![endif]-->
        <style>
        body { 
          font-family: 'Calibri', 'Arial', sans-serif; 
          line-height: 1.5; 
          padding: 40px; 
          color: #333333;
        }
        p { 
          margin-top: 0px;
          margin-bottom: 8px; 
          text-align: justify;
        }
        h2 { 
          color: #4f46e5; 
          font-size: 14pt;
          border-bottom: 1px dashed #cccccc; 
          padding-bottom: 3px; 
          margin-top: 24px; 
          margin-bottom: 12px;
        }
        </style>
        </head>
        <body>
          ${htmlContent}
        </body>
        </html>
      `;

      // 5. Save as downloadable Blob
      const blob = new Blob([wordEnvelope], { type: 'application/msword;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);

      setWordBlobUrl(blobUrl);
      setProgress(100);
      setStatus('success');
    } catch (err: any) {
      console.error('Word Conversion failed:', err);
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred while converting your PDF document to Word.');
    }
  };

  const resetState = () => {
    setFile(null);
    setStatus('idle');
    setErrorMessage('');
    setProgress(0);
    if (wordBlobUrl) {
      URL.revokeObjectURL(wordBlobUrl);
      setWordBlobUrl(null);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-workspace-light dark:bg-workspace-dark flex flex-col p-6 transition-colors duration-300 relative overflow-y-auto">
      
      {/* Decorative glow */}
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
          <WordIcon size={12} className="animate-pulse" /> AcroFlow Converter
        </div>
      </div>

      {/* Convert Workspace */}
      <div className="w-full max-w-xl mx-auto z-10 flex-1 flex flex-col justify-center select-none">
        <div className="bg-white/95 dark:bg-panel-dark/95 border border-slate-200 dark:border-border-dark backdrop-blur-md rounded-3xl p-8 shadow-panel flex flex-col gap-6">
          
          <div className="text-center flex flex-col gap-1.5">
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">
              Convert PDF to Word
            </h2>
            <p className="text-xs text-slate-400">
              Extract page content into a perfectly editable Word document offline.
            </p>
          </div>

          {/* 1. Upload stage */}
          {!file && (
            <div 
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`border-2 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${
                isDragActive 
                  ? 'border-accent-primary bg-accent-primary/5 shadow-glow scale-[1.01]' 
                  : 'border-slate-300 dark:border-border-dark hover:border-accent-primary/70 hover:bg-slate-50/50 dark:hover:bg-slate-900/30'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileInput} 
                accept=".pdf" 
                className="hidden" 
              />
              <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-accent-primary border border-indigo-500/20">
                <UploadCloud size={28} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  Drag & drop PDF to convert
                </span>
                <span className="text-[11px] text-slate-400">
                  or click to select file from device
                </span>
              </div>
            </div>
          )}

          {/* 2. Conversion in progress */}
          {file && status !== 'success' && (
            <div className="flex flex-col gap-6 animate-fade-in pr-1">
              
              {/* File Info Block */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-border-dark rounded-2xl flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-accent-primary shrink-0">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    {file.name}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <button 
                  onClick={resetState}
                  disabled={status === 'converting'}
                  className="text-[10px] font-extrabold text-red-500 hover:bg-red-500/10 border border-red-500/20 hover:scale-105 transition-all px-2.5 py-1.5 rounded-xl cursor-pointer disabled:opacity-50 disabled:pointer-events-none shrink-0"
                >
                  Change File
                </button>
              </div>

              {/* Conversion State Animation */}
              {status === 'converting' && (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-600 dark:text-slate-300">Reconstructing page flows...</span>
                    <span className="font-extrabold text-accent-primary">{progress}%</span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-800/50">
                    <div 
                      className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  
                  {/* secure note */}
                  <div className="flex items-center gap-1.5 justify-center text-[10px] text-slate-400 mt-2">
                    <Shield size={12} /> Offline Processing Safeguards Absolute Privacy
                  </div>
                </div>
              )}

              {/* Error Box */}
              {status === 'error' && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-500 text-xs">
                  <FileText size={14} className="shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Action trigger button */}
              {status !== 'converting' && (
                <button 
                  onClick={handleConvert}
                  className="w-full py-3.5 bg-accent-primary hover:bg-accent-hover text-white font-extrabold text-xs tracking-wider uppercase rounded-2xl transition-all shadow-premium hover-scale cursor-pointer flex items-center justify-center gap-2"
                >
                  <>
                    Convert PDF <ArrowRight size={14} /> Word
                  </>
                </button>
              )}

            </div>
          )}

          {/* 3. Successful conversion stage */}
          {status === 'success' && file && wordBlobUrl && (
            <div className="flex flex-col gap-6 items-center text-center animate-fade-in select-none pr-1">
              
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-premium animate-bounce">
                <CheckCircle2 size={32} />
              </div>

              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-white">
                  PDF Converted to Word!
                </h3>
                <p className="text-[11px] text-slate-400 px-4 leading-relaxed">
                  Reconstructed paragraph flow grids based on baseline tolerances completely offline.
                </p>
              </div>

              {/* Action buttons */}
              <div className="w-full flex flex-col gap-3">
                <a 
                  href={wordBlobUrl}
                  download={file.name.replace(/\.pdf$/i, '.doc')}
                  className="w-full py-3.5 bg-gradient-to-r from-accent-primary to-accent-secondary hover:from-accent-hover active:scale-[0.99] text-white font-extrabold text-xs tracking-wider uppercase rounded-2xl transition-all shadow-premium hover-scale cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download size={14} /> Download Word Document (.doc)
                </a>

                <button 
                  onClick={resetState}
                  className="w-full py-3 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-border-dark text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-2xl transition-all hover-scale cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw size={13} /> Convert Another PDF
                </button>
              </div>

            </div>
          )}

        </div>
      </div>

    </div>
  );
};
