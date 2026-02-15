import * as crypto from 'crypto';

const BASE62_CHARS =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateRandomCode(length = 6): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, 62); // Cryptographically secure
    result += BASE62_CHARS[randomIndex];
  }

  return result;
}
