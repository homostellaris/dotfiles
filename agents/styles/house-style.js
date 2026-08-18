/**
 * House Style Interactive Component Controller (Vanilla Micro-JS)
 * Hosted on Tailscale at /_style/house-style.js
 */

(function () {
  'use strict';

  function initTabs() {
    document.querySelectorAll('[data-tabs]').forEach((tabContainer) => {
      const triggers = tabContainer.querySelectorAll('[data-tab-target]');
      const contents = tabContainer.querySelectorAll('[data-tab-content]');

      triggers.forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          const targetId = trigger.getAttribute('data-tab-target');

          triggers.forEach((t) => t.classList.remove('active'));
          contents.forEach((c) => c.classList.remove('active'));

          trigger.classList.add('active');
          const targetEl = tabContainer.querySelector(`[data-tab-content="${targetId}"]`) || document.getElementById(targetId);
          if (targetEl) targetEl.classList.add('active');
        });
      });
    });
  }

  function initAccordions() {
    document.querySelectorAll('[data-accordion]').forEach((acc) => {
      const items = acc.querySelectorAll('.accordion-item');
      items.forEach((item) => {
        const trigger = item.querySelector('.accordion-trigger');
        if (trigger) {
          trigger.addEventListener('click', () => {
            item.classList.toggle('open');
          });
        }
      });
    });
  }

  function initCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetSelector = btn.getAttribute('data-copy');
        let textToCopy = '';
        if (targetSelector) {
          const target = document.querySelector(targetSelector);
          textToCopy = target ? target.innerText : '';
        } else {
          textToCopy = btn.getAttribute('data-copy-text') || '';
        }

        if (textToCopy) {
          try {
            await navigator.clipboard.writeText(textToCopy);
            const originalText = btn.innerText;
            btn.innerText = '✓ Copied';
            setTimeout(() => {
              btn.innerText = originalText;
            }, 2000);
          } catch (err) {
            console.error('Failed to copy', err);
          }
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initAccordions();
    initCopyButtons();
  });

  // Global helpers
  window.HouseStyle = {
    initTabs,
    initAccordions,
    initCopyButtons,
  };
})();
