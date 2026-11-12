import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ConnectButton, 
  useCurrentAccount, 
  useSignAndExecuteTransaction,
  useSuiClient,
  SuiClientProvider, 
  WalletProvider
} from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { Canvas } from '@react-three/fiber';
import { ORIGINAL_PACKAGE_ID, REGISTRY_ID, V3_STATE_ID } from './config';
import { LayerStacker } from './LayerStacker';
import GridBackground from './components/GridBackground';
import {
  AdminDashboard,
  DEFAULT_PHASES,
  DEFAULT_PORTAL_SETTINGS,
  PhaseConfigItem,
  PortalSettings,
  mergePhasesWithDefaults
} from './AdminDashboard';
import { WhitelistPortal } from './WhitelistPortal';
import { HomePortal } from './HomePortal';
import registryData from './registry.json';
import '@mysten/dapp-kit/dist/index.css';

const ACTIVE_PACKAGE = "0x4b254bb4146094f1214106f7be8b5cfffd59e5a0f2a89f22ae3eef024d2fda0e";
const ADMIN_WALLET = "0xdb67bfb984df37d73755da48c166689e7d584b17cf6c23a680cb05d90f9653fb";

// --- OFFICIAL SUI MAINNET GRAPHQL ENDPOINT (CORS-OPEN, LIVE, NO JSON-RPC DEPRECATION) ---
const SUI_GRAPHQL_URL = 'https://graphql.mainnet.sui.io/graphql';

async function rawGqlCall(query: string, variables: Record<string, any> = {}): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

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

function formatGqlObject(node: any) {
  if (!node) return null;
  const addr = node.address || node.objectId;
  const moveObj = node.asMoveObject || node;
  const rawJson = moveObj?.contents?.json;
  const typeRepr = moveObj?.contents?.type?.repr || '';
  const fields = extractMoveFields(rawJson);

  const ownerInfo = node.owner;
  let formattedOwner: any = 'Immutable';
  if (ownerInfo?.__typename === 'Shared' || ownerInfo?.initialSharedVersion) {
    formattedOwner = {
      Shared: { initial_shared_version: String(ownerInfo.initialSharedVersion || 1) }
    };
  }

  return {
    data: {
      objectId: addr,
      version: String(node.version ?? moveObj?.version ?? '1'),
      digest: node.digest ?? moveObj?.digest ?? '',
      type: typeRepr,
      owner: formattedOwner,
      display: { data: fields },
      content: {
        dataType: 'moveObject',
        type: typeRepr,
        fields
      }
    }
  };
}

const suiRpc = {
  getObject: async (id: string): Promise<any> => {
    const data = await rawGqlCall(
      `query GetObj($id: SuiAddress!) {
        object(address: $id) {
          address
          version
          digest
          owner {
            __typename
            ... on Shared {
              initialSharedVersion
            }
          }
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
    if (!data?.object) throw new Error(`Object ${id} not found`);
    return formatGqlObject(data.object);
  },

  multiGetObjects: async (ids: string[]): Promise<any[]> => {
    const cleanIds = ids.map(id => id.trim()).filter(Boolean);
    if (!cleanIds.length) return [];

    const selections = cleanIds
      .map(
        (id, idx) => `
        o_${idx}: object(address: "${id}") {
          address
          version
          digest
          owner {
            __typename
            ... on Shared {
              initialSharedVersion
            }
          }
          asMoveObject {
            contents {
              type { repr }
              json
            }
          }
        }`
      )
      .join('\n');

    const data = await rawGqlCall(`query MultiGet { ${selections} }`);
    if (!data) return [];
    return cleanIds
      .map((_, idx) => formatGqlObject(data[`o_${idx}`]))
      .filter(Boolean);
  },

  getDynamicFields: async (parentId: string): Promise<{ data: any[] }> => {
    const data = await rawGqlCall(
      `query GetDynFields($parentId: SuiAddress!) {
        object(address: $parentId) {
          dynamicFields(first: 50) {
            nodes {
              name { json }
              value {
                __typename
                ... on MoveObject {
                  address
                  version
                  digest
                  contents {
                    type { repr }
                    json
                  }
                }
                ... on MoveValue {
                  json
                }
              }
            }
          }
        }
      }`,
      { parentId: parentId.trim() }
    );

    const nodes = data?.object?.dynamicFields?.nodes || [];
    const results: any[] = [];

    for (const n of nodes) {
      const val = n?.value;
      if (val?.__typename === 'MoveObject' && val.address) {
        results.push({
          objectId: val.address,
          name: n?.name?.json,
          _prefetched: formatGqlObject(val)
        });
      } else if (val?.json?.id) {
        results.push({
          objectId: typeof val.json.id === 'object' ? val.json.id.id : val.json.id,
          name: n?.name?.json
        });
      }
    }

    return { data: results };
  },

  getOwnedObjects: async (owner: string, structType: string): Promise<{ data: any[] }> => {
    const data = await rawGqlCall(
      `query GetOwned($owner: SuiAddress!, $type: String!) {
        address(address: $owner) {
          objects(first: 50, filter: { type: $type }) {
            nodes {
              address
              version
              digest
              contents {
                type { repr }
                json
              }
            }
          }
        }
      }`,
      { owner: owner.trim(), type: structType.trim() }
    );

    const nodes = data?.address?.objects?.nodes || [];
    return {
      data: nodes.map(formatGqlObject).filter(Boolean)
    };
  },

  resolveSuiNS: async (owner: string): Promise<string | null> => {
    try {
      const data = await rawGqlCall(
        `query GetSuiNSObj($owner: SuiAddress!) {
          address(address: $owner) {
            objects(first: 10, filter: { type: "0xd22b24490e0bae52676651b4f56660a5ff8022a2576e0089f79b3c88d44e08f0::suins_registration::SuinsRegistration" }) {
              nodes {
                contents {
                  json
                }
              }
            }
          }
        }`,
        { owner: owner.trim() }
      );
      const firstNode = data?.address?.objects?.nodes?.[0];
      const fields = extractMoveFields(firstNode?.contents?.json);
      const domainName = fields?.domain_name;
      return typeof domainName === 'string' && domainName ? domainName : null;
    } catch {
      return null;
    }
  },

  executeTransactionBlock: async ({
    transactionBlock,
    signature
  }: {
    transactionBlock: string | Uint8Array;
    signature: string | string[];
    options?: any;
  }) => {
    const txBytes =
      typeof transactionBlock === 'string'
        ? transactionBlock
        : btoa(String.fromCharCode(...Array.from(transactionBlock)));
    const signatures = Array.isArray(signature) ? signature : [signature];

    let data: any;
    try {
      data = await rawGqlCall(
        `mutation ExecTxBcs($txBytes: Base64!, $signatures: [Base64!]!) {
          executeTransaction(transactionDataBcs: $txBytes, signatures: $signatures) {
            effects {
              status
            }
          }
        }`,
        { txBytes, signatures }
      );
    } catch (err1: any) {
      const msg1 = String(err1?.message || '');
      if (msg1.includes('txBytes') || msg1.includes('Unknown argument')) {
        try {
          data = await rawGqlCall(
            `mutation ExecTxStr($txBytes: String!, $signatures: [String!]!) {
              executeTransaction(txBytes: $txBytes, signatures: $signatures) {
                effects {
                  status
                }
              }
            }`,
            { txBytes, signatures }
          );
        } catch {
          data = await rawGqlCall(
            `mutation ExecTxMin($txBytes: String!, $signatures: [String!]!) {
              executeTransaction(txBytes: $txBytes, signatures: $signatures) {
                __typename
              }
            }`,
            { txBytes, signatures }
          );
        }
      } else {
        data = await rawGqlCall(
          `mutation ExecTxBcsMin($txBytes: Base64!, $signatures: [Base64!]!) {
            executeTransaction(transactionDataBcs: $txBytes, signatures: $signatures) {
              __typename
            }
          }`,
          { txBytes, signatures }
        );
      }
    }

    const res = data?.executeTransaction;
    const status = res?.effects?.status;
    if (status === 'FAILURE') {
      throw new Error('Transaction execution failed on-chain');
    }

    return {
      digest: `tx_${Date.now()}`,
      effects: {
        status: { status: 'success' }
      }
    };
  }
};

const customGqlSuiClient = {
  resolveNameServiceNames: async ({ address }: { address: string }) => {
    const name = address ? await suiRpc.resolveSuiNS(address) : null;
    return { data: name ? [name] : [], hasNextPage: false, nextCursor: null };
  },
  getObject: async ({ id }: { id: string }) => suiRpc.getObject(id),
  multiGetObjects: async ({ ids }: { ids: string[] }) => suiRpc.multiGetObjects(ids || []),
  getDynamicFields: async ({ parentId }: { parentId: string }) => {
    const res = await suiRpc.getDynamicFields(parentId);
    return { data: res.data, hasNextPage: false, nextCursor: null };
  },
  getOwnedObjects: async ({ owner, filter }: { owner: string; filter?: { StructType?: string } }) => {
    const res = await suiRpc.getOwnedObjects(owner, filter?.StructType || '');
    return { data: res.data, hasNextPage: false, nextCursor: null };
  },
  getBalance: async ({ owner, coinType = '0x2::sui::SUI' }: { owner: string; coinType?: string }) => {
    const data = await rawGqlCall(
      `query GetBal($owner: SuiAddress!, $type: String!) {
        address(address: $owner) {
          balance(type: $type) {
            coinObjectCount
            totalBalance
          }
        }
      }`,
      { owner, type: coinType }
    );
    const bal = data?.address?.balance;
    return {
      coinType,
      coinObjectCount: bal?.coinObjectCount || 0,
      totalBalance: bal?.totalBalance || '0',
      lockedBalance: {}
    };
  },
  getCoins: async ({ owner, coinType = '0x2::sui::SUI' }: { owner: string; coinType?: string }) => {
    const fullCoinType = `0x2::coin::Coin<${coinType}>`;
    const data = await rawGqlCall(
      `query GetCoins($owner: SuiAddress!, $type: String!) {
        address(address: $owner) {
          objects(first: 50, filter: { type: $type }) {
            nodes {
              address
              version
              digest
              contents {
                json
              }
            }
          }
        }
      }`,
      { owner, type: fullCoinType }
    );
    const nodes = data?.address?.objects?.nodes || [];
    return {
      data: nodes.map((n: any) => {
        const fields = extractMoveFields(n?.contents?.json);
        return {
          coinType,
          coinObjectId: n.address,
          version: String(n.version || '1'),
          digest: n.digest || '',
          balance: String(fields?.balance ?? '0'),
          previousTransaction: ''
        };
      }),
      hasNextPage: false,
      nextCursor: null
    };
  },
  getReferenceGasPrice: async () => {
    try {
      const data = await rawGqlCall(
        `query GetGasPrice {
          epoch {
            referenceGasPrice
          }
        }`
      );
      return BigInt(data?.epoch?.referenceGasPrice || '1000');
    } catch {
      return BigInt(1000);
    }
  },
  executeTransactionBlock: suiRpc.executeTransactionBlock,
  waitForTransaction: async ({ digest }: { digest: string }) => ({ digest }),
  waitForTransactionBlock: async ({ digest }: { digest: string }) => ({ digest })
} as any;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 10000, retry: 2 },
  },
});

const networks = {
  mainnet: { url: SUI_GRAPHQL_URL }
} as any;

const normalizeCategory = (rawCat: string) => {
  if (!rawCat) return '';
  let cat = rawCat.toLowerCase().trim();
  if (cat === 'jewelry' || cat === 'jeweleries' || cat === 'jewelery' || cat === 'jewels') return 'jewelries';
  if (cat === 'outfit') return 'outfits';
  if (cat === 'eyes') return 'eye';
  return cat;
};

const toRoman = (num: number): string => {
  if (num <= 0) return '';
  const romanMap: [number, string][] = [ [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'] ];
  let res = '';
  let n = num;
  for (const [val, char] of romanMap) {
    while (n >= val) {
      res += char;
      n -= val;
    }
  }
  return res;
};

type TerminalViewType = 'HOME' | 'WHITELIST' | 'GENERATOR' | 'ARMORY' | 'TELEPORTER' | 'MARKETPLACE' | 'ADMIN';

function resolveInitialViewFromUrl(): TerminalViewType {
  if (typeof window === 'undefined') return 'HOME';
  const path = window.location.pathname.toLowerCase();
  if (path.includes('whitelist')) return 'WHITELIST';
  if (path.includes('mint') || path.includes('generator')) return 'GENERATOR';
  if (path.includes('armory')) return 'ARMORY';
  if (path.includes('teleporter')) return 'TELEPORTER';
  if (path.includes('marketplace') || path.includes('q8ry')) return 'MARKETPLACE';
  if (path.includes('overseer') || path.includes('admin')) return 'ADMIN';
  return 'HOME';
}

const ConstructThumbnail = React.memo(({ op, index, isSelected, activeGear, onClick, isProcessingTx, refreshCounter }: any) => {
  const id = op.data?.objectId || op.address;
  const fields = (op.data?.content as any)?.fields;
  
  const rawLoreName = fields?.name || fields?.lore_name || '';
  const cleanBaseName = rawLoreName.replace(/\s*\[MK\s+[IVXLCDM]+\]/gi, '').split(' // ')[0].trim();
  
  const stockToken = (registryData as any[]).find((item: any) => {
    return (item.lore_name || '').toLowerCase().trim() === cleanBaseName.toLowerCase().trim();
  });
  
  const baseImg = stockToken?.walrus_urls?.['Base Body'] || '';
  
  const [fetchedGearMap, setFetchedGearMap] = useState<Record<string, string>>({});
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [areImagesReady, setAreImagesReady] = useState(false);
  const [failsafe, setFailsafe] = useState(false);

  const gearMap = useMemo(() => {
    if (isSelected && activeGear) {
      const formatted: Record<string, string> = {};
      Object.keys(activeGear).forEach(key => {
        if (!activeGear[key].isNone) formatted[key] = activeGear[key].imageUrl;
      });
      return formatted;
    }
    return fetchedGearMap;
  }, [isSelected, activeGear, fetchedGearMap]);

  useEffect(() => {
    const timer = setTimeout(() => setFailsafe(true), 6000);
    return () => clearTimeout(timer);
  }, [id, refreshCounter]);

  useEffect(() => {
    let active = true;
    const fetchGear = async () => {
      setIsDataLoading(true);
      setFailsafe(false);

      const cacheKey = `numbpolys_gear_thumb_${id}`;
      const cachedData = sessionStorage.getItem(cacheKey);
      if (cachedData) {
        if (active) {
          setFetchedGearMap(JSON.parse(cachedData));
          setIsDataLoading(false);
        }
        return;
      }
      
      try {
        const delay = index < 3 ? (index * 50) : (150 + Math.random() * 250);
        await new Promise(resolve => setTimeout(resolve, delay));
        if (!active) return;

        const dynamicFields: any = await suiRpc.getDynamicFields(id);
        if (!active) return;
        
        if (dynamicFields?.data?.length > 0) {
          const prefetched = dynamicFields.data.map((f: any) => f._prefetched).filter(Boolean);
          let childObjects: any[] = prefetched;
          if (childObjects.length < dynamicFields.data.length) {
            const traitIds = dynamicFields.data.map((field: any) => field.objectId);
            childObjects = await suiRpc.multiGetObjects(traitIds);
          }
          if (!active) return;
          
          const newGearMap: Record<string, string> = {};
          for (const childObject of childObjects) {
            const traitData = (childObject.data?.content as any)?.fields;
            const rawCat = traitData?.category || traitData?.Category || traitData?.name;
            const rawUrl = traitData?.image_url || traitData?.url || traitData?.image;
            if (rawCat && rawUrl && rawUrl.toLowerCase() !== 'none' && rawUrl.toLowerCase() !== 'null') {
              newGearMap[normalizeCategory(rawCat)] = rawUrl;
            }
          }
          if (active) {
            setFetchedGearMap(newGearMap);
            sessionStorage.setItem(cacheKey, JSON.stringify(newGearMap));
          }
        } else {
          if (active) {
            setFetchedGearMap({});
            sessionStorage.setItem(cacheKey, JSON.stringify({}));
          }
        }
      } catch(e) {
        console.error("Thumbnail error:", e);
      } finally {
        if (active) setIsDataLoading(false);
      }
    };
    fetchGear();
    return () => { active = false; };
  }, [id, refreshCounter, index]);

  const activeUrls = [
    gearMap['background'],
    baseImg,
    gearMap['outfits'],
    gearMap['face'],
    gearMap['eye'],
    gearMap['jewelries'],
    gearMap['eyewear'],
    gearMap['headwear']
  ].filter(url => url && url.toLowerCase() !== 'none' && url.toLowerCase() !== 'null');

  useEffect(() => {
    if (isSelected && activeGear) setIsDataLoading(false);
    if (isDataLoading && !isSelected) return;
    let active = true;
    if (activeUrls.length === 0) {
      setAreImagesReady(true);
      return;
    }
    setAreImagesReady(false);
    let loadedCount = 0;

    activeUrls.forEach(url => {
      const img = new Image();
      const markLoaded = () => {
        if (active) {
          loadedCount++;
          if (loadedCount >= activeUrls.length) setAreImagesReady(true);
        }
      };
      img.onload = markLoaded;
      img.onerror = markLoaded;
      img.src = url;
    });

    return () => { active = false; };
  }, [isDataLoading, isSelected, activeGear, activeUrls.join(',')]);

  const isRolling = !failsafe && ((isDataLoading && !isSelected) || !areImagesReady);

  return (
    <div 
      onClick={() => !isProcessingTx && onClick(id)}
      style={{ 
        flexShrink: 0, 
        width: '80px', 
        height: '80px', 
        cursor: isProcessingTx ? 'not-allowed' : 'pointer', 
        border: isSelected ? '2px solid #06B6D4' : '1px solid rgba(255,255,255,0.2)', 
        background: 'rgba(0,0,0,0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        position: 'relative', 
        overflow: 'hidden' 
      }}
    >
      {isRolling && (
        <div style={{ 
          position: 'absolute', 
          zIndex: 10, 
          width: '20px', 
          height: '20px', 
          border: '2px solid rgba(6, 182, 212, 0.2)', 
          borderTopColor: '#06B6D4', 
          borderRadius: '50%', 
          animation: 'spin 1s linear infinite' 
        }} />
      )}
      <div style={{ opacity: isRolling ? 0 : 1, transition: 'opacity 0.2s ease', width: '100%', height: '100%' }}>
        {activeUrls.map((url, idx) => (
          <img 
            key={`thumb-${url}-${idx}`} 
            src={url} 
            style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'contain', zIndex: idx + 1 }} 
            alt="" 
          />
        ))}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isProcessingTx === nextProps.isProcessingTx &&
    prevProps.refreshCounter === nextProps.refreshCounter &&
    prevProps.activeGear === nextProps.activeGear &&
    (prevProps.op.data?.objectId || prevProps.op.address) === (nextProps.op.data?.objectId || nextProps.op.address)
  );
});

function TerminalUI() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [activeView, setActiveView] = useState<TerminalViewType>(resolveInitialViewFromUrl);
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  
  const [equippedGear, setEquippedGear] = useState<Record<string, { objectId: string; imageUrl: string; name?: string; originalCategory?: string; isNone?: boolean }>>({});
  
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [areMainImagesReady, setAreMainImagesReady] = useState(false);
  const [mainFailsafe, setMainFailsafe] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 12;
  const [mintQuantity, setMintQuantity] = useState<number>(1);
  const [isProcessingTx, setIsProcessingTx] = useState(false);
  const [txMessage, setTxMessage] = useState<string | null>(null);
  const [transferAddress, setTransferAddress] = useState<string>('');

  const [regFields, setRegFields] = useState<any>(null);
  const [displayOperatives, setDisplayOperatives] = useState<any[]>([]);
  const [looseTraitsList, setLooseTraitsList] = useState<any[]>([]);

  // Dynamic 6-Phase Config, Portal Settings & Per-Phase Whitelist Maps synced from Overseer
  const [phaseMatrix, setPhaseMatrix] = useState<PhaseConfigItem[]>(DEFAULT_PHASES);
  const [portalSettings, setPortalSettings] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  const [phaseWhitelists, setPhaseWhitelists] = useState<Record<string, Record<string, number>>>({
    '1': {},
    '2': {},
    '3': {}
  });
  const [localPhaseMintedCount, setLocalPhaseMintedCount] = useState<number>(0);

  const [globalProjectName, setGlobalProjectName] = useState('Numb Polys');
  const [globalProjectBio, setGlobalProjectBio] = useState('1,111 dynamic, composable 3D constructs on Sui Mainnet powered by Move and Walrus decentralized storage. Every trait is an independent, equippable on-chain object.');
  const [globalProjectUrl, setGlobalProjectUrl] = useState('https://mainnet.numbpolys.xyz');
  const [globalProjectImage, setGlobalProjectImage] = useState('');
  const [globalProjectBanner, setGlobalProjectBanner] = useState('');

  // Navigate and update browser URL (/, /whitelist, /mint, /armory, /teleporter, /marketplace, /overseer)
  const navigateToView = (target: TerminalViewType) => {
    if (isProcessingTx) return;
    setActiveView(target);
    const routeMap: Record<TerminalViewType, string> = {
      HOME: '/',
      WHITELIST: '/whitelist',
      GENERATOR: '/mint',
      ARMORY: '/armory',
      TELEPORTER: '/teleporter',
      MARKETPLACE: '/marketplace',
      ADMIN: '/overseer'
    };
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', routeMap[target] || '/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const onPopState = () => setActiveView(resolveInitialViewFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const displayTxMessage = (msg: string) => {
    setTxMessage(msg);
    setTimeout(() => setTxMessage(null), 8000);
  };

  // Sync Phase Names, Scheduled Dates, Portal Settings & Whitelist Maps from localStorage AND on-chain Display<Operative>
  const syncTerminalConfig = useCallback(async () => {
    try {
      const localRaw = localStorage.getItem('numbpolys_terminal_config_v1');
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        if (Array.isArray(parsed.phases) && parsed.phases.length === 6) {
          setPhaseMatrix(mergePhasesWithDefaults(parsed.phases));
        }
        if (parsed.portalSettings) {
          setPortalSettings({ ...DEFAULT_PORTAL_SETTINGS, ...parsed.portalSettings });
        }
        if (parsed.whitelists) {
          setPhaseWhitelists(parsed.whitelists);
        }
      }

      const objects: any = await suiRpc.getOwnedObjects(
        ADMIN_WALLET,
        `0x2::display::Display<${ORIGINAL_PACKAGE_ID}::operative::Operative>`
      );
      if (objects?.data?.length) {
        const displayObj = objects.data[0];
        const rawContents =
          displayObj.data?.content?.fields?.fields?.fields?.contents ||
          displayObj.data?.content?.fields?.fields?.contents ||
          displayObj.data?.content?.fields?.contents ||
          [];
        if (Array.isArray(rawContents)) {
          const cfgEntry = rawContents.find(
            (entry: any) => (entry?.fields?.key || entry?.key) === 'terminal_config'
          );
          const cfgVal = cfgEntry?.fields?.value || cfgEntry?.value;
          if (cfgVal && typeof cfgVal === 'string') {
            const decoded = JSON.parse(cfgVal);
            if (Array.isArray(decoded.phases) && decoded.phases.length === 6) {
              const merged = mergePhasesWithDefaults(decoded.phases);
              setPhaseMatrix(merged);
              decoded.phases = merged;
            }
            if (decoded.portalSettings) {
              setPortalSettings({ ...DEFAULT_PORTAL_SETTINGS, ...decoded.portalSettings });
            }
            if (decoded.whitelists) {
              setPhaseWhitelists(decoded.whitelists);
            }
            localStorage.setItem('numbpolys_terminal_config_v1', JSON.stringify(decoded));
          }
        }
      }
    } catch (e) {
      // Fallback silently to DEFAULT_PHASES if not set yet
    }
  }, []);

  useEffect(() => {
    syncTerminalConfig();
    const handleConfigUpdate = () => syncTerminalConfig();
    window.addEventListener('numbpolys_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('numbpolys_config_updated', handleConfigUpdate);
  }, [syncTerminalConfig]);

  const refetchRegistry = useCallback(async () => {
    try {
      const targetIds = [REGISTRY_ID, V3_STATE_ID].filter(id => typeof id === 'string' && id.trim().startsWith('0x') && id.trim().length > 10);
      let mergedFields: any = {};
      for (const id of targetIds) {
        try {
          const obj: any = await suiRpc.getObject(id.trim());
          const content = obj?.data?.content as any;
          if (content?.fields) mergedFields = { ...mergedFields, ...content.fields };
        } catch (innerErr) {
          console.warn(`Failed individual fetch for ${id}:`, innerErr);
        }
      }
      if (Object.keys(mergedFields).length > 0) setRegFields(mergedFields);
    } catch (err: any) {
      displayTxMessage(`[ RPC ERROR: ${err?.message || 'NETWORK BLOCKED'} ]`);
    }
  }, []);

  const refetchOperatives = useCallback(async () => {
    if (!account?.address) { setDisplayOperatives([]); return; }
    try {
      const packageTargets = Array.from(new Set([ORIGINAL_PACKAGE_ID, ACTIVE_PACKAGE].filter(Boolean)));
      let allOps: any[] = [];
      for (const pkg of packageTargets) {
        const res: any = await suiRpc.getOwnedObjects(account.address, `${pkg}::operative::Operative`);
        if (res?.data?.length) allOps = [...allOps, ...res.data];
      }
      const uniqueOps = Array.from(new Map(allOps.map(item => [item.data?.objectId, item])).values());
      setDisplayOperatives(uniqueOps);
    } catch (err) {
      console.error("Failed to fetch owned Operatives:", err);
    }
  }, [account?.address]);

  const refetchTraits = useCallback(async () => {
    if (!account?.address) { setLooseTraitsList([]); return; }
    try {
      const packageTargets = Array.from(new Set([ORIGINAL_PACKAGE_ID, ACTIVE_PACKAGE].filter(Boolean)));
      let allTraits: any[] = [];
      for (const pkg of packageTargets) {
        const res: any = await suiRpc.getOwnedObjects(account.address, `${pkg}::operative::Trait`);
        if (res?.data?.length) allTraits = [...allTraits, ...res.data];
      }
      const uniqueTraits = Array.from(new Map(allTraits.map(item => [item.data?.objectId, item])).values());
      setLooseTraitsList(uniqueTraits);
    } catch (err) {
      console.error("Failed to fetch loose Traits:", err);
    }
  }, [account?.address]);

  useEffect(() => {
    refetchRegistry();
    const interval = setInterval(refetchRegistry, 15000);
    return () => clearInterval(interval);
  }, [refetchRegistry]);

  useEffect(() => {
    refetchOperatives();
    refetchTraits();
  }, [account?.address, activeView, refetchOperatives, refetchTraits]);

  const rawPhase = regFields?.phase ?? regFields?.current_phase;
  const currentPhase = rawPhase !== undefined ? Number(rawPhase) : 0; 
  const rawMinted = regFields?.public_minted ?? regFields?.total_minted ?? regFields?.minted;
  const publicIndex = rawMinted !== undefined ? parseInt(String(rawMinted), 10) : 111;

  // Track both Ecosystem Vault Minted (e.g. 24) and Public/WL Minted (publicIndex - 111)
  const rawAdminMinted = regFields?.admin_minted ?? regFields?.reserve_minted;
  const adminMintedCount = rawAdminMinted !== undefined ? parseInt(String(rawAdminMinted), 10) : 0;
  const publicMintedCount = Math.max(0, publicIndex - 111);
  const totalMintedGlobal = adminMintedCount + publicMintedCount;

  // Live countdown across the entire 1,111 collection
  const totalRemainingConstructs = Math.max(0, 1111 - totalMintedGlobal);
  // Public/WL pool remaining (out of 1,000 index slots 111..1110)
  const totalRemainingSupply = Math.max(0, 1111 - publicIndex);
  
  const mintPriceMist = regFields?.mint_price ?? regFields?.price ?? "0"; 
  const mintPriceSui = Number(mintPriceMist) / 1000000000;

  const activeBatch = phaseMatrix.find(b => b.phase === currentPhase) || phaseMatrix[0] || DEFAULT_PHASES[0];
  const isWhitelistPhase = currentPhase >= 1 && currentPhase <= 3;
  const isFreeMintActive = currentPhase === 1 || (currentPhase > 0 && mintPriceSui === 0);

  // Compute cumulative batch boundaries & remaining supply for the active phase and all 6 phases
  const phaseStatsList = useMemo(() => {
    let runningStart = 0;
    return phaseMatrix.map((p) => {
      const alloc = Number(p.allocation) || 100;
      const startIdx = runningStart;
      const endIdx = runningStart + alloc;
      runningStart = endIdx;

      const mintedInPhase = Math.max(0, Math.min(alloc, publicMintedCount - startIdx));
      const remainingInPhase = Math.max(0, alloc - mintedInPhase);
      return {
        ...p,
        startIdx,
        endIdx,
        mintedInPhase,
        remainingInPhase
      };
    });
  }, [phaseMatrix, publicMintedCount]);

  const activePhaseStats = phaseStatsList.find(p => p.phase === currentPhase) || phaseStatsList[0];
  const remainingInCurrentPhase = activePhaseStats ? activePhaseStats.remainingInPhase : 0;
  const currentPhaseAllocation = activePhaseStats ? activePhaseStats.allocation : 100;

  // Per-wallet Whitelist & Free Mint allowance tracking
  const userAddressLower = account?.address?.toLowerCase() || '';
  const currentPhaseWlMap = isWhitelistPhase ? (phaseWhitelists[String(currentPhase)] || {}) : {};
  const walletMaxAllowance = isWhitelistPhase ? (currentPhaseWlMap[userAddressLower] ?? 0) : 999;

  useEffect(() => {
    if (!userAddressLower || !currentPhase) {
      setLocalPhaseMintedCount(0);
      return;
    }
    const storedCount = parseInt(
      localStorage.getItem(`numbpolys_minted_phase_${currentPhase}_${userAddressLower}`) || '0',
      10
    );
    if (currentPhase === 1 && storedCount === 0 && displayOperatives.length > 0 && walletMaxAllowance <= 1) {
      setLocalPhaseMintedCount(displayOperatives.length);
    } else {
      setLocalPhaseMintedCount(isNaN(storedCount) ? 0 : storedCount);
    }
  }, [userAddressLower, currentPhase, displayOperatives.length, walletMaxAllowance, refreshCounter]);

  const walletRemainingAllowance = isWhitelistPhase
    ? Math.max(0, Math.min(walletMaxAllowance - localPhaseMintedCount, remainingInCurrentPhase))
    : Math.min(remainingInCurrentPhase, totalRemainingSupply);

  const isWalletWhitelisted = !isWhitelistPhase || walletMaxAllowance > 0;

  useEffect(() => {
    const maxCap = isWhitelistPhase
      ? walletRemainingAllowance
      : Math.min(remainingInCurrentPhase, totalRemainingSupply);

    if (maxCap > 0 && mintQuantity > maxCap) {
      setMintQuantity(Math.min(5, maxCap));
    } else if (maxCap === 0 && mintQuantity !== 1) {
      setMintQuantity(1);
    }
  }, [isWhitelistPhase, walletRemainingAllowance, remainingInCurrentPhase, totalRemainingSupply, mintQuantity]);

  useEffect(() => {
    if (displayOperatives.length > 0 && (!selectedOpId || !displayOperatives.find(op => op.data?.objectId === selectedOpId))) {
      setSelectedOpId(displayOperatives[0].data?.objectId || null);
    }
  }, [displayOperatives, selectedOpId]);

  const activeLoadRef = React.useRef<string | null>(null);

  const loadEquippedTraits = async (opId: string) => {
    activeLoadRef.current = opId;
    setIsLoadingSlots(true);
    setMainFailsafe(false);
    const cacheKey = `numbpolys_gear_full_${opId}`;
    sessionStorage.removeItem(cacheKey);
    setEquippedGear({}); 

    try {
      const dynamicFields: any = await suiRpc.getDynamicFields(opId);
      if (activeLoadRef.current !== opId) return;

      let gearMap: Record<string, { objectId: string; imageUrl: string; name?: string; originalCategory?: string; isNone?: boolean }> = {};
      if (dynamicFields?.data?.length > 0) {
        const prefetched = dynamicFields.data.map((f: any) => f._prefetched).filter(Boolean);
        let childObjects: any[] = prefetched;
        if (childObjects.length < dynamicFields.data.length) {
          const traitIds = dynamicFields.data.map((field: any) => field.objectId);
          childObjects = await suiRpc.multiGetObjects(traitIds);
        }
        if (activeLoadRef.current !== opId) return;

        for (const childObject of childObjects) {
          const traitData = (childObject.data?.content as any)?.fields;
          const rawCat = traitData?.category || traitData?.Category || traitData?.name;
          const rawUrl = traitData?.image_url || traitData?.url || traitData?.image || '';
          const traitName = traitData?.name || '';
          
          if (rawCat) {
            const cleanCat = normalizeCategory(rawCat);
            const urlStr = String(rawUrl).toLowerCase();
            const nameStr = String(traitName).toLowerCase();
            const isNone = urlStr === 'none' || urlStr === 'null' || urlStr === '' || nameStr.includes('none') || nameStr.includes('null');
            gearMap[cleanCat] = { objectId: childObject.data!.objectId, imageUrl: rawUrl, name: traitName, originalCategory: rawCat, isNone: isNone };
          }
        }
      }
      if (activeLoadRef.current === opId) {
        setEquippedGear(gearMap);
        sessionStorage.setItem(cacheKey, JSON.stringify(gearMap)); 
      }
    } catch (err) {
      console.error('Failed to load gear:', err);
    } finally {
      if (activeLoadRef.current === opId) setIsLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (selectedOpId) {
      loadEquippedTraits(selectedOpId);
      const timer = setTimeout(() => setMainFailsafe(true), 6000);
      return () => clearTimeout(timer);
    }
  }, [selectedOpId, refreshCounter]);

  const refreshTerminalState = async () => {
    if (selectedOpId) {
      sessionStorage.removeItem(`numbpolys_gear_full_${selectedOpId}`);
      sessionStorage.removeItem(`numbpolys_gear_thumb_${selectedOpId}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (selectedOpId) await loadEquippedTraits(selectedOpId);
    await refetchRegistry();
    await refetchTraits();
    await refetchOperatives();
    setRefreshCounter(prev => prev + 1); 
  };

  const activeOpData = displayOperatives.find((op: any) => (op.data?.objectId || op.address) === selectedOpId);
  const activeOpFields = (activeOpData?.data?.content as any)?.fields;
  const rawLoreName = activeOpFields?.name || activeOpFields?.lore_name || (selectedOpId ? `OPERATIVE // ${selectedOpId.slice(0, 6)}...${selectedOpId.slice(-4)}` : '');
  const cleanBaseName = rawLoreName.replace(/\s*\[MK\s+[IVXLCDM]+\]/gi, '').split(' // ')[0].trim();

  const stockToken = useMemo(() => {
    if (!cleanBaseName) return null;
    return (registryData as any[]).find((item: any) => (item.lore_name || '').toLowerCase().trim() === cleanBaseName.toLowerCase());
  }, [cleanBaseName]);

  const baseBodyUrl = stockToken?.walrus_urls?.['Base Body'] || '';

  const modificationCount = useMemo(() => {
    if (!stockToken || !stockToken.display_traits) return 0;
    const stockMap: Record<string, string> = {};
    Object.keys(stockToken.display_traits).forEach((k) => {
      if (k === 'Rarity Tier') return;
      const normKey = normalizeCategory(k);
      let val = stockToken.display_traits[k];
      if (typeof val === 'string') {
        if (val.includes('#')) val = val.split('#')[0].trim();
        val = val.toLowerCase().trim();
      }
      if (val && val !== 'none' && val !== 'null') stockMap[normKey] = val;
    });

    const allCategories = ['background', 'face', 'eye', 'outfits', 'jewelries', 'headwear', 'eyewear'];
    let diffCount = 0;

    for (const cat of allCategories) {
      const stockVal = stockMap[cat] || 'none';
      const currentItem = equippedGear[cat];
      let currentVal = 'none';
      if (currentItem && !currentItem.isNone && currentItem.name) {
        let cName = currentItem.name;
        if (typeof cName === 'string') {
          if (cName.includes('#')) cName = cName.split('#')[0].trim();
          currentVal = cName.toLowerCase().trim();
        }
      }
      if (currentVal !== stockVal) diffCount++;
    }
    return diffCount;
  }, [stockToken, equippedGear]);

  const dynamicDisplayName = modificationCount > 0 ? `${cleanBaseName} [MK ${toRoman(modificationCount)}]` : cleanBaseName;

  const activeLayers = [
    equippedGear['background']?.isNone ? null : equippedGear['background']?.imageUrl,
    baseBodyUrl,
    equippedGear['outfits']?.isNone ? null : equippedGear['outfits']?.imageUrl,
    equippedGear['face']?.isNone ? null : equippedGear['face']?.imageUrl,
    equippedGear['eye']?.isNone ? null : equippedGear['eye']?.imageUrl,
    equippedGear['jewelries']?.isNone ? null : equippedGear['jewelries']?.imageUrl,
    equippedGear['eyewear']?.isNone ? null : equippedGear['eyewear']?.imageUrl,
    equippedGear['headwear']?.isNone ? null : equippedGear['headwear']?.imageUrl,
  ].filter(url => url);

  useEffect(() => {
    if (isLoadingSlots) return;
    let active = true;
    if (activeLayers.length === 0) { setAreMainImagesReady(true); return; }
    setAreMainImagesReady(false);
    let loadedCount = 0;
    activeLayers.forEach(url => {
      if(!url) return;
      const img = new Image();
      const markLoaded = () => { if (active) { loadedCount++; if (loadedCount >= activeLayers.length) setAreMainImagesReady(true); } };
      img.onload = markLoaded;
      img.onerror = markLoaded;
      img.src = url;
    });
    return () => { active = false; };
  }, [isLoadingSlots, activeLayers.join(',')]);

  const isMainRolling = !mainFailsafe && (isLoadingSlots || !areMainImagesReady);

  const generateAndUploadSnapshot = async (layersToRender: (string | null | undefined)[]): Promise<string> => {
    const validUrls = layersToRender.filter(url => url) as string[];
    const canvas = document.createElement('canvas');
    const size = 1000; 
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context failed");

    for (const url of validUrls) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { ctx.drawImage(img, 0, 0, size, size); resolve(); };
        img.onerror = () => {
          const fallbackImg = new Image();
          fallbackImg.crossOrigin = 'anonymous';
          fallbackImg.onload = () => { ctx.drawImage(fallbackImg, 0, 0, size, size); resolve(); };
          fallbackImg.onerror = () => resolve(); 
          fallbackImg.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        };
        img.src = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`;
      });
    }

    return new Promise<string>((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error("Blob encoding failed"));

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000); 

          const response = await fetch('/walrus-upload/v1/blobs?epochs=53', {
            method: 'PUT',
            body: blob,
            signal: controller.signal
          });
          clearTimeout(timeout);
          
          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Upload Rejected [${response.status}]: ${errText.slice(0, 40)}`);
          }
          
          const data = await response.json();
          const blobId = data.newlyCreated?.blobObject?.blobId || data.alreadyCertified?.blobId;
          
          if (!blobId) throw new Error("Missing Blob ID from Walrus");
          
          return resolve(`https://wsrv.nl/?url=https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}&output=png&v=${Date.now()}`);
        } catch (error: any) {
          if (error.name === 'AbortError') {
            reject(new Error(`Upload timed out after 15 seconds.`));
          } else {
            reject(error);
          }
        }
      }, 'image/png');
    });
  };

  const handleSyncVisuals = async () => {
    if (!selectedOpId || isProcessingTx || isMainRolling) return;
    setIsProcessingTx(true);
    displayTxMessage(`[ COMPILING VISUALS & SECURING TO WALRUS... PLEASE WAIT ]`);

    try {
      const snapshotUrl = await generateAndUploadSnapshot(activeLayers);
      
      displayTxMessage(`[ UPLOAD COMPLETE. SYNCING SUI METADATA... PLEASE SIGN ]`);
      
      const tx = new Transaction();
      tx.moveCall({
        target: `${ACTIVE_PACKAGE}::operative::sync_metadata`,
        arguments: [
          tx.object(selectedOpId),
          tx.pure.string(dynamicDisplayName), 
          tx.pure.string(snapshotUrl), 
        ],
      });

      signAndExecuteTransaction(
        { transaction: tx as any },
        {
          onSuccess: async () => {
            displayTxMessage(`[ SUCCESS: GLOBAL VISUALS & STATUS SYNCED ]`);
            await refreshTerminalState();
            setIsProcessingTx(false);
          },
          onError: (err: any) => {
            const errMsg = err?.message?.split('\n')[0] || "TRANSACTION REJECTED";
            displayTxMessage(`[ ERROR: ${errMsg.slice(0, 60)} ]`);
            setIsProcessingTx(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Compilation/Upload Error:", error);
      const errMsg = error?.message || typeof error === 'string' ? error : "UNKNOWN COMPILATION ERROR";
      displayTxMessage(`[ ERROR: ${String(errMsg).toUpperCase().slice(0, 100)} ]`);
      setIsProcessingTx(false);
    }
  };

  const handleUpdateCollectionMetadata = async (forcedMode?: 'add' | 'edit') => {
    if (isProcessingTx || !globalProjectName || !account) return;
    setIsProcessingTx(true);
    displayTxMessage(`[ LOCATING DISPLAY OBJECT & CHECKING EXISTING KEYS... ]`);

    try {
      const objects: any = await suiRpc.getOwnedObjects(account.address, `0x2::display::Display<${ORIGINAL_PACKAGE_ID}::operative::Operative>`);
      if (!objects?.data?.length) { 
        displayTxMessage(`[ ERROR: DISPLAY OBJECT NOT FOUND IN ADMIN WALLET ]`); 
        setIsProcessingTx(false); return; 
      }
      
      const displayObj = objects.data[0];
      const displayId = displayObj.data?.objectId;
      if (!displayId) throw new Error("Invalid Display Object ID");

      const rawContents = (displayObj.data?.content as any)?.fields?.fields?.fields?.contents || (displayObj.data?.content as any)?.fields?.fields?.contents || [];
      const existingKeys = new Set<string>(Array.isArray(rawContents) ? rawContents.map((entry: any) => entry?.fields?.key || entry?.key).filter(Boolean) : Object.keys(rawContents));

      displayTxMessage(`[ INJECTING FULL ON-CHAIN DISPLAY METADATA... PLEASE SIGN ]`);

      const tx = new Transaction();
      const typeArg = `${ORIGINAL_PACKAGE_ID}::operative::Operative`;
      const compositeDescription = globalProjectBio.trim() ? `{lore_name} // Rarity: {rarity_tier} // Construct #{mint_id} — ${globalProjectBio.trim()}` : `{lore_name} // Rarity: {rarity_tier} // Construct #{mint_id}`;

      const metadataEntries: [string, string][] = [
        ['name', '{lore_name}'], ['image_url', '{image_url}'], ['thumbnail_url', '{image_url}'],
        ['description', compositeDescription], ['rarity_tier', '{rarity_tier}'], ['mint_id', '{mint_id}'],
        ['attributes', '{rarity_tier}'], ['project_name', globalProjectName.trim()],
        ['project_url', globalProjectUrl.trim() || 'https://mainnet.numbpolys.xyz'], ['creator', 'Numb Polys Syndicate'],
      ];

      if (globalProjectImage.trim()) metadataEntries.push(['project_image_url', globalProjectImage.trim()]);
      if (globalProjectBanner.trim()) metadataEntries.push(['banner_url', globalProjectBanner.trim()]);

      for (const [key, value] of metadataEntries) {
        const callMode = existingKeys.size > 0 ? (existingKeys.has(key) ? 'edit' : 'add') : (forcedMode || 'edit');
        tx.moveCall({ target: `0x2::display::${callMode}`, typeArguments: [typeArg], arguments: [tx.object(displayId), tx.pure.string(key), tx.pure.string(value)] });
      }
      
      tx.moveCall({ target: '0x2::display::update_version', typeArguments: [typeArg], arguments: [tx.object(displayId)] });
      
      signAndExecuteTransaction({ transaction: tx as any }, {
        onSuccess: () => { displayTxMessage(`[ SUCCESS: ON-CHAIN DISPLAY, RARITY & IDENTITY SYNCED ]`); setIsProcessingTx(false); },
        onError: (err: any) => { const errMsg = err?.message?.split('\n')[0] || "DISPLAY TRANSACTION REJECTED"; displayTxMessage(`[ ERROR: ${errMsg.slice(0, 60)} ]`); setIsProcessingTx(false); }
      });
    } catch(e: any) { 
      displayTxMessage(`[ ERROR: ${e.message} ]`); setIsProcessingTx(false);
    }
  };

  const handleEquip = async (traitId: string, category: string) => {
    if (!selectedOpId || isProcessingTx) return;
    const normalizedTarget = normalizeCategory(category);
    const existingGear = equippedGear[normalizedTarget];

    if (existingGear) { displayTxMessage(`[ ERROR: SLOT IS OCCUPIED. UNEQUIP FIRST. ]`); return; }

    setIsProcessingTx(true);
    displayTxMessage(`[ ATTACHING TRAIT... PLEASE SIGN ]`);

    const tx = new Transaction();
    tx.moveCall({ target: `${ACTIVE_PACKAGE}::operative::equip_trait`, arguments: [tx.object(selectedOpId), tx.object(traitId)] });

    signAndExecuteTransaction({ transaction: tx as any }, {
      onSuccess: async () => { displayTxMessage(`[ SUCCESS: GEAR ATTACHED. REMEMBER TO SYNC VISUALS. ]`); await refreshTerminalState(); setIsProcessingTx(false); },
      onError: (err: any) => { const errMsg = err?.message?.split('\n')[0] || "TRANSACTION REJECTED"; displayTxMessage(`[ ERROR: ${errMsg.slice(0, 60)} ]`); setIsProcessingTx(false); },
    });
  };

  const handleUnequip = async (category: string) => {
    if (!selectedOpId || !account || isProcessingTx) return;

    setIsProcessingTx(true);
    displayTxMessage(`[ DETACHING TRAIT... PLEASE SIGN ]`);

    const unequippedItem = equippedGear[category];
    const onChainCategory = unequippedItem?.originalCategory || category.charAt(0).toUpperCase() + category.slice(1);
    
    const tx = new Transaction();
    tx.moveCall({ 
      target: `${ACTIVE_PACKAGE}::operative::unequip_trait`, 
      arguments: [tx.object(selectedOpId), tx.pure.string(onChainCategory)] 
    });

    signAndExecuteTransaction({ transaction: tx as any }, {
      onSuccess: async () => { displayTxMessage(`[ SUCCESS: GEAR DETACHED. REMEMBER TO SYNC VISUALS. ]`); await refreshTerminalState(); setIsProcessingTx(false); },
      onError: (err: any) => { const errMsg = err?.message?.split('\n')[0] || "TRANSACTION REJECTED"; displayTxMessage(`[ ERROR: ${errMsg.slice(0, 60)} ]`); setIsProcessingTx(false); },
    });
  };

  const handleTransfer = (objectId: string, itemType: 'CONSTRUCT' | 'TRAIT') => {
    if (!transferAddress.trim() || !transferAddress.startsWith('0x') || transferAddress.length !== 66) { displayTxMessage(`[ ERROR: INVALID SUI ADDRESS FORMAT ]`); return; }
    setIsProcessingTx(true);
    displayTxMessage(`[ INITIATING ${itemType} TRANSFER... PLEASE SIGN ]`);

    try {
      const tx = new Transaction();
      tx.transferObjects([tx.object(objectId)], tx.pure.address(transferAddress.trim()));

      signAndExecuteTransaction({ transaction: tx as any }, {
        onSuccess: async () => {
          displayTxMessage(`[ SUCCESS: ${itemType} TRANSMITTED TO RECIPIENT ]`);
          if (itemType === 'CONSTRUCT' && selectedOpId === objectId) setSelectedOpId(null);
          await new Promise(resolve => setTimeout(resolve, 3000));
          await refreshTerminalState();
          setTransferAddress('');
          setIsProcessingTx(false);
        },
        onError: (err: any) => { const errMsg = err?.message?.split('\n')[0] || "TRANSFER FAILED"; displayTxMessage(`[ ERROR: ${errMsg.slice(0, 60)} ]`); setIsProcessingTx(false); }
      });
    } catch (err: any) { displayTxMessage(`[ ERROR: ${err.message} ]`); setIsProcessingTx(false); }
  };

  const handleDragStart = (e: React.DragEvent, type: 'loose' | 'equipped', payload: any) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, ...payload }));
  };
  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'loose') handleEquip(data.objectId, data.category);
    } catch (err) {}
  };
  const handleDropOnInventory = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'equipped') handleUnequip(data.category);
    } catch (err) {}
  };

  const mintOperative = async () => {
    if (!account || isProcessingTx || currentPhase === 0 || totalRemainingSupply <= 0 || remainingInCurrentPhase <= 0) return;

    if (isWhitelistPhase) {
      if (!isWalletWhitelisted) {
        displayTxMessage(`[ ERROR: WALLET NOT WHITELISTED FOR ${activeBatch.name.toUpperCase()} ]`);
        return;
      }
      if (walletRemainingAllowance <= 0) {
        displayTxMessage(`[ ERROR: PHASE ALLOCATION CLAIMED (${walletMaxAllowance} MAX FOR THIS WALLET) ]`);
        return;
      }
    }

    const actualCount = isWhitelistPhase
      ? Math.min(mintQuantity, walletRemainingAllowance, remainingInCurrentPhase, totalRemainingSupply)
      : Math.min(mintQuantity, remainingInCurrentPhase, totalRemainingSupply);

    setIsProcessingTx(true);
    displayTxMessage(`[ PREPARING DEPLOYMENT (${actualCount} CONSTRUCT${actualCount > 1 ? 'S' : ''})... PLEASE SIGN ]`);

    try {
      const tx = new Transaction();
      for (let i = 0; i < actualCount; i++) {
        const tokenData = registryData[publicIndex + i];
        if (!tokenData) throw new Error("Metadata index out of bounds");

        const traitCategories: string[] = [];
        const traitNames: string[] = [];
        const traitUrls: string[] = [];

        Object.keys(tokenData.display_traits).forEach(k => {
          if (k === 'Rarity Tier') return;
          let nameVal = tokenData.display_traits[k as keyof typeof tokenData.display_traits];
          if (typeof nameVal === 'string' && nameVal.includes('#')) nameVal = nameVal.split('#')[0].trim();
          const rawKey = k === 'Jewelry' ? 'Jeweleries' : k;
          const urlVal = (tokenData.walrus_urls as any)[rawKey];

          if (urlVal !== null && urlVal !== "None" && urlVal !== "null" && nameVal !== "None") {
            traitCategories.push(k); traitNames.push(nameVal); traitUrls.push(urlVal);
          }
        });

        const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(mintPriceMist)]);
        tx.moveCall({ 
          target: `${ACTIVE_PACKAGE}::operative::public_mint`, 
          arguments: [ tx.object(REGISTRY_ID), feeCoin, tx.pure.string(tokenData.lore_name), tx.pure.string(tokenData.display_traits['Rarity Tier']), tx.pure.string((tokenData.walrus_urls as any)['Base Body'] || ""), tx.pure.vector('string', traitCategories), tx.pure.vector('string', traitNames), tx.pure.vector('string', traitUrls) ] 
        });
      }

      signAndExecuteTransaction({ transaction: tx as any }, {
        onSuccess: async () => {
          if (account?.address) {
            const addrKey = `numbpolys_minted_phase_${currentPhase}_${account.address.toLowerCase()}`;
            const updatedCount = localPhaseMintedCount + actualCount;
            localStorage.setItem(addrKey, String(updatedCount));
            setLocalPhaseMintedCount(updatedCount);
          }
          displayTxMessage(`[ SUCCESS: ${actualCount} CONSTRUCT(S) DEPLOYED ]`);
          await refreshTerminalState();
          setMintQuantity(1);
          setIsProcessingTx(false);
        },
        onError: (err: any) => { const errMsg = err?.message?.split('\n')[0] || "TRANSACTION REJECTED"; displayTxMessage(`[ ERROR: ${errMsg.slice(0, 60)} ]`); setIsProcessingTx(false); }
      });
    } catch (err: any) { displayTxMessage(`[ ERROR: ${err.message || "INITIALIZATION FAILED"} ]`); setIsProcessingTx(false); }
  };
  
  const totalPages = Math.ceil(displayOperatives.length / ITEMS_PER_PAGE);
  const paginatedOperatives = displayOperatives.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

  const exportConstruct = async () => {
    if (isExporting || !selectedOpId || isMainRolling) return;
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
          img.onload = () => { ctx.drawImage(img, 0, 0, size, size); resolve(); };
          img.onerror = () => {
            const fallbackImg = new Image();
            fallbackImg.crossOrigin = 'anonymous';
            fallbackImg.onload = () => { ctx.drawImage(fallbackImg, 0, 0, size, size); resolve(); };
            fallbackImg.onerror = () => resolve(); 
            fallbackImg.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
          };
          img.src = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`;
        });
      }

      canvas.toBlob((blob) => {
        if (!blob) { displayTxMessage(`[ ERROR: IMAGE ENCODING FAILED ]`); setIsExporting(false); return; }
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeLoreName = dynamicDisplayName ? dynamicDisplayName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase() : `NUMB_POLYS_${selectedOpId.slice(0,6)}`;
        link.download = `${safeLoreName}.png`;
        link.href = blobUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        displayTxMessage(`[ SUCCESS: PFP EXPORTED ]`);
        setIsExporting(false);
      }, 'image/png');
    } catch (error) { displayTxMessage(`[ ERROR: EXPORT FAILED ]`); setIsExporting(false); }
  };

  let buttonText = isProcessingTx ? '⚡ PROCESSING...' : '⚡ CONNECT TERMINAL WALLET';
  let buttonDisabled = !account || isProcessingTx;
  let buttonStyle = { padding: '14px', background: account ? '#E5E5E5' : 'rgba(255,255,255,0.03)', color: account ? '#0D0D11' : '#555', border: account ? '1px solid #E5E5E5' : '1px solid rgba(255,255,255,0.1)', cursor: account ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontWeight: '600', borderRadius: '2px', textTransform: 'uppercase' as const, letterSpacing: '0.1em', transition: 'all 0.3s ease', width: '100%' };

  if (account) {
    if (!regFields) {
      buttonText = '⚡ SYNCING ON-CHAIN STATE...'; buttonDisabled = true; buttonStyle.background = 'rgba(6, 182, 212, 0.08)'; buttonStyle.color = '#06B6D4'; buttonStyle.border = '1px dashed #06B6D4'; buttonStyle.cursor = 'wait';
    } else if (currentPhase === 0) {
      buttonText = 'MINT PAUSED'; buttonDisabled = true; buttonStyle.background = 'rgba(255,51,51,0.1)'; buttonStyle.color = '#ff3333'; buttonStyle.border = '1px dashed #ff3333'; buttonStyle.cursor = 'not-allowed';
    } else if (totalRemainingSupply <= 0 || totalRemainingConstructs <= 0) {
      buttonText = '[ COLLECTION SUPPLY DEPLETED ]'; buttonDisabled = true; buttonStyle.background = 'rgba(255, 165, 0, 0.05)'; buttonStyle.color = 'orange'; buttonStyle.border = '1px dashed orange'; buttonStyle.cursor = 'not-allowed';
    } else if (remainingInCurrentPhase <= 0) {
      buttonText = `[ PHASE 0${currentPhase} ALLOCATION DEPLETED ]`; buttonDisabled = true; buttonStyle.background = 'rgba(255, 165, 0, 0.05)'; buttonStyle.color = 'orange'; buttonStyle.border = '1px dashed orange'; buttonStyle.cursor = 'not-allowed';
    } else if (isWhitelistPhase && !isWalletWhitelisted) {
      buttonText = `[ WALLET NOT ELIGIBLE FOR PHASE 0${currentPhase} ]`; buttonDisabled = true; buttonStyle.background = 'rgba(255, 51, 51, 0.08)'; buttonStyle.color = '#ff3333'; buttonStyle.border = '1px dashed #ff3333'; buttonStyle.cursor = 'not-allowed';
    } else if (isWhitelistPhase && walletRemainingAllowance <= 0) {
      buttonText = `[ PHASE 0${currentPhase} ALLOCATION CLAIMED (${walletMaxAllowance} MAX) ]`; buttonDisabled = true; buttonStyle.background = 'rgba(255, 51, 51, 0.08)'; buttonStyle.color = '#ff3333'; buttonStyle.border = '1px dashed #ff3333'; buttonStyle.cursor = 'not-allowed';
    } else if (isFreeMintActive) {
      buttonText = isProcessingTx ? '⚡ PROCESSING...' : `⚡ DEPLOY ${mintQuantity} CONSTRUCT(S) [ FREE MINT // ${walletRemainingAllowance} LEFT ]`; buttonDisabled = isProcessingTx; buttonStyle.background = 'rgba(0, 255, 128, 0.12)'; buttonStyle.color = '#00ff80'; buttonStyle.border = '1px solid #00ff80';
    } else {
      const totalCost = mintQuantity * mintPriceSui;
      buttonText = isProcessingTx ? '⚡ PROCESSING...' : `⚡ DEPLOY ${mintQuantity} CONSTRUCT(S) [ ${totalCost.toFixed(2).replace(/\.00$/, '')} SUI ]`; buttonDisabled = isProcessingTx; buttonStyle.background = 'rgba(6, 182, 212, 0.1)'; buttonStyle.color = '#06B6D4'; buttonStyle.border = '1px solid #06B6D4';
    }
  }

  const slotLabels: Record<string, string> = { 'background': 'BKG', 'face': 'FAC', 'eye': 'EYE', 'outfits': 'OUT', 'jewelries': 'JEW', 'headwear': 'HEA', 'eyewear': 'EYW' };

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
        .terminal-scroller { display: flex; gap: 1rem; overflow-x: auto; width: 100%; box-sizing: border-box; padding: 0.5rem; justify-content: flex-start; -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: #06B6D4 rgba(255, 255, 255, 0.05); }
        .terminal-scroller::-webkit-scrollbar { height: 4px; }
        .terminal-scroller::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
        .terminal-scroller::-webkit-scrollbar-thumb { background: #06B6D4; border-radius: 2px; }
      `}</style>

      <div className="crt-overlay" />
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
        <Canvas camera={{ position: [0, 0, 8], fov: 50 }} style={{ width: '100%', height: '100%' }}>
          <ambientLight intensity={1} />
          <GridBackground />
        </Canvas>
      </div>

      <div style={{ padding: '1.5rem', position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto' }}>
        {/* CLEAN MOBILE-FRIENDLY HEADER */}
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <h1 
              onClick={() => navigateToView('HOME')} 
              style={{ margin: 0, fontSize: '1.2rem', letterSpacing: '2px', color: '#ffffff', cursor: 'pointer' }}
            >
              NUMB_POLYS // TERMINAL
            </h1>
            {activeView !== 'HOME' && (
              <button
                onClick={() => navigateToView('HOME')}
                disabled={isProcessingTx}
                style={{
                  background: 'rgba(6, 182, 212, 0.1)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  color: '#06B6D4',
                  padding: '6px 14px',
                  borderRadius: '2px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: isProcessingTx ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#06B6D4'; e.currentTarget.style.color = '#0D0D11'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(6, 182, 212, 0.1)'; e.currentTarget.style.color = '#06B6D4'; }}
              >
                [ ← RETURN TO TERMINAL DIRECTORY ]
              </button>
            )}
          </div>
          <div className="neon-wallet-override">
            <ConnectButton />
          </div>
        </header>

        {txMessage && (
          <div style={{ width: '100%', maxWidth: '500px', margin: '0 auto 2rem auto', padding: '12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: txMessage.includes('ERROR') ? 'rgba(255, 0, 0, 0.15)' : 'rgba(6, 182, 212, 0.15)', border: `1px solid ${txMessage.includes('ERROR') ? '#ff3333' : '#06B6D4'}`, color: txMessage.includes('ERROR') ? '#ff3333' : '#06B6D4', boxShadow: `0 0 15px ${txMessage.includes('ERROR') ? 'rgba(255,0,0,0.3)' : 'rgba(6,182,212,0.3)'}`, backdropFilter: 'blur(4px)' }}>
            {txMessage}
          </div>
        )}

        {activeView === 'HOME' ? (
          <HomePortal 
            onNavigate={(view) => navigateToView(view)} 
            isAdmin={account?.address === ADMIN_WALLET} 
          />
        ) : activeView === 'WHITELIST' ? (
          <WhitelistPortal
            accountAddress={account?.address}
            currentPhase={currentPhase}
            phaseStatsList={phaseStatsList}
            phaseWhitelists={phaseWhitelists}
            portalSettings={portalSettings}
            totalRemainingConstructs={totalRemainingConstructs}
            totalMintedGlobal={totalMintedGlobal}
            displayOperativesCount={displayOperatives.length}
          />
        ) : activeView === 'TELEPORTER' || activeView === 'MARKETPLACE' ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '55vh', width: '100%' }}>
            <div className="hud-frame" style={{ maxWidth: '540px', width: '100%', padding: '3rem 2rem', textAlign: 'center', background: 'rgba(0,0,0,0.65)' }}>
              <div className="hud-corner-bottom" />
              <div style={{ fontSize: '10px', color: '#ff3333', letterSpacing: '0.2em', fontWeight: 'bold', marginBottom: '0.75rem' }}>
                // CLASSIFIED PROTOCOL MODULE //
              </div>
              <h2 style={{ margin: '0 0 1rem 0', color: '#06B6D4', fontSize: '1.35rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                {activeView === 'TELEPORTER' ? 'THE TELEPORTER // STANDBY' : 'SYNDICATE MARKETPLACE // STANDBY'}
              </h2>
              <p style={{ color: '#A3A3A3', fontSize: '0.85rem', lineHeight: '1.6', margin: '0 0 1.75rem 0' }}>
                This terminal module is encrypted and scheduled for activation immediately following the completion of the 1,111 Construct Genesis Deployment.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigateToView('WHITELIST')}
                  style={{ background: 'rgba(0,255,128,0.12)', color: '#00ff80', border: '1px solid #00ff80', padding: '10px 18px', fontFamily: 'inherit', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '0.1em' }}
                >
                  [ CHECK WHITELIST & SCHEDULE ]
                </button>
                <button
                  onClick={() => navigateToView('HOME')}
                  style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4', border: '1px solid #06B6D4', padding: '10px 18px', fontFamily: 'inherit', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '0.1em' }}
                >
                  [ ← RETURN TO TERMINAL DIRECTORY ]
                </button>
              </div>
            </div>
          </div>
        ) : activeView === 'GENERATOR' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3.5rem', width: '100%', alignItems: 'center', paddingBottom: '4rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2.5rem', justifyContent: 'center', width: '100%', maxWidth: '1050px' }}>
              <div className="hud-frame" style={{ width: '100%', maxWidth: '400px', display: 'flex', justifyContent: 'center', borderRadius: '2px', background: 'rgba(0,0,0,0.5)' }}>
                <div className="hud-corner-bottom" />
                <LayerStacker/>
              </div>

              <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '1.75rem' }}>
                <div>
                  <h2 style={{ margin: '0 0 0.5rem 0', color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.25rem' }}>DEPLOY CONSTRUCT // TERMINAL</h2>
                  <p style={{ color: '#A3A3A3', fontSize: '0.85rem', lineHeight: '1.6', margin: 0 }}>
                    Execute construct assembly on the Sui Mainnet. Storage is permanently mapped via Walrus blobs. Blind deployment ensures absolute cryptographic fairness until inventory decryptions.
                  </p>
                </div>

                <div style={{ background: isFreeMintActive ? 'rgba(0, 255, 128, 0.05)' : 'rgba(6,182,212,0.05)', border: `1px solid ${isFreeMintActive ? '#00ff80' : '#06B6D4'}`, padding: '16px', borderRadius: '2px', textAlign: 'center', position: 'relative' }}>
                  <div style={{ fontSize: '10px', color: isFreeMintActive ? '#00ff80' : '#06B6D4', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold' }}>
                    {currentPhase === 0
                      ? '// DEPLOYMENT STATUS: PAUSED BY OVERSEER'
                      : `// ACTIVE PHASE: 0${activeBatch.phase} — [ ${isFreeMintActive ? 'FREE MINT' : `${mintPriceSui} SUI`} // ${isWhitelistPhase ? 'WHITELIST GATED' : 'PUBLIC BATCH'} ]`}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#E5E5E5', margin: '4px 0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {currentPhase === 0 ? 'TERMINAL STANDBY' : activeBatch.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#A3A3A3', marginTop: '8px', lineHeight: '1.5' }}>
                    {currentPhase === 0 ? 'Awaiting Overseer phase activation signal.' : activeBatch.lore}
                  </div>

                  {/* 1. CURRENT PHASE / BATCH COUNTDOWN */}
                  {currentPhase > 0 && (
                    <div style={{ fontSize: '11px', color: remainingInCurrentPhase > 0 ? '#06B6D4' : '#ff3333', marginTop: '14px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
                      // {remainingInCurrentPhase} / {currentPhaseAllocation} CONSTRUCTS REMAINING IN PHASE 0{currentPhase} //
                    </div>
                  )}

                  {/* 2. GLOBAL 1,111 COLLECTION SUPPLY COUNTDOWN */}
                  <div style={{ fontSize: '11px', color: totalRemainingConstructs > 0 ? '#ff3333' : '#666', marginTop: '6px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
                    // {totalRemainingConstructs} / 1,111 CONSTRUCTS REMAINING ({totalMintedGlobal} DEPLOYED) //
                  </div>

                  {/* 3. PERSONAL WHITELIST WALLET URGENCY */}
                  {currentPhase > 0 && account && isWhitelistPhase && (
                    <div style={{ fontSize: '10px', color: isWalletWhitelisted && walletRemainingAllowance > 0 ? '#00ff80' : '#ff3333', marginTop: '8px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
                      {isWalletWhitelisted
                        ? `// YOUR WALLET ALLOCATION: ${walletRemainingAllowance} OF ${walletMaxAllowance} MINT(S) REMAINING //`
                        : '// NOT ELIGIBLE FOR THIS WHITELIST PHASE //'}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {account && currentPhase !== 0 && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ color: isFreeMintActive ? '#00ff80' : '#E5E5E5', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        {isWhitelistPhase
                          ? `// SELECT DEPLOYMENT QUANTITY (MAX ${walletRemainingAllowance} ALLOWED FOR YOUR WALLET)`
                          : `// SELECT DEPLOYMENT QUANTITY (${remainingInCurrentPhase} LEFT IN BATCH)`}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {[1, 2, 3, 4, 5].map(num => {
                          const maxAllowed = isWhitelistPhase
                            ? walletRemainingAllowance
                            : Math.min(remainingInCurrentPhase, totalRemainingSupply);
                          const isSelectable = isWalletWhitelisted && num <= maxAllowed && maxAllowed > 0;
                          return (
                            <button 
                              key={num}
                              disabled={!isSelectable || isProcessingTx}
                              onClick={() => setMintQuantity(num)}
                              style={{ flex: 1, padding: '10px', background: mintQuantity === num ? '#E5E5E5' : 'rgba(255,255,255,0.03)', color: mintQuantity === num ? '#0D0D11' : (isSelectable ? '#E5E5E5' : '#444'), border: mintQuantity === num ? '1px solid #E5E5E5' : '1px solid rgba(255,255,255,0.1)', opacity: !isSelectable ? 0.35 : 1, cursor: (!isSelectable || isProcessingTx) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 'bold', borderRadius: '2px', transition: 'all 0.2s ease' }}
                            >
                              {num}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <button onClick={mintOperative} disabled={buttonDisabled} style={buttonStyle}>{buttonText}</button>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.15)', padding: '10px 14px', borderRadius: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#888' }}>Want to check your Whitelist status, phase schedule, or apply?</span>
                  <button
                    onClick={() => navigateToView('WHITELIST')}
                    style={{ background: 'transparent', border: 'none', color: '#00ff80', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                  >
                    [ OPEN WHITELIST & SCHEDULE → ]
                  </button>
                </div>
              </div>
            </div>

            <div style={{ width: '100%', maxWidth: '1050px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2.5rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.1rem' }}>[ CLASSIFIED ARCHETYPES ]</h3>
                <p style={{ color: '#A3A3A3', fontSize: '0.85rem', margin: 0 }}>Awaiting trait decryptions. Base models detected on-chain.</p>
              </div>
              
              <div className="terminal-scroller">
                {(registryData as any[]).slice(0, 6).map((item, idx) => {
                  const baseBody = item.walrus_urls?.['Base Body'];
                  if (!baseBody) return null;
                  
                  return (
                    <div key={idx} style={{ flexShrink: 0, width: '150px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', boxSizing: 'border-box' }}>
                      <div style={{ width: '100%', aspectRatio: '1/1', position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
                        <img src={baseBody} alt="Classified" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) drop-shadow(0px 0px 4px rgba(6, 182, 212, 0.5))', opacity: 0.8 }} />
                        <div style={{ position: 'absolute', top: '4px', left: '4px', color: '#ff3333', fontSize: '7px', fontWeight: 'bold', border: '1px solid #ff3333', padding: '1px 3px', background: 'rgba(255,0,0,0.1)' }}>ENCRYPTED</div>
                      </div>
                      <div style={{ color: '#E5E5E5', fontSize: '0.68rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                        {item.lore_name.split(' // ')[0]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {account && displayOperatives.length > 0 && (
              <div style={{ width: '100%', maxWidth: '1050px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2.5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', color: '#00ff80', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.1rem' }}>[ YOUR SECURED CONSTRUCTS ]</h3>
                  <p style={{ color: '#A3A3A3', fontSize: '0.85rem', margin: 0 }}>Fully rendered 2D static snapshots secured via Terminal synchronization.</p>
                </div>
                <div className="terminal-scroller">
                  {displayOperatives.slice(0, 6).map((op: any, idx: number) => {
                    const fields = (op.data?.content as any)?.fields;
                    const img = fields?.image_url || fields?.url || '';
                    const name = fields?.name || fields?.lore_name || 'UNKNOWN CONSTRUCT';
                    
                    return (
                      <div key={idx} style={{ flexShrink: 0, width: '150px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0, 255, 128, 0.2)', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', boxSizing: 'border-box' }}>
                        <div style={{ width: '100%', aspectRatio: '1/1', position: 'relative', background: 'rgba(0,255,128,0.02)' }}>
                          <img src={img} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          <div style={{ position: 'absolute', top: '4px', left: '4px', color: '#00ff80', fontSize: '7px', fontWeight: 'bold', border: '1px solid #00ff80', padding: '1px 3px', background: 'rgba(0,255,0,0.1)' }}>SYNCED</div>
                        </div>
                        <div style={{ color: '#E5E5E5', fontSize: '0.68rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                          {name.split(' // ')[0]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ width: '100%', maxWidth: '1050px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2.5rem' }}>
              <div style={{ background: 'rgba(255, 51, 51, 0.05)', border: '1px solid rgba(255, 51, 51, 0.2)', padding: '1.75rem', borderRadius: '2px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#ff3333', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.95rem' }}>// THE INCINERATOR (BURN PROTOCOL)</h3>
                <p style={{ color: '#A3A3A3', fontSize: '0.8rem', lineHeight: '1.6', margin: 0 }}>
                  Constructs are not permanent if you choose to destroy them. Engaging the Incinerator burns your Operative, permanently removing it from circulation and locking it in the on-chain Graveyard. 
                </p>
                <ul style={{ color: '#A3A3A3', fontSize: '0.8rem', lineHeight: '1.6', paddingLeft: '1.2rem', margin: '1rem 0 0 0' }}>
                  <li><strong style={{ color: '#E5E5E5' }}>Deflationary Supply:</strong> Total supply decreases forever.</li>
                  <li><strong style={{ color: '#E5E5E5' }}>Trait Extraction:</strong> Burning yields raw, high-value modular components.</li>
                  <li><strong style={{ color: '#ff3333' }}>Irreversible:</strong> Once executed on Move, the code cannot be unwritten.</li>
                </ul>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '1.75rem', borderRadius: '2px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.95rem' }}>// ON-CHAIN VERIFICATION</h3>
                <p style={{ color: '#A3A3A3', fontSize: '0.8rem', lineHeight: '1.6', margin: '0 0 1rem 0' }}>
                  Don't trust, verify. All Numb Polys operations are executed via verified Move smart contracts on the Sui Mainnet.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#666', fontSize: '0.75rem', textTransform: 'uppercase' }}>Package ID</span>
                    <span style={{ color: '#E5E5E5', fontSize: '0.75rem', fontFamily: 'monospace' }}>{ORIGINAL_PACKAGE_ID.slice(0,6)}...{ORIGINAL_PACKAGE_ID.slice(-4)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#666', fontSize: '0.75rem', textTransform: 'uppercase' }}>Registry Obj</span>
                    <span style={{ color: '#E5E5E5', fontSize: '0.75rem', fontFamily: 'monospace' }}>{REGISTRY_ID.slice(0,6)}...{REGISTRY_ID.slice(-4)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666', fontSize: '0.75rem', textTransform: 'uppercase' }}>Storage Engine</span>
                    <span style={{ color: '#E5E5E5', fontSize: '0.75rem', fontFamily: 'monospace' }}>Walrus.Space</span>
                  </div>
                </div>
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
              <div className="terminal-scroller">
                {paginatedOperatives.map((op: any, index: number) => {
                  const isOpSelected = selectedOpId === (op.data?.objectId || op.address);
                  return (
                    <ConstructThumbnail 
                      key={op.data?.objectId || op.address} 
                      op={op} 
                      index={index}
                      isSelected={isOpSelected} 
                      activeGear={isOpSelected ? equippedGear : null}
                      onClick={setSelectedOpId} 
                      suiClient={suiClient}
                      isProcessingTx={isProcessingTx}
                      refreshCounter={refreshCounter}
                    />
                  );
                })}
              </div>
            </div>

            {selectedOpId ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                
                <div style={{ background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '12px 24px', borderRadius: '2px', marginBottom: '2rem', width: '100%', maxWidth: '800px', textAlign: 'center' }}>
                  <h2 style={{ margin: 0, color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.1rem' }}>
                    {dynamicDisplayName}
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
                        
                        {isMainRolling && (
                          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0D0D11', zIndex: 20 }}>
                            <div style={{ width: '40px', height: '40px', border: '3px solid rgba(6, 182, 212, 0.2)', borderTopColor: '#06B6D4', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
                            <span style={{ color: '#06B6D4', fontSize: '0.75rem', letterSpacing: '0.15em' }}>[ ASSEMBLING CONSTRUCT... ]</span>
                          </div>
                        )}

                        <div style={{ opacity: isMainRolling ? 0 : 1, transition: 'opacity 0.2s ease', width: '100%', height: '100%' }}>
                          {activeLayers.map((url, idx) => (
                            <img 
                              key={`main-${selectedOpId}-${url}-${idx}`} 
                              src={url} 
                              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: idx + 1 }} 
                              alt="" 
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={exportConstruct}
                      disabled={isMainRolling || isExporting}
                      style={{ background: 'rgba(6, 182, 212, 0.05)', color: '#06B6D4', border: '1px solid rgba(6, 182, 212, 0.3)', padding: '10px', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 'bold', cursor: (isMainRolling || isExporting) ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: '2px', transition: 'all 0.3s ease', width: '100%' }}
                    >
                      {isExporting ? '[ RENDERING IMAGE... ]' : '[ EXPORT HIGH-RES PFP ]'}
                    </button>

                    <button 
                      onClick={handleSyncVisuals}
                      disabled={isMainRolling || isProcessingTx}
                      style={{ background: 'rgba(0, 255, 128, 0.1)', color: '#00ff80', border: '1px solid rgba(0, 255, 128, 0.3)', padding: '12px', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 'bold', cursor: (isMainRolling || isProcessingTx) ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: '2px', transition: 'all 0.3s ease', width: '100%', boxShadow: '0 0 10px rgba(0, 255, 128, 0.15)' }}
                    >
                      {isProcessingTx ? '[ PROCESSING... ]' : '[ SYNC COMPILED IMAGE TO ON-CHAIN ]'}
                    </button>

                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', backdropFilter: 'blur(12px)', borderRadius: '2px', width: '100%', boxSizing: 'border-box', marginTop: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: '#06B6D4', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.85rem' }}>// SECURE TRANSFER UPLINK</h3>
                      <input 
                        type="text" 
                        placeholder="Recipient Address (0x...)" 
                        value={transferAddress}
                        onChange={(e) => setTransferAddress(e.target.value)}
                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: '#E5E5E5', padding: '8px', marginBottom: '0.5rem', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '11px' }}
                      />
                      <button 
                        onClick={() => handleTransfer(selectedOpId!, 'CONSTRUCT')}
                        disabled={isLoadingSlots || isProcessingTx || !transferAddress.trim()}
                        style={{ width: '100%', background: 'rgba(255, 51, 51, 0.1)', color: '#ff3333', border: '1px solid rgba(255, 51, 51, 0.3)', padding: '8px', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 'bold', cursor: (isLoadingSlots || isProcessingTx || !transferAddress.trim()) ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: '2px', transition: 'all 0.3s ease' }}
                      >
                        [ TRANSFER CONSTRUCT ]
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '400px' }}>
                    
                    {/* // EQUIPPED GRID // */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', backdropFilter: 'blur(12px)', borderRadius: '2px' }}>
                      <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.85rem' }}>// EQUIPPED (DRAG OFF TO UNEQUIP)</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {['background', 'face', 'eye', 'outfits', 'jewelries', 'headwear', 'eyewear'].map((slot) => {
                          const gear = equippedGear[slot];
                          const hasAnyGear = !!gear;

                          return (
                            <div 
                              key={slot} 
                              draggable={hasAnyGear && !isProcessingTx}
                              onDragStart={(e) => hasAnyGear && handleDragStart(e, 'equipped', { category: slot })}
                              title={hasAnyGear ? (gear.isNone ? `GHOST TRAIT [${slot.toUpperCase()}]` : slot.toUpperCase()) : `EMPTY ${slot.toUpperCase()}`}
                              style={{ aspectRatio: '1/1', border: '1px dashed rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: hasAnyGear ? 'grab' : 'default', position: 'relative' }}
                            >
                              {hasAnyGear ? (
                                gear.isNone ? (
                                  <span style={{ fontSize: '10px', color: '#ff3333', fontWeight: 'bold' }}>[ GHOST ]</span>
                                ) : (
                                  <img src={gear.imageUrl} style={{ width: '90%', height: '90%', objectFit: 'contain' }} alt={slot} />
                                )
                              ) : (
                                <span style={{ fontSize: '9px', color: '#555' }}>{slotLabels[slot]}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* // INVENTORY GRID // */}
                    <div 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDropOnInventory}
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.2)', padding: '1rem', backdropFilter: 'blur(12px)', borderRadius: '2px', minHeight: '150px' }}
                    >
                      <h3 style={{ margin: '0 0 1rem 0', color: '#E5E5E5', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.85rem' }}>// INVENTORY (DRAG TO EQUIP)</h3>
                      {!looseTraitsList.length ? (
                        <p style={{ color: '#555', fontSize: '0.75rem', textAlign: 'center' }}>[ INVENTORY EMPTY ]</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                          {looseTraitsList.map((item, idx) => {
                            const fields = (item.data?.content as any)?.fields;
                            const rawCat = fields?.category || fields?.Category || fields?.name;
                            const cat = normalizeCategory(rawCat);
                            const traitName = fields?.name || '';
                            const imgUrl = fields?.image_url || fields?.url || '';

                            const urlStr = String(imgUrl).toLowerCase();
                            const nameStr = String(traitName).toLowerCase();
                            
                            const isNone = 
                              urlStr === 'none' || 
                              urlStr === 'null' || 
                              urlStr === '' || 
                              nameStr.includes('none') || 
                              nameStr.includes('null');

                            if (isNone) return null;

                            const isSlotOccupied = cat ? !!equippedGear[cat] && !equippedGear[cat].isNone : false;

                            return (
                              <div 
                                key={idx} 
                                draggable={!isSlotOccupied && !isProcessingTx && !!cat}
                                onDragStart={(e) => cat && handleDragStart(e, 'loose', { objectId: item.data!.objectId, category: cat })}
                                style={{ aspectRatio: '1/1', border: isSlotOccupied ? '1px solid rgba(255,51,51,0.3)' : '1px solid rgba(255,255,255,0.2)', background: isSlotOccupied ? 'rgba(255,0,0,0.05)' : 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isSlotOccupied ? 'not-allowed' : 'grab', opacity: isSlotOccupied ? 0.3 : 1, position: 'relative' }}
                                title={isSlotOccupied ? 'SLOT OCCUPIED' : cat?.toUpperCase()}
                              >
                                {imgUrl ? <img src={imgUrl} style={{ width: '90%', height: '90%', objectFit: 'contain', pointerEvents: 'none' }} alt="Trait" /> : <span style={{ fontSize: '9px', color: '#555' }}>IMG</span>}
                                
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleTransfer(item.data!.objectId, 'TRAIT'); }}
                                  disabled={isProcessingTx || !transferAddress.trim()}
                                  style={{ position: 'absolute', top: '2px', right: '2px', background: (!transferAddress.trim() || isProcessingTx) ? 'rgba(255,51,51,0.2)' : 'rgba(255,51,51,0.8)', border: 'none', color: '#fff', fontSize: '8px', cursor: (!transferAddress.trim() || isProcessingTx) ? 'not-allowed' : 'pointer', padding: '2px 4px', zIndex: 10, borderRadius: '2px', fontWeight: 'bold' }}
                                  title={!transferAddress.trim() ? "ENTER TRANSFER ADDRESS FIRST" : "TRANSFER TRAIT"}
                                >
                                  SEND
                                </button>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%', alignItems: 'center' }}>
            {account?.address === ADMIN_WALLET && (
              <div style={{ width: '100%', maxWidth: '800px', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.85rem' }}>// GLOBAL CONTRACT IDENTITY, RARITY & ON-CHAIN DISPLAY</h3>
                <p style={{ fontSize: '0.75rem', color: '#A3A3A3', marginBottom: '1rem', lineHeight: '1.5' }}>
                  Automatically syncs <strong style={{ color: '#E5E5E5' }}>Display&lt;Operative&gt;</strong> with your Collection Name, Bio, Website, Logo, Banner, plus native on-chain <strong style={{ color: '#00ff80' }}>rarity_tier</strong> and <strong style={{ color: '#00ff80' }}>mint_id</strong> mappings without Add/Edit conflicts.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <input 
                    type="text" 
                    placeholder="Project Name (e.g., Numb Polys)" 
                    value={globalProjectName}
                    onChange={(e) => setGlobalProjectName(e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: '#E5E5E5', padding: '10px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '12px', borderRadius: '2px' }}
                  />
                  <textarea 
                    placeholder="Collection Bio / Description" 
                    value={globalProjectBio}
                    onChange={(e) => setGlobalProjectBio(e.target.value)}
                    rows={2}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: '#E5E5E5', padding: '10px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '12px', borderRadius: '2px', resize: 'vertical' }}
                  />
                  <input 
                    type="text" 
                    placeholder="Project Website URL (https://mainnet.numbpolys.xyz)" 
                    value={globalProjectUrl}
                    onChange={(e) => setGlobalProjectUrl(e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: '#E5E5E5', padding: '10px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '12px', borderRadius: '2px' }}
                  />
                  <input 
                    type="text" 
                    placeholder="Collection Avatar / Logo URL (https://...)" 
                    value={globalProjectImage}
                    onChange={(e) => setGlobalProjectImage(e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: '#E5E5E5', padding: '10px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '12px', borderRadius: '2px' }}
                  />
                  <input 
                    type="text" 
                    placeholder="Collection Banner URL (Optional - https://...)" 
                    value={globalProjectBanner}
                    onChange={(e) => setGlobalProjectBanner(e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: '#E5E5E5', padding: '10px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '12px', borderRadius: '2px' }}
                  />
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                      onClick={() => handleUpdateCollectionMetadata()}
                      disabled={isProcessingTx || !globalProjectName}
                      style={{ flex: 1, background: 'rgba(0, 255, 128, 0.12)', color: '#00ff80', border: '1px solid rgba(0, 255, 128, 0.4)', padding: '12px', cursor: (isProcessingTx || !globalProjectName) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', borderRadius: '2px', transition: 'all 0.3s ease' }}
                    >
                      {isProcessingTx ? '[ PROCESSING... ]' : '[ ⚡ AUTO-SYNC ALL DISPLAY METADATA, RARITY & MINT ID ]'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <AdminDashboard />
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet" createClient={() => customGqlSuiClient}>
        <WalletProvider autoConnect>
          <TerminalUI />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}