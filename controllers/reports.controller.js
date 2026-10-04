'use strict';

/**
 * controllers/reports.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP Controller for Room Status Activity Log Reports.
 * 
 * Enforces:
 * - Proper parameter parsing and validation
 * - Audit trail logging of report generation
 * - PDF streaming with correct Content-Type and Content-Disposition headers
 * ─────────────────────────────────────────────────────────────────────────────
 */

const roomStatusReportService = require('../services/roomStatusReportService');
const auditService = require('../services/auditService');

/**
 * Generates and downloads the Room Status Activity Log PDF Report.
 * Restricted to Department Head role via middleware.
 * 
 * GET /api/reports/room-status
 * Query parameters:
 * - period: 'today' | 'yesterday' | 'both' | 'custom'
 * - startDate: 'YYYY-MM-DD' (required when period=custom)
 * - endDate: 'YYYY-MM-DD' (required when period=custom)
 * - roomNumber | room: 'all' | '203' | '204' (optional)
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function generateRoomStatusReport(req, res, next) {
    try {
        const period = req.query.period || (req.query.startDate && req.query.endDate ? 'custom' : 'today');
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const roomNumber = req.query.roomNumber || req.query.room || null;

        // Fetch activity data from real database records
        const reportData = await roomStatusReportService.getRoomStatusActivityReportData({
            period,
            startDate,
            endDate,
            roomNumber
        });

        // Determine generatedBy label from session or safe default
        const generatedBy = 'Department Head';

        // Generate the PDF binary buffer
        const pdfBuffer = await roomStatusReportService.buildRoomStatusReportPDF({
            records: reportData.records,
            periodLabel: reportData.periodLabel,
            roomFilterLabel: reportData.roomFilterLabel,
            generatedBy
        });

        // Non-blocking security audit logging for administrative accountability
        await auditService.logSecurityEvent({
            req,
            action: 'GENERATE_ROOM_STATUS_REPORT',
            resourceType: 'REPORT',
            resourceId: reportData.roomFilter || 'ALL',
            details: {
                period: reportData.periodType,
                periodLabel: reportData.periodLabel,
                startDate: reportData.startDateStr,
                endDate: reportData.endDateStr,
                roomFilter: reportData.roomFilterLabel,
                recordCount: reportData.records.length,
                filename: reportData.filename
            },
            result: 'SUCCESS'
        });

        // Send PDF download headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${reportData.filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        return res.status(200).send(pdfBuffer);
    } catch (err) {
        if (err.statusCode === 400 || err.status === 400) {
            return res.status(400).json({
                error: err.message,
                code: 'INVALID_REPORT_PARAMS'
            });
        }
        return next(err);
    }
}

module.exports = {
    generateRoomStatusReport
};
