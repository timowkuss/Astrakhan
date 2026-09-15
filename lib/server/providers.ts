import { assert, uid } from "./db";
import { isMock, settings } from "./security";
export interface WhatsAppProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}
export class DevelopmentWhatsAppProvider implements WhatsAppProvider {
  async sendOtp(_phone: string, _code: string) {
    assert(isMock(), "Тестовый WhatsApp отключён", 503);
  }
}
// Implement with an approved WhatsApp authentication template and server credentials.
export class HttpWhatsAppProvider implements WhatsAppProvider {
  async sendOtp(phone: string, code: string) {
    const cfg = settings();
    assert(
      cfg.WHATSAPP_ENDPOINT?.startsWith("https://") && cfg.WHATSAPP_TOKEN,
      "WhatsApp не настроен",
      503,
    );
    const response = await fetch(cfg.WHATSAPP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({ phone, code, expiresIn: 300 }),
    });
    assert(response.ok, "Не удалось отправить код. Попробуйте позже.", 502);
  }
}
export const whatsAppProvider = (): WhatsAppProvider =>
  isMock() ? new DevelopmentWhatsAppProvider() : new HttpWhatsAppProvider();
export interface PaymentProvider {
  confirm(input: {
    method: "kaspi" | "card";
    idempotencyKey: string;
    amount: number;
    testResult?: string;
  }): Promise<{ reference: string; confirmed: boolean }>;
}
export class TestPaymentProvider implements PaymentProvider {
  async confirm(input: Parameters<PaymentProvider["confirm"]>[0]) {
    assert(isMock(), "Тестовая оплата отключена", 503);
    assert(
      input.testResult !== "failure",
      "Тестовый банк отклонил оплату. Попробуйте ещё раз.",
      402,
    );
    return { reference: "test_" + input.idempotencyKey, confirmed: true };
  }
}
export function paymentProvider(): PaymentProvider {
  assert(
    isMock(),
    "Приём платежей ещё не подключён. Обратитесь в магазин.",
    503,
  );
  return new TestPaymentProvider();
}
// Production adapter must create a hosted payment session, validate signed callbacks,
// verify amount/currency/order and deduplicate provider event IDs before fulfilment.
// No card data enters this application. Do not enable production until adapter is installed.
export interface ProductSource {
  list(): Promise<unknown[]>;
}
export class LocalProductSource implements ProductSource {
  async list() {
    const { rows } = await import("./db");
    return rows("SELECT * FROM products WHERE active=1");
  }
}
