import React, { useEffect, useRef, useState } from 'react';
import { useEditor } from '../context/EditorContext';
import { Layers, FileText } from 'lucide-react';

interface ThumbnailCanvasProps {
  pageIndex: number;
}

const ThumbnailCanvas: React.FC<ThumbnailCanvasProps> = ({ pageIndex }) => {
  const { pdfDoc } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState<boolean>(false);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || rendered) return;

    let active = true;

    const renderThumbnail = async () => {
      try {
        const page = await pdfDoc.getPage(pageIndex + 1);
        if (!active) return;

        // Render at a low scale for sidebar
        const viewport = page.getViewport({ scale: 0.16 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        await page.render(renderContext).promise;
        if (active) {
          setRendered(true);
        }
      } catch (err) {
        console.error('Error drawing thumbnail:', err);
      }
    };

    renderThumbnail();

    return () => {
      active = false;
    };
  }, [pdfDoc, pageIndex, rendered]);

  return (
    <canvas 
      ref={canvasRef} 
      className="max-w-full rounded-md shadow-sm border border-slate-200 dark:border-slate-800 bg-white"
    />
  );
};

export const Sidebar: React.FC = () => {
  const { pageCount, currentPage, setCurrentPage } = useEditor();

  return (
    <aside className="w-[180px] md:w-[240px] h-full flex flex-col bg-white dark:bg-panel-dark border-r border-border-light dark:border-border-dark select-none shrink-0 transition-theme overflow-hidden">
      
      {/* Sidebar Header Tabs */}
      <div className="h-12 border-b border-border-light dark:border-border-dark flex items-center px-4 gap-2 text-slate-500 dark:text-slate-400">
        <Layers size={14} className="text-accent-primary" />
        <span className="text-xs font-extrabold tracking-wider uppercase text-slate-700 dark:text-slate-300">
          Page Thumbnails
        </span>
      </div>

      {/* Thumbnails Scroll Grid */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 items-center bg-slate-50/50 dark:bg-slate-900/10">
        {Array.from({ length: pageCount }).map((_, idx) => {
          const isActive = idx === currentPage;
          return (
            <div
              key={`thumb_${idx}`}
              onClick={() => setCurrentPage(idx)}
              className={`flex flex-col items-center gap-2 p-2 w-full max-w-[160px] rounded-2xl cursor-pointer transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-500/5 dark:bg-indigo-500/10 border-2 border-accent-primary ring-4 ring-accent-primary/10 shadow-premium'
                  : 'bg-transparent border-2 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/40 hover:scale-[1.02]'
              }`}
            >
              
              {/* Thumbnail Render Canvas */}
              <div className="w-full flex justify-center pointer-events-none">
                <ThumbnailCanvas pageIndex={idx} />
              </div>

              {/* Page Number Indicator */}
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <FileText size={11} className={isActive ? 'text-accent-primary' : 'text-slate-400'} />
                <span className={isActive ? 'text-accent-primary' : 'text-slate-500 dark:text-slate-400'}>
                  Page {idx + 1}
                </span>
              </div>

            </div>
          );
        })}
      </div>
      
    </aside>
  );
};
