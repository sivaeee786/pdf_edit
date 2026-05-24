import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { NativeTextEdit, NewTextBox } from '../context/EditorContext';

// Helper to convert hex to RGB decimals
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

/**
 * Compiles all edits (native overwrites and placed text boxes)
 * directly in the browser using pdf-lib, then triggers download.
 */
export async function exportEditedPDF(
  originalBytes: ArrayBuffer,
  nativeEdits: Record<string, NativeTextEdit>,
  newTextBoxes: NewTextBox[],
  fileName: string
): Promise<void> {
  try {
    // 1. Load original document bytes into pdf-lib
    const pdfDoc = await PDFDocument.load(originalBytes);
    const pages = pdfDoc.getPages();

    // 2. Embed standard 12 PDF fonts (Helvetica, Courier, TimesRoman and their variants)
    const embeddedFonts = {
      Helvetica: await pdfDoc.embedFont(StandardFonts.Helvetica),
      HelveticaBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      HelveticaOblique: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      HelveticaBoldOblique: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
      
      Courier: await pdfDoc.embedFont(StandardFonts.Courier),
      CourierBold: await pdfDoc.embedFont(StandardFonts.CourierBold),
      CourierOblique: await pdfDoc.embedFont(StandardFonts.CourierOblique),
      CourierBoldOblique: await pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
      
      TimesRoman: await pdfDoc.embedFont(StandardFonts.TimesRoman),
      TimesRomanBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
      TimesRomanItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      TimesRomanBoldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
    };

    const getFontVariant = (fontFamily: 'Helvetica' | 'Courier' | 'TimesRoman', bold: boolean, italic: boolean) => {
      const family = fontFamily || 'Helvetica';
      if (family === 'Courier') {
        if (bold && italic) return embeddedFonts.CourierBoldOblique;
        if (bold) return embeddedFonts.CourierBold;
        if (italic) return embeddedFonts.CourierOblique;
        return embeddedFonts.Courier;
      }
      if (family === 'TimesRoman') {
        if (bold && italic) return embeddedFonts.TimesRomanBoldItalic;
        if (bold) return embeddedFonts.TimesRomanBold;
        if (italic) return embeddedFonts.TimesRomanItalic;
        return embeddedFonts.TimesRoman;
      }
      // Default Helvetica
      if (bold && italic) return embeddedFonts.HelveticaBoldOblique;
      if (bold) return embeddedFonts.HelveticaBold;
      if (italic) return embeddedFonts.HelveticaOblique;
      return embeddedFonts.Helvetica;
    };

    // 3. Process native cover-up edits (redact original text and draw replacement)
    for (const editKey of Object.keys(nativeEdits)) {
      const edit = nativeEdits[editKey];
      const pageIndex = edit.pageIndex;
      
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      
      const page = pages[pageIndex];
      const { r, g, b } = hexToRgb(edit.color);
      const font = getFontVariant(edit.fontFamily, edit.bold, edit.italic);

      // Coordinate matching: 
      // PDF.js coordinates are already in standard PDF points (1 point = 1/72 inch)
      // edit.x is the exact X point in PDF space.
      // edit.y is the exact Y point in PDF space (bottom-left based).
      // Let's wipe out the original text by drawing a white rectangle over the bounding coordinate.
      page.drawRectangle({
        x: edit.x - 1,
        y: edit.y - 1,
        width: edit.width + 2,
        height: edit.height + 2,
        color: rgb(1, 1, 1), // white fill
        opacity: 1,
      });

      // Render replacement text exactly over the wiped-out box
      page.drawText(edit.text, {
        x: edit.x,
        y: edit.y + (edit.height * 0.15), // baseline adjust
        size: edit.fontSize,
        font: font,
        color: rgb(r, g, b),
      });
    }

    // 4. Process new custom annotations (text boxes, shapes, and images) placed by user
    for (const box of newTextBoxes) {
      const pageIndex = box.pageIndex;
      
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      
      const page = pages[pageIndex];
      const pageHeight = page.getHeight();
      const pageWidth = page.getWidth();

      // Convert percentage coordinates (web space top-left) back to points (PDF space bottom-left)
      const pdfX = (box.x / 100) * pageWidth;
      const pdfWidthPoints = box.width;
      const pdfHeightPoints = box.height;
      const pdfY = pageHeight - ((box.y / 100) * pageHeight) - pdfHeightPoints;

      const { r, g, b } = hexToRgb(box.color);

      if (box.type === 'image' && box.imageBase64) {
        try {
          const cleanBase64 = box.imageBase64.replace(/^data:image\/\w+;base64,/, "");
          const binaryString = window.atob(cleanBase64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          let embeddedImg;
          if (box.imageBase64.includes('image/png')) {
            embeddedImg = await pdfDoc.embedPng(bytes);
          } else {
            embeddedImg = await pdfDoc.embedJpg(bytes);
          }

          page.drawImage(embeddedImg, {
            x: pdfX,
            y: Math.max(0, pdfY),
            width: pdfWidthPoints,
            height: pdfHeightPoints,
          });
        } catch (err) {
          console.error("Failed embedding custom annotation image/signature during export:", err);
        }
      } else if (box.type === 'shape' && box.shapeType) {
        if (box.shapeType === 'rectangle') {
          page.drawRectangle({
            x: pdfX,
            y: Math.max(0, pdfY),
            width: pdfWidthPoints,
            height: pdfHeightPoints,
            color: box.fill ? rgb(r, g, b) : undefined,
            borderColor: rgb(r, g, b),
            borderWidth: box.strokeWidth || 2,
            opacity: 0.95,
          });
        } else if (box.shapeType === 'circle') {
          const radius = pdfWidthPoints / 2;
          page.drawCircle({
            x: pdfX + radius,
            y: Math.max(0, pdfY) + radius,
            size: radius,
            color: box.fill ? rgb(r, g, b) : undefined,
            borderColor: rgb(r, g, b),
            borderWidth: box.strokeWidth || 2,
            opacity: 0.95,
          });
        } else if (box.shapeType === 'line' || box.shapeType === 'arrow') {
          page.drawLine({
            start: { x: pdfX, y: Math.max(0, pdfY) + pdfHeightPoints },
            end: { x: pdfX + pdfWidthPoints, y: Math.max(0, pdfY) },
            color: rgb(r, g, b),
            thickness: box.strokeWidth || 2,
          });

          if (box.shapeType === 'arrow') {
            // Arrow endpoint indicator
            page.drawCircle({
              x: pdfX + pdfWidthPoints,
              y: Math.max(0, pdfY),
              size: (box.strokeWidth || 2) * 1.5,
              color: rgb(r, g, b),
            });
          }
        }
      } else {
        // Standard Text Box drawing
        const font = getFontVariant(box.fontFamily, box.bold, box.italic);
        page.drawText(box.text, {
          x: pdfX,
          y: Math.max(0, pdfY) + (pdfHeightPoints * 0.15), // baseline alignment offset
          size: box.fontSize,
          font: font,
          color: rgb(r, g, b),
        });
      }
    }

    // 5. Serialize PDF Bytes
    const modifiedBytes = await pdfDoc.save({ useObjectStreams: true });

    // 6. Spawn in-browser Blob download trigger
    const blob = new Blob([modifiedBytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    const cleanFileName = fileName.replace(/\.pdf$/i, '') + '_edited.pdf';
    const link = document.createElement('a');
    link.href = url;
    link.download = cleanFileName;
    document.body.appendChild(link);
    link.click();
    
    // Cleanup reference
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed compiling/downloading edited PDF:', err);
    throw new Error('Could not rebuild and export modified PDF.');
  }
}
