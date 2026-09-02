/**
 * TemplateLibraryTab — platform owner manages the shared WhatsApp template
 * library that salons adopt. Owner-only CRUD against /api/platform/template-library.
 *
 * Aug 2026 — rebuilt as the FULL template create/submit form (feature-parity
 * with the salon-side Marketing → Templates form):
 *   name · friendly name · category · language · header (none/text/MEDIA upload)
 *   · body with {{n}} + example values · footer · buttons (quick reply / URL / call).
 * Media headers now support a REAL file upload (PDF/image/video) that returns a
 * Meta media handle (POST /api/platform/media/upload), not just a pasted URL.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, Plus, Trash2, Pencil, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GROUPS = ['invoice', 'booking', 'queue_followup', 'reminder', 'marketing'];
const CATEGORIES = ['utility', 'marketing', 'authentication'];
const LANGS = ['en_US', 'en', 'en_IN', 'hi'];
const MEDIA_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT'];
const ACCEPT_BY_FORMAT = {
  IMAGE: 'image/png,image/jpeg,image/webp',
  VIDEO: 'video/mp4,video/3gpp',
  DOCUMENT: 'application/pdf',
};

const compByType = (item, t) =>
  (item?.meta_payload?.components || []).find((c) => (c.type || '').toUpperCase() === t) || null;
const bodyOf = (item) => compByType(item, 'BODY')?.text || '';

const uniquePlaceholders = (txt) => {
  const found = Array.from((txt || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map((m) => Number(m[1]));
  return Array.from(new Set(found)).sort((a, b) => a - b);
};

const emptyForm = {
  id: null, name: '', friendly_name: '', group: 'marketing', category: 'utility',
  lang_code: 'en_US', description: '', body: '', enabled_for_salons: true,
  headerType: 'none', headerText: '', headerSample: '',
  headerFormat: 'IMAGE', headerHandle: '', headerFileName: '', headerSampleUrl: '',
  footerText: '', buttons: [], examples: {},
};

export default function TemplateLibraryTab({ headers }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // form object or null
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/platform/template-library`, { headers });
      setRows(r.data?.templates || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load template library');
    } finally { setLoading(false); }
  }, [headers]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const openNew = () => setModal({ ...emptyForm });

  const openEdit = (item) => {
    const header = compByType(item, 'HEADER');
    const footer = compByType(item, 'FOOTER');
    const buttonsComp = compByType(item, 'BUTTONS');
    const bodyComp = compByType(item, 'BODY');
    // headerType
    let headerType = 'none';
    let headerFormat = 'IMAGE';
    let headerHandle = '';
    let headerSampleUrl = '';
    let headerText = '';
    let headerSample = '';
    if (header) {
      const fmt = (header.format || '').toUpperCase();
      if (fmt === 'TEXT' || (!fmt && header.text)) {
        headerType = 'text';
        headerText = header.text || '';
        headerSample = (header.example?.header_text || [])[0] || '';
      } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(fmt)) {
        headerType = 'media';
        headerFormat = fmt;
        const hh = (header.example?.header_handle || [])[0] || '';
        if (hh && /^https?:\/\//i.test(hh)) headerSampleUrl = hh; else headerHandle = hh;
      }
    }
    // examples from body_text
    const examples = {};
    const phs = uniquePlaceholders(bodyComp?.text || '');
    const bodyEx = (bodyComp?.example?.body_text || [])[0] || [];
    phs.forEach((p, i) => { examples[p] = bodyEx[i] || ''; });
    // buttons
    const buttons = (buttonsComp?.buttons || []).map((b) => {
      const t = (b.type || '').toUpperCase();
      if (t === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text || '' };
      if (t === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text || '', phone: b.phone_number || b.phone || '' };
      return { type: 'URL', text: b.text || '', url: b.url || '', sample: (b.example || [])[0] || '' };
    });
    setModal({
      id: item.id, name: item.name || '', friendly_name: item.friendly_name || '',
      group: item.group || 'marketing', category: (item.category || 'utility').toLowerCase(),
      lang_code: item.lang_code || 'en_US', description: item.description || '',
      body: bodyOf(item), enabled_for_salons: item.enabled_for_salons !== false,
      headerType, headerText, headerSample, headerFormat, headerHandle,
      headerFileName: '', headerSampleUrl,
      footerText: footer?.text || '', buttons, examples,
    });
  };

  const placeholders = useMemo(() => uniquePlaceholders(modal?.body || ''), [modal?.body]);

  const setF = (k, v) => setModal((m) => ({ ...m, [k]: v }));
  const setExample = (p, v) => setModal((m) => ({ ...m, examples: { ...m.examples, [p]: v } }));
  const insertVar = (n) => setModal((m) => {
    const marker = `{{${n}}}`;
    if ((m.body || '').includes(marker)) return m;
    return { ...m, body: (m.body || '') + ((m.body || '').endsWith(' ') || !m.body ? '' : ' ') + marker };
  });

  const addButton = (type) => setModal((m) => {
    if ((m.buttons || []).length >= 3) return m;
    const nb = type === 'QUICK_REPLY' ? { type, text: '' }
      : type === 'PHONE_NUMBER' ? { type, text: '', phone: '' }
      : { type: 'URL', text: '', url: '', sample: '' };
    return { ...m, buttons: [...(m.buttons || []), nb] };
  });
  const setBtn = (i, k, v) => setModal((m) => ({ ...m, buttons: m.buttons.map((x, idx) => idx === i ? { ...x, [k]: v } : x) }));
  const rmBtn = (i) => setModal((m) => ({ ...m, buttons: m.buttons.filter((_, idx) => idx !== i) }));

  // Live preview
  const preview = useMemo(() => {
    let s = modal?.body || '';
    placeholders.forEach((p) => {
      const val = (modal?.examples?.[p]) || `{{${p}}}`;
      s = s.replace(new RegExp(`\\{\\{\\s*${p}\\s*\\}\\}`, 'g'), val);
    });
    return s;
  }, [modal?.body, modal?.examples, placeholders]);

  const onUploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await axios.post(`${API}/platform/media/upload`, fd, { headers });
      const handle = r.data?.handle;
      if (!handle) throw new Error('No handle returned');
      setModal((m) => ({ ...m, headerHandle: handle, headerFileName: file.name, headerSampleUrl: '' }));
      toast.success(r.data?.mock ? 'File uploaded (mock handle — no live Meta creds)' : 'File uploaded to Meta');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Upload failed');
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const buildComponents = (f) => {
    const comps = [];
    if (f.headerType === 'text' && f.headerText.trim()) {
      const h = { type: 'HEADER', format: 'TEXT', text: f.headerText.trim() };
      if (uniquePlaceholders(f.headerText).length) h.example = { header_text: [f.headerSample || 'Sample'] };
      comps.push(h);
    } else if (f.headerType === 'media') {
      const h = { type: 'HEADER', format: f.headerFormat };
      const handle = f.headerHandle || f.headerSampleUrl;
      if (handle) h.example = { header_handle: [handle] };
      comps.push(h);
    }
    const bodyComp = { type: 'BODY', text: f.body };
    const phs = uniquePlaceholders(f.body);
    if (phs.length) bodyComp.example = { body_text: [phs.map((p) => (f.examples[p] || `Sample${p}`))] };
    comps.push(bodyComp);
    if (f.footerText.trim()) comps.push({ type: 'FOOTER', text: f.footerText.trim() });
    const btns = (f.buttons || []).filter((b) => (b.text || '').trim());
    if (btns.length) {
      comps.push({
        type: 'BUTTONS',
        buttons: btns.map((b) => {
          if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
          if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone };
          return { type: 'URL', text: b.text, url: b.url, ...(b.sample ? { example: [b.sample] } : {}) };
        }),
      });
    }
    return comps;
  };

  const buildPayload = (f) => ({
    name: f.name.trim(),
    friendly_name: f.friendly_name.trim() || f.name.trim(),
    category: f.category,
    lang_code: f.lang_code,
    description: f.description,
    group: f.group,
    enabled_for_salons: !!f.enabled_for_salons,
    auto_provision: true,
    meta_payload: {
      name: f.name.trim(),
      category: f.category.toUpperCase(),
      language: f.lang_code,
      components: buildComponents(f),
    },
  });

  const validate = (f) => {
    if (!f.name.trim() || !/^[a-z0-9_]+$/.test(f.name.trim())) {
      toast.error('Name: lowercase letters, digits and underscores only'); return false;
    }
    if (!f.body.trim()) { toast.error('Body text is required'); return false; }
    for (const p of uniquePlaceholders(f.body)) {
      if (!(f.examples[p] || '').trim()) { toast.error(`Sample value required for {{${p}}}`); return false; }
    }
    if (f.headerType === 'media' && !f.headerHandle && !f.headerSampleUrl.trim()) {
      toast.error('Upload a sample file (or paste a URL) for the media header'); return false;
    }
    return true;
  };

  const save = async () => {
    const f = modal;
    if (!validate(f)) return;
    setSaving(true);
    try {
      if (f.id) await axios.put(`${API}/platform/template-library/${f.id}`, buildPayload(f), { headers });
      else await axios.post(`${API}/platform/template-library`, buildPayload(f), { headers });
      toast.success(f.id ? 'Template updated' : 'Template added');
      setModal(null);
      fetchRows();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const toggleEnabled = async (item) => {
    try {
      const f = { ...emptyForm };
      // rebuild a minimal payload preserving existing meta_payload
      const payload = {
        name: item.name, friendly_name: item.friendly_name || item.name,
        category: (item.category || 'utility'), lang_code: item.lang_code || 'en_US',
        description: item.description || '', group: item.group || 'marketing',
        auto_provision: item.auto_provision !== false,
        enabled_for_salons: !(item.enabled_for_salons !== false),
        meta_payload: item.meta_payload || { name: item.name, category: (item.category || 'utility').toUpperCase(), language: item.lang_code || 'en_US', components: [{ type: 'BODY', text: bodyOf(item) }] },
      };
      void f;
      await axios.put(`${API}/platform/template-library/${item.id}`, payload, { headers });
      fetchRows();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.friendly_name || item.name}"?`)) return;
    try {
      await axios.delete(`${API}/platform/template-library/${item.id}`, { headers });
      toast.success('Deleted'); fetchRows();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Delete failed'); }
  };

  const tabBtn = (active) => `flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border ${active ? 'border-emerald-500 text-emerald-600 bg-emerald-500/10' : 'border-border text-muted-foreground bg-transparent'}`;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-bold text-foreground">WhatsApp template library</div>
          <div className="text-xs text-muted-foreground/80">Shared samples salons can adopt. Toggle visibility per template.</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /></Button>
          <Button size="sm" onClick={openNew} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white" data-testid="tpl-new-btn"><Plus className="w-3.5 h-3.5 mr-1" /> New template</Button>
        </div>
      </div>

      <div className="bg-card/60 border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground/80 text-sm">No templates yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-background/60">
              <tr className="text-[10px] uppercase tracking-widest text-muted-foreground/80 border-b border-border">
                <th className="text-left px-4 py-3 font-bold">Template</th>
                <th className="text-left px-4 py-3 font-bold">Group</th>
                <th className="text-left px-4 py-3 font-bold">Category</th>
                <th className="text-left px-4 py-3 font-bold">Visible to salons</th>
                <th className="text-right px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-border/40 last:border-0 hover:bg-background/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{t.friendly_name || t.name}</div>
                    <div className="text-[11px] text-muted-foreground/70 font-mono">{t.name}</div>
                  </td>
                  <td className="px-4 py-3 text-foreground/80">{t.group || 'marketing'}</td>
                  <td className="px-4 py-3 text-foreground/80">{(t.category || 'utility').toUpperCase()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleEnabled(t)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${t.enabled_for_salons !== false ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                      {t.enabled_for_salons !== false ? 'Visible' : 'Hidden'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(t)} className="text-rose-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!modal} onOpenChange={(o) => { if (!o) setModal(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{modal?.id ? 'Edit template' : 'New template'}</DialogTitle></DialogHeader>
          {modal && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Name (lowercase_underscore)</label>
                  <Input value={modal.name} disabled={!!modal.id} onChange={(e) => setF('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} className="mt-1 bg-card border-border font-mono text-xs" data-testid="tpl-name" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Friendly name</label>
                  <Input value={modal.friendly_name} onChange={(e) => setF('friendly_name', e.target.value)} className="mt-1 bg-card border-border" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Group</label>
                  <select value={modal.group} onChange={(e) => setF('group', e.target.value)} className="mt-1 w-full bg-card border border-border rounded-md text-xs px-2 py-2">
                    {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Category</label>
                  <select value={modal.category} onChange={(e) => setF('category', e.target.value)} className="mt-1 w-full bg-card border border-border rounded-md text-xs px-2 py-2">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Language</label>
                  <select value={modal.lang_code} onChange={(e) => setF('lang_code', e.target.value)} className="mt-1 w-full bg-card border border-border rounded-md text-xs px-2 py-2">
                    {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              {/* HEADER */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Header (optional)</label>
                <div className="flex gap-2 mt-1">
                  {[['none', 'None'], ['text', 'Text'], ['media', 'Media']].map(([v, lbl]) => (
                    <button key={v} type="button" data-testid={`tpl-header-${v}`} onClick={() => setF('headerType', v)} className={tabBtn(modal.headerType === v)}>{lbl}</button>
                  ))}
                </div>
                {modal.headerType === 'text' && (
                  <Input placeholder="Header text (may include {{1}})" value={modal.headerText} onChange={(e) => setF('headerText', e.target.value)} className="mt-2 bg-card border-border" data-testid="tpl-header-text" />
                )}
                {modal.headerType === 'media' && (
                  <div className="mt-2 space-y-2">
                    <select value={modal.headerFormat} onChange={(e) => { setF('headerFormat', e.target.value); setF('headerHandle', ''); setF('headerFileName', ''); }} className="w-full bg-card border border-border rounded-md text-xs px-2 py-2" data-testid="tpl-header-format">
                      {MEDIA_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <input ref={fileRef} type="file" accept={ACCEPT_BY_FORMAT[modal.headerFormat]} className="hidden" onChange={(e) => onUploadFile(e.target.files?.[0])} data-testid="tpl-header-file-input" />
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} data-testid="tpl-header-upload-btn">
                        {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                        {uploading ? 'Uploading…' : 'Upload sample file'}
                      </Button>
                      {modal.headerHandle && (
                        <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                          {modal.headerFileName || 'file'} uploaded
                          <button type="button" onClick={() => { setF('headerHandle', ''); setF('headerFileName', ''); }} className="text-muted-foreground"><X className="w-3 h-3" /></button>
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70">Accepts PDF (document), PNG/JPEG/WEBP (image), MP4 (video). The upload returns a Meta media handle.</div>
                    <Input placeholder="…or paste a sample media URL (optional)" value={modal.headerSampleUrl} onChange={(e) => setF('headerSampleUrl', e.target.value)} className="bg-card border-border text-xs" data-testid="tpl-header-media-url" />
                  </div>
                )}
              </div>

              {/* BODY */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Body — use {'{{1}}'}, {'{{2}}'} …</label>
                <textarea rows={4} value={modal.body} onChange={(e) => setF('body', e.target.value)} className="mt-1 w-full bg-card border border-border rounded-md text-sm px-3 py-2" data-testid="tpl-body" />
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => insertVar(n)} className="text-[11px] px-2 py-0.5 rounded border border-border text-muted-foreground">+ {`{{${n}}}`}</button>
                  ))}
                </div>
              </div>

              {/* EXAMPLE VALUES */}
              {placeholders.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Example values (required by Meta)</label>
                  <div className="space-y-1.5 mt-1">
                    {placeholders.map((p) => (
                      <div key={p} className="grid grid-cols-[48px_1fr] gap-2 items-center">
                        <b className="font-mono text-xs text-foreground/80">{`{{${p}}}`}</b>
                        <Input value={modal.examples[p] || ''} onChange={(e) => setExample(p, e.target.value)} placeholder={`Sample for {{${p}}}`} className="bg-card border-border text-xs" data-testid={`tpl-example-${p}`} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FOOTER */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Footer (optional, max 60 chars)</label>
                <Input maxLength={60} value={modal.footerText} onChange={(e) => setF('footerText', e.target.value)} className="mt-1 bg-card border-border" data-testid="tpl-footer" />
              </div>

              {/* BUTTONS */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Buttons (optional, up to 3)</label>
                <div className="space-y-1.5 mt-1">
                  {modal.buttons.map((b, i) => (
                    <div key={i} className="flex gap-1.5 items-center" data-testid={`tpl-button-row-${i}`}>
                      <span className="text-[10px] font-bold w-16 text-muted-foreground">{b.type === 'QUICK_REPLY' ? 'Quick' : b.type === 'PHONE_NUMBER' ? 'Call' : 'URL'}</span>
                      <Input placeholder="Button text" value={b.text} onChange={(e) => setBtn(i, 'text', e.target.value)} className="bg-card border-border text-xs flex-1" />
                      {b.type === 'URL' && <Input placeholder="https://…" value={b.url || ''} onChange={(e) => setBtn(i, 'url', e.target.value)} className="bg-card border-border text-xs flex-1" />}
                      {b.type === 'PHONE_NUMBER' && <Input placeholder="+9198…" value={b.phone || ''} onChange={(e) => setBtn(i, 'phone', e.target.value)} className="bg-card border-border text-xs flex-1" />}
                      <button type="button" onClick={() => rmBtn(i)} className="text-rose-400"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                  {modal.buttons.length < 3 && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => addButton('QUICK_REPLY')} className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground" data-testid="tpl-add-quickreply">+ Quick reply</button>
                      <button type="button" onClick={() => addButton('URL')} className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground" data-testid="tpl-add-url">+ URL</button>
                      <button type="button" onClick={() => addButton('PHONE_NUMBER')} className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground" data-testid="tpl-add-phone">+ Call</button>
                    </div>
                  )}
                </div>
              </div>

              {/* PREVIEW */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Preview</label>
                <div className="mt-1 rounded-xl px-3 py-2.5 text-sm whitespace-pre-wrap" style={{ background: '#E7FCE3', border: '1px solid #CDEBD9', color: '#0F5132' }}>{preview || '—'}</div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Short description</label>
                <Input value={modal.description} onChange={(e) => setF('description', e.target.value)} className="mt-1 bg-card border-border" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={modal.enabled_for_salons} onChange={(e) => setF('enabled_for_salons', e.target.checked)} />
                Visible to salons (adoptable)
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
                <Button onClick={save} disabled={saving || uploading} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white" data-testid="tpl-save-btn">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (modal.id ? 'Save template' : 'Add template')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
