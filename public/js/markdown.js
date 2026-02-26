/**
 * Simple hand-rolled Markdown renderer.
 * Processes: headings, bold, italic, inline code, code blocks, lists, blockquotes, links, horizontal rules, tables.
 * XSS-safe: HTML entities are escaped before processing markdown.
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Restore escaped content inside code blocks (only for display)
  function renderMarkdown(raw) {
    if (!raw) return '';

    // Extract and protect code blocks before escaping
    const codeBlocks = [];
    let text = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || '', code });
      return `\x00CODE_BLOCK_${idx}\x00`;
    });

    // Extract inline code
    const inlineCodes = [];
    text = text.replace(/`([^`]+)`/g, (_, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(code);
      return `\x00INLINE_CODE_${idx}\x00`;
    });

    // Escape HTML in remaining text
    text = escapeHtml(text);

    // Restore code blocks (escaped inside)
    text = text.replace(/\x00CODE_BLOCK_(\d+)\x00/g, (_, i) => {
      const { lang, code } = codeBlocks[i];
      return `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`;
    });

    // Restore inline code
    text = text.replace(/\x00INLINE_CODE_(\d+)\x00/g, (_, i) => {
      return `<code>${escapeHtml(inlineCodes[i])}</code>`;
    });

    // Process line by line for block elements
    const lines = text.split('\n');
    const output = [];
    let i = 0;
    let inList = null; // 'ul' | 'ol' | null
    let inTable = false;
    let tableRows = [];

    function flushList() {
      if (inList) {
        output.push(`</${inList}>`);
        inList = null;
      }
    }
    function flushTable() {
      if (inTable && tableRows.length > 0) {
        let html = '<table>';
        tableRows.forEach((row, ri) => {
          html += '<tr>';
          const tag = ri === 0 ? 'th' : 'td';
          row.forEach(cell => { html += `<${tag}>${cell.trim()}</${tag}>`; });
          html += '</tr>';
        });
        html += '</table>';
        output.push(html);
        inTable = false;
        tableRows = [];
      }
    }

    while (i < lines.length) {
      const line = lines[i];

      // Headings
      const hMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (hMatch) {
        flushList(); flushTable();
        const level = hMatch[1].length;
        output.push(`<h${level}>${applyInline(hMatch[2])}</h${level}>`);
        i++; continue;
      }

      // Horizontal rule
      if (/^(\*\*\*|---|___)/.test(line.trim())) {
        flushList(); flushTable();
        output.push('<hr />');
        i++; continue;
      }

      // Blockquote
      if (line.startsWith('&gt;')) {
        flushList(); flushTable();
        const content = line.slice(4).trim();
        output.push(`<blockquote>${applyInline(content)}</blockquote>`);
        i++; continue;
      }

      // Unordered list
      const ulMatch = line.match(/^(\s*)[*\-+]\s+(.+)/);
      if (ulMatch) {
        flushTable();
        if (inList !== 'ul') { flushList(); output.push('<ul>'); inList = 'ul'; }
        output.push(`<li>${applyInline(ulMatch[2])}</li>`);
        i++; continue;
      }

      // Ordered list
      const olMatch = line.match(/^\s*\d+\.\s+(.+)/);
      if (olMatch) {
        flushTable();
        if (inList !== 'ol') { flushList(); output.push('<ol>'); inList = 'ol'; }
        output.push(`<li>${applyInline(olMatch[1])}</li>`);
        i++; continue;
      }

      // Table
      if (line.includes('|')) {
        flushList();
        const cells = line.split('|').filter(c => c !== '');
        // Check if separator row
        if (cells.every(c => /^[-: ]+$/.test(c.trim()))) {
          // separator row — skip
          i++; continue;
        }
        if (!inTable) { flushTable(); inTable = true; tableRows = []; }
        tableRows.push(cells.map(c => applyInline(c.trim())));
        i++; continue;
      }

      flushTable();

      // Empty line
      if (line.trim() === '') {
        flushList();
        output.push('<br />');
        i++; continue;
      }

      flushList();
      // Paragraph line
      output.push(`<p>${applyInline(line)}</p>`);
      i++;
    }

    flushList();
    flushTable();

    return output.join('\n');
  }

  function applyInline(text) {
    // Bold+italic
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/_(.+?)_/g, '<em>$1</em>');
    // Strikethrough
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Auto-links (https/http only, URL-encode href to prevent injection)
    text = text.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
      const safeUrl = url.replace(/"/g, '%22').replace(/'/g, '%27');
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    return text;
  }

  global.renderMarkdown = renderMarkdown;
})(window);
