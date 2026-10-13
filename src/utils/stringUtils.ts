import DOMPurify from 'dompurify';

export const stripHtml = (html: string | undefined) => {
  if (!html) return "";
  // Analytics is also exercised in Node (tests/export preparation), where a
  // browser DOM does not exist. Keep the browser path for full entity parsing
  // and use a conservative tag-strip fallback outside the browser.
  if (typeof document === 'undefined') {
    return cleanHtmlWhitespace(html).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, ' ').trim();
};

export const cleanHtmlWhitespace = (html: string | undefined) => {
  if (!html) return "";
  return html.replace(/&nbsp;|\u00A0|&#160;/gi, ' ');
};

export const sanitizeHtml = (html: string | undefined) => DOMPurify.sanitize(cleanHtmlWhitespace(html));

export const toUnaccented = (str: string | undefined) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};
