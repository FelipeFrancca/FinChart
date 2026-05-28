/**
 * Symmetric Encryption Utility (AES-256-GCM)
 *
 * Usado para armazenar senhas IMAP no banco de dados de forma segura.
 * A chave mestra vem de `process.env.APP_ENCRYPTION_KEY` (32 bytes).
 *
 * Formato de saída: `iv:authTag:encryptedText` (tudo em hex)
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Obtém a chave mestra de encriptação das variáveis de ambiente.
 * A chave deve ter exatamente 32 bytes (256 bits).
 *
 * @throws Error se APP_ENCRYPTION_KEY não estiver definida ou tiver tamanho incorreto.
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.APP_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error(
      'APP_ENCRYPTION_KEY não está configurada. ' +
      'Gere uma chave com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  const key = Buffer.from(keyHex, 'hex');

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `APP_ENCRYPTION_KEY deve ter ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} caracteres hex). ` +
      `Recebido: ${key.length} bytes (${keyHex.length} caracteres).`,
    );
  }

  return key;
}

/**
 * Encripta um texto usando AES-256-GCM.
 *
 * @param text - Texto plano a ser encriptado
 * @returns String no formato `iv:authTag:encryptedText` (hex)
 *
 * @example
 * ```ts
 * const encrypted = encryptSymmetric('minha-senha-secreta');
 * // "a1b2c3...:d4e5f6...:789abc..."
 * ```
 */
export function encryptSymmetric(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Formato: iv:authTag:encryptedText
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decripta um texto encriptado com AES-256-GCM.
 *
 * @param encrypted - String no formato `iv:authTag:encryptedText` (hex)
 * @returns Texto plano original
 * @throws Error se o formato for inválido ou a chave/tag forem incorretas
 *
 * @example
 * ```ts
 * const password = decryptSymmetric(encryptedFromDb);
 * ```
 */
export function decryptSymmetric(encrypted: string): string {
  const key = getEncryptionKey();

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Formato de texto encriptado inválido. Esperado: "iv:authTag:encryptedText"',
    );
  }

  const [ivHex, authTagHex, encryptedText] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
