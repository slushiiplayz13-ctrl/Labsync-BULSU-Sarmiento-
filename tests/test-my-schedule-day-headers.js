'use strict';

/**
 * tests/test-my-schedule-day-headers.js
 * Automated test suite verifying full day names in LabSync My Schedule day headers.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runDayHeaderTests() {
  console.log('================================================================');
  console.log('🧪 Starting LabSync My Schedule Full Day Headers QA Tests');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failedTests++;
    }
  }

  // ─── 1. Verify CSS Rules in schedule-cards.css ───
  console.log('\n--- 1. CSS Verification in schedule-cards.css ---');
  const cssPath = path.join(__dirname, '../css/components/schedule-cards.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert(cssContent.includes('.day-header'), 'CSS includes .day-header rule');
  assert(cssContent.includes('.day-header .day-name'), 'CSS includes .day-name container for day labels');
  assert(cssContent.includes('.day-header .day-name-full'), 'CSS includes .day-name-full rule');
  assert(cssContent.includes('.day-header .day-name-short'), 'CSS includes .day-name-short rule');
  assert(cssContent.includes('.day-header .today-tag'), 'CSS includes .today-tag rule');
  assert(cssContent.includes('.day-header.has-today'), 'CSS includes dedicated .day-header.has-today responsive styles');
  assert(cssContent.includes('container-type: inline-size'), 'CSS configures container queries on .day-column');
  assert(cssContent.includes('@container daycol (max-width: 155px)'), 'CSS includes container query for compact day columns');
  assert(cssContent.includes('@container daycol (max-width: 135px)'), 'CSS includes container query fallback for tight 130px columns');
  assert(cssContent.includes('clamp('), 'CSS uses fluid clamp scaling for typography and badges');
  assert(cssContent.includes('--schedule-cols'), 'CSS supports dynamic --schedule-cols variable for column count');
  assert(cssContent.includes('html.high-contrast .day-header'), 'CSS supports High-Contrast Mode for day-header');
  assert(cssContent.includes('html.high-contrast .day-column.highlight-day .day-header'), 'CSS supports High-Contrast Mode for today highlight header');
  assert(cssContent.includes('html.high-contrast .day-column.highlight-day .day-header .today-tag'), 'CSS supports High-Contrast Mode for today-tag badge');

  // ─── 2. Setup Sandbox & Load Components ───
  console.log('\n--- 2. Day Headers Rendering Verification ---');
  const sandbox = {
    console,
    Date,
    String,
    Boolean,
    Number,
    Array,
    Map,
    Object,
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelectorAll: () => []
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  const coreUtilsCode = fs.readFileSync(path.join(__dirname, '../js/utils/core-utils.js'), 'utf8');
  const colorsCode = fs.readFileSync(path.join(__dirname, '../js/faculty-schedule/faculty-schedule.colors.js'), 'utf8');
  const rendererCode = fs.readFileSync(path.join(__dirname, '../js/faculty-schedule/faculty-schedule.renderer.js'), 'utf8');

  vm.runInNewContext(coreUtilsCode, sandbox);
  vm.runInNewContext(colorsCode, sandbox);
  vm.runInNewContext(rendererCode, sandbox);

  const { renderFacultyScheduleLayout } = sandbox.facultyScheduleRenderer;
  const { buildSubjectColorMap } = sandbox.facultyScheduleColors;

  function makeSchedule(subjectName, day, startTime, endTime, room, section) {
    return {
      Schedule_ID: Math.floor(Math.random() * 10000),
      Subject_Name: subjectName,
      Day_of_Week: day || 'Monday',
      Start_Time: startTime || '08:00:00',
      End_Time: endTime || '10:00:00',
      Room_Number: room || '101',
      Section: section || 'BSIT 3-A'
    };
  }

  // Test Case A: Standard Week (Monday to Saturday)
  const schedsStd = [
    makeSchedule('IT 101 - Intro to Computing', 'Monday', '08:00:00', '10:00:00'),
    makeSchedule('IT 102 - Discrete Structures', 'Tuesday', '10:00:00', '12:00:00'),
    makeSchedule('IT 103 - OOP Java', 'Wednesday', '13:00:00', '15:00:00'),
    makeSchedule('IT 104 - Data Structures', 'Thursday', '09:00:00', '11:00:00'),
    makeSchedule('IT 105 - Database Systems', 'Friday', '14:00:00', '16:00:00'),
    makeSchedule('IT 106 - Capstone Project', 'Saturday', '08:00:00', '12:00:00')
  ];
  const mapStd = buildSubjectColorMap(schedsStd);
  const htmlStd = renderFacultyScheduleLayout(schedsStd, mapStd);

  // Check Full Day Names exist in markup
  assert(htmlStd.includes('<span class="day-name-full">Monday</span>'), 'Renders full day name "Monday"');
  assert(htmlStd.includes('<span class="day-name-full">Tuesday</span>'), 'Renders full day name "Tuesday"');
  assert(htmlStd.includes('<span class="day-name-full">Wednesday</span>'), 'Renders full day name "Wednesday"');
  assert(htmlStd.includes('<span class="day-name-full">Thursday</span>'), 'Renders full day name "Thursday"');
  assert(htmlStd.includes('<span class="day-name-full">Friday</span>'), 'Renders full day name "Friday"');
  assert(htmlStd.includes('<span class="day-name-full">Saturday</span>'), 'Renders full day name "Saturday"');

  // Check Responsive Short Day Names exist for compact viewports
  assert(htmlStd.includes('<span class="day-name-short">Mon</span>'), 'Includes responsive fallback "Mon"');
  assert(htmlStd.includes('<span class="day-name-short">Tue</span>'), 'Includes responsive fallback "Tue"');
  assert(htmlStd.includes('<span class="day-name-short">Wed</span>'), 'Includes responsive fallback "Wed"');
  assert(htmlStd.includes('<span class="day-name-short">Thu</span>'), 'Includes responsive fallback "Thu"');
  assert(htmlStd.includes('<span class="day-name-short">Fri</span>'), 'Includes responsive fallback "Fri"');
  assert(htmlStd.includes('<span class="day-name-short">Sat</span>'), 'Includes responsive fallback "Sat"');

  // Check has-today class presence
  assert(htmlStd.includes('has-today'), 'Renders .has-today class on the day header for today');

  // Check Column Structure and data-day attribute
  assert(htmlStd.includes('data-day="Monday"'), 'Includes data-day="Monday" attribute');
  assert(htmlStd.includes('data-day="Tuesday"'), 'Includes data-day="Tuesday" attribute');
  assert(htmlStd.includes('data-day="Wednesday"'), 'Includes data-day="Wednesday" attribute');
  assert(htmlStd.includes('data-day="Thursday"'), 'Includes data-day="Thursday" attribute');
  assert(htmlStd.includes('data-day="Friday"'), 'Includes data-day="Friday" attribute');
  assert(htmlStd.includes('data-day="Saturday"'), 'Includes data-day="Saturday" attribute');

  // Test Case B: Sunday accommodation
  const schedsSun = [
    makeSchedule('NSTP 101 - National Service', 'Sunday', '08:00:00', '11:00:00')
  ];
  const mapSun = buildSubjectColorMap(schedsSun);
  const htmlSun = renderFacultyScheduleLayout(schedsSun, mapSun);

  assert(htmlSun.includes('<span class="day-name-full">Sunday</span>'), 'Dynamically renders full day name "Sunday" when present');
  assert(htmlSun.includes('<span class="day-name-short">Sun</span>'), 'Includes responsive fallback "Sun"');
  assert(htmlSun.includes('--schedule-cols: 7'), 'Adjusts --schedule-cols to 7 when Sunday is present');

  // ─── 3. Schedule Preservation Verification ───
  console.log('\n--- 3. Schedule Time & Position Preservation ---');
  // Confirm classes preserve Start_Time, End_Time, Room, and Section without modification
  assert(htmlStd.includes('8:00 AM – 10:00 AM') || htmlStd.includes('08:00 AM – 10:00 AM'), 'Class time range preserved accurately');
  assert(htmlStd.includes('10:00 AM – 12:00 PM'), 'Class time range 10-12 preserved accurately');
  assert(htmlStd.includes('RM 101'), 'Room number preserved accurately');
  assert(htmlStd.includes('BSIT 3-A'), 'Section preserved accurately');
  assert(htmlStd.includes('IT 101 - Intro to Computing'), 'Subject title preserved accurately');

  // ─── 4. Schedule Studio DOM Extraction Verification ───
  console.log('\n--- 4. Schedule Studio DOM Extraction Compatibility ---');
  const studioCode = fs.readFileSync(path.join(__dirname, '../js/schedule-studio.js'), 'utf8');
  assert(studioCode.includes('day.includes(\'MON\')'), 'schedule-studio handles MON / Monday extraction');
  assert(studioCode.includes('day.includes(\'TUE\')'), 'schedule-studio handles TUE / Tuesday extraction');
  assert(studioCode.includes('day.includes(\'WED\')'), 'schedule-studio handles WED / Wednesday extraction');
  assert(studioCode.includes('day.includes(\'THU\')'), 'schedule-studio handles THU / Thursday extraction');
  assert(studioCode.includes('day.includes(\'FRI\')'), 'schedule-studio handles FRI / Friday extraction');
  assert(studioCode.includes('day.includes(\'SAT\')'), 'schedule-studio handles SAT / Saturday extraction');
  assert(studioCode.includes('day.includes(\'SUN\')'), 'schedule-studio handles SUN / Sunday extraction');
  assert(studioCode.includes('canvas-day-full'), 'schedule-studio canvas includes full day name span');

  console.log('\n================================================================');
  console.log(`🎉 Day Header Tests Complete: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runDayHeaderTests();
