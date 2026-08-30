/**
 * TemplateLibraryTab — platform owner manages the shared WhatsApp template
 * library that salons adopt. Owner-only CRUD against /api/platform/template-library.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GROUPS = ['invoice', 'booking', 'queue_followup', 'reminder', 'marketing'];
const CATEGORIES = ['utility', 'marketing', 'authentication'];

const bodyOf = (item) =>
  ((item?.meta_payload?.components || []).find((c) => (c.type || '').toUpperCase() === 'BODY')?.text) || '';

const emptyForm = {
  id: null, name: '', friendly_name: '', group: 'marketing', category: 'utility',
  lang_code: 'en_US', description: '', body: '', enabled_for_salons: true,
};

export default function TemplateLibraryTab({ headers }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // form object or null
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/platform/template-library`, { headers });
      setRows(r.data?.templates || []);
    } catch {
      toast.error('Failed to load template library');
    } finally { setLoading(false); }
  }, [headers]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const openNew = () => setModal({ ...emptyForm });
  const openEdit = (item) => setModal({
    id: item.id, name: item.name || '', friendly_name: item.friendly_name || '',
    group: item.group || 'marketing', category: item.category || 'utility',
    lang_code: item.lang_code || 'en_US', description: item.description || '',
    body: bodyOf(item), enabled_for_salons: item.enabled_for_salons !== false,
  });

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
      components: [{ type: 'BODY', text: f.body }],
    },
  });

  const save = async () => {
    const f = modal;
    if (!f.name.trim() || !/^[a-z0-9_]+$/.test(f.name.trim())) {
      toast.error('Name: lowercase letters, digits and underscores only'); return;
    }
    if (!f.body.trim()) { toast.error('Body text is required'); return; }
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
      await axios.put(`${API}/platform/template-library/${item.id}`,
        { ...buildPayload({ ...emptyForm, ...item, body: bodyOf(item) }), enabled_for_salons: !(item.enabled_for_salons !== false) },
        { headers });
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

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-bold text-foreground">WhatsApp template library</div>
          <div className="text-xs text-muted-foreground/80">Shared samples salons can adopt. Toggle visibility per template.</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /></Button>
          <Button size="sm" onClick={openNew} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"><Plus className="w-3.5 h-3.5 mr-1" /> New template</Button>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{modal?.id ? 'Edit template' : 'New template'}</DialogTitle></DialogHeader>
          {modal && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Name (lowercase_underscore)</label>
                  <Input value={modal.name} disabled={!!modal.id} onChange={(e) => setModal({ ...modal, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} className="mt-1 bg-card border-border font-mono text-xs" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Friendly name</label>
                  <Input value={modal.friendly_name} onChange={(e) => setModal({ ...modal, friendly_name: e.target.value })} className="mt-1 bg-card border-border" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Group</label>
                  <select value={modal.group} onChange={(e) => setModal({ ...modal, group: e.target.value })} className="mt-1 w-full bg-card border border-border rounded-md text-xs px-2 py-2">
                    {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Category</label>
                  <select value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value })} className="mt-1 w-full bg-card border border-border rounded-md text-xs px-2 py-2">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Language</label>
                  <select value={modal.lang_code} onChange={(e) => setModal({ ...modal, lang_code: e.target.value })} className="mt-1 w-full bg-card border border-border rounded-md text-xs px-2 py-2">
                    {['en_US', 'en', 'en_IN', 'hi'].map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Body — use {'{{1}}'}, {'{{2}}'} …</label>
                <textarea rows={4} value={modal.body} onChange={(e) => setModal({ ...modal, body: e.target.value })} className="mt-1 w-full bg-card border border-border rounded-md text-sm px-3 py-2" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Short description</label>
                <Input value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} className="mt-1 bg-card border-border" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={modal.enabled_for_salons} onChange={(e) => setModal({ ...modal, enabled_for_salons: e.target.checked })} />
                Visible to salons (adoptable)
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
                <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (modal.id ? 'Save' : 'Add template')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
