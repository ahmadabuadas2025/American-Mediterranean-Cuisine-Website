import { useEffect, useRef } from 'react';
import type { MenuEntry } from '../../lib/catalog-types';
import { money } from '../../lib/order';

interface Props {
  item: MenuEntry | null;
  onClose: () => void;
  onAdd: (size: 'half' | 'full') => void;
  dietaryProposed: boolean;
}

const NAMES: Record<string, string> = { V: 'Vegetarian', VG: 'Vegan', 'GF-friendly': 'Gluten-friendly' };

/**
 * Menu item detail. A native modal <dialog>: focus is trapped, Escape closes,
 * and the builder state underneath is untouched.
 */
export default function ItemDialog({ item, onClose, onAdd, dietaryProposed }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (item && !dlg.open) dlg.showModal();
    if (!item && dlg.open) dlg.close();
  }, [item]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="item-dialog-title"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-card)] bg-paper p-0 text-ink backdrop:bg-olive-deep/60"
    >
      {item && (
        <div>
          {item.image && (
            <div className="aspect-[16/9] bg-sand-soft">
              <img src={item.image} alt={item.imageAlt ?? ''} className="size-full object-cover" width="1200" height="675" />
            </div>
          )}
          <div className="grid gap-4 p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 id="item-dialog-title" className="h-sm">{item.name}</h2>
              <button type="button" className="grid size-11 shrink-0 place-items-center rounded-full border border-sand text-xl" onClick={onClose}>
                <span aria-hidden="true">×</span><span className="sr-only">Close</span>
              </button>
            </div>
            <p className="text-muted">{item.description}</p>
            {item.allergenNote && <p className="text-sm"><strong>Allergens:</strong> {item.allergenNote}</p>}
            {item.dietary.length > 0 && (
              <p className="text-sm">
                <strong>Dietary:</strong> {item.dietary.map((t) => NAMES[t] ?? t).join(', ')}
                {dietaryProposed && ' (proposed, pending kitchen review)'}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {(['half', 'full'] as const).map((size) => (
                <button key={size} type="button" className="btn btn-olive flex-col !gap-0 py-3" onClick={() => onAdd(size)}>
                  <span>Add {size} tray · {money(size === 'half' ? item.priceHalf : item.priceFull)}</span>
                  <span className="text-xs font-semibold opacity-80">serves {size === 'half' ? item.servesHalf : item.servesFull}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
