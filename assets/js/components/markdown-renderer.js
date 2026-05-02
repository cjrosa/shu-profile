(function (global) {
  'use strict';

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderInline(text) {
    var escaped = escapeHtml(text);
    var codeTokens = [];

    escaped = escaped.replace(/`([^`]+)`/g, function (_, code) {
      var token = '@@CODE' + codeTokens.length + '@@';
      codeTokens.push('<code>' + code + '</code>');
      return token;
    });

    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, label, href) {
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });

    escaped = escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

    escaped = escaped.replace(/@@CODE(\d+)@@/g, function (_, idx) {
      return codeTokens[Number(idx)] || '';
    });

    return escaped;
  }

  function renderAssistantMarkdown(input) {
    var lines = String(input || '').replace(/\r\n?/g, '\n').split('\n');
    var html = [];
    var paragraph = [];
    var inUl = false;
    var inOl = false;
    var inCode = false;
    var codeLines = [];

    function closeLists() {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
    }

    function flushParagraph() {
      if (!paragraph.length) {
        return;
      }
      var raw = paragraph.join('\n');
      html.push('<p>' + renderInline(raw).replace(/\n/g, '<br>') + '</p>');
      paragraph = [];
    }

    function flushCode() {
      if (!inCode) {
        return;
      }
      html.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
      inCode = false;
      codeLines = [];
    }

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];

      if (inCode) {
        if (/^```/.test(line.trim())) {
          flushCode();
        } else {
          codeLines.push(line);
        }
        continue;
      }

      if (/^```/.test(line.trim())) {
        flushParagraph();
        closeLists();
        inCode = true;
        codeLines = [];
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        closeLists();
        continue;
      }

      var heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeLists();
        html.push('<h' + heading[1].length + '>' + renderInline(heading[2]) + '</h' + heading[1].length + '>');
        continue;
      }

      if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
        flushParagraph();
        closeLists();
        html.push('<hr>');
        continue;
      }

      var quote = line.match(/^>\s+(.+)$/);
      if (quote) {
        flushParagraph();
        closeLists();
        html.push('<blockquote>' + renderInline(quote[1]) + '</blockquote>');
        continue;
      }

      var ulItem = line.match(/^[-*+]\s+(.+)$/);
      if (ulItem) {
        flushParagraph();
        if (inOl) {
          html.push('</ol>');
          inOl = false;
        }
        if (!inUl) {
          html.push('<ul>');
          inUl = true;
        }
        html.push('<li>' + renderInline(ulItem[1]) + '</li>');
        continue;
      }

      var olItem = line.match(/^\d+\.\s+(.+)$/);
      if (olItem) {
        flushParagraph();
        if (inUl) {
          html.push('</ul>');
          inUl = false;
        }
        if (!inOl) {
          html.push('<ol>');
          inOl = true;
        }
        html.push('<li>' + renderInline(olItem[1]) + '</li>');
        continue;
      }

      closeLists();
      paragraph.push(line);
    }

    flushParagraph();
    closeLists();
    flushCode();

    return html.join('');
  }

  global.SHUMarkdown = {
    escapeHtml: escapeHtml,
    renderAssistantMarkdown: renderAssistantMarkdown
  };
})(window);
