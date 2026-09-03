/**
 * LabSync – Keys Service  |  js/services/keys.service.js
 * Frontend service module for Key Management and Key Transfer / Room Claim APIs.
 */

(function (global) {
  'use strict';

  async function fetchKeys() {
    const res = await fetch('/api/keys', { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch keys' }));
      throw new Error(err.error || 'Failed to fetch keys');
    }
    return res.json();
  }

  async function registerKey(roomId, keyCode) {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roomId, keyCode })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to register key' }));
      throw new Error(err.error || 'Failed to register key');
    }
    return res.json();
  }

  async function fetchKeyTag(keyId) {
    const res = await fetch(`/api/keys/${encodeURIComponent(keyId)}/tag`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to generate key tag' }));
      throw new Error(err.error || 'Failed to generate key tag');
    }
    return res.json();
  }

  async function markKeyMissing(keyId) {
    const res = await fetch(`/api/keys/${encodeURIComponent(keyId)}/missing`, {
      method: 'PUT',
      credentials: 'include'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to mark key missing' }));
      throw new Error(err.error || 'Failed to mark key missing');
    }
    return res.json();
  }

  async function markKeyActive(keyId) {
    const res = await fetch(`/api/keys/${encodeURIComponent(keyId)}/active`, {
      method: 'PUT',
      credentials: 'include'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to mark key active' }));
      throw new Error(err.error || 'Failed to mark key active');
    }
    return res.json();
  }

  async function fetchTransferInfo(keyCode) {
    const res = await fetch(`/api/keys/transfer-info/${encodeURIComponent(keyCode)}`, { credentials: 'include' });
    const data = await res.json().catch(() => ({ error: 'Failed to fetch key transfer information' }));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch key transfer information');
    }
    return data;
  }

  async function transferKey(keyCode) {
    const res = await fetch('/api/keys/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ keyCode })
    });
    const data = await res.json().catch(() => ({ error: 'Failed to complete key transfer' }));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to complete key transfer');
    }
    return data;
  }

  global.keysService = {
    fetchKeys,
    registerKey,
    fetchKeyTag,
    markKeyMissing,
    markKeyActive,
    fetchTransferInfo,
    transferKey
  };
})(typeof window !== 'undefined' ? window : this);
