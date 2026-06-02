# LITMUS

**Live:** https://litmus-971342541474.asia-northeast3.run.app

> **Prove you qualify. Read what others can't.**

On-chain activity gated content vault powered by [CDR](https://github.com/piplabs/cdr-sdk) on Story Protocol.

---

## Concept

**Prove-to-Read** — content access is gated not by payment, but by proof of on-chain activity.

| | onscroll | **LITMUS** |
|---|---|---|
| Access model | Pay-to-Read | **Prove-to-Read** |
| Gate | Payment | On-chain conditions |
| Target | General users | Crypto-native, Web3 power users |

The UX metaphor is a litmus paper strip: connect your wallet, verify conditions, and watch the strip turn **blue (Pass)** or **red (Fail)**.

---

## How It Works

**Publisher flow**
1. Connect wallet
2. Write markdown content
3. Build access conditions (no-code) — pick from 9 condition types, combine with AND/OR
4. Encrypt & upload to CDR vault
5. Share the generated link

**Reader flow**
1. Open share link
2. Connect wallet
3. Click Verify — on-chain conditions are checked automatically
4. Litmus strip animates blue → content decrypted and revealed
5. Or red → conditions not met, requirements shown

---

## Condition Library (9 types)

### Tier 1 — Balance-based
| Contract | Condition |
|---|---|
| `TokenBalanceCondition` | Hold ≥ N of an ERC-20 token |
| `NFTHolderCondition` | Hold ≥ N of an ERC-721 NFT |
| `NativeBalanceCondition` | Hold ≥ N IP (native token) |

### Tier 2 — Activity-based
| Contract | Condition |
|---|---|
| `TxCountCondition` | Total tx count ≥ N (via ActivityRegistry oracle) |
| `ContractCallCountCondition` | Called specific contract ≥ N times |
| `FirstTxBeforeCondition` | First tx was before a given date (OG gate) |

### Tier 3 — Advanced
| Contract | Condition |
|---|---|
| `MultiCondition` | AND / OR combinator over any conditions |
| `TimeLockedCondition` | Access only after a specific date |
| `StoryIPLicenseCondition` | Holds a Story Protocol IP license |

**MultiCondition example:**
```
(NFT holder OR token ≥ 100) AND (tx count ≥ 50) AND (after June 2026)
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Chain | Story Testnet Aeneid (chainId 1315) |
| Contracts | Solidity — ReadCondition library |
| CDR | `@piplabs/cdr-sdk` |
| Frontend | Next.js 16 + TypeScript |
| Wallet | viem + wagmi |
| Encryption | Web Crypto AES-GCM (content) + CDR TDH2 (key) |

---

## Deployed Contracts (Story Aeneid)

| Contract | Address |
|---|---|
| OpenWriteCondition | `0x2E5cdbCBb12c8cb9264c9CEefD91ff23eDF33299` |
| TokenBalanceCondition | `0x817FB42104860B1a432fF4eC2d7c5AD8964fE9a9` |
| NFTHolderCondition | `0xC704A829d16ab821871b0Ec30097A1f7c4b51C9f` |
| NativeBalanceCondition | `0x743A1980d19eB13D9fa19868F5721e04392e5b33` |
| ActivityRegistry | `0x154AC00A10EED8Bb9A3E20087eF7C41c0CB01248` |
| TxCountCondition | `0xe7720dAdEcdcB42953A46B9653983413B5080489` |
| ContractCallCountCondition | `0xB1435C3E1467874D4b553B5da7D40928Cd37b230` |
| FirstTxBeforeCondition | `0x008EA47c2D6C18B3E7Bb7b260E534E9dd72b2E27` |
| MultiCondition | `0x43C0a677a1FE0367500C1CE123a595CaD8fD7a15` |
| TimeLockedCondition | `0xb4520023a48859593AA950133B9c414fE74411eF` |
| StoryIPLicenseCondition | `0x2d5517A5A809705Ac34A85C7Eb6b2d3b89C90349` |

---

## Run Locally

```bash
git clone https://github.com/blanco-3/litmus
cd litmus
npm install
npm run dev
# → http://localhost:3000
```

### Deploy contracts (first time)

```bash
DEPLOYER_PRIVATE_KEY=0x... bash contracts/deploy.sh
```

Requires a wallet funded with IP on Story Aeneid testnet.
Faucet: https://faucet.story.foundation/

---

## CDR Hackathon

- Track targets: **Technical Implementation** + **Best CDR Application**
- Submission: https://build.usecdr.dev
- Chain: Story Testnet Aeneid
