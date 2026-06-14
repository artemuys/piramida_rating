// Онбординг-мастер: выбор языка, валидация имени (буквы+пробелы, без цифр —
// тот самый контракт, что чинили на сервере) и финальная отправка /auth/onboard.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getT } from "../../src/i18n.js";

let mockApp;
vi.mock("../../src/store.jsx", () => ({ useApp: () => mockApp }));
vi.mock("../../src/api.js", () => ({ api: { post: vi.fn(() => Promise.resolve({})) } }));
vi.mock("../../src/telegram.js", () => ({
  haptic: vi.fn(),
  tg: { initDataUnsafe: { user: { username: "vasya" } } },
}));

import { Onboarding } from "../../src/screens/Onboarding.jsx";
import { api } from "../../src/api.js";

const t = getT("ru");

beforeEach(() => {
  mockApp = { obLang: "ru", setObLang: vi.fn(), refreshMe: vi.fn(() => Promise.resolve()), toastError: vi.fn() };
  api.post.mockClear();
});

/** Проходит экран выбора языка (шаг 0) → попадает на шаг с именем. */
function gotoNameStep() {
  // язык уже выбран (obLang=ru) → нижняя кнопка «Русский →» активна
  fireEvent.click(screen.getByRole("button", { name: /→$/ }));
  expect(mockApp.setObLang).toHaveBeenCalledWith("ru");
}

describe("шаг выбора языка", () => {
  test("показывает 4 языка и заголовок клуба", () => {
    render(<Onboarding />);
    expect(screen.getByText("Billiard Club")).toBeTruthy();
    for (const label of ["English", "Polski", "Українська", "Русский"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe("валидация имени", () => {
  test("имя с цифрами невалидно → кнопка «далее» заблокирована и показана ошибка", () => {
    render(<Onboarding />);
    gotoNameStep();
    const input = screen.getByPlaceholderText(t.step0.placeholder);
    fireEvent.change(input, { target: { value: "Player 900" } });
    expect(screen.getByText(t.step0.nameErr)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.step0.next }).disabled).toBe(true);
  });

  test("двусоставное имя с пробелом валидно → кнопка активна", () => {
    render(<Onboarding />);
    gotoNameStep();
    fireEvent.change(screen.getByPlaceholderText(t.step0.placeholder), { target: { value: "Иван Иванов" } });
    expect(screen.getByRole("button", { name: t.step0.next }).disabled).toBe(false);
  });

  test("односимвольное имя невалидно (минимум 2)", () => {
    render(<Onboarding />);
    gotoNameStep();
    fireEvent.change(screen.getByPlaceholderText(t.step0.placeholder), { target: { value: "и" } });
    expect(screen.getByRole("button", { name: t.step0.next }).disabled).toBe(true);
  });
});

describe("полный проход и отправка", () => {
  test("доходит до правил и отправляет онбординг с контактом Telegram", async () => {
    render(<Onboarding />);
    gotoNameStep();
    fireEvent.change(screen.getByPlaceholderText(t.step0.placeholder), { target: { value: "Иван Иванов" } });
    fireEvent.click(screen.getByRole("button", { name: t.step0.next }));      // → контакт

    // шаг контакта: есть tg username → контакт ок, идём дальше
    fireEvent.click(screen.getByRole("button", { name: t.step1.next }));      // → настройки
    fireEvent.click(screen.getByRole("button", { name: t.step2.finish }));    // → правила

    // принимаем правила и финишируем
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: t.step3.finish }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/auth/onboard");
    expect(body).toMatchObject({ name: "Иван Иванов", contact: "@vasya", contactType: "telegram", lang: "ru" });
    await waitFor(() => expect(mockApp.refreshMe).toHaveBeenCalled());
  });
});
