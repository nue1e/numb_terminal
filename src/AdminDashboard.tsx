import React, { useState } from 'react';
import { 
  useCurrentAccount, 
  useSignAndExecuteTransaction,
  useSuiClientQuery
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, REGISTRY_ID, ADMIN_CAP_ID } from './config';
import registryData from './registry.json';

export function AdminDashboard() {
  const account = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [isProcessing, setIsProcessing] = useState(false);
  const [txMessage, setTxMessage] = useState<string | null>(null);
  const [newPriceSui, setNewPriceSui] = useState<string>('5');
  
  // Custom Whitelist State
  const [wlAddresses, setWlAddresses] = useState<string>('');

  const displayMessage = (msg: string) => {
    setTxMessage(msg);
    setTimeout(() => setTxMessage(null), 6000);
  };

  const { data: registryObj, refetch: refetchRegistry, isLoading, isError } = useSuiClientQuery(
    'getObject',
    {
      id: REGISTRY_ID,
      options: { showContent: true },
    }
  );

  const fields = (registryObj?.data?.content as any)?.fields;
  const adminMinted = fields?.admin_minted !== undefined ? parseInt(fields.admin_minted) : null;
  const currentPhase = fields?.phase !== undefined ? Number(fields.phase) : null;
  const currentPriceMist = fields?.mint_price;
  const currentPriceSui = currentPriceMist ? Number(currentPriceMist) / 1_000_000_000 : null;
  
  const rawBalance = fields?.balance;
  const treasuryMist = rawBalance?.fields?.value ? rawBalance.fields.value : (typeof rawBalance === 'string' ? rawBalance : "0");
  const treasurySui = Number(treasuryMist) / 1_000_000_000;

  // Phase Controls
  const handleUpdatePhase = (phase: number) => {
    setIsProcessing(true);
    displayMessage(`[ TRANSMITTING PHASE OVERRIDE (${phase})... SIGN IN WALLET ]`);

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::operative::update_phase`,
      arguments: [
        tx.object(ADMIN_CAP_ID),
        tx.object(REGISTRY_ID),
        tx.pure.u8(phase)
      ],
    });

    signAndExecuteTransaction({ transaction: tx }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: PHASE SWITCHED TO ${phase === 0 ? 'PAUSED' : phase === 1 ? 'WHITELIST' : 'PUBLIC'} ]`);
        refetchRegistry();
        setIsProcessing(false);
      },
      onError: (err) => {
        console.error(err);
        displayMessage(`[ ERROR: PHASE UPDATE FAILED ]`);
        setIsProcessing(false);
      },
    });
  };

  // Price Controls
  const handleUpdatePrice = () => {
    const mistValue = Math.floor(parseFloat(newPriceSui) * 1_000_000_000);
    if (isNaN(mistValue) || mistValue <= 0) {
      displayMessage(`[ ERROR: INVALID SUI PRICE ]`);
      return;
    }

    setIsProcessing(true);
    displayMessage(`[ UPDATING PRICE TO ${newPriceSui} SUI... SIGN IN WALLET ]`);

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::operative::update_price`,
      arguments: [
        tx.object(ADMIN_CAP_ID),
        tx.object(REGISTRY_ID),
        tx.pure.u64(mistValue)
      ],
    });

    signAndExecuteTransaction({ transaction: tx }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: MINT PRICE SET TO ${newPriceSui} SUI ]`);
        refetchRegistry();
        setIsProcessing(false);
      },
      onError: (err) => {
        console.error(err);
        displayMessage(`[ ERROR: PRICE UPDATE FAILED ]`);
        setIsProcessing(false);
      },
    });
  };

  // Treasury Withdrawal
  const handleWithdraw = () => {
    setIsProcessing(true);
    displayMessage(`[ WITHDRAWING TREASURY... SIGN IN WALLET ]`);

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::operative::withdraw_funds`,
      arguments: [
        tx.object(ADMIN_CAP_ID),
        tx.object(REGISTRY_ID)
      ],
    });

    signAndExecuteTransaction({ transaction: tx }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: TREASURY TRANSFERRED TO CREATOR WALLET ]`);
        refetchRegistry();
        setIsProcessing(false);
      },
      onError: (err) => {
        console.error(err);
        displayMessage(`[ ERROR: WITHDRAWAL FAILED ]`);
        setIsProcessing(false);
      },
    });
  };

  // Advanced Custom Whitelist Airdrop
  const handleIssueWhitelist = () => {
    const lines = wlAddresses.split('\n');
    const airdropList: { address: string; count: number }[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Matches the 66-character 0x address, and looks for an optional number after it
      const match = trimmed.match(/(0x[a-fA-F0-9]{64})[\s,:=]*(\d+)?/);
      if (match) {
        const address = match[1];
        const count = match[2] ? parseInt(match[2]) : 1; // Defaults to 1 ticket if no number is provided
        airdropList.push({ address, count });
      }
    }

    if (airdropList.length === 0) {
      displayMessage(`[ ERROR: NO VALID SUI ADDRESSES FORMATTED CORRECTLY ]`);
      return;
    }

    const totalTickets = airdropList.reduce((sum, item) => sum + item.count, 0);

    setIsProcessing(true);
    displayMessage(`[ AIRDROPPING ${totalTickets} TICKETS TO ${airdropList.length} WALLETS... SIGN IN WALLET ]`);

    const tx = new Transaction();
    
    for (const item of airdropList) {
      for (let i = 0; i < item.count; i++) {
        tx.moveCall({
          target: `${PACKAGE_ID}::operative::issue_whitelist_ticket`,
          arguments: [
            tx.object(ADMIN_CAP_ID),
            tx.pure.address(item.address)
          ],
        });
      }
    }

    signAndExecuteTransaction({ transaction: tx }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: ${totalTickets} TICKETS SECURELY AIRDROPPED ]`);
        setWlAddresses('');
        setIsProcessing(false);
      },
      onError: (err) => {
        console.error(err);
        displayMessage(`[ ERROR: AIRDROP FAILED ]`);
        setIsProcessing(false);
      },
    });
  };

  // Batch Reserve Mint
  const handleBatchMintReserve = (count: number) => {
    const current = adminMinted || 0;
    if (current >= 111) {
      displayMessage(`[ ERROR: CREATOR VAULT ALREADY DEPLETED (111/111) ]`);
      return;
    }

    const availableToMint = Math.min(count, 111 - current);
    setIsProcessing(true);
    displayMessage(`[ BUNDLING ${availableToMint} VAULT MINTS... SIGN IN WALLET ]`);

    const tx = new Transaction();

    for (let offset = 0; offset < availableToMint; offset++) {
      const targetIndex = current + offset;
      const opData = registryData[targetIndex];
      if (!opData) break;

      const traitCategories = Object.keys(opData.display_traits).filter(k => k !== 'Rarity Tier');
      const traitNames = traitCategories.map(k => opData.display_traits[k as keyof typeof opData.display_traits]);
      const traitUrls = traitCategories.map(k => {
        const rawKey = k === 'Jewelry' ? 'Jeweleries' : k;
        return (opData.walrus_urls as any)[rawKey] || "None";
      });

      tx.moveCall({
        target: `${PACKAGE_ID}::operative::claim_reserve`,
        arguments: [
          tx.object(ADMIN_CAP_ID),
          tx.object(REGISTRY_ID),
          tx.pure.string(opData.lore_name),
          tx.pure.string(opData.display_traits['Rarity Tier']),
          tx.pure.string((opData.walrus_urls as any)['Base Body'] || ""),
          tx.pure.vector('string', traitCategories),
          tx.pure.vector('string', traitNames),
          tx.pure.vector('string', traitUrls),
        ],
      });
    }

    signAndExecuteTransaction({ transaction: tx }, {
      onSuccess: () => {
        displayMessage(`[ SUCCESS: ${availableToMint} OPERATIVES SECURED IN WALLET ]`);
        refetchRegistry();
        setIsProcessing(false);
      },
      onError: (err) => {
        console.error(err);
        displayMessage(`[ ERROR: BATCH CLAIM TRANSACTION FAILED ]`);
        setIsProcessing(false);
      },
    });
  };

  if (!account) {
    return <div style={{ color: '#ff3333', textAlign: 'center', marginTop: '2rem' }}>[ ERROR: WALLET DISCONNECTED ]</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '650px', margin: '0 auto' }}>
      {txMessage && (
        <div style={{
          padding: '12px', textAlign: 'center', fontWeight: 'bold',
          backgroundColor: txMessage.includes('ERROR') ? 'rgba(255, 0, 0, 0.15)' : 'rgba(6, 182, 212, 0.15)',
          border: `1px solid ${txMessage.includes('ERROR') ? '#ff3333' : '#06B6D4'}`,
          color: txMessage.includes('ERROR') ? '#ff3333' : '#06B6D4',
        }}>
          {txMessage}
        </div>
      )}

      {/* SYSTEM STATUS */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: '#06B6D4' }}>// SYSTEM STATUS</h3>
          <button 
            onClick={() => refetchRegistry()} 
            style={{ background: 'transparent', color: '#06B6D4', border: '1px solid #06B6D4', padding: '4px 12px', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            [ SYNC CHAIN DATA ]
          </button>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: '#A3A3A3' }}>Active Phase:</span>
          <span style={{ 
            fontWeight: 'bold',
            color: isError ? '#ff3333' : isLoading ? '#888' : currentPhase === 2 ? '#00ff00' : currentPhase === 1 ? '#ffff00' : '#ff3333' 
          }}>
            {isError ? 'RPC ERROR (BLOCKED)' : isLoading ? 'SYNCING ON-CHAIN DATA...' : currentPhase === 0 ? 'PAUSED' : currentPhase === 1 ? 'WHITELIST ONLY' : currentPhase === 2 ? 'PUBLIC LIVE' : 'CONNECTING...'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: '#A3A3A3' }}>Current Mint Price:</span>
          <span style={{ color: '#E5E5E5' }}>{currentPriceSui !== null ? `${currentPriceSui} SUI` : 'SYNCING...'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#A3A3A3' }}>Creator Vault:</span>
          <span style={{ color: '#E5E5E5' }}>{adminMinted !== null ? `${adminMinted} / 111 SECURED` : 'SYNCING...'}</span>
        </div>
      </div>

      {/* PHASE CONTROL */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4' }}>// PHASE CONTROL</h3>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => handleUpdatePhase(0)} disabled={isProcessing} style={{ flex: 1, padding: '12px', background: currentPhase === 0 ? 'rgba(255,51,51,0.25)' : 'rgba(255,51,51,0.05)', color: '#ff3333', border: '1px solid #ff3333', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
            PAUSE
          </button>
          <button onClick={() => handleUpdatePhase(1)} disabled={isProcessing} style={{ flex: 1, padding: '12px', background: currentPhase === 1 ? 'rgba(255,255,0,0.25)' : 'rgba(255,255,0,0.05)', color: '#ffff00', border: '1px solid #ffff00', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
            WHITELIST
          </button>
          <button onClick={() => handleUpdatePhase(2)} disabled={isProcessing} style={{ flex: 1, padding: '12px', background: currentPhase === 2 ? 'rgba(0,255,0,0.25)' : 'rgba(0,255,0,0.05)', color: '#00ff00', border: '1px solid #00ff00', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
            PUBLIC
          </button>
        </div>
      </div>

      {/* ADVANCED WHITELIST DISPATCHER */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4' }}>// DYNAMIC WHITELIST DISPATCHER</h3>
        <p style={{ color: '#A3A3A3', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: '1.4' }}>
          Format: <code>0xAddress, Quantity</code><br/>
          Example: <code>0xabcd...1234, 5</code> (Grants 5 tickets to that address).<br/>
          If you just paste addresses, it defaults to 1 ticket each.
        </p>
        
        <textarea 
          value={wlAddresses}
          onChange={(e) => setWlAddresses(e.target.value)}
          placeholder="0x123...abc, 5&#10;0x456...def, 2&#10;0x789...ghi"
          style={{ width: '100%', height: '120px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.2)', color: '#E5E5E5', padding: '10px', fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleIssueWhitelist} disabled={isProcessing || !wlAddresses.trim()} style={{ padding: '10px 24px', background: '#06B6D4', color: '#0D0D11', border: 'none', cursor: (!wlAddresses.trim() || isProcessing) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
            EXECUTE DYNAMIC AIRDROP
          </button>
        </div>
      </div>

      {/* ECONOMICS & TREASURY */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4' }}>// ECONOMICS & TREASURY</h3>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <input 
            type="number" 
            value={newPriceSui} 
            onChange={(e) => setNewPriceSui(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#E5E5E5', padding: '10px', fontFamily: 'inherit' }}
            placeholder="New Price (SUI)"
          />
          <button onClick={handleUpdatePrice} disabled={isProcessing} style={{ padding: '10px 20px', background: '#E5E5E5', color: '#0D0D11', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
            UPDATE PRICE
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
          <div>
            <div style={{ color: '#A3A3A3', fontSize: '0.85rem' }}>Collected Treasury</div>
            <div style={{ color: '#00ff00', fontSize: '1.5rem', fontWeight: 'bold' }}>{treasurySui} SUI</div>
          </div>
          <button onClick={handleWithdraw} disabled={isProcessing || treasurySui === 0} style={{ padding: '10px 20px', background: 'transparent', color: '#06B6D4', border: '1px solid #06B6D4', cursor: treasurySui === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            WITHDRAW FUNDS
          </button>
        </div>
      </div>

      {/* CREATOR VAULT */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#06B6D4' }}>// CREATOR SECURE VAULT (111 TOTAL)</h3>
        <p style={{ color: '#A3A3A3', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Mint reserved Operatives (including the 5 Mythics) directly to your admin wallet.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => handleBatchMintReserve(1)} disabled={isProcessing || (adminMinted ?? 0) >= 111} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#E5E5E5', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
            MINT 1
          </button>
          <button onClick={() => handleBatchMintReserve(5)} disabled={isProcessing || (adminMinted ?? 0) >= 111} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#E5E5E5', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
            MINT 5
          </button>
          <button onClick={() => handleBatchMintReserve(10)} disabled={isProcessing || (adminMinted ?? 0) >= 111} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#E5E5E5', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
            MINT 10
          </button>
          <button onClick={() => handleBatchMintReserve(25)} disabled={isProcessing || (adminMinted ?? 0) >= 111} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#06B6D4', border: '1px solid #06B6D4', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold' }}>
            MINT 25
          </button>
        </div>
      </div>
    </div>
  );
}