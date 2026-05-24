import React from 'react';
import { FileText, Unlock, Shield, GitMerge, TrendingDown, RefreshCw } from 'lucide-react';

interface HomeProps {
  onSelectUtility: (utility: 'editor' | 'unlocker' | 'merge' | 'compress' | 'word') => void;
}

export const Home: React.FC<HomeProps> = ({ onSelectUtility }) => {
  return (
    <div className="flex-1 min-h-screen bg-workspace-light dark:bg-workspace-dark flex flex-col justify-center items-center p-6 transition-colors duration-300 relative overflow-y-auto">
      
      {/* Decorative Glow Elements */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-5xl flex flex-col items-center gap-12 text-center my-8">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-3 select-none">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-accent-primary shadow-premium animate-pulse">
            <Shield size={24} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent sm:text-5xl">
            AcroFlow <span className="bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text">PDF Suite</span>
          </h1>
          <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
            Professional-fidelity document editing and local high-security utilities, 100% offline-compatible.
          </p>
        </div>

        {/* Dashboard Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
          
          {/* Card 1: PDF Editor */}
          <div 
            onClick={() => onSelectUtility('editor')}
            className="group relative flex flex-col justify-between p-6 bg-white/50 dark:bg-panel-dark/40 backdrop-blur-md border border-slate-200 dark:border-border-dark rounded-3xl cursor-pointer hover:border-accent-primary hover:shadow-premium hover-scale transition-all duration-300 overflow-hidden text-left min-h-[220px]"
          >
            <div className="absolute -right-20 -top-20 w-40 h-40 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-colors" />
            <div className="flex flex-col gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/5 border border-indigo-500/20 flex items-center justify-center text-accent-primary group-hover:scale-110 transition-transform">
                <FileText size={20} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-white">PDF Editor</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Modify original text elements in-place preserving identical fonts and styling. Add shapes, custom images, signatures, and export with zero coordinate shifting.
                </p>
              </div>
            </div>
            <div className="mt-6 w-full flex items-center justify-between text-[11px] font-extrabold text-accent-primary">
              <span>Start Editing</span>
              <span className="transform translate-x-0 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
            </div>
          </div>

          {/* Card 2: PDF Unlocker */}
          <div 
            onClick={() => onSelectUtility('unlocker')}
            className="group relative flex flex-col justify-between p-6 bg-white/50 dark:bg-panel-dark/40 backdrop-blur-md border border-slate-200 dark:border-border-dark rounded-3xl cursor-pointer hover:border-emerald-500 hover:shadow-premium hover-scale transition-all duration-300 overflow-hidden text-left min-h-[220px]"
          >
            <div className="absolute -right-20 -top-20 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors" />
            <div className="flex flex-col gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                <Unlock size={20} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-white">PDF Unlocker</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Instantly remove passwords, restrictions, and encryption keys from PDF files. Processing takes place 100% locally in your browser to safeguard absolute data privacy.
                </p>
              </div>
            </div>
            <div className="mt-6 w-full flex items-center justify-between text-[11px] font-extrabold text-emerald-500">
              <span>Remove Encryption</span>
              <span className="transform translate-x-0 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
            </div>
          </div>

          {/* Card 3: Merge PDF */}
          <div 
            onClick={() => onSelectUtility('merge')}
            className="group relative flex flex-col justify-between p-6 bg-white/50 dark:bg-panel-dark/40 backdrop-blur-md border border-slate-200 dark:border-border-dark rounded-3xl cursor-pointer hover:border-violet-500 hover:shadow-premium hover-scale transition-all duration-300 overflow-hidden text-left min-h-[220px]"
          >
            <div className="absolute -right-20 -top-20 w-40 h-40 bg-violet-500/5 rounded-full blur-3xl group-hover:bg-violet-500/10 transition-colors" />
            <div className="flex flex-col gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 dark:bg-violet-500/5 border border-violet-500/20 flex items-center justify-center text-violet-500 group-hover:scale-110 transition-transform">
                <GitMerge size={20} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-white">Merge PDF</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Stitch multiple PDF documents together into a single unified file. Adjust the sequence order cleanly and render high-fidelity page merges offline.
                </p>
              </div>
            </div>
            <div className="mt-6 w-full flex items-center justify-between text-[11px] font-extrabold text-violet-500">
              <span>Stitch Documents</span>
              <span className="transform translate-x-0 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
            </div>
          </div>

          {/* Card 4: Compress PDF */}
          <div 
            onClick={() => onSelectUtility('compress')}
            className="group relative flex flex-col justify-between p-6 bg-white/50 dark:bg-panel-dark/40 backdrop-blur-md border border-slate-200 dark:border-border-dark rounded-3xl cursor-pointer hover:border-emerald-500 hover:shadow-premium hover-scale transition-all duration-300 overflow-hidden text-left min-h-[220px]"
          >
            <div className="absolute -right-20 -top-20 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors" />
            <div className="flex flex-col gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                <TrendingDown size={20} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-white">Compress PDF</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Reduce the footprint of oversized PDFs. Compresses document cross-reference streams and metadata arrays locally with three custom preset compression configurations.
                </p>
              </div>
            </div>
            <div className="mt-6 w-full flex items-center justify-between text-[11px] font-extrabold text-emerald-500">
              <span>Reduce Footprint</span>
              <span className="transform translate-x-0 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
            </div>
          </div>

          {/* Card 5: PDF to Word */}
          <div 
            onClick={() => onSelectUtility('word')}
            className="group relative flex flex-col justify-between p-6 bg-white/50 dark:bg-panel-dark/40 backdrop-blur-md border border-slate-200 dark:border-border-dark rounded-3xl cursor-pointer hover:border-blue-500 hover:shadow-premium hover-scale transition-all duration-300 overflow-hidden text-left min-h-[220px] md:col-span-2 lg:col-span-1"
          >
            <div className="absolute -right-20 -top-20 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors" />
            <div className="flex flex-col gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/5 border border-blue-500/20 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                <RefreshCw size={20} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-white">PDF to Word</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Convert PDF page text layouts into formatted Microsoft Word (.doc) paragraphs. Reconstructs text baselines and spaces using advanced client-side layout analysis.
                </p>
              </div>
            </div>
            <div className="mt-6 w-full flex items-center justify-between text-[11px] font-extrabold text-blue-500">
              <span>Convert to DOC</span>
              <span className="transform translate-x-0 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
            </div>
          </div>

        </div>

        {/* Footer info */}
        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Secured Client-Side Environment
        </p>

      </div>
    </div>
  );
};
