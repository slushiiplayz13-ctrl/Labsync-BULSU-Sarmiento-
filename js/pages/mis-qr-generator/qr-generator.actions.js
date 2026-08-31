/**
 * LabSync – MIS PC Data Operations & Actions  |  js/pages/mis-qr-generator/qr-generator.actions.js
 * Encapsulates PC unit network requests, bulk creation with sequential fallback, and deletion with confirmation.
 */

(function (global) {
  'use strict';

  const PC_CACHE_PREFIX = 'labsync_cached_pcs_';

  /**
   * Retrieves cached PCs for a room from sessionStorage.
   * @param {number|string} roomId
   * @returns {Array|null}
   */
  function getCachedRoomPCs(roomId) {
    if (!roomId) return null;
    try {
      const raw = sessionStorage.getItem(PC_CACHE_PREFIX + roomId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Caches PCs for a room into sessionStorage.
   * @param {number|string} roomId
   * @param {Array} pcs
   */
  function cacheRoomPCs(roomId, pcs) {
    if (!roomId || !Array.isArray(pcs)) return;
    try {
      sessionStorage.setItem(PC_CACHE_PREFIX + roomId, JSON.stringify(pcs));
    } catch (e) { }
  }

  /**
   * Invalidates cached PCs for a specific room or all rooms.
   * @param {number|string} [roomId]
   */
  function invalidateCachedRoomPCs(roomId) {
    try {
      if (roomId) {
        sessionStorage.removeItem(PC_CACHE_PREFIX + roomId);
      } else {
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith(PC_CACHE_PREFIX)) {
            sessionStorage.removeItem(key);
          }
        });
      }
    } catch (e) { }
  }

  /**
   * Fetches the list of PC units registered to a laboratory room.
   * @param {number|string} roomId
   * @returns {Promise<Array>}
   */
  async function fetchRoomPCs(roomId) {
    if (!roomId) return [];
    const response = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}/pcs`, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to load PCs: ${response.statusText}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      cacheRoomPCs(roomId, data);
    }
    return data;
  }

  /**
   * Submits a batch or single PC addition request with backward-compatible sequential fallback.
   * @param {number|string} roomId
   * @param {Array<string>} pcNumbers - Array of PC number strings to add
   * @returns {Promise<{message: string, addedCount: number}>}
   */
  async function submitAddPCs(roomId, pcNumbers) {
    if (!roomId) throw new Error('Room ID is required.');
    if (!Array.isArray(pcNumbers) || pcNumbers.length === 0) throw new Error('No PC numbers specified.');

    let response = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}/pcs/add-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ pcNumbers })
    });

    // Sequential fallback if /add-bulk returns 404 (e.g. legacy backend endpoint)
    if (response.status === 404) {
      let addedCount = 0;
      for (const pcNumber of pcNumbers) {
        try {
          const singleRes = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}/pcs/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ pcNumber })
          });
          if (singleRes.ok) addedCount++;
        } catch (e) { }
      }
      invalidateCachedRoomPCs(roomId);
      return { message: `Added ${addedCount} PC(s) successfully!`, addedCount };
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to add PCs');
    }

    invalidateCachedRoomPCs(roomId);
    const data = await response.json();
    return { message: data.message || `Added ${pcNumbers.length} PC(s) successfully!`, addedCount: pcNumbers.length };
  }

  /**
   * Prompts confirmation and sends deletion request for a PC unit.
   * @param {number|string} pcId
   * @param {Function} [onComplete] - Callback on successful deletion
   * @param {number|string} [roomId] - Optional room ID for targeted cache invalidation
   * @param {string|number} [pcNumber] - Optional PC number for clear confirmation display
   */
  async function deletePCUnit(pcId, onComplete, roomId, pcNumber) {
    const confirmFn = global.showConfirmModal || (typeof window !== 'undefined' ? window.showConfirmModal : null);
    let confirmed = false;

    const unitDisplay = pcNumber ? `PC ${pcNumber}` : 'this PC unit';

    if (typeof confirmFn === 'function') {
      confirmed = await confirmFn({
        title: `Delete ${unitDisplay}?`,
        message: `This action cannot be undone. Are you sure you want to permanently delete ${unitDisplay} from the room?`,
        confirmText: 'Delete PC',
        cancelText: 'Cancel',
        isDestructive: true
      });
    } else {
      confirmed = confirm(`Are you sure you want to delete ${unitDisplay}?`);
    }

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/pcs/${encodeURIComponent(pcId)}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to delete PC');

      invalidateCachedRoomPCs(roomId);

      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function') {
        toastFn('PC unit deleted successfully.', 'success');
      }

      if (typeof onComplete === 'function') {
        await onComplete();
      }
    } catch (error) {
      console.error('[PCActions] Error deleting PC:', error);
      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function') {
        toastFn('Failed to delete PC.', 'error');
      } else {
        alert('Failed to delete PC');
      }
    }
  }

  /**
   * Sends atomic bulk deletion request for multiple PC units.
   * @param {number|string} roomId
   * @param {Array<number|string>} pcIds
   * @param {Function} [onComplete]
   */
  async function deletePCsBulk(roomId, pcIds, onComplete) {
    if (!roomId) throw new Error('Room ID is required.');
    if (!Array.isArray(pcIds) || pcIds.length === 0) throw new Error('No PC IDs specified.');

    const cleanIds = pcIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
    if (cleanIds.length === 0) throw new Error('Invalid PC IDs specified.');

    try {
      let response = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}/pcs/bulk`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pcIds: cleanIds })
      });

      // Sequential fallback if 404
      if (response.status === 404) {
        let deleted = 0;
        for (const pid of cleanIds) {
          try {
            const singleRes = await fetch(`/api/pcs/${encodeURIComponent(pid)}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            if (singleRes.ok) deleted++;
          } catch (e) { }
        }
        invalidateCachedRoomPCs(roomId);
        const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
        if (typeof toastFn === 'function') {
          toastFn(`Deleted ${deleted} PC(s) successfully.`, 'success');
        }
        if (typeof onComplete === 'function') await onComplete();
        return { deletedCount: deleted };
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete PCs');
      }

      invalidateCachedRoomPCs(roomId);
      const resData = await response.json();
      const count = resData.deletedCount || cleanIds.length;

      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function') {
        toastFn(`Deleted ${count} PC unit(s) successfully.`, 'success');
      }

      if (typeof onComplete === 'function') {
        await onComplete();
      }

      return resData;
    } catch (error) {
      console.error('[PCActions] Error bulk deleting PCs:', error);
      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function') {
        toastFn(error.message || 'Failed to delete selected PCs.', 'error');
      } else {
        alert(error.message || 'Failed to delete selected PCs.');
      }
      throw error;
    }
  }

  const qrGeneratorActions = {
    fetchRoomPCs,
    submitAddPCs,
    deletePCUnit,
    deletePCsBulk,
    getCachedRoomPCs,
    cacheRoomPCs,
    invalidateCachedRoomPCs
  };

  global.qrGeneratorActions = qrGeneratorActions;

})(typeof window !== 'undefined' ? window : this);
