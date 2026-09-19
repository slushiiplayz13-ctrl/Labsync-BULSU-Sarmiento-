/**
 * LabSync – MIS QR Sticker Print Module  |  js/pages/mis-qr-generator/qr-generator.print.js
 * Encapsulates single PC and batch room QR code printable sticker generation, DOM injection, and print media triggers.
 */

(function (global) {
  'use strict';

  /**
   * Helper to build horizontal PC QR sticker HTML that consumes available space at larger font size.
   * @param {Object} data - QR code data object
   * @returns {string}
   */
  function buildStickerHtml(data) {
    const rawRoom = String(data.roomNumber || '').trim();
    const roomStr = rawRoom.toLowerCase().startsWith('room') ? rawRoom : `Room ${rawRoom}`;
    const pcStr = `PC ${data.pcNumber}`;
    const fullTitle = `${roomStr} - ${pcStr}`;

    // Balanced font scaling: standard units (<= 15 chars like Room 204 - PC 1) use full 18px CSS font
    let inlineStyle = '';
    if (fullTitle.length > 22) {
      inlineStyle = 'style="font-size: 13.5px !important;"';
    } else if (fullTitle.length > 18) {
      inlineStyle = 'style="font-size: 15px !important;"';
    } else if (fullTitle.length > 15) {
      // 16-18 chars (e.g. Room 304 - PC 10) scales to 16.5px for balanced spacing
      inlineStyle = 'style="font-size: 16.5px !important;"';
    }

    return `
      <div class="qr-sticker">
        <div class="qr-sticker-left">
          <img src="${data.qrCode}" alt="QR Code" />
        </div>
        <div class="qr-sticker-right">
          <h2 ${inlineStyle}>${roomStr} - <span class="qr-pc-badge" style="white-space: nowrap;">${pcStr}</span></h2>
          <p>Scan to report an issue</p>
        </div>
      </div>
    `;
  }

  /**
   * Generates single QR code printable sticker and triggers print.
   * @param {number|string} pcId
   */
  let isPrinting = false;

  function clearCardFocus() {
    if (typeof document === 'undefined') return;
    try {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      document.querySelectorAll('.pc-qr-card, .pc-qr-btn, .delete-pc-btn, .card-action-delete, .btn-delete').forEach(el => {
        if (typeof el.blur === 'function') el.blur();
      });
    } catch (e) {}
  }

  function scheduleClearCardFocus() {
    clearCardFocus();
    if (typeof window !== 'undefined') {
      [20, 60, 150, 300, 500].forEach(delay => {
        setTimeout(clearCardFocus, delay);
      });
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(clearCardFocus);
      }
    }
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('afterprint', () => {
      isPrinting = false;
      scheduleClearCardFocus();
    });

    window.addEventListener('focus', () => {
      if (isPrinting) {
        isPrinting = false;
        scheduleClearCardFocus();
      }
    });
  }

  /**
   * Generates single QR code printable sticker and triggers print.
   * @param {number|string} pcId
   */
  async function generateQR(pcId) {
    try {
      const response = await fetch(`/api/pcs/${encodeURIComponent(pcId)}/qrcode`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to generate QR');

      const data = await response.json();

      const printArea = document.getElementById('printArea');
      if (printArea) {
        printArea.innerHTML = `
          <div class="qr-print-grid">
            ${buildStickerHtml(data)}
          </div>
        `;
      }

      setTimeout(() => {
        clearCardFocus();
        isPrinting = true;
        window.print();
        isPrinting = false;
        scheduleClearCardFocus();
        if (printArea) printArea.innerHTML = '';
      }, 100);
    } catch (error) {
      console.error('[QRPrint] Error generating QR:', error);
      alert('Failed to generate QR code');
    }
  }

  /**
   * Generates batch QR code printable stickers for all PCs in the room and triggers print.
   * @param {number|string} roomId
   * @param {Array} [currentPCsList]
   */
  async function generateAllQR(roomId, currentPCsList) {
    if (!roomId) {
      alert('No room selected.');
      return;
    }

    if (Array.isArray(currentPCsList) && currentPCsList.length === 0) {
      alert('No PCs in this room yet.');
      return;
    }

    try {
      const response = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}/pcs/qrcodes`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to generate batch QR codes');
      const qrDataList = await response.json();

      if (!Array.isArray(qrDataList) || qrDataList.length === 0) {
        alert('No PCs in this room yet.');
        return;
      }

      const stickersHtml = qrDataList.map(data => buildStickerHtml(data)).join('');

      const printArea = document.getElementById('printArea');
      if (printArea) {
        printArea.innerHTML = `
          <div class="qr-print-grid">
            ${stickersHtml}
          </div>
        `;
      }

      setTimeout(() => {
        clearCardFocus();
        isPrinting = true;
        window.print();
        isPrinting = false;
        scheduleClearCardFocus();
        if (printArea) printArea.innerHTML = '';
      }, 100);
    } catch (error) {
      console.error('[QRPrint] Error generating all QRs:', error);
      alert('Failed to generate QR codes');
    }
  }

  /**
   * Generates batch QR printable stickers for only the selected PCs in the room and triggers print.
   * @param {number|string} roomId
   * @param {Set|Array} selectedPcIds
   * @param {Array} [currentPCsList]
   */
  async function generateSelectedQR(roomId, selectedPcIds, currentPCsList) {
    if (!roomId) {
      alert('No room selected.');
      return;
    }

    const selectedSet = new Set(Array.from(selectedPcIds || []).map(id => String(id)));
    if (selectedSet.size === 0) {
      alert('No PCs selected to print.');
      return;
    }

    try {
      const response = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}/pcs/qrcodes`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to generate batch QR codes');
      const qrDataList = await response.json();

      if (!Array.isArray(qrDataList) || qrDataList.length === 0) {
        alert('No PCs in this room yet.');
        return;
      }

      const filteredList = qrDataList.filter(item => selectedSet.has(String(item.pcId)));
      if (filteredList.length === 0) {
        alert('None of the selected PCs could be found for printing.');
        return;
      }

      const stickersHtml = filteredList.map(data => buildStickerHtml(data)).join('');

      const printArea = document.getElementById('printArea');
      if (printArea) {
        printArea.innerHTML = `
          <div class="qr-print-grid">
            ${stickersHtml}
          </div>
        `;
      }

      setTimeout(() => {
        clearCardFocus();
        isPrinting = true;
        window.print();
        isPrinting = false;
        scheduleClearCardFocus();
        if (printArea) printArea.innerHTML = '';
      }, 100);
    } catch (error) {
      console.error('[QRPrint] Error generating selected QRs:', error);
      alert('Failed to generate QR codes for selected PCs');
    }
  }

  const qrGeneratorPrint = {
    generateQR,
    generateAllQR,
    generateSelectedQR,
    clearCardFocus,
    scheduleClearCardFocus
  };

  global.qrGeneratorPrint = qrGeneratorPrint;

})(typeof window !== 'undefined' ? window : this);
