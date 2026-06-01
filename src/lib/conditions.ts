import { encodeAbiParameters, decodeAbiParameters, parseAbiParameters } from 'viem'
import type { Hex } from 'viem'
import addresses from '../../deployments/addresses.json'

/**
 * "Always true" condition contract — returns true for ANY call regardless of selector.
 * Used as readConditionAddr so the CDR precompile can call it without issues.
 * The REAL condition is packed into readConditionData via encodeHybridData.
 * Bytecode: 0x600160005260206000f3
 */
export const ALWAYS_TRUE_CONDITION = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd' as Hex

/**
 * Pack the real condition contract + params into readConditionData.
 * vault.readConditionAddr = ALWAYS_TRUE_CONDITION (CDR precompile compatible)
 * vault.readConditionData = encodeHybridData(realAddr, realData)  (frontend checks this)
 */
export function encodeHybridData(conditionAddr: Hex, conditionData: Hex): Hex {
  return encodeAbiParameters(
    parseAbiParameters('address conditionAddr, bytes conditionData'),
    [conditionAddr, conditionData]
  )
}

/**
 * Unpack hybrid readConditionData → real condition contract + params.
 * Returns null if decoding fails (old-format vault).
 */
export function decodeHybridData(data: Hex): { conditionAddr: Hex; conditionData: Hex } | null {
  try {
    const [conditionAddr, conditionData] = decodeAbiParameters(
      parseAbiParameters('address conditionAddr, bytes conditionData'),
      data
    )
    return { conditionAddr: conditionAddr as Hex, conditionData: conditionData as Hex }
  } catch {
    return null
  }
}

export type ConditionType =
  | 'TokenBalance'
  | 'NFTHolder'
  | 'NativeBalance'
  | 'TxCount'
  | 'ContractCallCount'
  | 'FirstTxBefore'
  | 'MultiCondition'
  | 'TimeLocked'
  | 'StoryIPLicense'

export interface ConditionParam {
  label: string
  name: string
  type: 'address' | 'uint256' | 'timestamp'
  placeholder: string
  /** Pre-filled default value (e.g., deployed contract address) */
  defaultValue?: string
  /** If true, the field is read-only in the UI */
  readonly?: boolean
}

const REGISTRY_ADDR = addresses.contracts.ActivityRegistry

export const CONDITION_PARAMS: Record<ConditionType, ConditionParam[]> = {
  TokenBalance: [
    { label: 'Token Contract', name: 'token', type: 'address', placeholder: '0x...' },
    { label: 'Min Amount (wei)', name: 'minAmount', type: 'uint256', placeholder: '1000000000000000000' },
  ],
  NFTHolder: [
    { label: 'NFT Contract', name: 'nftContract', type: 'address', placeholder: '0x...' },
    { label: 'Min Balance', name: 'minBalance', type: 'uint256', placeholder: '1' },
  ],
  NativeBalance: [
    { label: 'Min IP Balance (wei)', name: 'minWei', type: 'uint256', placeholder: '1000000000000000000' },
  ],
  TxCount: [
    {
      label: 'Activity Registry',
      name: 'registry',
      type: 'address',
      placeholder: REGISTRY_ADDR,
      defaultValue: REGISTRY_ADDR,
      readonly: true,
    },
    { label: 'Min Tx Count', name: 'minCount', type: 'uint256', placeholder: '10' },
  ],
  ContractCallCount: [
    {
      label: 'Activity Registry',
      name: 'registry',
      type: 'address',
      placeholder: REGISTRY_ADDR,
      defaultValue: REGISTRY_ADDR,
      readonly: true,
    },
    { label: 'Target Contract', name: 'targetContract', type: 'address', placeholder: '0x...' },
    { label: 'Min Call Count', name: 'minCount', type: 'uint256', placeholder: '5' },
  ],
  FirstTxBefore: [
    {
      label: 'Activity Registry',
      name: 'registry',
      type: 'address',
      placeholder: REGISTRY_ADDR,
      defaultValue: REGISTRY_ADDR,
      readonly: true,
    },
    { label: 'Before Date', name: 'beforeTimestamp', type: 'timestamp', placeholder: '2025-01-01' },
  ],
  MultiCondition: [],
  TimeLocked: [
    { label: 'Unlock Date (UTC)', name: 'unlockTime', type: 'timestamp', placeholder: '2026-06-01' },
  ],
  StoryIPLicense: [
    { label: 'License Token Contract', name: 'licenseToken', type: 'address', placeholder: '0x...' },
    { label: 'License Terms ID (0 = any)', name: 'licenseTermsId', type: 'uint256', placeholder: '0' },
  ],
}

/** Returns default params for a condition type (pre-fills known addresses) */
export function defaultParams(type: ConditionType): Record<string, string> {
  const result: Record<string, string> = {}
  for (const p of CONDITION_PARAMS[type]) {
    if (p.defaultValue) result[p.name] = p.defaultValue
  }
  return result
}

/** Validates that all required params are present and non-empty */
export function validateParams(type: ConditionType, params: Record<string, string>): string | null {
  for (const p of CONDITION_PARAMS[type]) {
    if (p.readonly) continue // auto-filled, skip
    const v = params[p.name]?.trim()
    if (!v) return `"${p.label}" is required for ${type}`
    if (p.type === 'address' && !v.startsWith('0x')) return `"${p.label}" must be a valid address`
    if (p.type === 'uint256') {
      try { BigInt(v) } catch { return `"${p.label}" must be a valid number` }
    }
    if (p.type === 'timestamp' && isNaN(new Date(v).getTime())) {
      return `"${p.label}" must be a valid date (YYYY-MM-DD)`
    }
  }
  return null
}

export function encodeConditionData(type: ConditionType, params: Record<string, string>): Hex {
  // Auto-fill registry address if not set
  const p = { ...params }
  for (const def of CONDITION_PARAMS[type]) {
    if (def.defaultValue && !p[def.name]) p[def.name] = def.defaultValue
  }

  switch (type) {
    case 'TokenBalance':
      return encodeAbiParameters(
        parseAbiParameters('address token, uint256 minAmount'),
        [p.token as Hex, BigInt(p.minAmount)]
      )
    case 'NFTHolder':
      return encodeAbiParameters(
        parseAbiParameters('address nftContract, uint256 minBalance'),
        [p.nftContract as Hex, BigInt(p.minBalance)]
      )
    case 'NativeBalance':
      return encodeAbiParameters(
        parseAbiParameters('uint256 minWei'),
        [BigInt(p.minWei)]
      )
    case 'TxCount':
      return encodeAbiParameters(
        parseAbiParameters('address registry, uint256 minCount'),
        [p.registry as Hex, BigInt(p.minCount)]
      )
    case 'ContractCallCount':
      return encodeAbiParameters(
        parseAbiParameters('address registry, address targetContract, uint256 minCount'),
        [p.registry as Hex, p.targetContract as Hex, BigInt(p.minCount)]
      )
    case 'FirstTxBefore': {
      const ts = Math.floor(new Date(p.beforeTimestamp).getTime() / 1000)
      return encodeAbiParameters(
        parseAbiParameters('address registry, uint256 beforeTimestamp'),
        [p.registry as Hex, BigInt(ts)]
      )
    }
    case 'TimeLocked': {
      const ts = Math.floor(new Date(p.unlockTime).getTime() / 1000)
      return encodeAbiParameters(
        parseAbiParameters('uint256 unlockTime'),
        [BigInt(ts)]
      )
    }
    case 'StoryIPLicense':
      return encodeAbiParameters(
        parseAbiParameters('address licenseToken, uint256 licenseTermsId'),
        [p.licenseToken as Hex, BigInt(p.licenseTermsId)]
      )
    case 'MultiCondition':
      return '0x'
    default:
      return '0x'
  }
}

export function encodeMultiCondition(
  conditions: { address: Hex; conditionData: Hex }[],
  operators: boolean[]
): Hex {
  const addrs = conditions.map((c) => c.address)
  const datas = conditions.map((c) => c.conditionData)
  return encodeAbiParameters(
    parseAbiParameters('address[] conditions, bytes[] conditionDatas, bool[] isAnd'),
    [addrs, datas, operators]
  )
}

export function conditionLabel(type: ConditionType, params: Record<string, string>): string {
  switch (type) {
    case 'TokenBalance':
      return `Hold ≥ ${params.minAmount ?? '?'} wei of token ${params.token?.slice(0, 10) ?? '?'}...`
    case 'NFTHolder':
      return `Hold ≥ ${params.minBalance ?? '?'} NFT of ${params.nftContract?.slice(0, 10) ?? '?'}...`
    case 'NativeBalance':
      return `Hold ≥ ${params.minWei ?? '?'} wei IP`
    case 'TxCount':
      return `Total tx count ≥ ${params.minCount ?? '?'} (via ActivityRegistry)`
    case 'ContractCallCount':
      return `Called ${params.targetContract?.slice(0, 10) ?? '?'}... ≥ ${params.minCount ?? '?'} times`
    case 'FirstTxBefore':
      return `First tx before ${params.beforeTimestamp ?? '?'} (OG gate)`
    case 'TimeLocked':
      return `Unlocks after ${params.unlockTime ?? '?'} (UTC)`
    case 'StoryIPLicense':
      return `Holds Story IP license${params.licenseTermsId && params.licenseTermsId !== '0' ? ` #${params.licenseTermsId}` : ' (any)'}`
    case 'MultiCondition':
      return 'Multi-condition group'
    default:
      return type
  }
}
