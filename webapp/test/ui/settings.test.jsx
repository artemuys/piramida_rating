// Настройки: гейт смены имени (залочено/разрешено), сохранение профиля
// (patch /me с контактом/языком/предпочтениями), переключение языка.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({ api: { patch: vi.fn(() => Promise.resolve({})) } }));
vi.mock("../../src/telegram.js", () => ({ haptic: vi.fn(), tg: { initDataUnsafe: { user: { username: "vasya" } } } }));

import { Settings } from "../../src/screens/Settings.jsx";
import { api } from "../../src/api.js";

const t = getT("ru");
const baseMe = {
  name: "Игрок", contact: "@vasya", contactType: "telegram",
  lang: "ru", prefDisc: 2, prefPays: 0, nameChangeAllowed: false,
};

beforeEach(() => {
  mockApp = { me: { ...baseMe }, t, refreshMe: vi.fn(() => Promise.resolve()), toastError: vi.fn(), toast: vi.fn() };
  api.patch.mockClear();
});

describe("смена имени", () => {
  test("залочено → показывается подсказка, поля ввода нет", () => {
    render(<Settings />);
    expect(screen.getByText(t.settings_ext.nameFixed)).toBeTruthy();
    expect(screen.queryByPlaceholderText(t.settings_ext.newNamePh)).toBeNull();
  });

  test("разрешено → ввод имени и сохранение через patch /me", async () => {
    mockApp.me.nameChangeAllowed = true;
    render(<Settings />);
    const input = screen.getByPlaceholderText(t.settings_ext.newNamePh);
    fireEvent.change(input, { target: { value: "Новое Имя" } });
    // «Сохранить» есть и у имени, и внизу — берём первую (блок имени идёт раньше)
    fireEvent.click(screen.getAllByRole("button", { name: t.settings_ext.save })[0]);
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/me", { name: "Новое Имя" }));
    expect(mockApp.toast).toHaveBeenCalled();
  });
});

describe("сохранение профиля", () => {
  test("кнопка сохранения шлёт contact/lang/prefs", async () => {
    render(<Settings />);
    // сменим язык на английский
    fireEvent.click(screen.getByText("English"));
    fireEvent.click(screen.getByRole("button", { name: t.settings.save }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    const [url, body] = api.patch.mock.calls[0];
    expect(url).toBe("/me");
    expect(body).toMatchObject({ contact: "@vasya", contactType: "telegram", lang: "en", prefDisc: 2, prefPays: 0 });
    expect(mockApp.refreshMe).toHaveBeenCalled();
  });

  test("телефонный контакт с мусором блокирует сохранение", () => {
    mockApp.me = { ...baseMe, contactType: "phone", contact: "" };
    render(<Settings />);
    fireEvent.change(screen.getByPlaceholderText(t.settings_ext.phonePh), { target: { value: "123" } }); // < 7 цифр
    expect(screen.getByRole("button", { name: t.settings.save }).disabled).toBe(true);
  });
});
