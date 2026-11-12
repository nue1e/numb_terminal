import React, { useState } from 'react';

type TerminalViewType = 'WHITELIST' | 'GENERATOR' | 'ARMORY' | 'TELEPORTER' | 'MARKETPLACE' | 'ADMIN';

interface HomePortalProps {
  onNavigate: (view: TerminalViewType) => void;
  isAdmin: boolean;
}

export const HomePortal: React.FC<HomePortalProps> = ({ onNavigate, isAdmin }) => {
  // We track which item is hovered to dynamically update the description panel
  const [hoveredId, setHoveredId] = useState<TerminalViewType | null>(null);

  const menuItems = [
    { 
      id: 'WHITELIST' as TerminalViewType, 
      num: '01',
      title: 'CLEARANCE // WHITELIST', 
      desc: 'Verify syndicate wallet eligibility, monitor phase deployment schedules, and secure your allocation in upcoming waves.',
      color: '#00ff80',
      locked: false
    },
    { 
      id: 'GENERATOR' as TerminalViewType, 
      num: '02',
      title: 'DEPLOY // CONSTRUCT', 
      desc: 'Execute blind construct assembly on the Sui Mainnet. Metadata is permanently encrypted and mapped to Walrus decentralized storage.',
      color: '#06B6D4',
      locked: false
    },
    { 
      id: 'ARMORY' as TerminalViewType, 
      num: '03',
      title: 'INSPECT // ARMORY', 
      desc: 'Access your secured constructs. Decrypt inventory, equip dynamic modular traits, and sync your high-res visual metadata directly on-chain.',
      color: '#06B6D4',
      locked: false
    },
    { 
      id: 'TELEPORTER' as TerminalViewType, 
      num: '04',
      title: 'TRAVERSAL // TELEPORTER', 
      desc: 'CRITICAL WARNING: Post-mint traversal engine is currently offline. Module will unlock automatically upon global collection supply depletion.',
      color: '#555555',
      locked: true
    },
    { 
      id: 'MARKETPLACE' as TerminalViewType, 
      num: '05',
      title: 'SYNDICATE // MARKET', 
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
      desc: 'AUTHORIZED ACCESS ONLY: Master admin terminal for phase schedule manipulation, whitelist pipeline management, and global economic overrides.',
      color: '#ff3333',
      locked: false
    });
  }

  const activeDesc = hoveredId 
    ? menuItems.find(m => m.id === hoveredId)?.desc 
    : 'AWAITING OPERATIVE INPUT... SELECT A MODULE TO PROCEED.';

  const activeColor = hoveredId 
    ? menuItems.find(m => m.id === hoveredId)?.color 
    : '#A3A3A3';

  return (
    <div className="home-portal-wrapper">
      <style>{`
        .home-portal-wrapper {
          position: relative;
          width: 100%;
          min-height: 85vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          box-sizing: border-box;
          overflow: hidden;
        }
        
        .layout-grid {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 4rem;
          width: 100%;
          max-width: 1200px;
          align-items: center;
          position: relative;
          z-index: 2;
        }

        /* 3D Art Collage Left Side */
        .art-collage {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          transform: perspective(1000px) rotateY(15deg) rotateX(5deg);
          transform-style: preserve-3d;
          animation: float 8s ease-in-out infinite;
        }

        .art-box {
          width: 100%;
          aspect-ratio: 1/1.2;
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.1);
          overflow: hidden;
          position: relative;
          box-shadow: -20px 20px 30px rgba(0,0,0,0.8);
          transition: all 0.5s ease;
        }

        .art-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.6;
          filter: grayscale(80%) contrast(1.2);
          transition: all 0.5s ease;
        }

        .art-box:hover {
          transform: translateZ(30px);
          border-color: #06B6D4;
        }
        
        .art-box:hover img {
          opacity: 1;
          filter: grayscale(0%) contrast(1.1);
        }

        /* Stagger the grid items for that scattered look */
        .art-box:nth-child(1) { transform: translateY(-20px); }
        .art-box:nth-child(2) { transform: translateY(30px); }
        .art-box:nth-child(3) { transform: translateY(-40px); }
        .art-box:nth-child(4) { transform: translateY(10px); }

        @keyframes float {
          0% { transform: perspective(1000px) rotateY(15deg) rotateX(5deg) translateY(0px); }
          50% { transform: perspective(1000px) rotateY(12deg) rotateX(8deg) translateY(-15px); }
          100% { transform: perspective(1000px) rotateY(15deg) rotateX(5deg) translateY(0px); }
        }

        /* Slim Terminal Menu Right Side */
        .menu-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .menu-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          background: rgba(0, 0, 0, 0.4);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          border-left: 2px solid transparent;
          cursor: pointer;
          transition: all 0.3s ease;
          font-family: var(--font-geist-sans), monospace;
        }

        .menu-row:hover {
          background: rgba(255, 255, 255, 0.03);
          padding-left: 2rem;
        }

        .menu-row.locked {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .menu-row.locked:hover {
          padding-left: 1.5rem;
          background: rgba(0,0,0,0.4);
        }

        .menu-num {
          font-size: 0.75rem;
          color: #555;
          font-weight: bold;
          letter-spacing: 0.1em;
          margin-right: 1.5rem;
        }

        .menu-title {
          font-size: 1.1rem;
          font-weight: bold;
          letter-spacing: 0.15em;
          flex: 1;
          text-align: left;
          transition: color 0.3s ease;
        }

        .menu-status {
          font-size: 0.65rem;
          letter-spacing: 0.15em;
          padding: 2px 6px;
          border: 1px solid currentColor;
        }

        /* Telemetry Box */
        .telemetry-box {
          margin-top: 2rem;
          padding: 1.5rem;
          background: rgba(0, 0, 0, 0.6);
          border: 1px dashed rgba(255, 255, 255, 0.15);
          min-height: 100px;
          display: flex;
          align-items: flex-start;
          transition: all 0.3s ease;
        }

        /* Mobile Breakpoints */
        @media (max-width: 900px) {
          .layout-grid {
            grid-template-columns: 1fr;
            gap: 2rem;
          }
          .art-collage {
            position: absolute;
            top: 10%;
            left: 50%;
            width: 140%;
            transform: translateX(-50%) perspective(1000px) rotateY(0deg) rotateX(0deg);
            opacity: 0.15; /* Push to background on mobile */
            z-index: -1;
            animation: none;
          }
          .art-box:hover { transform: none; }
          .home-portal-wrapper { padding: 1rem; }
        }
      `}</style>

      <div className="layout-grid">
        
        {/* LEFT: 3D SCATTERED ART COLLAGE */}
        <div className="art-collage">
          <div className="art-box">
            <img src="/assets/art_1.png" alt="Construct Alpha" />
          </div>
          <div className="art-box">
            <img src="/assets/art_2.png" alt="Construct Beta" />
          </div>
          <div className="art-box">
            <img src="/assets/art_3.png" alt="Construct Gamma" />
          </div>
          <div className="art-box">
            <img src="/assets/art_4.png" alt="Construct Delta" />
          </div>
        </div>

        {/* RIGHT: SLIM TERMINAL MENU & TELEMETRY */}
        <div className="menu-container">
          
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 style={{ margin: '0 0 0.5rem 0', color: '#E5E5E5', fontSize: '2.2rem', letterSpacing: '0.25em', textTransform: 'uppercase', textShadow: '0 0 20px rgba(255,255,255,0.1)' }}>
              NUMB_POLYS
            </h1>
            <div style={{ color: '#06B6D4', fontSize: '0.8rem', letterSpacing: '0.3em', fontWeight: 'bold' }}>
              // GLOBAL SYNDICATE DIRECTORY
            </div>
          </div>

          <div className="menu-list">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => !item.locked && onNavigate(item.id)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`menu-row ${item.locked ? 'locked' : ''}`}
                style={{
                  borderLeftColor: hoveredId === item.id && !item.locked ? item.color : 'transparent',
                }}
              >
                <span className="menu-num">[{item.num}]</span>
                <span 
                  className="menu-title" 
                  style={{ color: hoveredId === item.id ? item.color : '#E5E5E5' }}
                >
                  {item.title}
                </span>
                <span 
                  className="menu-status" 
                  style={{ color: item.locked ? '#ff3333' : '#555', borderColor: item.locked ? '#ff3333' : '#333' }}
                >
                  {item.locked ? 'ENCRYPTED' : 'ONLINE'}
                </span>
              </button>
            ))}
          </div>

          {/* DYNAMIC DESCRIPTION TELEMETRY BOX */}
          <div className="telemetry-box" style={{ borderLeft: `2px solid ${activeColor}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '10px', color: activeColor, fontWeight: 'bold', letterSpacing: '0.15em' }}>
                // TERMINAL TELEMETRY INTERCEPT
              </span>
              <span style={{ color: '#A3A3A3', fontSize: '0.85rem', lineHeight: '1.6' }}>
                {activeDesc}
              </span>
            </div>
          </div>
          
          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-start' }}>
            <a 
              href="https://www.numbpolys.xyz/" 
              style={{ 
                color: '#555', 
                fontSize: '10px', 
                letterSpacing: '0.1em', 
                textTransform: 'uppercase', 
                textDecoration: 'none', 
                transition: 'all 0.3s ease',
                borderBottom: '1px dashed #555',
                paddingBottom: '2px'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#E5E5E5'; e.currentTarget.style.borderBottomColor = '#E5E5E5'; }} 
              onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderBottomColor = '#555'; }}
            >
              [ ← Disconnect and return to main protocol site ]
            </a>
          </div>

        </div>

      </div>
    </div>
  );
};