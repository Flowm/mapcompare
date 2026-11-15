// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isTypingTarget } from "./useKeyboardShortcuts";

function element(html: string, selector: string): HTMLElement {
  document.body.innerHTML = html;
  return document.querySelector<HTMLElement>(selector)!;
}

describe("isTypingTarget", () => {
  it("treats native fields as typing", () => {
    expect(isTypingTarget(element("<input>", "input"))).toBe(true);
    expect(isTypingTarget(element("<textarea></textarea>", "textarea"))).toBe(true);
    expect(isTypingTarget(element("<select></select>", "select"))).toBe(true);
  });

  it("treats a select or menu built from ARIA roles as typing, since it reads keys as typeahead", () => {
    expect(isTypingTarget(element('<button role="combobox">2025</button>', "button"))).toBe(true);
    expect(isTypingTarget(element('<div role="listbox"><div role="option" tabindex="0">2024</div></div>', '[role="option"]'))).toBe(true);
    expect(isTypingTarget(element('<div role="menu"><div role="menuitem" tabindex="0">Swipe</div></div>', '[role="menuitem"]'))).toBe(true);
  });

  it("leaves plain buttons and the page to the shortcuts", () => {
    expect(isTypingTarget(element("<button>Share</button>", "button"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
