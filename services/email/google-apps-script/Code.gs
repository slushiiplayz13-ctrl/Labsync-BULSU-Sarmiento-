/**
 * Google Apps Script Web App — LabSync Email Relay
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives HTTPS POST requests from LabSync (deployed on Railway) and
 * dispatches transactional emails via Gmail MailApp without requiring
 * a custom domain or paid email provider.
 *
 * Setup Instructions:
 * 1. Open Google Apps Script: https://script.google.com
 * 2. Create a new project named "LabSync Email Relay".
 * 3. Paste this entire code into Code.gs.
 * 4. Configure Script Properties:
 *    - Project Settings (gear icon) -> Script Properties -> Add script property
 *    - Property: EMAIL_WEBHOOK_SECRET
 *    - Value: <choose-a-strong-random-secret>
 * 5. Deploy as Web App:
 *    - Click "Deploy" -> "New deployment"
 *    - Select type: "Web app"
 *    - Description: "LabSync Transactional Email Relay v1.0"
 *    - Execute as: "Me (<your-email>@gmail.com)"
 *    - Who has access: "Anyone" (access is authenticated via EMAIL_WEBHOOK_SECRET)
 *    - Authorize required permissions for Gmail (MailApp)
 * 6. Copy the Web App URL (ends with /exec) and configure in Railway:
 *    - EMAIL_WEBHOOK_URL = https://script.google.com/macros/s/.../exec
 *    - EMAIL_WEBHOOK_SECRET = <same-secret-as-configured-above>
 */

/**
 * Handles incoming HTTPS POST requests.
 *
 * @param {object} e - Event object provided by Google Apps Script
 * @returns {TextOutput} JSON response
 */
function doPost(e) {
  try {
    // 1. Validate request payload existence
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        success: false,
        error: 'Empty request body received',
        statusCode: 400
      });
    }

    // 2. Parse JSON payload
    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({
        success: false,
        error: 'Malformed JSON payload',
        statusCode: 400
      });
    }

    // 3. Retrieve expected secret from Script Properties
    const scriptProperties = PropertiesService.getScriptProperties();
    const expectedSecret = scriptProperties.getProperty('EMAIL_WEBHOOK_SECRET');

    if (!expectedSecret) {
      return createJsonResponse({
        success: false,
        error: 'EMAIL_WEBHOOK_SECRET is not configured in Apps Script properties',
        statusCode: 500
      });
    }

    // 4. Validate shared secret
    // Checks X-LabSync-Webhook-Secret header (if forwarded by proxy) or payload.secret (standard Apps Script body)
    const headerSecret = (e && e.headers && (e.headers['X-LabSync-Webhook-Secret'] || e.headers['x-labsync-webhook-secret']));
    const bodySecret = payload && (payload.secret || payload.webhookSecret || payload['X-LabSync-Webhook-Secret']);
    const clientSecret = headerSecret || bodySecret;

    if (!clientSecret || clientSecret !== expectedSecret) {
      return createJsonResponse({
        success: false,
        error: 'Unauthorized: Invalid or missing webhook secret',
        statusCode: 401
      });
    }

    // 5. Validate required email fields
    const to = payload.to;
    const subject = payload.subject;
    const htmlBody = payload.html || payload.htmlBody;

    if (!to) {
      return createJsonResponse({
        success: false,
        error: 'Missing required field: "to"',
        statusCode: 400
      });
    }

    if (!subject) {
      return createJsonResponse({
        success: false,
        error: 'Missing required field: "subject"',
        statusCode: 400
      });
    }

    if (!htmlBody) {
      return createJsonResponse({
        success: false,
        error: 'Missing required field: "html"',
        statusCode: 400
      });
    }

    // 6. Normalize recipient address (string or array)
    const toAddress = Array.isArray(to) ? to.join(',') : String(to).trim();

    // 7. Prepare MailApp send options
    const emailOptions = {
      to: toAddress,
      subject: String(subject),
      htmlBody: String(htmlBody),
      name: 'LabSync',
      body: payload.text || stripHtmlToPlainText(htmlBody) || 'Please view this email in an HTML-compatible email reader.'
    };

    if (payload.replyTo || payload.reply_to) {
      emailOptions.replyTo = String(payload.replyTo || payload.reply_to).trim();
    }

    // 8. Dispatch email via Gmail MailApp
    MailApp.sendEmail(emailOptions);

    // 9. Generate tracking ID and return success
    const dispatchId = 'gas_' + new Date().getTime() + '_' + Math.random().toString(36).substring(2, 8);

    return createJsonResponse({
      success: true,
      messageId: dispatchId,
      id: dispatchId,
      to: toAddress,
      subject: String(subject),
      dispatchedAt: new Date().toISOString()
    });

  } catch (err) {
    // Return sanitized error message without leaking sensitive internal details
    return createJsonResponse({
      success: false,
      error: err.message || 'Unexpected server error during email dispatch',
      statusCode: 500
    });
  }
}

/**
 * Handles HTTP GET requests with a status health-check message.
 */
function doGet(e) {
  return createJsonResponse({
    status: 'online',
    service: 'LabSync Google Apps Script Email Relay',
    method: 'POST expected'
  });
}

/**
 * Creates a JSON TextOutput response with ContentService.
 *
 * @param {object} data
 * @returns {TextOutput}
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Basic HTML-to-plaintext fallback stripper for email body.
 *
 * @param {string} html
 * @returns {string}
 */
function stripHtmlToPlainText(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
