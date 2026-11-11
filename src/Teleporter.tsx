import React from 'react';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { useAccount as useEvmAccount, useConnect as useEvmConnect, useDisconnect as useEvmDisconnect } from 'wagmi';

export const Teleporter = () => {
  // SUI WALLET
  const suiAccount = useCurrentAccount();

  // EVM WALLET (Base / Polygon)
  const { address: evmAddress, isConnected: isEvmConnected } = useEvmAccount();
  const { connect: connectEvm, connectors } = useEvmConnect();
  const { disconnect: disconnectEvm } = useEvmDisconnect();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: '800px', background: 'rgba(255,255,255,0.02)', padding: '2rem', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '2px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 1rem 0', color: '#06B6D4', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.25rem' }}>
          // OMNICHAIN TELEPORTER
        </h2>
        <p style={{ color: '#A3A3A3', fontSize: '0.85rem', lineHeight: '1.6', margin: '0 auto 2rem auto', maxWidth: '600px' }}>
          Constructs locked in outer EVM spokes (Base, Polygon) cannot access the Armory. Connect your Web3 wallets to lock your static assets and teleport them back to the Sui Engine Room for decryption and trait assembly, or export your Sui constructs to EVM chains for marketplace trading.
        </p>
        
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* EVM SPOKE AREA */}
          <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px dashed #444', padding: '2rem', width: '250px', borderRadius: '2px' }}>
            <div style={{ color: '#E5E5E5', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>
              SPOKE NETWORK (EVM)
            </div>
            {!isEvmConnected ? (
              <button 
                onClick={() => connectEvm({ connector: connectors[0] })} 
                style={{ background: '#E5E5E5', color: '#0D0D11', padding: '10px', border: 'none', width: '100%', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', borderRadius: '2px', transition: 'all 0.3s ease' }}
              >
                CONNECT METAMASK
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ color: '#00ff80', fontSize: '12px', fontFamily: 'monospace' }}>
                  {evmAddress?.slice(0,6)}...{evmAddress?.slice(-4)}
                </span>
                <button 
                  onClick={() => disconnectEvm()} 
                  style={{ background: 'transparent', color: '#ff3333', border: '1px solid #ff3333', padding: '6px', fontSize: '9px', cursor: 'pointer', borderRadius: '2px' }}
                >
                  DISCONNECT
                </button>
              </div>
            )}
          </div>

          <div style={{ color: '#06B6D4', fontSize: '24px' }}>⇿</div>

          {/* SUI HUB AREA */}
          <div style={{ background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.3)', padding: '2rem', width: '250px', borderRadius: '2px' }}>
            <div style={{ color: '#06B6D4', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>
              ENGINE ROOM (SUI)
            </div>
            <div className="neon-wallet-override" style={{ display: 'flex', justifyContent: 'center' }}>
              <ConnectButton />
            </div>
          </div>

        </div>
        
        {/* Placeholder for Bridge Actions (will appear only when both are connected) */}
        {isEvmConnected && suiAccount && (
          <div style={{ marginTop: '2rem', padding: '1rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
            <span style={{ color: '#A3A3A3', fontSize: '11px', letterSpacing: '0.1em' }}>[ BRIDGE PROTOCOLS ONLINE — AWAITING SMART CONTRACT BINDINGS ]</span>
          </div>
        )}

      </div>
    </div>
  );
};