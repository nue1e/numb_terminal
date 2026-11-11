import { useState, useEffect, useCallback } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { LATEST_PACKAGE_ID, REGISTRY_ID, ADMIN_CAP_ID, V3_STATE_ID } from './config';
import registryData from './registry.json';

const ESCALATION_MATRIX = [
  { phase: 1, name: "Batch 01 // The Vanguard", price: 3.33, mist: "3330000000" },
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

// --- OFFICIAL SUI MAINNET GRAPHQL ENGINE FOR OVERSEER ---
const SUI_GRAPHQL_URL = 'https://graphql.mainnet.sui.io/graphql';

async function rawGqlCall(query: string, variables: Record<string, any> = {}): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  const response = await fetch(SUI_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: controller.signal
  });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`GraphQL HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json.errors && !json.data) {
    throw new Error(json.errors[0]?.message || 'GraphQL Error');
  }
  return json.data;
}

function extractMoveFields(rawJson: any): Record<string, any> {
  if (!rawJson || typeof rawJson !== 'object') return {};
  if (rawJson.fields && typeof rawJson.fields === 'object' && !Array.isArray(rawJson.fields)) {
    return rawJson.fields;
  }
  return rawJson;
}

const suiRpc = {
  getObject: async (id: string): Promise<any> => {
    const data = await rawGqlCall(
      `query GetAdminObj($id: SuiAddress!) {
        object(address: $id) {
          address
          asMoveObject {
            contents {
              type { repr }
              json
            }
          }
        }
      }`,
      { id: id.trim() }
    );
    const node = data?.object;
    if (!node) throw new Error(`Object ${id} not found`);
    const moveObj = node.asMoveObject || node;
    const fields = extractMoveFields(moveObj?.contents?.json);
    return {
      data: {
        objectId: node.address,
        content: {
          dataType: 'moveObject',
          type: moveObj?.contents?.type?.repr || '',
          fields
        }
      }
    };
  }
};

export function AdminDashboard() {
  const account = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [isProcessing, setIsProcessing] = useState(false);
  const [txMessage, setTxMessage] = useState<string | null>(null);

  // Overseer Live State
  const [registryFields, setRegistryFields] = useState<any>(null);
  const [v3Fields, setV3Fields] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  
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

  // --- FETCH OVERSEER DATA VIA GRAPHQL (NO AUTO-LOOP FLICKER) ---
  const fetchOverseerData = useCallback(async () => {
    setIsSyncing(true);
    try {
      if (REGISTRY_ID) {
        const regObj: any = await suiRpc.getObject(REGISTRY_ID);
        if (regObj?.data?.content?.fields) {
          setRegistryFields(regObj.data.content.fields);
        }
      }
      if (V3_STATE_ID) {
        const v3Obj: any = await suiRpc.getObject(V3_STATE_ID);
        if (v3Obj?.data?.content?.fields) {
          setV3Fields(v3Obj.data.content.fields);
        }
      }
    } catch (err) {
      console.error("Overseer sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Sync once on mount; further syncs happen only when clicking [ RE-SYNC ] or after a tx
  useEffect(() => {
    fetchOverseerData();
  }, [fetchOverseerData]);

  const rawAdminMinted = registryFields?.admin_minted ?? registryFields?.reserve_minted;
  const adminMinted = rawAdminMinted !== undefined ? parseInt(String(rawAdminMinted), 10) : (isSyncing ? null : 0);

  const rawPhase = registryFields?.phase ?? registryFields?.current_phase;
  const currentPhase = rawPhase !== undefined ? Number(rawPhase) : (isSyncing ? null : 0);

  const currentPriceMist = registryFields?.mint_price !== undefined ? String(registryFields.mint_price) : "0";
  const currentPriceSui = Number(currentPriceMist) / 1_000_000_000;
  
  const rawBalance = registryFields?.balance;
  const parsedBalance =
    typeof rawBalance === 'object' && rawBalance !== null
      ? Number(rawBalance?.fields?.value ?? rawBalance?.value ?? 0)
      : Number(rawBalance || 0);
  const treasurySui = parsedBalance / 1_000_000_000;

  const stakingActive = Boolean(v3Fields?.staking_active);

  // --- 1. SYSTEM INITIALIZATION ---
  const handleInitializeV3 = () => {
    setIsProcessing(true);
    displayMessage(`[ INITIALIZING V3 STATE... SIGN IN WALLET ]`);
    const tx = new Transaction();
    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::initialize_v3`,
      arguments: [tx.object(ADMIN_CAP_ID)],
    });
    signAndExecuteTransaction({ transaction: tx as any }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: V3 STATE CREATED. CHECK EXPLORER FOR NEW OBJECT ID ]`);
        setIsProcessing(false);
        fetchOverseerData();
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

    signAndExecuteTransaction({ transaction: tx as any }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: SYSTEM SHIFTED TO ${batchName.toUpperCase()} ]`);
        fetchOverseerData();
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

    signAndExecuteTransaction({ transaction: tx as any }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: MINTING PAUSED ]`);
        fetchOverseerData();
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
    const hasCustomPrice = pubPriceSui.trim() !== '';
    const pubMist = hasCustomPrice ? Math.floor(parseFloat(pubPriceSui) * 1_000_000_000) : -1;
    const recipient = treasuryWallet || account?.address;

    if (!recipient) return displayMessage(`[ ERROR: NO RECIPIENT WALLET FOUND ]`);

    setIsProcessing(true);
    displayMessage(`[ SYNCING GLOBAL ECONOMICS... ]`);

    const tx = new Transaction();
    
    if (hasCustomPrice && pubMist >= 0) {
      tx.moveCall({
        target: `${LATEST_PACKAGE_ID}::operative::update_public_price`,
        arguments: [tx.object(ADMIN_CAP_ID), tx.object(REGISTRY_ID), tx.pure.u64(pubMist)],
      });
    }

    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::admin_update_v3_state`,
      arguments: [
        tx.object(ADMIN_CAP_ID), tx.object(V3_STATE_ID),
        tx.pure.u64(0), tx.pure.u64(0),
        tx.pure.u64(Number(royaltyBps)), tx.pure.u8(Number(royaltyMode)),
        tx.pure.address(recipient)
      ],
    });

    signAndExecuteTransaction({ transaction: tx as any }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: ECONOMICS & ROYALTIES SYNCED ]`);
        fetchOverseerData(); 
        setIsProcessing(false);
      },
      onError: (err) => { 
        console.error(err); 
        displayMessage(`[ ERROR: ECONOMIC SYNC FAILED. ${err.message} ]`); 
        setIsProcessing(false); 
      },
    });
  };

  // --- 4. GOD MODE OVERRIDES ---
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

      signAndExecuteTransaction({ transaction: tx as any }, {
        onSuccess: () => {
          displayMessage(`[ SUCCESS: METADATA PERMANENTLY REWRITTEN ]`);
          setNewUrl(''); 
          setIsProcessing(false);
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
    signAndExecuteTransaction({ transaction: tx as any }, { 
      onSuccess: () => { displayMessage(`[ TREASURY WITHDRAWN ]`); fetchOverseerData(); setIsProcessing(false); }, 
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
    signAndExecuteTransaction({ transaction: tx as any }, { 
      onSuccess: () => { displayMessage(`[ VAULT CLAIMED ]`); fetchOverseerData(); setIsProcessing(false); }, 
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
    signAndExecuteTransaction({ transaction: tx as any }, { 
      onSuccess: () => { displayMessage(`[ STAKING TOGGLED ]`); fetchOverseerData(); setIsProcessing(false); }, 
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
          <button onClick={() => fetchOverseerData()} disabled={isSyncing} style={{ background: 'transparent', color: '#06B6D4', border: '1px solid #06B6D4', padding: '4px 12px', fontSize: '10px', cursor: isSyncing ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            {isSyncing ? '[ SYNCING... ]' : '[ RE-SYNC ]'}
          </button>
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
          <span style={{ color: '#A3A3A3' }}>Active Mint Price:</span>
          <span style={{ fontWeight: 'bold', color: currentPriceSui === 0 ? '#00ff80' : '#06B6D4' }}>
            {currentPriceSui === 0 ? 'FREE MINT (0 SUI)' : `${currentPriceSui} SUI`}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: '#A3A3A3' }}>Staking Protocol:</span>
          <span style={{ color: stakingActive ? '#00ff00' : '#ff3333' }}>{stakingActive ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#A3A3A3' }}>Creator Vault / Treasury:</span>
          <span style={{ color: '#E5E5E5' }}>{adminMinted ?? '...'} / 111 | {treasurySui} SUI</span>
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

        {/* DEDICATED BATCH 01 FREE MINT vs PAID (3.33 SUI) TOGGLE */}
        <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(6, 182, 212, 0.3)', padding: '12px', marginBottom: '1rem', borderRadius: '2px' }}>
          <div style={{ fontSize: '0.75rem', color: '#06B6D4', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '0.05em' }}>
            // BATCH 01 (THE VANGUARD) — LIVE PRICE TOGGLE (KEEPS BATCH 01 NAME & SUPPLY CONTINUOUS)
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleUpdateBatch(1, "0", "Batch 01 // The Vanguard [FREE MINT]")}
              disabled={isProcessing}
              style={{ flex: 1, padding: '10px', background: (currentPhase === 1 && currentPriceSui === 0) ? 'rgba(0, 255, 128, 0.2)' : 'rgba(255,255,255,0.03)', color: (currentPhase === 1 && currentPriceSui === 0) ? '#00ff80' : '#E5E5E5', border: (currentPhase === 1 && currentPriceSui === 0) ? '1px solid #00ff80' : '1px solid rgba(255,255,255,0.15)', cursor: isProcessing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 'bold' }}
            >
              [ BATCH 01: FREE MINT (0 SUI) ]
            </button>
            <button
              onClick={() => handleUpdateBatch(1, "3330000000", "Batch 01 // The Vanguard [3.33 SUI]")}
              disabled={isProcessing}
              style={{ flex: 1, padding: '10px', background: (currentPhase === 1 && currentPriceMist === "3330000000") ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.03)', color: (currentPhase === 1 && currentPriceMist === "3330000000") ? '#06B6D4' : '#E5E5E5', border: (currentPhase === 1 && currentPriceMist === "3330000000") ? '1px solid #06B6D4' : '1px solid rgba(255,255,255,0.15)', cursor: isProcessing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 'bold' }}
            >
              [ BATCH 01: PAID (3.33 SUI) ]
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
          {ESCALATION_MATRIX.map((batch) => (
            <button 
              key={batch.phase}
              onClick={() => handleUpdateBatch(batch.phase, batch.mist, batch.name)}
              disabled={isProcessing}
              style={{ padding: '12px', background: (currentPhase === batch.phase && currentPriceMist === batch.mist) ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.02)', color: (currentPhase === batch.phase && currentPriceMist === batch.mist) ? '#06B6D4' : '#E5E5E5', border: (currentPhase === batch.phase && currentPriceMist === batch.mist) ? '1px solid #06B6D4' : '1px solid rgba(255,255,255,0.1)', cursor: isProcessing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', textAlign: 'left', borderRadius: '2px', display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              <span style={{ fontWeight: 'bold' }}>{batch.name.split(' // ')[0]}</span>
              <span style={{ fontSize: '0.7rem', color: (currentPhase === batch.phase && currentPriceMist === batch.mist) ? '#E5E5E5' : '#888' }}>Set Price: {batch.price} SUI</span>
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
            <button key={num} onClick={() => handleBatchMintReserve(num)} disabled={isProcessing} style={{ flex: '1', padding: '8px', background: 'transparent', color: '#E5E5E5', border: '1px solid #444', cursor: 'pointer' }}>{num}</button>
          ))}
        </div>
      </div>
    </div>
  );
}