// Thin Telegram Bot API client. Long polling only: no public webhook exists to forge.

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type Markup = { inline_keyboard: InlineButton[][] };

export type TgMessage = { message_id: number; chat: { id: number; type: string }; from?: { id: number }; text?: string };
export type TgCallback = { id: string; from: { id: number }; message?: TgMessage; data?: string };
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallback };

export class Telegram {
  constructor(private token: string) {}

  async call<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!body.ok) throw new Error(`telegram ${method}: ${body.description ?? res.status}`);
    return body.result as T;
  }

  send(chatId: number, text: string, markup?: Markup) {
    return this.call<TgMessage>("sendMessage", {
      chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}),
    });
  }

  async edit(chatId: number, messageId: number, text: string, markup?: Markup) {
    try {
      await this.call("editMessageText", {
        chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true,
        reply_markup: markup ?? { inline_keyboard: [] },
      });
    } catch (e) {
      // Editing to identical text is not an error worth surfacing.
      if (!String(e).includes("message is not modified")) throw e;
    }
  }

  async sendVoice(chatId: number, ogg: Buffer, caption?: string) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    if (caption) form.set("caption", caption);
    form.set("voice", new Blob([new Uint8Array(ogg)], { type: "audio/ogg" }), "wake.ogg");
    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendVoice`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
    const body = (await res.json()) as { ok: boolean; description?: string };
    if (!body.ok) throw new Error(`telegram sendVoice: ${body.description}`);
  }

  answer(callbackId: string, text?: string) {
    return this.call("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) }).catch(() => undefined);
  }
}

export const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
