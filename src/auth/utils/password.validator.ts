import { BadRequestException } from '@nestjs/common';

/**
 * Validates and lightly sanitizes a password.
 * Rules:
 * - Must be a string
 * - Trimmed length >= 8
 * - Must contain at least one letter
 * - Must contain at least one digit
 * - Must contain at least one special character (non-alphanumeric)
 * - Rejects < or > and certain script-like substrings to avoid obvious injection attempts
 * Returns the trimmed password when valid or throws BadRequestException when invalid.
 */
export function validateAndSanitizePassword(password: unknown): string {
  if (typeof password !== 'string') {
    throw new BadRequestException('Password must be a string');
  }

  const trimmed = password.trim();

  if (trimmed.length < 8) {
    throw new BadRequestException(
      'Password must be at least 8 characters long',
    );
  }

  const hasLetter = /[A-Za-z]/.test(trimmed);
  const hasDigit = /[0-9]/.test(trimmed);
  const hasSpecial = /[^A-Za-z0-9]/.test(trimmed);

  if (!hasLetter || !hasDigit || !hasSpecial) {
    throw new BadRequestException(
      'Password must contain letters, numbers, and at least one special character',
    );
  }

  // Reject angle brackets and obvious script substrings
  if (/[<>]/.test(trimmed)) {
    throw new BadRequestException('Password contains invalid characters');
  }

  const lowered = trimmed.toLowerCase();
  const suspicious = [
    '<script',
    'javascript:',
    'onerror',
    'onload',
    'onmouseover',
    'onclick',
  ];
  for (const s of suspicious) {
    if (lowered.includes(s)) {
      throw new BadRequestException('Password contains invalid content');
    }
  }

  return trimmed;
}
