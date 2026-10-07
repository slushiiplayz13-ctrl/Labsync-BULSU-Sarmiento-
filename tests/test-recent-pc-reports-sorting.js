'use strict';

/**
 * tests/test-recent-pc-reports-sorting.js
 * Automated verification for chronological sorting of Recent PC Reports on MIS Staff Dashboard and backend.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const maintenanceRepo = require('../repositories/maintenance.repository');

test('Recent PC Reports Chronological Sorting Suite', async (t) => {
    await t.test('1. Backend findAllMaintenanceIssues orders issues by latest report date descending', async () => {
        const [reports] = await maintenanceRepo.findAllMaintenanceIssues();
        assert.ok(Array.isArray(reports), 'Must return an array of reports');
        assert.ok(reports.length > 0, 'Must have reports in the database');

        // Verify that every element has Date_Reported <= previous element
        for (let i = 1; i < reports.length; i++) {
            const prev = reports[i - 1];
            const curr = reports[i];
            const prevTime = new Date(prev.Date_Reported || prev.Created_At || 0).getTime();
            const currTime = new Date(curr.Date_Reported || curr.Created_At || 0).getTime();
            assert.ok(
                prevTime >= currTime,
                `Report at index ${i - 1} (${prev.Report_ID}, ${prev.Date_Reported}) must be >= index ${i} (${curr.Report_ID}, ${curr.Date_Reported})`
            );
        }
    });

    await t.test('2. Frontend staffDashboardReports.renderDashboardTable renders reports sorted by most recent date first', () => {
        const reportsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'mis-staff-dashboard', 'staff-dashboard.reports.js'), 'utf8');

        // Setup DOM / Sandbox
        let renderedHtml = '';
        const mockTbody = {
            dataset: {},
            set innerHTML(val) {
                renderedHtml = val;
            },
            get innerHTML() {
                return renderedHtml;
            }
        };

        const sandbox = {
            console,
            Date,
            String,
            Number,
            Boolean,
            Array,
            document: {
                getElementById: (id) => {
                    if (id === 'misDashboardReportRows') return mockTbody;
                    if (id === 'dashboardSearchInput') return null;
                    return null;
                }
            },
            encodeURIComponent,
            escapeHtml: (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '')
        };
        sandbox.window = sandbox;
        sandbox.global = sandbox;

        vm.runInNewContext(reportsJs, sandbox);

        const renderTable = sandbox.staffDashboardReports.renderDashboardTable;
        assert.strictEqual(typeof renderTable, 'function', 'renderDashboardTable must be exported');

        // Provide an out-of-order array: an older ticket created earlier has a new report on Oct 6
        const testData = [
            {
                Report_ID: 155,
                Date_Reported: '2026-10-06T06:14:52.000Z', // Oct 6, 02:14 PM
                Room_Number: '203',
                PC_Number: 1,
                Status: 'Pending',
                Issue_Description: 'PC/Laptop'
            },
            {
                Report_ID: 51,
                Date_Reported: '2026-10-01T13:21:32.000Z', // Oct 1, 09:21 PM
                Room_Number: '305',
                PC_Number: 9,
                Status: 'Pending',
                Issue_Description: 'Mouse'
            },
            {
                Report_ID: 47,
                Date_Reported: '2026-10-06T03:00:13.000Z', // Oct 6, 11:00 AM (newer than Oct 1)
                Room_Number: '203',
                PC_Number: 1,
                Status: 'Pending',
                Issue_Description: 'Keyboard'
            }
        ];

        renderTable(testData, mockTbody);

        // Find the order of rendered ticket rows
        const matches = [...renderedHtml.matchAll(/data-ticket="(\d+)"/g)].map(m => Number(m[1]));
        assert.deepStrictEqual(
            matches,
            [155, 47, 51],
            'Rendered rows must be ordered chronologically: Ticket 155 (Oct 6 2PM), Ticket 47 (Oct 6 11AM), Ticket 51 (Oct 1)'
        );
    });
});
