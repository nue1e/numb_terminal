import React, { useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientQuery
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { LATEST_PACKAGE_ID, REGISTRY_ID, ADMIN_CAP_ID, V3_STATE_ID } from './config';
import registryData from './registry.json';

const ADMIN_ADDRESS = '0xdb67bfb984df37d73755da48c166689e7d584b17cf6c23a680cb05d90f9653fb';

const ESCALATION_MATRIX = [
  { phase: 1, name: "Batch 01 // The Vanguard", price: 3, mist: "3000000000" },
  { phase: 2, name: "Batch 02 // The Recon Protocol", price: 4, mist: "4000000000" },
  { phase: 3, name: "Batch 03 // The Iron Grid", price: 5, mist: "5000000000" },
  { phase: 4, name: "Batch 04 // The Static Runners", price: 6, mist: "6000000000" },
  { phase: 5, name: "Batch 05 // The Obsidian Core", price: 8, mist: "8000000000" },
  { phase: 6, name: "Batch 06 // The Crimson Shift", price: 10, mist: "10000000000" },
  { phase: 7, name: "Batch 07 // The Earthen Cartel", price: 12, mist: "12000000000" },
  { phase: 8, name: "Batch 08 // The Phantom Asset", price: 15, mist: "15000000000" },
  { phase: 9, name: "Batch 09 // The Golden Hierarchy", price: 18, mist: "18000000000" },
  { phase: 10, name: "Batch 10 // The Mythic Unknown", price: 20, mist: "20000000000" }
];

export function AdminDashboard() {
  const account = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [isProcessing, setIsProcessing] = useState(false);
  const [txMessage, setTxMessage] = useState<string | null>(null);
  
  // Economics State
  const [pubPriceSui, setPubPriceSui] = useState<string>('');
  const [royaltyBps, setRoyaltyBps] = useState<string>('500');
  const [royaltyMode, setRoyaltyMode] = useState<string>('0');
  const [treasuryWallet, setTreasuryWallet] = useState<string>('');

  // God Mode State
  const [overrideType, setOverrideType] = useState<'TRAIT' | 'BASE'>('TRAIT');
  const [targetId, setTargetId] = useState('');
  const [traitCategory, setTraitCategory] = useState('Headwear');
  const [newUrl, setNewUrl] = useState('');
  const [newLoreName, setNewLoreName] = useState('');

  const displayMessage = (msg: string) => {
    setTxMessage(msg);
    setTimeout(() => setTxMessage(null), 12000);
  };

  const { data: registryObj, refetch: refetchRegistry } = useSuiClientQuery(
    'getObject', { id: REGISTRY_ID, options: { showContent: true } }
  );

  const { data: v3StateObj, refetch: refetchV3 } = useSuiClientQuery(
    'getObject', { id: V3_STATE_ID, options: { showContent: true } },
    { enabled: !!V3_STATE_ID }
  );

  const fields = (registryObj?.data?.content as any)?.fields;
  const adminMinted = fields?.admin_minted !== undefined ? parseInt(fields.admin_minted) : null;
  const currentPhase = fields?.phase !== undefined ? Number(fields.phase) : null;
  
  const rawBalance = fields?.balance;
  const treasurySui = (rawBalance?.fields?.value ? Number(rawBalance.fields.value) : Number(rawBalance || 0)) / 1_000_000_000;

  const v3Fields = (v3StateObj?.data?.content as any)?.fields;
  const stakingActive = v3Fields?.staking_active;

  // --- 1. SYSTEM INITIALIZATION ---
  const handleInitializeV3 = () => {
    setIsProcessing(true);
    displayMessage(`[ INITIALIZING V3 STATE... SIGN IN WALLET ]`);
    const tx = new Transaction();
    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::initialize_v3`,
      arguments: [tx.object(ADMIN_CAP_ID)],
    });
    signAndExecuteTransaction({ transaction: tx }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: V3 STATE CREATED. CHECK EXPLORER FOR NEW OBJECT ID ]`);
        setIsProcessing(false);
      },
      onError: (err) => {
        console.error(err);
        displayMessage(`[ ERROR: V3 INITIALIZATION FAILED. ${err.message} ]`);
        setIsProcessing(false);
      },
    });
  };

  // --- 2. THE ESCALATION MATRIX BATCH SWITCHBOARD ---
  const handleUpdateBatch = (phaseNum: number, priceMist: string, batchName: string) => {
    setIsProcessing(true);
    displayMessage(`[ ACTIVATING ${batchName.toUpperCase()}... ]`);
    
    const tx = new Transaction();
    
    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::update_phase`,
      arguments: [tx.object(ADMIN_CAP_ID), tx.object(REGISTRY_ID), tx.pure.u8(phaseNum)],
    });

    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::update_public_price`,
      arguments: [tx.object(ADMIN_CAP_ID), tx.object(REGISTRY_ID), tx.pure.u64(priceMist)],
    });

    signAndExecuteTransaction({ transaction: tx }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: SYSTEM SHIFTED TO ${batchName.toUpperCase()} ]`);
        refetchRegistry();
        setIsProcessing(false);
      },
      onError: (err) => { 
        displayMessage(`[ ERROR: BATCH OVERRIDE FAILED. ${err.message} ]`); 
        setIsProcessing(false); 
      },
    });
  };

  const handlePause = () => {
    setIsProcessing(true);
    displayMessage(`[ PAUSING DEPLOYMENTS... ]`);
    
    const tx = new Transaction();
    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::update_phase`,
      arguments: [tx.object(ADMIN_CAP_ID), tx.object(REGISTRY_ID), tx.pure.u8(0)],
    });

    signAndExecuteTransaction({ transaction: tx }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: MINTING PAUSED ]`);
        refetchRegistry();
        setIsProcessing(false);
      },
      onError: (err) => { 
        displayMessage(`[ ERROR: PAUSE FAILED. ${err.message} ]`); 
        setIsProcessing(false); 
      },
    });
  };

  // --- 3. DYNAMIC ECONOMICS (ROYALTIES & CUSTOM PRICE) ---
  const handleUpdateEconomics = () => {
    const pubMist = Math.floor(parseFloat(pubPriceSui || "0") * 1_000_000_000);
    const recipient = treasuryWallet || account?.address;

    if (!recipient) return displayMessage(`[ ERROR: NO RECIPIENT WALLET FOUND ]`);

    setIsProcessing(true);
    displayMessage(`[ SYNCING GLOBAL ECONOMICS... ]`);

    const tx = new Transaction();
    
    // Only update price if a custom value is typed
    if (pubMist > 0) {
      tx.moveCall({
        target: `${LATEST_PACKAGE_ID}::operative::update_public_price`,
        arguments: [tx.object(ADMIN_CAP_ID), tx.object(REGISTRY_ID), tx.pure.u64(pubMist)],
      });
    }

    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::admin_update_v3_state`,
      arguments: [
        tx.object(ADMIN_CAP_ID), tx.object(V3_STATE_ID),
        tx.pure.u64(0), tx.pure.u64(0), // Removed GTD/FCFS parameters to keep contract format unbroken
        tx.pure.u64(Number(royaltyBps)), tx.pure.u8(Number(royaltyMode)),
        tx.pure.address(recipient)
      ],
    });

    signAndExecuteTransaction({ transaction: tx }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: ECONOMICS & ROYALTIES SYNCED ]`);
        refetchRegistry(); refetchV3(); setIsProcessing(false);
      },
      onError: (err) => { 
        console.error(err); 
        displayMessage(`[ ERROR: ECONOMIC SYNC FAILED. ${err.message} ]`); 
        setIsProcessing(false); 
      },
    });
  };

  // --- 4. GOD MODE OVERRIDES (STREAMLINED) ---
  const handleGodMode = async () => {
    const cleanTargetId = targetId.trim();
    const cleanCategory = traitCategory.trim();
    const cleanLoreName = newLoreName.trim();
    const cleanUrl = newUrl.trim();

    if (!cleanTargetId.startsWith('0x') || cleanTargetId.length !== 66) {
      return displayMessage(`[ ERROR: INVALID OPERATIVE ID (Must be 66 characters starting with 0x) ]`);
    }
    
    setIsProcessing(true);
    displayMessage(`[ PREPARING TX: Awaiting Wallet Signature... ]`);

    try {
      const tx = new Transaction();
      
      if (overrideType === 'TRAIT') {
        tx.moveCall({
          target: `${LATEST_PACKAGE_ID}::operative::admin_update_trait_image`,
          arguments: [tx.object(ADMIN_CAP_ID), tx.object(cleanTargetId), tx.pure.string(cleanCategory), tx.pure.string(cleanUrl)],
        });
      } else {
        tx.moveCall({
          target: `${LATEST_PACKAGE_ID}::operative::admin_update_operative_metadata`,
          arguments: [tx.object(ADMIN_CAP_ID), tx.object(cleanTargetId), tx.pure.string(cleanLoreName), tx.pure.string(cleanUrl)],
        });
      }

      signAndExecuteTransaction({ transaction: tx }, {
        onSuccess: () => {
          displayMessage(`[ SUCCESS: METADATA PERMANENTLY REWRITTEN ]`);
          setNewUrl(''); setIsProcessing(false);
        },
        onError: (err) => { 
          console.error(err); 
          displayMessage(`[ ERROR: WALLET REJECTED. ${err.message} ]`); 
          setIsProcessing(false); 
        },
      });

    } catch (err: any) {
      console.error(err);
      displayMessage(`[ FATAL SYSTEM ERROR: ${err.message} ]`);
      setIsProcessing(false);
    }
  };

  // --- 5. VAULT & TREASURY ---
  const handleWithdraw = () => {
    setIsProcessing(true);
    const tx = new Transaction();
    tx.moveCall({ target: `${LATEST_PACKAGE_ID}::operative::withdraw_funds`, arguments: [tx.object(ADMIN_CAP_ID), tx.object(REGISTRY_ID)] });
    signAndExecuteTransaction({ transaction: tx }, { 
      onSuccess: () => { displayMessage(`[ TREASURY WITHDRAWN ]`); refetchRegistry(); setIsProcessing(false); }, 
      onError: (err) => { displayMessage(`[ ERROR: ${err.message} ]`); setIsProcessing(false); } 
    });
  };

  const handleBatchMintReserve = (count: number) => {
    const current = adminMinted || 0;
    if (current >= 111) return displayMessage(`[ ERROR: VAULT DEPLETED ]`);
    
    setIsProcessing(true);
    const tx = new Transaction();
    const available = Math.min(count, 111 - current);

    for (let offset = 0; offset < available; offset++) {
      const opData = registryData[current + offset];
      if (!opData) break;
      const traitCategories = Object.keys(opData.display_traits).filter(k => k !== 'Rarity Tier');
      const traitNames = traitCategories.map(k => opData.display_traits[k as keyof typeof opData.display_traits]);
      const traitUrls = traitCategories.map(k => (opData.walrus_urls as any)[k === 'Jewelry' ? 'Jeweleries' : k] || "None");

      tx.moveCall({
        target: `${LATEST_PACKAGE_ID}::operative::claim_reserve`,
        arguments: [
          tx.object(ADMIN_CAP_ID), tx.object(REGISTRY_ID),
          tx.pure.string(opData.lore_name), tx.pure.string(opData.display_traits['Rarity Tier']), tx.pure.string((opData.walrus_urls as any)['Base Body'] || ""),
          tx.pure.vector('string', traitCategories), tx.pure.vector('string', traitNames), tx.pure.vector('string', traitUrls),
        ],
      });
    }
    signAndExecuteTransaction({ transaction: tx }, { 
      onSuccess: () => { displayMessage(`[ VAULT CLAIMED ]`); refetchRegistry(); setIsProcessing(false); }, 
      onError: (err) => { displayMessage(`[ ERROR: ${err.message} ]`); setIsProcessing(false); } 
    });
  };

  const handleToggleStaking = () => {
    setIsProcessing(true);
    const tx = new Transaction();
    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::toggle_staking`,
      arguments: [tx.object(ADMIN_CAP_ID), tx.object(V3_STATE_ID), tx.pure.bool(!stakingActive)],
    });
    signAndExecuteTransaction({ transaction: tx }, { 
      onSuccess: () => { displayMessage(`[ STAKING TOGGLED ]`); refetchV3(); setIsProcessing(false); }, 
      onError: (err) => { displayMessage(`[ ERROR: ${err.message} ]`); setIsProcessing(false); } 
    });
  };

  if (!account) return <div style={{ color: '#ff3333', textAlign: 'center', marginTop: '2rem' }}>[ ERROR: WALLET DISCONNECTED ]</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '750px', margin: '0 auto', fontFamily: 'monospace' }}>
      {txMessage && (
        <div style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: txMessage.includes('ERROR') || txMessage.includes('FAILED') || txMessage.includes('REJECTED') ? 'rgba(255, 0, 0, 0.15)' : 'rgba(6, 182, 212, 0.15)', border: `1px solid ${txMessage.includes('ERROR') || txMessage.includes('FAILED') || txMessage.includes('REJECTED') ? '#ff3333' : '#06B6D4'}`, color: txMessage.includes('ERROR') || txMessage.includes('FAILED') || txMessage.includes('REJECTED') ? '#ff3333' : '#06B6D4' }}>
          {txMessage}
        </div>
      )}

      {/* SYSTEM STATUS */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: '#06B6D4' }}>// OMNI-STATE STATUS</h3>
          <button onClick={() => {refetchRegistry(); refetchV3();}} style={{ background: 'transparent', color: '#06B6D4', border: '1px solid #06B6D4', padding: '4px 12px', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>[ RE-SYNC ]</button>
        </div>
        
        {!V3_STATE_ID && (
          <button onClick={handleInitializeV3} disabled={isProcessing} style={{ width: '100%', padding: '10px', background: '#ff3333', color: '#000', fontWeight: 'bold', border: 'none', marginBottom: '1rem', cursor: 'pointer' }}>
            ⚠️ INITIALIZE V3 MASTER STATE (DO THIS ONCE) ⚠️
          </button>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: '#A3A3A3' }}>Active Mint Phase:</span>
          <span style={{ fontWeight: 'bold', color: currentPhase === null ? '#ffff00' : currentPhase === 0 ? '#ff3333' : '#00ff00' }}>
            {currentPhase === null ? 'SYNCING...' : currentPhase === 0 ? 'PAUSED' : `BATCH ${currentPhase.toString().padStart(2, '0')} LIVE`}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: '#A3A3A3' }}>Staking Protocol:</span>
          <span style={{ color: stakingActive ? '#00ff00' : '#ff3333' }}>{stakingActive ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#A3A3A3' }}>Creator Vault / Treasury:</span>
          <span style={{ color: '#E5E5E5' }}>{adminMinted} / 111 | {treasurySui} SUI</span>
        </div>
      </div>

      {/* THE ESCALATION MATRIX SWITCHBOARD */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4' }}>// ESCALATION MATRIX SWITCHBOARD</h3>
        <p style={{ color: '#A3A3A3', fontSize: '0.75rem', marginBottom: '1rem' }}>Clicking a batch immediately updates the active phase and overrides the public mint price on-chain.</p>
        
        <button 
          onClick={handlePause} 
          disabled={isProcessing} 
          style={{ width: '100%', padding: '12px', background: currentPhase === 0 ? 'rgba(255,51,51,0.25)' : 'rgba(255,51,51,0.05)', color: '#ff3333', border: '1px dashed #ff3333', cursor: 'pointer', marginBottom: '1rem', fontWeight: 'bold' }}
        >
          [ EMERGENCY MINT PAUSE (PHASE 0) ]
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
          {ESCALATION_MATRIX.map((batch) => (
            <button 
              key={batch.phase}
              onClick={() => handleUpdateBatch(batch.phase, batch.mist, batch.name)}
              disabled={isProcessing}
              style={{ padding: '12px', background: currentPhase === batch.phase ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.02)', color: currentPhase === batch.phase ? '#06B6D4' : '#E5E5E5', border: currentPhase === batch.phase ? '1px solid #06B6D4' : '1px solid rgba(255,255,255,0.1)', cursor: isProcessing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', textAlign: 'left', borderRadius: '2px', display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              <span style={{ fontWeight: 'bold' }}>{batch.name.split(' // ')[0]}</span>
              <span style={{ fontSize: '0.7rem', color: currentPhase === batch.phase ? '#E5E5E5' : '#888' }}>Set Price: {batch.price} SUI</span>
            </button>
          ))}
        </div>
      </div>

      {/* DYNAMIC ECONOMICS */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4' }}>// ROYALTY ENGINE & CUSTOM OVERRIDE</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
          <input type="number" value={pubPriceSui} onChange={e => setPubPriceSui(e.target.value)} placeholder="Custom Price Override (Optional)" style={{ background: 'transparent', border: '1px solid #444', color: '#E5E5E5', padding: '8px' }} />
          <input type="number" value={royaltyBps} onChange={e => setRoyaltyBps(e.target.value)} placeholder="Royalty BPS (500 = 5%)" style={{ background: 'transparent', border: '1px solid #444', color: '#E5E5E5', padding: '8px' }} />
          <select value={royaltyMode} onChange={e => setRoyaltyMode(e.target.value)} style={{ background: 'transparent', border: '1px solid #444', color: '#E5E5E5', padding: '8px' }}>
            <option value="0">Mode 0: Minters Receive</option>
            <option value="1">Mode 1: Treasury Receives</option>
          </select>
        </div>
        <input type="text" value={treasuryWallet} onChange={e => setTreasuryWallet(e.target.value)} placeholder="Treasury Wallet (Defaults to Admin)" style={{ width: '100%', background: 'transparent', border: '1px solid #444', color: '#E5E5E5', padding: '8px', marginBottom: '1rem', boxSizing: 'border-box' }} />
        <button onClick={handleUpdateEconomics} disabled={isProcessing} style={{ width: '100%', padding: '10px', background: '#E5E5E5', color: '#0D0D11', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>SYNC GLOBAL ECONOMICS</button>
      </div>

      {/* GOD MODE OVERRIDE */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #06B6D4', padding: '1.5rem', boxShadow: '0 0 15px rgba(6,182,212,0.1)' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4' }}>// GOD MODE: METADATA OVERRIDE</h3>
        <select value={overrideType} onChange={e => setOverrideType(e.target.value as 'TRAIT' | 'BASE')} style={{ width: '100%', background: 'transparent', border: '1px solid #06B6D4', color: '#E5E5E5', padding: '8px', marginBottom: '0.5rem', boxSizing: 'border-box' }}>
          <option value="TRAIT">Override Specific Trait Link</option>
          <option value="BASE">Override Base Body / Lore Name</option>
        </select>
        <input type="text" value={targetId} onChange={e => setTargetId(e.target.value)} placeholder="Operative Object ID (0x...)" style={{ width: '100%', background: 'transparent', border: '1px solid #444', color: '#E5E5E5', padding: '8px', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
        
        {overrideType === 'TRAIT' ? (
          <input type="text" value={traitCategory} onChange={e => setTraitCategory(e.target.value)} placeholder="Trait Category (e.g. Headwear)" style={{ width: '100%', background: 'transparent', border: '1px solid #444', color: '#E5E5E5', padding: '8px', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
        ) : (
          <input type="text" value={newLoreName} onChange={e => setNewLoreName(e.target.value)} placeholder="New Lore Name" style={{ width: '100%', background: 'transparent', border: '1px solid #444', color: '#E5E5E5', padding: '8px', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
        )}
        
        <input type="text" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="New Image URL (Walrus / IPFS)" style={{ width: '100%', background: 'transparent', border: '1px solid #444', color: '#E5E5E5', padding: '8px', marginBottom: '1rem', boxSizing: 'border-box' }} />
        <button onClick={handleGodMode} disabled={isProcessing} style={{ width: '100%', padding: '10px', background: 'transparent', color: '#06B6D4', border: '1px solid #06B6D4', cursor: 'pointer', fontWeight: 'bold' }}>EXECUTE OVERRIDE</button>
      </div>

      {/* QUICK ACTIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <button onClick={handleWithdraw} disabled={isProcessing || treasurySui === 0} style={{ padding: '12px', background: 'transparent', color: '#A3A3A3', border: '1px solid #444', cursor: 'pointer' }}>WITHDRAW TREASURY</button>
        <button onClick={handleToggleStaking} disabled={isProcessing} style={{ padding: '12px', background: 'transparent', color: '#A3A3A3', border: '1px solid #444', cursor: 'pointer' }}>{stakingActive ? 'PAUSE STAKING' : 'ACTIVATE STAKING'}</button>
      </div>
      
      {/* VAULT MINTS */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem', marginTop: '0.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#A3A3A3' }}>// ADMIN RESERVE MINTS</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[1, 5, 10, 25].map(num => (
            <button key={num} onClick={() => handleBatchMintReserve(num)} disabled={isProcessing} style={{ flex: 1, padding: '8px', background: 'transparent', color: '#E5E5E5', border: '1px solid #444', cursor: 'pointer' }}>{num}</button>
          ))}
        </div>
      </div>
    </div>
  );
}