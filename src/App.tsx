import React, { useState, useEffect } from 'react';
import { 
  ConnectButton, 
  useCurrentAccount, 
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery,
  SuiClientProvider, 
  WalletProvider
} from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { Canvas } from '@react-three/fiber';
import { PACKAGE_ID } from './config';
import { LAYER_ORDER, generateRandomOperative } from './traits';
import { LayerStacker } from './LayerStacker';
import GridBackground from './components/GridBackground';
import '@mysten/dapp-kit/dist/index.css';

// ANTI-SPAM FIX: Instructs React Query to silently retry if it ever hits a 429
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30000, 
      retry: 4,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
  },
});

// THE ONLY RELIABLE LOCALHOST RPC
const networks = {
  testnet: { url: 'https://sui-testnet-endpoint.blockvision.org' }
} as any;

function TerminalUI() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [activeView, setActiveView] = useState<'GENERATOR' | 'ARMORY'>('GENERATOR');
  const [activeTraits, setActiveTraits] = useState<string[]>(generateRandomOperative());
  
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [equippedGear, setEquippedGear] = useState<Record<string, { objectId: string; imageUrl: string }>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const [isProcessingTx, setIsProcessingTx] = useState(false);
  const [txMessage, setTxMessage] = useState<string | null>(null);

  const displayTxMessage = (msg: string) => {
    setTxMessage(msg);
    setTimeout(() => setTxMessage(null), 6000);
  };

  // 1. Fetch Operatives
  const { data: ownedOperatives, refetch: refetchOperatives } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address as string,
      filter: { StructType: `${PACKAGE_ID}::operative::Operative` },
      options: { showContent: true },
    },
    { enabled: !!account }
  );

  // 2. Fetch Traits (Only when Armory is active to save requests)
  const { data: looseTraits, refetch: refetchTraits } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address as string,
      filter: { StructType: `${PACKAGE_ID}::operative::Trait` },
      options: { showContent: true },
    },
    { enabled: !!account && activeView === 'ARMORY' }
  );

  // Auto-select first operative on load
  useEffect(() => {
    if (ownedOperatives?.data?.length && !selectedOpId) {
      setSelectedOpId(ownedOperatives.data[0].data?.objectId || null);
    }
  }, [ownedOperatives, selectedOpId]);

  const activeLoadRef = React.useRef<string | null>(null);

  // Custom retry logic for manual RPC calls
  const retryRpc = async <T,>(fn: () => Promise<T>, retries = 5, delay = 1500): Promise<T> => {
    try {
      return await fn();
    } catch (err: any) {
      if (retries > 0 && (err?.status === 429 || err?.message?.includes('429') || err?.toString().includes('429'))) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return retryRpc(fn, retries - 1, delay * 1.5);
      }
      throw err;
    }
  };

  // 3. Fetch Equipped Gear
  const loadEquippedTraits = async (opId: string) => {
    activeLoadRef.current = opId;
    setIsLoadingSlots(true);
    setEquippedGear({}); 

    try {
      // ANTI-BURST DELAY: Wait 1 second to let initial wallet queries clear BlockVision
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const dynamicFields = await retryRpc(() => suiClient.getDynamicFields({ parentId: opId }));
      if (activeLoadRef.current !== opId) return;

      const gearMap: Record<string, { objectId: string; imageUrl: string }> = {};

      if (dynamicFields.data.length > 0) {
        const traitIds = dynamicFields.data.map(field => field.objectId);
        
        // ANTI-BURST DELAY: Wait 500ms before fetching the actual objects
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const childObjects = await retryRpc(() => suiClient.multiGetObjects({
          ids: traitIds,
          options: { showContent: true }
        }));

        if (activeLoadRef.current !== opId) return;

        for (const childObject of childObjects) {
          const traitData = (childObject.data?.content as any)?.fields;
          if (traitData && traitData.category) {
            gearMap[traitData.category] = {
              objectId: childObject.data!.objectId,
              imageUrl: traitData.image_url,
            };
          }
        }
      }

      if (activeLoadRef.current === opId) {
        setEquippedGear(gearMap);
      }
    } catch (err) {
      console.error('Failed to load equipped gear after retries:', err);
    } finally {
      if (activeLoadRef.current === opId) {
        setIsLoadingSlots(false);
      }
    }
  };

  // Fire gear fetch when operative changes
  useEffect(() => {
    if (selectedOpId) {
      loadEquippedTraits(selectedOpId);
    }
  }, [selectedOpId]);

  // THE ULTIMATE FIX: Mechanical Staggering
  // This physically forces the app to pause between requests so it never exceeds BlockVision's limit
  const refreshTerminalState = async () => {
    console.log("⚡ [STATE SYNC] Transaction confirmed, updating HUD sequentially...");
    
    if (selectedOpId) {
      await loadEquippedTraits(selectedOpId);
    }
    
    // Strict 1.5 second pause
    await new Promise(resolve => setTimeout(resolve, 1500));
    await refetchTraits();
    
    // Strict 1.5 second pause
    await new Promise(resolve => setTimeout(resolve, 1500));
    await refetchOperatives();
  };

  const getOperativePreviewLayers = (): string[] => {
    const activeOp = ownedOperatives?.data.find((o) => o.data?.objectId === selectedOpId);
    const baseImage = (activeOp?.data?.content as any)?.fields?.base_image || 'Textured_Vantablack_6.5.png';

    return LAYER_ORDER.map((slot) => {
      if (slot === 'base body') return `base body/${baseImage}`;
      if (slot === 'background') {
        return equippedGear['background'] ? `background/${equippedGear['background'].imageUrl}` : 'background/Vantablack_Void_1.png';
      }
      if (equippedGear[slot]) return `${slot}/${equippedGear[slot].imageUrl}`;
      return `${slot}/None_No_${slot}.png`;
    });
  };

  const handleEquip = (traitId: string, category: string) => {
    if (!selectedOpId || isProcessingTx) return;
    if (equippedGear[category]) {
      displayTxMessage(`[ ERROR: SLOT ${category.toUpperCase()} IS ALREADY OCCUPIED ]`);
      return;
    }

    setIsProcessingTx(true);
    displayTxMessage(`[ PROCESSING EQUIP TRANSACTION... SIGN IN WALLET ]`);
    
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::operative::equip_trait`,
      arguments: [tx.object(selectedOpId), tx.object(traitId)],
    });

    signAndExecuteTransaction(
      { transaction: tx },
      {
        onSuccess: async () => {
          displayTxMessage(`[ SUCCESS: GEAR EQUIPPED ]`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for blockchain finality
          await refreshTerminalState();
          setIsProcessingTx(false);
        },
        onError: (err) => {
          console.error(err);
          displayTxMessage(`[ ERROR: TRANSACTION REJECTED OR FAILED ]`);
          setIsProcessingTx(false);
        },
      }
    );
  };

  const handleUnequip = (category: string) => {
    if (!selectedOpId || isProcessingTx) return;

    setIsProcessingTx(true);
    displayTxMessage(`[ PROCESSING UNEQUIP TRANSACTION... SIGN IN WALLET ]`);

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::operative::unequip_trait`,
      arguments: [tx.object(selectedOpId), tx.pure.string(category)],
    });

    signAndExecuteTransaction(
      { transaction: tx },
      {
        onSuccess: async () => {
          displayTxMessage(`[ SUCCESS: GEAR UNEQUIPPED ]`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for blockchain finality
          await refreshTerminalState();
          setIsProcessingTx(false);
        },
        onError: (err) => {
          console.error(err);
          displayTxMessage(`[ ERROR: TRANSACTION REJECTED OR FAILED ]`);
          setIsProcessingTx(false);
        },
      }
    );
  };

  const handleReroll = () => setActiveTraits(generateRandomOperative());

  const mintOperative = () => {
    if (!account || isProcessingTx) {
      if (!account) displayTxMessage("[ ERROR: PLEASE CONNECT WALLET ]");
      return;
    }
    
    setIsProcessingTx(true);
    displayTxMessage(`[ PREPARING MINT TRANSACTION... PLEASE SIGN IN WALLET ]`);

    const tx = new Transaction();

    const getTraitFile = (category: string) => {
      const match = activeTraits.find((t) => t.startsWith(`${category}/`));
      return match ? match.split('/')[1] : `None_No_${category}.png`;
    };

    tx.moveCall({
      target: `${PACKAGE_ID}::operative::mint_bundle`,
      arguments: [
        tx.pure.u64(Date.now()),
        tx.pure.string(getTraitFile('base body')),
        tx.pure.string(getTraitFile('background')),
        tx.pure.string(getTraitFile('face')),
        tx.pure.string(getTraitFile('eye')),
        tx.pure.string(getTraitFile('outfits')),
        tx.pure.string(getTraitFile('jewelries')),
        tx.pure.string(getTraitFile('headwear')),
        tx.pure.string(getTraitFile('eyewear')),
      ],
    });

    signAndExecuteTransaction(
      { transaction: tx },
      {
        onSuccess: async () => {
          displayTxMessage(`[ SUCCESS: CONSTRUCT DEPLOYED ON-CHAIN ]`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for blockchain finality
          await refreshTerminalState();
          setIsProcessingTx(false);
        },
        onError: (err) => {
          console.error(err);
          displayTxMessage(`[ ERROR: MINT TRANSACTION REJECTED OR FAILED ]`);
          setIsProcessingTx(false);
        },
      }
    );
  };

  const displayOperatives = ownedOperatives?.data || [];

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', backgroundColor: '#0D0D11', color: '#E5E5E5', fontFamily: 'var(--font-geist-sans), monospace', boxSizing: 'border-box', overflowX: 'hidden' }}>
      
      <style>{`
        .hud-frame {
          position: relative;
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px;
        }
        .hud-frame::before, .hud-frame::after, .hud-corner-bottom::before, .hud-corner-bottom::after {
          content: '';
          position: absolute;
          width: 20px;
          height: 20px;
          border-color: #06B6D4;
          border-style: solid;
        }
        .hud-frame::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
        .hud-frame::after { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
        .hud-corner-bottom::before { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
        .hud-corner-bottom::after { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

        .neon-wallet-override button {
          background-color: rgba(255, 255, 255, 0.03) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          color: #E5E5E5 !important;
          font-family: inherit !important;
          border-radius: 2px !important;
          backdrop-filter: blur(8px) !important;
          transition: all 0.3s ease !important;
        }
        .neon-wallet-override button:hover {
          background-color: #E5E5E5 !important;
          color: #0D0D11 !important;
          border-color: #E5E5E5 !important;
        }

        .crt-overlay {
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(6, 182, 212, 0.01), rgba(0, 0, 255, 0.02));
          background-size: 100% 3px, 3px 100%;
          z-index: 9999;
          pointer-events: none;
          opacity: 0.2;
        }
      `}</style>

      <div className="crt-overlay" />

      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
        <Canvas camera={{ position: [0, 0, 8], fov: 50 }} style={{ width: '100%', height: '100%' }}>
          <ambientLight intensity={1} />
          <GridBackground />
        </Canvas>
      </div>

      <div style={{ padding: '1.5rem', position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
          <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.2rem', letterSpacing: '2px', color: '#ffffff' }}>NUMB_POLYS // TERMINAL</h1>
              
              {/* BACK TO MAIN WEBSITE BUTTON */}
              <a 
                href="https://www.numbpolys.xyz/" 
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#E5E5E5',
                  padding: '6px 12px',
                  borderRadius: '2px',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                  backdropFilter: 'blur(8px)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#E5E5E5';
                  e.currentTarget.style.color = '#0D0D11';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.color = '#E5E5E5';
                }}
              >
                ← Back to Main
              </a>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => !isProcessingTx && setActiveView('GENERATOR')} 
                style={{ background: activeView === 'GENERATOR' ? '#E5E5E5' : 'rgba(255,255,255,0.03)', color: activeView === 'GENERATOR' ? '#0D0D11' : '#E5E5E5', padding: '6px 16px', border: '1px solid rgba(255,255,255,0.15)', cursor: isProcessingTx ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: '500', borderRadius: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                [ GENERATOR ]
              </button>
              <button 
                onClick={() => !isProcessingTx && setActiveView('ARMORY')} 
                style={{ background: activeView === 'ARMORY' ? '#E5E5E5' : 'rgba(255,255,255,0.03)', color: activeView === 'ARMORY' ? '#0D0D11' : '#E5E5E5', padding: '6px 16px', border: '1px solid rgba(255,255,255,0.15)', cursor: isProcessingTx ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: '500', borderRadius: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                [ THE ARMORY ]
              </button>
            </div>
            
            <div className="neon-wallet-override">
              <ConnectButton />
            </div>
          </div>
        </header>

        {txMessage && (
          <div style={{
            width: '100%', 
            maxWidth: '500px', 
            margin: '0 auto 2rem auto', 
            padding: '12px', 
            textAlign: 'center',
            fontWeight: 'bold',
            backgroundColor: txMessage.includes('ERROR') ? 'rgba(255, 0, 0, 0.15)' : 'rgba(6, 182, 212, 0.15)',
            border: `1px solid ${txMessage.includes('ERROR') ? '#ff3333' : '#06B6D4'}`,
            color: txMessage.includes('ERROR') ? '#ff3333' : '#06B6D4',
            boxShadow: `0 0 15px ${txMessage.includes('ERROR') ? 'rgba(255,0,0,0.3)' : 'rgba(6,182,212,0.3)'}`,
            backdropFilter: 'blur(4px)'
          }}>
            {txMessage}
          </div>
        )}

        {activeView === 'GENERATOR' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', justifyContent: 'center', alignItems: 'center' }}>
            <div className="hud-frame" style={{ width: '100%', maxWidth: '400px', display: 'flex', justifyContent: 'center', borderRadius: '2px' }}>
              <div className="hud-corner-bottom" />
              <LayerStacker layers={activeTraits} />
            </div>

            <div style={{ width: '100%', maxWidth: '500px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem', marginBottom: '1.5rem', backdropFilter: 'blur(12px)', borderRadius: '2px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>// ACTIVE TRAIT MATRIX</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: '#A3A3A3', lineHeight: '1.8' }}>
                  {activeTraits.map((t, idx) => {
                    const [cat, file] = t.split('/');
                    return (
                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <span style={{ color: '#E5E5E5' }}>{cat.toUpperCase()}:</span>
                        <span style={{ textAlign: 'right', color: '#06B6D4' }}>{file.replace('.png', '')}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button onClick={handleReroll} disabled={isProcessingTx} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', color: '#E5E5E5', border: '1px solid rgba(255,255,255,0.15)', cursor: isProcessingTx ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: '500', borderRadius: '2px', textTransform: 'uppercase', letterSpacing: '0.1em', transition: 'all 0.3s ease' }}>
                  ⟳ INITIATE RE-ROLL
                </button>
                <button 
                  onClick={mintOperative} 
                  disabled={!account || isProcessingTx} 
                  style={{ padding: '14px', background: account && !isProcessingTx ? '#E5E5E5' : 'rgba(255,255,255,0.03)', color: account && !isProcessingTx ? '#0D0D11' : '#555', border: account && !isProcessingTx ? '1px solid #E5E5E5' : '1px solid rgba(255,255,255,0.1)', cursor: account && !isProcessingTx ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: '600', borderRadius: '2px', textTransform: 'uppercase', letterSpacing: '0.1em', transition: 'all 0.3s ease' }}
                >
                  {isProcessingTx ? '⚡ PROCESSING...' : (account ? '⚡ DEPLOY CONSTRUCT (MINT)' : '⚡ CONNECT TERMINAL WALLET')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: '400px' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.1em' }}>// LIVE ON-CHAIN CONSTRUCT</h3>
              {displayOperatives.length > 0 && (
                <select 
                  value={selectedOpId || ''} 
                  onChange={(e) => setSelectedOpId(e.target.value)}
                  disabled={isProcessingTx}
                  style={{ background: 'rgba(13,13,17,0.9)', color: '#06B6D4', border: '1px solid rgba(255,255,255,0.15)', padding: '10px', marginBottom: '1.5rem', width: '100%', fontFamily: 'inherit', cursor: isProcessingTx ? 'not-allowed' : 'pointer', borderRadius: '2px' }}
                >
                  {displayOperatives.map((op: any) => {
                    const id = op.data?.objectId || op.address;
                    return (
                      <option key={id} value={id}>
                        OPERATIVE // {id.slice(0, 6)}...{id.slice(-4)}
                      </option>
                    );
                  })}
                </select>
              )}
              
              {selectedOpId ? (
                <div className="hud-frame" style={{ display: 'flex', justifyContent: 'center', width: '100%', borderRadius: '2px' }}>
                  <div className="hud-corner-bottom" />
                  <LayerStacker layers={getOperativePreviewLayers()} />
                </div>
              ) : (
                <div style={{ width: '100%', maxWidth: '380px', height: '380px', border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A3A3A3', margin: '0 auto', background: 'rgba(255,255,255,0.01)', borderRadius: '2px' }}>
                  AWAITING CONSTRUCT DATA...
                </div>
              )}
            </div>

            <div style={{ width: '100%', maxWidth: '550px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem', marginBottom: '1.5rem', backdropFilter: 'blur(12px)', borderRadius: '2px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  // EQUIPMENT SLOTS {isLoadingSlots && <span style={{ color: '#E5E5E5' }}>(SYNCING...)</span>}
                </h3>
                {LAYER_ORDER.filter(s => s !== 'base body').map((slot) => {
                  const isEquipped = !!equippedGear[slot];
                  return (
                    <div key={slot} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: isEquipped ? '#E5E5E5' : '#555' }}>[{slot.toUpperCase()}] </span>
                        <span style={{ color: isEquipped ? '#06B6D4' : '#444', fontSize: '0.85rem' }}>
                          {isEquipped ? equippedGear[slot].imageUrl.replace('.png', '') : 'EMPTY'}
                        </span>
                      </div>
                      {isEquipped && (
                        <button 
                          onClick={() => handleUnequip(slot)}
                          disabled={isProcessingTx}
                          style={{ background: 'transparent', color: isProcessingTx ? '#555' : '#ff3333', border: isProcessingTx ? '1px dashed rgba(255,255,255,0.1)' : '1px solid rgba(255,51,51,0.5)', padding: '4px 8px', cursor: isProcessingTx ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', borderRadius: '2px' }}>
                          {isProcessingTx ? '[ LOADING ]' : '[ UNEQUIP ]'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem', backdropFilter: 'blur(12px)', borderRadius: '2px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  // DECOUPLED INVENTORY
                </h3>
                {!looseTraits?.data?.length ? (
                  <p style={{ color: '#555', fontSize: '0.85rem' }}>No standalone objects detected.</p>
                ) : (
                  looseTraits.data.map((item, idx) => {
                    const fields = (item.data?.content as any)?.fields;
                    const cat = fields?.category;
                    const isSlotOccupied = !!equippedGear[cat];

                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ color: '#E5E5E5' }}>[{cat?.toUpperCase()}]</span>{' '}
                          <span style={{ color: '#06B6D4', fontSize: '0.85rem' }}>{fields?.image_url?.replace('.png', '')}</span>
                        </div>
                        <button
                          onClick={() => handleEquip(item.data!.objectId, cat)}
                          disabled={isSlotOccupied || isProcessingTx}
                          style={{
                            background: isSlotOccupied ? 'transparent' : (isProcessingTx ? 'rgba(255,255,255,0.05)' : '#E5E5E5'),
                            color: isSlotOccupied ? '#555' : (isProcessingTx ? '#777' : '#0D0D11'),
                            border: isSlotOccupied ? '1px dashed rgba(255,255,255,0.1)' : (isProcessingTx ? '1px solid rgba(255,255,255,0.1)' : '1px solid #E5E5E5'),
                            padding: '4px 8px',
                            cursor: (isSlotOccupied || isProcessingTx) ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            fontSize: '0.75rem',
                            borderRadius: '2px',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          {isSlotOccupied ? 'SLOT BUSY' : (isProcessingTx ? 'LOADING...' : '[ EQUIP ]')}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider>
          <TerminalUI />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}