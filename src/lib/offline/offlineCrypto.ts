/**
 * Secure Offline Password Cryptography for Ordexa POS
 * Uses W3C Web Crypto API (SubtleCrypto)
 * Algorithm: PBKDF2-HMAC-SHA256 with 100,000 iterations and 16-byte cryptographically secure random salt
 * 
 * Strict Security Rules:
 * - Passwords are NEVER stored in plaintext.
 * - Only the cryptographically derived salt, iteration count, and hash are persisted.
 * - Password verification is performed locally with constant-time equality checks.
 */

export interface PasswordVerifier {
  algorithm: 'PBKDF2-HMAC-SHA256';
  salt: string; // Hex string (32 chars / 16 bytes)
  iterations: number;
  hash: string; // Hex string (64 chars / 32 bytes)
}

function getCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API is not available in this environment.');
}

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string format.');
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Creates a secure PBKDF2-HMAC-SHA256 verifier for an online-authenticated user
 */
export async function createPasswordVerifier(password: string): Promise<PasswordVerifier> {
  const cryptoObj = getCrypto();
  const encoder = new TextEncoder();

  // 1. Generate 16 bytes cryptographically random salt
  const salt = new Uint8Array(16);
  cryptoObj.getRandomValues(salt);

  // 2. Import raw password as key material
  const keyMaterial = await cryptoObj.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // 3. Derive 256-bit key using PBKDF2-HMAC-SHA256
  const iterations = 100000;
  const derivedBits = await cryptoObj.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256 // 32 bytes
  );

  return {
    algorithm: 'PBKDF2-HMAC-SHA256',
    salt: bufferToHex(salt),
    iterations,
    hash: bufferToHex(derivedBits),
  };
}

/**
 * Verifies a candidate password against an offline PasswordVerifier in constant time
 */
export async function verifyPasswordWithVerifier(
  candidatePassword: string,
  verifier: PasswordVerifier
): Promise<boolean> {
  try {
    if (!candidatePassword || !verifier || !verifier.salt || !verifier.hash) {
      return false;
    }

    if (verifier.algorithm !== 'PBKDF2-HMAC-SHA256') {
      console.warn('Unsupported password verifier algorithm:', verifier.algorithm);
      return false;
    }

    const cryptoObj = getCrypto();
    const encoder = new TextEncoder();
    const saltBytes = hexToUint8Array(verifier.salt);

    const keyMaterial = await cryptoObj.subtle.importKey(
      'raw',
      encoder.encode(candidatePassword),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const derivedBits = await cryptoObj.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: verifier.iterations || 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const derivedHashHex = bufferToHex(derivedBits);

    // Constant-time string comparison to prevent timing attacks
    if (derivedHashHex.length !== verifier.hash.length) {
      return false;
    }

    let mismatch = 0;
    for (let i = 0; i < derivedHashHex.length; i++) {
      mismatch |= derivedHashHex.charCodeAt(i) ^ verifier.hash.charCodeAt(i);
    }

    return mismatch === 0;
  } catch (err) {
    console.error('Offline password verification error:', err);
    return false;
  }
}
