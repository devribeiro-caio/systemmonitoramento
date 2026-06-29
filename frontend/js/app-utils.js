(function exposeAppUtils(window) {
  function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function deliveryTicks(status) {
    if (status === 'failed') return '<span class="delivery-ticks pending">✓</span>';
    if (['sent', 'received', 'answered', 'registered'].includes(status)) {
      return '<span class="delivery-ticks delivered">✓✓</span>';
    }
    return '<span class="delivery-ticks pending">✓</span>';
  }

  function messageStatusLabel(message) {
    if (message.status === 'sending') return 'enviando';

    if (message.status === 'failed') {
      const error = message.metadata?.delivery?.error;
      return error ? `nao enviado: ${error}` : 'nao enviado';
    }

    return message.status;
  }

  function formatDuration(seconds) {
    const safeSeconds = Math.max(0, Math.round(seconds || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const rest = String(safeSeconds % 60).padStart(2, '0');
    return `${minutes}:${rest}`;
  }

  function messageContentHtml(message) {
    const audio = message.metadata?.audio;
    if (audio?.data) {
      const duration = audio.durationSeconds ? ` ${formatDuration(audio.durationSeconds)}` : '';
      return `
        <span class="audio-message-label">Audio${duration}</span>
        <audio class="message-audio" controls src="${audio.data}"></audio>
      `;
    }

    return `<span>${message.content || 'sem conteudo'}</span>`;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function initials(name) {
    return String(name || 'Formis Monitoramento')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }

  function sameDay(dateA, dateB) {
    return dateA.getFullYear() === dateB.getFullYear()
      && dateA.getMonth() === dateB.getMonth()
      && dateA.getDate() === dateB.getDate();
  }

  function groupCount(items, getKey) {
    return items.reduce((acc, item) => {
      const key = getKey(item) || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  window.AppUtils = {
    blobToDataUrl,
    deliveryTicks,
    digitsOnly,
    formatDuration,
    groupCount,
    initials,
    messageContentHtml,
    messageStatusLabel,
    normalizeSearchText,
    sameDay
  };
})(window);
