/**
 * Safety & Privacy sanitization helper for cleaning and detecting PII
 */

const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/i;
const AADHAAR_REGEX = /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/;
const PHONE_REGEX = /\b(?:\+?91[\-\s]?)?[6-9]\d{9}\b/;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const OTP_REGEX = /\b\d{6}\b/;

/**
 * Checks if the input contains sensitive PII (PAN, Aadhaar, Phone, Email, OTP).
 * @param {string} text - The user query to evaluate.
 * @returns {object} - { containsPII: boolean, type: string | null }
 */
export function detectPII(text) {
  if (PAN_REGEX.test(text)) {
    return { containsPII: true, type: 'PAN Number' };
  }
  if (AADHAAR_REGEX.test(text)) {
    return { containsPII: true, type: 'Aadhaar Number' };
  }
  if (PHONE_REGEX.test(text)) {
    return { containsPII: true, type: 'Phone Number' };
  }
  if (EMAIL_REGEX.test(text)) {
    return { containsPII: true, type: 'Email Address' };
  }
  if (OTP_REGEX.test(text)) {
    return { containsPII: true, type: 'OTP (One-Time Password)' };
  }
  return { containsPII: false, type: null };
}

/**
 * Sanitizes input text by replacing PII patterns with redacted placeholders.
 * @param {string} text 
 * @returns {string}
 */
export function sanitizeInput(text) {
  return text
    .replace(PAN_REGEX, '[REDACTED PAN]')
    .replace(AADHAAR_REGEX, '[REDACTED AADHAAR]')
    .replace(PHONE_REGEX, '[REDACTED PHONE]')
    .replace(EMAIL_REGEX, '[REDACTED EMAIL]')
    .replace(OTP_REGEX, '[REDACTED OTP]');
}
