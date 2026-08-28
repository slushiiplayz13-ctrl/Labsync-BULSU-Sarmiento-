/**
 * LabSync Timetable AutoScroller | js/scheduling/interactions/autoscroll.js
 * Smooth RAF auto-scroller for timetable grid container and browser viewport during drag & resize.
 */

(function (global) {
  'use strict';

  const AutoScroller = {
    rafId: null,
    pointerX: 0,
    pointerY: 0,
    active: false,
    onScrollCallback: null,
    EDGE_THRESHOLD: 70, // proximity zone in px
    MIN_SPEED: 2,       // min px per frame
    MAX_SPEED: 18,      // max px per frame

    getGridContainer() {
      return document.querySelector('.calendar-grid-container');
    },

    start(onScrollCallback) {
      this.active = true;
      if (typeof onScrollCallback === 'function') {
        this.onScrollCallback = onScrollCallback;
      }
      if (!this.rafId) {
        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);
      }
    },

    update(clientX, clientY, onScrollCallback) {
      if (clientX !== undefined) this.pointerX = clientX;
      if (clientY !== undefined) this.pointerY = clientY;
      if (typeof onScrollCallback === 'function') {
        this.onScrollCallback = onScrollCallback;
      }
      if (!this.active) {
        this.start(onScrollCallback);
      }
    },

    stop() {
      this.active = false;
      this.onScrollCallback = null;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    },

    computeSpeed(distanceInsideEdge) {
      const ratio = Math.min(1.6, Math.max(0, distanceInsideEdge / this.EDGE_THRESHOLD));
      return this.MIN_SPEED + (this.MAX_SPEED - this.MIN_SPEED) * Math.pow(ratio, 1.4);
    },

    loop() {
      if (!this.active) {
        this.rafId = null;
        return;
      }

      let didScroll = false;
      const container = this.getGridContainer();
      const clientY = this.pointerY;
      const clientX = this.pointerX;

      if (clientY > 0 && container) {
        const cRect = container.getBoundingClientRect();

        // 1. Calendar Grid Container auto-scroll (Primary)
        if (clientX >= cRect.left - 60 && clientX <= cRect.right + 60) {
          // Bottom edge of container
          if (clientY >= cRect.bottom - this.EDGE_THRESHOLD && clientY <= cRect.bottom + 120) {
            const distance = clientY - (cRect.bottom - this.EDGE_THRESHOLD);
            const speed = this.computeSpeed(distance);
            const maxScrollTop = container.scrollHeight - container.clientHeight;
            if (container.scrollTop < maxScrollTop) {
              container.scrollTop = Math.min(maxScrollTop, container.scrollTop + speed);
              didScroll = true;
            }
          }
          // Top edge of container
          else if (clientY <= cRect.top + this.EDGE_THRESHOLD && clientY >= cRect.top - 60) {
            const distance = (cRect.top + this.EDGE_THRESHOLD) - clientY;
            const speed = this.computeSpeed(distance);
            if (container.scrollTop > 0) {
              container.scrollTop = Math.max(0, container.scrollTop - speed);
              didScroll = true;
            }
          }
        }

        // 2. Viewport / Window vertical auto-scroll (Secondary / Page level)
        const vh = window.innerHeight;
        if (clientY >= vh - this.EDGE_THRESHOLD) {
          const distance = clientY - (vh - this.EDGE_THRESHOLD);
          const speed = this.computeSpeed(distance);
          window.scrollBy(0, speed);
          didScroll = true;
        } else if (clientY <= this.EDGE_THRESHOLD && clientY >= 0) {
          const distance = this.EDGE_THRESHOLD - clientY;
          const speed = this.computeSpeed(distance);
          window.scrollBy(0, -speed);
          didScroll = true;
        }
      }

      // Continuously update placeholder / resize calculations on each animation frame
      if (this.onScrollCallback) {
        this.onScrollCallback(this.pointerX, this.pointerY, didScroll);
      }

      if (this.active) {
        this.rafId = requestAnimationFrame(this.loop);
      } else {
        this.rafId = null;
      }
    }
  };

  global.scheduleAutoScroller = AutoScroller;
  global.AutoScroller = AutoScroller;

})(typeof window !== 'undefined' ? window : this);
