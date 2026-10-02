import { publicSharing, saveGift } from './gift-api.js?v=20261002-loading1';

export const isLocalGiftId = id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id || '');

export function mountLocalGiftSharing(gift, stage) {
  if (!isLocalGiftId(gift.id)) return;
  const en = document.documentElement.lang === 'en';
  const text = (ru, english) => en ? english : ru;
  const panel = document.createElement('aside');
  panel.className = 'local-gift-sharing';
  panel.setAttribute('aria-label', text('Предпросмотр подарка', 'Gift preview'));
  const note = document.createElement('p');
  note.textContent = text(
    'Это предпросмотр в вашем браузере. Эта ссылка не откроется у получателя.',
    'This is a preview in your browser. This link will not open for your recipient.'
  );
  panel.append(note);
  // Keep the preview notice outside the measured animation/reveal stage.
  stage.before(panel);

  if (!publicSharing || !gift.file?.blob?.size) {
    const back = document.createElement('a');
    back.className = 'action secondary';
    back.href = 'index.html#createStart';
    back.textContent = text('Создать подарок для отправки', 'Create a gift to send');
    panel.append(back);
    return;
  }

  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'action primary';
  send.textContent = text('Получить ссылку для отправки', 'Get a link to send');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  panel.append(send, status);
  send.onclick = async () => {
    if (send.disabled) return;
    send.disabled = true;
    status.textContent = text('Сохраняем подарок…', 'Saving your gift…');
    try {
      const saved = await saveGift(gift);
      if (saved.local) throw new Error(text('Отправка временно недоступна.', 'Sharing is temporarily unavailable.'));
      const url = new URL('open.html', location.href);
      url.searchParams.set('id', saved.id);
      // Keep the actual public link in the address bar after explicit upload.
      history.replaceState(null, '', url.href);
      note.textContent = text(
        'Подарок готов к отправке. Ссылка открывает сертификат и аудио — отправляйте её лично получателю.',
        'Your gift is ready to send. The link opens the certificate and audio — send it privately to your recipient.'
      );
      const link = document.createElement('input');
      link.className = 'local-gift-link';
      link.readOnly = true;
      link.value = url.href;
      link.setAttribute('aria-label', text('Ссылка на подарок', 'Gift link'));
      link.onclick = () => link.select();
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'action secondary';
      copy.textContent = text('Копировать ссылку', 'Copy link');
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(link.value);
          status.textContent = text('Ссылка скопирована.', 'Link copied.');
        } catch {
          link.focus(); link.select();
          status.textContent = text('Выделенная ссылка готова для копирования.', 'The selected link is ready to copy.');
        }
      };
      send.replaceWith(link, copy);
      status.textContent = text('Доступен до ', 'Available until ') +
        new Date(saved.expiresAt).toLocaleDateString(en ? 'en-GB' : 'ru-RU');
    } catch (error) {
      status.textContent = error.userMessage || text(
        'Не удалось отправить подарок. Проверьте соединение и попробуйте снова.',
        'Could not send the gift. Check your connection and try again.'
      );
      send.disabled = false;
    }
  };
}
