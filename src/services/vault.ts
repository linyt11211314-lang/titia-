// Titia 时序 · 密码箱加密服务（Web Crypto / PBKDF2 + AES-GCM）
// 设计原则：主密码永不落库，仅保存派生所需的 salt/iterations 与用主密码加密的 verifier 令牌。
// 每条密码以独立随机 iv 加密，密文 {iv, cipher} 入库；解锁后用内存中的会话密钥解密展示。

const enc = new TextEncoder()
const dec = new TextDecoder()
const ITERATIONS = 150_000
const VERIFIER = 'titia-vault-v1'

function toB64(buf: Uint8Array): string {
  let s = ''
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
  return btoa(s)
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(master: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(master) as BufferSource, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface VaultMetaSeed {
  salt: string
  iterations: number
  verifier: string
}

/** 首次创建：生成 salt，派生密钥，写入可被主密码解开的 verifier。 */
export async function createVaultMeta(master: string): Promise<VaultMetaSeed> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(master, salt, ITERATIONS)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(VERIFIER) as BufferSource)
  return {
    salt: toB64(salt),
    iterations: ITERATIONS,
    verifier: `${toB64(iv)}:${toB64(new Uint8Array(cipher))}`,
  }
}

/** 校验结果：key 为空时 reason 说明失败原因（便于排查） */
export interface VerifyResult {
  key: CryptoKey | null
  reason: string
}

/** 校验主密码（详细）：正确返回派生的 AES 密钥；失败返回 null + 详细原因。 */
export async function verifyMasterDetailed(meta: VaultMetaSeed, master: string): Promise<VerifyResult> {
  // 元数据缺失/损坏（旧格式或数据异常）
  if (!meta || typeof meta.salt !== 'string' || !meta.salt) {
    return { key: null, reason: 'META_MISSING: 密码元数据缺失（salt）' }
  }
  if (typeof meta.verifier !== 'string' || !meta.verifier.includes(':')) {
    return { key: null, reason: 'META_VERIFIER: 密码元数据损坏（verifier 格式错误）' }
  }
  if (!Number.isFinite(meta.iterations) || meta.iterations < 1000) {
    return { key: null, reason: 'META_ITER: 密码元数据参数异常（iterations）' }
  }
  if (!master) return { key: null, reason: 'EMPTY_PASSWORD: 未输入密码' }
  try {
    const key = await deriveKey(master, fromB64(meta.salt), meta.iterations)
    const [ivB64, cipherB64] = meta.verifier.split(':')
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(ivB64) as BufferSource },
      key,
      fromB64(cipherB64) as BufferSource,
    )
    return dec.decode(plain) === VERIFIER ? { key, reason: 'OK' } : { key: null, reason: 'WRONG_PASSWORD: 主密码不匹配（请检查大小写/首尾空格）' }
  } catch (e) {
    // AES-GCM decrypt 抛错 = 密码错误（tag 不匹配）或密文损坏
    return { key: null, reason: `VERIFY_DECRYPT: 校验失败（${e instanceof Error ? e.message : String(e)}）` }
  }
}

/** 校验主密码（兼容旧调用）：正确返回派生的 AES 密钥，错误返回 null。 */
export async function verifyMaster(meta: VaultMetaSeed, master: string): Promise<CryptoKey | null> {
  return (await verifyMasterDetailed(meta, master)).key
}

export async function encryptSecret(key: CryptoKey, plaintext: string): Promise<{ iv: string; cipher: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(plaintext) as BufferSource)
  return { iv: toB64(iv), cipher: toB64(new Uint8Array(cipher)) }
}

export async function decryptSecret(key: CryptoKey, secret: { iv: string; cipher: string }): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(secret.iv) as BufferSource },
    key,
    fromB64(secret.cipher) as BufferSource,
  )
  return dec.decode(plain)
}
