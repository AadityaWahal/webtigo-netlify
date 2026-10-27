/**
 * Webtigo Share & Direct Export Hub
 * Provides unified, one-click export to Google Drive, Email (Gmail / Mail Client),
 * WhatsApp, Instagram, and Native System Share across all Webtigo tools.
 */
(function (window) {
  'use strict';

  // Inject stylesheet for the share hub & modal
  function injectStyles() {
    if (document.getElementById('webtigo-share-styles')) return;
    const style = document.createElement('style');
    style.id = 'webtigo-share-styles';
    style.textContent = `
      .webtigo-export-container {
        margin-top: 1.5rem;
        padding: 1.25rem;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(59, 130, 246, 0.25);
        border-radius: 1rem;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        text-align: left;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      }
      .webtigo-export-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .webtigo-export-title {
        font-size: 0.95rem;
        font-weight: 700;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .webtigo-export-filename {
        font-size: 0.78rem;
        color: #94a3b8;
        background: rgba(255, 255, 255, 0.05);
        padding: 0.2rem 0.5rem;
        border-radius: 0.35rem;
        font-family: monospace;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .webtigo-export-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 0.65rem;
      }
      .webtigo-export-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.65rem 0.85rem;
        font-size: 0.85rem;
        font-weight: 600;
        border-radius: 0.65rem;
        cursor: pointer;
        transition: all 0.2s ease;
        text-decoration: none;
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #ffffff;
        background: rgba(255, 255, 255, 0.05);
        user-select: none;
        text-align: center;
      }
      .webtigo-export-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      }
      .webtigo-export-btn:active {
        transform: translateY(0);
      }
      .webtigo-btn-download {
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        border-color: #3b82f6;
        grid-column: span 1;
      }
      .webtigo-btn-download:hover {
        background: linear-gradient(135deg, #1d4ed8, #1e40af);
      }
      .webtigo-btn-drive {
        background: rgba(234, 67, 53, 0.12);
        border-color: rgba(234, 67, 53, 0.35);
        color: #fca5a5;
      }
      .webtigo-btn-drive:hover {
        background: rgba(234, 67, 53, 0.25);
        color: #fee2e2;
        border-color: rgba(234, 67, 53, 0.6);
      }
      .webtigo-btn-mail {
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.35);
        color: #fca5a5;
      }
      .webtigo-btn-mail:hover {
        background: rgba(239, 68, 68, 0.25);
        color: #ffffff;
      }
      .webtigo-btn-whatsapp {
        background: rgba(37, 211, 102, 0.12);
        border-color: rgba(37, 211, 102, 0.35);
        color: #86efac;
      }
      .webtigo-btn-whatsapp:hover {
        background: rgba(37, 211, 102, 0.25);
        color: #ffffff;
        border-color: rgba(37, 211, 102, 0.6);
      }
      .webtigo-btn-insta {
        background: rgba(225, 48, 108, 0.12);
        border-color: rgba(225, 48, 108, 0.35);
        color: #f472b6;
      }
      .webtigo-btn-insta:hover {
        background: rgba(225, 48, 108, 0.25);
        color: #ffffff;
        border-color: rgba(225, 48, 108, 0.6);
      }
      .webtigo-btn-share {
        background: rgba(168, 85, 247, 0.12);
        border-color: rgba(168, 85, 247, 0.35);
        color: #d8b4fe;
      }
      .webtigo-btn-share:hover {
        background: rgba(168, 85, 247, 0.25);
        color: #ffffff;
      }
      .webtigo-toast {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid rgba(59, 130, 246, 0.5);
        padding: 0.85rem 1.25rem;
        border-radius: 0.75rem;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 0.65rem;
        animation: webtigoSlideUp 0.3s ease;
      }
      @keyframes webtigoSlideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      /* Modal styles for Drive / Mail Guide */
      .webtigo-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 1rem;
        animation: webtigoFadeIn 0.2s ease;
      }
      @keyframes webtigoFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .webtigo-modal-content {
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 1rem;
        max-width: 480px;
        width: 100%;
        padding: 1.5rem;
        color: #f8fafc;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
        position: relative;
      }
      .webtigo-modal-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 1.25rem;
        cursor: pointer;
        line-height: 1;
        padding: 0.25rem;
      }
      .webtigo-modal-close:hover {
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  // Toast Notification
  function showToast(message, duration = 3500) {
    const existing = document.querySelector('.webtigo-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'webtigo-toast';
    toast.innerHTML = `<span>⚡</span> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Helper: Trigger File Download
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Web Share API Helper with file attachment support
  async function triggerWebShare(file, title, text, fallbackUrl) {
    if (navigator.share) {
      try {
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: title || 'Webtigo Document',
            text: text || 'Created with Webtigo free tools'
          });
          return true;
        } else {
          await navigator.share({
            title: title || 'Webtigo Document',
            text: text || 'Created with Webtigo free tools',
            url: fallbackUrl || window.location.href
          });
          return true;
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Web Share API error:', err);
        }
        return false;
      }
    }
    return false;
  }

  // Google Drive Modal & Direct Workflow
  function openDriveWorkflow(blob, filename) {
    // 1. Immediately download file so it's ready in user's downloads folder
    downloadBlob(blob, filename);

    // 2. Open sleek guide modal with direct Drive link & login notice
    const overlay = document.createElement('div');
    overlay.className = 'webtigo-modal-overlay';
    overlay.innerHTML = `
      <div class="webtigo-modal-content">
        <button class="webtigo-modal-close" aria-label="Close">&times;</button>
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
          <div style="background: rgba(234, 67, 53, 0.15); padding: 0.6rem; border-radius: 0.5rem; display: flex;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ea4335" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.15rem; color: #fff;">Save to Google Drive</h3>
            <p style="margin: 0; font-size: 0.8rem; color: #94a3b8;">${filename}</p>
          </div>
        </div>

        <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1.25rem; font-size: 0.88rem; line-height: 1.5; color: #cbd5e1;">
          <p style="margin: 0 0 0.5rem 0; color: #34d399; font-weight: 600;">
            ✓ Your file has been downloaded to your device!
          </p>
          <p style="margin: 0;">
            Click below to open <strong>Google Drive</strong>. If you are not logged in, Google will prompt you to sign in. Then drag & drop or upload <code>${filename}</code> directly into any folder.
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.65rem;">
          <a href="https://drive.google.com/drive/u/0/my-drive" target="_blank" rel="noopener noreferrer" 
             style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: #2563eb; color: #ffffff; padding: 0.75rem 1rem; border-radius: 0.5rem; font-weight: 600; text-decoration: none; transition: background 0.2s;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            Open My Google Drive
          </a>
          <button type="button" class="webtigo-modal-dismiss" 
                  style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #cbd5e1; padding: 0.6rem 1rem; border-radius: 0.5rem; cursor: pointer;">
            Close
          </button>
        </div>
      </div>
    `;

    const close = () => overlay.remove();
    overlay.querySelector('.webtigo-modal-close').onclick = close;
    overlay.querySelector('.webtigo-modal-dismiss').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    document.body.appendChild(overlay);
  }

  // Mail Compose Workflow (Gmail & Default Mail)
  function openMailWorkflow(blob, filename, subject, body) {
    const defaultSubject = subject || `File from Webtigo: ${filename}`;
    const defaultBody = body || `Hello,\n\nI have generated ${filename} using Webtigo free online tools (https://webtigo.netlify.app).\n\nRegards`;

    // Download file so user has it ready to attach if browser doesn't attach automatically
    downloadBlob(blob, filename);

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(defaultSubject)}&body=${encodeURIComponent(defaultBody)}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(defaultSubject)}&body=${encodeURIComponent(defaultBody)}`;

    const overlay = document.createElement('div');
    overlay.className = 'webtigo-modal-overlay';
    overlay.innerHTML = `
      <div class="webtigo-modal-content">
        <button class="webtigo-modal-close" aria-label="Close">&times;</button>
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
          <div style="background: rgba(239, 68, 68, 0.15); padding: 0.6rem; border-radius: 0.5rem; display: flex;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.15rem; color: #fff;">Send via Email Compose</h3>
            <p style="margin: 0; font-size: 0.8rem; color: #94a3b8;">${filename}</p>
          </div>
        </div>

        <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1.25rem; font-size: 0.88rem; line-height: 1.5; color: #cbd5e1;">
          <p style="margin: 0 0 0.5rem 0; color: #34d399; font-weight: 600;">
            ✓ File saved to your downloads folder!
          </p>
          <p style="margin: 0;">
            Choose your preferred email client below. If using Gmail, sign in if requested; your subject and text will be pre-filled.
          </p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
          <a href="${gmailUrl}" target="_blank" rel="noopener noreferrer" 
             style="display: flex; align-items: center; justify-content: center; gap: 0.4rem; background: linear-gradient(135deg, #ef4444, #dc2626); color: #ffffff; padding: 0.75rem 0.5rem; border-radius: 0.5rem; font-weight: 600; text-decoration: none; font-size: 0.85rem; text-align: center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            Open Gmail Web
          </a>
          <a href="${mailtoUrl}" 
             style="display: flex; align-items: center; justify-content: center; gap: 0.4rem; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: #ffffff; padding: 0.75rem 0.5rem; border-radius: 0.5rem; font-weight: 600; text-decoration: none; font-size: 0.85rem; text-align: center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            Mail App
          </a>
        </div>
      </div>
    `;

    const close = () => overlay.remove();
    overlay.querySelector('.webtigo-modal-close').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    document.body.appendChild(overlay);
  }

  // WhatsApp Direct Workflow
  async function openWhatsAppWorkflow(blob, filename, text) {
    const file = new File([blob], filename, { type: blob.type });

    // If native share is supported with file, try native first (attaches the actual document/media into WhatsApp!)
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Webtigo - ${filename}`,
          text: text || `Check out this file generated with Webtigo free tools: https://webtigo.netlify.app`
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // Direct WhatsApp Web / App intent
    const msg = text ? `${text}\n\nGenerated with Webtigo: https://webtigo.netlify.app` : `Generated ${filename} with Webtigo: https://webtigo.netlify.app`;
    downloadBlob(blob, filename);
    showToast('File downloaded! Opening WhatsApp...');
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  }

  // Instagram Direct Workflow
  async function openInstagramWorkflow(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });

    // If mobile native share can share files to Instagram app directly
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: filename,
          text: `#Webtigo #MadeWithWebtigo #FreeTools`
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // Automatic download + copy caption to clipboard + redirect to Instagram
    downloadBlob(blob, filename);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(`Created with Webtigo (@webtigo) - Free Online Utilities 🚀\nhttps://webtigo.netlify.app\n#Webtigo #WebTools #MadeWithWebtigo`);
      }
    } catch (_) {}

    showToast('📸 File saved & Instagram caption copied to clipboard!');
    setTimeout(() => {
      window.open('https://www.instagram.com/', '_blank');
    }, 600);
  }

  // Main WebtigoShare API Object
  window.WebtigoShare = {
    init: injectStyles,

    /**
     * Renders the complete, responsive export & share panel into any container.
     */
    renderHub: function (container, options) {
      injectStyles();
      if (typeof container === 'string') {
        container = document.querySelector(container);
      }
      if (!container) return;

      const blob = options.blob;
      const filename = options.filename || 'webtigo-export';
      const title = options.title || 'Webtigo Export';
      const text = options.text || `Generated with Webtigo free web tools`;
      const mimeType = options.mimeType || (blob ? blob.type : 'application/octet-stream');

      const wrapper = document.createElement('div');
      wrapper.className = 'webtigo-export-container';
      wrapper.innerHTML = `
        <div class="webtigo-export-header">
          <div class="webtigo-export-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
            Export & Share Hub
          </div>
          <span class="webtigo-export-filename" title="${filename}">${filename}</span>
        </div>

        <div class="webtigo-export-grid">
          <button type="button" class="webtigo-export-btn webtigo-btn-download" id="wt-btn-dl">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download
          </button>

          <button type="button" class="webtigo-export-btn webtigo-btn-drive" id="wt-btn-drive" title="Save directly to Google Drive">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            Google Drive
          </button>

          <button type="button" class="webtigo-export-btn webtigo-btn-mail" id="wt-btn-mail" title="Compose directly in Gmail or Mail Client">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            Mail Compose
          </button>

          <button type="button" class="webtigo-export-btn webtigo-btn-whatsapp" id="wt-btn-wa" title="Share directly to WhatsApp">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
            WhatsApp
          </button>

          <button type="button" class="webtigo-export-btn webtigo-btn-insta" id="wt-btn-insta" title="Share to Instagram">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
            Instagram
          </button>

          <button type="button" class="webtigo-export-btn webtigo-btn-share" id="wt-btn-share" title="Share with any App (AirDrop, Messages, Telegram, Drive)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            More Apps
          </button>
        </div>
      `;

      // Clear existing hub in container and attach
      container.innerHTML = '';
      container.appendChild(wrapper);

      // Event handlers
      wrapper.querySelector('#wt-btn-dl').onclick = () => {
        downloadBlob(blob, filename);
        showToast('Downloading ' + filename);
      };

      wrapper.querySelector('#wt-btn-drive').onclick = () => {
        openDriveWorkflow(blob, filename);
      };

      wrapper.querySelector('#wt-btn-mail').onclick = () => {
        openMailWorkflow(blob, filename, options.subject || `Webtigo: ${filename}`, options.body);
      };

      wrapper.querySelector('#wt-btn-wa').onclick = () => {
        openWhatsAppWorkflow(blob, filename, text);
      };

      wrapper.querySelector('#wt-btn-insta').onclick = () => {
        openInstagramWorkflow(blob, filename);
      };

      wrapper.querySelector('#wt-btn-share').onclick = async () => {
        const file = new File([blob], filename, { type: mimeType });
        const shared = await triggerWebShare(file, title, text, window.location.href);
        if (!shared) {
          // If native share not supported, copy link and prompt
          try {
            await navigator.clipboard.writeText(window.location.href);
            showToast('🔗 Tool link copied to clipboard!');
          } catch (_) {
            showToast('Downloaded ' + filename);
            downloadBlob(blob, filename);
          }
        }
      };
    },

    // Individual action methods for manual invocation
    download: downloadBlob,
    saveToDrive: openDriveWorkflow,
    sendEmail: openMailWorkflow,
    shareWhatsApp: openWhatsAppWorkflow,
    shareInstagram: openInstagramWorkflow,
    showToast: showToast
  };

  // Inject styles on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }
})(window);
