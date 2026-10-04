'use strict';

/**
 * tests/test-room-status-report-ui.js
 * Verification of frontend UI markup, responsive styles, accessibility, and client-side logic
 * for Room Status Activity Log PDF Report.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Room Status Activity Log Report UI Verification', async (t) => {
    const htmlPath = path.join(__dirname, '../it-head-room-status.html');
    const jsPath = path.join(__dirname, '../js/pages/it-head-room-status.js');
    const cssPath = path.join(__dirname, '../css/components/modals.css');

    const html = fs.readFileSync(htmlPath, 'utf8');
    const js = fs.readFileSync(jsPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    await t.test('1. Single Consolidated Trigger Button Exists with Proper Icon and Semantics', () => {
        assert.ok(html.includes('id="btnOpenReportModal"'), 'Activity card trigger #btnOpenReportModal must exist');
        assert.ok(html.includes('data-lucide="file-text"'), 'Trigger must have file-text icon');
        assert.ok(html.includes('Generate PDF Report'), 'Trigger must have "Generate PDF Report" label');
        assert.ok(!html.includes('id="btnActivityCardReport"'), 'Redundant secondary button #btnActivityCardReport must be removed');
        assert.ok(!html.includes('greeting-actions'), 'Redundant button in greeting row must be removed');
    });

    await t.test('2. Report Modal Dialog Structure and Elements', () => {
        assert.ok(html.includes('id="roomStatusReportModal"'), '#roomStatusReportModal must exist');
        assert.ok(html.includes('id="closeReportModalBtn"'), '#closeReportModalBtn must exist');
        assert.ok(html.includes('id="cancelReportModalBtn"'), '#cancelReportModalBtn must exist');
        assert.ok(html.includes('id="btnSubmitGenerateReport"'), '#btnSubmitGenerateReport must exist');
        assert.ok(html.includes('id="btnSubmitReportText"'), '#btnSubmitReportText must exist');

        // Presets: Today, Yesterday, Today + Yesterday, Custom Date Range
        assert.ok(html.includes('value="today"'), 'Preset "today" must exist');
        assert.ok(html.includes('value="yesterday"'), 'Preset "yesterday" must exist');
        assert.ok(html.includes('value="both"'), 'Preset "both" must exist');
        assert.ok(html.includes('value="custom"'), 'Preset "custom" must exist');

        // Custom Date Range Inputs
        assert.ok(html.includes('id="customDateRangeContainer"'), '#customDateRangeContainer must exist');
        assert.ok(html.includes('id="reportStartDate"'), '#reportStartDate input must exist');
        assert.ok(html.includes('id="reportEndDate"'), '#reportEndDate input must exist');

        // Room Filter
        assert.ok(html.includes('id="reportRoomFilter"'), '#reportRoomFilter dropdown must exist');
        assert.ok(html.includes('value="all"'), 'Option "all" must exist');
        assert.ok(html.includes('value="203"'), 'Option "203" must exist');
        assert.ok(html.includes('value="204"'), 'Option "204" must exist');

        // Included Period Summary Display
        assert.ok(html.includes('id="reportPeriodSummaryText"'), '#reportPeriodSummaryText must exist');
    });

    await t.test('3. Responsive CSS in modals.css', () => {
        assert.ok(css.includes('#roomStatusReportModal'), '#roomStatusReportModal must be registered in modals.css');
        assert.ok(css.includes('.period-options-grid'), '.period-options-grid must be styled in modals.css');
        assert.ok(css.includes('.period-radio-card'), '.period-radio-card must be styled in modals.css');
        assert.ok(css.includes('.btn-generate-report'), '.btn-generate-report must be styled in modals.css');
        assert.ok(css.includes('html.dark-mode #roomStatusReportModal'), 'Dark mode styles must exist for report modal');
    });

    await t.test('4. Frontend Page Controller Logic in it-head-room-status.js', () => {
        assert.ok(js.includes('initRoomStatusReportModal'), 'initRoomStatusReportModal function must be present');
        assert.ok(js.includes('initRoomStatusReportModal()'), 'initRoomStatusReportModal must be called during initialization');
        assert.ok(js.includes('/api/reports/room-status'), 'Must make API requests to /api/reports/room-status');
        assert.ok(js.includes('window.URL.createObjectURL'), 'Must trigger client-side download using object URL');
        assert.ok(js.includes('Generating PDF...'), 'Must set loading state while PDF generates');
    });
});
