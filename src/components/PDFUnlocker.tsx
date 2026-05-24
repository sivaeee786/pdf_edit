import React, { useState, useRef } from 'react';
import { decryptPDF } from '@pdfsmaller/pdf-decrypt';
import { 
  ArrowLeft, Lock, Unlock, Key, Eye, EyeOff, 
  UploadCloud, FileText, CheckCircle2, AlertTriangle, 
  Download, RefreshCw 
} from 'lucide-react';

interface PDFUnlockerProps {
  onBackToHome: () => void;
}

type DecryptStatus = 'idle' | 'decrypting' | 'success' | 'error';

export const PDFUnlocker: React.FC<PDFUnlockerProps> = ({ onBackToHome }) => {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [status, setStatus] = useState<DecryptStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [unlockedBlobUrl, setUnlockedBlobUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and Drop handlers
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
    setPassword('');
    setUnlockedBlobUrl(null);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Client-Side PDF.js Decryption routine
  const handleDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !password) return;

    setStatus('decrypting');
    setErrorMessage('');

    try {
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      
      // Decrypt PDF offline locally
      const decryptedBytes = await decryptPDF(fileBytes, password);

      // Create downloadable blob
      const blob = new Blob([decryptedBytes as any], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      
      setUnlockedBlobUrl(blobUrl);
      setStatus('success');
    } catch (err: any) {
      console.error('Decryption failed:', err);
      setStatus('error');
      
      const msg = err.message || '';
      if (
        msg.toLowerCase().includes('password') || 
        msg.toLowerCase().includes('incorrect') || 
        msg.toLowerCase().includes('decrypt') || 
        msg.toLowerCase().includes('encrypt')
      ) {
        setErrorMessage('Incorrect password. Please verify the credentials and try again.');
      } else if (msg.toLowerCase().includes('not encrypted')) {
        setErrorMessage('This PDF document is already unlocked and not encrypted.');
      } else {
        setErrorMessage('Failed to decrypt the file. Ensure the PDF is not corrupted and matches standard password specifications.');
      }
    }
  };

  const resetState = () => {
    setFile(null);
    setPassword('');
    setStatus('idle');
    setErrorMessage('');
    setShowPreview(false);
    if (unlockedBlobUrl) {
      URL.revokeObjectURL(unlockedBlobUrl);
      setUnlockedBlobUrl(null);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-workspace-light dark:bg-workspace-dark flex flex-col p-6 transition-colors duration-300 relative overflow-y-auto">
      
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      
      {/* Upper Navigation Bar */}
      <div className="w-full max-w-3xl mx-auto flex items-center justify-between z-10 mb-8 select-none">
        <button 
          onClick={onBackToHome}
          className="flex items-center gap-2 text-xs font-extrabold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white bg-white/80 dark:bg-panel-dark/80 px-4 py-2 rounded-xl border border-slate-200 dark:border-border-dark backdrop-blur-sm cursor-pointer shadow-premium hover-scale"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
        <div className="flex items-center gap-2 text-emerald-500 font-extrabold text-xs tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
          <Lock size={12} className="animate-pulse" /> AcroFlow Unlocker
        </div>
      </div>

      {/* Main Unlocker Card */}
      <div className="w-full max-w-xl mx-auto z-10 flex-1 flex flex-col justify-center select-none">
        <div className="bg-white/95 dark:bg-panel-dark/95 border border-slate-200 dark:border-border-dark backdrop-blur-md rounded-3xl p-8 shadow-panel flex flex-col gap-6">
          
          <div className="text-center flex flex-col gap-1.5">
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">
              Remove PDF Password
            </h2>
            <p className="text-xs text-slate-400">
              Files are decrypted offline locally inside your browser cache.
            </p>
          </div>

          {/* 1. Upload Drag Drop Stage */}
          {!file && (
            <div 
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`border-2 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${
                isDragActive 
                  ? 'border-emerald-500 bg-emerald-500/5 shadow-glow scale-[1.01]' 
                  : 'border-slate-300 dark:border-border-dark hover:border-emerald-500/70 hover:bg-slate-50/50 dark:hover:bg-slate-900/30'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileInput} 
                accept=".pdf" 
                className="hidden" 
              />
              <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                <UploadCloud size={28} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  Drag & drop password-locked PDF
                </span>
                <span className="text-[11px] text-slate-400">
                  or click to select file from device
                </span>
              </div>
            </div>
          )}

          {/* 2. Uploaded Lock Interface */}
          {file && status !== 'success' && (
            <div className="flex flex-col gap-6 animate-fade-in">
              
              {/* File Info Block */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-border-dark rounded-2xl flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
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
                  className="text-[10px] font-extrabold text-red-500 hover:bg-red-500/10 border border-red-500/20 hover:scale-105 transition-all px-2.5 py-1.5 rounded-xl cursor-pointer shrink-0"
                >
                  Change File
                </button>
              </div>

              {/* Error Banner */}
              {status === 'error' && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-2.5 text-red-500 text-xs leading-relaxed">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Decryption Password Form */}
              <form onSubmit={handleDecrypt} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Enter PDF Password
                  </label>
                  <div className="relative">
                    <input 
                      type={showPassword ? 'text' : 'password'}
                      autoFocus
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter decryption key..."
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-border-dark focus:border-emerald-500 rounded-2xl pl-10 pr-10 py-3 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none transition-colors"
                    />
                    <Key size={14} className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 outline-none focus:outline-none cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={status === 'decrypting'}
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] disabled:opacity-50 text-white font-extrabold text-xs tracking-wider uppercase rounded-2xl transition-all shadow-premium hover-scale cursor-pointer flex items-center justify-center gap-2"
                >
                  {status === 'decrypting' ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Decrypting PDF...
                    </>
                  ) : (
                    <>
                      <Unlock size={14} /> Unlock Document
                    </>
                  )}
                </button>

              </form>

            </div>
          )}

          {/* 3. Decrypted Success Stage */}
          {status === 'success' && file && unlockedBlobUrl && (
            <div className="flex flex-col gap-6 items-center text-center animate-fade-in select-none">
              
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-premium animate-bounce">
                <CheckCircle2 size={32} />
              </div>

              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-white">
                  PDF Unlocked Successfully!
                </h3>
                <p className="text-[11px] text-slate-400 px-4 leading-relaxed">
                  Decryption completed locally. Your PDF file is now fully decrypted and standard passwords/restrictions are removed.
                </p>
              </div>

              {/* Action Buttons Block */}
              <div className="w-full flex flex-col gap-3 mt-2">
                <button 
                  onClick={() => setShowPreview(!showPreview)}
                  className="w-full py-3 bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200/80 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-2xl border border-slate-200 dark:border-border-dark flex items-center justify-center gap-2 cursor-pointer hover-scale"
                >
                  {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showPreview ? 'Hide Document Preview' : 'Preview PDF Document'}
                </button>

                {showPreview && (
                  <div className="w-full h-[320px] rounded-2xl overflow-hidden border border-slate-200 dark:border-border-dark shadow-inner mt-1 relative animate-fade-in bg-white dark:bg-slate-900">
                    <iframe 
                      src={unlockedBlobUrl} 
                      className="w-full h-full border-none"
                      title="PDF Preview"
                    />
                  </div>
                )}

                <a 
                  href={unlockedBlobUrl}
                  download={file.name.replace(/\.pdf$/i, '_unlocked.pdf')}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.99] text-white font-extrabold text-xs tracking-wider uppercase rounded-2xl transition-all shadow-premium hover-scale cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download size={14} /> Download Unlocked PDF
                </a>

                <button 
                  onClick={resetState}
                  className="w-full py-3 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-border-dark text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-2xl transition-all hover-scale cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw size={13} /> Unlock Another PDF
                </button>
              </div>

            </div>
          )}

        </div>
      </div>

    </div>
  );
};
