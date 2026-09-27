import { describe, expect, it } from 'vitest';
import {
  screenForSecrets,
  fingerprintValue,
  SecretDetectedError,
} from './secret-screen';

describe('secret screening', () => {
  describe('screenForSecrets', () => {
    it('passes clean operational content', () => {
      const result = screenForSecrets(
        'Repair moved from Diagnosing to Repairing. Part #4521 ordered.',
      );
      expect(result.blocked).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it('blocks OpenAI API keys', () => {
      // OpenAI project keys use a distinctive prefix and a long token body.
      const result = screenForSecrets(
        'Use sk-' + 'proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP for the API',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'openai_project_key')).toBe(
        true,
      );
    });

    it('blocks generic sk- keys', () => {
      const result = screenForSecrets('Key is sk-' + 'abcdefghijklmnopqrstuvwxyz');
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'openai_key')).toBe(true);
    });

    it('blocks Anthropic keys (more specific, matched before sk-)', () => {
      const result = screenForSecrets(
        'Use sk-' + 'ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 for Claude',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'anthropic_key')).toBe(true);
    });

    it('blocks GitHub PATs', () => {
      const result = screenForSecrets(
        'Token: github_pat_11AAAAAAA_abcdefghijklmnopqrstuvwxyz0123456789',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'github_pat')).toBe(true);
    });

    it('blocks GitHub fine-grained tokens (ghp_/ghs_)', () => {
      const result = screenForSecrets('ghp_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef');
      expect(result.blocked).toBe(true);
      expect(
        result.matches.some((m) => m.label === 'github_token'),
      ).toBe(true);
    });

    it('blocks GitLab PATs', () => {
      const result = screenForSecrets(
        'Use glpat-abcdefghijklmnopqrstuv for CI',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'gitlab_pat')).toBe(true);
    });

    it('blocks AWS access keys', () => {
      const result = screenForSecrets(
        'Key ID: AKIA' + 'IOSFODNN7EXAMPLE',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'aws_access_key')).toBe(
        true,
      );
    });

    it('blocks Google API keys', () => {
      // Google API keys: AIza + exactly 35 alphanumeric/underscore/dash chars
      // 35 chars after AIza: SyA1234567890abcdefghijklmnopqrstuv
      const result = screenForSecrets(
        'AIzaSyA1234567890abcdefghijklmnopqrstuv',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'google_api_key')).toBe(
        true,
      );
    });

    it('blocks Groq keys', () => {
      const result = screenForSecrets(
        'gsk_abcdefghijklmnopqrstuvwxyz012345',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'groq_key')).toBe(true);
    });

    it('blocks bearer and payment-provider secret keys', () => {
      expect(screenForSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456').blocked).toBe(true);
      expect(screenForSecrets('Stripe key sk_' + 'live_abcdefghijklmnopqrstuvwx').blocked).toBe(true);
    });

    it('blocks JWT tokens', () => {
      const result = screenForSecrets(
        'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'jwt')).toBe(true);
    });

    it('blocks PEM private keys', () => {
      const result = screenForSecrets(
        '-----BEGIN RSA' + ' PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF068\n-----END RSA PRIVATE KEY-----',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'private_key')).toBe(true);
    });

    it('blocks database URLs with embedded passwords', () => {
      const result = screenForSecrets(
        'Connect to postgresql://admin:supersecret123@db.example.com:5432/prod',
      );
      expect(result.blocked).toBe(true);
      expect(
        result.matches.some((m) => m.label === 'database_url_with_password'),
      ).toBe(true);
    });

    it('blocks multiple secrets in one content', () => {
      const result = screenForSecrets(
        'OpenAI key: sk-' + 'proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH and AWS: AKIA' + 'IOSFODNN7EXAMPLE',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.length).toBeGreaterThanOrEqual(2);
    });

    it('does not trigger on short sk- strings', () => {
      const result = screenForSecrets('Task has id sk-123');
      expect(result.blocked).toBe(false);
    });

    it('does not trigger on ordinary text containing "AI"', () => {
      const result = screenForSecrets(
        'AI is optional in Elara. The AI operator uses typed operations.',
      );
      expect(result.blocked).toBe(false);
    });

    it('does not trigger on localhost database URLs with short passwords', () => {
      const result = screenForSecrets(
        'Connect to postgres://postgres:pw@127.0.0.1:5432/elara',
      );
      // Short password (< 8 chars) should not trigger
      expect(result.blocked).toBe(false);
    });
  });

  describe('fingerprintValue', () => {
    it('returns [redacted] for short values', () => {
      expect(fingerprintValue('abc')).toBe('[redacted]');
      expect(fingerprintValue('12345')).toBe('[redacted]');
    });

    it('keeps prefix and suffix for medium values (6-15 chars)', () => {
      expect(fingerprintValue('1234567890')).toBe('12...90');
      expect(fingerprintValue('abcdefghij')).toBe('ab...ij');
    });

    it('keeps 4+4 for long values (> 15 chars)', () => {
      expect(fingerprintValue('abcdefghijklmnop')).toBe('abcd...mnop');
      expect(fingerprintValue('sk-' + 'proj-abcdef0123456789abcdef0123456789')).toBe(
        'sk-p...6789',
      );
    });
  });

  describe('SecretDetectedError', () => {
    it('contains only pattern labels, never raw secrets', () => {
      const error = new SecretDetectedError([
        { label: 'openai_key', start: 10, end: 50 },
        { label: 'github_token', start: 60, end: 90 },
      ]);

      expect(error.name).toBe('SecretDetectedError');
      expect(error.message).toContain('openai_key');
      expect(error.message).toContain('github_token');
      // Never contains the actual secret
      expect(error.message).not.toContain('sk-');
      expect(error.message).not.toContain('ghp_');
    });
  });

  describe('adversarial secret detection', () => {
    it('detects secrets embedded in prose', () => {
      const result = screenForSecrets(
        'The user configured their API with sk-' + 'proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH and it started working',
      );
      expect(result.blocked).toBe(true);
    });

    it('detects secrets in key=value format', () => {
      const result = screenForSecrets(
        'OPENAI_API_KEY=sk-' + 'proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH',
      );
      expect(result.blocked).toBe(true);
    });

    it('detects secrets after colon', () => {
      const result = screenForSecrets(
        'My API key: sk-' + 'ant-api03-abcdefghijklmnopqrstuvwxyz0123456789',
      );
      expect(result.blocked).toBe(true);
    });

    it('detects AWS keys in JSON-like context', () => {
      const result = screenForSecrets(
        '{"aws_access_key_id": "AKIA' + 'IOSFODNN7EXAMPLE", "region": "us-east-1"}',
      );
      expect(result.blocked).toBe(true);
    });

    it('does not produce raw secrets in error output', () => {
      const result = screenForSecrets(
        'Key: sk-' + 'proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH',
      );
      const error = new SecretDetectedError(result.matches);
      // The error message must not contain the raw secret
      expect(error.message).not.toContain(
        'sk-' + 'proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH',
      );
    });

    it('handles CJK text adjacent to secrets', () => {
      const result = screenForSecrets(
        '凭证为sk-' + 'ant-api03-abcdefghijklmnopqrstuvwxyz0123456789',
      );
      expect(result.blocked).toBe(true);
      expect(result.matches.some((m) => m.label === 'anthropic_key')).toBe(true);
    });
  });
});