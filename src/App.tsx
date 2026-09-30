import React, { useState, useEffect, useCallback } from 'react';
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
import { ORIGINAL_PACKAGE_ID, LATEST_PACKAGE_ID, REGISTRY_ID } from './config';
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

const networks = {
  mainnet: { url: 'https://sui-mainnet-endpoint.blockvision.org' }
} as any;

const normalizeCategory = (rawCat: string) => {
  if (!rawCat) return '';
  let cat = rawCat.toLowerCase().trim();
  if (cat === 'jewelry' || cat === 'jeweleries' || cat === 'jewelery' || cat === 'jewels') return 'jewelries';
  if (cat === 'outfit') return 'outfits';
  if (cat === 'eyes') return 'eye';
  return cat;
};

// --- COMPONENT: Fast, Snappy Staggered Thumbnail ---
const ConstructThumbnail = ({ op, index, isSelected, onClick, suiClient, isProcessingTx, refreshCounter, retryRpc }: any) => {
  const id = op.data?.objectId || op.address;
  const fields = (op.data?.content as any)?.fields;
  const baseImg = fields?.image_url || fields?.url || '';
  
  const [gearMap, setGearMap] = useState<Record<string, string>>({});
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [imgLoadedCount, setImgLoadedCount] = useState(0);

  useEffect(() => {
    setImgLoadedCount(0);
  }, [id, refreshCounter]);

  useEffect(() => {
    let active = true;
    const fetchGear = async () => {
      setIsDataLoading(true);
      
      const cacheKey = `numbpolys_gear_thumb_${id}`;
      const cachedData = sessionStorage.getItem(cacheKey);
      if (cachedData) {
        setGearMap(JSON.parse(cachedData));
        setIsDataLoading(false);
        return;
      }

      try {
        await new Promise(resolve => setTimeout(resolve, index * 15)); 
        if (!active) return;
        
        const dynamicFields = await retryRpc(() => suiClient.getDynamicFields({ parentId: id }));
        if (!active) return;
        
        if (dynamicFields.data.length > 0) {
          const traitIds = dynamicFields.data.map((field: any) => field.objectId);
          const childObjects = await retryRpc(() => suiClient.multiGetObjects({
            ids: traitIds,
            options: { showContent: true }
          }));
          if (!active) return;
          
          const newGearMap: Record<string, string> = {};
          for (const childObject of childObjects) {
            const traitData = (childObject.data?.content as any)?.fields;
            const rawCat = traitData?.category || traitData?.Category || traitData?.name;
            const rawUrl = traitData?.image_url || traitData?.url || traitData?.image;
            if (rawCat && rawUrl && rawUrl.toLowerCase() !== 'none') {
              newGearMap[normalizeCategory(rawCat)] = rawUrl;
            }
          }
          if (active) {
            setGearMap(newGearMap);
            sessionStorage.setItem(cacheKey, JSON.stringify(newGearMap)); 
          }
        } else {
          if (active) {
            setGearMap({});
            sessionStorage.setItem(cacheKey, JSON.stringify({})); 
          }
        }
      } catch(e) {
        console.error("Thumbnail load error:", e);
      } finally {
        if (active) setIsDataLoading(false);
      }
    };
    fetchGear();
    return () => { active = false; };
  }, [id, suiClient, refreshCounter, index, retryRpc]);

  const activeUrls = [
    gearMap['background'],
    baseImg,
    gearMap['outfits'],
    gearMap['face'],
    gearMap['eye'],
    gearMap['jewelries'],
    gearMap['eyewear'],
    gearMap['headwear']
  ].filter(url => url && url.toLowerCase() !== 'none');
  
  const [failsafe, setFailsafe] = useState(false);
  useEffect(() => {
    setFailsafe(false);
    const timer = setTimeout(() => setFailsafe(true), 4000);
    return () => clearTimeout(timer);
  }, [isDataLoading, refreshCounter]);

  const isFullyRendered = failsafe || (!isDataLoading && activeUrls.length > 0 && imgLoadedCount >= activeUrls.length);

  return (
    <div 
      onClick={() => !isProcessingTx && onClick(id)}
      style={{ flexShrink: 0, width: '80px', height: '80px', cursor: isProcessingTx ? 'not-allowed' : 'pointer', border: isSelected ? '2px solid #06B6D4' : '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}
    >
      {!isFullyRendered && (
        <div style={{ position: 'absolute', zIndex: 10, width: '16px', height: '16px', border: '2px solid rgba(6, 182, 212, 0.2)', borderTopColor: '#06B6D4', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      )}
      
      <div style={{ opacity: isFullyRendered ? 1 : 0, transition: 'opacity 0.2s ease', width: '100%', height: '100%' }}>
        {activeUrls.map((url, idx) => (
          <img 
            key={`thumb-${url}-${idx}`} 
            src={url} 
            onLoad={() => setImgLoadedCount(p => p + 1)} 
            onError={() => setImgLoadedCount(p => p + 1)} 
            style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'contain', zIndex: idx + 1 }} 
            alt="" 
          />
        ))}
      </div>
    </div>
  );
};
// --------------------------------------------------------

function TerminalUI() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [activeView, setActiveView] = useState<'GENERATOR' | 'ARMORY' | 'ADMIN'>('GENERATOR');
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [equippedGear, setEquippedGear] = useState<Record<string, { objectId: string; imageUrl: string; name?: string }>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [imgLoadCount, setImgLoadCount] = useState(0);
  const [forceRender, setForceRender] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 12;

  const [mintQuantity, setMintQuantity] = useState<number>(1);
  const [isProcessingTx, setIsProcessingTx] = useState(false);
  const [txMessage, setTxMessage] = useState<string | null>(null);

  const displayTxMessage = (msg: string) => {
    setTxMessage(msg);
    setTimeout(() => setTxMessage(null), 6000);
  };

  const { data: registryObj, refetch: refetchRegistry } = useSuiClientQuery(
    'getObject',
    { id: REGISTRY_ID, options: { showContent: true } }
  );
  
  const regFields = (registryObj?.data?.content as any)?.fields;
  const currentPhase = regFields?.phase || 0; 
  const mintPriceMist = regFields?.mint_price || "5000000000";
  const publicIndex = regFields?.public_minted ? parseInt(regFields.public_minted) : 111;

  // FETCHING V1 DATA TYPES
  const { data: whitelistTickets, refetch: refetchTickets } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address as string,
      filter: { StructType: `${ORIGINAL_PACKAGE_ID}::operative::WhitelistTicket` },
    },
    { enabled: !!account && activeView === 'GENERATOR' }
  );
  
  const availableTickets = whitelistTickets?.data || [];
  const maxWlAllowed = availableTickets.length;

  const { data: ownedOperatives, refetch: refetchOperatives } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address as string,
      filter: { StructType: `${ORIGINAL_PACKAGE_ID}::operative::Operative` },
      options: { showContent: true },
    },
    { enabled: !!account }
  );

  const { data: looseTraits, refetch: refetchTraits } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address as string,
      filter: { StructType: `${ORIGINAL_PACKAGE_ID}::operative::Trait` },
      options: { showContent: true },
    },
    { enabled: !!account && activeView === 'ARMORY' }
  );

  useEffect(() => {
    if (ownedOperatives?.data?.length && !selectedOpId) {
      setSelectedOpId(ownedOperatives.data[0].data?.objectId || null);
    }
  }, [ownedOperatives, selectedOpId]);

  useEffect(() => {
    setForceRender(false);
    const timer = setTimeout(() => setForceRender(true), 4000);
    return () => clearTimeout(timer);
  }, [selectedOpId, isLoadingSlots]);

  const activeLoadRef = React.useRef<string | null>(null);

  const retryRpc = useCallback(async <T,>(fn: () => Promise<T>, retries = 5, delay = 1500): Promise<T> => {
    try {
      return await fn();
    } catch (err: any) {
      if (retries > 0 && (err?.status === 429 || err?.message?.includes('429') || err?.toString().includes('429'))) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return retryRpc(fn, retries - 1, delay * 1.5);
      }
      throw err;
    }
  }, []);

  const loadEquippedTraits = async (opId: string) => {
    activeLoadRef.current = opId;
    setImgLoadCount(0);
    setIsLoadingSlots(true);

    const cacheKey = `numbpolys_gear_full_${opId}`;
    const cachedData = sessionStorage.getItem(cacheKey);
    
    if (cachedData) {
      setEquippedGear(JSON.parse(cachedData));
      setIsLoadingSlots(false);
      return; 
    }

    setEquippedGear({}); 

    try {
      const dynamicFields = await retryRpc(() => suiClient.getDynamicFields({ parentId: opId }));
      if (activeLoadRef.current !== opId) return;

      let gearMap: Record<string, { objectId: string; imageUrl: string; name?: string }> = {};

      if (dynamicFields.data.length > 0) {
        const traitIds = dynamicFields.data.map(field => field.objectId);
        
        const childObjects = await retryRpc(() => suiClient.multiGetObjects({
          ids: traitIds,
          options: { showContent: true }
        }));

        if (activeLoadRef.current !== opId) return;

        for (const childObject of childObjects) {
          const traitData = (childObject.data?.content as any)?.fields;
          const rawCat = traitData?.category || traitData?.Category || traitData?.name;
          const rawUrl = traitData?.image_url || traitData?.url || traitData?.image;
          const traitName = traitData?.name || '';
          
          if (rawCat && rawUrl && rawUrl.toLowerCase() !== 'none') {
            const cleanCat = normalizeCategory(rawCat);
            gearMap[cleanCat] = {
              objectId: childObject.data!.objectId,
              imageUrl: rawUrl,
              name: traitName,
            };
          }
        }
      }

      if (activeLoadRef.current === opId) {
        setEquippedGear(gearMap);
        sessionStorage.setItem(cacheKey, JSON.stringify(gearMap)); 
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
    if (selectedOpId) {
      sessionStorage.removeItem(`numbpolys_gear_full_${selectedOpId}`);
      sessionStorage.removeItem(`numbpolys_gear_thumb_${selectedOpId}`);
      await loadEquippedTraits(selectedOpId);
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
    await refetchRegistry();
    await refetchTickets();
    await refetchTraits();
    await refetchOperatives();
    setRefreshCounter(prev => prev + 1); 
  };

  const handleEquip = (traitId: string, category: string) => {
    if (!selectedOpId || isProcessingTx) return;
    const normalizedTarget = normalizeCategory(category);
    if (equippedGear[normalizedTarget]) {
      displayTxMessage(`[ ERROR: SLOT ${normalizedTarget.toUpperCase()} IS ALREADY OCCUPIED ]`);
      return;
    }

    setIsProcessingTx(true);
    displayTxMessage(`[ PROCESSING EQUIP & SYNCING METADATA... ]`);
    
    const traitItem = looseTraits?.data.find(t => t.data?.objectId === traitId);
    const traitFields = (traitItem?.data?.content as any)?.fields;
    const traitName = traitFields?.name || '';

    let updatedLoreName = loreName;
    if (traitName && !loreName.includes(traitName)) {
      updatedLoreName = `${loreName} // ${traitName.toUpperCase()}`;
    }

    const tx = new Transaction();
    
    // EXECUTING V2 LOGIC
    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::equip_trait`,
      arguments: [tx.object(selectedOpId), tx.object(traitId)],
    });

    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::sync_metadata`,
      arguments: [
        tx.object(selectedOpId),
        tx.pure.string(updatedLoreName),
        tx.pure.string(baseBodyUrl),
      ],
    });

    signAndExecuteTransaction(
      { transaction: tx },
      {
        onSuccess: async () => {
          displayTxMessage(`[ SUCCESS: GEAR EQUIPPED & ON-CHAIN STATE SYNCED ]`);
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
    displayTxMessage(`[ PROCESSING UNEQUIP & SYNCING METADATA... ]`);

    const unequippedItem = equippedGear[category];
    const unequippedName = unequippedItem?.name || '';
    
    let updatedLoreName = loreName;
    if (unequippedName) {
      updatedLoreName = updatedLoreName.replace(` // ${unequippedName.toUpperCase()}`, '').trim();
    }

    const tx = new Transaction();
    
    // EXECUTING V2 LOGIC
    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::unequip_trait`,
      arguments: [tx.object(selectedOpId), tx.pure.string(category)],
    });

    tx.moveCall({
      target: `${LATEST_PACKAGE_ID}::operative::sync_metadata`,
      arguments: [
        tx.object(selectedOpId),
        tx.pure.string(updatedLoreName),
        tx.pure.string(baseBodyUrl),
      ],
    });

    signAndExecuteTransaction(
      { transaction: tx },
      {
        onSuccess: async () => {
          displayTxMessage(`[ SUCCESS: GEAR UNEQUIPPED & ON-CHAIN STATE SYNCED ]`);
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

  const handleDragStart = (e: React.DragEvent, type: 'loose' | 'equipped', payload: any) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, ...payload }));
  };

  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'loose') {
        handleEquip(data.objectId, data.category);
      }
    } catch (err) {}
  };

  const handleDropOnInventory = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'equipped') {
        handleUnequip(data.category);
      }
    } catch (err) {}
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
        const traitNames = traitCategories.map(k => {
          let val = tokenData.display_traits[k as keyof typeof tokenData.display_traits];
          if (typeof val === 'string' && val.includes('#')) val = val.split('#')[0].trim();
          return val;
        });
        
        const traitUrls = traitCategories.map(k => {
          const rawKey = k === 'Jewelry' ? 'Jeweleries' : k;
          return (tokenData.walrus_urls as any)[rawKey] || "None";
        });

        const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(mintPriceMist)]);

        if (currentPhase === 1) {
          // EXECUTING V2 LOGIC
          tx.moveCall({
            target: `${LATEST_PACKAGE_ID}::operative::whitelist_mint`,
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
          // EXECUTING V2 LOGIC
          tx.moveCall({
            target: `${LATEST_PACKAGE_ID}::operative::public_mint`,
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
  
  const totalPages = Math.ceil(displayOperatives.length / ITEMS_PER_PAGE);
  const paginatedOperatives = displayOperatives.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

  const activeOpData = displayOperatives.find((op: any) => (op.data?.objectId || op.address) === selectedOpId);
  const activeOpFields = (activeOpData?.data?.content as any)?.fields;
  const baseBodyUrl = activeOpFields?.image_url || activeOpFields?.url || '';
  
  const loreName = activeOpFields?.name || activeOpFields?.lore_name || (selectedOpId ? `OPERATIVE // ${selectedOpId.slice(0, 6)}...${selectedOpId.slice(-4)}` : '');

  const activeLayers = [
    equippedGear['background']?.imageUrl,
    baseBodyUrl,
    equippedGear['outfits']?.imageUrl,
    equippedGear['face']?.imageUrl,
    equippedGear['eye']?.imageUrl,
    equippedGear['jewelries']?.imageUrl,
    equippedGear['eyewear']?.imageUrl,
    equippedGear['headwear']?.imageUrl,
  ].filter(url => url && url.toLowerCase() !== 'none');

  const isFullyRendered = forceRender || (!isLoadingSlots && activeLayers.length > 0 && imgLoadCount >= activeLayers.length);

  const exportConstruct = async () => {
    if (isExporting || !selectedOpId) return;
    setIsExporting(true);
    displayTxMessage(`[ ASSEMBLING HIGH-RES EXPORT... ]`);

    try {
      const canvas = document.createElement('canvas');
      const size = 1000; 
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context failed");

      for (const url of activeLayers) {
        if (!url) continue;

        await new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          img.onload = () => {
            ctx.drawImage(img, 0, 0, size, size);
            resolve();
          };

          img.onerror = () => {
            const fallbackImg = new Image();
            fallbackImg.crossOrigin = 'anonymous';
            fallbackImg.onload = () => {
              ctx.drawImage(fallbackImg, 0, 0, size, size);
              resolve();
            };
            fallbackImg.onerror = () => resolve();
            fallbackImg.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
          };
          
          img.src = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`;
        });
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          displayTxMessage(`[ ERROR: IMAGE ENCODING FAILED ]`);
          setIsExporting(false);
          return;
        }

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        const safeLoreName = loreName 
          ? loreName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase() 
          : `NUMB_POLYS_${selectedOpId.slice(0,6)}`;
          
        link.download = `${safeLoreName}.png`;
        link.href = blobUrl;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        
        displayTxMessage(`[ SUCCESS: PFP EXPORTED ]`);
        setIsExporting(false);
      }, 'image/png');

    } catch (error) {
      console.error("Export error:", error);
      displayTxMessage(`[ ERROR: EXPORT FAILED ]`);
      setIsExporting(false);
    }
  };

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
        @keyframes spin { to { transform: rotate(360deg); } }
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
              <button onClick={() => !isProcessingTx && setActiveView('GENERATOR')} style={{ background: activeView === 'GENERATOR' ? '#E5E5E5' : 'rgba(255,255,255,0.03)', color: activeView === 'GENERATOR' ? '#0D0D11' : '#E5E5E5', padding: '6px 16px', border: '1px solid rgba(255,255,255,0.15)', cursor: isProcessingTx ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: '500', borderRadius: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>[ MINT ]</button>
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

        {activeView === 'GENERATOR' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', justifyContent: 'center', alignItems: 'center' }}>
            <div className="hud-frame" style={{ width: '100%', maxWidth: '400px', display: 'flex', justifyContent: 'center', borderRadius: '2px' }}>
              <div className="hud-corner-bottom" />
              <LayerStacker/>
            </div>

            <div style={{ width: '100%', maxWidth: '500px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                
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
            
            <div style={{ width: '100%', maxWidth: '800px', background: 'rgba(255,255,255,0.02)', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.85rem' }}>// SELECT CONSTRUCT</h3>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))} disabled={currentPage === 0 || isProcessingTx} style={{ background: 'transparent', color: '#E5E5E5', border: '1px solid rgba(255,255,255,0.2)', padding: '2px 8px', cursor: (currentPage === 0 || isProcessingTx) ? 'not-allowed' : 'pointer', fontSize: '10px', fontFamily: 'inherit' }}>[ PREV ]</button>
                    <span style={{ color: '#555', fontSize: '10px', alignSelf: 'center' }}>{currentPage + 1} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))} disabled={currentPage === totalPages - 1 || isProcessingTx} style={{ background: 'transparent', color: '#E5E5E5', border: '1px solid rgba(255,255,255,0.2)', padding: '2px 8px', cursor: (currentPage === totalPages - 1 || isProcessingTx) ? 'not-allowed' : 'pointer', fontSize: '10px', fontFamily: 'inherit' }}>[ NEXT ]</button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', overflowX: 'auto', gap: '10px', paddingBottom: '10px' }}>
                {paginatedOperatives.map((op: any, index: number) => (
                  <ConstructThumbnail 
                    key={op.data?.objectId || op.address} 
                    op={op} 
                    index={index}
                    isSelected={selectedOpId === (op.data?.objectId || op.address)} 
                    onClick={setSelectedOpId} 
                    suiClient={suiClient}
                    isProcessingTx={isProcessingTx}
                    refreshCounter={refreshCounter}
                    retryRpc={retryRpc}
                  />
                ))}
              </div>
            </div>

            {selectedOpId ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                
                <div style={{ background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '12px 24px', borderRadius: '2px', marginBottom: '2rem', width: '100%', maxWidth: '800px', textAlign: 'center' }}>
                  <h2 style={{ margin: 0, color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.1rem' }}>
                    {loreName}
                  </h2>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyContent: 'center', width: '100%' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '400px' }}>
                    <div 
                      className="hud-frame" 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDropOnCanvas}
                      style={{ width: '100%', display: 'flex', justifyContent: 'center', borderRadius: '2px' }}
                    >
                      <div className="hud-corner-bottom" />
                      <div style={{ position: 'relative', width: '380px', height: '380px', margin: '0 auto', background: 'rgba(0,0,0,0.3)' }}>
                        
                        {!isFullyRendered && (
                          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0D0D11', zIndex: 20 }}>
                            <div style={{ width: '40px', height: '40px', border: '3px solid rgba(6, 182, 212, 0.2)', borderTopColor: '#06B6D4', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
                            <span style={{ color: '#06B6D4', fontSize: '0.75rem', letterSpacing: '0.15em' }}>[ ASSEMBLING CONSTRUCT... ]</span>
                          </div>
                        )}

                        <div style={{ opacity: isFullyRendered ? 1 : 0, transition: 'opacity 0.2s ease', width: '100%', height: '100%' }}>
                          {activeLayers.map((url, idx) => (
                            <img 
                              key={`main-${selectedOpId}-${url}-${idx}`} 
                              src={url} 
                              onLoad={() => setImgLoadCount(p => p + 1)} 
                              onError={() => setImgLoadCount(p => p + 1)} 
                              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: idx + 1 }} 
                              alt="" 
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={exportConstruct}
                      disabled={!isFullyRendered || isExporting}
                      style={{ background: 'rgba(6, 182, 212, 0.05)', color: '#06B6D4', border: '1px solid rgba(6, 182, 212, 0.3)', padding: '10px', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 'bold', cursor: (!isFullyRendered || isExporting) ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: '2px', transition: 'all 0.3s ease', width: '100%' }}
                    >
                      {isExporting ? '[ RENDERING IMAGE... ]' : '[ EXPORT HIGH-RES PFP ]'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '400px' }}>
                    
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', backdropFilter: 'blur(12px)', borderRadius: '2px' }}>
                      <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.85rem' }}>// EQUIPPED (DRAG OFF TO UNEQUIP)</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {['background', 'face', 'eye', 'outfits', 'jewelries', 'headwear', 'eyewear'].map((slot) => {
                          const gear = equippedGear[slot];
                          return (
                            <div 
                              key={slot} 
                              draggable={!!gear && !isProcessingTx}
                              onDragStart={(e) => gear && handleDragStart(e, 'equipped', { category: slot })}
                              title={gear ? slot.toUpperCase() : `EMPTY ${slot.toUpperCase()}`}
                              style={{ aspectRatio: '1/1', border: '1px dashed rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: gear ? 'grab' : 'default', position: 'relative' }}
                            >
                              {gear && gear.imageUrl.toLowerCase() !== 'none' ? (
                                <img src={gear.imageUrl} style={{ width: '90%', height: '90%', objectFit: 'contain' }} alt={slot} />
                              ) : (
                                <span style={{ fontSize: '9px', color: '#555' }}>{slot.substring(0,3).toUpperCase()}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDropOnInventory}
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.2)', padding: '1rem', backdropFilter: 'blur(12px)', borderRadius: '2px', minHeight: '150px' }}
                    >
                      <h3 style={{ margin: '0 0 1rem 0', color: '#E5E5E5', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.85rem' }}>// INVENTORY (DRAG TO CHARACTER)</h3>
                      {!looseTraits?.data?.length ? (
                        <p style={{ color: '#555', fontSize: '0.75rem', textAlign: 'center' }}>[ INVENTORY EMPTY ]</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                          {looseTraits.data.map((item, idx) => {
                            const fields = (item.data?.content as any)?.fields;
                            const rawCat = fields?.category || fields?.Category || fields?.name;
                            const cat = normalizeCategory(rawCat);
                            const isSlotOccupied = cat ? !!equippedGear[cat] : false;
                            const imgUrl = fields?.image_url || fields?.url || '';

                            return (
                              <div 
                                key={idx} 
                                draggable={!isSlotOccupied && !isProcessingTx && !!cat}
                                onDragStart={(e) => cat && handleDragStart(e, 'loose', { objectId: item.data!.objectId, category: cat })}
                                style={{ aspectRatio: '1/1', border: isSlotOccupied ? '1px solid rgba(255,51,51,0.3)' : '1px solid rgba(255,255,255,0.2)', background: isSlotOccupied ? 'rgba(255,0,0,0.05)' : 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isSlotOccupied ? 'not-allowed' : 'grab', opacity: isSlotOccupied ? 0.3 : 1 }}
                                title={isSlotOccupied ? 'SLOT OCCUPIED' : cat?.toUpperCase()}
                              >
                                {imgUrl ? <img src={imgUrl} style={{ width: '90%', height: '90%', objectFit: 'contain', pointerEvents: 'none' }} alt="Trait" /> : <span style={{ fontSize: '9px', color: '#555' }}>IMG</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            ) : (
              <div style={{ width: '100%', maxWidth: '380px', height: '380px', border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A3A3A3', margin: '0 auto', background: 'rgba(255,255,255,0.01)', borderRadius: '2px' }}>
                AWAITING CONSTRUCT SELECTION...
              </div>
            )}
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