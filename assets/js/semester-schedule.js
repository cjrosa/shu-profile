(function () {
  'use strict';

  const SEMESTERS = {
    FA25: { label: 'Fall 2025', start: '2025-08-25', end: '2025-12-13' },
    SP26: { label: 'Spring 2026', start: '2026-01-20', end: '2026-05-04' },
    FA26: { label: 'Fall 2026', start: '2026-08-31', end: '2026-12-12' }
  };

  function easternDate() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + '-' + values.month + '-' + values.day;
  }

  function statusFor(code, today) {
    const semester = SEMESTERS[code];
    if (!semester) return 'Unknown';
    if (today < semester.start) return 'Upcoming';
    if (today > semester.end) return 'Previous';
    return 'Current';
  }

  function historyMarkup(course, codes, today) {
    const rows = codes.map(function (code) {
      const status = statusFor(code, today);
      const first = course.dataset.firstOffering === code ? '<span class="history-first">First offering</span>' : '';
      return '<li><span class="history-term">' + code + '</span><span class="history-status history-status-' + status.toLowerCase() + '">' + status + '</span>' + first + '</li>';
    }).join('');

    const primaryStatus = statusFor(codes[0], today);
    return '<span class="semester-badge semester-badge-' + primaryStatus.toLowerCase() + '" role="button" tabindex="0" aria-expanded="false" aria-label="View semester history for ' + course.dataset.course + '">' +
      '<span class="semester-badge-code">' + codes[0] + '</span>' +
      '<span class="semester-badge-status">' + primaryStatus + '</span>' +
      '<svg class="history-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>' +
      '</span>' +
      '<span class="semester-popover" role="tooltip"><span class="semester-popover-title">Semester history</span><ul>' + rows + '</ul></span>';
  }

  function setPageSummary(status, count) {
    const labels = {
      Upcoming: { metric: 'Upcoming', heading: 'Upcoming Courses' },
      Current: { metric: 'Current', heading: 'Current Courses' },
      Previous: { metric: 'Taught', heading: 'Previously Taught Courses' }
    };
    const copy = labels[status] || labels.Upcoming;
    const offeringCount = document.getElementById('offeringCount');
    const offeringStatus = document.getElementById('offeringStatus');
    const courseSectionTitle = document.getElementById('courseSectionTitle');
    const courseSectionTerm = document.getElementById('courseSectionTerm');
    if (offeringCount) offeringCount.textContent = count;
    if (offeringStatus) offeringStatus.textContent = copy.metric;
    if (courseSectionTitle) courseSectionTitle.textContent = copy.heading;
    if (courseSectionTerm) courseSectionTerm.textContent = SEMESTERS.FA26.label;
  }

  function initializeStatusCopy(today) {
    document.querySelectorAll('[data-semester-status]').forEach(function (element) {
      const status = statusFor(element.dataset.semesterStatus, today).toLowerCase();
      const copy = element.dataset['status' + status.charAt(0).toUpperCase() + status.slice(1)];
      if (copy) element.textContent = copy;
      element.dataset.currentStatus = status;
    });

    document.querySelectorAll('[data-show-unless-semester-current]').forEach(function (element) {
      const isVisible = statusFor(element.dataset.showUnlessSemesterCurrent, today) !== 'Current';
      element.hidden = !isVisible;
      element.setAttribute('aria-hidden', String(!isVisible));
    });
  }

  function initializeSemesterHistory() {
    const today = easternDate();
    const cards = Array.from(document.querySelectorAll('[data-semesters]'));
    const primaryStatus = statusFor('FA26', today);
    initializeStatusCopy(today);
    setPageSummary(primaryStatus, cards.filter(function (card) {
      return card.dataset.semesters.split(',').includes('FA26');
    }).length);

    cards.forEach(function (card) {
      const history = card.querySelector('[data-semester-history]');
      const codes = card.dataset.semesters.split(',');
      history.innerHTML = historyMarkup(card, codes, today);
      const badge = history.querySelector('.semester-badge');

      function toggle(event) {
        event.preventDefault();
        event.stopPropagation();
        const opening = !history.classList.contains('is-open');
        document.querySelectorAll('.semester-history.is-open').forEach(function (item) {
          item.classList.remove('is-open');
          item.querySelector('.semester-badge').setAttribute('aria-expanded', 'false');
        });
        history.classList.toggle('is-open', opening);
        badge.setAttribute('aria-expanded', String(opening));
      }

      badge.addEventListener('click', toggle);
      badge.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') toggle(event);
        if (event.key === 'Escape') {
          history.classList.remove('is-open');
          badge.setAttribute('aria-expanded', 'false');
        }
      });
    });

    document.addEventListener('click', function () {
      document.querySelectorAll('.semester-history.is-open').forEach(function (history) {
        history.classList.remove('is-open');
        history.querySelector('.semester-badge').setAttribute('aria-expanded', 'false');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', initializeSemesterHistory);
}());
