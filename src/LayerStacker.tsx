'use client';

import { useState, useEffect } from 'react';
import registry from './registry.json';

// ==========================================
// THE RESERVE VAULT
// Add the exact IDs (as numbers) of the 11 Mythics and 100 reserves you want to hold back.
// Example: [1, 2, 3, 42, 99] 
// ==========================================
const RESERVED_IDS: number[] = []; 

// The engine automatically removes your reserved IDs from the public pool
const publicRegistry = registry.filter(op => !RESERVED_IDS.includes(Number(op.id)));

export function LayerStacker() {
  // Initialize with a random operative from the public pool
  const [operative, setOperative] = useState(() => {
    const randomIndex = Math.floor(Math.random() * publicRegistry.length);
    return publicRegistry[randomIndex];
  });

  // Hydrate safely on the client to prevent Next.js/Vite hydration mismatch on random math
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleReroll = () => {
    const randomIndex = Math.floor(Math.random() * publicRegistry.length);
    setOperative(publicRegistry[randomIndex]);
  };

  if (!isMounted || !operative) {
    return <div style={{ color: '#A3A3A3', textAlign: 'center', padding: '2rem' }}>BOOTING TERMINAL...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      
      {/* LORE IDENTIFIER (Name Only) */}
      <div style={{ textAlign: 'center', marginBottom: '16px', width: '100%' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#06B6D4', textTransform: 'uppercase', margin: '0 0 4px 0', letterSpacing: '2px' }}>
          {operative.lore_name}
        </h2>
      </div>

      {/* ENCRYPTED PREVIEW CONTAINER */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          width: '380px',
          height: '380px',
          background: 'rgba(13, 13, 17, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(12px)',
          marginBottom: '1rem',
          borderRadius: '2px',
          boxShadow: '0 0 30px rgba(6, 182, 212, 0.08)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* THE GHOSTED SILHOUETTE */}
        <img 
          src="/assets/Artboard 1q113.png" 
          alt="Encrypted Construct"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: 0.15, // Adjust this value (0.1 to 0.3) to make it more or less visible
            zIndex: 0,
            pointerEvents: 'none'
          }}
        />

        {/* Subtle background scanline effect */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)',
          backgroundSize: '100% 4px',
          opacity: 0.5,
          zIndex: 1,
          pointerEvents: 'none'
        }} />

        {/* TEXT OVERLAYS */}
        <div style={{ color: '#A3A3A3', fontSize: '13px', letterSpacing: '0.2em', textTransform: 'uppercase', zIndex: 2, textShadow: '0 0 10px rgba(163,163,163,0.3)' }}>
          [ VISUAL DATA ENCRYPTED ]
        </div>
        <div style={{ color: '#06B6D4', fontSize: '10px', letterSpacing: '0.1em', marginTop: '1.5rem', opacity: 0.5, zIndex: 2 }}>
          AWAITING ON-CHAIN DEPLOYMENT
        </div>
      </div>

      {/* SINGLE REROLL BUTTON */}
      <button 
        onClick={handleReroll}
        style={{
          display: 'block',
          width: '380px',
          padding: '12px',
          background: 'rgba(255, 255, 255, 0.03)',
          color: '#E5E5E5',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: '500',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          borderRadius: '2px',
          transition: 'all 0.3s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        }}
      >
        ⟳ RANDOMLY RE-ROLL CONSTRUCT
      </button>
    </div>
  );
}