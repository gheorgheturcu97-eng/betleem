// A Bible version from a file the church has the right to use: Zefania XML, OSIS, USFX, or JSON → { books: [66][chapters][verses] }.
const USFX = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ');
const OSIS = 'Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev'.split(' ');
const SKIP = new Set(['f', 'x', 'ide', 'id', 'h', 'toc', 'note', 'title', 'd', 'rdg', 'fig', 'STYLE', 'NOTE', 'note']);
const clean = t => String(t).replace(/ş/g, 'ș').replace(/ţ/g, 'ț').replace(/Ş/g, 'Ș').replace(/Ţ/g, 'Ț').replace(/\s+/g, ' ').trim();

export async function readBible(file) {
  const text = await file.text();
  let books;
  if (/^\s*[[{]/.test(text)) books = fromJson(JSON.parse(text.replace(/^﻿/, '')));
  else {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Fișierul nu e un XML valid.');
    const root = doc.documentElement.localName.toLowerCase();
    books = root === 'xmlbible' ? zefania(doc) : root === 'usfx' ? walk(doc, 'usfx') : walk(doc, 'osis');
  }
  books = books.map(b => (b || []).map(ch => (ch || []).map(v => clean(v || ''))));
  const missing = books.map((b, i) => b.length ? -1 : i).filter(i => i >= 0);
  if (books.length !== 66 || missing.length) throw new Error(`Lipsesc cărți din fișier (${missing.length}). Am nevoie de toate cele 66.`);
  return books;
}

function fromJson(j) {
  if (Array.isArray(j?.books)) return j.books;                              // ours
  if (Array.isArray(j) && j[0]?.chapters) return j.map(b => b.chapters);  // [{ abbrev, chapters }]
  throw new Error('Nu recunosc acest JSON.');
}

function zefania(doc) {
  const books = Array.from({ length: 66 }, () => []);
  for (const b of doc.getElementsByTagName('BIBLEBOOK')) {
    const n = Number(b.getAttribute('bnumber')) - 1; if (!(n >= 0 && n < 66)) continue;
    for (const c of b.getElementsByTagName('CHAPTER')) {
      const ch = []; books[n][Number(c.getAttribute('cnumber')) - 1] = ch;
      for (const v of c.getElementsByTagName('VERS')) {
        let t = ''; for (const node of v.childNodes) if (node.nodeType === 3 || !SKIP.has(node.nodeName)) t += node.textContent;
        ch[Number(v.getAttribute('vnumber')) - 1] = t;
      }
    }
  }
  return books;
}

// USFX (book/c/v milestones) and OSIS (verse sID/eID milestones or containers)
function walk(doc, kind) {
  const books = Array.from({ length: 66 }, () => []);
  let b = -1, c = 0, v = 0;
  const add = t => { if (b >= 0 && c && v && t) { const ch = books[b][c - 1] ||= []; ch[v - 1] = (ch[v - 1] || '') + t; } };
  const visit = el => {
    const t = el.localName;
    if (kind === 'usfx') {
      if (t === 'book') { b = USFX.indexOf(el.getAttribute('id')); c = v = 0; }
      if (t === 'c') { c = Number(el.getAttribute('id')); v = 0; }
      if (t === 'v') v = parseInt(el.getAttribute('id'), 10);
      if (t === 've') v = 0;
    } else if (t === 'verse') {
      if (el.getAttribute('eID')) v = 0;
      else if (el.getAttribute('osisID')) { const [bk, ch, vs] = el.getAttribute('osisID').split(' ')[0].split('.'); b = OSIS.indexOf(bk); c = +ch; v = +vs; }
    }
    if (!SKIP.has(t)) for (const n of el.childNodes) n.nodeType === 3 ? add(n.nodeValue) : n.nodeType === 1 && visit(n);
    if (kind === 'osis' && t === 'verse' && el.childNodes.length) v = 0;          // container verse ends here
  };
  visit(doc.documentElement);
  return books;
}
