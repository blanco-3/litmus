// Stub for wagmi's optional `accounts` dependency (tempo/webAuthn connectors).
// We don't use those connectors — this prevents Turbopack from failing on the
// dynamic import('accounts') inside @wagmi/core/dist/esm/tempo/Connectors.js.
export const Provider = {}
export const dialog = () => { throw new Error('accounts stub: not available') }
export const webAuthn = () => { throw new Error('accounts stub: not available') }
export const dangerous_secp256k1 = () => { throw new Error('accounts stub: not available') }
