export const stripHtml = (html: string | undefined) => {
  if (!html) return "";
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, ' ').trim();
};

export const cleanHtmlWhitespace = (html: string | undefined) => {
  if (!html) return "";
  return html.replace(/&nbsp;|\u00A0|&#160;/gi, ' ');
};

export const toUnaccented = (str: string | undefined) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};
