'use client';

import { useCallback, useEffect, useState } from 'react';
import { http, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDateTime } from '@fitsystem/utils';
import { Badge, Button, Field, Input, Modal, PageHeader, Spinner, Table, Textarea } from '@/components/ui';
import { Icon } from '@/components/icon';

interface NewsPost {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  isPublished: boolean;
  publishedAt: string;
  expiresAt?: string | null;
}

export default function NewsPage() {
  const toast = useToast();
  const [items, setItems] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NewsPost | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get<{ items: NewsPost[] }>('/news');
      setItems(res.items);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al cargar novedades');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(post: NewsPost) {
    if (!confirm(`¿Eliminar la novedad "${post.title}"?`)) return;
    try {
      await http.del(`/news/${post.id}`);
      toast.success('Novedad eliminada');
      load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al eliminar');
    }
  }

  return (
    <div>
      <PageHeader
        title="Novedades"
        subtitle="Publicaciones visibles en la app de los socios"
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Icon name="plus" size={16} /> Nueva novedad
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <Table head={['Título', 'Publicada', 'Vence', 'Estado', '']} empty="Sin novedades">
          {items.map((p) => (
            <tr key={p.id} className="hover:bg-surface-alt/40">
              <td className="px-4 py-3">
                <div className="font-medium text-text">{p.title}</div>
                <div className="line-clamp-1 text-xs text-text-muted">{p.body}</div>
              </td>
              <td className="px-4 py-3 text-xs text-text-muted">{formatDateTime(p.publishedAt)}</td>
              <td className="px-4 py-3 text-xs text-text-muted">
                {p.expiresAt ? formatDateTime(p.expiresAt) : '—'}
              </td>
              <td className="px-4 py-3">
                <Badge color={p.isPublished ? 'green' : 'gray'}>{p.isPublished ? 'Publicada' : 'Borrador'}</Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                    <Icon name="edit" size={15} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(p)}>
                    <Icon name="trash" size={15} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <NewsModal open={open} onClose={() => setOpen(false)} post={editing} onSaved={load} />
    </div>
  );
}

function NewsModal({
  open,
  onClose,
  post,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  post: NewsPost | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(post?.title || '');
    setBody(post?.body || '');
    setImageUrl(post?.imageUrl || '');
    setIsPublished(post?.isPublished ?? true);
    setExpiresAt(post?.expiresAt ? post.expiresAt.slice(0, 10) : '');
  }, [open, post]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: title.trim(),
      body: body.trim(),
      imageUrl: imageUrl.trim() || null,
      isPublished,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };
    try {
      if (post) await http.put(`/news/${post.id}`, payload);
      else await http.post('/news', payload);
      toast.success(post ? 'Novedad actualizada' : 'Novedad publicada');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={post ? 'Editar novedad' : 'Nueva novedad'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Título *">
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Contenido *">
          <Textarea required value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label="Imagen (URL)">
          <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </Field>
        <Field label="Vence el">
          <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
          Publicada (visible en la app)
        </label>
      </form>
    </Modal>
  );
}
