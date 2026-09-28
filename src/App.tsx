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
import { PACKAGE_ID, REGISTRY_ID } from './config';
import { LayerStacker } from './LayerStacker';
import GridBackground from './components/GridBackground';
import { AdminDashboard } from './AdminDashboard';
import registryData from './registry.json';
import '@mysten/dapp-kit/dist/index.css';

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
  mainnet: { url: 'https://sui-mainnet-endpoint.blockvision.org' }
} as any;

function TerminalUI() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [activeView, setActiveView] = useState<'GENERATOR' | 'ARMORY' | 'ADMIN'>('GENERATOR');
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [equippedGear, setEquippedGear] = useState<Record<string, { objectId: string; imageUrl: string }>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const [mintQuantity, setMintQuantity] = useState<number>(1);
  const [isProcessingTx, setIsProcessingTx] = useState(false);
  const [txMessage, setTxMessage] = useState<string | null>(null);

  const displayTxMessage = (msg: string) => {
    setTxMessage(msg);
    setTimeout(() => setTxMessage(null), 6000);
  };

  // Removed refetchInterval to stop rate limiting.
  const { data: registryObj, refetch: refetchRegistry } = useSuiClientQuery(
    'getObject',
    { id: REGISTRY_ID, options: { showContent: true } }
  );
  
  const regFields = (registryObj?.data?.content as any)?.fields;
  const currentPhase = regFields?.phase || 0; 
  const mintPriceMist = regFields?.mint_price || "5000000000";
  const publicIndex = regFields?.public_minted ? parseInt(regFields.public_minted) : 111;

  const { data: whitelistTickets, refetch: refetchTickets } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address as string,
      filter: { StructType: `${PACKAGE_ID}::operative::WhitelistTicket` },
    },
    { enabled: !!account && activeView === 'GENERATOR' }
  );
  
  const availableTickets = whitelistTickets?.data || [];
  const maxWlAllowed = availableTickets.length;

  const { data: ownedOperatives, refetch: refetchOperatives } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address as string,
      filter: { StructType: `${PACKAGE_ID}::operative::Operative` },
      options: { showContent: true },
    },
    { enabled: !!account }
  );

  const { data: looseTraits, refetch: refetchTraits } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address as string,
      filter: { StructType: `${PACKAGE_ID}::operative::Trait` },
      options: { showContent: true },
    },
    { enabled: !!account && activeView === 'ARMORY' }
  );

  useEffect(() => {
    if (ownedOperatives?.data?.length && !selectedOpId) {
      setSelectedOpId(ownedOperatives.data[0].data?.objectId || null);
    }
  }, [ownedOperatives, selectedOpId]);

  const activeLoadRef = React.useRef<string | null>(null);

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

  const loadEquippedTraits = async (opId: string) => {
    activeLoadRef.current = opId;
    setIsLoadingSlots(true);
    setEquippedGear({}); 

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const dynamicFields = await retryRpc(() => suiClient.getDynamicFields({ parentId: opId }));
      if (activeLoadRef.current !== opId) return;

      const gearMap: Record<string, { objectId: string; imageUrl: string }> = {};

      if (dynamicFields.data.length > 0) {
        const traitIds = dynamicFields.data.map(field => field.objectId);
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
      console.error('Failed to load equipped gear:', err);
    } finally {
      if (activeLoadRef.current === opId) {
        setIsLoadingSlots(false);
      }
    }
  };

  useEffect(() => {
    if (selectedOpId) {
      loadEquippedTraits(selectedOpId);
    }
  }, [selectedOpId]);

  const refreshTerminalState = async () => {
    if (selectedOpId) await loadEquippedTraits(selectedOpId);
    await new Promise(resolve => setTimeout(resolve, 1500));
    await refetchRegistry();
    await refetchTickets();
    await refetchTraits();
    await refetchOperatives();
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
          await new Promise(resolve => setTimeout(resolve, 3000));
          await refreshTerminalState();
          setIsProcessingTx(false);
        },
        onError: (err) => {
          console.error(err);
          displayTxMessage(`[ ERROR: TRANSACTION FAILED ]`);
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
          await new Promise(resolve => setTimeout(resolve, 3000));
          await refreshTerminalState();
          setIsProcessingTx(false);
        },
        onError: (err) => {
          console.error(err);
          displayTxMessage(`[ ERROR: TRANSACTION FAILED ]`);
          setIsProcessingTx(false);
        },
      }
    );
  };

  const mintOperative = async () => {
    if (!account || isProcessingTx) return;
    if (currentPhase === 0) return;
    if (currentPhase === 1 && maxWlAllowed === 0) return;

    const actualCount = currentPhase === 1 ? Math.min(mintQuantity, maxWlAllowed) : mintQuantity;

    setIsProcessingTx(true);
    displayTxMessage(`[ PREPARING BATCH MINT (${actualCount})... PLEASE SIGN IN WALLET ]`);

    try {
      const tx = new Transaction();

      for (let i = 0; i < actualCount; i++) {
        const tokenData = registryData[publicIndex + i];
        if (!tokenData) throw new Error("Metadata index out of bounds");

        const traitCategories = Object.keys(tokenData.display_traits).filter(k => k !== 'Rarity Tier');
        const traitNames = traitCategories.map(k => tokenData.display_traits[k as keyof typeof tokenData.display_traits]);
        const traitUrls = traitCategories.map(k => {
          const rawKey = k === 'Jewelry' ? 'Jeweleries' : k;
          return (tokenData.walrus_urls as any)[rawKey] || "None";
        });

        const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(mintPriceMist)]);

        if (currentPhase === 1) {
          tx.moveCall({
            target: `${PACKAGE_ID}::operative::whitelist_mint`,
            arguments: [
              tx.object(REGISTRY_ID),
              tx.object(availableTickets[i].data!.objectId),
              feeCoin,
              tx.pure.string(tokenData.lore_name),
              tx.pure.string(tokenData.display_traits['Rarity Tier']),
              tx.pure.string((tokenData.walrus_urls as any)['Base Body'] || ""),
              tx.pure.vector('string', traitCategories),
              tx.pure.vector('string', traitNames),
              tx.pure.vector('string', traitUrls),
            ],
          });
        } else {
          tx.moveCall({
            target: `${PACKAGE_ID}::operative::public_mint`,
            arguments: [
              tx.object(REGISTRY_ID),
              feeCoin,
              tx.pure.string(tokenData.lore_name),
              tx.pure.string(tokenData.display_traits['Rarity Tier']),
              tx.pure.string((tokenData.walrus_urls as any)['Base Body'] || ""),
              tx.pure.vector('string', traitCategories),
              tx.pure.vector('string', traitNames),
              tx.pure.vector('string', traitUrls),
            ],
          });
        }
      }

      signAndExecuteTransaction(
        { transaction: tx },
        {
          onSuccess: async () => {
            displayTxMessage(`[ SUCCESS: ${actualCount} CONSTRUCT(S) DEPLOYED ON-CHAIN ]`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            setMintQuantity(1); 
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
    } catch (err: any) {
      console.error(err);
      displayTxMessage(`[ ERROR: ${err.message || "INITIALIZATION FAILED"} ]`);
      setIsProcessingTx(false);
    }
  };

  const displayOperatives = ownedOperatives?.data || [];

  let buttonText = isProcessingTx ? '⚡ PROCESSING...' : '⚡ CONNECT TERMINAL WALLET';
  let buttonDisabled = !account || isProcessingTx;
  let buttonStyle = {
    padding: '14px', 
    background: account ? '#E5E5E5' : 'rgba(255,255,255,0.03)', 
    color: account ? '#0D0D11' : '#555', 
    border: account ? '1px solid #E5E5E5' : '1px solid rgba(255,255,255,0.1)', 
    cursor: account ? 'pointer' : 'not-allowed', 
    fontFamily: 'inherit', fontWeight: '600', borderRadius: '2px', 
    textTransform: 'uppercase' as const, letterSpacing: '0.1em', transition: 'all 0.3s ease',
    width: '100%'
  };

  if (account) {
    if (currentPhase === 0) {
      buttonText = 'MINT PAUSED';
      buttonDisabled = true;
      buttonStyle.background = 'rgba(255,51,51,0.1)';
      buttonStyle.color = '#ff3333';
      buttonStyle.border = '1px dashed #ff3333';
      buttonStyle.cursor = 'not-allowed';
    } else if (currentPhase === 1) {
      if (maxWlAllowed > 0) {
        const selectedQty = Math.min(mintQuantity, maxWlAllowed);
        buttonText = isProcessingTx ? '⚡ PROCESSING...' : `⚡ MINT ${selectedQty} (WHITELIST)`;
        buttonDisabled = isProcessingTx;
        buttonStyle.background = 'rgba(0, 255, 0, 0.1)';
        buttonStyle.color = '#00ff00';
        buttonStyle.border = '1px solid #00ff00';
      } else {
        buttonText = 'NOT WHITELISTED';
        buttonDisabled = true;
        buttonStyle.background = 'rgba(255,255,255,0.03)';
        buttonStyle.color = '#555';
        buttonStyle.border = '1px solid rgba(255,255,255,0.1)';
        buttonStyle.cursor = 'not-allowed';
      }
    } else if (currentPhase === 2) {
      buttonText = isProcessingTx ? '⚡ PROCESSING...' : `⚡ DEPLOY ${mintQuantity} CONSTRUCT(S)`;
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', backgroundColor: '#0D0D11', color: '#E5E5E5', fontFamily: 'var(--font-geist-sans), monospace', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <style>{`
        .hud-frame { position: relative; background: rgba(255, 255, 255, 0.02); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.1); padding: 8px; }
        .hud-frame::before, .hud-frame::after, .hud-corner-bottom::before, .hud-corner-bottom::after { content: ''; position: absolute; width: 20px; height: 20px; border-color: #06B6D4; border-style: solid; }
        .hud-frame::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
        .hud-frame::after { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
        .hud-corner-bottom::before { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
        .hud-corner-bottom::after { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }
        .neon-wallet-override button { background-color: rgba(255, 255, 255, 0.03) !important; border: 1px solid rgba(255, 255, 255, 0.15) !important; color: #E5E5E5 !important; font-family: inherit !important; border-radius: 2px !important; backdrop-filter: blur(8px) !important; transition: all 0.3s ease !important; }
        .neon-wallet-override button:hover { background-color: #E5E5E5 !important; color: #0D0D11 !important; border-color: #E5E5E5 !important; }
        .crt-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(6, 182, 212, 0.01), rgba(0, 0, 255, 0.02)); background-size: 100% 3px, 3px 100%; z-index: 9999; pointer-events: none; opacity: 0.2; }
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
              <a href="https://www.numbpolys.xyz/" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#E5E5E5', padding: '6px 12px', borderRadius: '2px', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none', backdropFilter: 'blur(8px)', transition: 'all 0.3s ease' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#E5E5E5'; e.currentTarget.style.color = '#0D0D11'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)'; e.currentTarget.style.color = '#E5E5E5'; }}>← Back to Main</a>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => !isProcessingTx && setActiveView('GENERATOR')} style={{ background: activeView === 'GENERATOR' ? '#E5E5E5' : 'rgba(255,255,255,0.03)', color: activeView === 'GENERATOR' ? '#0D0D11' : '#E5E5E5', padding: '6px 16px', border: '1px solid rgba(255,255,255,0.15)', cursor: isProcessingTx ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: '500', borderRadius: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>[ GENERATOR ]</button>
              <button onClick={() => !isProcessingTx && setActiveView('ARMORY')} style={{ background: activeView === 'ARMORY' ? '#E5E5E5' : 'rgba(255,255,255,0.03)', color: activeView === 'ARMORY' ? '#0D0D11' : '#E5E5E5', padding: '6px 16px', border: '1px solid rgba(255,255,255,0.15)', cursor: isProcessingTx ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: '500', borderRadius: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>[ THE ARMORY ]</button>
              {account?.address === '0xdb67bfb984df37d73755da48c166689e7d584b17cf6c23a680cb05d90f9653fb' && (
                <button onClick={() => !isProcessingTx && setActiveView('ADMIN')} style={{ background: activeView === 'ADMIN' ? '#E5E5E5' : 'rgba(255,255,255,0.03)', color: activeView === 'ADMIN' ? '#0D0D11' : '#E5E5E5', padding: '6px 16px', border: '1px solid rgba(255,255,255,0.15)', cursor: isProcessingTx ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: '500', borderRadius: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>[ OVERSEER ]</button>
              )}
            </div>
            
            <div className="neon-wallet-override">
              <ConnectButton />
            </div>
          </div>
        </header>

        {txMessage && (
          <div style={{ width: '100%', maxWidth: '500px', margin: '0 auto 2rem auto', padding: '12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: txMessage.includes('ERROR') ? 'rgba(255, 0, 0, 0.15)' : 'rgba(6, 182, 212, 0.15)', border: `1px solid ${txMessage.includes('ERROR') ? '#ff3333' : '#06B6D4'}`, color: txMessage.includes('ERROR') ? '#ff3333' : '#06B6D4', boxShadow: `0 0 15px ${txMessage.includes('ERROR') ? 'rgba(255,0,0,0.3)' : 'rgba(6,182,212,0.3)'}`, backdropFilter: 'blur(4px)' }}>
            {txMessage}
          </div>
        )}

        {/* VIEW ROUTING */}
        {activeView === 'GENERATOR' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', justifyContent: 'center', alignItems: 'center' }}>
            <div className="hud-frame" style={{ width: '100%', maxWidth: '400px', display: 'flex', justifyContent: 'center', borderRadius: '2px' }}>
              <div className="hud-corner-bottom" />
              <LayerStacker/>
            </div>

            <div style={{ width: '100%', maxWidth: '500px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                
                {/* QUANTITY SELECTOR */}
                {account && currentPhase !== 0 && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ color: '#A3A3A3', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>
                      Select Mint Quantity
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                      {[1, 2, 3, 4, 5].map(num => {
                        const isSelectable = currentPhase === 1 ? num <= maxWlAllowed : true;
                        return (
                          <button 
                            key={num}
                            disabled={!isSelectable || isProcessingTx}
                            onClick={() => setMintQuantity(num)}
                            style={{
                              flex: 1, padding: '10px',
                              background: mintQuantity === num ? '#E5E5E5' : 'rgba(255,255,255,0.03)',
                              color: mintQuantity === num ? '#0D0D11' : (isSelectable ? '#E5E5E5' : '#555'),
                              border: mintQuantity === num ? '1px solid #E5E5E5' : '1px solid rgba(255,255,255,0.1)',
                              cursor: (!isSelectable || isProcessingTx) ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit', fontWeight: 'bold', borderRadius: '2px', transition: 'all 0.2s ease'
                            }}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button onClick={mintOperative} disabled={buttonDisabled} style={buttonStyle}>
                  {buttonText}
                </button>
              </div>
            </div>
          </div>
        ) : activeView === 'ARMORY' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: '400px' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.1em' }}>// LIVE ON-CHAIN CONSTRUCT</h3>
              {displayOperatives.length > 0 && (
                <select value={selectedOpId || ''} onChange={(e) => setSelectedOpId(e.target.value)} disabled={isProcessingTx} style={{ background: 'rgba(13,13,17,0.9)', color: '#06B6D4', border: '1px solid rgba(255,255,255,0.15)', padding: '10px', marginBottom: '1.5rem', width: '100%', fontFamily: 'inherit', cursor: isProcessingTx ? 'not-allowed' : 'pointer', borderRadius: '2px' }}>
                  {displayOperatives.map((op: any) => {
                    const id = op.data?.objectId || op.address;
                    return <option key={id} value={id}>OPERATIVE // {id.slice(0, 6)}...{id.slice(-4)}</option>;
                  })}
                </select>
              )}
              
              {selectedOpId ? (
                <div className="hud-frame" style={{ display: 'flex', justifyContent: 'center', width: '100%', borderRadius: '2px' }}>
                  <div className="hud-corner-bottom" />
                  <LayerStacker />
                </div>
              ) : (
                <div style={{ width: '100%', maxWidth: '380px', height: '380px', border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A3A3A3', margin: '0 auto', background: 'rgba(255,255,255,0.01)', borderRadius: '2px' }}>
                  AWAITING CONSTRUCT DATA...
                </div>
              )}
            </div>

            <div style={{ width: '100%', maxWidth: '550px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem', marginBottom: '1.5rem', backdropFilter: 'blur(12px)', borderRadius: '2px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>// EQUIPMENT SLOTS {isLoadingSlots && <span style={{ color: '#E5E5E5' }}>(SYNCING...)</span>}</h3>
                {['face', 'eye', 'outfits', 'jewelries', 'headwear', 'eyewear'].map((slot) => {
                  const isEquipped = !!equippedGear[slot];
                  return (
                    <div key={slot} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: isEquipped ? '#E5E5E5' : '#555' }}>[{slot.toUpperCase()}] </span>
                        <span style={{ color: isEquipped ? '#06B6D4' : '#444', fontSize: '0.85rem' }}>{isEquipped ? equippedGear[slot].imageUrl.replace('.png', '') : 'EMPTY'}</span>
                      </div>
                      {isEquipped && (
                        <button onClick={() => handleUnequip(slot)} disabled={isProcessingTx} style={{ background: 'transparent', color: isProcessingTx ? '#555' : '#ff3333', border: isProcessingTx ? '1px dashed rgba(255,255,255,0.1)' : '1px solid rgba(255,51,51,0.5)', padding: '4px 8px', cursor: isProcessingTx ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', borderRadius: '2px' }}>{isProcessingTx ? '[ LOADING ]' : '[ UNEQUIP ]'}</button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem', backdropFilter: 'blur(12px)', borderRadius: '2px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>// DECOUPLED INVENTORY</h3>
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
                          <span style={{ color: '#E5E5E5' }}>[{cat?.toUpperCase()}]</span> <span style={{ color: '#06B6D4', fontSize: '0.85rem' }}>{fields?.image_url?.replace('.png', '')}</span>
                        </div>
                        <button onClick={() => handleEquip(item.data!.objectId, cat)} disabled={isSlotOccupied || isProcessingTx} style={{ background: isSlotOccupied ? 'transparent' : (isProcessingTx ? 'rgba(255,255,255,0.05)' : '#E5E5E5'), color: isSlotOccupied ? '#555' : (isProcessingTx ? '#777' : '#0D0D11'), border: isSlotOccupied ? '1px dashed rgba(255,255,255,0.1)' : (isProcessingTx ? '1px solid rgba(255,255,255,0.1)' : '1px solid #E5E5E5'), padding: '4px 8px', cursor: (isSlotOccupied || isProcessingTx) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', borderRadius: '2px', transition: 'all 0.3s ease' }}>
                          {isSlotOccupied ? 'SLOT BUSY' : (isProcessingTx ? 'LOADING...' : '[ EQUIP ]')}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <AdminDashboard />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <WalletProvider>
          <TerminalUI />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}