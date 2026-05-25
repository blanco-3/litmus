import { encodeAbiParameters, parseAbiParameters } from 'viem'
import type { Hex } from 'viem'

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
}

export const CONDITION_PARAMS: Record<ConditionType, ConditionParam[]> = {
  TokenBalance: [
    { label: 'Token Contract', name: 'token', type: 'address', placeholder: '0x...' },
    { label: 'Min Amount (wei)', name: 'minAmount', type: 'uint256', placeholder: '100000000000000000000' },
  ],
  NFTHolder: [
    { label: 'NFT Contract', name: 'nftContract', type: 'address', placeholder: '0x...' },
    { label: 'Min Balance', name: 'minBalance', type: 'uint256', placeholder: '1' },
  ],
  NativeBalance: [
    { label: 'Min IP Balance (wei)', name: 'minWei', type: 'uint256', placeholder: '1000000000000000000' },
  ],
  TxCount: [
    { label: 'Activity Registry', name: 'registry', type: 'address', placeholder: '0x...' },
    { label: 'Min Tx Count', name: 'minCount', type: 'uint256', placeholder: '50' },
  ],
  ContractCallCount: [
    { label: 'Activity Registry', name: 'registry', type: 'address', placeholder: '0x...' },
    { label: 'Target Contract', name: 'targetContract', type: 'address', placeholder: '0x...' },
    { label: 'Min Call Count', name: 'minCount', type: 'uint256', placeholder: '10' },
  ],
  FirstTxBefore: [
    { label: 'Activity Registry', name: 'registry', type: 'address', placeholder: '0x...' },
    { label: 'Before Date', name: 'beforeTimestamp', type: 'timestamp', placeholder: '2025-01-01' },
  ],
  MultiCondition: [], // handled specially by the builder
  TimeLocked: [
    { label: 'Unlock Date', name: 'unlockTime', type: 'timestamp', placeholder: '2026-06-01' },
  ],
  StoryIPLicense: [
    { label: 'License Token Contract', name: 'licenseToken', type: 'address', placeholder: '0x...' },
    { label: 'License Terms ID (0 = any)', name: 'licenseTermsId', type: 'uint256', placeholder: '0' },
  ],
}

export const READ_CONDITION_ABI = [
  {
    name: 'canRead',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'reader', type: 'address' },
      { name: 'conditionData', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export function encodeConditionData(type: ConditionType, params: Record<string, string>): Hex {
  switch (type) {
    case 'TokenBalance':
      return encodeAbiParameters(
        parseAbiParameters('address token, uint256 minAmount'),
        [params.token as Hex, BigInt(params.minAmount)]
      )
    case 'NFTHolder':
      return encodeAbiParameters(
        parseAbiParameters('address nftContract, uint256 minBalance'),
        [params.nftContract as Hex, BigInt(params.minBalance)]
      )
    case 'NativeBalance':
      return encodeAbiParameters(
        parseAbiParameters('uint256 minWei'),
        [BigInt(params.minWei)]
      )
    case 'TxCount':
      return encodeAbiParameters(
        parseAbiParameters('address registry, uint256 minCount'),
        [params.registry as Hex, BigInt(params.minCount)]
      )
    case 'ContractCallCount':
      return encodeAbiParameters(
        parseAbiParameters('address registry, address targetContract, uint256 minCount'),
        [params.registry as Hex, params.targetContract as Hex, BigInt(params.minCount)]
      )
    case 'FirstTxBefore': {
      const ts = Math.floor(new Date(params.beforeTimestamp).getTime() / 1000)
      return encodeAbiParameters(
        parseAbiParameters('address registry, uint256 beforeTimestamp'),
        [params.registry as Hex, BigInt(ts)]
      )
    }
    case 'TimeLocked': {
      const ts = Math.floor(new Date(params.unlockTime).getTime() / 1000)
      return encodeAbiParameters(
        parseAbiParameters('uint256 unlockTime'),
        [BigInt(ts)]
      )
    }
    case 'StoryIPLicense':
      return encodeAbiParameters(
        parseAbiParameters('address licenseToken, uint256 licenseTermsId'),
        [params.licenseToken as Hex, BigInt(params.licenseTermsId)]
      )
    case 'MultiCondition':
      // MultiCondition encoding is handled separately by encodeMultiCondition
      return '0x'
    default:
      return '0x'
  }
}

export function encodeMultiCondition(
  conditions: { address: Hex; conditionData: Hex }[],
  operators: boolean[] // isAnd[i] = operator between conditions[i] and conditions[i+1]
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
      return `Hold ≥ ${params.minAmount} of token ${params.token?.slice(0, 10)}...`
    case 'NFTHolder':
      return `Hold ≥ ${params.minBalance} NFT of ${params.nftContract?.slice(0, 10)}...`
    case 'NativeBalance':
      return `Hold ≥ ${params.minWei} wei IP`
    case 'TxCount':
      return `Total tx count ≥ ${params.minCount}`
    case 'ContractCallCount':
      return `Called ${params.targetContract?.slice(0, 10)}... ≥ ${params.minCount} times`
    case 'FirstTxBefore':
      return `First tx before ${params.beforeTimestamp}`
    case 'TimeLocked':
      return `Unlocks after ${params.unlockTime}`
    case 'StoryIPLicense':
      return `Holds Story IP license${params.licenseTermsId !== '0' ? ` #${params.licenseTermsId}` : ''}`
    case 'MultiCondition':
      return 'Multi-condition group'
    default:
      return type
  }
}
