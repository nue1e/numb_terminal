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

const queryClient = new QueryClient();
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

  const retryRpc = async <T,>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
    try {
      return await fn();
    } catch (err: any) {
      if (retries > 0 && (err?.status === 429 || err?.message?.includes('429') || err?.toString().includes('429'))) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return retryRpc(fn, retries - 1, delay * 2);
      }
      throw err;
    }
  };

  const loadEquippedTraits = async (opId: string) => {
    activeLoadRef.current = opId;
    setIsLoadingSlots(true);
    setEquippedGear({}); 

    try {
      const dynamicFields = await retryRpc(() => suiClient.getDynamicFields({ parentId: opId }));
      if (activeLoadRef.current !== opId) return;

      const gearMap: Record<string, { objectId: string; imageUrl: string }> = {};

      if (dynamicFields.data.length > 0) {
        const traitIds = dynamicFields.data.map(field => field.objectId);
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

  useEffect(() => {
    if (selectedOpId) {
      loadEquippedTraits(selectedOpId);
    }
  }, [selectedOpId]);

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
    if (!selectedOpId) return;
    if (equippedGear[category]) {
      alert(`Slot [${category.toUpperCase()}] is already occupied. Unequip the current item first.`);
      return;
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::operative::equip_trait`,
      arguments: [tx.object(selectedOpId), tx.object(traitId)],
    });

    signAndExecuteTransaction(
      { transaction: tx },
      {
        onSuccess: async () => {
          await loadEquippedTraits(selectedOpId);
          refetchTraits();
          alert(`Equipped to ${category.toUpperCase()}!`);
        },
        onError: (err) => console.error(err),
      }
    );
  };

  const handleUnequip = (category: string) => {
    if (!selectedOpId) return;

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::operative::unequip_trait`,
      arguments: [tx.object(selectedOpId), tx.pure.string(category)],
    });

    signAndExecuteTransaction(
      { transaction: tx },
      {
        onSuccess: async () => {
          await loadEquippedTraits(selectedOpId);
          refetchTraits();
          alert(`Unequipped ${category.toUpperCase()}! Trait returned to inventory.`);
        },
        onError: (err) => console.error(err),
      }
    );
  };

  const handleReroll = () => setActiveTraits(generateRandomOperative());

  const mintOperative = () => {
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
        onSuccess: () => {
          refetchOperatives();
          alert('Full Operative bundle minted with background and all traits attached!');
        },
        onError: (err) => console.error(err),
      }
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', backgroundColor: '#0a0a0a', color: '#ffffff', fontFamily: 'monospace', boxSizing: 'border-box', overflowX: 'hidden' }}>
      
      {/* FIXED FULL-SCREEN 3D GRID BACKGROUND */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
        <Canvas camera={{ position: [0, 0, 8], fov: 50 }} style={{ width: '100%', height: '100%' }}>
          <ambientLight intensity={1} />
          <GridBackground />
        </Canvas>
      </div>

      {/* TERMINAL UI CONTAINER */}
      <div style={{ padding: '1.5rem', position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', borderBottom: '1px solid #222', paddingBottom: '1rem' }}>
          <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '2px', color: '#ffffff' }}>NUMB_POLYS // TERMINAL</h1>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => setActiveView('GENERATOR')} 
                style={{ background: activeView === 'GENERATOR' ? '#ffffff' : '#111', color: activeView === 'GENERATOR' ? '#000000' : '#ffffff', padding: '6px 16px', border: '1px solid #ffffff', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}>
                GENERATOR
              </button>
              <button 
                onClick={() => setActiveView('ARMORY')} 
                style={{ background: activeView === 'ARMORY' ? '#ffffff' : '#111', color: activeView === 'ARMORY' ? '#000000' : '#ffffff', padding: '6px 16px', border: '1px solid #ffffff', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}>
                THE ARMORY
              </button>
            </div>
          </div>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ border: '1px solid #333', background: '#111', borderRadius: '4px', overflow: 'hidden' }}>
              <ConnectButton />
            </div>
          </div>
        </header>

        {activeView === 'GENERATOR' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: '400px', display: 'flex', justifyContent: 'center' }}><LayerStacker layers={activeTraits} /></div>
            <div style={{ width: '100%', maxWidth: '500px' }}>
              <div style={{ background: '#111', border: '1px solid #222', padding: '1.5rem', borderRadius: '4px', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#ffffff', fontSize: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>ACTIVE TRAIT MATRIX</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: '#ccc', lineHeight: '1.8' }}>
                  {activeTraits.map((t, idx) => {
                    const [cat, file] = t.split('/');
                    return (
                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', wordBreak: 'break-all' }}>
                        <span style={{ color: '#ffffff', flexShrink: 0 }}>{cat.toUpperCase()}:</span>
                        <span style={{ textAlign: 'right', color: '#aaa' }}>{file.replace('.png', '')}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
  <button onClick={handleReroll} style={{ padding: '12px', background: '#151515', color: '#ffffff', border: '1px solid #444', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold', width: '100%' }}>
    ⟳ REROLL TRAITS
  </button>
  <button 
    onClick={mintOperative} 
    disabled={!account} 
    style={{ padding: '14px', background: account ? '#ffffff' : '#222', color: account ? '#000000' : '#666', border: 'none', cursor: account ? 'pointer' : 'not-allowed', fontFamily: 'monospace', fontWeight: 'bold', width: '100%' }}
  >
    {account ? '⚡ MINT BUNDLE' : '⚡ MINT (CONNECT WALLET FIRST)'}
  </button>
</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: '400px' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#ffffff' }}>LIVE ON-CHAIN CONSTRUCT</h3>
              {ownedOperatives?.data && ownedOperatives.data.length > 0 && (
                <select 
                  value={selectedOpId || ''} 
                  onChange={(e) => setSelectedOpId(e.target.value)}
                  style={{ background: '#111', color: '#ffffff', border: '1px solid #333', padding: '8px', marginBottom: '1rem', width: '100%', fontFamily: 'monospace', cursor: 'pointer', textOverflow: 'ellipsis' }}
                >
                  {ownedOperatives.data.map((op) => (
                    <option key={op.data!.objectId} value={op.data!.objectId}>
                      OPERATIVE // {op.data!.objectId.slice(0, 6)}...{op.data!.objectId.slice(-4)}
                    </option>
                  ))}
                </select>
              )}
              {selectedOpId ? (
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <LayerStacker layers={getOperativePreviewLayers()} />
                </div>
              ) : (
                <div style={{ width: '100%', maxWidth: '380px', height: '380px', border: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777', margin: '0 auto' }}>
                  NO OPERATIVE SELECTED
                </div>
              )}
            </div>

            <div style={{ width: '100%', maxWidth: '550px' }}>
              <div style={{ background: '#111', border: '1px solid #222', padding: '1.5rem', borderRadius: '4px', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#ffffff', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                  EQUIPMENT SLOTS {isLoadingSlots && <span style={{ fontSize: '0.75rem', color: '#aaa' }}>(SYNCING...)</span>}
                </h3>

                {LAYER_ORDER.filter(s => s !== 'base body').map((slot) => {
                  const isEquipped = !!equippedGear[slot];
                  return (
                    <div key={slot} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a1a1a', gap: '1rem' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: isEquipped ? '#ffffff' : '#666', fontWeight: 'bold' }}>{slot.toUpperCase()}: </span>
                        <span style={{ color: isEquipped ? '#ddd' : '#555', fontSize: '0.85rem' }}>
                          {isEquipped ? equippedGear[slot].imageUrl.replace('.png', '') : 'EMPTY'}
                        </span>
                      </div>
                      {isEquipped && (
                        <button 
                          onClick={() => handleUnequip(slot)}
                          style={{ background: '#300', color: '#ff6666', border: '1px solid #ff6666', padding: '6px 10px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem', flexShrink: 0 }}>
                          UNEQUIP
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ background: '#111', border: '1px solid #222', padding: '1.5rem', borderRadius: '4px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#ffffff', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                  INVENTORY GEAR
                </h3>
                {!looseTraits?.data?.length ? (
                  <p style={{ color: '#777', fontSize: '0.85rem' }}>No loose traits detected in wallet.</p>
                ) : (
                  looseTraits.data.map((item, idx) => {
                    const fields = (item.data?.content as any)?.fields;
                    const cat = fields?.category;
                    const isSlotOccupied = !!equippedGear[cat];

                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a1a1a', gap: '1rem' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ color: '#ffffff' }}>[{cat?.toUpperCase()}]</span>{' '}
                          <span style={{ color: '#ccc', fontSize: '0.85rem' }}>{fields?.image_url?.replace('.png', '')}</span>
                        </div>
                        <button
                          onClick={() => handleEquip(item.data!.objectId, cat)}
                          disabled={isSlotOccupied}
                          style={{
                            background: isSlotOccupied ? '#222' : '#ffffff',
                            color: isSlotOccupied ? '#666' : '#000000',
                            border: isSlotOccupied ? '1px solid #333' : '1px solid #ffffff',
                            padding: '6px 12px',
                            cursor: isSlotOccupied ? 'not-allowed' : 'pointer',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            flexShrink: 0,
                          }}
                        >
                          {isSlotOccupied ? 'SLOT BUSY' : 'EQUIP'}
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