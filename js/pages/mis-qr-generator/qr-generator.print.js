/**
 * LabSync – MIS QR Sticker Print Module  |  js/pages/mis-qr-generator/qr-generator.print.js
 * Encapsulates single PC and batch room QR code printable sticker generation, DOM injection, and print media triggers.
 */

(function (global) {
  'use strict';

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
            <div class="qr-sticker">
              <img src="${data.qrCode}" alt="QR Code" />
              <h2 style="color: #0f172a !important; -webkit-text-fill-color: #0f172a !important; font-weight: 700;">Room ${data.roomNumber} - PC ${data.pcNumber}</h2>
              <p style="color: #475569 !important; -webkit-text-fill-color: #475569 !important; font-weight: 600;">Scan to report an issue</p>
            </div>
          </div>
        `;
      }

      setTimeout(() => {
        window.print();
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

      const stickersHtml = qrDataList.map(data => `
        <div class="qr-sticker">
          <img src="${data.qrCode}" alt="QR Code" />
          <h2 style="color: #0f172a !important; -webkit-text-fill-color: #0f172a !important; font-weight: 700;">Room ${data.roomNumber} - PC ${data.pcNumber}</h2>
          <p style="color: #475569 !important; -webkit-text-fill-color: #475569 !important; font-weight: 600;">Scan to report an issue</p>
        </div>
      `).join('');

      const printArea = document.getElementById('printArea');
      if (printArea) {
        printArea.innerHTML = `
          <div class="qr-print-grid">
            ${stickersHtml}
          </div>
        `;
      }

      setTimeout(() => {
        window.print();
        if (printArea) printArea.innerHTML = '';
      }, 100);
    } catch (error) {
      console.error('[QRPrint] Error generating all QRs:', error);
      alert('Failed to generate QR codes');
    }
  }

  const qrGeneratorPrint = {
    generateQR,
    generateAllQR
  };

  global.qrGeneratorPrint = qrGeneratorPrint;

})(typeof window !== 'undefined' ? window : this);
