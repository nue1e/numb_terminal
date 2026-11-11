import { useState, useEffect, useCallback } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { ORIGINAL_PACKAGE_ID, LATEST_PACKAGE_ID, REGISTRY_ID, ADMIN_CAP_ID, V3_STATE_ID } from './config';
import registryData from './registry.json';

export interface PhaseConfigItem {
  phase: number;
  code: string;
  name: string;
  price: number;
  mist: string;
  isWhitelist: boolean;
  lore: string;
}

export const DEFAULT_PHASES: PhaseConfigItem[] = [
  {
    phase: 1,
    code: 'FREE_MINT',
    name: 'Phase 01 // The Vanguard (Community Free)',
    price: 0,
    mist: '0',
    isWhitelist: true,
    lore: 'The genesis entry. Reserved strictly for whitelisted community operators.'
  },
  {
    phase: 2,
    code: 'WL_1',
    name: 'Phase 02 // The Recon Protocol (WL 1)',
    price: 2,
    mist: '2000000000',
    isWhitelist: true,
    lore: 'First whitelist wave. Priority syndicate allocation at 2 SUI.'
  },
  {
    phase: 3,
    code: 'WL_2',
    name: 'Phase 03 // The Iron Grid (WL 2)',
    price: 3,
    mist: '3000000000',
    isWhitelist: true,
    lore: 'Second whitelist wave. Infrastructure expansion allocation at 3 SUI.'
  },
  {
    phase: 4,
    code: 'PUBLIC_1',
    name: 'Phase 04 // The Static Runners (Public 1)',
    price: 4,
    mist: '4000000000',
    isWhitelist: false,
    lore: 'Public Wave I. Open terminal deployment until manually shifted by Overseer.'
  },
  {
    phase: 5,
    code: 'PUBLIC_2',
    name: 'Phase 05 // The Obsidian Core (Public 2)',
    price: 5,
    mist: '5000000000',
    isWhitelist: false,
    lore: 'Public Wave II. Open terminal deployment as supply contracts.'
  },
  {
    phase: 6,
    code: 'PUBLIC_3',
    name: 'Phase 06 // The Crimson Shift (Public 3)',
    price: 6,
    mist: '6000000000',
    isWhitelist: false,
    lore: 'Public Wave III. Final public deployment tier on the Sui Mainnet.'
  }
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
  },

  getOwnedObjects: async (owner: string, structType: string): Promise<{ data: any[] }> => {
    const data = await rawGqlCall(
      `query GetAdminOwned($owner: SuiAddress!, $type: String!) {
        address(address: $owner) {
          objects(first: 50, filter: { type: $type }) {
            nodes {
              address
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
      data: nodes.map((n: any) => ({
        data: {
          objectId: n.address,
          content: {
            dataType: 'moveObject',
            type: n?.contents?.type?.repr || '',
            fields: extractMoveFields(n?.contents?.json)
          }
        }
      }))
    };
  }
};

// Helper to parse multi-line "0xAddress, Mints" text into a clean Record<address, number>
function parseAllocationText(rawText: string, defaultQty: number): Record<string, number> {
  const map: Record<string, number> = {};
  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Supports "0x123... 2" or "0x123..., 2" or "0x123...:2" or just "0x123..."
    const parts = trimmed.split(/[\s,:;]+/).filter(Boolean);
    const addr = parts[0]?.toLowerCase();
    if (addr && addr.startsWith('0x') && addr.length >= 40) {
      const parsedCount = parts[1] ? parseInt(parts[1], 10) : defaultQty;
      map[addr] = !isNaN(parsedCount) && parsedCount > 0 ? parsedCount : defaultQty;
    }
  }
  return map;
}

function serializeAllocationMap(map: Record<string, number>): string {
  return Object.entries(map)
    .map(([addr, count]) => `${addr}, ${count}`)
    .join('\n');
}

export function AdminDashboard() {
  const account = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [isProcessing, setIsProcessing] = useState(false);
  const [txMessage, setTxMessage] = useState<string | null>(null);

  // Overseer Live State
  const [registryFields, setRegistryFields] = useState<any>(null);
  const [v3Fields, setV3Fields] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(true);

  // Editable Phase Names & Whitelist Allocations (Phases 1, 2, 3)
  const [phases, setPhases] = useState<PhaseConfigItem[]>(DEFAULT_PHASES);
  const [activeWlTab, setActiveWlTab] = useState<1 | 2 | 3>(1);
  const [wlText1, setWlText1] = useState<string>('');
  const [wlText2, setWlText2] = useState<string>('');
  const [wlText3, setWlText3] = useState<string>('');
  const [defaultBulkCount, setDefaultBulkCount] = useState<string>('1');

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

  // Load any saved config from Display<Operative> or localStorage
  const loadSavedTerminalConfig = useCallback(async () => {
    try {
      const localRaw = localStorage.getItem('numbpolys_terminal_config_v1');
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        if (Array.isArray(parsed.phases) && parsed.phases.length === 6) {
          setPhases(parsed.phases);
        }
        if (parsed.whitelists) {
          if (parsed.whitelists['1']) setWlText1(serializeAllocationMap(parsed.whitelists['1']));
          if (parsed.whitelists['2']) setWlText2(serializeAllocationMap(parsed.whitelists['2']));
          if (parsed.whitelists['3']) setWlText3(serializeAllocationMap(parsed.whitelists['3']));
        }
      }

      if (account?.address) {
        const objects = await suiRpc.getOwnedObjects(
          account.address,
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
                setPhases(decoded.phases);
              }
              if (decoded.whitelists) {
                if (decoded.whitelists['1']) setWlText1(serializeAllocationMap(decoded.whitelists['1']));
                if (decoded.whitelists['2']) setWlText2(serializeAllocationMap(decoded.whitelists['2']));
                if (decoded.whitelists['3']) setWlText3(serializeAllocationMap(decoded.whitelists['3']));
              }
              localStorage.setItem('numbpolys_terminal_config_v1', JSON.stringify(decoded));
            }
          }
        }
      }
    } catch (e) {
      console.warn('Config load fallback:', e);
    }
  }, [account?.address]);

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
      console.error('Overseer sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverseerData();
    loadSavedTerminalConfig();
  }, [fetchOverseerData, loadSavedTerminalConfig]);

  const rawAdminMinted = registryFields?.admin_minted ?? registryFields?.reserve_minted;
  const adminMinted = rawAdminMinted !== undefined ? parseInt(String(rawAdminMinted), 10) : (isSyncing ? null : 0);

  const rawPublicMinted = registryFields?.public_minted ?? registryFields?.total_minted ?? registryFields?.minted;
  const publicMintedCount = rawPublicMinted !== undefined ? Math.max(0, parseInt(String(rawPublicMinted), 10) - 111) : 0;

  const rawPhase = registryFields?.phase ?? registryFields?.current_phase;
  const currentPhase = rawPhase !== undefined ? Number(rawPhase) : (isSyncing ? null : 0);

  const currentPriceMist = registryFields?.mint_price !== undefined ? String(registryFields.mint_price) : '0';
  const currentPriceSui = Number(currentPriceMist) / 1_000_000_000;

  const rawBalance = registryFields?.balance;
  const parsedBalance =
    typeof rawBalance === 'object' && rawBalance !== null
      ? Number(rawBalance?.fields?.value ?? rawBalance?.value ?? 0)
      : Number(rawBalance || 0);
  const treasurySui = parsedBalance / 1_000_000_000;

  const stakingActive = Boolean(v3Fields?.staking_active);

  const activePhaseObj = phases.find(p => p.phase === currentPhase);

  // --- HANDLE PHASE NAME OR PRICE EDIT ---
  const handlePhaseFieldChange = (phaseNum: number, field: 'name' | 'price' | 'lore', val: string) => {
    setPhases(prev =>
      prev.map(p => {
        if (p.phase !== phaseNum) return p;
        if (field === 'price') {
          const numPrice = Math.max(0, parseFloat(val) || 0);
          const mistStr = String(Math.round(numPrice * 1_000_000_000));
          return { ...p, price: numPrice, mist: mistStr };
        }
        return { ...p, [field]: val };
      })
    );
  };

  // --- SAVE & PUBLISH PHASE NAMES + WHITELISTS ON-CHAIN (AND LOCALSTORAGE) ---
  const handlePublishTerminalConfig = async () => {
    if (!account || isProcessing) return;
    const fallbackQty = Math.max(1, parseInt(defaultBulkCount, 10) || 1);
    const wl1Map = parseAllocationText(wlText1, fallbackQty);
    const wl2Map = parseAllocationText(wlText2, fallbackQty);
    const wl3Map = parseAllocationText(wlText3, fallbackQty);

    const configPayload = {
      phases,
      whitelists: {
        '1': wl1Map,
        '2': wl2Map,
        '3': wl3Map
      },
      updatedAt: Date.now()
    };

    // Immediately sync to localStorage and dispatch event so current browser updates instantly
    const serialized = JSON.stringify(configPayload);
    localStorage.setItem('numbpolys_terminal_config_v1', serialized);
    window.dispatchEvent(new Event('numbpolys_config_updated'));

    setIsProcessing(true);
    displayMessage(`[ SYNCING PHASE NAMES & WHITELIST ALLOCATIONS ON-CHAIN... PLEASE SIGN ]`);

    try {
      const objects: any = await suiRpc.getOwnedObjects(
        account.address,
        `0x2::display::Display<${ORIGINAL_PACKAGE_ID}::operative::Operative>`
      );

      if (!objects?.data?.length) {
        displayMessage(`[ SAVED LOCALLY! (NOTE: DISPLAY OBJECT NOT FOUND IN WALLET FOR ON-CHAIN SYNC) ]`);
        setIsProcessing(false);
        return;
      }

      const displayObj = objects.data[0];
      const displayId = displayObj.data?.objectId;
      const rawContents =
        displayObj.data?.content?.fields?.fields?.fields?.contents ||
        displayObj.data?.content?.fields?.fields?.contents ||
        displayObj.data?.content?.fields?.contents ||
        [];
      const existingKeys = new Set<string>(
        Array.isArray(rawContents)
          ? rawContents.map((entry: any) => entry?.fields?.key || entry?.key).filter(Boolean)
          : Object.keys(rawContents)
      );

      const tx = new Transaction();
      const typeArg = `${ORIGINAL_PACKAGE_ID}::operative::Operative`;
      const callMode = existingKeys.has('terminal_config') ? 'edit' : 'add';

      tx.moveCall({
        target: `0x2::display::${callMode}`,
        typeArguments: [typeArg],
        arguments: [
          tx.object(displayId),
          tx.pure.string('terminal_config'),
          tx.pure.string(serialized)
        ]
      });

      tx.moveCall({
        target: '0x2::display::update_version',
        typeArguments: [typeArg],
        arguments: [tx.object(displayId)]
      });

      signAndExecuteTransaction(
        { transaction: tx as any },
        {
          onSuccess: () => {
            displayMessage(
              `[ SUCCESS: PHASE NAMES & WHITELISTS SYNCED ON-CHAIN (FREE: ${Object.keys(wl1Map).length} | WL1: ${Object.keys(wl2Map).length} | WL2: ${Object.keys(wl3Map).length} WALLETS) ]`
            );
            setIsProcessing(false);
          },
          onError: (err) => {
            displayMessage(`[ SAVED LOCALLY, ON-CHAIN TX REJECTED: ${err.message} ]`);
            setIsProcessing(false);
          }
        }
      );
    } catch (err: any) {
      displayMessage(`[ ERROR: ${err.message} ]`);
      setIsProcessing(false);
    }
  };

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

  // --- 2. THE 6-PHASE SWITCHBOARD ---
  const handleUpdateBatch = (phaseNum: number, priceMist: string, batchName: string) => {
    // Also save current phase names/whitelists locally when switching
    const fallbackQty = Math.max(1, parseInt(defaultBulkCount, 10) || 1);
    const configPayload = {
      phases,
      whitelists: {
        '1': parseAllocationText(wlText1, fallbackQty),
        '2': parseAllocationText(wlText2, fallbackQty),
        '3': parseAllocationText(wlText3, fallbackQty)
      },
      updatedAt: Date.now()
    };
    localStorage.setItem('numbpolys_terminal_config_v1', JSON.stringify(configPayload));
    window.dispatchEvent(new Event('numbpolys_config_updated'));

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
        displayMessage(`[ ERROR: PHASE OVERRIDE FAILED. ${err.message} ]`);
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
      const traitUrls = traitCategories.map(k => (opData.walrus_urls as any)[k === 'Jewelry' ? 'Jeweleries' : k] || 'None');

      tx.moveCall({
        target: `${LATEST_PACKAGE_ID}::operative::claim_reserve`,
        arguments: [
          tx.object(ADMIN_CAP_ID), tx.object(REGISTRY_ID),
          tx.pure.string(opData.lore_name), tx.pure.string(opData.display_traits['Rarity Tier']), tx.pure.string((opData.walrus_urls as any)['Base Body'] || ''),
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

  const fallbackQty = Math.max(1, parseInt(defaultBulkCount, 10) || 1);
  const parsedCount1 = Object.keys(parseAllocationText(wlText1, fallbackQty)).length;
  const parsedCount2 = Object.keys(parseAllocationText(wlText2, fallbackQty)).length;
  const parsedCount3 = Object.keys(parseAllocationText(wlText3, fallbackQty)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '800px', margin: '0 auto', fontFamily: 'monospace' }}>
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
          <span style={{ fontWeight: 'bold', color: currentPhase === null ? '#ffff00' : currentPhase === 0 ? '#ff3333' : '#00ff80' }}>
            {currentPhase === null ? 'SYNCING...' : currentPhase === 0 ? 'PAUSED' : `${activePhaseObj?.name || `PHASE 0${currentPhase}`} [LIVE]`}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: '#A3A3A3' }}>Active Mint Price:</span>
          <span style={{ fontWeight: 'bold', color: currentPriceSui === 0 ? '#00ff80' : '#06B6D4' }}>
            {currentPriceSui === 0 ? 'FREE MINT (0 SUI)' : `${currentPriceSui} SUI`}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: '#A3A3A3' }}>Total Public / WL Minted:</span>
          <span style={{ color: '#E5E5E5', fontWeight: 'bold' }}>{publicMintedCount} / 1000</span>
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

      {/* 6-PHASE SWITCHBOARD (FREE MINT, WL 1, WL 2, PUBLIC 1, PUBLIC 2, PUBLIC 3) */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#06B6D4' }}>// 6-PHASE DEPLOYMENT SWITCHBOARD</h3>
        <p style={{ color: '#A3A3A3', fontSize: '0.75rem', marginBottom: '1rem', lineHeight: '1.5' }}>
          Click any phase below to activate it on-chain and automatically set its SUI price. Public phases have no artificial batch cap—you control when to advance or pause them.
        </p>

        <button
          onClick={handlePause}
          disabled={isProcessing}
          style={{ width: '100%', padding: '12px', background: currentPhase === 0 ? 'rgba(255,51,51,0.25)' : 'rgba(255,51,51,0.05)', color: '#ff3333', border: '1px dashed #ff3333', cursor: 'pointer', marginBottom: '1rem', fontWeight: 'bold', fontFamily: 'inherit' }}
        >
          [ 🛑 EMERGENCY MINT PAUSE (PHASE 0) ]
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {phases.map((item) => {
            const isActive = currentPhase === item.phase && currentPriceMist === item.mist;
            return (
              <button
                key={item.phase}
                onClick={() => handleUpdateBatch(item.phase, item.mist, item.name)}
                disabled={isProcessing}
                style={{
                  padding: '12px',
                  background: isActive ? (item.price === 0 ? 'rgba(0, 255, 128, 0.18)' : 'rgba(6,182,212,0.2)') : 'rgba(255,255,255,0.02)',
                  color: isActive ? (item.price === 0 ? '#00ff80' : '#06B6D4') : '#E5E5E5',
                  border: isActive ? `1px solid ${item.price === 0 ? '#00ff80' : '#06B6D4'}` : '1px solid rgba(255,255,255,0.1)',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.75rem',
                  textAlign: 'left',
                  borderRadius: '2px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span style={{ fontSize: '9px', padding: '1px 5px', border: '1px solid currentColor', borderRadius: '2px' }}>
                    {item.isWhitelist ? 'WHITELIST GATED' : 'OPEN PUBLIC'}
                  </span>
                  <span style={{ fontWeight: 'bold', color: item.price === 0 ? '#00ff80' : '#06B6D4' }}>
                    {item.price === 0 ? '0 SUI (FREE)' : `${item.price} SUI`}
                  </span>
                </div>
                <span style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#fff' }}>{item.name}</span>
                <span style={{ fontSize: '0.68rem', color: '#888' }}>
                  {isActive ? '● CURRENTLY LIVE ON TERMINAL' : 'Click to deploy phase on-chain →'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* PHASE NAMES & WHITELIST ALLOCATION MANAGER */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0, 255, 128, 0.3)', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#00ff80' }}>// PHASE NAME EDITOR & WHITELIST ALLOCATION ENGINE</h3>
        <p style={{ color: '#A3A3A3', fontSize: '0.75rem', marginBottom: '1rem', lineHeight: '1.5' }}>
          Customize the phase titles/prices that appear on the Mint Portal, and assign wallet addresses + exact mint allowances for <strong style={{ color: '#fff' }}>Phase 1 (Community Free Mint)</strong>, <strong style={{ color: '#fff' }}>Phase 2 (WL 1 - 2 SUI)</strong>, and <strong style={{ color: '#fff' }}>Phase 3 (WL 2 - 3 SUI)</strong>.
        </p>

        {/* EDITABLE PHASE NAMES & PRICES */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.35)', padding: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '0.72rem', color: '#06B6D4', fontWeight: 'bold', marginBottom: '4px' }}>
            // EDIT PHASE DISPLAY NAMES & SUI PRICES (EFFECTS ON MINT PORTAL)
          </div>
          {phases.map((p) => (
            <div key={p.phase} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ width: '65px', fontSize: '11px', color: '#888', fontWeight: 'bold' }}>PHASE 0{p.phase}:</span>
              <input
                type="text"
                value={p.name}
                onChange={(e) => handlePhaseFieldChange(p.phase, 'name', e.target.value)}
                placeholder="Phase Name"
                style={{ flex: 1, minWidth: '200px', background: 'rgba(0,0,0,0.5)', border: '1px solid #444', color: '#E5E5E5', padding: '6px 8px', fontFamily: 'inherit', fontSize: '11px' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="number"
                  step="0.1"
                  value={p.price}
                  onChange={(e) => handlePhaseFieldChange(p.phase, 'price', e.target.value)}
                  style={{ width: '70px', background: 'rgba(0,0,0,0.5)', border: '1px solid #444', color: '#00ff80', padding: '6px 8px', fontFamily: 'inherit', fontSize: '11px', fontWeight: 'bold' }}
                />
                <span style={{ fontSize: '10px', color: '#888' }}>SUI</span>
              </div>
            </div>
          ))}
        </div>

        {/* WHITELIST WALLET & MINT COUNT ALLOCATION TABS */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveWlTab(1)}
            style={{ flex: 1, padding: '8px', background: activeWlTab === 1 ? '#00ff80' : 'rgba(255,255,255,0.04)', color: activeWlTab === 1 ? '#0D0D11' : '#E5E5E5', border: '1px solid rgba(0,255,128,0.4)', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            PHASE 1: FREE MINT WL ({parsedCount1})
          </button>
          <button
            onClick={() => setActiveWlTab(2)}
            style={{ flex: 1, padding: '8px', background: activeWlTab === 2 ? '#06B6D4' : 'rgba(255,255,255,0.04)', color: activeWlTab === 2 ? '#0D0D11' : '#E5E5E5', border: '1px solid rgba(6,182,212,0.4)', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            PHASE 2: WL 1 [2 SUI] ({parsedCount2})
          </button>
          <button
            onClick={() => setActiveWlTab(3)}
            style={{ flex: 1, padding: '8px', background: activeWlTab === 3 ? '#06B6D4' : 'rgba(255,255,255,0.04)', color: activeWlTab === 3 ? '#0D0D11' : '#E5E5E5', border: '1px solid rgba(6,182,212,0.4)', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            PHASE 3: WL 2 [3 SUI] ({parsedCount3})
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '11px', color: '#A3A3A3' }}>
            Format: <strong style={{ color: '#fff' }}>0xWalletAddress, MintAllowance</strong> (one per line, or just paste addresses and set default allowance →)
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', color: '#888' }}>Default Mints if not specified on line:</span>
            <input
              type="number"
              min="1"
              value={defaultBulkCount}
              onChange={(e) => setDefaultBulkCount(e.target.value)}
              style={{ width: '50px', background: 'rgba(0,0,0,0.5)', border: '1px solid #444', color: '#fff', padding: '4px 6px', fontFamily: 'inherit', fontSize: '11px' }}
            />
          </div>
        </div>

        {activeWlTab === 1 && (
          <textarea
            rows={6}
            value={wlText1}
            onChange={(e) => setWlText1(e.target.value)}
            placeholder={`Paste Phase 1 (Community Free Mint) wallets & allowances here, e.g.:\n0xdb67bfb984df37d73755da48c166689e7d584b17cf6c23a680cb05d90f9653fb, 1\n0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef, 2`}
            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid #444', color: '#00ff80', padding: '10px', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '11px', marginBottom: '1rem', resize: 'vertical' }}
          />
        )}

        {activeWlTab === 2 && (
          <textarea
            rows={6}
            value={wlText2}
            onChange={(e) => setWlText2(e.target.value)}
            placeholder={`Paste Phase 2 (WL 1 — 2 SUI) wallets & allowances here, e.g.:\n0xdb67bfb984df37d73755da48c166689e7d584b17cf6c23a680cb05d90f9653fb, 3\n0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef, 5`}
            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid #444', color: '#06B6D4', padding: '10px', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '11px', marginBottom: '1rem', resize: 'vertical' }}
          />
        )}

        {activeWlTab === 3 && (
          <textarea
            rows={6}
            value={wlText3}
            onChange={(e) => setWlText3(e.target.value)}
            placeholder={`Paste Phase 3 (WL 2 — 3 SUI) wallets & allowances here, e.g.:\n0xdb67bfb984df37d73755da48c166689e7d584b17cf6c23a680cb05d90f9653fb, 3\n0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef, 5`}
            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid #444', color: '#06B6D4', padding: '10px', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '11px', marginBottom: '1rem', resize: 'vertical' }}
          />
        )}

        <button
          onClick={handlePublishTerminalConfig}
          disabled={isProcessing}
          style={{ width: '100%', padding: '12px', background: 'rgba(0, 255, 128, 0.15)', color: '#00ff80', border: '1px solid #00ff80', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontFamily: 'inherit', fontSize: '11px', letterSpacing: '0.08em' }}
        >
          {isProcessing ? '[ PUBLISHING CONFIG... ]' : '[ ⚡ SAVE & PUBLISH WHITELISTS + PHASE NAMES ON-CHAIN ]'}
        </button>
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