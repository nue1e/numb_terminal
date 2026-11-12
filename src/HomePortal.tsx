import React, { useState } from 'react';

type TerminalViewType = 'WHITELIST' | 'GENERATOR' | 'ARMORY' | 'TELEPORTER' | 'MARKETPLACE' | 'ADMIN';

interface HomePortalProps {
  onNavigate: (view: TerminalViewType) => void;
  isAdmin: boolean;
}

export const HomePortal: React.FC<HomePortalProps> = ({ onNavigate, isAdmin }) => {
  const [hoveredId, setHoveredId] = useState<TerminalViewType | null>(null);

  const artSpecimens = [
    { src: '/assets/art_1.png', code: 'SPECIMEN // 01', tier: 'GENESIS_UNIT', angle: '-4deg' },
    { src: '/assets/art_2.png', code: 'SPECIMEN // 02', tier: 'RECON_CLASS', angle: '3deg' },
    { src: '/assets/art_3.png', code: 'SPECIMEN // 03', tier: 'HEAVY_SYNTH', angle: '-2deg' },
    { src: '/assets/art_4.png', code: 'SPECIMEN // 04', tier: 'VOID_WALKER', angle: '4deg' },
  ];

  const menuItems = [
    { 
      id: 'WHITELIST' as TerminalViewType, 
      num: '01',
      title: 'CLEARANCE // WHITELIST', 
      subtitle: 'SYNDICATE ELIGIBILITY & PASS GENERATOR',
      desc: 'Verify syndicate wallet eligibility, monitor phase deployment schedules, and secure your allocation in upcoming waves.',
      color: '#00ff80',
      locked: false
    },
    { 
      id: 'GENERATOR' as TerminalViewType, 
      num: '02',
      title: 'DEPLOY // CONSTRUCT', 
      subtitle: 'SUI MAINNET BLIND ASSEMBLY',
      desc: 'Execute blind construct assembly on the Sui Mainnet. Metadata is permanently encrypted and mapped to Walrus decentralized storage.',
      color: '#06B6D4',
      locked: false
    },
    { 
      id: 'ARMORY' as TerminalViewType, 
      num: '03',
      title: 'INSPECT // ARMORY', 
      subtitle: 'DYNAMIC TRAIT EQUIPPING & WALRUS SYNC',
      desc: 'Access your secured constructs. Decrypt inventory, equip dynamic modular traits, and sync your high-res visual metadata directly on-chain.',
      color: '#06B6D4',
      locked: false
    },
    { 
      id: 'TELEPORTER' as TerminalViewType, 
      num: '04',
      title: 'TRAVERSAL // TELEPORTER', 
      subtitle: 'CROSS-GRID DEPLOYMENT ENGINE',
      desc: 'CRITICAL WARNING: Post-mint traversal engine is currently offline. Module will unlock automatically upon global collection supply depletion.',
      color: '#555555',
      locked: true
    },
    { 
      id: 'MARKETPLACE' as TerminalViewType, 
      num: '05',
      title: 'SYNDICATE // MARKET', 
      subtitle: 'NATIVE OPERATIVE & TRAIT EXCHANGE',
      desc: 'CRITICAL WARNING: Native peer-to-peer Operative and modular trait trading terminal is encrypted. Awaiting deployment sequence.',
      color: '#555555',
      locked: true
    }
  ];

  if (isAdmin) {
    menuItems.push({
      id: 'ADMIN' as TerminalViewType,
      num: '00',
      title: 'SYSTEM // OVERSEER',
      subtitle: 'ROOT COMMAND & PHASE SWITCHBOARD',
      desc: 'AUTHORIZED ACCESS ONLY: Master admin terminal for phase schedule manipulation, 3-stage whitelist pipeline management, and global economic overrides.',
      color: '#ff3333',
      locked: false
    });
  }

  const activeItem = hoveredId ? menuItems.find(m => m.id === hoveredId) : null;
  const activeDesc = activeItem
    ? activeItem.desc
    : 'AWAITING OPERATIVE INPUT... SELECT OR HOVER A MODULE TO INSPECT TELEMETRY.';
  const activeColor = activeItem ? activeItem.color : '#06B6D4';

  return (
    <div className="np-home-root">
      <style>{`
        .np-home-root {
          position: relative;
          width: 100%;
          min-height: 82vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem 0 3.5rem 0;
          box-sizing: border-box;
        }

        .np-home-grid {
          display: grid;
          grid-template-columns: 1.05fr 1.15fr;
          gap: 3.5rem;
          width: 100%;
          max-width: 1160px;
          align-items: center;
          position: relative;
          z-index: 2;
        }

        /* --- LEFT COLUMN: ARCHITECTURAL SPECIMEN MATRIX --- */
        .np-specimen-stage {
          position: relative;
          padding: 1rem;
        }

        .np-specimen-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.4rem;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.12);
          font-size: 9px;
          letter-spacing: 0.2em;
          color: #666;
          text-transform: uppercase;
        }

        .np-art-collage {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.15rem;
          transform: perspective(1100px) rotateY(10deg) rotateX(3deg);
          transform-style: preserve-3d;
          animation: npFloat 9s ease-in-out infinite;
        }

        @keyframes npFloat {
          0%, 100% { transform: perspective(1100px) rotateY(10deg) rotateX(3deg) translateY(0px); }
          50% { transform: perspective(1100px) rotateY(7deg) rotateX(5deg) translateY(-10px); }
        }

        .np-art-card {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1.12;
          background: rgba(8, 8, 12, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.14);
          padding: 6px;
          box-sizing: border-box;
          box-shadow: -15px 20px 35px rgba(0, 0, 0, 0.85);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
        }

        /* Subtle staggered heights on desktop */
        .np-art-card:nth-child(1) { transform: translateY(-12px) rotate(-1.5deg); }
        .np-art-card:nth-child(2) { transform: translateY(16px) rotate(1.5deg); }
        .np-art-card:nth-child(3) { transform: translateY(-18px) rotate(1deg); }
        .np-art-card:nth-child(4) { transform: translateY(10px) rotate(-1.5deg); }

        .np-art-card::before,
        .np-art-card::after {
          content: '';
          position: absolute;
          width: 10px;
          height: 10px;
          border-color: #06B6D4;
          border-style: solid;
          pointer-events: none;
          z-index: 3;
          opacity: 0.65;
          transition: opacity 0.3s ease;
        }
        .np-art-card::before { top: 0; left: 0; border-width: 2px 0 0 2px; }
        .np-art-card::after { bottom: 0; right: 0; border-width: 0 2px 2px 0; }

        .np-art-img-wrap {
          position: relative;
          width: 100%;
          flex: 1;
          overflow: hidden;
          background: radial-gradient(circle at center, rgba(6, 182, 212, 0.12), rgba(0, 0, 0, 0.9));
        }

        .np-art-img-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          filter: grayscale(40%) contrast(1.12);
          transition: transform 0.5s ease, filter 0.5s ease;
        }

        .np-art-card:hover {
          transform: translateZ(28px) scale(1.03);
          border-color: #06B6D4;
          box-shadow: 0 0 25px rgba(6, 182, 212, 0.25), -10px 15px 30px rgba(0, 0, 0, 0.9);
          z-index: 5;
        }

        .np-art-card:hover .np-art-img-wrap img {
          filter: grayscale(0%) contrast(1.08);
          transform: scale(1.06);
        }

        .np-art-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 6px;
          font-size: 8px;
          letter-spacing: 0.14em;
          color: #888;
          font-family: monospace;
        }

        .np-art-meta span:last-child {
          color: #06B6D4;
          font-weight: bold;
        }

        /* --- RIGHT COLUMN: TERMINAL DIRECTORY --- */
        .np-menu-panel {
          display: flex;
          flex-direction: column;
          background: rgba(10, 10, 14, 0.72);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 2rem;
          position: relative;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
        }

        .np-menu-panel::before {
          content: '';
          position: absolute;
          top: -1px;
          left: -1px;
          width: 24px;
          height: 24px;
          border-top: 2px solid #06B6D4;
          border-left: 2px solid #06B6D4;
          pointer-events: none;
        }

        .np-menu-panel::after {
          content: '';
          position: absolute;
          bottom: -1px;
          right: -1px;
          width: 24px;
          height: 24px;
          border-bottom: 2px solid #06B6D4;
          border-right: 2px solid #06B6D4;
          pointer-events: none;
        }

        .np-brand-header {
          margin-bottom: 1.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 1.15rem;
        }

        .np-sys-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 9px;
          color: #00ff80;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          margin-bottom: 0.5rem;
          background: rgba(0, 255, 128, 0.07);
          border: 1px solid rgba(0, 255, 128, 0.25);
          padding: 3px 8px;
        }

        .np-pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #00ff80;
          box-shadow: 0 0 8px #00ff80;
        }

        .np-brand-title {
          margin: 0;
          color: #FFFFFF;
          font-size: 2rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-weight: 800;
        }

        .np-brand-sub {
          margin-top: 0.35rem;
          color: #06B6D4;
          font-size: 0.72rem;
          letter-spacing: 0.28em;
          font-weight: bold;
        }

        .np-menu-list {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .np-menu-row {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.9rem 1.15rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-left: 3px solid transparent;
          cursor: pointer;
          transition: all 0.25s ease;
          font-family: inherit;
          text-align: left;
          width: 100%;
          box-sizing: border-box;
        }

        .np-menu-row:hover:not(.locked) {
          background: rgba(6, 182, 212, 0.07);
          border-color: rgba(255, 255, 255, 0.18);
          transform: translateX(4px);
        }

        .np-menu-row.locked {
          cursor: not-allowed;
          opacity: 0.45;
          background: rgba(0, 0, 0, 0.35);
        }

        .np-row-left {
          display: flex;
          align-items: center;
          gap: 1rem;
          min-width: 0;
        }

        .np-row-num {
          font-size: 0.7rem;
          color: #666;
          font-weight: bold;
          letter-spacing: 0.08em;
          padding: 4px 6px;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .np-row-titles {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .np-row-main {
          font-size: 0.95rem;
          font-weight: bold;
          letter-spacing: 0.14em;
          color: #E5E5E5;
          transition: color 0.25s ease;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .np-row-sub {
          font-size: 0.62rem;
          letter-spacing: 0.12em;
          color: #777;
          text-transform: uppercase;
        }

        .np-row-right {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-shrink: 0;
        }

        .np-status-pill {
          font-size: 0.6rem;
          font-weight: bold;
          letter-spacing: 0.14em;
          padding: 3px 7px;
          border: 1px solid currentColor;
          text-transform: uppercase;
        }

        .np-telemetry-box {
          margin-top: 1.4rem;
          padding: 1rem 1.15rem;
          background: rgba(0, 0, 0, 0.65);
          border: 1px dashed rgba(255, 255, 255, 0.15);
          min-height: 74px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0.35rem;
          transition: border-color 0.25s ease;
        }

        .np-footer-bar {
          margin-top: 1.4rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        /* --- MOBILE & TABLET RESPONSIVENESS (NO OVERLAPPING TEXT/IMAGES) --- */
        @media (max-width: 960px) {
          .np-home-root {
            padding: 0.5rem 0 2.5rem 0;
            align-items: flex-start;
          }

          .np-home-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }

          /* Put the specimen showcase cleanly AT THE TOP as a 4-across fanned strip */
          .np-specimen-stage {
            padding: 0;
            order: 1;
          }

          .np-menu-panel {
            order: 2;
            padding: 1.35rem 1.1rem;
          }

          .np-art-collage {
            grid-template-columns: repeat(4, 1fr);
            gap: 0.55rem;
            transform: none;
            animation: none;
          }

          /* Subtle alternating tilt on mobile without overlapping the menu below */
          .np-art-card:nth-child(1) { transform: rotate(-2deg); }
          .np-art-card:nth-child(2) { transform: translateY(4px) rotate(1.5deg); }
          .np-art-card:nth-child(3) { transform: rotate(-1.5deg); }
          .np-art-card:nth-child(4) { transform: translateY(4px) rotate(2deg); }

          .np-art-card {
            padding: 4px;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.75);
          }

          .np-art-meta {
            display: none; /* Keep mobile cards ultra-clean */
          }

          .np-brand-title {
            font-size: 1.45rem;
            letter-spacing: 0.16em;
          }

          .np-menu-row {
            padding: 0.8rem 0.85rem;
          }

          .np-row-main {
            font-size: 0.82rem;
            letter-spacing: 0.1em;
          }

          .np-row-sub {
            font-size: 0.56rem;
          }
        }

        @media (max-width: 480px) {
          .np-art-collage {
            grid-template-columns: repeat(4, 1fr);
            gap: 0.4rem;
          }
          .np-row-num {
            display: none;
          }
        }
      `}</style>

      <div className="np-home-grid">
        
        {/* LEFT (OR TOP ON MOBILE): 4-SPECIMEN VISUAL SHOWCASE */}
        <div className="np-specimen-stage">
          <div className="np-specimen-header">
            <span>// VISUAL ARCHIVE // SUI MAINNET</span>
            <span style={{ color: '#06B6D4' }}>[ 4 SPECIMENS LOADED ]</span>
          </div>

          <div className="np-art-collage">
            {artSpecimens.map((art, idx) => (
              <div key={idx} className="np-art-card">
                <div className="np-art-img-wrap">
                  <img src={art.src} alt={art.code} />
                </div>
                <div className="np-art-meta">
                  <span>{art.code}</span>
                  <span>{art.tier}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT (OR BOTTOM ON MOBILE): COMMAND DIRECTORY PANEL */}
        <div className="np-menu-panel">
          
          <div className="np-brand-header">
            <div className="np-sys-tag">
              <span className="np-pulse-dot" />
              <span>MAINNET UPLINK ESTABLISHED</span>
            </div>
            <h1 className="np-brand-title">NUMB_POLYS</h1>
            <div className="np-brand-sub">// GLOBAL SYNDICATE DIRECTORY</div>
          </div>

          <div className="np-menu-list">
            {menuItems.map((item) => {
              const isHovered = hoveredId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => !item.locked && onNavigate(item.id)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`np-menu-row ${item.locked ? 'locked' : ''}`}
                  style={{
                    borderLeftColor: !item.locked ? (isHovered ? item.color : 'rgba(255,255,255,0.18)') : 'transparent',
                  }}
                >
                  <div className="np-row-left">
                    <span className="np-row-num" style={{ color: isHovered ? item.color : '#777' }}>
                      [{item.num}]
                    </span>
                    <div className="np-row-titles">
                      <span
                        className="np-row-main"
                        style={{ color: isHovered && !item.locked ? item.color : '#E5E5E5' }}
                      >
                        {item.title}
                      </span>
                      <span className="np-row-sub">{item.subtitle}</span>
                    </div>
                  </div>

                  <div className="np-row-right">
                    <span
                      className="np-status-pill"
                      style={{
                        color: item.locked ? '#ff3333' : item.color,
                        borderColor: item.locked ? 'rgba(255,51,51,0.4)' : `${item.color}66`,
                        background: item.locked ? 'rgba(255,51,51,0.08)' : 'rgba(0,0,0,0.4)'
                      }}
                    >
                      {item.locked ? 'LOCKED' : 'ONLINE →'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* DYNAMIC DESCRIPTION TELEMETRY BOX */}
          <div className="np-telemetry-box" style={{ borderLeft: `3px solid ${activeColor}` }}>
            <span style={{ fontSize: '9px', color: activeColor, fontWeight: 'bold', letterSpacing: '0.18em' }}>
              // TERMINAL TELEMETRY INTERCEPT
            </span>
            <span style={{ color: '#A3A3A3', fontSize: '0.8rem', lineHeight: '1.5' }}>
              {activeDesc}
            </span>
          </div>

          <div className="np-footer-bar">
            <a 
              href="https://www.numbpolys.xyz/" 
              style={{ 
                color: '#888', 
                fontSize: '10px', 
                letterSpacing: '0.12em', 
                textTransform: 'uppercase', 
                textDecoration: 'none', 
                transition: 'all 0.25s ease',
                borderBottom: '1px dashed rgba(255,255,255,0.25)',
                paddingBottom: '2px'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#06B6D4'; e.currentTarget.style.borderBottomColor = '#06B6D4'; }} 
              onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.25)'; }}
            >
              [ ← RETURN TO NUMB POLYS MAIN SITE ]
            </a>
            <span style={{ fontSize: '9px', color: '#555', letterSpacing: '0.15em' }}>
              SUI // WALRUS PROTOCOL
            </span>
          </div>

        </div>

      </div>
    </div>
  );
};