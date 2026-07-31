import type { Ref } from "vue";

/**
 * Click-outside dismissal for a native modal `<dialog>`.
 *
 * A modal dialog's backdrop belongs to the dialog element itself, so a click on it arrives with
 * `event.target === dialog` — there is no separate overlay node to hang a handler on.
 *
 * Matching on that alone is not enough: a click on the dialog's own scrollbar reports the same
 * target while being firmly inside the box, and closing the dialog when someone reaches for the
 * scrollbar of a long list is worse than not having the feature. The pointer position is therefore
 * checked against the element's rect, which is the part that actually means "outside".
 *
 * Escape needs nothing: `<dialog>` already emits `cancel` for it.
 */
export function useDialogDismiss(dialog: Ref<HTMLDialogElement | undefined>, close: () => void) {
  return function onDialogClick(event: MouseEvent) {
    const element = dialog.value;
    if (!element || event.target !== element) return;

    const box = element.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) close();
  };
}
