/* ================================================================
   LabSync – Faculty Utilities  |  js/utils/faculty-utils.js
   Pure helpers for faculty initials, email validation, role logic, and sorting.
   ================================================================ */

'use strict';

(function (global) {
  const facultyUtils = {
    /**
     * Extracts 2-letter uppercase initials from a person's name.
     * @param {string} name
     * @returns {string}
     */
    getFacultyInitials(name) {
      if (!name || typeof name !== 'string') return 'U';
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },

    /**
     * Checks if a role string denotes Department Head / Leadership.
     * @param {string} role
     * @returns {boolean}
     */
    isFacultyHead(role) {
      return Boolean(role && String(role).toLowerCase().includes('head'));
    },

    /**
     * Normalizes a role string for filtering.
     * @param {string} role
     * @returns {string}
     */
    normalizeFacultyRole(role) {
      if (!role) return 'faculty';
      const r = String(role).toLowerCase();
      if (r.includes('head')) return 'head';
      if (r.includes('mis')) return 'mis';
      return 'faculty';
    },

    /**
     * Comprehensive email validation matching strict institutional & TLD rules.
     * @param {string} email
     * @returns {boolean}
     */
    validateFacultyEmail(email) {
      if (!email || typeof email !== 'string') return false;
      const cleanEmail = email.trim().toLowerCase();
      const basicRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
      if (!basicRegex.test(cleanEmail)) return false;
      if (cleanEmail.includes('..') || cleanEmail.includes('@.') || cleanEmail.includes('.@')) return false;

      const parts = cleanEmail.split('@');
      if (parts.length !== 2) return false;
      const domainParts = parts[1].split('.');
      if (domainParts.length < 2) return false;

      const fullTld = domainParts.slice(1).join('.');
      const mainTld = domainParts[domainParts.length - 1];

      const validTLDs = new Set([
        'com', 'org', 'net', 'edu', 'gov', 'mil', 'io', 'co', 'info', 'biz', 'me', 'tv', 'xyz', 'online', 'site', 'store', 'tech', 'app', 'dev',
        'ph', 'edu.ph', 'com.ph', 'gov.ph', 'org.ph', 'net.ph',
        'us', 'uk', 'ca', 'au', 'jp', 'cn', 'in', 'de', 'fr', 'br', 'ru', 'sg', 'my'
      ]);

      return validTLDs.has(fullTld) || validTLDs.has(mainTld);
    },

    /**
     * Sorts faculty roster placing IT Head first, then alphabetical by name.
     * @param {Array} facultyList
     * @returns {Array}
     */
    sortFaculty(facultyList) {
      if (!Array.isArray(facultyList)) return [];
      return [...facultyList].sort((a, b) => {
        const aIsBoss = facultyUtils.isFacultyHead(a.Role);
        const bIsBoss = facultyUtils.isFacultyHead(b.Role);
        if (aIsBoss && !bIsBoss) return -1;
        if (!aIsBoss && bIsBoss) return 1;
        return (a.Name || '').localeCompare(b.Name || '');
      });
    },

    /**
     * Generates a lowercase searchable string from faculty member attributes.
     * @param {Object} member
     * @returns {string}
     */
    buildFacultySearchString(member) {
      if (!member) return '';
      return `${member.Name || ''} ${member.Email || ''} ${member.Role || ''} ${member.Phone || ''}`.toLowerCase();
    },

    /**
     * Checks if a member matches the current role filter.
     * @param {string} memberRole
     * @param {string} activeFilter
     * @returns {boolean}
     */
    matchesRoleFilter(memberRole, activeFilter) {
      if (!activeFilter || activeFilter === 'all') return true;
      const r = String(memberRole || '').toLowerCase();
      if (activeFilter === 'head') return r.includes('head');
      if (activeFilter === 'faculty') return r === 'faculty' || (!r.includes('head') && !r.includes('mis'));
      if (activeFilter === 'mis') return r.includes('mis');
      return false;
    }
  };

  // Expose globally
  global.facultyUtils = facultyUtils;
})(typeof window !== 'undefined' ? window : this);
