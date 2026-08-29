'use strict';

const dotenv = require('dotenv');

dotenv.config();

// ─── Public CDN Hosted Brand Logos (Zero Attachments) ─────────────────────────
// Hosted via high-availability jsDelivr CDN so Gmail, Apple Mail, and Outlook
// render crisp visual logos instantly without flagging them as file attachments.
const PUBLIC_LOGO_URL = process.env.LOGO_URL || 'https://cdn.jsdelivr.net/gh/slushiiplayz13-ctrl/Labsync-BULSU-Sarmiento-@main/assets/labsync-logo.png';
const PUBLIC_LOGO_DARK_URL = process.env.LOGO_DARK_URL || 'https://cdn.jsdelivr.net/gh/slushiiplayz13-ctrl/Labsync-BULSU-Sarmiento-@main/assets/labsync-logo%20-%20dark%20mode.png';

/**
 * Wraps email content in a fluid, email-client safe, responsive shell with full
 * dark mode & light mode support and zero-attachment dual-logo switching.
 *
 * @param {string} bodyHtml
 * @returns {string} Complete HTML Document
 */
function wrapEmailHtml(bodyHtml) {
    const logoMarkup = `
      <!-- Light Mode Logo (Default) -->
      <div class="light-img" style="display: block;">
        <img src="${PUBLIC_LOGO_URL}" alt="LabSync" width="220" height="56" border="0" style="height: 56px; max-height: 56px; width: auto; max-width: 230px; display: block; margin: 0 auto; object-fit: contain; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 26px; font-weight: 800; color: #0F172A; text-align: center; border: 0; outline: none; text-decoration: none;">
      </div>
      <!-- Dark Mode Logo (Adaptive) -->
      <!--[if !mso]><!-->
      <div class="dark-img" style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 0; line-height: 0;">
        <img src="${PUBLIC_LOGO_DARK_URL}" alt="LabSync" width="220" height="56" border="0" style="height: 56px; max-height: 56px; width: auto; max-width: 230px; display: block; margin: 0 auto; object-fit: contain; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 26px; font-weight: 800; color: #F8FAFC; text-align: center; border: 0; outline: none; text-decoration: none;">
      </div>
      <!--<![endif]-->
    `;

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>LabSync</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; background-color: #F8FAFC; }
    
    .dark-img { display: none !important; max-height: 0px !important; overflow: hidden !important; mso-hide: all !important; font-size: 0 !important; line-height: 0 !important; }
    .light-img { display: block !important; }

    /* Dark Mode Adaptive Queries (Apple Mail, iOS Mail, Gmail Web/App where supported) */
    @media (prefers-color-scheme: dark) {
      body, .email-bg { background-color: #0B0F19 !important; }
      .email-container { background-color: #1E293B !important; border-color: #334155 !important; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4) !important; }
      .header-bg { background: linear-gradient(180deg, #0F172A 0%, #1E293B 100%) !important; border-bottom-color: #334155 !important; }
      .dark-img { display: block !important; max-height: none !important; overflow: visible !important; font-size: inherit !important; line-height: inherit !important; }
      .light-img { display: none !important; }
      .text-title { color: #F8FAFC !important; }
      .text-body { color: #CBD5E1 !important; }
      .text-secondary { color: #94A3B8 !important; }
      .box-credential { background-color: #0F172A !important; border-color: #334155 !important; }
      .field-label { color: #94A3B8 !important; }
      .field-value { background-color: #1E293B !important; border-color: #475569 !important; color: #F8FAFC !important; }
      .campus-badge { background-color: #334155 !important; color: #E2E8F0 !important; }
      .footer-bg { background-color: #0F172A !important; border-top-color: #334155 !important; }
      .footer-text { color: #94A3B8 !important; }
      .footer-subtext { color: #64748B !important; }
      .warning-box { background-color: #261A0C !important; border-color: #92400E !important; color: #FDE68A !important; }
      .warning-title { color: #FBBF24 !important; }
      .fallback-box { background-color: #0F172A !important; border-color: #334155 !important; color: #94A3B8 !important; }
      .fallback-label { color: #CBD5E1 !important; }
      .divider-line { border-top-color: #334155 !important; }
    }

    /* Outlook.com & Windows App Dark Mode Target Selectors */
    [data-ogsc] body, [data-ogsc] .email-bg { background-color: #0B0F19 !important; }
    [data-ogsc] .email-container { background-color: #1E293B !important; border-color: #334155 !important; }
    [data-ogsc] .header-bg { background: #1E293B !important; border-bottom-color: #334155 !important; }
    [data-ogsc] .dark-img { display: block !important; max-height: none !important; overflow: visible !important; }
    [data-ogsc] .light-img { display: none !important; }
    [data-ogsc] .text-title { color: #F8FAFC !important; }
    [data-ogsc] .text-body { color: #CBD5E1 !important; }
    [data-ogsc] .text-secondary { color: #94A3B8 !important; }
    [data-ogsc] .box-credential { background-color: #0F172A !important; border-color: #334155 !important; }
    [data-ogsc] .field-label { color: #94A3B8 !important; }
    [data-ogsc] .field-value { background-color: #1E293B !important; border-color: #475569 !important; color: #F8FAFC !important; }
    [data-ogsc] .campus-badge { background-color: #334155 !important; color: #E2E8F0 !important; }
    [data-ogsc] .footer-bg { background-color: #0F172A !important; border-top-color: #334155 !important; }
    [data-ogsc] .warning-box { background-color: #261A0C !important; border-color: #92400E !important; color: #FDE68A !important; }
    [data-ogsc] .warning-title { color: #FBBF24 !important; }
    [data-ogsc] .fallback-box { background-color: #0F172A !important; border-color: #334155 !important; }
    [data-ogsc] .divider-line { border-top-color: #334155 !important; }

    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 16px !important; }
      .content-padding { padding: 28px 20px !important; }
      .header-padding { padding: 30px 20px 22px 20px !important; }
      .mobile-stack { width: 100% !important; display: block !important; }
      .cta-button { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; padding: 15px 20px !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';">
  <!-- Outer Centering Table -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-bg" style="background-color: #F8FAFC; table-layout: fixed;">
    <tr>
      <td align="center" style="padding: 40px 16px 50px 16px;">
        
        <!-- Main Card Shell (max-width: 580px) -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 580px; width: 100%; margin: 0 auto; background-color: #FFFFFF; border-radius: 20px; border: 1px solid #E2E8F0; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04); overflow: hidden;">
          
          <!-- Header Section (Adaptive Logo + Campus Tag) -->
          <tr>
            <td align="center" class="header-padding header-bg" style="padding: 34px 40px 24px 40px; background: linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%); border-bottom: 1px solid #F1F5F9; text-align: center;">
              
              <!-- Adaptive LabSync Brand Logo -->
              <div style="margin-bottom: 12px;">
                ${logoMarkup}
              </div>

              <!-- Campus Sub-Tag Badge -->
              <div class="campus-badge" style="display: inline-block; background-color: #EDF2F7; border-radius: 99px; padding: 5px 14px; font-size: 11px; font-weight: 700; color: #64748B; letter-spacing: 0.6px; text-transform: uppercase;">
                BulSU • Sarmiento Campus
              </div>

            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td class="content-padding text-body" style="padding: 36px 40px 40px 40px; color: #334155; font-size: 15px; line-height: 1.6;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td class="footer-bg" style="padding: 24px 40px; background-color: #F8FAFC; border-top: 1px solid #F1F5F9; text-align: center; font-size: 12px; line-height: 1.5;">
              <p class="footer-text" style="margin: 0 0 4px 0; color: #64748B; font-weight: 600;">Bulacan State University — Sarmiento Campus</p>
              <p class="footer-subtext" style="margin: 0; color: #94A3B8;">© 2026 LabSync • Smart Laboratory & Scheduling Management</p>
            </td>
          </tr>

        </table>
        <!-- End Main Card Shell -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Standard action-button CTA with generous padding, bold typography, and mobile fluid capability */
function ctaButton(label, href) {
    return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0 28px 0;">
            <tr>
                <td align="center">
                    <a href="${href}" class="cta-button"
                       style="background: linear-gradient(135deg, #1EBBD7 0%, #0EA5E9 100%); color: #FFFFFF; text-decoration: none;
                              padding: 15px 32px; font-size: 15px; font-weight: 700; border-radius: 12px;
                              display: inline-block; box-shadow: 0 6px 20px rgba(30, 187, 215, 0.35); letter-spacing: 0.2px;">
                        ${label}
                    </a>
                </td>
            </tr>
        </table>`;
}

/** Modern rounded warning callout with soft amber background and clear contrast */
function warningBox(titleText, bodyText) {
    return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
            <tr>
                <td class="warning-box" style="background-color: #FFFBEB; border: 1.5px solid #FDE68A; border-left: 5px solid #F59E0B; padding: 16px 18px; border-radius: 12px; font-size: 13.5px; color: #92400E; line-height: 1.55;">
                    <strong class="warning-title" style="color: #78350F; font-size: 14px; display: block; margin-bottom: 4px;">${titleText}</strong>
                    ${bodyText}
                </td>
            </tr>
        </table>`;
}

/** Fallback plain-text link box shown below buttons */
function fallbackLinkBox(href) {
    return `
        <div class="fallback-box" style="font-size: 12px; color: #94A3B8; word-break: break-all; background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 14px; border-radius: 10px; line-height: 1.5; margin-top: 10px;">
            <span class="fallback-label" style="color: #64748B; font-weight: 600;">If the button above does not open, copy and paste this link in your browser:</span><br>
            <a href="${href}" style="color: #0284C7; text-decoration: underline; word-break: break-all; font-weight: 500;">${href}</a>
        </div>`;
}

module.exports = {
    PUBLIC_LOGO_URL,
    PUBLIC_LOGO_DARK_URL,
    wrapEmailHtml,
    ctaButton,
    warningBox,
    fallbackLinkBox
};
