import { isSubstrateAddress } from "@reef-defi/evm-provider/utils";
import {
    bufferToU8a,
    hexToBn,
    hexToString,
    hexToU8a,
    isBuffer,
    isHex,
    isU8a,
    u8aToBn,
    u8aToHex
  } from '@polkadot/util';
  import BN from 'bn.js';

export async function resolveEvmAddress(
    provider,
    nativeAddressOrName
){
    const resolved = await nativeAddressOrName;
    if (resolved.length === 42) {
      return resolved;
    }
    const result = await provider.api.query.evmAccounts.evmAddresses(resolved);
    return result.toString();
  }

  export function toBN(bigNumberis=0){
    if (isU8a(bigNumberis)) {
      return u8aToBn(bigNumberis);
    }
    if (isHex(bigNumberis)) {
      return hexToBn(bigNumberis);
    }
  
    if (BigNumber.isBigNumber(bigNumberis)) {
      const hex = bigNumberis.toHexString();
      if (hex[0] === '-') {
        return new BN('-' + hex.substring(3), 16);
      }
      return new BN(hex.substring(2), 16);
    }
  
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new BN(bigNumberis);
  }

// returns Reef native address
export async function resolveAddress(
    provider,
    evmAddressOrName
  ) {
    const resolved = await evmAddressOrName;
    if (isSubstrateAddress(resolved)) {
      return resolved;
    }
    const result = await provider.api.query.evmAccounts.accounts(resolved);
    return result.toString();
  }