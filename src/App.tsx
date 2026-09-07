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

// Removed the :443 port that was causing Vercel load balancer rejections
const networks = {
  testnet: { url: 'https://fullnode.testnet.sui.io' }
} as any;

// --- LEE'S RECOMMENDATION: GRAPHQL BLazing-Fast Data Fetcher ---
const fetchOperativeWithGraphQL = async (ownerAddress: string, packageId: string) => {
  const graphqlQuery = {
    query: `
      query GetOperativeState($owner: SuiAddress!, $structType: String!) {
        objects(owner: $owner, filter: { type: $structType }) {
          nodes {
            address
            content {
              ... on MoveObject {
                fields
              }
            }
            dynamicFields {
              nodes {
                name {
                  json
                }
                value {
                  ... on MoveObject {
                    content {
                      ... on MoveObject {
                        fields
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    variables: {
      owner: ownerAddress,
      structType: `${packageId}::operative::Operative`,
    },
  };

  try {
    const response = await fetch('https://graphql.testnet.sui.io/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graphqlQuery),
    });

    const json = await response.json();
    return json?.data?.objects?.nodes || [];
  } catch (err) {
    console.error('GraphQL sync error:', err);
    return [];
  }
};

function TerminalUI() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [activeView, setActiveView] = useState<'GENERATOR' | 'ARMORY'>('GENERATOR');
  const [activeTraits, setActiveTraits] = useState<string[]>(generateRandomOperative());
  
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [equippedGear, setEquippedGear] = useState<Record<string, { objectId: string; imageUrl: string }>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [graphqlOperatives, setGraphqlOperatives] = useState<any[]>([]);

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
    // Removed activeView restriction so inventory syncs instantly in the background
    { enabled: !!account } 
  );

  useEffect(() => {
    if (account?.address) {
      fetchOperativeWithGraphQL(account.address, PACKAGE_ID).then((nodes) => {
        setGraphqlOperatives(nodes);
        if (nodes.length > 0 && !selectedOpId) {
          setSelectedOpId(nodes[0].address);
          
          const gearMap: Record<string, { objectId: string; imageUrl: string }> = {};
          const dynFields = nodes[0].dynamicFields?.nodes || [];
          for (const field of dynFields) {
            const fields = field.value?.content?.fields;
            if (fields && fields.category) {
              gearMap[fields.category] = {
                objectId: field.value.address || '',
                imageUrl: fields.image_url,
              };
            }
          }
          setEquippedGear(gearMap);
        }
      });
    }
  }, [account?.address]);

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
      const targetNode = graphqlOperatives.find(n => n.address === opId);
      if (targetNode) {
        const gearMap: Record<string, { objectId: string; imageUrl: string }> = {};
        const dynFields = targetNode.dynamicFields?.nodes || [];
        for (const field of dynFields) {
          const fields = field.value?.content?.fields;
          if (fields && fields.category) {
            gearMap[fields.category] = {
              objectId: field.value.address || '',
              imageUrl: fields.image_url,
            };
          }
        }
        setEquippedGear(gearMap);
        setIsLoadingSlots(false);
        return;
      }

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

  const refreshTerminalState = async () => {
    if (account?.address) {
      const nodes = await fetchOperativeWithGraphQL(account.address, PACKAGE_ID);
      setGraphqlOperatives(nodes);
    }
    if (selectedOpId) {
      console.log("⚡ [STATE SYNC] Transaction confirmed, updating HUD...");
      await loadEquippedTraits(selectedOpId);
      refetchTraits();
    }
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
          await refreshTerminalState();
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
          await refreshTerminalState();
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
          if (account?.address) {
            fetchOperativeWithGraphQL(account.address, PACKAGE_ID).then(setGraphqlOperatives);
          }
        },
        onError: (err) => console.error(err),
      }
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', backgroundColor: '#050505', color: '#ffffff', fontFamily: 'monospace', boxSizing: 'border-box', overflowX: 'hidden' }}>
      
      {/* UI CSS OVERRIDES */}
      <style>{`
        .hud-frame {
          position: relative;
          background: rgba(10, 10, 10, 0.6);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(0, 255, 0, 0.15);
          padding: 8px;
        }
        .hud-frame::before, .hud-frame::after, .hud-corner-bottom::before, .hud-corner-bottom::after {
          content: '';
          position: absolute;
          width: 20px;
          height: 20px;
          border-color: #00ff00;
          border-style: solid;
        }
        .hud-frame::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
        .hud-frame::after { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
        .hud-corner-bottom::before { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
        .hud-corner-bottom::after { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

        .neon-wallet-override button {
          background-color: rgba(10, 10, 10, 0.8) !important;
          border: 1px solid #00ff00 !important;
          color: #00ff00 !important;
          font-family: monospace !important;
          border-radius: 0 !important;
          box-shadow: 0 0 8px rgba(0, 255, 0, 0.15) !important;
          transition: all 0.2s ease !important;
        }
        .neon-wallet-override button:hover {
          background-color: rgba(0, 255, 0, 0.1) !important;
          box-shadow: 0 0 15px rgba(0, 255, 0, 0.4) !important;
        }

        .crt-overlay {
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
          background-size: 100% 3px, 3px 100%;
          z-index: 9999;
          pointer-events: none;
          opacity: 0.4;
        }
      `}</style>

      {/* CRT SCANLINE OVERLAY */}
      <div className="crt-overlay" />

      {/* 3D BACKGROUND */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
        <Canvas camera={{ position: [0, 0, 8], fov: 50 }} style={{ width: '100%', height: '100%' }}>
          <ambientLight intensity={1} />
          <GridBackground />
        </Canvas>
      </div>

      {/* TERMINAL UI CONTAINER */}
      <div style={{ padding: '1.5rem', position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', borderBottom: '1px solid rgba(0, 255, 0, 0.3)', paddingBottom: '1rem' }}>
          <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.4rem', letterSpacing: '2px', color: '#00ff00', textShadow: '0 0 10px rgba(0,255,0,0.3)' }}>NUMB_POLYS // TERMINAL</h1>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => setActiveView('GENERATOR')} 
                style={{ background: activeView === 'GENERATOR' ? '#00ff00' : 'transparent', color: activeView === 'GENERATOR' ? '#000' : '#00ff00', padding: '6px 16px', border: '1px solid #00ff00', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}>
                [ GENERATOR ]
              </button>
              <button 
                onClick={() => setActiveView('ARMORY')} 
                style={{ background: activeView === 'ARMORY' ? '#00ff00' : 'transparent', color: activeView === 'ARMORY' ? '#000' : '#00ff00', padding: '6px 16px', border: '1px solid #00ff00', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}>
                [ THE ARMORY ]
              </button>
            </div>
            
            {/* STYLED WALLET BUTTON */}
            <div className="neon-wallet-override">
              <ConnectButton />
            </div>
          </div>
        </header>

        {activeView === 'GENERATOR' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', justifyContent: 'center', alignItems: 'center' }}>
            {/* TACTICAL HUD FRAME */}
            <div className="hud-frame" style={{ width: '100%', maxWidth: '400px', display: 'flex', justifyContent: 'center' }}>
              <div className="hud-corner-bottom" />
              <LayerStacker layers={activeTraits} />
            </div>

            <div style={{ width: '100%', maxWidth: '500px' }}>
              <div style={{ background: 'rgba(5,5,5,0.8)', border: '1px solid #222', padding: '1.5rem', marginBottom: '1.5rem', backdropFilter: 'blur(4px)' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#00ff00', fontSize: '1rem', borderBottom: '1px dashed #333', paddingBottom: '0.5rem' }}>// ACTIVE TRAIT MATRIX</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: '#ccc', lineHeight: '1.8' }}>
                  {activeTraits.map((t, idx) => {
                    const [cat, file] = t.split('/');
                    return (
                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <span style={{ color: '#fff' }}>{cat.toUpperCase()}:</span>
                        <span style={{ textAlign: 'right', color: '#00ff00' }}>{file.replace('.png', '')}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button onClick={handleReroll} style={{ padding: '12px', background: 'transparent', color: '#fff', border: '1px solid #444', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}>
                  ⟳ INITIATE RE-ROLL
                </button>
                <button 
                  onClick={mintOperative} 
                  disabled={!account} 
                  style={{ padding: '14px', background: account ? '#00ff00' : '#111', color: account ? '#000' : '#444', border: account ? '1px solid #00ff00' : '1px solid #222', cursor: account ? 'pointer' : 'not-allowed', fontFamily: 'monospace', fontWeight: 'bold' }}
                >
                  {account ? '⚡ DEPLOY CONSTRUCT (MINT)' : '⚡ CONNECT TERMINAL WALLET'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: '400px' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#00ff00' }}>// LIVE ON-CHAIN CONSTRUCT</h3>
              {(ownedOperatives?.data?.length || graphqlOperatives.length > 0) && (
                <select 
                  value={selectedOpId || ''} 
                  onChange={(e) => setSelectedOpId(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.8)', color: '#00ff00', border: '1px solid #00ff00', padding: '10px', marginBottom: '1.5rem', width: '100%', fontFamily: 'monospace', cursor: 'pointer' }}
                >
                  {(graphqlOperatives.length > 0 ? graphqlOperatives : ownedOperatives?.data || []).map((op: any) => {
                    const id = op.address || op.data?.objectId;
                    return (
                      <option key={id} value={id}>
                        OPERATIVE // {id.slice(0, 6)}...{id.slice(-4)}
                      </option>
                    );
                  })}
                </select>
              )}
              
              {selectedOpId ? (
                <div className="hud-frame" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <div className="hud-corner-bottom" />
                  <LayerStacker layers={getOperativePreviewLayers()} />
                </div>
              ) : (
                <div style={{ width: '100%', maxWidth: '380px', height: '380px', border: '1px dashed #00ff00', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00ff00', margin: '0 auto', background: 'rgba(0,255,0,0.05)' }}>
                  AWAITING CONSTRUCT DATA...
                </div>
              )}
            </div>

            <div style={{ width: '100%', maxWidth: '550px' }}>
              <div style={{ background: 'rgba(5,5,5,0.8)', border: '1px solid #222', padding: '1.5rem', marginBottom: '1.5rem', backdropFilter: 'blur(4px)' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#00ff00', borderBottom: '1px dashed #333', paddingBottom: '0.5rem' }}>
                  // EQUIPMENT SLOTS {isLoadingSlots && <span style={{ color: '#fff' }}>(SYNCING...)</span>}
                </h3>
                {LAYER_ORDER.filter(s => s !== 'base body').map((slot) => {
                  const isEquipped = !!equippedGear[slot];
                  return (
                    <div key={slot} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #111' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: isEquipped ? '#fff' : '#444' }}>[{slot.toUpperCase()}] </span>
                        <span style={{ color: isEquipped ? '#00ff00' : '#333', fontSize: '0.85rem' }}>
                          {isEquipped ? equippedGear[slot].imageUrl.replace('.png', '') : 'EMPTY'}
                        </span>
                      </div>
                      {isEquipped && (
                        <button 
                          onClick={() => handleUnequip(slot)}
                          style={{ background: 'transparent', color: '#ff3333', border: '1px solid #ff3333', padding: '4px 8px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          [ UNEQUIP ]
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ background: 'rgba(5,5,5,0.8)', border: '1px solid #222', padding: '1.5rem', backdropFilter: 'blur(4px)' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#00ff00', borderBottom: '1px dashed #333', paddingBottom: '0.5rem' }}>
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
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #111' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ color: '#fff' }}>[{cat?.toUpperCase()}]</span>{' '}
                          <span style={{ color: '#00ff00', fontSize: '0.85rem' }}>{fields?.image_url?.replace('.png', '')}</span>
                        </div>
                        <button
                          onClick={() => handleEquip(item.data!.objectId, cat)}
                          disabled={isSlotOccupied}
                          style={{
                            background: isSlotOccupied ? 'transparent' : '#00ff00',
                            color: isSlotOccupied ? '#444' : '#000',
                            border: isSlotOccupied ? '1px dashed #333' : '1px solid #00ff00',
                            padding: '4px 8px',
                            cursor: isSlotOccupied ? 'not-allowed' : 'pointer',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem'
                          }}
                        >
                          {isSlotOccupied ? 'SLOT BUSY' : '[ EQUIP ]'}
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