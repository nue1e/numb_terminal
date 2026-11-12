import React, { useState, useEffect } from 'react';
import { PhaseConfigItem, PortalSettings } from './AdminDashboard';
import registryData from './registry.json';

// --- STEALTH GOOGLE SHEETS WEBHOOK ENDPOINT ---
const GOOGLE_SHEETS_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbwQ9BL-2mDKpH_-XHSsU9Og2eBY0vLR-wjpp9WW5hotd2o2zfcNLIt2Ii2KxALKTRBd/exec';

interface WhitelistPortalProps {
  accountAddress?: string;
  currentPhase: number;
  phaseStatsList: (PhaseConfigItem & {
    startIdx: number;
    endIdx: number;
    mintedInPhase: number;
    remainingInPhase: number;
  })[];
  phaseWhitelists: Record<string, Record<string, number>>;
  portalSettings: PortalSettings;
  totalRemainingConstructs: number;
  totalMintedGlobal: number;
  displayOperativesCount: number;
}

interface LocalApplicationRecord {
  wallet: string;
  xHandle: string;
  tier: 2 | 3;
  tierName: string;
  priceSui: number;
  timestamp: string;
  clearanceCode: string;
}

export const WhitelistPortal: React.FC<WhitelistPortalProps> = ({
  accountAddress,
  currentPhase,
  phaseStatsList,
  phaseWhitelists,
  portalSettings,
  totalRemainingConstructs,
  totalMintedGlobal,
  displayOperativesCount
}) => {
  const [checkInput, setCheckInput] = useState<string>(accountAddress || '');
  const [selectedApplyTier, setSelectedApplyTier] = useState<2 | 3>(2);
  const [applyWallet, setApplyWallet] = useState<string>(accountAddress || '');
  const [applyXHandle, setApplyXHandle] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isSubmittingApp, setIsSubmittingApp] = useState<boolean>(false);

  const [wl1AppList, setWl1AppList] = useState<LocalApplicationRecord[]>([]);
  const [wl2AppList, setWl2AppList] = useState<LocalApplicationRecord[]>([]);
  const [activeCardRecord, setActiveCardRecord] = useState<LocalApplicationRecord | null>(null);
  const [cardPreviewUrl, setCardPreviewUrl] = useState<string | null>(null);
  const [isGeneratingCard, setIsGeneratingCard] = useState<boolean>(false);

  const isRevealMode = Boolean(portalSettings.checkerResultsLive);

  // Sync connected wallet into inputs automatically when user connects
  useEffect(() => {
    if (accountAddress) {
      if (!checkInput) setCheckInput(accountAddress);
      if (!applyWallet) setApplyWallet(accountAddress);
    }
  }, [accountAddress]);

  // Load local applications & check if current wallet already has a clearance card
  useEffect(() => {
    try {
      const raw1 = localStorage.getItem('numbpolys_wl_apps_phase_2');
      const raw2 = localStorage.getItem('numbpolys_wl_apps_phase_3');
      const parsed1: LocalApplicationRecord[] = raw1 ? JSON.parse(raw1) : [];
      const parsed2: LocalApplicationRecord[] = raw2 ? JSON.parse(raw2) : [];
      setWl1AppList(parsed1);
      setWl2AppList(parsed2);

      const targetAddr = (accountAddress || applyWallet || checkInput).trim().toLowerCase();
      if (targetAddr) {
        const existingForTier =
          selectedApplyTier === 2
            ? parsed1.find(a => a.wallet.toLowerCase() === targetAddr)
            : parsed2.find(a => a.wallet.toLowerCase() === targetAddr);
        const fallbackExisting =
          parsed1.find(a => a.wallet.toLowerCase() === targetAddr) ||
          parsed2.find(a => a.wallet.toLowerCase() === targetAddr);

        if (existingForTier || fallbackExisting) {
          setActiveCardRecord(existingForTier || fallbackExisting || null);
        }
      }
    } catch (e) {
      console.warn('Failed to parse local application records:', e);
    }
  }, [accountAddress]);

  // When user switches between WL 1 and WL 2 tabs, swap to that tier's card if they already applied for it
  const handleSelectTierTab = (tier: 2 | 3) => {
    setSelectedApplyTier(tier);
    const targetAddr = (applyWallet || checkInput || accountAddress || '').trim().toLowerCase();
    if (!targetAddr) return;
    const list = tier === 2 ? wl1AppList : wl2AppList;
    const found = list.find(a => a.wallet.toLowerCase() === targetAddr);
    if (found) {
      setActiveCardRecord(found);
    }
  };

  const showBanner = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(null), 8000);
  };

  const inspectedWallet = (checkInput || accountAddress || '').trim().toLowerCase();
  const isValidInspectedWallet = inspectedWallet.startsWith('0x') && inspectedWallet.length >= 40;

  // Compute live application counts
  const officialWl1Count = Object.keys(phaseWhitelists['2'] || {}).length;
  const officialWl2Count = Object.keys(phaseWhitelists['3'] || {}).length;
  const totalWl1Applied = officialWl1Count + wl1AppList.length;
  const totalWl2Applied = officialWl2Count + wl2AppList.length;

  const isWl1Exhausted = isRevealMode || !portalSettings.wl1ApplyOpen || totalWl1Applied >= portalSettings.wl1MaxApps;
  const isWl2Exhausted = isRevealMode || !portalSettings.wl2ApplyOpen || totalWl2Applied >= portalSettings.wl2MaxApps;

  // Generate High-Res Numb Polys Social Flex Clearance Card on 2D Canvas
  const renderClearanceCard = async (record: LocalApplicationRecord, statusLabel: string) => {
    setIsGeneratingCard(true);
    try {
      const canvas = document.createElement('canvas');
      const width = 1200;
      const height = 675;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Obsidian Dark Background
      ctx.fillStyle = '#0D0D11';
      ctx.fillRect(0, 0, width, height);

      // 2. Subtle Cyber Grid Lines
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.07)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 3. Outer HUD Frame & Neon Corners
      const pad = 36;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

      const accentColor = statusLabel.includes('APPROVED') || record.priceSui === 0 ? '#00ff80' : '#06B6D4';
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 4;
      const cornerLen = 40;

      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(pad, pad + cornerLen);
      ctx.lineTo(pad, pad);
      ctx.lineTo(pad + cornerLen, pad);
      ctx.stroke();

      // Top-right corner
      ctx.beginPath();
      ctx.moveTo(width - pad - cornerLen, pad);
      ctx.lineTo(width - pad, pad);
      ctx.lineTo(width - pad, pad + cornerLen);
      ctx.stroke();

      // Bottom-left corner
      ctx.beginPath();
      ctx.moveTo(pad, height - pad - cornerLen);
      ctx.lineTo(pad, height - pad);
      ctx.lineTo(pad + cornerLen, height - pad);
      ctx.stroke();

      // Bottom-right corner
      ctx.beginPath();
      ctx.moveTo(width - pad - cornerLen, height - pad);
      ctx.lineTo(width - pad, height - pad);
      ctx.lineTo(width - pad, height - pad - cornerLen);
      ctx.stroke();

      // 4. Try to load a classified silhouette construct on the right side
      const sampleBody = (registryData as any[])?.[0]?.walrus_urls?.['Base Body'];
      if (sampleBody) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.drawImage(img, width - 470, 110, 400, 400);
            ctx.restore();
            resolve();
          };
          img.onerror = () => resolve();
          img.src = `https://wsrv.nl/?url=${encodeURIComponent(sampleBody)}&output=png`;
        });
      }

      // 5. Header Typography
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 18px monospace';
      ctx.fillText('// SUI MAINNET DYNAMIC CONSTRUCT SYNDICATE //', 75, 95);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 46px monospace';
      ctx.fillText('NUMB_POLYS // TERMINAL PASS', 75, 150);

      // 6. Status Badge Box
      ctx.fillStyle = statusLabel.includes('APPROVED') ? 'rgba(0, 255, 128, 0.12)' : 'rgba(6, 182, 212, 0.12)';
      ctx.fillRect(75, 185, 620, 54);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(75, 185, 620, 54);

      ctx.fillStyle = accentColor;
      ctx.font = 'bold 22px monospace';
      ctx.fillText(`⚡ STATUS: ${statusLabel}`, 95, 220);

      // 7. Operative Telemetry Details
      const shortWallet = `${record.wallet.slice(0, 10)}...${record.wallet.slice(-8)}`;
      const rows: [string, string][] = [
        ['OPERATIVE WALLET:', shortWallet],
        ['X / COMMS HANDLE:', record.xHandle || 'CLASSIFIED // ANONYMOUS'],
        ['ASSIGNED WAVE:', record.tierName.toUpperCase()],
        ['DEPLOYMENT RATE:', record.priceSui === 0 ? '0 SUI [FREE MINT]' : `${record.priceSui} SUI`],
        ['CLEARANCE HASH:', record.clearanceCode],
        ['TIMESTAMP (UTC):', record.timestamp]
      ];

      let startY = 300;
      for (const [label, value] of rows) {
        ctx.fillStyle = '#888888';
        ctx.font = '18px monospace';
        ctx.fillText(label, 75, startY);

        ctx.fillStyle = '#E5E5E5';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(value, 310, startY);
        startY += 46;
      }

      // 8. Footer Bar
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(75, height - 105, width - 150, 42);
      ctx.fillStyle = '#A3A3A3';
      ctx.font = '15px monospace';
      ctx.fillText('VERIFY CLEARANCE AT: MAINNET.NUMBPOLYS.XYZ/WHITELIST', 90, height - 78);

      ctx.fillStyle = accentColor;
      ctx.font = 'bold 15px monospace';
      ctx.fillText('[ POWERED BY SUI & WALRUS ]', width - 350, height - 78);

      const dataUrl = canvas.toDataURL('image/png');
      setCardPreviewUrl(dataUrl);
    } catch (err) {
      console.error('Failed to render clearance card:', err);
    } finally {
      setIsGeneratingCard(false);
    }
  };

  // Re-render card preview whenever activeCardRecord, phaseWhitelists, or 3-stage mode changes
  useEffect(() => {
    if (!activeCardRecord) return;
    const lower = activeCardRecord.wallet.toLowerCase();
    const isOfficiallyApproved =
      isRevealMode &&
      ((phaseWhitelists['1']?.[lower] ?? 0) > 0 ||
        (phaseWhitelists['2']?.[lower] ?? 0) > 0 ||
        (phaseWhitelists['3']?.[lower] ?? 0) > 0);
    const badgeText = isOfficiallyApproved
      ? 'WHITELIST CLEARANCE APPROVED'
      : 'APPLICATION REGISTERED // PENDING REVIEW';
    renderClearanceCard(activeCardRecord, badgeText);
  }, [activeCardRecord, phaseWhitelists, isRevealMode]);

  // Stealth transmit application to Google Sheets Webhook
  const transmitToGoogleSheet = async (record: LocalApplicationRecord) => {
    const payload = {
      timestamp: record.timestamp,
      phase:
        record.tier === 2
          ? 'PHASE 02 // WL 1 (2 SUI)'
          : 'PHASE 03 // WL 2 (3 SUI)',
      wallet: record.wallet,
      handle: record.xHandle
    };

    try {
      await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Background telemetry sync notice:', err);
    }
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingApp) return;

    const cleanWallet = applyWallet.trim();
    if (!cleanWallet.startsWith('0x') || cleanWallet.length < 40) {
      showBanner('[ ERROR: ENTER A VALID SUI WALLET ADDRESS (0x...) ]');
      return;
    }

    if (selectedApplyTier === 2 && isWl1Exhausted) {
      showBanner('[ ERROR: PHASE 02 (WL 1) APPLICATIONS ARE CLOSED OR EXHAUSTED ]');
      return;
    }
    if (selectedApplyTier === 3 && isWl2Exhausted) {
      showBanner('[ ERROR: PHASE 03 (WL 2) APPLICATIONS ARE CLOSED OR EXHAUSTED ]');
      return;
    }

    const storageKey = `numbpolys_wl_apps_phase_${selectedApplyTier}`;
    const currentList = selectedApplyTier === 2 ? wl1AppList : wl2AppList;

    const existing = currentList.find(item => item.wallet.toLowerCase() === cleanWallet.toLowerCase());
    if (existing) {
      setActiveCardRecord(existing);
      setCheckInput(cleanWallet);
      showBanner(`[ NOTICE: WALLET ALREADY APPLIED FOR PHASE 0${selectedApplyTier} — RETRIEVING YOUR PASS ]`);
      return;
    }

    setIsSubmittingApp(true);
    const phaseInfo = phaseStatsList.find(p => p.phase === selectedApplyTier);

    const record: LocalApplicationRecord = {
      wallet: cleanWallet,
      xHandle: applyXHandle.trim()
        ? applyXHandle.trim().startsWith('@')
          ? applyXHandle.trim()
          : `@${applyXHandle.trim()}`
        : '@Operative',
      tier: selectedApplyTier,
      tierName: phaseInfo?.name || `Phase 0${selectedApplyTier} // Whitelist`,
      priceSui: phaseInfo?.price ?? (selectedApplyTier === 2 ? 2 : 3),
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      clearanceCode: `NP-WL0${selectedApplyTier}-${cleanWallet.slice(2, 8).toUpperCase()}`
    };

    // Silently log to your Google Sheet in the background
    await transmitToGoogleSheet(record);

    const updated = [record, ...currentList];
    localStorage.setItem(storageKey, JSON.stringify(updated));
    if (selectedApplyTier === 2) setWl1AppList(updated);
    else setWl2AppList(updated);

    setActiveCardRecord(record);
    setCheckInput(cleanWallet);
    setIsSubmittingApp(false);
    showBanner(`[ SUCCESS: ${record.tierName.toUpperCase()} APPLICATION LOGGED & PASS GENERATED ]`);
  };

  // Allow user who is verified on-chain (once Stage 3 Reveal is active) to generate their card on demand
  const handleGenerateVerifiedCard = (phaseNum: 1 | 2 | 3) => {
    if (!isValidInspectedWallet) {
      showBanner('[ ERROR: ENTER OR CONNECT A VALID SUI WALLET FIRST ]');
      return;
    }
    const phaseInfo = phaseStatsList.find(p => p.phase === phaseNum);
    const record: LocalApplicationRecord = {
      wallet: inspectedWallet,
      xHandle: applyXHandle.trim() || 'VERIFIED SYNDICATE MEMBER',
      tier: (phaseNum === 1 ? 2 : phaseNum) as 2 | 3,
      tierName: phaseInfo?.name || `Phase 0${phaseNum}`,
      priceSui: phaseInfo?.price ?? 0,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      clearanceCode: `NP-VERIFIED-P0${phaseNum}-${inspectedWallet.slice(2, 8).toUpperCase()}`
    };
    setActiveCardRecord(record);
    showBanner(`[ GENERATING VERIFIED CLEARANCE CARD FOR PHASE 0${phaseNum}... ]`);
  };

  const downloadClearanceCard = () => {
    if (!cardPreviewUrl || !activeCardRecord) return;
    const link = document.createElement('a');
    link.download = `NUMB_POLYS_WL_${activeCardRecord.wallet.slice(0, 8).toUpperCase()}.png`;
    link.href = cardPreviewUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showBanner('[ SUCCESS: CLEARANCE CARD DOWNLOADED — SHARE ON X! ]');
  };

  // Helper to format spots left label cleanly (supports Unlimited 99999 cap or specific cap)
  const formatSpotsLabel = (maxApps: number, appliedCount: number) => {
    if (maxApps >= 9999) return '[ OPEN // ACCEPTING SUBMISSIONS ]';
    return `[ OPEN // ${Math.max(0, maxApps - appliedCount)} SPOTS LEFT ]`;
  };

  // Compute total approved mints across all 3 whitelist phases for Stage 3 Summary Box
  const p1ApprovedQty = isValidInspectedWallet ? (phaseWhitelists['1']?.[inspectedWallet] ?? 0) : 0;
  const p2ApprovedQty = isValidInspectedWallet ? (phaseWhitelists['2']?.[inspectedWallet] ?? 0) : 0;
  const p3ApprovedQty = isValidInspectedWallet ? (phaseWhitelists['3']?.[inspectedWallet] ?? 0) : 0;
  const totalApprovedMintsForWallet = p1ApprovedQty + p2ApprovedQty + p3ApprovedQty;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', maxWidth: '1050px', margin: '0 auto', paddingBottom: '4rem' }}>
      {statusBanner && (
        <div style={{ width: '100%', padding: '12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: statusBanner.includes('ERROR') ? 'rgba(255, 0, 0, 0.15)' : 'rgba(0, 255, 128, 0.15)', border: `1px solid ${statusBanner.includes('ERROR') ? '#ff3333' : '#00ff80'}`, color: statusBanner.includes('ERROR') ? '#ff3333' : '#00ff80', boxSizing: 'border-box' }}>
          {statusBanner}
        </div>
      )}

      {/* TOP SECTION: WALLET ELIGIBILITY CHECKER + WHITELIST APPLICATION / SUMMARY PORTAL */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '2rem', width: '100%' }}>
        
        {/* LEFT COLUMN: MULTI-PHASE WALLET ELIGIBILITY CHECKER */}
        <div className="hud-frame" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="hud-corner-bottom" />
          <div>
            <div style={{ fontSize: '10px', color: '#06B6D4', letterSpacing: '0.15em', fontWeight: 'bold', marginBottom: '4px' }}>
              // SYNDICATE CLEARANCE SCANNER
            </div>
            <h2 style={{ margin: '0 0 0.5rem 0', color: '#E5E5E5', fontSize: '1.15rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              WHITELIST & PHASE ELIGIBILITY CHECKER
            </h2>
            <p style={{ color: '#A3A3A3', fontSize: '0.8rem', lineHeight: '1.5', margin: 0 }}>
              Paste any Sui wallet address below (or connect your wallet) to verify your clearance across Community Free Mint, Whitelist Wave 1, and Whitelist Wave 2.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={checkInput}
              onChange={(e) => setCheckInput(e.target.value)}
              placeholder="Paste Sui Wallet Address (0x...) to check..."
              style={{ flex: 1, background: 'rgba(0,0,0,0.6)', border: '1px solid #06B6D4', color: '#E5E5E5', padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px' }}
            />
            {accountAddress && checkInput.toLowerCase() !== accountAddress.toLowerCase() && (
              <button
                onClick={() => setCheckInput(accountAddress)}
                style={{ background: 'rgba(6,182,212,0.15)', color: '#06B6D4', border: '1px solid #06B6D4', padding: '0 12px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                USE CONNECTED
              </button>
            )}
          </div>

          {/* INSTANT 3-TIER WHITELIST BREAKDOWN FOR INSPECTED WALLET */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2, 3].map((pNum) => {
              const pInfo = phaseStatsList.find(p => p.phase === pNum);
              const wlMap = phaseWhitelists[String(pNum)] || {};
              const allowedQty = isValidInspectedWallet ? (wlMap[inspectedWallet] ?? 0) : 0;
              const localAppList = pNum === 2 ? wl1AppList : pNum === 3 ? wl2AppList : [];
              const hasPendingApp = isValidInspectedWallet && localAppList.some(a => a.wallet.toLowerCase() === inspectedWallet);

              let badgeLabel = 'ENTER 0x WALLET ABOVE';
              let badgeColor = '#666';

              if (isValidInspectedWallet) {
                if (!isRevealMode) {
                  // STAGE 1 & STAGE 2: Results NOT revealed yet — show PENDING
                  if (pNum === 1) {
                    badgeLabel = allowedQty > 0 ? '⏳ SYNDICATE LIST LOGGED // PENDING REVEAL' : '⏳ AWAITING PARTNER CSV REVEAL';
                    badgeColor = allowedQty > 0 ? '#06B6D4' : '#888';
                  } else if (hasPendingApp) {
                    badgeLabel = '⏳ APPLICATION LOGGED // PENDING REVIEW';
                    badgeColor = '#06B6D4';
                  } else {
                    badgeLabel = (pNum === 2 ? portalSettings.wl1ApplyOpen : portalSettings.wl2ApplyOpen)
                      ? '○ NO APPLICATION DETECTED YET'
                      : '⏳ APPLICATIONS CLOSED // AWAITING REVEAL';
                    badgeColor = '#888';
                  }
                } else {
                  // STAGE 3: REVEAL ON-CHAIN ACTIVE — strictly show ELIGIBLE or NOT ELIGIBLE
                  if (allowedQty > 0) {
                    badgeLabel = `✓ ELIGIBLE (${allowedQty} MINT ALLOCATION)`;
                    badgeColor = '#00ff80';
                  } else {
                    badgeLabel = '✕ NOT ELIGIBLE FOR THIS PHASE';
                    badgeColor = '#ff3333';
                  }
                }
              }

              return (
                <div
                  key={pNum}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isRevealMode && allowedQty > 0 ? 'rgba(0,255,128,0.4)' : hasPendingApp && !isRevealMode ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#E5E5E5' }}>
                      {pInfo?.name || `Phase 0${pNum}`}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: pInfo?.price === 0 ? '#00ff80' : '#06B6D4' }}>
                      {pInfo?.price === 0 ? 'FREE (0 SUI)' : `${pInfo?.price} SUI`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                    <span style={{ color: '#888' }}>Launch: {pInfo?.scheduledDate || 'TBA'}</span>
                    <span style={{ color: badgeColor, fontWeight: 'bold' }}>{badgeLabel}</span>
                  </div>
                  {isRevealMode && allowedQty > 0 && (
                    <button
                      onClick={() => handleGenerateVerifiedCard(pNum as 1 | 2 | 3)}
                      style={{ marginTop: '4px', background: 'rgba(0,255,128,0.12)', color: '#00ff80', border: '1px solid #00ff80', padding: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      [ ⚡ GENERATE VERIFIED CLEARANCE CARD TO SHARE ]
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: STAGE 1/2 APPLICATION PORTAL OR STAGE 3 APPROVED ALLOCATION SUMMARY */}
        <div className="hud-frame" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="hud-corner-bottom" />

          {!isRevealMode ? (
            <>
              <div>
                <div style={{ fontSize: '10px', color: '#00ff80', letterSpacing: '0.15em', fontWeight: 'bold', marginBottom: '4px' }}>
                  // SYNDICATE RECRUITMENT UPLINK
                </div>
                <h2 style={{ margin: '0 0 0.5rem 0', color: '#E5E5E5', fontSize: '1.15rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  APPLY FOR WHITELIST (WL 1 & WL 2)
                </h2>
                <p style={{ color: '#A3A3A3', fontSize: '0.8rem', lineHeight: '1.5', margin: 0 }}>
                  Phase 01 (Free Mint) is reserved for partner communities submitting via CSV. Individual operators can apply below for <strong style={{ color: '#fff' }}>Phase 02 (WL 1 — 2 SUI)</strong> or <strong style={{ color: '#fff' }}>Phase 03 (WL 2 — 3 SUI)</strong> while spots remain open.
                </p>
              </div>

              {/* TIER SELECTOR TABS */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => handleSelectTierTab(2)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: selectedApplyTier === 2 ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.03)',
                    color: selectedApplyTier === 2 ? '#06B6D4' : '#A3A3A3',
                    border: selectedApplyTier === 2 ? '1px solid #06B6D4' : '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 'bold',
                    fontSize: '11px'
                  }}
                >
                  <div>PHASE 02 // WL 1 (2 SUI)</div>
                  <div style={{ fontSize: '9px', marginTop: '4px', color: isWl1Exhausted ? '#ff3333' : '#00ff80' }}>
                    {isWl1Exhausted
                      ? '[ APPLICATIONS CLOSED // PENDING REVEAL ]'
                      : formatSpotsLabel(portalSettings.wl1MaxApps, totalWl1Applied)}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTierTab(3)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: selectedApplyTier === 3 ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.03)',
                    color: selectedApplyTier === 3 ? '#06B6D4' : '#A3A3A3',
                    border: selectedApplyTier === 3 ? '1px solid #06B6D4' : '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 'bold',
                    fontSize: '11px'
                  }}
                >
                  <div>PHASE 03 // WL 2 (3 SUI)</div>
                  <div style={{ fontSize: '9px', marginTop: '4px', color: isWl2Exhausted ? '#ff3333' : '#00ff80' }}>
                    {isWl2Exhausted
                      ? '[ APPLICATIONS CLOSED // PENDING REVEAL ]'
                      : formatSpotsLabel(portalSettings.wl2MaxApps, totalWl2Applied)}
                  </div>
                </button>
              </div>

              <form onSubmit={handleApplySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <input
                  type="text"
                  value={applyWallet}
                  onChange={(e) => setApplyWallet(e.target.value)}
                  placeholder="Your Sui Wallet Address (0x...)"
                  style={{ width: '100%', background: 'rgba(0,0,0,0.6)', border: '1px solid #444', color: '#E5E5E5', padding: '10px', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '11px' }}
                />
                <input
                  type="text"
                  value={applyXHandle}
                  onChange={(e) => setApplyXHandle(e.target.value)}
                  placeholder="Your X (Twitter) Handle (e.g. @0xOperative) — Printed on Pass"
                  style={{ width: '100%', background: 'rgba(0,0,0,0.6)', border: '1px solid #444', color: '#E5E5E5', padding: '10px', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '11px' }}
                />
                <button
                  type="submit"
                  disabled={isSubmittingApp || (selectedApplyTier === 2 && isWl1Exhausted) || (selectedApplyTier === 3 && isWl2Exhausted)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background:
                      (selectedApplyTier === 2 && isWl1Exhausted) || (selectedApplyTier === 3 && isWl2Exhausted)
                        ? 'rgba(255,51,51,0.1)'
                        : 'rgba(0, 255, 128, 0.14)',
                    color:
                      (selectedApplyTier === 2 && isWl1Exhausted) || (selectedApplyTier === 3 && isWl2Exhausted)
                        ? '#ff3333'
                        : '#00ff80',
                    border:
                      (selectedApplyTier === 2 && isWl1Exhausted) || (selectedApplyTier === 3 && isWl2Exhausted)
                        ? '1px dashed #ff3333'
                        : '1px solid #00ff80',
                    cursor:
                      isSubmittingApp || (selectedApplyTier === 2 && isWl1Exhausted) || (selectedApplyTier === 3 && isWl2Exhausted)
                        ? 'not-allowed'
                        : 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase'
                  }}
                >
                  {isSubmittingApp
                    ? `[ ⚡ ENCRYPTING & LOGGING APPLICATION... ]`
                    : (selectedApplyTier === 2 && isWl1Exhausted) || (selectedApplyTier === 3 && isWl2Exhausted)
                    ? `[ PHASE 0${selectedApplyTier} APPLICATIONS CLOSED // AWAITING ON-CHAIN REVEAL ]`
                    : `[ ⚡ SUBMIT PHASE 0${selectedApplyTier} APPLICATION & GENERATE PASS ]`}
                </button>
              </form>
            </>
          ) : (
            /* STAGE 3 REVEAL MODE: OFFICIAL ON-CHAIN ALLOCATION SUMMARY */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#00ff80', letterSpacing: '0.15em', fontWeight: 'bold', marginBottom: '4px' }}>
                  // ON-CHAIN CLEARANCE VERDICT (APPLICATIONS CLOSED)
                </div>
                <h2 style={{ margin: '0 0 0.5rem 0', color: '#E5E5E5', fontSize: '1.15rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  APPROVED ALLOCATION SUMMARY
                </h2>
                <p style={{ color: '#A3A3A3', fontSize: '0.8rem', lineHeight: '1.5', margin: 0 }}>
                  Whitelist applications are officially closed and final on-chain allocations have been published by the Overseer. Below is the verified mint summary for the inspected wallet.
                </p>
              </div>

              <div
                style={{
                  background: totalApprovedMintsForWallet > 0 ? 'rgba(0, 255, 128, 0.06)' : 'rgba(255, 51, 51, 0.05)',
                  border: `1px solid ${totalApprovedMintsForWallet > 0 ? '#00ff80' : 'rgba(255, 51, 51, 0.4)'}`,
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ fontSize: '10px', color: '#888', letterSpacing: '0.1em' }}>
                  INSPECTED WALLET: <span style={{ color: '#E5E5E5' }}>{isValidInspectedWallet ? `${inspectedWallet.slice(0, 10)}...${inspectedWallet.slice(-8)}` : 'NONE DETECTED'}</span>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: totalApprovedMintsForWallet > 0 ? '#00ff80' : '#ff3333', letterSpacing: '0.08em' }}>
                  {!isValidInspectedWallet
                    ? '// ENTER OR CONNECT WALLET ON LEFT TO VIEW SUMMARY //'
                    : totalApprovedMintsForWallet > 0
                    ? `✓ VERIFIED FOR ${totalApprovedMintsForWallet} TOTAL WHITELIST MINT(S)`
                    : '✕ NO WHITELIST ALLOCATION ASSIGNED (ELIGIBLE FOR PUBLIC WAVES 04–06)'}
                </div>

                {isValidInspectedWallet && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)', fontSize: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#A3A3A3' }}>Phase 01 (Community Free — 0 SUI):</span>
                      <span style={{ fontWeight: 'bold', color: p1ApprovedQty > 0 ? '#00ff80' : '#666' }}>
                        {p1ApprovedQty > 0 ? `${p1ApprovedQty} MINT(S) APPROVED` : '0 APPROVED'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#A3A3A3' }}>Phase 02 (WL 1 — 2 SUI):</span>
                      <span style={{ fontWeight: 'bold', color: p2ApprovedQty > 0 ? '#00ff80' : '#666' }}>
                        {p2ApprovedQty > 0 ? `${p2ApprovedQty} MINT(S) APPROVED` : '0 APPROVED'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#A3A3A3' }}>Phase 03 (WL 2 — 3 SUI):</span>
                      <span style={{ fontWeight: 'bold', color: p3ApprovedQty > 0 ? '#00ff80' : '#666' }}>
                        {p3ApprovedQty > 0 ? `${p3ApprovedQty} MINT(S) APPROVED` : '0 APPROVED'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#A3A3A3' }}>Phases 04, 05 & 06 (Public Waves):</span>
                      <span style={{ fontWeight: 'bold', color: '#06B6D4' }}>OPEN TO ALL WALLETS</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DOWNLOADABLE SOCIAL FLEX CLEARANCE CARD PREVIEW */}
          {cardPreviewUrl && activeCardRecord && (
            <div style={{ marginTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.15)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#00ff80', fontWeight: 'bold', letterSpacing: '0.1em' }}>
                  // YOUR OFFICIAL SYNDICATE CLEARANCE CARD (READY TO FLEX ON X)
                </span>
                <span style={{ fontSize: '10px', color: '#888' }}>{activeCardRecord.clearanceCode}</span>
              </div>
              <div style={{ width: '100%', border: '1px solid rgba(6, 182, 212, 0.4)', borderRadius: '2px', overflow: 'hidden', background: '#000' }}>
                <img src={cardPreviewUrl} alt="Numb Polys Whitelist Pass" style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
              <button
                type="button"
                onClick={downloadClearanceCard}
                disabled={isGeneratingCard}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#06B6D4',
                  color: '#0D0D11',
                  border: 'none',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                  fontSize: '11px',
                  cursor: 'pointer',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase'
                }}
              >
                [ ⬇ DOWNLOAD HIGH-RES WHITELIST CARD (.PNG) ]
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM SECTION: FULL 6-PHASE ALLOCATION SCHEDULE, DATES, LIVE BATCH TELEMETRY & ELIGIBILITY */}
      <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0', color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1rem' }}>
              // 6-PHASE DEPLOYMENT SCHEDULE, DATES & LIVE BATCH TELEMETRY
            </h3>
            <p style={{ color: '#A3A3A3', fontSize: '0.8rem', margin: 0 }}>
              Real-time supply telemetry, launch schedule, and wallet eligibility across all 6 deployment phases (1,111 Total Supply — Ecosystem Vault, Community Giveaways & Supply Locks included).
            </p>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#00ff80', border: '1px solid rgba(0,255,128,0.3)', padding: '4px 10px', background: 'rgba(0,255,128,0.05)', fontWeight: 'bold' }}>
            GLOBAL SUPPLY: {totalRemainingConstructs} / 1,111 REMAINING ({totalMintedGlobal} DEPLOYED)
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {phaseStatsList.map((p) => {
            const isCurrent = currentPhase === p.phase;
            const isCompleted = (currentPhase > p.phase) || p.remainingInPhase === 0;
            const isNextUp = !isCurrent && !isCompleted && (currentPhase === p.phase - 1 || (currentPhase === 0 && p.phase === 1));

            const borderColor = isCurrent
              ? (p.price === 0 ? '#00ff80' : '#06B6D4')
              : isCompleted
              ? 'rgba(255, 51, 51, 0.35)'
              : isNextUp
              ? 'rgba(6, 182, 212, 0.45)'
              : 'rgba(255, 255, 255, 0.1)';

            const bgColor = isCurrent
              ? (p.price === 0 ? 'rgba(0, 255, 128, 0.06)' : 'rgba(6, 182, 212, 0.06)')
              : isCompleted
              ? 'rgba(255, 0, 0, 0.03)'
              : 'rgba(0, 0, 0, 0.45)';

            const isCardWhitelistPhase = p.phase >= 1 && p.phase <= 3;
            const cardWlMap = isCardWhitelistPhase ? (phaseWhitelists[String(p.phase)] || {}) : {};
            const cardWalletMax = isCardWhitelistPhase && isValidInspectedWallet ? (cardWlMap[inspectedWallet] ?? 0) : 0;
            const cardLocalApps = p.phase === 2 ? wl1AppList : p.phase === 3 ? wl2AppList : [];
            const cardHasLocalPending = isValidInspectedWallet && cardLocalApps.some(a => a.wallet.toLowerCase() === inspectedWallet);

            let cardMintedByWallet = 0;
            if (isCardWhitelistPhase && isValidInspectedWallet) {
              const stored = parseInt(
                localStorage.getItem(`numbpolys_minted_phase_${p.phase}_${inspectedWallet}`) || '0',
                10
              );
              if (p.phase === 1 && stored === 0 && accountAddress?.toLowerCase() === inspectedWallet && displayOperativesCount > 0 && cardWalletMax <= 1) {
                cardMintedByWallet = displayOperativesCount;
              } else {
                cardMintedByWallet = isNaN(stored) ? 0 : stored;
              }
            }
            const cardWalletRemaining = Math.max(0, cardWalletMax - cardMintedByWallet);

            let eligibilityText = 'OPEN TO ALL OPERATORS';
            let eligibilityColor = '#06B6D4';

            if (isCardWhitelistPhase) {
              if (!isValidInspectedWallet) {
                eligibilityText = '[ ENTER OR CONNECT WALLET ]';
                eligibilityColor = '#777';
              } else if (!isRevealMode) {
                // STAGE 1 & STAGE 2: Show PENDING until Admin clicks Stage 3 Reveal On-Chain
                if (p.phase === 1) {
                  eligibilityText = cardWalletMax > 0 ? '[ ⏳ SYNDICATE LIST // PENDING REVEAL ]' : '[ ⏳ AWAITING PARTNER CSV REVEAL ]';
                  eligibilityColor = cardWalletMax > 0 ? '#06B6D4' : '#888';
                } else if (cardHasLocalPending) {
                  eligibilityText = '[ ⏳ APPLICATION PENDING REVIEW ]';
                  eligibilityColor = '#06B6D4';
                } else {
                  eligibilityText = (p.phase === 2 ? portalSettings.wl1ApplyOpen : portalSettings.wl2ApplyOpen)
                    ? '[ ○ NOT APPLIED YET ]'
                    : '[ ⏳ APPLICATIONS CLOSED // PENDING REVEAL ]';
                  eligibilityColor = '#888';
                }
              } else {
                // STAGE 3: REVEAL ON-CHAIN ACTIVE
                if (cardWalletMax <= 0) {
                  eligibilityText = '[ NOT ELIGIBLE FOR THIS PHASE ]';
                  eligibilityColor = '#ff3333';
                } else if (cardWalletRemaining <= 0) {
                  eligibilityText = `[ ALLOCATION CLAIMED (${cardWalletMax} / ${cardWalletMax}) ]`;
                  eligibilityColor = 'orange';
                } else {
                  eligibilityText = `[ ELIGIBLE // ${cardWalletRemaining} OF ${cardWalletMax} MINT(S) LEFT ]`;
                  eligibilityColor = '#00ff80';
                }
              }
            }

            return (
              <div
                key={p.phase}
                style={{
                  background: bgColor,
                  border: `1px solid ${borderColor}`,
                  padding: '14px',
                  borderRadius: '2px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  opacity: isCompleted && !isCurrent ? 0.75 : 1
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 'bold',
                      padding: '2px 6px',
                      borderRadius: '2px',
                      border: `1px solid ${isCurrent ? '#00ff80' : isCompleted ? '#ff3333' : isNextUp ? '#06B6D4' : '#555'}`,
                      color: isCurrent ? '#00ff80' : isCompleted ? '#ff3333' : isNextUp ? '#06B6D4' : '#888',
                      background: isCurrent ? 'rgba(0,255,128,0.1)' : 'transparent'
                    }}
                  >
                    {isCurrent
                      ? '● MINTING NOW'
                      : isCompleted
                      ? 'PHASE DEPLETED'
                      : isNextUp
                      ? '⚡ UP NEXT'
                      : 'UPCOMING WAVE'}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: p.price === 0 ? '#00ff80' : '#06B6D4' }}>
                    {p.price === 0 ? 'FREE MINT (0 SUI)' : `${p.price} SUI`}
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#E5E5E5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {p.name}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#A3A3A3', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                  <span>Scheduled Launch:</span>
                  <span style={{ fontWeight: 'bold', color: '#06B6D4' }}>{p.scheduledDate || 'TBA'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#A3A3A3', borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                  <span>Batch Countdown:</span>
                  <span style={{ fontWeight: 'bold', color: isCompleted && !isCurrent ? '#ff3333' : '#E5E5E5' }}>
                    {isCompleted && !isCurrent
                      ? `0 / ${p.allocation} LEFT (${p.allocation} DEPLOYED)`
                      : `${p.remainingInPhase} / ${p.allocation} REMAINING`}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: '#A3A3A3', borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                  <span>Wallet Status:</span>
                  <span style={{ fontWeight: 'bold', color: eligibilityColor, fontSize: '0.68rem' }}>
                    {eligibilityText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};