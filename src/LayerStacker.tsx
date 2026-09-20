'use client';

import React, { useRef, useState } from 'react';

interface LayerStackerProps {
  layers: string[];
}

export function LayerStacker({ layers }: LayerStackerProps) {
  const [isExporting, setIsExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getSafeUrl = (layerPath: string) => {
    const parts = layerPath.split('/');
    const encoded = parts.map((part) => encodeURIComponent(part)).join('/');
    return `/layers/${encoded}`;
  };

  const exportCompositeImage = async () => {
    setIsExporting(true);
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = 2000;
    canvas.height = 2000;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setIsExporting(false);
      return;
    }

    ctx.clearRect(0, 0, 2000, 2000);

    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load: ${src}`));
        img.src = src;
      });
    };

    try {
      for (const layerPath of layers) {
        if (layerPath.toLowerCase().includes('none')) continue;
        const img = await loadImage(getSafeUrl(layerPath));
        ctx.drawImage(img, 0, 0, 2000, 2000);
      }

      const dataUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = `numb_operative_${Date.now()}.png`;
      downloadLink.click();
    } catch (err) {
      console.error('Compositing failed:', err);
      alert('Could not export composite. Check console for missing images.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {/* PREVIEW CONTAINER - RESTORED TO PROPER 380x380 SIZING */}
      <div
        style={{
          position: 'relative',
          width: '380px',
          height: '380px',
          background: 'rgba(13, 13, 17, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(12px)',
          overflow: 'hidden',
          marginBottom: '1rem',
          borderRadius: '2px',
          boxShadow: '0 0 30px rgba(6, 182, 212, 0.08)',
        }}
      >
        {layers.map((layerPath, index) => {
          if (layerPath.toLowerCase().includes('none')) return null;
          return (
            <img
              key={index}
              src={getSafeUrl(layerPath)}
              alt={layerPath}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                zIndex: index,
              }}
            />
          );
        })}
      </div>

      {/* EXPORT BUTTON */}
      <button
        onClick={exportCompositeImage}
        disabled={isExporting}
        style={{
          display: 'block',
          width: '380px',
          padding: '12px',
          background: isExporting ? 'rgba(255,255,255,0.05)' : 'rgba(255, 255, 255, 0.03)',
          color: isExporting ? '#777' : '#E5E5E5',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          cursor: isExporting ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          fontWeight: '500',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          borderRadius: '2px',
          transition: 'all 0.3s ease',
        }}
      >
        {isExporting ? 'COMPOSITING 2000x2000...' : '⬇ EXPORT COMPOSITE PNG'}
      </button>
    </div>
  );
}